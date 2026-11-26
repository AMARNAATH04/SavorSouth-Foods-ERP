import {
  BomItemType,
  BomUsageMode,
  ExpenseCategory,
  Prisma,
  ProductionStatus,
} from '@prisma/client';
import { prisma } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';
import { nextSequentialCode } from '../utils/sequence.js';
import { fromBaseQuantity, toBaseQuantity } from '../utils/units.js';
import { issueMaterialStockTx, receiveFinishedGoodsTx } from './inventoryService.js';

export interface IssueMaterialInput {
  itemType: BomItemType;
  materialId: string;
  quantity: number;
  unit: string;
  damagedQuantity?: number;
}

export interface PackagingUsageInput {
  packagingMaterialId: string;
  usedQuantity: number;
  damagedQuantity?: number;
  unit?: string;
}

export async function createProductionRun(params: {
  bomId: string;
  batchSize: number;
  supervisorId: string;
  productionDate?: Date;
  notes?: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const bom = await tx.bom.findUnique({
      where: { id: params.bomId },
      include: { product: true, items: true },
    });
    if (!bom) throw new AppError('BOM not found', 404);
    if (!bom.isActive) throw new AppError('Selected BOM is inactive', 400);

    const runNumber = await nextSequentialCode('PR-2026-', () => tx.productionRun.count());
    const batchNumber = await nextSequentialCode('BATCH-SS-', () => tx.productionRun.count());
    const expectedOutputPackets = Math.round(bom.expectedOutputPackets * params.batchSize);

    const run = await tx.productionRun.create({
      data: {
        runNumber,
        batchNumber,
        bomId: bom.id,
        productId: bom.productId,
        batchSize: params.batchSize,
        status: ProductionStatus.IN_PROGRESS,
        productionDate: params.productionDate ?? new Date(),
        supervisorId: params.supervisorId,
        expectedOutputPackets,
        notes: params.notes,
      },
      include: {
        product: true,
        bom: {
          include: {
            items: {
              include: { rawMaterial: true, packagingMaterial: true },
            },
          },
        },
        supervisor: { select: { id: true, name: true, email: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.supervisorId,
      userRole: params.userRole,
      action: 'CREATE_PRODUCTION_RUN',
      entityType: 'ProductionRun',
      entityId: run.id,
      entityLabel: run.runNumber,
      afterState: {
        runNumber: run.runNumber,
        batchNumber: run.batchNumber,
        product: bom.product.name,
        batchSize: params.batchSize,
        expectedOutputPackets,
      },
    });

    return run;
  });
}

export async function issueMaterialsToRun(params: {
  runId: string;
  issues: IssueMaterialInput[];
  userId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.productionRun.findUnique({
      where: { id: params.runId },
      include: {
        bom: {
          include: {
            items: { include: { rawMaterial: true, packagingMaterial: true } },
          },
        },
      },
    });
    if (!run) throw new AppError('Production run not found', 404);
    if (run.status === ProductionStatus.COMPLETED || run.status === ProductionStatus.CANCELLED) {
      throw new AppError(`Cannot issue materials to a ${run.status} production run`, 400);
    }

    let addedRawCost = 0n;
    let addedPkgCost = 0n;

    for (const item of params.issues) {
      const bomItem = run.bom.items.find((bi) =>
        item.itemType === BomItemType.RAW_MATERIAL
          ? bi.rawMaterialId === item.materialId
          : bi.packagingMaterialId === item.materialId,
      );

      let expectedBaseUnit;
      let displayUnit = item.unit;

      if (item.itemType === BomItemType.RAW_MATERIAL) {
        const rm = await tx.rawMaterial.findUnique({ where: { id: item.materialId } });
        if (!rm) throw new AppError('Raw material not found', 404);
        expectedBaseUnit = rm.baseUnit;
        displayUnit = rm.displayUnit;
      } else {
        const pm = await tx.packagingMaterial.findUnique({ where: { id: item.materialId } });
        if (!pm) throw new AppError('Packaging material not found', 404);
        expectedBaseUnit = pm.baseUnit;
        displayUnit = pm.displayUnit;
      }

      const issuedQtyBase = BigInt(toBaseQuantity(item.quantity, item.unit, expectedBaseUnit));
      const damagedQtyBase = BigInt(
        toBaseQuantity(item.damagedQuantity ?? 0, item.unit, expectedBaseUnit),
      );
      const totalDeductBase = issuedQtyBase + damagedQtyBase;

      const plannedQtyBase = bomItem
        ? BigInt(Math.round(Number(bomItem.quantityBase) * run.batchSize))
        : issuedQtyBase;

      const stockOut = await issueMaterialStockTx(tx, {
        itemType: item.itemType,
        materialId: item.materialId,
        quantityBase: totalDeductBase,
        sourceDocType: 'ProductionRun',
        sourceDocId: run.id,
        sourceDocNumber: run.runNumber,
        notes: `Material issued to ${run.batchNumber}`,
        userId: params.userId,
      });

      const variancePct =
        plannedQtyBase > 0n
          ? Number((((Number(issuedQtyBase) - Number(plannedQtyBase)) / Number(plannedQtyBase)) * 100).toFixed(2))
          : 0;
      const alertTriggered = Math.abs(variancePct) > run.bom.consumptionTolerancePct;

      await tx.materialIssue.create({
        data: {
          productionRunId: run.id,
          itemType: item.itemType,
          rawMaterialId: item.itemType === BomItemType.RAW_MATERIAL ? item.materialId : null,
          packagingMaterialId:
            item.itemType === BomItemType.PACKAGING_MATERIAL ? item.materialId : null,
          plannedQtyBase,
          issuedQtyBase,
          damagedQtyBase,
          unit: displayUnit,
          displayPlannedQty: fromBaseQuantity(plannedQtyBase, displayUnit),
          displayIssuedQty: fromBaseQuantity(issuedQtyBase, displayUnit),
          displayDamagedQty: fromBaseQuantity(damagedQtyBase, displayUnit),
          variancePct,
          alertTriggered,
          unitCostPaisa: stockOut.unitCostPaisa,
          totalCostPaisa: stockOut.issueValuePaisa,
          issuedById: params.userId,
        },
      });

      if (item.itemType === BomItemType.RAW_MATERIAL) {
        addedRawCost += stockOut.issueValuePaisa;
      } else {
        addedPkgCost += stockOut.issueValuePaisa;
      }
    }

    const updatedRawCost = run.rawMaterialCostPaisa + addedRawCost;
    const updatedPkgCost = run.packagingCostPaisa + addedPkgCost;
    const totalCost =
      updatedRawCost + updatedPkgCost + run.labourCostPaisa + run.gasPowerCostPaisa;
    const costPerPacket =
      run.actualGoodPackets > 0
        ? BigInt(Math.round(Number(totalCost) / run.actualGoodPackets))
        : 0n;

    const updated = await tx.productionRun.update({
      where: { id: run.id },
      data: {
        rawMaterialCostPaisa: updatedRawCost,
        packagingCostPaisa: updatedPkgCost,
        totalCostPaisa: totalCost,
        costPerPacketPaisa: costPerPacket,
      },
      include: {
        materialIssues: {
          include: { rawMaterial: true, packagingMaterial: true },
        },
      },
    });

    await recordAuditLog(tx, {
      userId: params.userId,
      userRole: params.userRole,
      action: 'ISSUE_MATERIALS',
      entityType: 'ProductionRun',
      entityId: run.id,
      entityLabel: run.runNumber,
      afterState: { issuedCount: params.issues.length, addedRawCost: Number(addedRawCost) },
    });

    return updated;
  });
}

export async function completeProductionRun(params: {
  runId: string;
  actualGoodPackets: number;
  damagedPacketsCount?: number;
  wastageKg?: number;
  packagingUsages?: PackagingUsageInput[];
  labourCostPaisa?: number;
  gasPowerCostPaisa?: number;
  notes?: string;
  userId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.productionRun.findUnique({
      where: { id: params.runId },
      include: {
        product: true,
        bom: {
          include: {
            items: { include: { rawMaterial: true, packagingMaterial: true } },
          },
        },
        materialIssues: true,
      },
    });
    if (!run) throw new AppError('Production run not found', 404);
    if (run.status === ProductionStatus.COMPLETED) {
      throw new AppError('Production run is already completed', 400);
    }
    if (params.actualGoodPackets <= 0) {
      throw new AppError('Actual good output packets must be greater than zero', 400);
    }

    let addedPkgCost = 0n;
    const usageMap = new Map(
      (params.packagingUsages ?? []).map((u) => [u.packagingMaterialId, u]),
    );

    // Process packaging items from BOM that haven't already been manually issued
    const pkgBomItems = run.bom.items.filter(
      (bi) => bi.itemType === BomItemType.PACKAGING_MATERIAL && bi.packagingMaterialId,
    );

    for (const bi of pkgBomItems) {
      const pkgId = bi.packagingMaterialId!;
      const alreadyIssued = run.materialIssues.some(
        (mi) => mi.packagingMaterialId === pkgId,
      );
      if (alreadyIssued && !usageMap.has(pkgId)) continue;

      const override = usageMap.get(pkgId);
      const pkg = bi.packagingMaterial!;

      let goodUsedQty = 0;
      let damagedQty = 0;

      if (override) {
        goodUsedQty = override.usedQuantity;
        damagedQty = override.damagedQuantity ?? 0;
      } else if (bi.usageMode === BomUsageMode.PER_GOOD_PACKET) {
        const perPacket = bi.quantity / run.bom.expectedOutputPackets;
        goodUsedQty = Math.round(params.actualGoodPackets * perPacket);
        damagedQty = params.damagedPacketsCount ?? 0;
      } else {
        goodUsedQty = Math.round(bi.quantity * run.batchSize);
        damagedQty = 0;
      }

      const goodUsedBase = BigInt(toBaseQuantity(goodUsedQty, pkg.displayUnit, pkg.baseUnit));
      const damagedBase = BigInt(toBaseQuantity(damagedQty, pkg.displayUnit, pkg.baseUnit));
      const totalDeductBase = goodUsedBase + damagedBase;
      const plannedBase = BigInt(Math.round(Number(bi.quantityBase) * run.batchSize));

      const stockOut = await issueMaterialStockTx(tx, {
        itemType: BomItemType.PACKAGING_MATERIAL,
        materialId: pkgId,
        quantityBase: totalDeductBase,
        sourceDocType: 'ProductionRun',
        sourceDocId: run.id,
        sourceDocNumber: run.runNumber,
        notes: `Packaging consumed (${goodUsedQty} used + ${damagedQty} damaged) for ${run.batchNumber}`,
        userId: params.userId,
      });

      const variancePct =
        plannedBase > 0n
          ? Number(
              (((Number(totalDeductBase) - Number(plannedBase)) / Number(plannedBase)) * 100).toFixed(2),
            )
          : 0;

      await tx.materialIssue.create({
        data: {
          productionRunId: run.id,
          itemType: BomItemType.PACKAGING_MATERIAL,
          packagingMaterialId: pkgId,
          plannedQtyBase: plannedBase,
          issuedQtyBase: goodUsedBase,
          damagedQtyBase: damagedBase,
          unit: pkg.displayUnit,
          displayPlannedQty: fromBaseQuantity(plannedBase, pkg.displayUnit),
          displayIssuedQty: fromBaseQuantity(goodUsedBase, pkg.displayUnit),
          displayDamagedQty: fromBaseQuantity(damagedBase, pkg.displayUnit),
          variancePct,
          alertTriggered: Math.abs(variancePct) > run.bom.consumptionTolerancePct,
          unitCostPaisa: stockOut.unitCostPaisa,
          totalCostPaisa: stockOut.issueValuePaisa,
          issuedById: params.userId,
        },
      });

      addedPkgCost += stockOut.issueValuePaisa;
    }

    // Record optional batch overhead expenses directly during completion
    let addedLabour = 0n;
    let addedGasPower = 0n;

    if (params.labourCostPaisa && params.labourCostPaisa > 0) {
      addedLabour = BigInt(params.labourCostPaisa);
      await tx.expense.create({
        data: {
          productionRunId: run.id,
          category: ExpenseCategory.LABOUR,
          description: `Batch labour cost for ${run.runNumber} (${run.product.name})`,
          amountPaisa: addedLabour,
          expenseDate: run.productionDate,
          recordedById: params.userId,
        },
      });
    }

    if (params.gasPowerCostPaisa && params.gasPowerCostPaisa > 0) {
      addedGasPower = BigInt(params.gasPowerCostPaisa);
      await tx.expense.create({
        data: {
          productionRunId: run.id,
          category: ExpenseCategory.GAS_ELECTRICITY,
          description: `Batch gas & electricity cost for ${run.runNumber} (${run.product.name})`,
          amountPaisa: addedGasPower,
          expenseDate: run.productionDate,
          recordedById: params.userId,
        },
      });
    }

    const totalPkgCost = run.packagingCostPaisa + addedPkgCost;
    const totalLabourCost = run.labourCostPaisa + addedLabour;
    const totalGasCost = run.gasPowerCostPaisa + addedGasPower;
    const totalCost =
      run.rawMaterialCostPaisa + totalPkgCost + totalLabourCost + totalGasCost;
    const costPerPacket = BigInt(Math.round(Number(totalCost) / params.actualGoodPackets));

    const yieldVariancePct = Number(
      (
        ((params.actualGoodPackets - run.expectedOutputPackets) /
          run.expectedOutputPackets) *
        100
      ).toFixed(2),
    );
    const yieldAlertTriggered = Math.abs(yieldVariancePct) > run.bom.yieldTolerancePct;

    await receiveFinishedGoodsTx(tx, {
      productId: run.productId,
      quantityPackets: params.actualGoodPackets,
      unitCostPaisa: costPerPacket,
      totalValuePaisa: totalCost,
      sourceDocType: 'ProductionRun',
      sourceDocId: run.id,
      sourceDocNumber: run.runNumber,
      notes: `Batch ${run.batchNumber} completed (${params.actualGoodPackets} good packets)`,
      userId: params.userId,
    });

    const completedRun = await tx.productionRun.update({
      where: { id: run.id },
      data: {
        status: ProductionStatus.COMPLETED,
        actualGoodPackets: params.actualGoodPackets,
        damagedPacketsCount: params.damagedPacketsCount ?? 0,
        wastageKg: params.wastageKg ?? 0,
        yieldVariancePct,
        yieldAlertTriggered,
        packagingCostPaisa: totalPkgCost,
        labourCostPaisa: totalLabourCost,
        gasPowerCostPaisa: totalGasCost,
        totalCostPaisa: totalCost,
        costPerPacketPaisa: costPerPacket,
        notes: params.notes ?? run.notes,
        completedAt: new Date(),
      },
      include: {
        product: true,
        bom: true,
        materialIssues: { include: { rawMaterial: true, packagingMaterial: true } },
        expenses: true,
      },
    });

    await recordAuditLog(tx, {
      userId: params.userId,
      userRole: params.userRole,
      action: 'COMPLETE_PRODUCTION_RUN',
      entityType: 'ProductionRun',
      entityId: run.id,
      entityLabel: run.runNumber,
      afterState: {
        actualGoodPackets: params.actualGoodPackets,
        yieldVariancePct,
        yieldAlertTriggered,
        totalCostPaisa: Number(totalCost),
        costPerPacketPaisa: Number(costPerPacket),
      },
    });

    return completedRun;
  });
}

