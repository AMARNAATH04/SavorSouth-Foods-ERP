import {
  BomItemType,
  Prisma,
  StockDirection,
  StockItemCategory,
  StockMovementType,
} from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { proportionalPaisa } from '../utils/money.js';
import { nextMovementNumber } from '../utils/sequence.js';
import { fromBaseQuantity } from '../utils/units.js';

export async function receiveMaterialStockTx(
  tx: Prisma.TransactionClient,
  params: {
    itemType: BomItemType;
    materialId: string;
    quantityBase: bigint;
    lineTotalPaisa: bigint;
    movementType: StockMovementType;
    sourceDocType: string;
    sourceDocId: string;
    sourceDocNumber: string;
    notes?: string;
    userId: string;
  },
): Promise<{ balanceAfterBase: bigint; unitCostPaisa: bigint }> {
  const movNo = await nextMovementNumber(tx);

  if (params.itemType === BomItemType.RAW_MATERIAL) {
    const mat = await tx.rawMaterial.findUnique({ where: { id: params.materialId } });
    if (!mat) throw new AppError('Raw material not found', 404);

    const newBalance = mat.currentStockBase + params.quantityBase;
    const newTotalValue = mat.totalValuePaisa + params.lineTotalPaisa;
    const displayQty = fromBaseQuantity(params.quantityBase, mat.displayUnit);
    const unitCostPaisa =
      displayQty > 0 ? BigInt(Math.round(Number(params.lineTotalPaisa) / displayQty)) : 0n;

    await tx.rawMaterial.update({
      where: { id: mat.id },
      data: {
        currentStockBase: newBalance,
        totalValuePaisa: newTotalValue,
      },
    });

    await tx.stockMovement.create({
      data: {
        movementNumber: movNo,
        itemCategory: StockItemCategory.RAW_MATERIAL,
        rawMaterialId: mat.id,
        movementType: params.movementType,
        direction: StockDirection.IN,
        quantityBase: params.quantityBase,
        unitLabel: mat.displayUnit,
        unitCostPaisa,
        totalValuePaisa: params.lineTotalPaisa,
        balanceAfterBase: newBalance,
        sourceDocType: params.sourceDocType,
        sourceDocId: params.sourceDocId,
        sourceDocNumber: params.sourceDocNumber,
        notes: params.notes,
        createdById: params.userId,
      },
    });

    return { balanceAfterBase: newBalance, unitCostPaisa };
  }

  const pkg = await tx.packagingMaterial.findUnique({ where: { id: params.materialId } });
  if (!pkg) throw new AppError('Packaging material not found', 404);

  const newBalance = pkg.currentStockBase + params.quantityBase;
  const newTotalValue = pkg.totalValuePaisa + params.lineTotalPaisa;
  const displayQty = fromBaseQuantity(params.quantityBase, pkg.displayUnit);
  const unitCostPaisa =
    displayQty > 0 ? BigInt(Math.round(Number(params.lineTotalPaisa) / displayQty)) : 0n;

  await tx.packagingMaterial.update({
    where: { id: pkg.id },
    data: {
      currentStockBase: newBalance,
      totalValuePaisa: newTotalValue,
    },
  });

  await tx.stockMovement.create({
    data: {
      movementNumber: movNo,
      itemCategory: StockItemCategory.PACKAGING_MATERIAL,
      packagingMaterialId: pkg.id,
      movementType: params.movementType,
      direction: StockDirection.IN,
      quantityBase: params.quantityBase,
      unitLabel: pkg.displayUnit,
      unitCostPaisa,
      totalValuePaisa: params.lineTotalPaisa,
      balanceAfterBase: newBalance,
      sourceDocType: params.sourceDocType,
      sourceDocId: params.sourceDocId,
      sourceDocNumber: params.sourceDocNumber,
      notes: params.notes,
      createdById: params.userId,
    },
  });

  return { balanceAfterBase: newBalance, unitCostPaisa };
}

