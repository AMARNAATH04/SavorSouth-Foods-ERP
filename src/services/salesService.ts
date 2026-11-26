import { InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';
import { calculateGstLine, getFinancialYear } from '../utils/gst.js';
import { nextSequentialCode } from '../utils/sequence.js';
import { dispatchFinishedGoodsTx } from './inventoryService.js';

export interface OrderItemInput {
  productId: string;
  quantityPackets: number;
  unitPricePaisa?: number;
}

export async function checkOrderStockAvailability(
  items: Array<{ productId: string; quantityPackets: number }>,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const checks = [];
  let hasShortage = false;

  for (const item of items) {
    const product = await db.product.findUnique({ where: { id: item.productId } });
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);
    const available = product.currentStockPackets;
    const shortage = Math.max(0, item.quantityPackets - available);
    if (shortage > 0) hasShortage = true;
    checks.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      requested: item.quantityPackets,
      available,
      shortage,
      sufficient: shortage === 0,
    });
  }

  return { hasShortage, items: checks };
}

export async function createSalesOrder(params: {
  customerId: string;
  salesmanId: string;
  items: OrderItemInput[];
  orderDate?: Date;
  notes?: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: params.customerId } });
    if (!customer) throw new AppError('Customer not found', 404);
    if (params.items.length === 0) {
      throw new AppError('At least one product item is required', 400);
    }

    const company = await tx.companySetting.findUnique({ where: { id: 'default' } });
    const companyStateCode = company?.stateCode ?? '33';

    let subtotalPaisa = 0n;
    let estimatedTaxPaisa = 0n;
    let hasStockShortage = false;

    const preparedItems: Array<{
      productId: string;
      quantityPackets: number;
      unitPricePaisa: bigint;
      gstRateBps: number;
      lineSubtotalPaisa: bigint;
      lineTaxPaisa: bigint;
      lineTotalPaisa: bigint;
    }> = [];

    for (const item of params.items) {
      if (item.quantityPackets <= 0) {
        throw new AppError('Quantity must be at least 1 packet', 400);
      }
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || !product.isActive) {
        throw new AppError('Product not found or inactive', 404);
      }

      if (product.currentStockPackets < item.quantityPackets) {
        hasStockShortage = true;
      }

      const unitPrice = BigInt(item.unitPricePaisa ?? Number(product.sellingPricePaisa));
      const lineSubtotal = unitPrice * BigInt(item.quantityPackets);
      const gst = calculateGstLine(
        Number(lineSubtotal),
        product.gstRateBps,
        customer.stateCode,
        companyStateCode,
      );

      subtotalPaisa += lineSubtotal;
      estimatedTaxPaisa += BigInt(gst.totalTaxPaisa);

      preparedItems.push({
        productId: product.id,
        quantityPackets: item.quantityPackets,
        unitPricePaisa: unitPrice,
        gstRateBps: product.gstRateBps,
        lineSubtotalPaisa: lineSubtotal,
        lineTaxPaisa: BigInt(gst.totalTaxPaisa),
        lineTotalPaisa: BigInt(gst.totalAmountPaisa),
      });
    }

    const orderNumber = await nextSequentialCode('SO-2026-', () => tx.salesOrder.count());
    const totalAmountPaisa = subtotalPaisa + estimatedTaxPaisa;

    const order = await tx.salesOrder.create({
      data: {
        orderNumber,
        customerId: customer.id,
        salesmanId: params.salesmanId,
        status: OrderStatus.SUBMITTED,
        orderDate: params.orderDate ?? new Date(),
        subtotalPaisa,
        estimatedTaxPaisa,
        totalAmountPaisa,
        hasStockShortage,
        notes: params.notes,
        items: { create: preparedItems },
      },
      include: {
        customer: true,
        salesman: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.salesmanId,
      userRole: params.userRole,
      action: 'CREATE_SALES_ORDER',
      entityType: 'SalesOrder',
      entityId: order.id,
      entityLabel: order.orderNumber,
      afterState: {
        customer: customer.name,
        totalAmountPaisa: Number(totalAmountPaisa),
        hasStockShortage,
      },
    });

    return order;
  });
}

