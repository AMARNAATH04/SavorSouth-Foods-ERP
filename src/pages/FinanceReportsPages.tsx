import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Plus,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, downloadFile } from '../api/client';
import {
  ColumnDef,
  DataTable,
  Modal,
  PageHeader,
  StatCard,
} from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CompanySettings, Customer, ProductionRun } from '../types/erp';
import { formatDate, formatINR } from '../utils/format';

// 23. COSTING DASHBOARD
export function CostingDashboardPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<ProductionRun[]>('/production/runs'),
      apiFetch<CompanySettings>('/master/settings'),
    ])
      .then(([r, s]) => {
        setRuns(r.filter((item) => item.status === 'COMPLETED'));
        setSettings(s);
      })
      .finally(() => setLoading(false));
  }, []);

  const chartData = runs.map((r) => ({
    runNumber: r.runNumber,
    rawMaterial: r.rawMaterialCostPaisa / 100,
    packaging: r.packagingCostPaisa / 100,
    labour: r.labourCostPaisa / 100,
    gasPower: r.gasPowerCostPaisa / 100,
  }));

  const avgCost =
    runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + r.costPerPacketPaisa, 0) / runs.length)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufacturing Costing & Margin Dashboard"
        subtitle="Weighted average raw material valuation + direct batch labour & utility overhead allocation"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Costing' }]}
      />

      {settings && (
        <div className="rounded-2xl border border-[#D9A441]/40 bg-[#FFF8ED] p-4 flex items-start gap-3 text-xs text-[#183D32]">
          <Info className="w-5 h-5 text-[#B85C38] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Documented Valuation &amp; Overhead Allocation Rule</p>
            <p className="mt-1 text-[#252B29]/80">
              <strong>Raw Material &amp; Packaging Valuation:</strong> Weighted Average Cost (integer
              paisa total valuation divided by canonical base-unit quantity).{' '}
              <strong>Overhead Allocation:</strong> {settings.overheadAllocationRule}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Completed Costed Batches"
          value={loading ? '...' : runs.length}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard
          label="Average Cost / Packet"
          value={loading ? '...' : formatINR(avgCost)}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="gold"
        />
        <StatCard
          label="Total Batch Production Spend"
          value={
            loading
              ? '...'
              : formatINR(runs.reduce((s, r) => s + r.totalCostPaisa, 0))
          }
          icon={<TrendingUp className="w-5 h-5" />}
          tone="terracotta"
        />
      </div>

      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] mb-4">
          Component-Wise Batch Cost Breakdown (INR)
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="runNumber" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val: number) => `₹${val.toFixed(2)}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="rawMaterial" name="Raw Material" stackId="c" fill="#183D32" />
              <Bar dataKey="packaging" name="Packaging" stackId="c" fill="#D9A441" />
              <Bar dataKey="labour" name="Labour" stackId="c" fill="#B85C38" />
              <Bar dataKey="gasPower" name="Gas & Power" stackId="c" fill="#4E8C76" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <DataTable
        data={runs}
        loading={loading}
        columns={[
          { key: 'run', header: 'Run No', render: (r) => <span className="font-bold text-[#183D32]">{r.runNumber}</span> },
          { key: 'prod', header: 'Product', render: (r) => r.product.name },
          { key: 'out', header: 'Good Pkts', align: 'right', render: (r) => r.actualGoodPackets },
          { key: 'rm', header: 'Raw Material', align: 'right', render: (r) => formatINR(r.rawMaterialCostPaisa) },
          { key: 'pkg', header: 'Packaging', align: 'right', render: (r) => formatINR(r.packagingCostPaisa) },
          { key: 'lab', header: 'Labour', align: 'right', render: (r) => formatINR(r.labourCostPaisa) },
          { key: 'gas', header: 'Gas/Power', align: 'right', render: (r) => formatINR(r.gasPowerCostPaisa) },
          { key: 'tot', header: 'Total Cost', align: 'right', render: (r) => <span className="font-bold">{formatINR(r.totalCostPaisa)}</span> },
          { key: 'cpp', header: 'Cost/Pkt', align: 'right', render: (r) => <span className="font-bold text-[#183D32]">{formatINR(r.costPerPacketPaisa)}</span> },
          { key: 'sp', header: 'Selling Price', align: 'right', render: (r) => formatINR(r.product.sellingPricePaisa) },
          {
            key: 'margin',
            header: 'Gross Margin',
            align: 'right',
            render: (r) => {
              const sp = r.product.sellingPricePaisa;
              const margin = sp > 0 ? (((sp - r.costPerPacketPaisa) / sp) * 100).toFixed(1) : '0';
              return <span className="font-bold text-emerald-700">{margin}%</span>;
            },
          },
        ]}
      />
    </div>
  );
}

// 24. PAYMENT MANAGEMENT & RECEIVABLES AGEING
export function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [outstanding, setOutstanding] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [amountRupees, setAmountRupees] = useState('4000');
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'NEFT' | 'CASH' | 'RTGS' | 'CHEQUE'>('UPI');
  const [refNo, setRefNo] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const { user } = useAuth();
  const { showToast } = useToast();
  const canRecord = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<any[]>('/payments'),
      apiFetch<any[]>('/payments/outstanding'),
      apiFetch<Customer[]>('/master/customers'),
    ])
      .then(([p, o, c]) => {
        setPayments(p);
        setOutstanding(o);
        setCustomers(c);
        if (!customerId && c.length > 0) setCustomerId(c[0].id);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const selectedCustSummary = outstanding.find((o) => o.customerId === customerId);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amountPaisa = Math.round(Number(amountRupees) * 100);
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          amountPaisa,
          paymentMode,
          referenceNumber: refNo || undefined,
          ...(selectedInvoiceId
            ? { allocations: [{ invoiceId: selectedInvoiceId, allocatedAmountPaisa: amountPaisa }] }
            : {}),
        }),
      });
      showToast('Payment Recorded & Allocated');
      setModalOpen(false);
      setRefNo('');
      load();
    } catch (err: any) {
      showToast('Payment Error', err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Receivables Ageing"
        subtitle="Invoice-wise payment allocation, partial settlements, and customer outstanding ageing"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
        actions={
          canRecord && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Record Payment
            </button>
          )
        }
      />

      {/* Customer Outstanding & Ageing Table */}
      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-5 shadow-card space-y-3">
        <h3 className="font-display text-base font-bold text-[#183D32] flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#B85C38]" />
          Customer Outstanding &amp; Ageing Summary
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-[#FFF8ED] text-[#183D32]">
              <tr>
                <th className="px-3 py-2.5 text-left">Customer</th>
                <th className="px-3 py-2.5 text-right">Invoiced</th>
                <th className="px-3 py-2.5 text-right">Collected</th>
                <th className="px-3 py-2.5 text-right">Outstanding</th>
                <th className="px-3 py-2.5 text-right">0–30 Days</th>
                <th className="px-3 py-2.5 text-right">31–60 Days</th>
                <th className="px-3 py-2.5 text-right">60+ Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#183D32]/10">
              {outstanding.map((o) => (
                <tr key={o.customerId}>
                  <td className="px-3 py-2.5 font-semibold text-[#183D32]">
                    {o.customerName}
                    <span className="block text-[10px] text-[#252B29]/60">{o.state}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatINR(o.totalInvoicedPaisa)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {formatINR(o.totalPaidPaisa)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#B85C38]">
                    {formatINR(o.outstandingPaisa)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatINR(o.bucket0to30Paisa)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatINR(o.bucket31to60Paisa)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatINR(o.bucket61to90Paisa + o.bucket90PlusPaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <DataTable
        data={payments}
        loading={loading}
        searchPlaceholder="Search payment #, customer, ref..."
        searchKeys={(p) => `${p.paymentNumber} ${p.customer.name} ${p.referenceNumber ?? ''}`}
        columns={[
          { key: 'no', header: 'Payment No', render: (p) => <span className="font-bold text-[#183D32]">{p.paymentNumber}</span> },
          { key: 'date', header: 'Date', render: (p) => formatDate(p.paymentDate) },
          { key: 'cust', header: 'Customer', render: (p) => p.customer.name },
          { key: 'mode', header: 'Mode', render: (p) => <span className="rounded-lg bg-[#FFF8ED] px-2 py-0.5 text-xs font-semibold">{p.paymentMode}</span> },
          { key: 'ref', header: 'Reference', render: (p) => p.referenceNumber || '-' },
          {
            key: 'alloc',
            header: 'Invoice Allocations',
            render: (p) =>
              p.allocations
                .map((a: any) => `${a.invoice.invoiceNumber} (${formatINR(a.allocatedAmountPaisa)})`)
                .join(', ') || 'On Account',
          },
          { key: 'amt', header: 'Amount', align: 'right', render: (p) => <span className="font-bold text-emerald-700">{formatINR(p.amountPaisa)}</span> },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Customer Payment" size="sm">
        <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Customer *</label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSelectedInvoiceId('');
              }}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedCustSummary && selectedCustSummary.openInvoices.length > 0 && (
            <div>
              <label className="font-semibold text-[#183D32]">Allocate to Invoice (Optional)</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              >
                <option value="">Auto-allocate FIFO</option>
                {selectedCustSummary.openInvoices.map((inv: any) => (
                  <option key={inv.invoiceId} value={inv.invoiceId}>
                    {inv.invoiceNumber} (Due: {formatINR(inv.balancePaisa)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#183D32]">Amount (INR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm font-bold"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              >
                {['UPI', 'NEFT', 'RTGS', 'CASH', 'CHEQUE'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">UTR / Reference No</label>
            <input
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g., UPI-849201"
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
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
              className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white"
            >
              Record Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 25. REPORTS & EXPORTS (All 14 Required Reports)
const REPORT_LIST = [
  { key: 'sales_register', label: 'Sales Register', group: 'Sales & GST' },
  { key: 'customer_sales', label: 'Customer-Wise Sales', group: 'Sales & GST' },
  { key: 'product_sales', label: 'Product-Wise Sales', group: 'Sales & GST' },
  { key: 'gst_summary', label: 'GST Outward Supply Summary', group: 'Sales & GST' },
  { key: 'purchase_register', label: 'Purchase Register', group: 'Inventory' },
  { key: 'raw_material_stock', label: 'Raw Material & Pkg Stock', group: 'Inventory' },
  { key: 'finished_goods_stock', label: 'Finished Goods Stock', group: 'Inventory' },
  { key: 'stock_ledger', label: 'Stock Movement Ledger', group: 'Inventory' },
  { key: 'production_report', label: 'Production Report', group: 'Production & Costing' },
  { key: 'consumption_variance', label: 'Planned vs Actual Consumption', group: 'Production & Costing' },
  { key: 'wastage_report', label: 'Wastage & Damaged Pkg', group: 'Production & Costing' },
  { key: 'costing_report', label: 'Costing & Profitability', group: 'Production & Costing' },
  { key: 'payment_report', label: 'Payment & Collection', group: 'Receivables' },
  { key: 'outstanding_ageing', label: 'Outstanding Ageing', group: 'Receivables' },
];

export function ReportsPage() {
  const [selectedKey, setSelectedKey] = useState('sales_register');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [report, setReport] = useState<{
    title: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    return params.toString();
  };

  useEffect(() => {
    setLoading(true);
    const qs = buildQuery();
    apiFetch<{ title: string; columns: string[]; rows: Array<Record<string, unknown>> }>(
      `/reports/${selectedKey}${qs ? `?${qs}` : ''}`,
    )
      .then(setReport)
      .finally(() => setLoading(false));
  }, [selectedKey, fromDate, toDate]);

  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    const qs = buildQuery();
    const sep = qs ? '&' : '';
    try {
      await downloadFile(
        `/reports/${selectedKey}?${qs}${sep}format=${format}`,
        `savorsouth-${selectedKey}.${format}`,
      );
      showToast(`Exported ${format.toUpperCase()} Report`);
    } catch (err: any) {
      showToast('Export Failed', err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit & Management Reports"
        subtitle="14 statutory, production, inventory, GST & costing reports with Excel, CSV & PDF exports"
        breadcrumbs={[{ label: 'Audit' }, { label: 'Reports' }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleExport('xlsx')}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center gap-1.5 rounded-xl border border-[#183D32]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex items-center gap-1.5 rounded-xl bg-[#B85C38] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#9E4B2B]"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Report Selector Pills & Date Filter */}
      <div className="rounded-2xl border border-[#183D32]/12 bg-white p-4 shadow-card space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {REPORT_LIST.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelectedKey(r.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedKey === r.key
                  ? 'bg-[#183D32] text-white'
                  : 'bg-[#FFF8ED] text-[#183D32] hover:bg-[#D9A441]/25'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#183D32]/10 pt-3 text-xs">
          <span className="font-semibold text-[#183D32]">Date Filter:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-xl border border-[#183D32]/20 px-3 py-1.5"
          />
          <span>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-xl border border-[#183D32]/20 px-3 py-1.5"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="text-xs font-semibold text-[#B85C38] hover:underline"
            >
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {/* Live Report Table */}
      <div className="rounded-2xl border border-[#183D32]/12 bg-white shadow-card overflow-hidden">
        <div className="border-b border-[#183D32]/10 bg-[#FFF8ED]/60 px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[#183D32]">
            {report?.title || 'Loading report...'}
          </h3>
          <span className="text-xs text-[#252B29]/65">{report?.rows.length ?? 0} rows</span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-xl bg-[#FFF8ED]" />
            ))}
          </div>
        ) : !report || report.rows.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#252B29]/60">
            No records matched the selected report &amp; date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#183D32]/5 text-[#183D32] font-semibold">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c} className="px-4 py-3 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#183D32]/8">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#FFF8ED]/45">
                    {Object.values(row).map((val, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                        {typeof val === 'number' ? val.toLocaleString('en-IN') : String(val ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
