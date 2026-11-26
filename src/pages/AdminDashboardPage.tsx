import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, PackageCheck, Receipt, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ErrorBanner, PageHeader, StatCard, StatusBadge } from '../components/UI';
import { Invoice, Product, SalesOrder } from '../types/erp';
import { formatDate, formatINR } from '../utils/format';

export function AdminDashboardPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<SalesOrder[]>('/sales/orders'),
      apiFetch<Invoice[]>('/sales/invoices'),
      apiFetch<Product[]>('/master/products'),
    ])
      .then(([o, inv, p]) => {
        setOrders(o);
        setInvoices(inv);
        setProducts(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const incoming = orders.filter((o) => o.status === 'SUBMITTED' || o.status === 'VERIFIED');
  const readyDispatch = orders.filter((o) => o.status === 'APPROVED' || o.status === 'INVOICED');
  const unpaidInvoices = invoices.filter(
    (inv) => inv.status === 'POSTED' && inv.totalAmountPaisa > inv.paidAmountPaisa,
  );
  const totalOutstanding = unpaidInvoices.reduce(
    (s, inv) => s + (inv.totalAmountPaisa - inv.paidAmountPaisa),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factory Admin Operations"
        subtitle="Verify incoming orders, check finished-goods stock, raise GST invoices & dispatch"
        actions={
          <>
            <button
              onClick={() => navigate('/orders')}
              className="rounded-xl border border-[#183D32]/20 bg-white px-4 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
            >
              All Orders
            </button>
            <button
              onClick={() => navigate('/payments')}
              className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              Record Payment
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Pending Verification"
          value={loading ? '...' : incoming.length}
          hint={`${incoming.filter((o) => o.hasStockShortage).length} with stock shortage`}
          icon={<AlertCircle className="w-5 h-5" />}
          tone="gold"
          onClick={() => navigate('/orders')}
        />
        <StatCard
          label="Ready to Invoice / Dispatch"
          value={loading ? '...' : readyDispatch.length}
          icon={<Truck className="w-5 h-5" />}
          tone="green"
          onClick={() => navigate('/orders')}
        />
        <StatCard
          label="Posted GST Invoices"
          value={loading ? '...' : invoices.filter((i) => i.status === 'POSTED').length}
          icon={<Receipt className="w-5 h-5" />}
          onClick={() => navigate('/invoices')}
        />
        <StatCard
          label="Receivables Outstanding"
          value={loading ? '...' : formatINR(totalOutstanding)}
          hint={`${unpaidInvoices.length} open invoices`}
          icon={<CreditCard className="w-5 h-5" />}
          tone="terracotta"
          onClick={() => navigate('/payments')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <h3 className="font-display text-base font-bold text-[#183D32] mb-3">
            Incoming Order Verification Queue
          </h3>
          {incoming.length === 0 ? (
            <p className="text-xs text-[#252B29]/60 py-6 text-center flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              All incoming orders have been processed.
            </p>
          ) : (
            <div className="space-y-2.5">
              {incoming.map((o) => (
                <div
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer rounded-xl border border-[#183D32]/12 p-3.5 hover:bg-[#FFF8ED]/60 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#183D32]">{o.orderNumber}</span>
                      {o.hasStockShortage && (
                        <span className="rounded-full bg-[#B85C38]/12 px-2 py-0.5 text-[10px] font-bold text-[#B85C38]">
                          Insufficient Stock
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#252B29]/80 mt-0.5">{o.customer.name}</p>
                    <p className="text-[11px] text-[#252B29]/55">
                      By {o.salesman.name} • {formatDate(o.orderDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums">{formatINR(o.totalAmountPaisa)}</p>
                    <div className="mt-1">
                      <StatusBadge status={o.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base font-bold text-[#183D32]">
              Finished Goods Availability
            </h3>
            <button
              onClick={() => navigate('/inventory/finished-goods')}
              className="text-xs font-semibold text-[#183D32] hover:underline"
            >
              Stock Ledger →
            </button>
          </div>
          <div className="space-y-2.5">
            {products.map((p) => {
              const low = p.currentStockPackets <= p.reorderLevelPackets;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-[#183D32]/10 p-3"
                >
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-10 w-10 rounded-lg object-cover border border-[#183D32]/10"
                      />
                    ) : (
                      <PackageCheck className="w-8 h-8 text-[#183D32]" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-[#183D32]">{p.name}</p>
                      <p className="text-[11px] text-[#252B29]/60">
                        {p.sku} • {formatINR(p.sellingPricePaisa)}/pkt
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        low ? 'text-[#B85C38]' : 'text-[#183D32]'
                      }`}
                    >
                      {p.currentStockPackets} pkts
                    </p>
                    <p className="text-[10px] text-[#252B29]/55">
                      Reorder @ {p.reorderLevelPackets}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
