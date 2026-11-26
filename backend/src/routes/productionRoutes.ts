import { BomItemType, BomUsageMode, ExpenseCategory, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import {
  addProductionExpense,
  completeProductionRun,
  createProductionRun,
  issueMaterialsToRun,
} from '../services/productionService.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { convertBetweenUnits, toBaseQuantity } from '../utils/units.js';

export const productionRouter = Router();

productionRouter.use(requireAuth);

// Unit conversion helper API
productionRouter.post(
  '/convert-unit',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      quantity: z.number().nonnegative(),
      fromUnit: z.string().min(1),
      toUnit: z.string().min(1),
      packetsPerCarton: z.number().int().positive().optional(),
    });
    const data = schema.parse(req.body);
    const converted = convertBetweenUnits(
      data.quantity,
      data.fromUnit,
      data.toUnit,
      data.packetsPerCarton,
    );
    res.json({ ...data, converted });
  }),
);

// --- BOM MANAGEMENT ---
productionRouter.get(
  '/boms',
  asyncHandler(async (_req, res) => {
    const boms = await prisma.bom.findMany({
      include: {
        product: true,
        items: {
          include: { rawMaterial: true, packagingMaterial: true },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { version: 'desc' }],
    });
    res.json(boms);
  }),
);

const bomSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(2),
  expectedOutputPackets: z.number().int().positive(),
  yieldTolerancePct: z.number().min(0).max(50).default(5),
  consumptionTolerancePct: z.number().min(0).max(50).default(5),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        itemType: z.nativeEnum(BomItemType),
        materialId: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        usageMode: z.nativeEnum(BomUsageMode).default(BomUsageMode.PER_BATCH),
      }),
    )
    .min(1),
});

productionRouter.post(
  '/boms',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const data = bomSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: data.productId } });
      if (!product) throw new AppError('Product not found', 404);

      const latest = await tx.bom.findFirst({
        where: { productId: data.productId },
        orderBy: { version: 'desc' },
      });
      const version = (latest?.version ?? 0) + 1;

      const preparedItems = [];
      for (const it of data.items) {
        let baseUnit;
        if (it.itemType === BomItemType.RAW_MATERIAL) {
          const rm = await tx.rawMaterial.findUnique({ where: { id: it.materialId } });
          if (!rm) throw new AppError('Raw material not found', 404);
          baseUnit = rm.baseUnit;
        } else {
          const pm = await tx.packagingMaterial.findUnique({ where: { id: it.materialId } });
          if (!pm) throw new AppError('Packaging material not found', 404);
          baseUnit = pm.baseUnit;
        }

        const quantityBase = BigInt(toBaseQuantity(it.quantity, it.unit, baseUnit));
        preparedItems.push({
          itemType: it.itemType,
          rawMaterialId: it.itemType === BomItemType.RAW_MATERIAL ? it.materialId : null,
          packagingMaterialId:
            it.itemType === BomItemType.PACKAGING_MATERIAL ? it.materialId : null,
          quantity: it.quantity,
          unit: it.unit,
          quantityBase,
          usageMode: it.usageMode,
        });
      }

      const bom = await tx.bom.create({
        data: {
          productId: data.productId,
          version,
          name: data.name,
          expectedOutputPackets: data.expectedOutputPackets,
          yieldTolerancePct: data.yieldTolerancePct,
          consumptionTolerancePct: data.consumptionTolerancePct,
          notes: data.notes,
          items: { create: preparedItems },
        },
        include: {
          product: true,
          items: { include: { rawMaterial: true, packagingMaterial: true } },
        },
      });

      await recordAuditLog(tx, {
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'CREATE_BOM',
        entityType: 'Bom',
        entityId: bom.id,
        entityLabel: `${product.name} v${version}`,
        afterState: { expectedOutputPackets: data.expectedOutputPackets, itemCount: preparedItems.length },
      });

      return bom;
    });

    res.status(201).json(created);
  }),
);

// --- PRODUCTION RUNS ---
productionRouter.get(
  '/runs',
  asyncHandler(async (_req, res) => {
    const runs = await prisma.productionRun.findMany({
      include: {
        product: true,
        bom: {
          include: {
            items: { include: { rawMaterial: true, packagingMaterial: true } },
          },
        },
        supervisor: { select: { id: true, name: true, email: true } },
        materialIssues: { include: { rawMaterial: true, packagingMaterial: true } },
        expenses: true,
      },
      orderBy: { productionDate: 'desc' },
    });
    res.json(runs);
  }),
);

productionRouter.get(
  '/runs/:id',
  asyncHandler(async (req, res) => {
    const run = await prisma.productionRun.findUnique({
      where: { id: String(req.params.id) },
      include: {
        product: true,
        bom: {
          include: {
            items: { include: { rawMaterial: true, packagingMaterial: true } },
          },
        },
        supervisor: { select: { id: true, name: true, email: true } },
        materialIssues: {
          include: { rawMaterial: true, packagingMaterial: true },
          orderBy: { issuedAt: 'asc' },
        },
        expenses: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!run) throw new AppError('Production run not found', 404);
    res.json(run);
  }),
);

productionRouter.post(
  '/runs',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      bomId: z.string().min(1),
      batchSize: z.number().positive().default(1),
      productionDate: z.string().optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const run = await createProductionRun({
      bomId: data.bomId,
      batchSize: data.batchSize,
      supervisorId: req.user!.userId,
      productionDate: data.productionDate ? new Date(data.productionDate) : undefined,
      notes: data.notes,
      userRole: req.user!.role,
    });
    res.status(201).json(run);
  }),
);

productionRouter.post(
  '/runs/:id/issue-materials',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      issues: z
        .array(
          z.object({
            itemType: z.nativeEnum(BomItemType),
            materialId: z.string().min(1),
            quantity: z.number().nonnegative(),
            unit: z.string().min(1),
            damagedQuantity: z.number().nonnegative().optional(),
          }),
        )
        .min(1),
    });
    const data = schema.parse(req.body);
    const updated = await issueMaterialsToRun({
      runId: String(req.params.id),
      issues: data.issues,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(updated);
  }),
);

productionRouter.post(
  '/runs/:id/complete',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      actualGoodPackets: z.number().int().positive(),
      damagedPacketsCount: z.number().int().nonnegative().optional(),
      wastageKg: z.number().nonnegative().optional(),
      packagingUsages: z
        .array(
          z.object({
            packagingMaterialId: z.string().min(1),
            usedQuantity: z.number().nonnegative(),
            damagedQuantity: z.number().nonnegative().optional(),
            unit: z.string().optional(),
          }),
        )
        .optional(),
      labourCostPaisa: z.number().int().nonnegative().optional(),
      gasPowerCostPaisa: z.number().int().nonnegative().optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const completed = await completeProductionRun({
      runId: String(req.params.id),
      ...data,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(completed);
  }),
);

productionRouter.post(
  '/runs/:id/expenses',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      category: z.nativeEnum(ExpenseCategory),
      description: z.string().min(2),
      amountPaisa: z.number().int().positive(),
    });
    const data = schema.parse(req.body);
    const result = await addProductionExpense({
      runId: String(req.params.id),
      ...data,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.status(201).json(result);
  }),
);
