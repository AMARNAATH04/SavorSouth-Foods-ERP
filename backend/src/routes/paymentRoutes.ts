import { PaymentMode, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import {
  getCustomerOutstandingSummary,
  recordCustomerPayment,
} from '../services/paymentService.js';
import { asyncHandler } from '../utils/errors.js';

export const paymentRouter = Router();

paymentRouter.use(requireAuth);

paymentRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      include: {
        customer: true,
        recordedBy: { select: { id: true, name: true } },
        allocations: { include: { invoice: true } },
      },
      orderBy: { paymentDate: 'desc' },
    });
    res.json(payments);
  }),
);

paymentRouter.get(
  '/outstanding',
  asyncHandler(async (req, res) => {
    const customerId = req.query.customerId ? String(req.query.customerId) : undefined;
    const summary = await getCustomerOutstandingSummary(customerId);
    res.json(summary);
  }),
);

paymentRouter.post(
  '/',
  requireRoles(RoleCode.OWNER, RoleCode.FACTORY_ADMIN),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      customerId: z.string().min(1),
      amountPaisa: z.number().int().positive(),
      paymentMode: z.nativeEnum(PaymentMode).default(PaymentMode.NEFT),
      paymentDate: z.string().optional(),
      referenceNumber: z.string().optional(),
      notes: z.string().optional(),
      allocations: z
        .array(
          z.object({
            invoiceId: z.string().min(1),
            allocatedAmountPaisa: z.number().int().positive(),
          }),
        )
        .optional(),
    });
    const data = schema.parse(req.body);
    const payment = await recordCustomerPayment({
      ...data,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    res.status(201).json(payment);
  }),
);
