import { InvoiceStatus, OrderStatus, ProductionStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { prisma } from '../db.js';
import { paisaToRupees } from '../utils/money.js';
import { fromBaseQuantity, weightedAvgRatePerDisplayUnitPaisa } from '../utils/units.js';
import { getCustomerOutstandingSummary } from './paymentService.js';

export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

function buildDateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

export async function getDashboardOverview() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    invoices,
    orders,
    products,
    rawMaterials,
    packagingMaterials,
    productionRuns,
    materialIssues,
    payments,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: InvoiceStatus.POSTED },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { invoiceDate: 'asc' },
    }),
    prisma.salesOrder.findMany({
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { orderDate: 'desc' },
    }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.rawMaterial.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.packagingMaterial.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.productionRun.findMany({
      include: { product: true },
      orderBy: { productionDate: 'desc' },
    }),
    prisma.materialIssue.findMany({
      where: { alertTriggered: true },
      include: {
        productionRun: { include: { product: true } },
        rawMaterial: true,
        packagingMaterial: true,
      },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.payment.findMany({ orderBy: { paymentDate: 'asc' } }),
  ]);

  const totalSalesPaisa = invoices.reduce((s, inv) => s + Number(inv.totalAmountPaisa), 0);
  const monthlyRevenuePaisa = invoices
    .filter((inv) => inv.invoiceDate >= startOfMonth)
    .reduce((s, inv) => s + Number(inv.totalAmountPaisa), 0);
  const totalCollectedPaisa = invoices.reduce((s, inv) => s + Number(inv.paidAmountPaisa), 0);
  const outstandingPaisa = Math.max(0, totalSalesPaisa - totalCollectedPaisa);

  const todaysOrdersCount = orders.filter((o) => o.orderDate >= startOfDay).length;
  const pendingOrders = orders.filter((o) =>
    [OrderStatus.SUBMITTED, OrderStatus.VERIFIED, OrderStatus.APPROVED].includes(
      o.status as typeof OrderStatus.SUBMITTED,
    ),
  );

  const finishedGoodsPackets = products.reduce((s, p) => s + p.currentStockPackets, 0);
  const finishedGoodsValuePaisa = products.reduce(
    (s, p) => s + p.currentStockPackets * Number(p.sellingPricePaisa),
    0,
  );
  const rawMaterialValuePaisa = rawMaterials.reduce((s, r) => s + Number(r.totalValuePaisa), 0);
  const packagingValuePaisa = packagingMaterials.reduce(
    (s, p) => s + Number(p.totalValuePaisa),
    0,
  );

  const lowStockAlerts = [
    ...rawMaterials
      .filter((r) => r.currentStockBase <= r.reorderLevelBase)
      .map((r) => ({
        category: 'RAW_MATERIAL',
        id: r.id,
        name: r.name,
        current: fromBaseQuantity(r.currentStockBase, r.displayUnit),
        reorderLevel: fromBaseQuantity(r.reorderLevelBase, r.displayUnit),
        unit: r.displayUnit,
      })),
    ...packagingMaterials
      .filter((p) => p.currentStockBase <= p.reorderLevelBase)
      .map((p) => ({
        category: 'PACKAGING_MATERIAL',
        id: p.id,
        name: p.name,
        current: fromBaseQuantity(p.currentStockBase, p.displayUnit),
        reorderLevel: fromBaseQuantity(p.reorderLevelBase, p.displayUnit),
        unit: p.displayUnit,
      })),
    ...products
      .filter((p) => p.currentStockPackets <= p.reorderLevelPackets)
      .map((p) => ({
        category: 'FINISHED_GOOD',
        id: p.id,
        name: p.name,
        current: p.currentStockPackets,
        reorderLevel: p.reorderLevelPackets,
        unit: 'packets',
      })),
  ];

  const wastageAlerts = [
    ...productionRuns
      .filter((r) => r.yieldAlertTriggered)
      .map((r) => ({
        type: 'YIELD_VARIANCE',
        runId: r.id,
        runNumber: r.runNumber,
        productName: r.product.name,
        variancePct: r.yieldVariancePct,
        message: `${r.runNumber} (${r.product.name}) yield variance: ${r.yieldVariancePct}%`,
      })),
    ...materialIssues.map((mi) => ({
      type: 'CONSUMPTION_VARIANCE',
      runId: mi.productionRunId,
      runNumber: mi.productionRun.runNumber,
      productName: mi.productionRun.product.name,
      variancePct: mi.variancePct,
      message: `${mi.productionRun.runNumber} ${
        mi.rawMaterial?.name ?? mi.packagingMaterial?.name ?? 'Material'
      } variance: ${mi.variancePct > 0 ? '+' : ''}${mi.variancePct}%`,
    })),
  ];

  // Category-wise sales distribution
  const categorySalesMap = new Map<string, number>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const cat = item.product.category;
      categorySalesMap.set(cat, (categorySalesMap.get(cat) ?? 0) + Number(item.totalAmountPaisa));
    }
  }

  // Monthly revenue vs collection chart series
  const monthlySeriesMap = new Map<string, { month: string; sales: number; collections: number }>();
  for (const inv of invoices) {
    const key = inv.invoiceDate.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    const entry = monthlySeriesMap.get(key) ?? { month: key, sales: 0, collections: 0 };
    entry.sales += paisaToRupees(inv.totalAmountPaisa);
    monthlySeriesMap.set(key, entry);
  }
  for (const pay of payments) {
    const key = pay.paymentDate.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    const entry = monthlySeriesMap.get(key) ?? { month: key, sales: 0, collections: 0 };
    entry.collections += paisaToRupees(pay.amountPaisa);
    monthlySeriesMap.set(key, entry);
  }

  const completedRuns = productionRuns.filter((r) => r.status === ProductionStatus.COMPLETED);
  const avgCostPerPacketPaisa =
    completedRuns.length > 0
      ? Math.round(
          completedRuns.reduce((s, r) => s + Number(r.costPerPacketPaisa), 0) /
            completedRuns.length,
        )
      : 0;

  return {
    kpis: {
      totalSalesPaisa,
      monthlyRevenuePaisa,
      totalCollectedPaisa,
      outstandingPaisa,
      todaysOrdersCount,
      pendingOrdersCount: pendingOrders.length,
      stockShortageOrdersCount: orders.filter((o) => o.hasStockShortage && o.status === OrderStatus.SUBMITTED).length,
      finishedGoodsPackets,
      finishedGoodsValuePaisa,
      rawMaterialValuePaisa,
      packagingValuePaisa,
      totalRunsCount: productionRuns.length,
      activeRunsCount: productionRuns.filter((r) => r.status === ProductionStatus.IN_PROGRESS).length,
      completedRunsCount: completedRuns.length,
      avgCostPerPacketPaisa,
      wastageAlertsCount: wastageAlerts.length,
      lowStockAlertsCount: lowStockAlerts.length,
    },
    charts: {
      salesVsCollections: Array.from(monthlySeriesMap.values()),
      categorySales: Array.from(categorySalesMap.entries()).map(([category, amountPaisa]) => ({
        category,
        amountRupees: paisaToRupees(amountPaisa),
      })),
      productionCostBreakdown: completedRuns.slice(0, 6).map((r) => ({
        runNumber: r.runNumber,
        product: r.product.name,
        rawMaterial: paisaToRupees(r.rawMaterialCostPaisa),
        packaging: paisaToRupees(r.packagingCostPaisa),
        labour: paisaToRupees(r.labourCostPaisa),
        gasPower: paisaToRupees(r.gasPowerCostPaisa),
        costPerPacket: paisaToRupees(r.costPerPacketPaisa),
      })),
    },
    alerts: {
      wastageAlerts,
      lowStockAlerts,
    },
    recentOrders: orders.slice(0, 6),
    recentRuns: productionRuns.slice(0, 6),
  };
}

