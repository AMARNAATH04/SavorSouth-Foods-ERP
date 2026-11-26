import bcrypt from 'bcryptjs';
import {
  BaseUnit,
  BomItemType,
  BomUsageMode,
  CustomerType,
  ExpenseCategory,
  PaymentMode,
  PriceCategory,
  RoleCode,
  StockDirection,
  StockItemCategory,
  StockMovementType,
} from '@prisma/client';
import { prisma } from '../src/db.js';
import { recordPurchase } from '../src/services/purchaseService.js';
import {
  addProductionExpense,
  completeProductionRun,
  createProductionRun,
  issueMaterialsToRun,
} from '../src/services/productionService.js';
import {
  approveSalesOrder,
  createSalesOrder,
  dispatchSalesOrder,
  generateGstInvoice,
} from '../src/services/salesService.js';
import { recordCustomerPayment } from '../src/services/paymentService.js';

export async function clearAllData() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.salesOrderItem.deleteMany(),
    prisma.salesOrder.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.materialIssue.deleteMany(),
    prisma.productionRun.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.bomItem.deleteMany(),
    prisma.bom.deleteMany(),
    prisma.product.deleteMany(),
    prisma.rawMaterial.deleteMany(),
    prisma.packagingMaterial.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.companySetting.deleteMany(),
  ]);
}

