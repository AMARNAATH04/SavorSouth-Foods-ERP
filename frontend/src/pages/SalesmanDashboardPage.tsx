import React, { useEffect, useState } from 'react';
import { ClipboardList, IndianRupee, MapPin, PlusCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ErrorBanner, PageHeader, StatCard, StatusBadge } from '../components/UI';
import { Customer, SalesOrder } from '../types/erp';
import { formatDate, formatINR } from '../utils/format';

export function SalesmanDashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([
      apiFetch<Customer[]>('/master/customers'),
      apiFetch<SalesOrder[]>('/sales/orders'),
    ])
      .then(([c, o]) => {
        setCustomers(c);
        setOrders(o);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const totalSalesPaisa = orders
    .filter((o) => o.status !== 'REJECTED' && o.status !== 'CANCELLED')
    .reduce((s, o) => s + o.totalAmountPaisa, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Salesman Hub"
        subtitle="Mobile-ready catalog ordering, assigned retail accounts & order tracking"
        actions={
          <button
            onClick={() => navigate('/orders/new')}
            className="flex items-center gap-2 rounded-xl bg-[#B85C38] px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#9E4B2B]"
          >
            <PlusCircle className="w-4 h-4" />
            Create New Order
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Assigned Customers"
          value={loading ? '...' : customers.length}
          icon={<Users className="w-5 h-5" />}
          tone="green"
        />
        <StatCard
          label="My Submitted Orders"
          value={loading ? '...' : orders.length}
          icon={<ClipboardList className="w-5 h-5" />}
          tone="gold"
        />
        <StatCard
          label="Customer-Wise Sales"
          value={loading ? '...' : formatINR(totalSalesPaisa)}
          icon={<IndianRupee className="w-5 h-5" />}
          tone="terracotta"
        />
      </div>

      {/* Assigned Customers Quick Cards */}
      <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] mb-3">
          Assigned Customers — Quick Order
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map((c) => {
            const custSales = orders
              .filter((o) => o.customerId === c.id && o.status !== 'REJECTED')
              .reduce((s, o) => s + o.totalAmountPaisa, 0);
            return (
              <div
                key={c.id}
                className="rounded-xl border border-[#183D32]/12 bg-[#FFF8ED]/45 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#183D32]/10 px-2 py-0.5 text-[10px] font-bold text-[#183D32]">
                      {c.type}
                    </span>
                    <span className="text-[11px] font-medium text-[#252B29]/65 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {c.city}, {c.state}
                    </span>
                  </div>
                  <h4 className="mt-2 font-display text-sm font-bold text-[#183D32]">{c.name}</h4>
                  <p className="text-xs text-[#252B29]/65 mt-0.5">{c.phone}</p>
                </div>
                <div className="flex items-center justify-between border-t border-[#183D32]/10 pt-3">
                  <div>
                    <p className="text-[10px] uppercase text-[#252B29]/55">Sales / Outstanding</p>
                    <p className="text-xs font-bold text-[#252B29] tabular-nums">
                      {formatINR(custSales)} /{' '}
                      <span className="text-[#B85C38]">{formatINR(c.outstandingPaisa ?? 0)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/orders/new?customerId=${c.id}`)}
                    className="rounded-lg bg-[#183D32] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#235344]"
                  >
                    Order →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Order History */}
      <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-bold text-[#183D32]">Recent Orders</h3>
          <button
            onClick={() => navigate('/my-orders')}
            className="text-xs font-semibold text-[#183D32] hover:underline"
          >
            View full history →
          </button>
        </div>
        <div className="space-y-2.5">
          {orders.slice(0, 6).map((o) => (
            <div
              key={o.id}
              onClick={() => navigate(`/orders/${o.id}`)}
              className="cursor-pointer flex items-center justify-between rounded-xl border border-[#183D32]/10 p-3.5 hover:bg-[#FFF8ED]/55"
            >
              <div>
                <p className="text-xs font-bold text-[#183D32]">
                  {o.orderNumber} • {o.customer.name}
                </p>
                <p className="text-[11px] text-[#252B29]/65 mt-0.5">
                  {formatDate(o.orderDate)} •{' '}
                  {o.items.map((i) => `${i.product.name} × ${i.quantityPackets}`).join(', ')}
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
      </div>
    </div>
  );
}
