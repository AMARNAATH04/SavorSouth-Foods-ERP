import { InvoiceStatus, PaymentMode } from '@prisma/client';
import { prisma } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';
import { nextSequentialCode } from '../utils/sequence.js';

export interface InvoiceAllocationInput {
  invoiceId: string;
  allocatedAmountPaisa: number;
}

export async function recordCustomerPayment(params: {
  customerId: string;
  amountPaisa: number;
  paymentMode: PaymentMode;
  paymentDate?: Date;
  referenceNumber?: string;
  notes?: string;
  allocations?: InvoiceAllocationInput[];
  userId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: params.customerId } });
    if (!customer) throw new AppError('Customer not found', 404);
    if (params.amountPaisa <= 0) {
      throw new AppError('Payment amount must be greater than zero', 400);
    }

    const totalPayment = BigInt(params.amountPaisa);
    let targetAllocations = params.allocations ?? [];

    // FIFO auto-allocation if caller didn't specify explicit invoice allocations
    if (targetAllocations.length === 0) {
      const openInvoices = await tx.invoice.findMany({
        where: {
          customerId: customer.id,
          status: InvoiceStatus.POSTED,
        },
        orderBy: { invoiceDate: 'asc' },
      });

      let remaining = params.amountPaisa;
      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const due = Number(inv.totalAmountPaisa - inv.paidAmountPaisa);
        if (due <= 0) continue;
        const alloc = Math.min(remaining, due);
        targetAllocations.push({ invoiceId: inv.id, allocatedAmountPaisa: alloc });
        remaining -= alloc;
      }
    }

    const allocatedSum = targetAllocations.reduce(
      (sum, a) => sum + BigInt(a.allocatedAmountPaisa),
      0n,
    );
    if (allocatedSum > totalPayment) {
      throw new AppError('Allocated amount cannot exceed total payment amount', 400);
    }

    const paymentNumber = await nextSequentialCode('PAY-2026-', () => tx.payment.count());

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        customerId: customer.id,
        paymentDate: params.paymentDate ?? new Date(),
        amountPaisa: totalPayment,
        paymentMode: params.paymentMode,
        referenceNumber: params.referenceNumber,
        notes: params.notes,
        recordedById: params.userId,
      },
    });

    for (const alloc of targetAllocations) {
      if (alloc.allocatedAmountPaisa <= 0) continue;
      const inv = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
      if (!inv || inv.customerId !== customer.id) {
        throw new AppError('Invalid invoice for customer payment allocation', 400);
      }
      if (inv.status !== InvoiceStatus.POSTED) {
        throw new AppError(`Cannot allocate payment to cancelled invoice ${inv.invoiceNumber}`, 400);
      }
      const due = inv.totalAmountPaisa - inv.paidAmountPaisa;
      const allocBig = BigInt(alloc.allocatedAmountPaisa);
      if (allocBig > due) {
        throw new AppError(
          `Allocation exceeds outstanding balance on ${inv.invoiceNumber}`,
          400,
        );
      }

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: inv.id,
          allocatedAmountPaisa: allocBig,
        },
      });

      await tx.invoice.update({
        where: { id: inv.id },
        data: { paidAmountPaisa: inv.paidAmountPaisa + allocBig },
      });
    }

    await recordAuditLog(tx, {
      userId: params.userId,
      userRole: params.userRole,
      action: 'RECORD_PAYMENT',
      entityType: 'Payment',
      entityId: payment.id,
      entityLabel: payment.paymentNumber,
      afterState: {
        customer: customer.name,
        amountPaisa: params.amountPaisa,
        paymentMode: params.paymentMode,
        allocationsCount: targetAllocations.length,
      },
    });

    return tx.payment.findUnique({
      where: { id: payment.id },
      include: {
        customer: true,
        allocations: { include: { invoice: true } },
      },
    });
  });
}

export async function getCustomerOutstandingSummary(customerId?: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: InvoiceStatus.POSTED,
      ...(customerId ? { customerId } : {}),
    },
    include: { customer: true },
    orderBy: { invoiceDate: 'asc' },
  });

  const now = new Date();
  const byCustomer = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      type: string;
      state: string;
      totalInvoicedPaisa: number;
      totalPaidPaisa: number;
      outstandingPaisa: number;
      bucket0to30Paisa: number;
      bucket31to60Paisa: number;
      bucket61to90Paisa: number;
      bucket90PlusPaisa: number;
      openInvoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        invoiceDate: Date;
        totalAmountPaisa: number;
        paidAmountPaisa: number;
        balancePaisa: number;
        ageDays: number;
      }>;
    }
  >();

  for (const inv of invoices) {
    const total = Number(inv.totalAmountPaisa);
    const paid = Number(inv.paidAmountPaisa);
    const balance = Math.max(0, total - paid);
    const ageDays = Math.max(
      0,
      Math.floor((now.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    if (!byCustomer.has(inv.customerId)) {
      byCustomer.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: inv.customer.name,
        type: inv.customer.type,
        state: inv.customer.state,
        totalInvoicedPaisa: 0,
        totalPaidPaisa: 0,
        outstandingPaisa: 0,
        bucket0to30Paisa: 0,
        bucket31to60Paisa: 0,
        bucket61to90Paisa: 0,
        bucket90PlusPaisa: 0,
        openInvoices: [],
      });
    }

    const entry = byCustomer.get(inv.customerId)!;
    entry.totalInvoicedPaisa += total;
    entry.totalPaidPaisa += paid;
    entry.outstandingPaisa += balance;

    if (balance > 0) {
      if (ageDays <= 30) entry.bucket0to30Paisa += balance;
      else if (ageDays <= 60) entry.bucket31to60Paisa += balance;
      else if (ageDays <= 90) entry.bucket61to90Paisa += balance;
      else entry.bucket90PlusPaisa += balance;

      entry.openInvoices.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        totalAmountPaisa: total,
        paidAmountPaisa: paid,
        balancePaisa: balance,
        ageDays,
      });
    }
  }

  return Array.from(byCustomer.values());
}