export async function issueMaterialStockTx(
  tx: Prisma.TransactionClient,
  params: {
    itemType: BomItemType;
    materialId: string;
    quantityBase: bigint;
    movementType?: StockMovementType;
    sourceDocType: string;
    sourceDocId: string;
    sourceDocNumber: string;
    notes?: string;
    userId: string;
  },
): Promise<{
  balanceAfterBase: bigint;
  unitCostPaisa: bigint;
  issueValuePaisa: bigint;
  displayUnit: string;
}> {
  if (params.quantityBase <= 0n) {
    return {
      balanceAfterBase: 0n,
      unitCostPaisa: 0n,
      issueValuePaisa: 0n,
      displayUnit: 'pieces',
    };
  }

  const movNo = await nextMovementNumber(tx);
  const movementType = params.movementType ?? StockMovementType.MATERIAL_ISSUE;

  if (params.itemType === BomItemType.RAW_MATERIAL) {
    const mat = await tx.rawMaterial.findUnique({ where: { id: params.materialId } });
    if (!mat) throw new AppError('Raw material not found', 404);

    if (mat.currentStockBase < params.quantityBase) {
      const available = fromBaseQuantity(mat.currentStockBase, mat.displayUnit);
      const requested = fromBaseQuantity(params.quantityBase, mat.displayUnit);
      throw new AppError(
        `Insufficient raw material stock for ${mat.name}. Available: ${available} ${mat.displayUnit}, Requested: ${requested} ${mat.displayUnit}`,
        409,
        {
          material: mat.name,
          available,
          requested,
          shortage: Number((requested - available).toFixed(4)),
          unit: mat.displayUnit,
        },
      );
    }

    const issueValuePaisa = BigInt(
      proportionalPaisa(mat.totalValuePaisa, params.quantityBase, mat.currentStockBase),
    );
    const newBalance = mat.currentStockBase - params.quantityBase;
    const newTotalValue = mat.totalValuePaisa - issueValuePaisa;
    const displayQty = fromBaseQuantity(params.quantityBase, mat.displayUnit);
    const unitCostPaisa =
      displayQty > 0 ? BigInt(Math.round(Number(issueValuePaisa) / displayQty)) : 0n;

    await tx.rawMaterial.update({
      where: { id: mat.id },
      data: {
        currentStockBase: newBalance,
        totalValuePaisa: newTotalValue,
      },
    });

    await tx.stockMovement.create({
      data: {
        movementNumber: movNo,
        itemCategory: StockItemCategory.RAW_MATERIAL,
        rawMaterialId: mat.id,
        movementType,
        direction: StockDirection.OUT,
        quantityBase: params.quantityBase,
        unitLabel: mat.displayUnit,
        unitCostPaisa,
        totalValuePaisa: issueValuePaisa,
        balanceAfterBase: newBalance,
        sourceDocType: params.sourceDocType,
        sourceDocId: params.sourceDocId,
        sourceDocNumber: params.sourceDocNumber,
        notes: params.notes,
        createdById: params.userId,
      },
    });

    return {
      balanceAfterBase: newBalance,
      unitCostPaisa,
      issueValuePaisa,
      displayUnit: mat.displayUnit,
    };
  }

  const pkg = await tx.packagingMaterial.findUnique({ where: { id: params.materialId } });
  if (!pkg) throw new AppError('Packaging material not found', 404);

  if (pkg.currentStockBase < params.quantityBase) {
    const available = fromBaseQuantity(pkg.currentStockBase, pkg.displayUnit);
    const requested = fromBaseQuantity(params.quantityBase, pkg.displayUnit);
    throw new AppError(
      `Insufficient packaging stock for ${pkg.name}. Available: ${available} ${pkg.displayUnit}, Requested: ${requested} ${pkg.displayUnit}`,
      409,
      {
        material: pkg.name,
        available,
        requested,
        shortage: Number((requested - available).toFixed(4)),
        unit: pkg.displayUnit,
      },
    );
  }

  const issueValuePaisa = BigInt(
    proportionalPaisa(pkg.totalValuePaisa, params.quantityBase, pkg.currentStockBase),
  );
  const newBalance = pkg.currentStockBase - params.quantityBase;
  const newTotalValue = pkg.totalValuePaisa - issueValuePaisa;
  const displayQty = fromBaseQuantity(params.quantityBase, pkg.displayUnit);
  const unitCostPaisa =
    displayQty > 0 ? BigInt(Math.round(Number(issueValuePaisa) / displayQty)) : 0n;

  await tx.packagingMaterial.update({
    where: { id: pkg.id },
    data: {
      currentStockBase: newBalance,
      totalValuePaisa: newTotalValue,
    },
  });

  await tx.stockMovement.create({
    data: {
      movementNumber: movNo,
      itemCategory: StockItemCategory.PACKAGING_MATERIAL,
      packagingMaterialId: pkg.id,
      movementType,
      direction: StockDirection.OUT,
      quantityBase: params.quantityBase,
      unitLabel: pkg.displayUnit,
      unitCostPaisa,
      totalValuePaisa: issueValuePaisa,
      balanceAfterBase: newBalance,
      sourceDocType: params.sourceDocType,
      sourceDocId: params.sourceDocId,
      sourceDocNumber: params.sourceDocNumber,
      notes: params.notes,
      createdById: params.userId,
    },
  });

  return {
    balanceAfterBase: newBalance,
    unitCostPaisa,
    issueValuePaisa,
    displayUnit: pkg.displayUnit,
  };
}

