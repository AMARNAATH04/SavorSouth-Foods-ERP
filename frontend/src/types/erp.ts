export type RoleCode =
  | 'OWNER'
  | 'FACTORY_ADMIN'
  | 'PRODUCTION_SUPERVISOR'
  | 'SALESMAN'
  | 'ACCOUNTANT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: RoleCode;
  roleName: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  packSizeGrams: number;
  packLabel: string;
  sellingPricePaisa: number;
  gstRateBps: number;
  hsnCode: string;
  unit: string;
  packetsPerCarton: number;
  openingStockPackets: number;
  currentStockPackets: number;
  reorderLevelPackets: number;
  imageUrl?: string | null;
  description?: string | null;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  type: 'RETAILER' | 'DISTRIBUTOR';
  gstin?: string | null;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  phone: string;
  email?: string | null;
  priceCategory: 'STANDARD' | 'WHOLESALE' | 'DISTRIBUTOR';
  creditLimitPaisa: number;
  assignedSalesmanId?: string | null;
  assignedSalesman?: { id: string; name: string; email: string } | null;
  outstandingPaisa?: number;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  gstin?: string | null;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  phone: string;
  email?: string | null;
  isActive: boolean;
}

export interface MaterialItem {
  id: string;
  itemType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
  name: string;
  code: string;
  displayUnit: string;
  baseUnit: 'GRAM' | 'ML' | 'PIECE';
  openingQtyDisplay: number;
  currentQtyDisplay: number;
  reorderLevelDisplay: number;
  weightedAvgRatePaisa: number;
  totalValuePaisa: number;
  isLowStock: boolean;
}

export interface BomItem {
  id: string;
  itemType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
  rawMaterialId?: string | null;
  packagingMaterialId?: string | null;
  rawMaterial?: { id: string; name: string; displayUnit: string } | null;
  packagingMaterial?: { id: string; name: string; displayUnit: string } | null;
  quantity: number;
  unit: string;
  quantityBase: number;
  usageMode: 'PER_BATCH' | 'PER_GOOD_PACKET' | 'MANUAL_PER_RUN';
}

export interface Bom {
  id: string;
  productId: string;
  product: Product;
  version: number;
  name: string;
  expectedOutputPackets: number;
  yieldTolerancePct: number;
  consumptionTolerancePct: number;
  notes?: string | null;
  isActive: boolean;
  items: BomItem[];
}

export interface MaterialIssue {
  id: string;
  itemType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL';
  rawMaterialId?: string | null;
  packagingMaterialId?: string | null;
  rawMaterial?: { id: string; name: string; displayUnit: string } | null;
  packagingMaterial?: { id: string; name: string; displayUnit: string } | null;
  unit: string;
  displayPlannedQty: number;
  displayIssuedQty: number;
  displayDamagedQty: number;
  variancePct: number;
  alertTriggered: boolean;
  unitCostPaisa: number;
  totalCostPaisa: number;
  issuedAt: string;
}

export interface ProductionExpense {
  id: string;
  category: 'LABOUR' | 'GAS_ELECTRICITY' | 'MAINTENANCE' | 'OTHER';
  description: string;
  amountPaisa: number;
  expenseDate: string;
}

export interface ProductionRun {
  id: string;
  runNumber: string;
  batchNumber: string;
  bomId: string;
  bom: Bom;
  productId: string;
  product: Product;
  batchSize: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  productionDate: string;
  supervisor: { id: string; name: string; email: string };
  expectedOutputPackets: number;
  actualGoodPackets: number;
  damagedPacketsCount: number;
  wastageKg: number;
  yieldVariancePct: number;
  yieldAlertTriggered: boolean;
  rawMaterialCostPaisa: number;
  packagingCostPaisa: number;
  labourCostPaisa: number;
  gasPowerCostPaisa: number;
  totalCostPaisa: number;
  costPerPacketPaisa: number;
  notes?: string | null;
  completedAt?: string | null;
  materialIssues: MaterialIssue[];
  expenses: ProductionExpense[];
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  product: Product;
  quantityPackets: number;
  unit: string;
  unitPricePaisa: number;
  gstRateBps: number;
  lineSubtotalPaisa: number;
  lineTaxPaisa: number;
  lineTotalPaisa: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: Customer;
  salesmanId: string;
  salesman: { id: string; name: string; email: string };
  status: 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'INVOICED' | 'DISPATCHED' | 'CANCELLED';
  orderDate: string;
  subtotalPaisa: number;
  estimatedTaxPaisa: number;
  totalAmountPaisa: number;
  hasStockShortage: boolean;
  rejectionReason?: string | null;
  notes?: string | null;
  dispatchedAt?: string | null;
  items: SalesOrderItem[];
  invoice?: Invoice | null;
  stockCheck?: {
    hasShortage: boolean;
    items: Array<{
      productId: string;
      productName: string;
      requested: number;
      available: number;
      shortage: number;
      sufficient: boolean;
    }>;
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  financialYear: string;
  salesOrderId: string;
  salesOrder?: SalesOrder;
  customerId: string;
  customer: Customer;
  invoiceDate: string;
  status: 'POSTED' | 'CANCELLED';
  isInterState: boolean;
  taxableAmountPaisa: number;
  cgstPaisa: number;
  sgstPaisa: number;
  igstPaisa: number;
  totalAmountPaisa: number;
  paidAmountPaisa: number;
  creditNoteNumber?: string | null;
  cancellationReason?: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    hsnCode: string;
    quantityPackets: number;
    unitPricePaisa: number;
    taxableAmountPaisa: number;
    gstRateBps: number;
    cgstPaisa: number;
    sgstPaisa: number;
    igstPaisa: number;
    totalAmountPaisa: number;
  }>;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tagline: string;
  gstin: string;
  fssaiLicense: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  yieldVarianceTolerancePct: number;
  consumptionVarianceTolerancePct: number;
  overheadAllocationRule: string;
  defaultLabourCostPerBatchPaisa: number;
  defaultGasPowerCostPerBatchPaisa: number;
}
