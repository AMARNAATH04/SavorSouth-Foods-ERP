import { OrderStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import {
  approveSalesOrder,
  cancelInvoiceWithCreditNote,
  checkOrderStockAvailability,
  createSalesOrder,
  dispatchSalesOrder,
  generateGstInvoice,
  rejectSalesOrder,
  updateAndVerifyOrder,
} from '../services/salesService.js';
import { AppError, asyncHandler } from '../utils/errors.js';

export const salesRouter = Router();

salesRouter.use(requireAuth);

// List sales orders (salesmen see their own orders)
salesRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const status = req.query.status as OrderStatus | undefined;
    const isSalesman = req.user!.role === RoleCode.SALESMAN;
    const orders = await prisma.salesOrder.findMany({
      where: {
        ...(isSalesman ? { salesmanId: req.user!.userId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
        invoice: true,
      },
      orderBy: { orderDate: 'desc' },
    });
    res.json(orders);
  }),
);

salesRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.salesOrder.findUnique({
      where: { id: String(req.params.id) },
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        verifiedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        dispatchedBy: { select: { id: true, name: true } },
        items: { include: { product: true } },
        invoice: { include: { items: true } },
      },
    });
    if (!order) throw new AppError('Sales order not found', 404);
    if (req.user!.role === RoleCode.SALESMAN && order.salesmanId !== req.user!.userId) {
      throw new AppError('You can only view your own sales orders', 403);
    }
    const stockCheck = await checkOrderStockAvailability(order.items);
    res.json({ ...order, stockCheck });
  }),
);

salesRouter.post(
  '/orders',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN, RoleCode.SALESMAN),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      customerId: z.string().min(1),
      orderDate: z.string().optional(),
      notes: z.string().optional(),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantityPackets: z.number().int().positive(),
            unitPricePaisa: z.number().int().nonnegative().optional(),
          }),
        )
        .min(1),
    });
    const data = schema.parse(req.body);
    const order = await createSalesOrder({
      customerId: data.customerId,
      salesmanId: req.user!.userId,
      items: data.items,
      orderDate: data.orderDate ? new Date(data.orderDate) : undefined,
      notes: data.notes,
      userRole: req.user!.role,
    });
    res.status(201).json(order);
  }),
);

salesRouter.put(
  '/orders/:id/verify',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      notes: z.string().optional(),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantityPackets: z.number().int().positive(),
            unitPricePaisa: z.number().int().nonnegative().optional(),
          }),
        )
        .optional(),
    });
    const data = schema.parse(req.body);
    const updated = await updateAndVerifyOrder({
      orderId: String(req.params.id),
      items: data.items,
      notes: data.notes,
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(updated);
  }),
);

salesRouter.post(
  '/orders/:id/approve',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const approved = await approveSalesOrder({
      orderId: String(req.params.id),
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(approved);
  }),
);

salesRouter.post(
  '/orders/:id/reject',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const rejected = await rejectSalesOrder({
      orderId: String(req.params.id),
      reason,
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(rejected);
  }),
);

salesRouter.post(
  '/orders/:id/invoice',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const invoice = await generateGstInvoice({
      orderId: String(req.params.id),
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.status(201).json(invoice);
  }),
);

salesRouter.post(
  '/orders/:id/dispatch',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const dispatched = await dispatchSalesOrder({
      orderId: String(req.params.id),
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(dispatched);
  }),
);

// --- INVOICES ---
salesRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const isSalesman = req.user!.role === RoleCode.SALESMAN;
    const invoices = await prisma.invoice.findMany({
      where: isSalesman ? { salesOrder: { salesmanId: req.user!.userId } } : undefined,
      include: {
        customer: true,
        salesOrder: { include: { salesman: { select: { id: true, name: true } } } },
        items: { include: { product: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });
    res.json(invoices);
  }),
);

salesRouter.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: String(req.params.id) },
      include: {
        customer: true,
        salesOrder: { include: { salesman: { select: { id: true, name: true } } } },
        items: { include: { product: true } },
        allocations: { include: { payment: true } },
      },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    const company = await prisma.companySetting.findUnique({ where: { id: 'default' } });
    res.json({ invoice, company });
  }),
);

salesRouter.post(
  '/invoices/:id/cancel',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const cancelled = await cancelInvoiceWithCreditNote({
      invoiceId: String(req.params.id),
      reason,
      adminId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.json(cancelled);
  }),
);