export async function seedOpeningBaseline() {
  await clearAllData();

  await prisma.companySetting.create({
    data: {
      id: 'default',
      companyName: 'SavorSouth Foods',
      tagline: 'Tradition in Every Bite.',
      gstin: '33AABCS1429B1Z5',
      fssaiLicense: '12423008001924',
      address: 'Plot 42, SIDCO Industrial Estate, Thuvakudi',
      city: 'Tiruchirappalli',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 431 250 4820',
      email: 'accounts@savorsouthfoods.in',
      invoicePrefix: 'SSF',
      yieldVarianceTolerancePct: 5.0,
      consumptionVarianceTolerancePct: 5.0,
      overheadAllocationRule:
        'Direct Batch Assignment: 100% of direct batch labour and gas/electricity overheads are allocated equally across actual good packets produced in that batch.',
      defaultLabourCostPerBatchPaisa: 120000n,
      defaultGasPowerCostPerBatchPaisa: 60000n,
    },
  });

  // 1. Roles
  const roleDefs: Array<{ code: RoleCode; name: string; description: string }> = [
    { code: RoleCode.OWNER, name: 'Owner / Managing Director', description: 'Full business overview, analytics, costing & approvals' },
    { code: RoleCode.FACTORY_ADMIN, name: 'Factory Admin', description: 'Order verification, GST billing, dispatch, masters & payments' },
    { code: RoleCode.PRODUCTION_SUPERVISOR, name: 'Production Supervisor', description: 'BOMs, material receipts/issues, production runs & wastage' },
    { code: RoleCode.SALESMAN, name: 'Field Salesman', description: 'Mobile-friendly customer ordering & order tracking' },
    { code: RoleCode.ACCOUNTANT, name: 'Accountant / Auditor', description: 'Read-only financial registers, GST reports, stock ledger & audit trail' },
  ];

  const roles: Record<RoleCode, string> = {} as Record<RoleCode, string>;
  for (const r of roleDefs) {
    const created = await prisma.role.create({ data: r });
    roles[r.code] = created.id;
  }

  // 2. Users (default demo password: Password@123)
  const passwordHash = await bcrypt.hash('Password@123', 10);

  const owner = await prisma.user.create({
    data: {
      name: 'Karthik Sundaram',
      email: 'owner@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11001',
      roleId: roles[RoleCode.OWNER],
    },
  });
  const admin = await prisma.user.create({
    data: {
      name: 'Meenakshi Sundaram',
      email: 'admin@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11002',
      roleId: roles[RoleCode.FACTORY_ADMIN],
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      name: 'Aravindhan R',
      email: 'supervisor@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11003',
      roleId: roles[RoleCode.PRODUCTION_SUPERVISOR],
    },
  });
  const salesmanA = await prisma.user.create({
    data: {
      name: 'Prabhu K (Salesman A)',
      email: 'salesman.a@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11004',
      roleId: roles[RoleCode.SALESMAN],
    },
  });
  const salesmanB = await prisma.user.create({
    data: {
      name: 'Senthil M (Salesman B)',
      email: 'salesman.b@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11005',
      roleId: roles[RoleCode.SALESMAN],
    },
  });
  const accountant = await prisma.user.create({
    data: {
      name: 'Lakshmi Narayanan',
      email: 'auditor@savorsouthfoods.in',
      passwordHash,
      phone: '+91 98421 11006',
      roleId: roles[RoleCode.ACCOUNTANT],
    },
  });

  // 3. Suppliers
  const flourSupplier = await prisma.supplier.create({
    data: {
      name: 'Cauvery Agro Flour Mills',
      gstin: '33AAACC4521M1Z2',
      address: '18 Rice Mill Road, Thanjavur',
      city: 'Thanjavur',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 4362 241900',
      email: 'dispatch@cauveryagro.in',
    },
  });
  await prisma.supplier.create({
    data: {
      name: 'Kongu Cold-Pressed Oils',
      gstin: '33AABCK8832L1Z8',
      address: '92 Perundurai Industrial Park, Erode',
      city: 'Erode',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 424 2291100',
      email: 'sales@konguoils.in',
    },
  });
  await prisma.supplier.create({
    data: {
      name: 'Madurai PackCraft Industries',
      gstin: '33AADCM7102P1Z9',
      address: 'Plot 7, Kappalur SIDCO, Madurai',
      city: 'Madurai',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 452 2483300',
      email: 'orders@packcraft.in',
    },
  });

  // 4. Customers
  const retailerA = await prisma.customer.create({
    data: {
      name: 'Retailer A — Annapoorna Super Mart',
      type: CustomerType.RETAILER,
      gstin: '33AAACA7821K1Z1',
      address: '104 Salai Road, Thillai Nagar',
      city: 'Tiruchirappalli',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 94431 20101',
      email: 'purchase@annapoornamart.in',
      priceCategory: PriceCategory.STANDARD,
      creditLimitPaisa: 5000000n,
      assignedSalesmanId: salesmanA.id,
    },
  });
  const distributorB = await prisma.customer.create({
    data: {
      name: 'Distributor B — Bengaluru Spice Traders',
      type: CustomerType.DISTRIBUTOR,
      gstin: '29AABCB6541D1Z4',
      address: '27 APMC Yard, Yeshwanthpur',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: '29',
      phone: '+91 98450 33221',
      email: 'orders@blrspicetraders.in',
      priceCategory: PriceCategory.DISTRIBUTOR,
      creditLimitPaisa: 15000000n,
      assignedSalesmanId: salesmanB.id,
    },
  });
  const kaveriStore = await prisma.customer.create({
    data: {
      name: 'Kaveri Departmental Stores',
      type: CustomerType.RETAILER,
      gstin: '33AADCK1190F1Z7',
      address: '52 Big Bazaar Street',
      city: 'Tiruchirappalli',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 94432 88100',
      email: 'kaveristores@gmail.com',
      priceCategory: PriceCategory.STANDARD,
      creditLimitPaisa: 3500000n,
      assignedSalesmanId: salesmanA.id,
    },
  });
  await prisma.customer.create({
    data: {
      name: 'Sri Murugan Wholesale Agency',
      type: CustomerType.DISTRIBUTOR,
      gstin: '33AABCS9901N1Z3',
      address: '14 East Masi Street',
      city: 'Madurai',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '+91 98422 77312',
      email: 'muruganagency@yahoo.in',
      priceCategory: PriceCategory.WHOLESALE,
      creditLimitPaisa: 10000000n,
      assignedSalesmanId: salesmanA.id,
    },
  });
  await prisma.customer.create({
    data: {
      name: 'Malabar Heritage Foods',
      type: CustomerType.DISTRIBUTOR,
      gstin: '32AABCM5412Q1Z6',
      address: '88 MG Road, Ernakulam',
      city: 'Kochi',
      state: 'Kerala',
      stateCode: '32',
      phone: '+91 98470 55410',
      email: 'procurement@malabarfoods.in',
      priceCategory: PriceCategory.DISTRIBUTOR,
      creditLimitPaisa: 12000000n,
      assignedSalesmanId: salesmanB.id,
    },
  });

  // 5. Raw Materials (Exact benchmark opening stock!)
  const flour = await prisma.rawMaterial.create({
    data: {
      name: 'Flour (Rice & Urad Blend)',
      code: 'RM-FLR-01',
      displayUnit: 'kg',
      baseUnit: BaseUnit.GRAM,
      reorderLevelBase: 50000n, // 50 kg
      openingStockBase: 100000n, // 100 kg
      openingRatePaisa: 4200n, // ₹42/kg
      currentStockBase: 100000n,
      totalValuePaisa: 420000n, // ₹4,200
    },
  });
  const oil = await prisma.rawMaterial.create({
    data: {
      name: 'Cooking Oil (Refined Groundnut)',
      code: 'RM-OIL-01',
      displayUnit: 'litres',
      baseUnit: BaseUnit.ML,
      reorderLevelBase: 15000n, // 15 L
      openingStockBase: 30000n, // 30 L
      openingRatePaisa: 14000n, // ₹140/L
      currentStockBase: 30000n,
      totalValuePaisa: 420000n, // ₹4,200
    },
  });
  const spiceMix = await prisma.rawMaterial.create({
    data: {
      name: 'Salt and Spice Mix',
      code: 'RM-SPC-01',
      displayUnit: 'kg',
      baseUnit: BaseUnit.GRAM,
      reorderLevelBase: 2000n, // 2 kg
      openingStockBase: 5000n, // 5 kg
      openingRatePaisa: 20000n, // ₹200/kg
      currentStockBase: 5000n,
      totalValuePaisa: 100000n, // ₹1,000
    },
  });
  const besan = await prisma.rawMaterial.create({
    data: {
      name: 'Besan (Gram Flour)',
      code: 'RM-BSN-01',
      displayUnit: 'kg',
      baseUnit: BaseUnit.GRAM,
      reorderLevelBase: 25000n,
      openingStockBase: 80000n,
      openingRatePaisa: 7800n,
      currentStockBase: 80000n,
      totalValuePaisa: 624000n,
    },
  });
  const banana = await prisma.rawMaterial.create({
    data: {
      name: 'Raw Nendran Banana',
      code: 'RM-BNN-01',
      displayUnit: 'kg',
      baseUnit: BaseUnit.GRAM,
      reorderLevelBase: 20000n,
      openingStockBase: 60000n,
      openingRatePaisa: 6200n,
      currentStockBase: 60000n,
      totalValuePaisa: 372000n,
    },
  });
  const ghee = await prisma.rawMaterial.create({
    data: {
      name: 'Pure Cow Ghee',
      code: 'RM-GHE-01',
      displayUnit: 'kg',
      baseUnit: BaseUnit.GRAM,
      reorderLevelBase: 10000n,
      openingStockBase: 25000n,
      openingRatePaisa: 58000n,
      currentStockBase: 25000n,
      totalValuePaisa: 1450000n,
    },
  });

  // 6. Packaging Materials (Exact benchmark opening stock!)
  const pouch200 = await prisma.packagingMaterial.create({
    data: {
      name: '200 g Pouch (Printed Stand-up)',
      code: 'PK-PCH-200',
      displayUnit: 'pieces',
      baseUnit: BaseUnit.PIECE,
      reorderLevelBase: 200n,
      openingStockBase: 500n,
      openingRatePaisa: 250n, // ₹2.50
      currentStockBase: 500n,
      totalValuePaisa: 125000n, // ₹1,250
    },
  });
  const pouch250 = await prisma.packagingMaterial.create({
    data: {
      name: '250 g Pouch (Barrier Laminate)',
      code: 'PK-PCH-250',
      displayUnit: 'pieces',
      baseUnit: BaseUnit.PIECE,
      reorderLevelBase: 150n,
      openingStockBase: 400n,
      openingRatePaisa: 320n,
      currentStockBase: 400n,
      totalValuePaisa: 128000n,
    },
  });
  const carton = await prisma.packagingMaterial.create({
    data: {
      name: 'Carton (20-Packet Corrugated)',
      code: 'PK-CTN-20',
      displayUnit: 'pieces',
      baseUnit: BaseUnit.PIECE,
      reorderLevelBase: 15n,
      openingStockBase: 30n,
      openingRatePaisa: 1500n, // ₹15
      currentStockBase: 30n,
      totalValuePaisa: 45000n, // ₹450
    },
  });

  // 7. Products (6 South Indian snacks categories)
  const murukku = await prisma.product.create({
    data: {
      name: 'Murukku 200 g',
      sku: 'SS-MRK-200',
      category: 'Murukku',
      packSizeGrams: 200,
      packLabel: '200 g',
      sellingPricePaisa: 5000n, // ₹50
      gstRateBps: 500, // 5%
      hsnCode: '19059090',
      unit: 'PACKET',
      packetsPerCarton: 20,
      openingStockPackets: 50,
      currentStockPackets: 50,
      reorderLevelPackets: 60,
      imageUrl: '/images/products/murukku.jpg',
      description: 'Traditional hand-spun crispy rice and urad dal spiral murukku fried in cold-pressed groundnut oil.',
    },
  });
  const butterMurukku = await prisma.product.create({
    data: {
      name: 'Butter Murukku 200 g',
      sku: 'SS-BMR-200',
      category: 'Butter Murukku',
      packSizeGrams: 200,
      packLabel: '200 g',
      sellingPricePaisa: 5800n,
      gstRateBps: 500,
      hsnCode: '19059090',
      unit: 'PACKET',
      packetsPerCarton: 20,
      openingStockPackets: 120,
      currentStockPackets: 120,
      reorderLevelPackets: 40,
      imageUrl: '/images/products/butter-murukku.jpg',
      description: 'Melt-in-mouth extruded butter murukku infused with white butter, cumin, and curry leaves.',
    },
  });
  const bananaChips = await prisma.product.create({
    data: {
      name: 'Nendran Banana Chips 200 g',
      sku: 'SS-BNC-200',
      category: 'Banana Chips',
      packSizeGrams: 200,
      packLabel: '200 g',
      sellingPricePaisa: 7500n,
      gstRateBps: 1200,
      hsnCode: '20081990',
      unit: 'PACKET',
      packetsPerCarton: 20,
      openingStockPackets: 90,
      currentStockPackets: 90,
      reorderLevelPackets: 40,
      imageUrl: '/images/products/banana-chips.jpg',
      description: 'Thinly sliced Pollachi Nendran bananas crisped with turmeric and freshly cracked black pepper.',
    },
  });
  const bombayMixture = await prisma.product.create({
    data: {
      name: 'Bombay Mixture 250 g',
      sku: 'SS-BMX-250',
      category: 'Bombay Mixture',
      packSizeGrams: 250,
      packLabel: '250 g',
      sellingPricePaisa: 6500n,
      gstRateBps: 500,
      hsnCode: '21069099',
      unit: 'PACKET',
      packetsPerCarton: 20,
      openingStockPackets: 110,
      currentStockPackets: 110,
      reorderLevelPackets: 40,
      imageUrl: '/images/products/bombay-mixture.jpg',
      description: 'Signature savory blend of fine besan sev, roasted peanuts, crispy boondi, and aromatic curry leaves.',
    },
  });
  const ribbonPakoda = await prisma.product.create({
    data: {
      name: 'Crispy Ribbon Pakoda 200 g',
      sku: 'SS-RPK-200',
      category: 'Traditional South Indian Snacks',
      packSizeGrams: 200,
      packLabel: '200 g',
      sellingPricePaisa: 5500n,
      gstRateBps: 500,
      hsnCode: '19059090',
      unit: 'PACKET',
      packetsPerCarton: 20,
      openingStockPackets: 75,
      currentStockPackets: 75,
      reorderLevelPackets: 30,
      imageUrl: '/images/products/traditional-snacks.jpg',
      description: 'Crunchy golden ribbon pakoda made with rice flour, roasted gram, and mild red chilli.',
    },
  });
  const mysorePak = await prisma.product.create({
    data: {
      name: 'Ghee Mysore Pak 250 g',
      sku: 'SS-MPK-250',
      category: 'Sweets',
      packSizeGrams: 250,
      packLabel: '250 g',
      sellingPricePaisa: 14000n,
      gstRateBps: 500,
      hsnCode: '21069099',
      unit: 'PACKET',
      packetsPerCarton: 16,
      openingStockPackets: 45,
      currentStockPackets: 45,
      reorderLevelPackets: 20,
      imageUrl: '/images/products/sweets.jpg',
      description: 'Rich heritage South Indian sweet crafted from slow-roasted besan and pure cow ghee.',
    },
  });

  // Record opening StockMovements so the immutable ledger accounts for 100% of opening balances
  const openingMovements = [
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: flour.id, qty: 100000n, unit: 'kg', rate: 4200n, val: 420000n, code: 'RM-FLR-01' },
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: oil.id, qty: 30000n, unit: 'litres', rate: 14000n, val: 420000n, code: 'RM-OIL-01' },
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: spiceMix.id, qty: 5000n, unit: 'kg', rate: 20000n, val: 100000n, code: 'RM-SPC-01' },
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: besan.id, qty: 80000n, unit: 'kg', rate: 7800n, val: 624000n, code: 'RM-BSN-01' },
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: banana.id, qty: 60000n, unit: 'kg', rate: 6200n, val: 372000n, code: 'RM-BNN-01' },
    { cat: StockItemCategory.RAW_MATERIAL, rawMaterialId: ghee.id, qty: 25000n, unit: 'kg', rate: 58000n, val: 1450000n, code: 'RM-GHE-01' },
    { cat: StockItemCategory.PACKAGING_MATERIAL, packagingMaterialId: pouch200.id, qty: 500n, unit: 'pieces', rate: 250n, val: 125000n, code: 'PK-PCH-200' },
    { cat: StockItemCategory.PACKAGING_MATERIAL, packagingMaterialId: pouch250.id, qty: 400n, unit: 'pieces', rate: 320n, val: 128000n, code: 'PK-PCH-250' },
    { cat: StockItemCategory.PACKAGING_MATERIAL, packagingMaterialId: carton.id, qty: 30n, unit: 'pieces', rate: 1500n, val: 45000n, code: 'PK-CTN-20' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: murukku.id, qty: 50n, unit: 'packets', rate: 5000n, val: 250000n, code: 'SS-MRK-200' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: butterMurukku.id, qty: 120n, unit: 'packets', rate: 5800n, val: 696000n, code: 'SS-BMR-200' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: bananaChips.id, qty: 90n, unit: 'packets', rate: 7500n, val: 675000n, code: 'SS-BNC-200' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: bombayMixture.id, qty: 110n, unit: 'packets', rate: 6500n, val: 715000n, code: 'SS-BMX-250' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: ribbonPakoda.id, qty: 75n, unit: 'packets', rate: 5500n, val: 412500n, code: 'SS-RPK-200' },
    { cat: StockItemCategory.FINISHED_GOOD, productId: mysorePak.id, qty: 45n, unit: 'packets', rate: 14000n, val: 630000n, code: 'SS-MPK-250' },
  ];

  for (let i = 0; i < openingMovements.length; i++) {
    const om = openingMovements[i];
    await prisma.stockMovement.create({
      data: {
        movementNumber: `MOV-OPEN-${String(i + 1).padStart(3, '0')}`,
        itemCategory: om.cat,
        rawMaterialId: om.rawMaterialId ?? null,
        packagingMaterialId: om.packagingMaterialId ?? null,
        productId: om.productId ?? null,
        movementType: StockMovementType.OPENING,
        direction: StockDirection.IN,
        quantityBase: om.qty,
        unitLabel: om.unit,
        unitCostPaisa: om.rate,
        totalValuePaisa: om.val,
        balanceAfterBase: om.qty,
        sourceDocType: 'OpeningBalance',
        sourceDocId: om.code,
        sourceDocNumber: `OPEN-${om.code}`,
        notes: 'Opening stock balance',
        createdById: owner.id,
      },
    });
  }

  // 8. Configurable BOMs
  const murukkuBom = await prisma.bom.create({
    data: {
      productId: murukku.id,
      version: 1,
      name: 'Murukku 200 g — Standard Batch BOM',
      expectedOutputPackets: 200,
      yieldTolerancePct: 4.0,
      consumptionTolerancePct: 4.0,
      notes: 'Standard 40 kg flour batch yielding 200 x 200 g packets.',
      items: {
        create: [
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: flour.id,
            quantity: 40,
            unit: 'kg',
            quantityBase: 40000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: oil.id,
            quantity: 10,
            unit: 'litres',
            quantityBase: 10000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: spiceMix.id,
            quantity: 1.2,
            unit: 'kg',
            quantityBase: 1200n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.PACKAGING_MATERIAL,
            packagingMaterialId: pouch200.id,
            quantity: 200,
            unit: 'pieces',
            quantityBase: 200n,
            usageMode: BomUsageMode.PER_GOOD_PACKET,
          },
          {
            itemType: BomItemType.PACKAGING_MATERIAL,
            packagingMaterialId: carton.id,
            quantity: 10,
            unit: 'pieces',
            quantityBase: 10n,
            usageMode: BomUsageMode.MANUAL_PER_RUN,
          },
        ],
      },
    },
  });

  await prisma.bom.create({
    data: {
      productId: bombayMixture.id,
      version: 1,
      name: 'Bombay Mixture 250 g — Standard Batch BOM',
      expectedOutputPackets: 160,
      yieldTolerancePct: 5.0,
      consumptionTolerancePct: 5.0,
      items: {
        create: [
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: besan.id,
            quantity: 28,
            unit: 'kg',
            quantityBase: 28000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: oil.id,
            quantity: 8,
            unit: 'litres',
            quantityBase: 8000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: spiceMix.id,
            quantity: 1.5,
            unit: 'kg',
            quantityBase: 1500n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.PACKAGING_MATERIAL,
            packagingMaterialId: pouch250.id,
            quantity: 160,
            unit: 'pieces',
            quantityBase: 160n,
            usageMode: BomUsageMode.PER_GOOD_PACKET,
          },
          {
            itemType: BomItemType.PACKAGING_MATERIAL,
            packagingMaterialId: carton.id,
            quantity: 8,
            unit: 'pieces',
            quantityBase: 8n,
            usageMode: BomUsageMode.MANUAL_PER_RUN,
          },
        ],
      },
    },
  });

  await prisma.bom.create({
    data: {
      productId: bananaChips.id,
      version: 1,
      name: 'Nendran Banana Chips 200 g — Standard Batch BOM',
      expectedOutputPackets: 150,
      yieldTolerancePct: 5.0,
      consumptionTolerancePct: 5.0,
      items: {
        create: [
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: banana.id,
            quantity: 45,
            unit: 'kg',
            quantityBase: 45000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.RAW_MATERIAL,
            rawMaterialId: oil.id,
            quantity: 9,
            unit: 'litres',
            quantityBase: 9000n,
            usageMode: BomUsageMode.PER_BATCH,
          },
          {
            itemType: BomItemType.PACKAGING_MATERIAL,
            packagingMaterialId: pouch200.id,
            quantity: 150,
            unit: 'pieces',
            quantityBase: 150n,
            usageMode: BomUsageMode.PER_GOOD_PACKET,
          },
        ],
      },
    },
  });

  return {
    users: { owner, admin, supervisor, salesmanA, salesmanB, accountant },
    suppliers: { flourSupplier },
    customers: { retailerA, distributorB, kaveriStore },
    materials: { flour, oil, spiceMix, pouch200, carton },
    products: { murukku, butterMurukku, bananaChips, bombayMixture, ribbonPakoda, mysorePak },
    boms: { murukkuBom },
  };
}