export async function addProductionExpense(params: {
  runId: string;
  category: ExpenseCategory;
  description: string;
  amountPaisa: number;
  userId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.productionRun.findUnique({ where: { id: params.runId } });
    if (!run) throw new AppError('Production run not found', 404);

    const amt = BigInt(params.amountPaisa);
    const expense = await tx.expense.create({
      data: {
        productionRunId: run.id,
        category: params.category,
        description: params.description,
        amountPaisa: amt,
        expenseDate: run.productionDate,
        recordedById: params.userId,
      },
    });

    const newLabour =
      params.category === ExpenseCategory.LABOUR
        ? run.labourCostPaisa + amt
        : run.labourCostPaisa;
    const newGas =
      params.category === ExpenseCategory.GAS_ELECTRICITY
        ? run.gasPowerCostPaisa + amt
        : run.gasPowerCostPaisa;
    const newTotal =
      run.rawMaterialCostPaisa + run.packagingCostPaisa + newLabour + newGas;
    const newCostPerPacket =
      run.actualGoodPackets > 0
        ? BigInt(Math.round(Number(newTotal) / run.actualGoodPackets))
        : run.costPerPacketPaisa;

    const updatedRun = await tx.productionRun.update({
      where: { id: run.id },
      data: {
        labourCostPaisa: newLabour,
        gasPowerCostPaisa: newGas,
        totalCostPaisa: newTotal,
        costPerPacketPaisa: newCostPerPacket,
      },
      include: {
        product: true,
        expenses: true,
        materialIssues: { include: { rawMaterial: true, packagingMaterial: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.userId,
      userRole: params.userRole,
      action: 'ADD_PRODUCTION_EXPENSE',
      entityType: 'Expense',
      entityId: expense.id,
      entityLabel: `${run.runNumber} - ${params.category}`,
      afterState: {
        category: params.category,
        amountPaisa: params.amountPaisa,
        updatedTotalCostPaisa: Number(newTotal),
        updatedCostPerPacketPaisa: Number(newCostPerPacket),
      },
    });

    return { expense, run: updatedRun };
  });
}