export async function updateAndVerifyOrder(params: {
  orderId: string;
  items?: OrderItemInput[];
  notes?: string;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: params.orderId },
      include: { customer: true, items: true },
    });
    if (!order) throw new AppError('Sales order not found', 404);
    if (order.status !== OrderStatus.SUBMITTED && order.status !== OrderStatus.VERIFIED) {
      throw new AppError(`Cannot edit order in status ${order.status}`, 400);
    }

    const company = await tx.companySetting.findUnique({ where: { id: 'default' } });
    const companyStateCode = company?.stateCode ?? '33';

    const targetItems = params.items ?? order.items.map((i) => ({
      productId: i.productId,
      quantityPackets: i.quantityPackets,
      unitPricePaisa: Number(i.unitPricePaisa),
    }));

    let subtotalPaisa = 0n;
    let estimatedTaxPaisa = 0n;
    let hasStockShortage = false;

    const preparedItems: Array<{
      productId: string;
      quantityPackets: number;
      unitPricePaisa: bigint;
      gstRateBps: number;
      lineSubtotalPaisa: bigint;
      lineTaxPaisa: bigint;
      lineTotalPaisa: bigint;
    }> = [];

    for (const item of targetItems) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new AppError('Product not found', 404);
      if (product.currentStockPackets < item.quantityPackets) hasStockShortage = true;

      const unitPrice = BigInt(item.unitPricePaisa ?? Number(product.sellingPricePaisa));
      const lineSubtotal = unitPrice * BigInt(item.quantityPackets);
      const gst = calculateGstLine(
        Number(lineSubtotal),
        product.gstRateBps,
        order.customer.stateCode,
        companyStateCode,
      );

      subtotalPaisa += lineSubtotal;
      estimatedTaxPaisa += BigInt(gst.totalTaxPaisa);

      preparedItems.push({
        productId: product.id,
        quantityPackets: item.quantityPackets,
        unitPricePaisa: unitPrice,
        gstRateBps: product.gstRateBps,
        lineSubtotalPaisa: lineSubtotal,
        lineTaxPaisa: BigInt(gst.totalTaxPaisa),
        lineTotalPaisa: BigInt(gst.totalAmountPaisa),
      });
    }

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: order.id } });

    const updated = await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.VERIFIED,
        verifiedById: params.adminId,
        subtotalPaisa,
        estimatedTaxPaisa,
        totalAmountPaisa: subtotalPaisa + estimatedTaxPaisa,
        hasStockShortage,
        notes: params.notes ?? order.notes,
        items: { create: preparedItems },
      },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'VERIFY_SALES_ORDER',
      entityType: 'SalesOrder',
      entityId: order.id,
      entityLabel: order.orderNumber,
      beforeState: { subtotalPaisa: Number(order.subtotalPaisa), status: order.status },
      afterState: { subtotalPaisa: Number(subtotalPaisa), status: updated.status },
    });

    return updated;
  });
}

export async function approveSalesOrder(params: {
  orderId: string;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: params.orderId },
      include: { items: { include: { product: true } }, customer: true },
    });
    if (!order) throw new AppError('Sales order not found', 404);
    if (order.status !== OrderStatus.SUBMITTED && order.status !== OrderStatus.VERIFIED) {
      throw new AppError(`Order cannot be approved from status ${order.status}`, 400);
    }

    const stockCheck = await checkOrderStockAvailability(order.items, tx);
    if (stockCheck.hasShortage) {
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { hasStockShortage: true },
      });
      const firstShort = stockCheck.items.find((i) => !i.sufficient)!;
      throw new AppError(
        `Insufficient finished-goods stock for ${firstShort.productName}. Available: ${firstShort.available} packets, Requested: ${firstShort.requested} packets (Shortage: ${firstShort.shortage} packets).`,
        409,
        stockCheck,
      );
    }

    const updated = await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.APPROVED,
        hasStockShortage: false,
        verifiedById: order.verifiedById ?? params.adminId,
        approvedById: params.adminId,
      },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'APPROVE_SALES_ORDER',
      entityType: 'SalesOrder',
      entityId: order.id,
      entityLabel: order.orderNumber,
      afterState: { status: OrderStatus.APPROVED },
    });

    return updated;
  });
}

