import { BomItemType, RoleCode, StockDirection, StockItemCategory, StockMovementType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { recordPurchase } from '../services/purchaseService.js';
import { issueMaterialStockTx, receiveMaterialStockTx } from '../services/inventoryService.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { fromBaseQuantity, parseUnit, toBaseQuantity, weightedAvgRatePerDisplayUnitPaisa } from '../utils/units.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

// Raw materials & packaging overview with computed weighted average cost & display quantities
inventoryRouter.get(
  '/materials',
  asyncHandler(async (_req, res) => {
    const [rawMaterials, packagingMaterials] = await Promise.all([
      prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
      prisma.packagingMaterial.findMany({ orderBy: { name: 'asc' } }),
    ]);

    res.json({
      rawMaterials: rawMaterials.map((r) => ({
        ...r,
        itemType: BomItemType.RAW_MATERIAL,
        openingQtyDisplay: fromBaseQuantity(r.openingStockBase, r.displayUnit),
        currentQtyDisplay: fromBaseQuantity(r.currentStockBase, r.displayUnit),
        reorderLevelDisplay: fromBaseQuantity(r.reorderLevelBase, r.displayUnit),
        weightedAvgRatePaisa: weightedAvgRatePerDisplayUnitPaisa(
          r.totalValuePaisa,
          r.currentStockBase,
          r.displayUnit,
        ),
        isLowStock: r.currentStockBase <= r.reorderLevelBase,
      })),
      packagingMaterials: packagingMaterials.map((p) => ({
        ...p,
        itemType: BomItemType.PACKAGING_MATERIAL,
        openingQtyDisplay: fromBaseQuantity(p.openingStockBase, p.displayUnit),
        currentQtyDisplay: fromBaseQuantity(p.currentStockBase, p.displayUnit),
        reorderLevelDisplay: fromBaseQuantity(p.reorderLevelBase, p.displayUnit),
        weightedAvgRatePaisa: weightedAvgRatePerDisplayUnitPaisa(
          p.totalValuePaisa,
          p.currentStockBase,
          p.displayUnit,
        ),
        isLowStock: p.currentStockBase <= p.reorderLevelBase,
      })),
    });
  }),
);

// Create new raw or packaging material
inventoryRouter.post(
  '/materials',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      itemType: z.nativeEnum(BomItemType),
      name: z.string().min(2),
      code: z.string().min(2),
      displayUnit: z.string().min(1),
      reorderLevel: z.number().nonnegative().default(0),
      openingQty: z.number().nonnegative().default(0),
      openingRatePaisa: z.number().int().nonnegative().default(0),
    });
    const data = schema.parse(req.body);
    const { baseUnit } = parseUnit(data.displayUnit);
    const openingBase = BigInt(toBaseQuantity(data.openingQty, data.displayUnit, baseUnit));
    const reorderBase = BigInt(toBaseQuantity(data.reorderLevel, data.displayUnit, baseUnit));
    const openingValue = BigInt(Math.round(data.openingQty * data.openingRatePaisa));

    const result = await prisma.$transaction(async (tx) => {
      if (data.itemType === BomItemType.RAW_MATERIAL) {
        const created = await tx.rawMaterial.create({
          data: {
            name: data.name,
            code: data.code,
            displayUnit: data.displayUnit,
            baseUnit,
            reorderLevelBase: reorderBase,
            openingStockBase: openingBase,
            openingRatePaisa: BigInt(data.openingRatePaisa),
            currentStockBase: openingBase,
            totalValuePaisa: openingValue,
          },
        });
        if (openingBase > 0n) {
          await tx.stockMovement.create({
            data: {
              movementNumber: `MOV-INIT-${Date.now().toString().slice(-6)}`,
              itemCategory: StockItemCategory.RAW_MATERIAL,
              rawMaterialId: created.id,
              movementType: StockMovementType.OPENING,
              direction: StockDirection.IN,
              quantityBase: openingBase,
              unitLabel: data.displayUnit,
              unitCostPaisa: BigInt(data.openingRatePaisa),
              totalValuePaisa: openingValue,
              balanceAfterBase: openingBase,
              sourceDocType: 'OpeningBalance',
              sourceDocId: created.id,
              sourceDocNumber: created.code,
              createdById: req.user!.userId,
            },
          });
        }
        return created;
      }

      const created = await tx.packagingMaterial.create({
        data: {
          name: data.name,
          code: data.code,
          displayUnit: data.displayUnit,
          baseUnit,
          reorderLevelBase: reorderBase,
          openingStockBase: openingBase,
          openingRatePaisa: BigInt(data.openingRatePaisa),
          currentStockBase: openingBase,
          totalValuePaisa: openingValue,
        },
      });
      if (openingBase > 0n) {
        await tx.stockMovement.create({
          data: {
            movementNumber: `MOV-INIT-${Date.now().toString().slice(-6)}`,
            itemCategory: StockItemCategory.PACKAGING_MATERIAL,
            packagingMaterialId: created.id,
            movementType: StockMovementType.OPENING,
            direction: StockDirection.IN,
            quantityBase: openingBase,
            unitLabel: data.displayUnit,
            unitCostPaisa: BigInt(data.openingRatePaisa),
            totalValuePaisa: openingValue,
            balanceAfterBase: openingBase,
            sourceDocType: 'OpeningBalance',
            sourceDocId: created.id,
            sourceDocNumber: created.code,
            createdById: req.user!.userId,
          },
        });
      }
      return created;
    });

    res.status(201).json(result);
  }),
);