export async function receiveFinishedGoodsTx(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    quantityPackets: number;
    unitCostPaisa: bigint;
    totalValuePaisa: bigint;
    movementType?: StockMovementType;
    sourceDocType: string;
    sourceDocId: string;
    sourceDocNumber: string;
    notes?: string;
    userId: string;
  },
): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: params.productId } });
  if (!product) throw new AppError('Product not found', 404);

  const newBalance = product.currentStockPackets + params.quantityPackets;
  const movNo = await nextMovementNumber(tx);

  await tx.product.update({
    where: { id: product.id },
    data: { currentStockPackets: newBalance },
  });

  await tx.stockMovement.create({
    data: {
      movementNumber: movNo,
      itemCategory: StockItemCategory.FINISHED_GOOD,
      productId: product.id,
      movementType: params.movementType ?? StockMovementType.PRODUCTION_RECEIPT,
      direction: StockDirection.IN,
      quantityBase: BigInt(params.quantityPackets),
      unitLabel: 'packets',
      unitCostPaisa: params.unitCostPaisa,
      totalValuePaisa: params.totalValuePaisa,
      balanceAfterBase: BigInt(newBalance),
      sourceDocType: params.sourceDocType,
      sourceDocId: params.sourceDocId,
      sourceDocNumber: params.sourceDocNumber,
      notes: params.notes,
      createdById: params.userId,
    },
  });

  return newBalance;
}

export async function dispatchFinishedGoodsTx(
  tx: Prisma.TransactionClient,
  params: {
    productId: string;
    quantityPackets: number;
    sourceDocType: string;
    sourceDocId: string;
    sourceDocNumber: string;
    notes?: string;
    userId: string;
  },
): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: params.productId } });
  if (!product) throw new AppError('Product not found', 404);

  if (product.currentStockPackets < params.quantityPackets) {
    const shortage = params.quantityPackets - product.currentStockPackets;
    throw new AppError(
      `Insufficient finished goods stock for ${product.name}. Available: ${product.currentStockPackets} packets, Requested: ${params.quantityPackets} packets (Shortage: ${shortage} packets).`,
      409,
      {
        productId: product.id,
        productName: product.name,
        available: product.currentStockPackets,
        requested: params.quantityPackets,
        shortage,
      },
    );
  }

  const newBalance = product.currentStockPackets - params.quantityPackets;
  const movNo = await nextMovementNumber(tx);

  await tx.product.update({
    where: { id: product.id },
    data: { currentStockPackets: newBalance },
  });

  await tx.stockMovement.create({
    data: {
      movementNumber: movNo,
      itemCategory: StockItemCategory.FINISHED_GOOD,
      productId: product.id,
      movementType: StockMovementType.SALES_DISPATCH,
      direction: StockDirection.OUT,
      quantityBase: BigInt(params.quantityPackets),
      unitLabel: 'packets',
      unitCostPaisa: product.sellingPricePaisa,
      totalValuePaisa: product.sellingPricePaisa * BigInt(params.quantityPackets),
      balanceAfterBase: BigInt(newBalance),
      sourceDocType: params.sourceDocType,
      sourceDocId: params.sourceDocId,
      sourceDocNumber: params.sourceDocNumber,
      notes: params.notes,
      createdById: params.userId,
    },
  });

  return newBalance;
}