export async function rejectSalesOrder(params: {
  orderId: string;
  reason: string;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: params.orderId } });
    if (!order) throw new AppError('Sales order not found', 404);
    if (order.status === OrderStatus.DISPATCHED || order.status === OrderStatus.INVOICED) {
      throw new AppError('Cannot reject an already invoiced or dispatched order', 400);
    }

    const updated = await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.REJECTED,
        rejectionReason: params.reason,
        verifiedById: params.adminId,
      },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'REJECT_SALES_ORDER',
      entityType: 'SalesOrder',
      entityId: order.id,
      entityLabel: order.orderNumber,
      afterState: { status: OrderStatus.REJECTED, reason: params.reason },
    });

    return updated;
  });
}

export async function generateGstInvoice(params: {
  orderId: string;
  invoiceDate?: Date;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: params.orderId },
      include: {
        customer: true,
        items: { include: { product: true } },
        invoice: true,
      },
    });
    if (!order) throw new AppError('Sales order not found', 404);
    if (order.invoice) return order.invoice;

    if (order.status !== OrderStatus.APPROVED) {
      throw new AppError(
        `Order must be APPROVED before generating GST invoice (current status: ${order.status})`,
        400,
      );
    }

    const company = await tx.companySetting.findUnique({ where: { id: 'default' } });
    const companyStateCode = company?.stateCode ?? '33';
    const prefix = company?.invoicePrefix ?? 'SSF';
    const invoiceDate = params.invoiceDate ?? new Date();
    const fy = getFinancialYear(invoiceDate);

    const fyCount = await tx.invoice.count({ where: { financialYear: fy } });
    const invoiceNumber = `${prefix}/${fy}/${String(fyCount + 1).padStart(4, '0')}`;

    const isInterState = order.customer.stateCode.trim() !== companyStateCode.trim();
    let taxableAmountPaisa = 0n;
    let cgstPaisa = 0n;
    let sgstPaisa = 0n;
    let igstPaisa = 0n;

    const invoiceItems = order.items.map((item) => {
      const gst = calculateGstLine(
        Number(item.lineSubtotalPaisa),
        item.gstRateBps,
        order.customer.stateCode,
        companyStateCode,
      );

      taxableAmountPaisa += BigInt(gst.taxableAmountPaisa);
      cgstPaisa += BigInt(gst.cgstPaisa);
      sgstPaisa += BigInt(gst.sgstPaisa);
      igstPaisa += BigInt(gst.igstPaisa);

      return {
        productId: item.productId,
        productName: item.product.name,
        hsnCode: item.product.hsnCode,
        quantityPackets: item.quantityPackets,
        unitPricePaisa: item.unitPricePaisa,
        taxableAmountPaisa: BigInt(gst.taxableAmountPaisa),
        gstRateBps: item.gstRateBps,
        cgstPaisa: BigInt(gst.cgstPaisa),
        sgstPaisa: BigInt(gst.sgstPaisa),
        igstPaisa: BigInt(gst.igstPaisa),
        totalAmountPaisa: BigInt(gst.totalAmountPaisa),
      };
    });

    const totalAmountPaisa = taxableAmountPaisa + cgstPaisa + sgstPaisa + igstPaisa;

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        financialYear: fy,
        salesOrderId: order.id,
        customerId: order.customerId,
        invoiceDate,
        status: InvoiceStatus.POSTED,
        isInterState,
        taxableAmountPaisa,
        cgstPaisa,
        sgstPaisa,
        igstPaisa,
        totalAmountPaisa,
        createdById: params.adminId,
        items: { create: invoiceItems },
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        salesOrder: true,
      },
    });

    await tx.salesOrder.update({
      where: { id: order.id },
      data: { status: OrderStatus.INVOICED },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'GENERATE_GST_INVOICE',
      entityType: 'Invoice',
      entityId: invoice.id,
      entityLabel: invoice.invoiceNumber,
      afterState: {
        invoiceNumber: invoice.invoiceNumber,
        isInterState,
        taxableAmountPaisa: Number(taxableAmountPaisa),
        cgstPaisa: Number(cgstPaisa),
        sgstPaisa: Number(sgstPaisa),
        igstPaisa: Number(igstPaisa),
        totalAmountPaisa: Number(totalAmountPaisa),
      },
    });

    return invoice;
  });
}

