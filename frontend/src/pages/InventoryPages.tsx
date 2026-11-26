import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Boxes, Factory, Plus, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import {
  ColumnDef,
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
} from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MaterialItem, Product, Supplier } from '../types/erp';
import { formatDate, formatDateTime, formatINR } from '../utils/format';

// 14. PURCHASE MANAGEMENT
export function PurchasesPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [billNo, setBillNo] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedMaterialKey, setSelectedMaterialKey] = useState('');
  const [qty, setQty] = useState('60');
  const [unit, setUnit] = useState('kg');
  const [rateRupees, setRateRupees] = useState('45');
  const { user } = useAuth();
  const { showToast } = useToast();

  const canCreate =
    user?.role === 'OWNER' ||
    user?.role === 'FACTORY_ADMIN' ||
    user?.role === 'PRODUCTION_SUPERVISOR';

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<any[]>('/inventory/purchases'),
      apiFetch<Supplier[]>('/master/suppliers'),
      apiFetch<{ rawMaterials: MaterialItem[]; packagingMaterials: MaterialItem[] }>(
        '/inventory/materials',
      ),
    ])
      .then(([p, s, m]) => {
        setPurchases(p);
        setSuppliers(s);
        const allMats = [...m.rawMaterials, ...m.packagingMaterials];
        setMaterials(allMats);
        if (!supplierId && s.length > 0) setSupplierId(s[0].id);
        if (!selectedMaterialKey && allMats.length > 0) {
          setSelectedMaterialKey(`${allMats[0].itemType}|${allMats[0].id}`);
          setUnit(allMats[0].displayUnit);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleMaterialChange = (key: string) => {
    setSelectedMaterialKey(key);
    const [, matId] = key.split('|');
    const found = materials.find((m) => m.id === matId);
    if (found) setUnit(found.displayUnit);
  };

  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const [itemType, materialId] = selectedMaterialKey.split('|');
    try {
      const created = await apiFetch<any>('/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          supplierBillNo: billNo || undefined,
          notes: notes || undefined,
          items: [
            {
              itemType,
              materialId,
              quantity: Number(qty),
              unit,
              ratePaisa: Math.round(Number(rateRupees) * 100),
            },
          ],
        }),
      });
      showToast(
        `Purchase ${created.purchaseNumber} Recorded`,
        'Stock balance & weighted average valuation updated automatically.',
      );
      setModalOpen(false);
      setBillNo('');
      setNotes('');
      load();
    } catch (err: any) {
      showToast('Purchase Failed', err.message, 'error');
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: 'purchaseNumber',
      header: 'Purchase No',
      sortValue: (p) => p.purchaseNumber,
      render: (p) => <span className="font-bold text-[#183D32]">{p.purchaseNumber}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (p) => p.purchaseDate,
      render: (p) => <span className="text-xs">{formatDate(p.purchaseDate)}</span>,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (p) => (
        <div>
          <p className="font-medium">{p.supplier.name}</p>
          <p className="text-[11px] text-[#252B29]/60">Bill: {p.supplierBillNo || '-'}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Materials Received',
      render: (p) => (
        <div className="text-xs space-y-0.5">
          {p.items.map((it: any) => (
            <p key={it.id}>
              <strong>{it.rawMaterial?.name ?? it.packagingMaterial?.name}</strong>: {it.quantity}{' '}
              {it.unit} @ {formatINR(it.ratePaisa)}
            </p>
          ))}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Value',
      align: 'right',
      sortValue: (p) => p.totalAmountPaisa,
      render: (p) => <span className="font-bold">{formatINR(p.totalAmountPaisa)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase Management"
        subtitle="Record raw material & packaging receipts with automatic stock ledger & weighted average cost update"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Purchases' }]}
        actions={
          canCreate && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Record Purchase
            </button>
          )
        }
      />

      <DataTable
        data={purchases}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search purchase #, supplier, bill #..."
        searchKeys={(p) => `${p.purchaseNumber} ${p.supplier.name} ${p.supplierBillNo ?? ''}`}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Material Purchase">
        <form onSubmit={handleRecordPurchase} className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Supplier *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#183D32]">Supplier Bill No</label>
              <input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder="e.g., CAM/2026/0901"
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Material *</label>
              <select
                value={selectedMaterialKey}
                onChange={(e) => handleMaterialChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              >
                {materials.map((m) => (
                  <option key={m.id} value={`${m.itemType}|${m.id}`}>
                    {m.name} ({m.displayUnit})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#183D32]">Quantity *</label>
              <input
                type="number"
                step="0.01"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Unit *</label>
              <input
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Rate / Unit (INR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={rateRupees}
                onChange={(e) => setRateRupees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
          </div>
          <div className="rounded-xl bg-[#FFF8ED] p-3 flex justify-between font-bold text-[#183D32]">
            <span>Total Purchase Value:</span>
            <span>{formatINR(Math.round(Number(qty || 0) * Number(rateRupees || 0) * 100))}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#183D32] px-5 py-2 text-xs font-semibold text-white"
            >
              Post Purchase &amp; Receive Stock
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 15. RAW MATERIAL & PACKAGING INVENTORY
export function RawMaterialsPage() {
  const [rawMaterials, setRawMaterials] = useState<MaterialItem[]>([]);
  const [packagingMaterials, setPackagingMaterials] = useState<MaterialItem[]>([]);
  const [tab, setTab] = useState<'RAW' | 'PKG'>('RAW');
  const [loading, setLoading] = useState(true);
  const [adjTarget, setAdjTarget] = useState<MaterialItem | null>(null);
  const [adjDir, setAdjDir] = useState<'IN' | 'OUT'>('OUT');
  const [adjQty, setAdjQty] = useState('1');
  const [adjReason, setAdjReason] = useState('');
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const canAdjust = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    setLoading(true);
    apiFetch<{ rawMaterials: MaterialItem[]; packagingMaterials: MaterialItem[] }>(
      '/inventory/materials',
    )
      .then((res) => {
        setRawMaterials(res.rawMaterials);
        setPackagingMaterials(res.packagingMaterials);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjTarget) return;
    try {
      await apiFetch('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          itemType: adjTarget.itemType,
          materialId: adjTarget.id,
          direction: adjDir,
          quantity: Number(adjQty),
          unit: adjTarget.displayUnit,
          unitRatePaisa: adjTarget.weightedAvgRatePaisa,
          reason: adjReason,
        }),
      });
      showToast('Stock Adjusted & Logged');
      setAdjTarget(null);
      setAdjReason('');
      load();
    } catch (err: any) {
      showToast('Adjustment Failed', err.message, 'error');
    }
  };

  const rows = tab === 'RAW' ? rawMaterials : packagingMaterials;

  const columns: ColumnDef<MaterialItem>[] = [
    {
      key: 'name',
      header: 'Material',
      sortValue: (m) => m.name,
      render: (m) => (
        <div>
          <p className="font-bold text-[#183D32]">{m.name}</p>
          <p className="text-[11px] font-mono text-[#252B29]/60">{m.code}</p>
        </div>
      ),
    },
    {
      key: 'opening',
      header: 'Opening Stock',
      align: 'right',
      render: (m) => `${m.openingQtyDisplay} ${m.displayUnit}`,
    },
    {
      key: 'closing',
      header: 'Current Closing',
      align: 'right',
      sortValue: (m) => m.currentQtyDisplay,
      render: (m) => (
        <span className={`font-bold ${m.isLowStock ? 'text-[#B85C38]' : 'text-[#183D32]'}`}>
          {m.currentQtyDisplay} {m.displayUnit}
        </span>
      ),
    },
    {
      key: 'avgRate',
      header: 'Weighted Avg Rate',
      align: 'right',
      render: (m) => `${formatINR(m.weightedAvgRatePaisa)} / ${m.displayUnit}`,
    },
    {
      key: 'value',
      header: 'Stock Valuation',
      align: 'right',
      sortValue: (m) => m.totalValuePaisa,
      render: (m) => <span className="font-bold">{formatINR(m.totalValuePaisa)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (m) => <StatusBadge status={m.isLowStock ? 'LOW STOCK' : 'OK'} />,
    },
    ...(canAdjust
      ? [
          {
            key: 'adj',
            header: '',
            render: (m: MaterialItem) => (
              <button
                onClick={() => setAdjTarget(m)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-xs font-semibold text-[#183D32] hover:bg-[#183D32] hover:text-white"
              >
                <SlidersHorizontal className="w-3 h-3" /> Adjust
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Raw Material & Packaging Inventory"
        subtitle="Real-time closing balances, reorder alerts & weighted average cost valuation"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Raw & Packaging' }]}
        actions={
          <button
            onClick={() => navigate('/purchases')}
            className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            + Record Purchase
          </button>
        }
      />

      <div className="flex gap-2">
        <button
          onClick={() => setTab('RAW')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'RAW'
              ? 'bg-[#183D32] text-white'
              : 'bg-white border border-[#183D32]/15 text-[#183D32]'
          }`}
        >
          Raw Materials ({rawMaterials.length})
        </button>
        <button
          onClick={() => setTab('PKG')}
          className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
            tab === 'PKG'
              ? 'bg-[#183D32] text-white'
              : 'bg-white border border-[#183D32]/15 text-[#183D32]'
          }`}
        >
          Packaging Materials ({packagingMaterials.length})
        </button>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search material name or code..."
        searchKeys={(m) => `${m.name} ${m.code}`}
      />

      <Modal
        open={!!adjTarget}
        onClose={() => setAdjTarget(null)}
        title={`Stock Adjustment: ${adjTarget?.name}`}
        size="sm"
      >
        {adjTarget && (
          <form onSubmit={handleAdjust} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#183D32]">Direction</label>
                <select
                  value={adjDir}
                  onChange={(e) => setAdjDir(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
                >
                  <option value="OUT">OUT (Write-off / Loss)</option>
                  <option value="IN">IN (Opening / Surplus)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-[#183D32]">
                  Quantity ({adjTarget.displayUnit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Audit Reason *</label>
              <input
                required
                minLength={3}
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Physical stock count reconciliation..."
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjTarget(null)}
                className="rounded-xl border px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white"
              >
                Post Adjustment
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// 16. FINISHED GOODS INVENTORY
export function FinishedGoodsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<Product[]>('/master/products')
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<Product>[] = [
    {
      key: 'name',
      header: 'Finished Product',
      sortValue: (p) => p.name,
      render: (p) => (
        <div className="flex items-center gap-3">
          <img
            src={p.imageUrl || '/images/products/murukku.jpg'}
            alt={p.name}
            className="h-9 w-9 rounded-lg object-cover border border-[#183D32]/10"
          />
          <div>
            <p className="font-bold text-[#183D32]">{p.name}</p>
            <p className="text-[11px] text-[#252B29]/60">
              {p.sku} • {p.category}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'opening',
      header: 'Opening (Pkts)',
      align: 'right',
      render: (p) => p.openingStockPackets,
    },
    {
      key: 'closing',
      header: 'Closing Stock (Pkts)',
      align: 'right',
      sortValue: (p) => p.currentStockPackets,
      render: (p) => (
        <span
          className={`font-bold ${
            p.currentStockPackets <= p.reorderLevelPackets ? 'text-[#B85C38]' : 'text-[#183D32]'
          }`}
        >
          {p.currentStockPackets} pkts
        </span>
      ),
    },
    {
      key: 'cartons',
      header: 'Approx. Cartons',
      align: 'right',
      render: (p) => (p.currentStockPackets / p.packetsPerCarton).toFixed(1),
    },
    {
      key: 'value',
      header: 'Retail Stock Value',
      align: 'right',
      render: (p) => (
        <span className="font-bold">
          {formatINR(p.currentStockPackets * p.sellingPricePaisa)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <StatusBadge
          status={p.currentStockPackets <= p.reorderLevelPackets ? 'LOW STOCK' : 'OK'}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finished Goods Inventory"
        subtitle="Packet & carton availability derived from production receipts and dispatched sales invoices"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Finished Goods' }]}
        actions={
          <button
            onClick={() => navigate('/production/new')}
            className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            <Factory className="w-4 h-4" /> Produce More Stock
          </button>
        }
      />

      <DataTable
        data={products}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search product or SKU..."
        searchKeys={(p) => `${p.name} ${p.sku} ${p.category}`}
      />
    </div>
  );
}

// 17. IMMUTABLE STOCK LEDGER
export function StockLedgerPage() {
  const [movements, setMovements] = useState<any[]>([]);
  const [catFilter, setCatFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = catFilter === 'ALL' ? '' : `?category=${catFilter}`;
    apiFetch<any[]>(`/inventory/ledger${qs}`)
      .then(setMovements)
      .finally(() => setLoading(false));
  }, [catFilter]);

  const columns: ColumnDef<any>[] = [
    {
      key: 'mov',
      header: 'Movement No',
      render: (m) => (
        <div>
          <p className="font-mono text-xs font-bold text-[#183D32]">{m.movementNumber}</p>
          <p className="text-[10px] text-[#252B29]/60">{formatDateTime(m.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      render: (m) => (
        <div>
          <p className="font-semibold text-[#252B29]">{m.itemName}</p>
          <p className="text-[10px] text-[#252B29]/60">{m.itemCategory.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Movement Type',
      render: (m) => <span className="text-xs font-medium">{m.movementType.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'dir',
      header: 'Qty Change',
      align: 'right',
      render: (m) => (
        <span
          className={`inline-flex items-center gap-1 font-bold tabular-nums ${
            m.direction === 'IN' ? 'text-emerald-700' : 'text-[#B85C38]'
          }`}
        >
          {m.direction === 'IN' ? (
            <ArrowDownLeft className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpRight className="w-3.5 h-3.5" />
          )}
          {m.direction === 'IN' ? '+' : '-'}
          {m.displayQuantity} {m.unitLabel}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance After',
      align: 'right',
      render: (m) => (
        <span className="font-bold text-[#183D32] tabular-nums">
          {m.displayBalanceAfter} {m.unitLabel}
        </span>
      ),
    },
    {
      key: 'val',
      header: 'Value',
      align: 'right',
      render: (m) => formatINR(m.totalValuePaisa),
    },
    {
      key: 'source',
      header: 'Source Document',
      render: (m) => (
        <span className="rounded-lg bg-[#FFF8ED] px-2 py-0.5 text-[11px] font-medium text-[#183D32]">
          {m.sourceDocType}: {m.sourceDocNumber}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Immutable Stock Movement Ledger"
        subtitle="Every inventory mutation is backed by a source document inside an atomic database transaction"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Stock Ledger' }]}
      />

      <DataTable
        data={movements}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search item, movement #, source doc..."
        searchKeys={(m) => `${m.movementNumber} ${m.itemName} ${m.sourceDocNumber} ${m.movementType}`}
        pageSize={12}
        filterSlot={
          <div className="flex items-center gap-1.5">
            <Boxes className="w-4 h-4 text-[#183D32]" />
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-xl border border-[#183D32]/15 bg-white px-3 py-2 text-xs font-medium outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="RAW_MATERIAL">Raw Materials</option>
              <option value="PACKAGING_MATERIAL">Packaging Materials</option>
              <option value="FINISHED_GOOD">Finished Goods</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
