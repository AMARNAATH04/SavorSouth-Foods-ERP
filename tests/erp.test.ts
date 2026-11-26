import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedOpeningBaseline } from '../prisma/seed.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { calculateGstLine } from '../src/utils/gst.js';
import { convertBetweenUnits, fromBaseQuantity, toBaseQuantity } from '../src/utils/units.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../.pgdata');

function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, host);
  });
}

describe('SavorSouth ERP — Unit Logic, RBAC, and Mandatory NIT Benchmark Scenario', () => {
  let embeddedPg: EmbeddedPostgres | null = null;
  const app = createApp();

  beforeAll(async () => {
    if (!(await isPortOpen(5432))) {
      embeddedPg = new EmbeddedPostgres({
        databaseDir: DATA_DIR,
        user: 'postgres',
        password: 'postgres',
        port: 5432,
        persistent: true,
      });
      if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
        await embeddedPg.initialise();
      }
      await embeddedPg.start();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (embeddedPg) {
      await embeddedPg.stop();
    }
  });

  describe('1. Unit Conversion & GST Math Unit Tests', () => {
    it('converts between kg, grams, litres, ml, pieces, packets, and cartons accurately', () => {
      expect(convertBetweenUnits(40, 'kg', 'grams')).toBe(40000);
      expect(convertBetweenUnits(1200, 'grams', 'kg')).toBe(1.2);
      expect(convertBetweenUnits(10.5, 'litres', 'ml')).toBe(10500);
      expect(convertBetweenUnits(500, 'ml', 'litres')).toBe(0.5);
      expect(convertBetweenUnits(3, 'cartons', 'packets', 20)).toBe(60);
      expect(convertBetweenUnits(100, 'packets', 'cartons', 20)).toBe(5);
      expect(toBaseQuantity(1.2, 'kg')).toBe(1200);
      expect(fromBaseQuantity(19500, 'litres')).toBe(19.5);
    });

    it('calculates intra-state CGST+SGST (Tamil Nadu 33) and inter-state IGST (Karnataka 29) in integer paisa', () => {
      // 150 packets * ₹50 = ₹7,500 (750000 paisa) at 5% (500 bps)
      const intra = calculateGstLine(750000, 500, '33', '33');
      expect(intra.isInterState).toBe(false);
      expect(intra.cgstPaisa).toBe(18750); // ₹187.50
      expect(intra.sgstPaisa).toBe(18750); // ₹187.50
      expect(intra.igstPaisa).toBe(0);
      expect(intra.totalAmountPaisa).toBe(787500); // ₹7,875.00

      const inter = calculateGstLine(750000, 500, '29', '33');
      expect(inter.isInterState).toBe(true);
      expect(inter.cgstPaisa).toBe(0);
      expect(inter.sgstPaisa).toBe(0);
      expect(inter.igstPaisa).toBe(37500); // ₹375.00
      expect(inter.totalAmountPaisa).toBe(787500);
    });
  });

  describe('2. Full Mandatory NIT Benchmark Scenario via API', () => {
    let tokens: Record<string, string> = {};
    let baseline: Awaited<ReturnType<typeof seedOpeningBaseline>>;

    beforeAll(async () => {
      baseline = await seedOpeningBaseline();

      const loginAs = async (email: string) => {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'Password@123' });
        expect(res.status).toBe(200);
        return res.body.token as string;
      };

      tokens = {
        owner: await loginAs('owner@savorsouthfoods.in'),
        admin: await loginAs('admin@savorsouthfoods.in'),
        supervisor: await loginAs('supervisor@savorsouthfoods.in'),
        salesmanA: await loginAs('salesman.a@savorsouthfoods.in'),
        salesmanB: await loginAs('salesman.b@savorsouthfoods.in'),
        auditor: await loginAs('auditor@savorsouthfoods.in'),
      };
    });

    it('enforces backend RBAC (Accountant is read-only; Salesman cannot approve orders)', async () => {
      const auditorWriteRes = await request(app)
        .post('/api/inventory/purchases')
        .set('Authorization', `Bearer ${tokens.auditor}`)
        .send({});
      expect(auditorWriteRes.status).toBe(403);

      const salesmanProdRes = await request(app)
        .post('/api/production/runs')
        .set('Authorization', `Bearer ${tokens.salesmanA}`)
        .send({});
      expect(salesmanProdRes.status).toBe(403);
    });

    it('executes steps 1–15 and reproduces every exact NIT benchmark expectation', async () => {
      // Step 1: Record purchase of 60 kg flour at ₹45/kg
      const purchaseRes = await request(app)
        .post('/api/inventory/purchases')
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          supplierId: baseline.suppliers.flourSupplier.id,
          supplierBillNo: 'NIT-PO-001',
          items: [
            {
              itemType: 'RAW_MATERIAL',
              materialId: baseline.materials.flour.id,
              quantity: 60,
              unit: 'kg',
              ratePaisa: 4500,
            },
          ],
        });
      expect(purchaseRes.status).toBe(201);

      // Step 2: Start one Murukku production run
      const createRunRes = await request(app)
        .post('/api/production/runs')
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          bomId: baseline.boms.murukkuBom.id,
          batchSize: 1,
          notes: 'Benchmark Murukku Run',
        });
      expect(createRunRes.status).toBe(201);
      const runId = createRunRes.body.id as string;

      // Steps 3, 4, 5: Issue 40 kg flour, 10.5 litres oil, 1.2 kg spice mix
      const issueRes = await request(app)
        .post(`/api/production/runs/${runId}/issue-materials`)
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          issues: [
            {
              itemType: 'RAW_MATERIAL',
              materialId: baseline.materials.flour.id,
              quantity: 40,
              unit: 'kg',
            },
            {
              itemType: 'RAW_MATERIAL',
              materialId: baseline.materials.oil.id,
              quantity: 10.5,
              unit: 'litres',
            },
            {
              itemType: 'RAW_MATERIAL',
              materialId: baseline.materials.spiceMix.id,
              quantity: 1.2,
              unit: 'kg',
            },
          ],
        });
      expect(issueRes.status).toBe(200);

      // Verify oil consumption variance = +5%
      const oilIssue = issueRes.body.materialIssues.find(
        (m: any) => m.rawMaterialId === baseline.materials.oil.id,
      );
      expect(oilIssue.variancePct).toBe(5);
      expect(oilIssue.alertTriggered).toBe(true);

      // Steps 6, 7, 8: Record 188 good packets, 6 damaged pouches, 9 cartons used
      const completeRes = await request(app)
        .post(`/api/production/runs/${runId}/complete`)
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          actualGoodPackets: 188,
          damagedPacketsCount: 6,
          wastageKg: 1.4,
          packagingUsages: [
            {
              packagingMaterialId: baseline.materials.pouch200.id,
              usedQuantity: 188,
              damagedQuantity: 6,
              unit: 'pieces',
            },
            {
              packagingMaterialId: baseline.materials.carton.id,
              usedQuantity: 9,
              damagedQuantity: 0,
              unit: 'pieces',
            },
          ],
        });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.yieldVariancePct).toBe(-6);
      expect(completeRes.body.yieldAlertTriggered).toBe(true);

      // Step 14: Add ₹1,200 labour and ₹600 gas/power
      const labourRes = await request(app)
        .post(`/api/production/runs/${runId}/expenses`)
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          category: 'LABOUR',
          description: 'Batch labour',
          amountPaisa: 120000,
        });
      expect(labourRes.status).toBe(201);

      const gasRes = await request(app)
        .post(`/api/production/runs/${runId}/expenses`)
        .set('Authorization', `Bearer ${tokens.supervisor}`)
        .send({
          category: 'GAS_ELECTRICITY',
          description: 'Gas & power',
          amountPaisa: 60000,
        });
      expect(gasRes.status).toBe(201);

      // Verify Costing:
      // Flour 40kg @ ₹43.125 = ₹1,725 (172500)
      // Oil 10.5L @ ₹140 = ₹1,470 (147000)
      // Spice 1.2kg @ ₹200 = ₹240 (24000)
      // Total RM = 343500
      // Pouches 194 * ₹2.50 = ₹485 (48500); Cartons 9 * ₹15 = ₹135 (13500) => Pkg = 62000
      // Labour = 120000; Gas = 60000
      // Total cost = 585500 paisa (₹5,855.00), Cost per packet = round(585500 / 188) = 3114 paisa (₹31.14)
      expect(gasRes.body.run.rawMaterialCostPaisa).toBe(343500);
      expect(gasRes.body.run.packagingCostPaisa).toBe(62000);
      expect(gasRes.body.run.totalCostPaisa).toBe(585500);
      expect(gasRes.body.run.costPerPacketPaisa).toBe(3114);

      // Verify material closing balances & finished goods after production
      const matsAfterProd = await request(app)
        .get('/api/inventory/materials')
        .set('Authorization', `Bearer ${tokens.owner}`);
      const flourMat = matsAfterProd.body.rawMaterials.find(
        (m: any) => m.id === baseline.materials.flour.id,
      );
      const oilMat = matsAfterProd.body.rawMaterials.find(
        (m: any) => m.id === baseline.materials.oil.id,
      );
      const pouchMat = matsAfterProd.body.packagingMaterials.find(
        (m: any) => m.id === baseline.materials.pouch200.id,
      );
      expect(flourMat.currentQtyDisplay).toBe(120);
      expect(oilMat.currentQtyDisplay).toBe(19.5);
      expect(pouchMat.currentQtyDisplay).toBe(306);

      const prodsAfterProd = await request(app)
        .get('/api/master/products')
        .set('Authorization', `Bearer ${tokens.owner}`);
      const murukkuAfterProd = prodsAfterProd.body.find(
        (p: any) => p.id === baseline.products.murukku.id,
      );
      expect(murukkuAfterProd.currentStockPackets).toBe(238);

      // Step 9: Salesman A places order for Retailer A (Tamil Nadu): 150 packets
      const orderARes = await request(app)
        .post('/api/sales/orders')
        .set('Authorization', `Bearer ${tokens.salesmanA}`)
        .send({
          customerId: baseline.customers.retailerA.id,
          items: [{ productId: baseline.products.murukku.id, quantityPackets: 150 }],
        });
      expect(orderARes.status).toBe(201);
      const orderAId = orderARes.body.id as string;

      // Step 10: Admin approves, generates GST invoice, and dispatches
      const approveARes = await request(app)
        .post(`/api/sales/orders/${orderAId}/approve`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(approveARes.status).toBe(200);

      const invoiceARes = await request(app)
        .post(`/api/sales/orders/${orderAId}/invoice`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(invoiceARes.status).toBe(201);
      expect(invoiceARes.body.isInterState).toBe(false);
      expect(invoiceARes.body.taxableAmountPaisa).toBe(750000); // ₹7,500
      expect(invoiceARes.body.cgstPaisa).toBe(18750); // ₹187.50
      expect(invoiceARes.body.sgstPaisa).toBe(18750); // ₹187.50
      expect(invoiceARes.body.igstPaisa).toBe(0);
      expect(invoiceARes.body.totalAmountPaisa).toBe(787500); // ₹7,875

      const dispatchARes = await request(app)
        .post(`/api/sales/orders/${orderAId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(dispatchARes.status).toBe(200);

      // Finished goods after Retailer A dispatch: 88 packets
      const prodsAfterDispatch = await request(app)
        .get('/api/master/products')
        .set('Authorization', `Bearer ${tokens.owner}`);
      const murukkuAfterDispatch = prodsAfterDispatch.body.find(
        (p: any) => p.id === baseline.products.murukku.id,
      );
      expect(murukkuAfterDispatch.currentStockPackets).toBe(88);

      // Step 11 & 12: Salesman B places order for Distributor B (Karnataka): 120 packets -> Insufficient stock (shortage = 32)
      const orderBRes = await request(app)
        .post('/api/sales/orders')
        .set('Authorization', `Bearer ${tokens.salesmanB}`)
        .send({
          customerId: baseline.customers.distributorB.id,
          items: [{ productId: baseline.products.murukku.id, quantityPackets: 120 }],
        });
      expect(orderBRes.status).toBe(201);
      expect(orderBRes.body.hasStockShortage).toBe(true);

      // Admin approval must reject with 409 and exact shortage = 32 packets
      const approveBRes = await request(app)
        .post(`/api/sales/orders/${orderBRes.body.id}/approve`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(approveBRes.status).toBe(409);
      expect(approveBRes.body.details.items[0].available).toBe(88);
      expect(approveBRes.body.details.items[0].requested).toBe(120);
      expect(approveBRes.body.details.items[0].shortage).toBe(32);

      // Step 13: Record ₹4,000 payment from Retailer A
      const payRes = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          customerId: baseline.customers.retailerA.id,
          amountPaisa: 400000,
          paymentMode: 'UPI',
          allocations: [
            { invoiceId: invoiceARes.body.id, allocatedAmountPaisa: 400000 },
          ],
        });
      expect(payRes.status).toBe(201);

      const outstandingRes = await request(app)
        .get(`/api/payments/outstanding?customerId=${baseline.customers.retailerA.id}`)
        .set('Authorization', `Bearer ${tokens.auditor}`);
      expect(outstandingRes.status).toBe(200);
      expect(outstandingRes.body[0].outstandingPaisa).toBe(387500); // ₹3,875

      // Step 15: Verify monthly reports & Excel export
      const gstReportRes = await request(app)
        .get('/api/reports/gst_summary')
        .set('Authorization', `Bearer ${tokens.auditor}`);
      expect(gstReportRes.status).toBe(200);
      expect(gstReportRes.body.rows.length).toBeGreaterThan(0);

      const excelRes = await request(app)
        .get('/api/reports/sales_register?format=xlsx')
        .set('Authorization', `Bearer ${tokens.auditor}`);
      expect(excelRes.status).toBe(200);
      expect(excelRes.headers['content-type']).toContain('spreadsheetml');
    });
  });
});