export async function dispatchSalesOrder(params: {
  orderId: string;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: params.orderId },
      include: {
        items: { include: { product: true } },
        invoice: true,
        customer: true,
      },
    });
    if (!order) throw new AppError('Sales order not found', 404);
    if (order.status === OrderStatus.DISPATCHED) {
      throw new AppError('Order is already dispatched', 400);
    }
    if (order.status !== OrderStatus.INVOICED && order.status !== OrderStatus.APPROVED) {
      throw new AppError(
        `Order must be APPROVED or INVOICED before dispatch (current status: ${order.status})`,
        400,
      );
    }

    for (const item of order.items) {
      await dispatchFinishedGoodsTx(tx, {
        productId: item.productId,
        quantityPackets: item.quantityPackets,
        sourceDocType: order.invoice ? 'Invoice' : 'SalesOrder',
        sourceDocId: order.invoice ? order.invoice.id : order.id,
        sourceDocNumber: order.invoice ? order.invoice.invoiceNumber : order.orderNumber,
        notes: `Dispatched to ${order.customer.name}`,
        userId: params.adminId,
      });
    }

    const updated = await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DISPATCHED,
        dispatchedById: params.adminId,
        dispatchedAt: new Date(),
      },
      include: {
        customer: true,
        invoice: true,
        items: { include: { product: true } },
      },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'DISPATCH_SALES_ORDER',
      entityType: 'SalesOrder',
      entityId: order.id,
      entityLabel: order.orderNumber,
      afterState: { status: OrderStatus.DISPATCHED },
    });

    return updated;
  });
}

export async function cancelInvoiceWithCreditNote(params: {
  invoiceId: string;
  reason: string;
  adminId: string;
  userRole?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: params.invoiceId },
      include: { allocations: true },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new AppError('Invoice is already cancelled', 400);
    }
    if (invoice.paidAmountPaisa > 0n) {
      throw new AppError(
        'Cannot cancel an invoice that already has allocated payments',
        400,
      );
    }

    const cancelledCount = await tx.invoice.count({
      where: { financialYear: invoice.financialYear, status: InvoiceStatus.CANCELLED },
    });
    const creditNoteNumber = `CN/${invoice.financialYear}/${String(cancelledCount + 1).padStart(4, '0')}`;

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: params.reason,
        creditNoteNumber,
      },
    });

    await recordAuditLog(tx, {
      userId: params.adminId,
      userRole: params.userRole,
      action: 'CANCEL_INVOICE_CREDIT_NOTE',
      entityType: 'Invoice',
      entityId: invoice.id,
      entityLabel: invoice.invoiceNumber,
      beforeState: { status: InvoiceStatus.POSTED },
      afterState: {
        status: InvoiceStatus.CANCELLED,
        creditNoteNumber,
        reason: params.reason,
      },
    });

    return updated;
  });
}