// Purchases list & record purchase
inventoryRouter.get(
  '/purchases',
  asyncHandler(async (_req, res) => {
    const purchases = await prisma.purchase.findMany({
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true } },
        items: { include: { rawMaterial: true, packagingMaterial: true } },
      },
      orderBy: { purchaseDate: 'desc' },
    });
    res.json(purchases);
  }),
);

inventoryRouter.post(
  '/purchases',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      supplierId: z.string().min(1),
      supplierBillNo: z.string().optional(),
      purchaseDate: z.string().optional(),
      notes: z.string().optional(),
      items: z
        .array(
          z.object({
            itemType: z.nativeEnum(BomItemType),
            materialId: z.string().min(1),
            quantity: z.number().positive(),
            unit: z.string().min(1),
            ratePaisa: z.number().int().nonnegative(),
            gstRateBps: z.number().int().nonnegative().optional(),
          }),
        )
        .min(1),
    });

    const data = schema.parse(req.body);
    const purchase = await recordPurchase({
      ...data,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.status(201).json(purchase);
  }),
);

// Controlled Stock Adjustment (audited)
inventoryRouter.post(
  '/adjustments',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      itemType: z.nativeEnum(BomItemType),
      materialId: z.string().min(1),
      direction: z.enum(['IN', 'OUT']),
      quantity: z.number().positive(),
      unit: z.string().min(1),
      unitRatePaisa: z.number().int().nonnegative().optional(),
      reason: z.string().min(3),
    });
    const data = schema.parse(req.body);

    const movement = await prisma.$transaction(async (tx) => {
      let baseUnit;
      if (data.itemType === BomItemType.RAW_MATERIAL) {
        const rm = await tx.rawMaterial.findUnique({ where: { id: data.materialId } });
        if (!rm) throw new AppError('Raw material not found', 404);
        baseUnit = rm.baseUnit;
      } else {
        const pm = await tx.packagingMaterial.findUnique({ where: { id: data.materialId } });
        if (!pm) throw new AppError('Packaging material not found', 404);
        baseUnit = pm.baseUnit;
      }

      const qtyBase = BigInt(toBaseQuantity(data.quantity, data.unit, baseUnit));
      const docNo = `ADJ-${Date.now().toString().slice(-6)}`;

      const resMov =
        data.direction === 'IN'
          ? await receiveMaterialStockTx(tx, {
              itemType: data.itemType,
              materialId: data.materialId,
              quantityBase: qtyBase,
              lineTotalPaisa: BigInt(Math.round(data.quantity * (data.unitRatePaisa ?? 0))),
              movementType: StockMovementType.ADJUSTMENT,
              sourceDocType: 'StockAdjustment',
              sourceDocId: docNo,
              sourceDocNumber: docNo,
              notes: data.reason,
              userId: req.user!.userId,
            })
          : await issueMaterialStockTx(tx, {
              itemType: data.itemType,
              materialId: data.materialId,
              quantityBase: qtyBase,
              movementType: StockMovementType.ADJUSTMENT,
              sourceDocType: 'StockAdjustment',
              sourceDocId: docNo,
              sourceDocNumber: docNo,
              notes: data.reason,
              userId: req.user!.userId,
            });

      await recordAuditLog(tx, {
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'STOCK_ADJUSTMENT',
        entityType: data.itemType,
        entityId: data.materialId,
        entityLabel: docNo,
        afterState: data,
      });

      return resMov;
    });

    res.status(201).json(movement);
  }),
);

// Immutable stock movement ledger
inventoryRouter.get(
  '/ledger',
  asyncHandler(async (req, res) => {
    const category = req.query.category as StockItemCategory | undefined;
    const movements = await prisma.stockMovement.findMany({
      where: category ? { itemCategory: category } : undefined,
      include: {
        rawMaterial: true,
        packagingMaterial: true,
        product: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    res.json(
      movements.map((m) => ({
        ...m,
        itemName: m.rawMaterial?.name ?? m.packagingMaterial?.name ?? m.product?.name ?? '-',
        displayQuantity:
          m.itemCategory === StockItemCategory.FINISHED_GOOD
            ? Number(m.quantityBase)
            : fromBaseQuantity(m.quantityBase, m.unitLabel),
        displayBalanceAfter:
          m.itemCategory === StockItemCategory.FINISHED_GOOD
            ? Number(m.balanceAfterBase)
            : fromBaseQuantity(m.balanceAfterBase, m.unitLabel),
      })),
    );
  }),
);