export async function executeBenchmarkScenario(
  baseline: Awaited<ReturnType<typeof seedOpeningBaseline>>,
) {
  const { users, suppliers, customers, materials, products, boms } = baseline;

  // Step 1: Record a purchase of 60 kg flour at ₹45/kg
  await recordPurchase({
    supplierId: suppliers.flourSupplier.id,
    supplierBillNo: 'CAM/2026/0841',
    notes: '60 kg Rice & Urad flour replenishment',
    items: [
      {
        itemType: BomItemType.RAW_MATERIAL,
        materialId: materials.flour.id,
        quantity: 60,
        unit: 'kg',
        ratePaisa: 4500, // ₹45/kg
      },
    ],
    userId: users.supervisor.id,
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });

  // Step 2: Start one Murukku production run
  const run = await createProductionRun({
    bomId: boms.murukkuBom.id,
    batchSize: 1,
    supervisorId: users.supervisor.id,
    notes: 'NIT Benchmark Batch — Morning Fryer Line 1',
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });

  // Steps 3, 4, 5: Issue 40 kg flour, 10.5 litres oil, 1.2 kg spice mix
  await issueMaterialsToRun({
    runId: run.id,
    issues: [
      {
        itemType: BomItemType.RAW_MATERIAL,
        materialId: materials.flour.id,
        quantity: 40,
        unit: 'kg',
      },
      {
        itemType: BomItemType.RAW_MATERIAL,
        materialId: materials.oil.id,
        quantity: 10.5,
        unit: 'litres',
      },
      {
        itemType: BomItemType.RAW_MATERIAL,
        materialId: materials.spiceMix.id,
        quantity: 1.2,
        unit: 'kg',
      },
    ],
    userId: users.supervisor.id,
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });

  // Steps 6, 7, 8: Record actual output 188 good packets, 6 damaged pouches, 9 cartons used
  await completeProductionRun({
    runId: run.id,
    actualGoodPackets: 188,
    damagedPacketsCount: 6,
    wastageKg: 1.4,
    packagingUsages: [
      {
        packagingMaterialId: materials.pouch200.id,
        usedQuantity: 188,
        damagedQuantity: 6,
        unit: 'pieces',
      },
      {
        packagingMaterialId: materials.carton.id,
        usedQuantity: 9,
        damagedQuantity: 0,
        unit: 'pieces',
      },
    ],
    notes: '188 good packets packed; 6 pouches damaged in sealing',
    userId: users.supervisor.id,
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });

  // Step 14: Add ₹1,200 labour and ₹600 gas/power for the production run
  await addProductionExpense({
    runId: run.id,
    category: ExpenseCategory.LABOUR,
    description: 'Shift labour for Murukku batch (4 operators)',
    amountPaisa: 120000, // ₹1,200
    userId: users.supervisor.id,
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });
  await addProductionExpense({
    runId: run.id,
    category: ExpenseCategory.GAS_ELECTRICITY,
    description: 'LPG burner & packaging sealer electricity',
    amountPaisa: 60000, // ₹600
    userId: users.supervisor.id,
    userRole: RoleCode.PRODUCTION_SUPERVISOR,
  });

  // Step 9: Salesman A places order for Retailer A (Tamil Nadu): 150 packets
  const orderRetailerA = await createSalesOrder({
    customerId: customers.retailerA.id,
    salesmanId: users.salesmanA.id,
    items: [
      {
        productId: products.murukku.id,
        quantityPackets: 150,
      },
    ],
    notes: 'Retailer A monthly replenishment order',
    userRole: RoleCode.SALESMAN,
  });

  // Step 10: Admin approves, generates GST invoice and dispatches the order
  await approveSalesOrder({
    orderId: orderRetailerA.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });
  const invoiceRetailerA = await generateGstInvoice({
    orderId: orderRetailerA.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });
  await dispatchSalesOrder({
    orderId: orderRetailerA.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });

  // Step 11 & 12: Salesman B places order for Distributor B (Karnataka): 120 packets (shortage = 32)
  const orderDistributorB = await createSalesOrder({
    customerId: customers.distributorB.id,
    salesmanId: users.salesmanB.id,
    items: [
      {
        productId: products.murukku.id,
        quantityPackets: 120,
      },
    ],
    notes: 'Distributor B inter-state order (Karnataka) — flagged for insufficient stock',
    userRole: RoleCode.SALESMAN,
  });

  // Step 13: Record ₹4,000 payment from Retailer A
  await recordCustomerPayment({
    customerId: customers.retailerA.id,
    amountPaisa: 400000, // ₹4,000
    paymentMode: PaymentMode.UPI,
    referenceNumber: 'UPI-633019482710',
    notes: 'Part payment against Retailer A invoice',
    allocations: [
      {
        invoiceId: invoiceRetailerA.id,
        allocatedAmountPaisa: 400000,
      },
    ],
    userId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });

  // Additional realistic non-Murukku order so multi-product dashboards & reports shine without altering Murukku numbers
  const orderKaveri = await createSalesOrder({
    customerId: customers.kaveriStore.id,
    salesmanId: users.salesmanA.id,
    items: [
      { productId: products.butterMurukku.id, quantityPackets: 30 },
      { productId: products.bananaChips.id, quantityPackets: 20 },
    ],
    notes: 'Kaveri Stores weekend snacks order',
    userRole: RoleCode.SALESMAN,
  });
  await approveSalesOrder({
    orderId: orderKaveri.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });
  await generateGstInvoice({
    orderId: orderKaveri.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });
  await dispatchSalesOrder({
    orderId: orderKaveri.id,
    adminId: users.admin.id,
    userRole: RoleCode.FACTORY_ADMIN,
  });

  return { run, orderRetailerA, invoiceRetailerA, orderDistributorB };
}

// Run when invoked via `tsx prisma/seed.ts`
const isDirectExecution =
  process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');

if (isDirectExecution) {
  const baselineOnly = process.argv.includes('--baseline');
  (async () => {
    console.log('Seeding SavorSouth Foods ERP PostgreSQL database...');
    const baseline = await seedOpeningBaseline();
    if (!baselineOnly) {
      await executeBenchmarkScenario(baseline);
      console.log('Executed full NIT Benchmark Scenario transactions.');
    } else {
      console.log('Seeded opening baseline only (--baseline).');
    }
    await prisma.$disconnect();
    console.log('Database seed complete.');
  })().catch(async (err) => {
    console.error('Seed error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
