import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Factory,
  Flame,
  Layers,
  Plus,
  Users,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../api/client';
import {
  ColumnDef,
  DataTable,
  ErrorBanner,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../components/UI';
import { useToast } from '../context/ToastContext';
import { Bom, MaterialItem, Product, ProductionRun } from '../types/erp';
import { formatDate, formatINR } from '../utils/format';

// 18. BOM MANAGEMENT + UNIT CONVERTER
export function BomsPage() {
  const [boms, setBoms] = useState<Bom[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Unit converter state
  const [convQty, setConvQty] = useState('1.2');
  const [convFrom, setConvFrom] = useState('kg');
  const [convTo, setConvTo] = useState('grams');
  const [convResult, setConvResult] = useState<number | null>(1200);

  // New BOM form
  const [productId, setProductId] = useState('');
  const [bomName, setBomName] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('200');
  const [yieldTol, setYieldTol] = useState('4');
  const [consTol, setConsTol] = useState('4');
  const [bomItems, setBomItems] = useState<
    Array<{ itemType: 'RAW_MATERIAL' | 'PACKAGING_MATERIAL'; materialId: string; quantity: number; unit: string; usageMode: string }>
  >([]);

  const { showToast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<Bom[]>('/production/boms'),
      apiFetch<Product[]>('/master/products'),
      apiFetch<{ rawMaterials: MaterialItem[]; packagingMaterials: MaterialItem[] }>(
        '/inventory/materials',
      ),
    ])
      .then(([b, p, m]) => {
        setBoms(b);
        setProducts(p);
        const allM = [...m.rawMaterials, ...m.packagingMaterials];
        setMaterials(allM);
        if (!productId && p.length > 0) setProductId(p[0].id);
        if (bomItems.length === 0 && allM.length > 0) {
          setBomItems([
            {
              itemType: allM[0].itemType,
              materialId: allM[0].id,
              quantity: 40,
              unit: allM[0].displayUnit,
              usageMode: 'PER_BATCH',
            },
          ]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const runConvert = async () => {
    try {
      const res = await apiFetch<{ converted: number }>('/production/convert-unit', {
        method: 'POST',
        body: JSON.stringify({
          quantity: Number(convQty),
          fromUnit: convFrom,
          toUnit: convTo,
          packetsPerCarton: 20,
        }),
      });
      setConvResult(res.converted);
    } catch (err: any) {
      showToast('Unit Conversion Error', err.message, 'error');
    }
  };

  const handleSaveBom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/production/boms', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          name: bomName,
          expectedOutputPackets: Number(expectedOutput),
          yieldTolerancePct: Number(yieldTol),
          consumptionTolerancePct: Number(consTol),
          items: bomItems.map((it) => ({
            ...it,
            quantity: Number(it.quantity),
          })),
        }),
      });
      showToast('Configurable BOM Created');
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('Failed to create BOM', err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurable Bill of Materials (BOM)"
        subtitle="Standard batch recipes, packaging requirements, expected packet yields & variance tolerances"
        breadcrumbs={[{ label: 'Production', to: '/production' }, { label: 'BOMs' }]}
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            <Plus className="w-4 h-4" /> New BOM Version
          </button>
        }
      />

      {/* Interactive Unit Conversion Utility */}
      <div className="rounded-2xl border border-[#D9A441]/35 bg-[#FFF8ED] p-4 shadow-card flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#183D32] mr-2 self-center">
          <ArrowRightLeft className="w-4 h-4 text-[#B85C38]" />
          Unit Converter
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#183D32]">Quantity</label>
          <input
            type="number"
            step="0.01"
            value={convQty}
            onChange={(e) => setConvQty(e.target.value)}
            className="mt-0.5 w-24 rounded-lg border border-[#183D32]/20 bg-white px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#183D32]">From</label>
          <select
            value={convFrom}
            onChange={(e) => setConvFrom(e.target.value)}
            className="mt-0.5 rounded-lg border border-[#183D32]/20 bg-white px-2.5 py-1.5 text-xs"
          >
            {['kg', 'grams', 'litres', 'ml', 'packets', 'cartons', 'pieces'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[#183D32]">To</label>
          <select
            value={convTo}
            onChange={(e) => setConvTo(e.target.value)}
            className="mt-0.5 rounded-lg border border-[#183D32]/20 bg-white px-2.5 py-1.5 text-xs"
          >
            {['grams', 'kg', 'ml', 'litres', 'cartons', 'packets', 'pieces'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={runConvert}
          className="rounded-lg bg-[#183D32] px-3.5 py-1.5 text-xs font-semibold text-white"
        >
          Convert
        </button>
        {convResult !== null && (
          <div className="rounded-lg bg-white border border-[#183D32]/15 px-3 py-1.5 text-xs font-bold text-[#183D32]">
            = {convResult} {convTo}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {boms.map((bom) => (
            <div
              key={bom.id}
              className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-[#183D32]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#183D32]">
                    Version {bom.version} • {bom.product.sku}
                  </span>
                  <h3 className="mt-1.5 font-display text-base font-bold text-[#183D32]">
                    {bom.name}
                  </h3>
                  <p className="text-xs text-[#252B29]/65">
                    Expected Output: <strong>{bom.expectedOutputPackets} packets</strong> / batch •
                    Tolerance: ±{bom.yieldTolerancePct}%
                  </p>
                </div>
                <Layers className="w-5 h-5 text-[#D9A441]" />
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#183D32]/10">
                <table className="w-full text-xs">
                  <thead className="bg-[#FFF8ED] text-[#183D32]">
                    <tr>
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Standard Qty</th>
                      <th className="px-3 py-2 text-right">Usage Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#183D32]/8">
                    {bom.items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-medium text-[#183D32]">
                          {it.rawMaterial?.name ?? it.packagingMaterial?.name}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[#252B29]/65">
                          {it.itemType === 'RAW_MATERIAL' ? 'Raw Material' : 'Packaging'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right text-[11px] text-[#252B29]/65">
                          {it.usageMode.replace(/_/g, ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create New BOM Version" size="lg">
        <form onSubmit={handleSaveBom} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#183D32]">Finished Product</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">BOM Name *</label>
              <input
                required
                value={bomName}
                onChange={(e) => setBomName(e.target.value)}
                placeholder="e.g. Butter Murukku Standard Batch"
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Expected Packets / Batch *</label>
              <input
                type="number"
                required
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-[#183D32]">Yield Tol (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={yieldTol}
                  onChange={(e) => setYieldTol(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold text-[#183D32]">Usage Tol (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={consTol}
                  onChange={(e) => setConsTol(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold text-[#183D32]">BOM Components</p>
              <button
                type="button"
                onClick={() => {
                  const first = materials[0];
                  if (!first) return;
                  setBomItems([
                    ...bomItems,
                    {
                      itemType: first.itemType,
                      materialId: first.id,
                      quantity: 1,
                      unit: first.displayUnit,
                      usageMode: first.itemType === 'RAW_MATERIAL' ? 'PER_BATCH' : 'PER_GOOD_PACKET',
                    },
                  ]);
                }}
                className="rounded-lg bg-[#FFF8ED] border border-[#183D32]/20 px-2.5 py-1 font-semibold text-[#183D32]"
              >
                + Add Component
              </button>
            </div>
            {bomItems.map((bi, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <select
                  value={`${bi.itemType}|${bi.materialId}`}
                  onChange={(e) => {
                    const [t, id] = e.target.value.split('|');
                    const mat = materials.find((m) => m.id === id);
                    const next = [...bomItems];
                    next[idx] = {
                      ...next[idx],
                      itemType: t as any,
                      materialId: id,
                      unit: mat?.displayUnit ?? 'kg',
                    };
                    setBomItems(next);
                  }}
                  className="sm:col-span-2 rounded-xl border border-[#183D32]/20 p-2"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={`${m.itemType}|${m.id}`}>
                      {m.name} ({m.displayUnit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={bi.quantity}
                  onChange={(e) => {
                    const next = [...bomItems];
                    next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                    setBomItems(next);
                  }}
                  className="rounded-xl border border-[#183D32]/20 p-2"
                />
                <select
                  value={bi.usageMode}
                  onChange={(e) => {
                    const next = [...bomItems];
                    next[idx] = { ...next[idx], usageMode: e.target.value };
                    setBomItems(next);
                  }}
                  className="rounded-xl border border-[#183D32]/20 p-2"
                >
                  <option value="PER_BATCH">PER_BATCH</option>
                  <option value="PER_GOOD_PACKET">PER_GOOD_PACKET</option>
                  <option value="MANUAL_PER_RUN">MANUAL_PER_RUN</option>
                </select>
              </div>
            ))}
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
              Save BOM
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 19. PRODUCTION DASHBOARD (Tablet-Friendly Shop Floor)
export function ProductionDashboardPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<ProductionRun[]>('/production/runs')
      .then(setRuns)
      .finally(() => setLoading(false));
  }, []);

  const activeCount = runs.filter((r) => r.status === 'IN_PROGRESS').length;
  const completedCount = runs.filter((r) => r.status === 'COMPLETED').length;
  const alertCount = runs.filter((r) => r.yieldAlertTriggered).length;

  const columns: ColumnDef<ProductionRun>[] = [
    {
      key: 'run',
      header: 'Run / Batch',
      sortValue: (r) => r.runNumber,
      render: (r) => (
        <div>
          <p className="font-bold text-[#183D32]">{r.runNumber}</p>
          <p className="text-[11px] font-mono text-[#252B29]/60">{r.batchNumber}</p>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      sortValue: (r) => r.product.name,
      render: (r) => (
        <div>
          <p className="font-semibold">{r.product.name}</p>
          <p className="text-[11px] text-[#252B29]/60">Batch Size: {r.batchSize}×</p>
        </div>
      ),
    },
    {
      key: 'output',
      header: 'Output Progress',
      render: (r) => {
        const pct = Math.min(
          100,
          Math.round((r.actualGoodPackets / Math.max(1, r.expectedOutputPackets)) * 100),
        );
        return (
          <div className="w-36">
            <div className="flex justify-between text-[11px] font-medium mb-1">
              <span>
                {r.actualGoodPackets} / {r.expectedOutputPackets}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#FFF8ED] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  r.yieldAlertTriggered ? 'bg-[#B85C38]' : 'bg-[#183D32]'
                }`}
                style={{ width: `${r.status === 'COMPLETED' ? pct : 35}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'variance',
      header: 'Yield Var.',
      align: 'right',
      render: (r) => (
        <span
          className={`font-bold ${r.yieldAlertTriggered ? 'text-[#B85C38]' : 'text-[#183D32]'}`}
        >
          {r.status === 'COMPLETED' ? `${r.yieldVariancePct}%` : '-'}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost / Packet',
      align: 'right',
      render: (r) => (
        <span className="font-bold">
          {r.costPerPacketPaisa > 0 ? formatINR(r.costPerPacketPaisa) : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Floor Dashboard"
        subtitle="Tablet-ready batch monitoring, material issuance, yield variance & cost absorption"
        breadcrumbs={[{ label: 'Production' }]}
        actions={
          <>
            <button
              onClick={() => navigate('/production/boms')}
              className="rounded-xl border border-[#183D32]/20 bg-white px-4 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
            >
              Manage BOMs
            </button>
            <button
              onClick={() => navigate('/production/new')}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Start Production Run
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Active Batches"
          value={activeCount}
          icon={<Factory className="w-5 h-5" />}
          tone="gold"
        />
        <StatCard
          label="Completed Runs"
          value={completedCount}
          icon={<CheckCircle2 className="w-5 h-5" />}
          tone="green"
        />
        <StatCard
          label="Yield Variance Alerts"
          value={alertCount}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone={alertCount > 0 ? 'terracotta' : 'green'}
          onClick={() => navigate('/production/variance')}
        />
      </div>

      <DataTable
        data={runs}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search run #, batch #, product..."
        searchKeys={(r) => `${r.runNumber} ${r.batchNumber} ${r.product.name}`}
        onRowClick={(r) => navigate(`/production/${r.id}`)}
      />
    </div>
  );
}

// 20. CREATE PRODUCTION RUN
export function CreateProductionRunPage() {
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState('');
  const [batchSize, setBatchSize] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<Bom[]>('/production/boms').then((list) => {
      setBoms(list);
      if (list.length > 0) setBomId(list[0].id);
    });
  }, []);

  const selectedBom = boms.find((b) => b.id === bomId);
  const mult = Number(batchSize) || 1;

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const run = await apiFetch<ProductionRun>('/production/runs', {
        method: 'POST',
        body: JSON.stringify({
          bomId,
          batchSize: mult,
          notes: notes || undefined,
        }),
      });
      showToast(`Production Run ${run.runNumber} Started`, 'Issue raw materials on the next screen.');
      navigate(`/production/${run.id}`);
    } catch (err: any) {
      showToast('Failed to start run', err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Start New Production Run"
        subtitle="Select configurable BOM & batch multiplier to calculate planned raw material & packaging needs"
        breadcrumbs={[{ label: 'Production', to: '/production' }, { label: 'Create Run' }]}
      />

      <form
        onSubmit={handleStart}
        className="rounded-2xl border border-[#183D32]/12 bg-white p-6 shadow-card space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Select BOM Recipe *</label>
            <select
              value={bomId}
              onChange={(e) => setBomId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              {boms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (v{b.version})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Batch Size Multiplier *</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              required
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
        </div>

        {selectedBom && (
          <div className="rounded-xl bg-[#FFF8ED] border border-[#D9A441]/35 p-4 space-y-2 text-xs">
            <div className="flex justify-between font-bold text-[#183D32]">
              <span>Expected Output ({selectedBom.product.name})</span>
              <span>{Math.round(selectedBom.expectedOutputPackets * mult)} packets</span>
            </div>
            <div className="divide-y divide-[#183D32]/10 pt-1">
              {selectedBom.items.map((it) => (
                <div key={it.id} className="py-1.5 flex justify-between">
                  <span>{it.rawMaterial?.name ?? it.packagingMaterial?.name}</span>
                  <span className="font-semibold tabular-nums">
                    {(it.quantity * mult).toFixed(2)} {it.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#183D32] mb-1">Shift / Line Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Morning Fryer Line 1"
            className="w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate('/production')}
            className="rounded-xl border px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !bomId}
            className="rounded-xl bg-[#183D32] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            {submitting ? 'Creating...' : 'Launch Production Batch'}
          </button>
        </div>
      </form>
    </div>
  );
}

// 21. PRODUCTION RUN DETAILS (Issue Materials, Complete Output + Damaged Packaging, Add Overheads)
export function ProductionRunDetailsPage() {
  const { id } = useParams();
  const [run, setRun] = useState<ProductionRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Issue materials state
  const [rawInputs, setRawInputs] = useState<
    Array<{ materialId: string; name: string; planned: number; qty: string; unit: string }>
  >([]);

  // Complete run state
  const [goodPackets, setGoodPackets] = useState('188');
  const [damagedPouches, setDamagedPouches] = useState('6');
  const [cartonsUsed, setCartonsUsed] = useState('9');
  const [wastageKg, setWastageKg] = useState('1.4');

  // Overhead modal state
  const [expModal, setExpModal] = useState(false);
  const [expCategory, setExpCategory] = useState<'LABOUR' | 'GAS_ELECTRICITY'>('LABOUR');
  const [expDesc, setExpDesc] = useState('Batch shift labour');
  const [expAmountRupees, setExpAmountRupees] = useState('1200');

  const { showToast } = useToast();

  const load = () => {
    if (!id) return;
    setLoading(true);
    apiFetch<ProductionRun>(`/production/runs/${id}`)
      .then((r) => {
        setRun(r);
        const rawBoms = r.bom.items.filter((i) => i.itemType === 'RAW_MATERIAL');
        setRawInputs(
          rawBoms.map((bi) => ({
            materialId: bi.rawMaterialId!,
            name: bi.rawMaterial?.name ?? 'Material',
            planned: Number((bi.quantity * r.batchSize).toFixed(2)),
            qty: String(Number((bi.quantity * r.batchSize).toFixed(2))),
            unit: bi.unit,
          })),
        );
        setGoodPackets(String(r.actualGoodPackets || r.expectedOutputPackets));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleIssueMaterials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!run) return;
    setBusy(true);
    try {
      await apiFetch(`/production/runs/${run.id}/issue-materials`, {
        method: 'POST',
        body: JSON.stringify({
          issues: rawInputs.map((ri) => ({
            itemType: 'RAW_MATERIAL',
            materialId: ri.materialId,
            quantity: Number(ri.qty),
            unit: ri.unit,
          })),
        }),
      });
      showToast('Raw Materials Issued', 'Stock deducted using weighted average valuation.');
      load();
    } catch (err: any) {
      showToast('Issue Failed', err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!run) return;
    setBusy(true);
    try {
      const pkgItems = run.bom.items.filter((i) => i.itemType === 'PACKAGING_MATERIAL');
      const packagingUsages = pkgItems.map((bi) => {
        const isCarton = bi.usageMode === 'MANUAL_PER_RUN';
        return {
          packagingMaterialId: bi.packagingMaterialId!,
          usedQuantity: isCarton ? Number(cartonsUsed) : Number(goodPackets),
          damagedQuantity: isCarton ? 0 : Number(damagedPouches),
          unit: bi.unit,
        };
      });

      await apiFetch(`/production/runs/${run.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          actualGoodPackets: Number(goodPackets),
          damagedPacketsCount: Number(damagedPouches),
          wastageKg: Number(wastageKg),
          packagingUsages,
        }),
      });
      showToast(
        'Production Batch Completed',
        `${goodPackets} good packets added to finished goods inventory.`,
      );
      load();
    } catch (err: any) {
      showToast('Completion Failed', err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!run) return;
    setBusy(true);
    try {
      await apiFetch(`/production/runs/${run.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          category: expCategory,
          description: expDesc,
          amountPaisa: Math.round(Number(expAmountRupees) * 100),
        }),
      });
      showToast('Overhead Expense Recorded', 'Batch cost per packet recalculated.');
      setExpModal(false);
      load();
    } catch (err: any) {
      showToast('Error', err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-white" />;
  if (!run) return <ErrorBanner message="Production run not found" />;

  const rawAlreadyIssued = run.materialIssues.some((mi) => mi.itemType === 'RAW_MATERIAL');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${run.runNumber} — ${run.product.name}`}
        subtitle={`Batch: ${run.batchNumber} • Supervisor: ${run.supervisor.name} • Date: ${formatDate(
          run.productionDate,
        )}`}
        breadcrumbs={[{ label: 'Production', to: '/production' }, { label: run.runNumber }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            <button
              onClick={() => setExpModal(true)}
              className="rounded-xl bg-[#D9A441] px-4 py-2 text-xs font-bold text-[#183D32] hover:bg-[#C69332]"
            >
              + Add Labour / Gas Overhead
            </button>
          </div>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Expected vs Good Output"
          value={`${run.actualGoodPackets} / ${run.expectedOutputPackets}`}
          hint={`Yield Variance: ${run.yieldVariancePct}%`}
          icon={<Factory className="w-5 h-5" />}
          tone={run.yieldAlertTriggered ? 'terracotta' : 'green'}
        />
        <StatCard
          label="Raw Material + Packaging"
          value={formatINR(run.rawMaterialCostPaisa + run.packagingCostPaisa)}
          hint={`RM: ${formatINR(run.rawMaterialCostPaisa)} • Pkg: ${formatINR(
            run.packagingCostPaisa,
          )}`}
          icon={<Layers className="w-5 h-5" />}
          tone="gold"
        />
        <StatCard
          label="Labour & Gas/Power"
          value={formatINR(run.labourCostPaisa + run.gasPowerCostPaisa)}
          hint={`Labour: ${formatINR(run.labourCostPaisa)} • Gas: ${formatINR(
            run.gasPowerCostPaisa,
          )}`}
          icon={<Flame className="w-5 h-5" />}
        />
        <StatCard
          label="Total Cost / Packet"
          value={run.costPerPacketPaisa > 0 ? formatINR(run.costPerPacketPaisa) : 'Pending'}
          hint={`Total Batch Cost: ${formatINR(run.totalCostPaisa)}`}
          icon={<Users className="w-5 h-5" />}
          tone="green"
        />
      </div>

      {/* Step 1: Issue Raw Materials (if not yet issued) */}
      {run.status === 'IN_PROGRESS' && !rawAlreadyIssued && (
        <form
          onSubmit={handleIssueMaterials}
          className="rounded-2xl border border-[#D9A441]/45 bg-white p-5 shadow-card space-y-4"
        >
          <h3 className="font-display text-base font-bold text-[#183D32]">
            Step 1: Issue Raw Materials to Production Batch
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {rawInputs.map((ri, idx) => (
              <div key={ri.materialId} className="rounded-xl bg-[#FFF8ED]/70 p-3 space-y-2">
                <p className="font-bold text-[#183D32]">{ri.name}</p>
                <p className="text-[11px] text-[#252B29]/65">
                  BOM Planned: {ri.planned} {ri.unit}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={ri.qty}
                    onChange={(e) => {
                      const next = [...rawInputs];
                      next[idx] = { ...next[idx], qty: e.target.value };
                      setRawInputs(next);
                    }}
                    className="w-full rounded-lg border border-[#183D32]/20 bg-white p-2 text-sm font-semibold"
                  />
                  <select
                    value={ri.unit}
                    onChange={(e) => {
                      const next = [...rawInputs];
                      next[idx] = { ...next[idx], unit: e.target.value };
                      setRawInputs(next);
                    }}
                    className="rounded-lg border border-[#183D32]/20 bg-white px-2 text-xs"
                  >
                    {ri.unit === 'litres' || ri.unit === 'ml' ? (
                      <>
                        <option value="litres">litres</option>
                        <option value="ml">ml</option>
                      </>
                    ) : (
                      <>
                        <option value="kg">kg</option>
                        <option value="grams">grams</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#183D32] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            Issue Materials &amp; Deduct Stock
          </button>
        </form>
      )}

      {/* Step 2: Complete Batch Output & Packaging */}
      {run.status === 'IN_PROGRESS' && rawAlreadyIssued && (
        <form
          onSubmit={handleCompleteRun}
          className="rounded-2xl border border-[#183D32]/20 bg-white p-5 shadow-card space-y-4"
        >
          <h3 className="font-display text-base font-bold text-[#183D32]">
            Step 2: Record Actual Output, Damaged Pouches &amp; Cartons Used
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="font-semibold text-[#183D32]">Actual Good Packets *</label>
              <input
                type="number"
                required
                min={1}
                value={goodPackets}
                onChange={(e) => setGoodPackets(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm font-bold"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Damaged Pouches</label>
              <input
                type="number"
                min={0}
                value={damagedPouches}
                onChange={(e) => setDamagedPouches(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Cartons Used</label>
              <input
                type="number"
                min={0}
                value={cartonsUsed}
                onChange={(e) => setCartonsUsed(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Process Wastage (kg)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={wastageKg}
                onChange={(e) => setWastageKg(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#B85C38] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#9E4B2B]"
          >
            Complete Batch &amp; Credit Finished Goods
          </button>
        </form>
      )}

      {/* Material Consumption Variance Table */}
      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] mb-3">
          Planned vs Actual Material &amp; Packaging Consumption
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-[#FFF8ED] text-[#183D32]">
              <tr>
                <th className="px-3 py-2.5 text-left">Material</th>
                <th className="px-3 py-2.5 text-right">Planned</th>
                <th className="px-3 py-2.5 text-right">Actual Issued</th>
                <th className="px-3 py-2.5 text-right">Damaged</th>
                <th className="px-3 py-2.5 text-right">Variance %</th>
                <th className="px-3 py-2.5 text-right">Cost</th>
                <th className="px-3 py-2.5 text-center">Tolerance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#183D32]/10">
              {run.materialIssues.map((mi) => (
                <tr key={mi.id}>
                  <td className="px-3 py-2.5 font-medium text-[#183D32]">
                    {mi.rawMaterial?.name ?? mi.packagingMaterial?.name}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {mi.displayPlannedQty} {mi.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {mi.displayIssuedQty} {mi.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {mi.displayDamagedQty} {mi.unit}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                      mi.alertTriggered ? 'text-[#B85C38]' : 'text-[#183D32]'
                    }`}
                  >
                    {mi.variancePct > 0 ? `+${mi.variancePct}%` : `${mi.variancePct}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {formatINR(mi.totalCostPaisa)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={mi.alertTriggered ? 'EXCEEDED' : 'OK'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overhead Expenses List */}
      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] mb-3">
          Batch Direct Overheads (Labour, Gas &amp; Electricity)
        </h3>
        {run.expenses.length === 0 ? (
          <p className="text-xs text-[#252B29]/60">No overheads recorded for this batch yet.</p>
        ) : (
          <div className="space-y-2">
            {run.expenses.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center justify-between rounded-xl bg-[#FFF8ED]/60 px-4 py-2.5 text-xs"
              >
                <div>
                  <span className="font-bold text-[#183D32]">{ex.category.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-[#252B29]/75">{ex.description}</span>
                </div>
                <span className="font-bold tabular-nums text-[#183D32]">
                  {formatINR(ex.amountPaisa)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={expModal}
        onClose={() => setExpModal(false)}
        title="Add Batch Overhead Expense"
        size="sm"
      >
        <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Category</label>
            <select
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              <option value="LABOUR">LABOUR</option>
              <option value="GAS_ELECTRICITY">GAS &amp; ELECTRICITY</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Description *</label>
            <input
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Amount (INR) *</label>
            <input
              type="number"
              required
              min={1}
              value={expAmountRupees}
              onChange={(e) => setExpAmountRupees(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setExpModal(false)}
              className="rounded-xl border px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white"
            >
              Add Overhead
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 22. VARIANCE ANALYSIS
export function VarianceAnalysisPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<ProductionRun[]>('/production/runs')
      .then(setRuns)
      .finally(() => setLoading(false));
  }, []);

  const allIssues = runs.flatMap((r) =>
    r.materialIssues.map((mi) => ({
      ...mi,
      runId: r.id,
      runNumber: r.runNumber,
      productName: r.product.name,
      materialName: mi.rawMaterial?.name ?? mi.packagingMaterial?.name ?? '-',
    })),
  );

  const yieldChartData = runs
    .filter((r) => r.status === 'COMPLETED')
    .map((r) => ({
      name: r.runNumber,
      yieldVariancePct: r.yieldVariancePct,
      alert: r.yieldAlertTriggered,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Variance & Wastage Analysis"
        subtitle="Track yield shortfall/surplus and material consumption variance against BOM tolerances"
        breadcrumbs={[{ label: 'Production', to: '/production' }, { label: 'Variance Analysis' }]}
      />

      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[#B85C38]" />
          Batch Yield Variance (%)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yieldChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(val: number) => `${val}%`} />
              <ReferenceLine y={0} stroke="#252B29" />
              <Bar dataKey="yieldVariancePct" name="Yield Variance %">
                {yieldChartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.alert ? '#B85C38' : '#183D32'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <DataTable
        data={allIssues}
        loading={loading}
        searchPlaceholder="Search run # or material..."
        searchKeys={(i) => `${i.runNumber} ${i.productName} ${i.materialName}`}
        onRowClick={(i) => navigate(`/production/${i.runId}`)}
        columns={[
          { key: 'run', header: 'Run No', render: (i) => <span className="font-bold text-[#183D32]">{i.runNumber}</span> },
          { key: 'prod', header: 'Product', render: (i) => i.productName },
          { key: 'mat', header: 'Material', render: (i) => i.materialName },
          { key: 'plan', header: 'Planned', align: 'right', render: (i) => `${i.displayPlannedQty} ${i.unit}` },
          { key: 'act', header: 'Actual', align: 'right', render: (i) => `${i.displayIssuedQty} ${i.unit}` },
          { key: 'dmg', header: 'Damaged', align: 'right', render: (i) => `${i.displayDamagedQty} ${i.unit}` },
          {
            key: 'var',
            header: 'Variance %',
            align: 'right',
            render: (i) => (
              <span className={`font-bold ${i.alertTriggered ? 'text-[#B85C38]' : 'text-[#183D32]'}`}>
                {i.variancePct > 0 ? `+${i.variancePct}%` : `${i.variancePct}%`}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Tolerance Check',
            render: (i) => (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  i.alertTriggered
                    ? 'bg-[#B85C38]/12 text-[#B85C38]'
                    : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {i.alertTriggered ? 'EXCEEDED' : 'WITHIN TOLERANCE'}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