export async function generateReportData(reportType: string, filter: DateRangeFilter) {
  const dateWhere = buildDateRange(filter.from, filter.to);

  switch (reportType) {
    case 'sales_register': {
      const invoices = await prisma.invoice.findMany({
        where: dateWhere ? { invoiceDate: dateWhere } : undefined,
        include: { customer: true, salesOrder: true },
        orderBy: { invoiceDate: 'desc' },
      });
      return {
        title: 'Sales Register',
        columns: [
          'Invoice No',
          'Date',
          'Order No',
          'Customer',
          'State',
          'Status',
          'Taxable (INR)',
          'CGST (INR)',
          'SGST (INR)',
          'IGST (INR)',
          'Total (INR)',
          'Paid (INR)',
          'Balance (INR)',
        ],
        rows: invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
          orderNumber: inv.salesOrder.orderNumber,
          customerName: inv.customer.name,
          state: `${inv.customer.state} (${inv.customer.stateCode})`,
          status: inv.status,
          taxable: paisaToRupees(inv.taxableAmountPaisa),
          cgst: paisaToRupees(inv.cgstPaisa),
          sgst: paisaToRupees(inv.sgstPaisa),
          igst: paisaToRupees(inv.igstPaisa),
          total: paisaToRupees(inv.totalAmountPaisa),
          paid: paisaToRupees(inv.paidAmountPaisa),
          balance: paisaToRupees(inv.totalAmountPaisa - inv.paidAmountPaisa),
        })),
      };
    }

    case 'customer_sales': {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.POSTED,
          ...(dateWhere ? { invoiceDate: dateWhere } : {}),
        },
        include: { customer: true },
      });
      const map = new Map<
        string,
        {
          customerName: string;
          type: string;
          state: string;
          invoiceCount: number;
          taxable: number;
          tax: number;
          total: number;
          paid: number;
          outstanding: number;
        }
      >();
      for (const inv of invoices) {
        const entry = map.get(inv.customerId) ?? {
          customerName: inv.customer.name,
          type: inv.customer.type,
          state: inv.customer.state,
          invoiceCount: 0,
          taxable: 0,
          tax: 0,
          total: 0,
          paid: 0,
          outstanding: 0,
        };
        entry.invoiceCount += 1;
        entry.taxable += paisaToRupees(inv.taxableAmountPaisa);
        entry.tax += paisaToRupees(inv.cgstPaisa + inv.sgstPaisa + inv.igstPaisa);
        entry.total += paisaToRupees(inv.totalAmountPaisa);
        entry.paid += paisaToRupees(inv.paidAmountPaisa);
        entry.outstanding += paisaToRupees(inv.totalAmountPaisa - inv.paidAmountPaisa);
        map.set(inv.customerId, entry);
      }
      return {
        title: 'Customer-Wise Sales Report',
        columns: [
          'Customer',
          'Type',
          'State',
          'Invoices',
          'Taxable (INR)',
          'GST (INR)',
          'Total Sales (INR)',
          'Collected (INR)',
          'Outstanding (INR)',
        ],
        rows: Array.from(map.values()),
      };
    }

    case 'product_sales': {
      const items = await prisma.invoiceItem.findMany({
        where: {
          invoice: {
            status: InvoiceStatus.POSTED,
            ...(dateWhere ? { invoiceDate: dateWhere } : {}),
          },
        },
        include: { product: true },
      });
      const map = new Map<
        string,
        {
          sku: string;
          productName: string;
          category: string;
          packetsSold: number;
          taxable: number;
          gst: number;
          total: number;
        }
      >();
      for (const it of items) {
        const entry = map.get(it.productId) ?? {
          sku: it.product.sku,
          productName: it.productName,
          category: it.product.category,
          packetsSold: 0,
          taxable: 0,
          gst: 0,
          total: 0,
        };
        entry.packetsSold += it.quantityPackets;
        entry.taxable += paisaToRupees(it.taxableAmountPaisa);
        entry.gst += paisaToRupees(it.cgstPaisa + it.sgstPaisa + it.igstPaisa);
        entry.total += paisaToRupees(it.totalAmountPaisa);
        map.set(it.productId, entry);
      }
      return {
        title: 'Product-Wise Sales Report',
        columns: [
          'SKU',
          'Product',
          'Category',
          'Packets Sold',
          'Taxable (INR)',
          'GST (INR)',
          'Total Revenue (INR)',
        ],
        rows: Array.from(map.values()),
      };
    }

    case 'gst_summary': {
      const invoices = await prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.POSTED,
          ...(dateWhere ? { invoiceDate: dateWhere } : {}),
        },
        include: { items: true },
      });
      const map = new Map<
        string,
        {
          supplyType: string;
          hsnCode: string;
          gstRatePct: number;
          taxable: number;
          cgst: number;
          sgst: number;
          igst: number;
          totalTax: number;
          invoiceValue: number;
        }
      >();
      for (const inv of invoices) {
        const supplyType = inv.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)';
        for (const it of inv.items) {
          const key = `${supplyType}|${it.hsnCode}|${it.gstRateBps}`;
          const entry = map.get(key) ?? {
            supplyType,
            hsnCode: it.hsnCode,
            gstRatePct: it.gstRateBps / 100,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            totalTax: 0,
            invoiceValue: 0,
          };
          entry.taxable += paisaToRupees(it.taxableAmountPaisa);
          entry.cgst += paisaToRupees(it.cgstPaisa);
          entry.sgst += paisaToRupees(it.sgstPaisa);
          entry.igst += paisaToRupees(it.igstPaisa);
          entry.totalTax += paisaToRupees(it.cgstPaisa + it.sgstPaisa + it.igstPaisa);
          entry.invoiceValue += paisaToRupees(it.totalAmountPaisa);
          map.set(key, entry);
        }
      }
      return {
        title: 'GST Outward Supply Summary (GSTR-1 Style)',
        columns: [
          'Supply Type',
          'HSN Code',
          'GST %',
          'Taxable Value (INR)',
          'CGST (INR)',
          'SGST (INR)',
          'IGST (INR)',
          'Total Tax (INR)',
          'Total Value (INR)',
        ],
        rows: Array.from(map.values()),
      };
    }

    case 'purchase_register': {
      const purchases = await prisma.purchase.findMany({
        where: dateWhere ? { purchaseDate: dateWhere } : undefined,
        include: { supplier: true, items: { include: { rawMaterial: true, packagingMaterial: true } } },
        orderBy: { purchaseDate: 'desc' },
      });
      return {
        title: 'Purchase Register',
        columns: [
          'Purchase No',
          'Date',
          'Supplier',
          'Bill No',
          'Items Summary',
          'Subtotal (INR)',
          'GST (INR)',
          'Total (INR)',
        ],
        rows: purchases.map((p) => ({
          purchaseNumber: p.purchaseNumber,
          purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
          supplierName: p.supplier.name,
          billNo: p.supplierBillNo ?? '-',
          itemsSummary: p.items
            .map(
              (i) =>
                `${i.rawMaterial?.name ?? i.packagingMaterial?.name} (${i.quantity} ${i.unit})`,
            )
            .join(', '),
          subtotal: paisaToRupees(p.subtotalPaisa),
          gst: paisaToRupees(p.gstPaisa),
          total: paisaToRupees(p.totalAmountPaisa),
        })),
      };
    }

    case 'raw_material_stock': {
      const [raws, pkgs] = await Promise.all([
        prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } }),
        prisma.packagingMaterial.findMany({ orderBy: { name: 'asc' } }),
      ]);
      const rows = [
        ...raws.map((r) => ({
          category: 'Raw Material',
          code: r.code,
          name: r.name,
          unit: r.displayUnit,
          openingQty: fromBaseQuantity(r.openingStockBase, r.displayUnit),
          closingQty: fromBaseQuantity(r.currentStockBase, r.displayUnit),
          weightedAvgRate: paisaToRupees(
            weightedAvgRatePerDisplayUnitPaisa(r.totalValuePaisa, r.currentStockBase, r.displayUnit),
          ),
          stockValue: paisaToRupees(r.totalValuePaisa),
          status: r.currentStockBase <= r.reorderLevelBase ? 'LOW STOCK' : 'OK',
        })),
        ...pkgs.map((p) => ({
          category: 'Packaging',
          code: p.code,
          name: p.name,
          unit: p.displayUnit,
          openingQty: fromBaseQuantity(p.openingStockBase, p.displayUnit),
          closingQty: fromBaseQuantity(p.currentStockBase, p.displayUnit),
          weightedAvgRate: paisaToRupees(
            weightedAvgRatePerDisplayUnitPaisa(p.totalValuePaisa, p.currentStockBase, p.displayUnit),
          ),
          stockValue: paisaToRupees(p.totalValuePaisa),
          status: p.currentStockBase <= p.reorderLevelBase ? 'LOW STOCK' : 'OK',
        })),
      ];
      return {
        title: 'Raw Material & Packaging Stock Report',
        columns: [
          'Category',
          'Code',
          'Material Name',
          'Unit',
          'Opening Qty',
          'Closing Qty',
          'Weighted Avg Rate (INR)',
          'Stock Value (INR)',
          'Status',
        ],
        rows,
      };
    }

    case 'finished_goods_stock': {
      const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
      return {
        title: 'Finished Goods Stock Report',
        columns: [
          'SKU',
          'Product',
          'Category',
          'Pack Size',
          'Opening (Pkts)',
          'Closing (Pkts)',
          'Selling Price (INR)',
          'Stock Value (INR)',
          'Status',
        ],
        rows: products.map((p) => ({
          sku: p.sku,
          name: p.name,
          category: p.category,
          packLabel: p.packLabel,
          opening: p.openingStockPackets,
          closing: p.currentStockPackets,
          sellingPrice: paisaToRupees(p.sellingPricePaisa),
          stockValue: paisaToRupees(BigInt(p.currentStockPackets) * p.sellingPricePaisa),
          status: p.currentStockPackets <= p.reorderLevelPackets ? 'LOW STOCK' : 'OK',
        })),
      };
    }

    case 'stock_ledger': {
      const movements = await prisma.stockMovement.findMany({
        where: dateWhere ? { createdAt: dateWhere } : undefined,
        include: { rawMaterial: true, packagingMaterial: true, product: true },
        orderBy: { createdAt: 'desc' },
        take: 250,
      });
      return {
        title: 'Stock Movement Ledger (Immutable)',
        columns: [
          'Movement No',
          'Timestamp',
          'Category',
          'Item',
          'Type',
          'Dir',
          'Qty',
          'Unit',
          'Balance After',
          'Value (INR)',
          'Source Doc',
        ],
        rows: movements.map((m) => {
          const itemName =
            m.rawMaterial?.name ?? m.packagingMaterial?.name ?? m.product?.name ?? '-';
          const qty =
            m.itemCategory === 'FINISHED_GOOD'
              ? Number(m.quantityBase)
              : fromBaseQuantity(m.quantityBase, m.unitLabel);
          const bal =
            m.itemCategory === 'FINISHED_GOOD'
              ? Number(m.balanceAfterBase)
              : fromBaseQuantity(m.balanceAfterBase, m.unitLabel);
          return {
            movementNumber: m.movementNumber,
            timestamp: m.createdAt.toISOString().slice(0, 16).replace('T', ' '),
            category: m.itemCategory,
            itemName,
            movementType: m.movementType,
            direction: m.direction,
            qty,
            unit: m.unitLabel,
            balanceAfter: bal,
            value: paisaToRupees(m.totalValuePaisa),
            sourceDoc: `${m.sourceDocType} (${m.sourceDocNumber})`,
          };
        }),
      };
    }

    case 'production_report': {
      const runs = await prisma.productionRun.findMany({
        where: dateWhere ? { productionDate: dateWhere } : undefined,
        include: { product: true, supervisor: true },
        orderBy: { productionDate: 'desc' },
      });
      return {
        title: 'Production Run Summary Report',
        columns: [
          'Run No',
          'Batch No',
          'Date',
          'Product',
          'Supervisor',
          'Status',
          'Expected (Pkts)',
          'Good Output (Pkts)',
          'Yield Variance %',
          'Total Cost (INR)',
          'Cost / Pkt (INR)',
        ],
        rows: runs.map((r) => ({
          runNumber: r.runNumber,
          batchNumber: r.batchNumber,
          date: r.productionDate.toISOString().slice(0, 10),
          product: r.product.name,
          supervisor: r.supervisor.name,
          status: r.status,
          expected: r.expectedOutputPackets,
          actual: r.actualGoodPackets,
          yieldVariancePct: r.yieldVariancePct,
          totalCost: paisaToRupees(r.totalCostPaisa),
          costPerPacket: paisaToRupees(r.costPerPacketPaisa),
        })),
      };
    }

    case 'consumption_variance': {
      const issues = await prisma.materialIssue.findMany({
        where: dateWhere ? { issuedAt: dateWhere } : undefined,
        include: {
          productionRun: { include: { product: true } },
          rawMaterial: true,
          packagingMaterial: true,
        },
        orderBy: { issuedAt: 'desc' },
      });
      return {
        title: 'Planned vs Actual Material Consumption Report',
        columns: [
          'Run No',
          'Product',
          'Material',
          'Unit',
          'Planned Qty',
          'Actual Issued',
          'Damaged Qty',
          'Variance %',
          'Alert',
          'Cost (INR)',
        ],
        rows: issues.map((mi) => ({
          runNumber: mi.productionRun.runNumber,
          product: mi.productionRun.product.name,
          material: mi.rawMaterial?.name ?? mi.packagingMaterial?.name ?? '-',
          unit: mi.unit,
          planned: mi.displayPlannedQty,
          issued: mi.displayIssuedQty,
          damaged: mi.displayDamagedQty,
          variancePct: mi.variancePct,
          alert: mi.alertTriggered ? 'EXCEEDED TOLERANCE' : 'OK',
          cost: paisaToRupees(mi.totalCostPaisa),
        })),
      };
    }

    case 'wastage_report': {
      const runs = await prisma.productionRun.findMany({
        where: dateWhere ? { productionDate: dateWhere } : undefined,
        include: { product: true, materialIssues: { include: { packagingMaterial: true } } },
        orderBy: { productionDate: 'desc' },
      });
      return {
        title: 'Production Wastage & Damaged Packaging Report',
        columns: [
          'Run No',
          'Date',
          'Product',
          'Expected (Pkts)',
          'Good Output (Pkts)',
          'Shortfall (Pkts)',
          'Yield Variance %',
          'Damaged Pouches/Pkg',
          'Process Wastage (kg)',
          'Alert',
        ],
        rows: runs.map((r) => {
          const damagedPkg = r.materialIssues.reduce((s, mi) => s + mi.displayDamagedQty, 0);
          const shortfall = Math.max(0, r.expectedOutputPackets - r.actualGoodPackets);
          return {
            runNumber: r.runNumber,
            date: r.productionDate.toISOString().slice(0, 10),
            product: r.product.name,
            expected: r.expectedOutputPackets,
            good: r.actualGoodPackets,
            shortfall,
            yieldVariancePct: r.yieldVariancePct,
            damagedPkg,
            wastageKg: r.wastageKg,
            alert: r.yieldAlertTriggered ? 'ALERT' : 'NORMAL',
          };
        }),
      };
    }

    case 'costing_report': {
      const runs = await prisma.productionRun.findMany({
        where: {
          status: ProductionStatus.COMPLETED,
          ...(dateWhere ? { productionDate: dateWhere } : {}),
        },
        include: { product: true },
        orderBy: { productionDate: 'desc' },
      });
      return {
        title: 'Batch Costing & Profitability Report',
        columns: [
          'Run No',
          'Product',
          'Good Output',
          'Raw Material (INR)',
          'Packaging (INR)',
          'Labour (INR)',
          'Gas & Power (INR)',
          'Total Cost (INR)',
          'Cost/Packet (INR)',
          'Selling Price (INR)',
          'Gross Margin %',
        ],
        rows: runs.map((r) => {
          const cpp = paisaToRupees(r.costPerPacketPaisa);
          const sp = paisaToRupees(r.product.sellingPricePaisa);
          const margin = sp > 0 ? Number((((sp - cpp) / sp) * 100).toFixed(2)) : 0;
          return {
            runNumber: r.runNumber,
            product: r.product.name,
            goodOutput: r.actualGoodPackets,
            rawMaterial: paisaToRupees(r.rawMaterialCostPaisa),
            packaging: paisaToRupees(r.packagingCostPaisa),
            labour: paisaToRupees(r.labourCostPaisa),
            gasPower: paisaToRupees(r.gasPowerCostPaisa),
            totalCost: paisaToRupees(r.totalCostPaisa),
            costPerPacket: cpp,
            sellingPrice: sp,
            marginPct: margin,
          };
        }),
      };
    }

    case 'payment_report': {
      const payments = await prisma.payment.findMany({
        where: dateWhere ? { paymentDate: dateWhere } : undefined,
        include: {
          customer: true,
          allocations: { include: { invoice: true } },
        },
        orderBy: { paymentDate: 'desc' },
      });
      return {
        title: 'Payment & Collection Report',
        columns: [
          'Payment No',
          'Date',
          'Customer',
          'Mode',
          'Reference',
          'Amount (INR)',
          'Allocated Invoices',
        ],
        rows: payments.map((p) => ({
          paymentNumber: p.paymentNumber,
          date: p.paymentDate.toISOString().slice(0, 10),
          customer: p.customer.name,
          mode: p.paymentMode,
          reference: p.referenceNumber ?? '-',
          amount: paisaToRupees(p.amountPaisa),
          invoices: p.allocations
            .map(
              (a) =>
                `${a.invoice.invoiceNumber} (₹${paisaToRupees(a.allocatedAmountPaisa).toFixed(2)})`,
            )
            .join(', '),
        })),
      };
    }

    case 'outstanding_ageing': {
      const summary = await getCustomerOutstandingSummary();
      return {
        title: 'Customer Outstanding & Ageing Report',
        columns: [
          'Customer',
          'Type',
          'State',
          'Total Invoiced (INR)',
          'Collected (INR)',
          'Outstanding (INR)',
          '0-30 Days (INR)',
          '31-60 Days (INR)',
          '61-90 Days (INR)',
          '90+ Days (INR)',
        ],
        rows: summary.map((s) => ({
          customerName: s.customerName,
          type: s.type,
          state: s.state,
          invoiced: paisaToRupees(s.totalInvoicedPaisa),
          collected: paisaToRupees(s.totalPaidPaisa),
          outstanding: paisaToRupees(s.outstandingPaisa),
          b0to30: paisaToRupees(s.bucket0to30Paisa),
          b31to60: paisaToRupees(s.bucket31to60Paisa),
          b61to90: paisaToRupees(s.bucket61to90Paisa),
          b90plus: paisaToRupees(s.bucket90PlusPaisa),
        })),
      };
    }

    default:
      throw new Error(`Unsupported report type: ${reportType}`);
  }
}

export async function exportReportToExcel(
  title: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SavorSouth Foods ERP';
  const ws = wb.addWorksheet(title.slice(0, 31));

  ws.addRow([`SavorSouth Foods — ${title}`]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.addRow([`Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`]);
  ws.addRow([]);

  const headerRow = ws.addRow(columns);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF183D32' },
    };
  });

  for (const r of rows) {
    ws.addRow(Object.values(r));
  }

  ws.columns.forEach((col) => {
    col.width = 18;
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function exportReportToCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const escape = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((r) => Object.values(r).map(escape).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function exportReportToPdf(
  title: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.setTextColor(24, 61, 50);
  doc.text(`SavorSouth Foods ERP — ${title}`, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated on ${new Date().toLocaleString('en-IN')}`, 40, 56);

  const runAutoTable: any = (autoTable as any).default ?? autoTable;
  runAutoTable(doc, {
    startY: 70,
    head: [columns],
    body: rows.map((r) => Object.values(r).map((v) => String(v ?? ''))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [24, 61, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [255, 248, 237] },
  });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
