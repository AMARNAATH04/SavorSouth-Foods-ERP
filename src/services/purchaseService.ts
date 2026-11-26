import { BomItemType, StockMovementType } from '@prisma/client';
import { prisma } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';
import { applyBps } from '../utils/money.js';
import { nextSequentialCode } from '../utils/sequence.js';
import { calcLineCostFromDisplay, toBaseQuantity } from '../utils/units.js';
import { receiveMaterialStockTx } from './inventoryService.js';

export interface PurchaseItemInput {
  itemType: BomItemType;
  materialId: string;
  quantity: number;
  unit: string;
  ratePaisa: number;
  gstRateBps?: number;
}

export async function recordPurchase(params: {
  supplierId: string;
  supplierBillNo?: string;
  purchaseDate?: Date;
  notes?: string;
  items: PurchaseItemInput[];
  userId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: params.supplierId } });
    if (!supplier) throw new AppError('Supplier not found', 404);
    if (params.items.length === 0) {
      throw new AppError('At least one purchase item is required', 400);
    }

    const purchaseNumber = await nextSequentialCode('PO-2026-', () => tx.purchase.count());

    let subtotalPaisa = 0n;
    let gstPaisa = 0n;
    const preparedItems: Array<{
      itemType: BomItemType;
      materialId: string;
      quantity: number;
      unit: string;
      quantityBase: bigint;
      ratePaisa: bigint;
      gstRateBps: number;
      lineTotalPaisa: bigint;
    }> = [];

    for (const item of params.items) {
      if (item.quantity <= 0 || item.ratePaisa < 0) {
        throw new AppError('Quantity must be > 0 and rate must be >= 0', 400);
      }

      let baseUnit;
      if (item.itemType === BomItemType.RAW_MATERIAL) {
        const rm = await tx.rawMaterial.findUnique({ where: { id: item.materialId } });
        if (!rm) throw new AppError('Raw material not found', 404);
        baseUnit = rm.baseUnit;
      } else {
        const pm = await tx.packagingMaterial.findUnique({ where: { id: item.materialId } });
        if (!pm) throw new AppError('Packaging material not found', 404);
        baseUnit = pm.baseUnit;
      }

      const quantityBase = BigInt(toBaseQuantity(item.quantity, item.unit, baseUnit));
      const lineSub = BigInt(calcLineCostFromDisplay(item.quantity, item.ratePaisa));
      const lineGst = BigInt(applyBps(lineSub, item.gstRateBps ?? 0));

      subtotalPaisa += lineSub;
      gstPaisa += lineGst;

      preparedItems.push({
        itemType: item.itemType,
        materialId: item.materialId,
        quantity: item.quantity,
        unit: item.unit,
        quantityBase,
        ratePaisa: BigInt(item.ratePaisa),
        gstRateBps: item.gstRateBps ?? 0,
        lineTotalPaisa: lineSub,
      });
    }

    const totalAmountPaisa = subtotalPaisa + gstPaisa;

    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber,
        supplierId: supplier.id,
        supplierBillNo: params.supplierBillNo,
        purchaseDate: params.purchaseDate ?? new Date(),
        subtotalPaisa,
        gstPaisa,
        totalAmountPaisa,
        notes: params.notes,
        createdById: params.userId,
        items: {
          create: preparedItems.map((it) => ({
            itemType: it.itemType,
            rawMaterialId: it.itemType === BomItemType.RAW_MATERIAL ? it.materialId : null,
            packagingMaterialId:
              it.itemType === BomItemType.PACKAGING_MATERIAL ? it.materialId : null,
            quantity: it.quantity,
            unit: it.unit,
            quantityBase: it.quantityBase,
            ratePaisa: it.ratePaisa,
            gstRateBps: it.gstRateBps,
            lineTotalPaisa: it.lineTotalPaisa,
          })),
        },
      },
      include: {
        supplier: true,
        items: { include: { rawMaterial: true, packagingMaterial: true } },
      },
    });

    for (const it of preparedItems) {
      await receiveMaterialStockTx(tx, {
        itemType: it.itemType,
        materialId: it.materialId,
        quantityBase: it.quantityBase,
        lineTotalPaisa: it.lineTotalPaisa,
        movementType: StockMovementType.PURCHASE_RECEIPT,
        sourceDocType: 'Purchase',
        sourceDocId: purchase.id,
        sourceDocNumber: purchase.purchaseNumber,
        notes: `Purchased from ${supplier.name}`,
        userId: params.userId,
      });
    }

    await recordAuditLog(tx, {
      userId: params.userId,
      userRole: params.userRole,
      action: 'CREATE_PURCHASE',
      entityType: 'Purchase',
      entityId: purchase.id,
      entityLabel: purchase.purchaseNumber,
      afterState: {
        supplier: supplier.name,
        totalAmountPaisa: Number(totalAmountPaisa),
        itemCount: preparedItems.length,
      },
    });

    return purchase;
  });
}
