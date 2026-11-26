import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Clock,
  CreditCard,
  Factory,
  IndianRupee,
  Package,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../api/client';
import { AnimatedNumber, ErrorBanner, PageHeader, StatCard, StatusBadge } from '../components/UI';
import { formatDate, formatINR } from '../utils/format';

const CHART_COLORS = ['#183D32', '#D9A441', '#B85C38', '#3B7A68', '#789C8A', '#C9895B'];

export function OwnerDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError('');
    apiFetch('/reports/dashboard')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-white" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  const { kpis, charts, alerts, recentOrders, recentRuns } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Owner Dashboard"
        subtitle="Real-time order-to-audit pulse across Tamil Nadu & inter-state snack operations"
        breadcrumbs={[{ label: 'SavorSouth ERP' }, { label: 'Owner Dashboard' }]}
        actions={
          <>
            <button
              onClick={() => navigate('/costing')}
              className="rounded-xl border border-[#183D32]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
            >
              Costing Analytics
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              Export Monthly Reports
            </button>
          </>
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Invoiced Sales"
          value={<AnimatedNumber value={kpis.totalSalesPaisa / 100} prefix="₹" decimals={2} />}
          hint={`Monthly Revenue: ${formatINR(kpis.monthlyRevenuePaisa)}`}
          icon={<IndianRupee className="w-5 h-5" />}
          tone="green"
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          label="Outstanding Dues"
          value={<AnimatedNumber value={kpis.outstandingPaisa / 100} prefix="₹" decimals={2} />}
          hint={`Collected: ${formatINR(kpis.totalCollectedPaisa)}`}
          icon={<CreditCard className="w-5 h-5" />}
          tone="terracotta"
          onClick={() => navigate('/payments')}
        />
        <StatCard
          label="Pending & Today's Orders"
          value={<AnimatedNumber value={kpis.pendingOrdersCount} />}
          hint={`Today's orders: ${kpis.todaysOrdersCount} • Shortage flagged: ${kpis.stockShortageOrdersCount}`}
          icon={<ShoppingCart className="w-5 h-5" />}
          tone="gold"
          onClick={() => navigate('/orders')}
        />
        <StatCard
          label="Avg Cost / Packet"
          value={<AnimatedNumber value={kpis.avgCostPerPacketPaisa / 100} prefix="₹" decimals={2} />}
          hint={`Completed batches: ${kpis.completedRunsCount} • Active: ${kpis.activeRunsCount}`}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="green"
          onClick={() => navigate('/costing')}
        />
      </div>

      {/* Inventory & Alerts Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Finished Goods Stock"
          value={<AnimatedNumber value={kpis.finishedGoodsPackets} suffix=" pkts" />}
          hint={`Retail value: ${formatINR(kpis.finishedGoodsValuePaisa)}`}
          icon={<Package className="w-5 h-5" />}
          onClick={() => navigate('/inventory/finished-goods')}
        />
        <StatCard
          label="Raw & Packaging Valuation"
          value={
            <AnimatedNumber
              value={(kpis.rawMaterialValuePaisa + kpis.packagingValuePaisa) / 100}
              prefix="₹"
              decimals={2}
            />
          }
          hint={`RM: ${formatINR(kpis.rawMaterialValuePaisa)} • Pkg: ${formatINR(kpis.packagingValuePaisa)}`}
          icon={<Boxes className="w-5 h-5" />}
          tone="gold"
          onClick={() => navigate('/inventory/raw-materials')}
        />
        <StatCard
          label="Production Runs"
          value={<AnimatedNumber value={kpis.totalRunsCount} />}
          hint="Weighted avg + direct batch costing"
          icon={<Factory className="w-5 h-5" />}
          onClick={() => navigate('/production')}
        />
        <StatCard
          label="Wastage & Stock Alerts"
          value={<AnimatedNumber value={kpis.wastageAlertsCount + kpis.lowStockAlertsCount} />}
          hint={`${kpis.wastageAlertsCount} variance alerts • ${kpis.lowStockAlertsCount} low stock`}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone={kpis.wastageAlertsCount + kpis.lowStockAlertsCount > 0 ? 'terracotta' : 'green'}
          onClick={() => navigate('/production/variance')}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-[#183D32]">
                Production Cost Breakdown by Batch (₹)
              </h3>
              <p className="text-xs text-[#252B29]/60">
                Raw material, packaging, labour &amp; gas/electricity absorption per batch
              </p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.productionCostBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="runNumber" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `₹${val.toFixed(2)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="rawMaterial" name="Raw Material" stackId="a" fill="#183D32" />
                <Bar dataKey="packaging" name="Packaging" stackId="a" fill="#D9A441" />
                <Bar dataKey="labour" name="Labour" stackId="a" fill="#B85C38" />
                <Bar dataKey="gasPower" name="Gas & Power" stackId="a" fill="#4E8C76" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <h3 className="font-display text-base font-bold text-[#183D32]">
            Sales by Product Category
          </h3>
          <p className="text-xs text-[#252B29]/60 mb-3">Tax-inclusive revenue split (₹)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.categorySales}
                  dataKey="amountRupees"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {charts.categorySales.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => `₹${val.toFixed(2)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Wastage & Low Stock Alert Panel */}
        <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[#183D32]">
              Active Variance &amp; Stock Alerts
            </h3>
            <span className="rounded-full bg-[#B85C38]/12 px-2.5 py-0.5 text-xs font-semibold text-[#B85C38]">
              {alerts.wastageAlerts.length + alerts.lowStockAlerts.length} Active
            </span>
          </div>
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {alerts.wastageAlerts.map((a: any, idx: number) => (
              <div
                key={`w-${idx}`}
                onClick={() => navigate(`/production/${a.runId}`)}
                className="cursor-pointer rounded-xl border border-[#B85C38]/25 bg-[#FFF8ED] p-3 hover:border-[#B85C38] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#B85C38]">{a.type.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-semibold text-[#183D32]">{a.runNumber}</span>
                </div>
                <p className="mt-1 text-xs text-[#252B29]">{a.message}</p>
              </div>
            ))}
            {alerts.lowStockAlerts.map((l: any) => (
              <div
                key={l.id}
                onClick={() =>
                  navigate(
                    l.category === 'FINISHED_GOOD'
                      ? '/inventory/finished-goods'
                      : '/inventory/raw-materials',
                  )
                }
                className="cursor-pointer rounded-xl border border-[#D9A441]/35 bg-[#FFF8ED]/70 p-3 hover:border-[#D9A441] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8A6114]">LOW STOCK • {l.category.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-semibold text-[#252B29]">
                    {l.current} / {l.reorderLevel} {l.unit}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#252B29]">{l.name} is at or below reorder threshold.</p>
              </div>
            ))}
            {alerts.wastageAlerts.length === 0 && alerts.lowStockAlerts.length === 0 && (
              <p className="text-xs text-[#252B29]/60 py-6 text-center">
                All tolerances and stock buffers are healthy.
              </p>
            )}
          </div>
        </div>

        {/* Recent Sales Orders */}
        <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-[#183D32]">
              Recent Sales Orders &amp; Production
            </h3>
            <button
              onClick={() => navigate('/orders')}
              className="text-xs font-semibold text-[#183D32] hover:underline"
            >
              View all orders →
            </button>
          </div>
          <div className="space-y-2.5">
            {recentOrders.slice(0, 4).map((o: any) => (
              <div
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="cursor-pointer flex items-center justify-between rounded-xl border border-[#183D32]/10 p-3 hover:bg-[#FFF8ED]/55 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#183D32]">{o.orderNumber}</span>
                    {o.hasStockShortage && o.status === 'SUBMITTED' && (
                      <span className="rounded-full bg-[#B85C38]/12 px-2 py-0.5 text-[10px] font-bold text-[#B85C38]">
                        Stock Shortage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#252B29]/75 truncate">{o.customer.name}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs font-bold text-[#252B29] tabular-nums">
                    {formatINR(o.totalAmountPaisa)}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              </div>
            ))}
            {recentRuns.slice(0, 2).map((r: any) => (
              <div
                key={r.id}
                onClick={() => navigate(`/production/${r.id}`)}
                className="cursor-pointer flex items-center justify-between rounded-xl border border-[#D9A441]/25 bg-[#FFF8ED]/40 p-3 hover:bg-[#FFF8ED] transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-[#183D32]">
                    {r.runNumber} • {r.product.name}
                  </p>
                  <p className="text-[11px] text-[#252B29]/65 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {formatDate(r.productionDate)} • Output:{' '}
                    {r.actualGoodPackets}/{r.expectedOutputPackets} pkts
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
