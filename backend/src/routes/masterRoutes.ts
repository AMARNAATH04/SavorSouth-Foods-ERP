import { CustomerType, PriceCategory, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { getCustomerOutstandingSummary } from '../services/paymentService.js';

export const masterRouter = Router();

masterRouter.use(requireAuth);

// --- PRODUCTS ---
masterRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly === 'true';
    const products = await prisma.product.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
    res.json(products);
  }),
);

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  category: z.string().min(2),
  packSizeGrams: z.number().int().positive(),
  packLabel: z.string().min(1),
  sellingPricePaisa: z.number().int().nonnegative(),
  gstRateBps: z.number().int().nonnegative().default(500),
  hsnCode: z.string().min(4),
  unit: z.string().default('PACKET'),
  packetsPerCarton: z.number().int().positive().default(20),
  reorderLevelPackets: z.number().int().nonnegative().default(50),
  imageUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

masterRouter.post(
  '/products',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    const created = await prisma.product.create({
      data: {
        ...data,
        sellingPricePaisa: BigInt(data.sellingPricePaisa),
      },
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'CREATE_PRODUCT',
      entityType: 'Product',
      entityId: created.id,
      entityLabel: created.name,
      afterState: data,
    });
    res.status(201).json(created);
  }),
);

masterRouter.put(
  '/suppliers/:id',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const data = supplierSchema.partial().parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new AppError('Supplier not found', 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data,
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: updated.id,
      entityLabel: updated.name,
      beforeState: { name: before.name, phone: before.phone, city: before.city },
      afterState: data,
    });
    res.json(updated);
  }),
);

masterRouter.put(
  '/products/:id',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const data = productSchema.partial().parse(req.body);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw new AppError('Product not found', 404);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(data.sellingPricePaisa !== undefined
          ? { sellingPricePaisa: BigInt(data.sellingPricePaisa) }
          : {}),
      },
    });

    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_PRODUCT',
      entityType: 'Product',
      entityId: updated.id,
      entityLabel: updated.name,
      beforeState: { sellingPricePaisa: Number(before.sellingPricePaisa), isActive: before.isActive },
      afterState: { sellingPricePaisa: Number(updated.sellingPricePaisa), isActive: updated.isActive },
    });

    res.json(updated);
  }),
);

// --- CUSTOMERS ---
masterRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const isSalesman = req.user!.role === RoleCode.SALESMAN;
    const customers = await prisma.customer.findMany({
      where: isSalesman ? { assignedSalesmanId: req.user!.userId } : undefined,
      include: {
        assignedSalesman: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });

    const outstandingList = await getCustomerOutstandingSummary();
    const outMap = new Map(outstandingList.map((o) => [o.customerId, o.outstandingPaisa]));

    res.json(
      customers.map((c) => ({
        ...c,
        outstandingPaisa: outMap.get(c.id) ?? 0,
      })),
    );
  }),
);

const customerSchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(CustomerType).default(CustomerType.RETAILER),
  gstin: z.string().optional().nullable(),
  address: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().min(2).max(2),
  phone: z.string().min(6),
  email: z.string().email().optional().nullable(),
  priceCategory: z.nativeEnum(PriceCategory).default(PriceCategory.STANDARD),
  creditLimitPaisa: z.number().int().nonnegative().default(5000000),
  assignedSalesmanId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

masterRouter.post(
  '/customers',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const created = await prisma.customer.create({
      data: {
        ...data,
        creditLimitPaisa: BigInt(data.creditLimitPaisa),
      },
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'CREATE_CUSTOMER',
      entityType: 'Customer',
      entityId: created.id,
      entityLabel: created.name,
      afterState: data,
    });
    res.status(201).json(created);
  }),
);

masterRouter.put(
  '/suppliers/:id',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const data = supplierSchema.partial().parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new AppError('Supplier not found', 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data,
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: updated.id,
      entityLabel: updated.name,
      beforeState: { name: before.name, phone: before.phone, city: before.city },
      afterState: data,
    });
    res.json(updated);
  }),
);

masterRouter.put(
  '/customers/:id',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const data = customerSchema.partial().parse(req.body);
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...data,
        ...(data.creditLimitPaisa !== undefined
          ? { creditLimitPaisa: BigInt(data.creditLimitPaisa) }
          : {}),
      },
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_CUSTOMER',
      entityType: 'Customer',
      entityId: updated.id,
      entityLabel: updated.name,
      afterState: data,
    });
    res.json(updated);
  }),
);

// --- SUPPLIERS ---
masterRouter.get(
  '/suppliers',
  asyncHandler(async (_req, res) => {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    res.json(suppliers);
  }),
);

const supplierSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional().nullable(),
  address: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  stateCode: z.string().min(2).max(2),
  phone: z.string().min(6),
  email: z.string().email().optional().nullable(),
  isActive: z.boolean().default(true),
});

masterRouter.post(
  '/suppliers',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const data = supplierSchema.parse(req.body);
    const created = await prisma.supplier.create({ data });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'CREATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: created.id,
      entityLabel: created.name,
      afterState: data,
    });
    res.status(201).json(created);
  }),
);

masterRouter.put(
  '/suppliers/:id',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.PRODUCTION_SUPERVISOR),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const data = supplierSchema.partial().parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new AppError('Supplier not found', 404);

    const updated = await prisma.supplier.update({
      where: { id },
      data,
    });
    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: updated.id,
      entityLabel: updated.name,
      beforeState: { name: before.name, phone: before.phone, city: before.city },
      afterState: data,
    });
    res.json(updated);
  }),
);

// --- SETTINGS ---
masterRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    let settings = await prisma.companySetting.findUnique({ where: { id: 'default' } });
    if (!settings) {
      settings = await prisma.companySetting.create({ data: { id: 'default' } });
    }
    res.json(settings);
  }),
);

masterRouter.put(
  '/settings',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      companyName: z.string().min(2).optional(),
      tagline: z.string().optional(),
      gstin: z.string().min(10).optional(),
      fssaiLicense: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      stateCode: z.string().length(2).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      invoicePrefix: z.string().min(2).max(6).optional(),
      yieldVarianceTolerancePct: z.number().min(0).max(50).optional(),
      consumptionVarianceTolerancePct: z.number().min(0).max(50).optional(),
      overheadAllocationRule: z.string().optional(),
      defaultLabourCostPerBatchPaisa: z.number().int().nonnegative().optional(),
      defaultGasPowerCostPerBatchPaisa: z.number().int().nonnegative().optional(),
    });
    const data = schema.parse(req.body);
    const updated = await prisma.companySetting.upsert({
      where: { id: 'default' },
      update: {
        ...data,
        ...(data.defaultLabourCostPerBatchPaisa !== undefined
          ? { defaultLabourCostPerBatchPaisa: BigInt(data.defaultLabourCostPerBatchPaisa) }
          : {}),
        ...(data.defaultGasPowerCostPerBatchPaisa !== undefined
          ? { defaultGasPowerCostPerBatchPaisa: BigInt(data.defaultGasPowerCostPerBatchPaisa) }
          : {}),
      },
      create: { id: 'default' },
    });

    await recordAuditLog(prisma, {
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'UPDATE_SETTINGS',
      entityType: 'CompanySetting',
      entityId: 'default',
      entityLabel: updated.companyName,
      afterState: data,
    });

    res.json(updated);
  }),
);

// --- AUDIT LOGS ---
masterRouter.get(
  '/audit-logs',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.ACCOUNTANT),
  asyncHandler(async (req, res) => {
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const logs = await prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(logs);
  }),
);
