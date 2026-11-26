import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import {
  ColumnDef,
  DataTable,
  ErrorBanner,
  Modal,
  PageHeader,
  StatusBadge,
} from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CompanySettings, Customer, Invoice, Product, SalesOrder } from '../types/erp';
import { formatDate, formatINR, generateInvoicePdf } from '../utils/format';

// 4. CREATE ORDER (Visual Product Catalogue + Live GST & Stock Check)
export function CreateOrderPage() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') || '');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      apiFetch<Customer[]>('/master/customers'),
      apiFetch<Product[]>('/master/products?activeOnly=true'),
    ])
      .then(([custs, prods]) => {
        setCustomers(custs);
        setProducts(prods);
        if (!customerId && custs.length > 0) setCustomerId(custs[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const isInterState = selectedCustomer ? selectedCustomer.stateCode !== '33' : false;

  const categories = useMemo(
    () => ['ALL', ...Array.from(new Set(products.map((p) => p.category)))],
    [products],
  );

  const visibleProducts = products.filter((p) => {
    const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    const matchQ =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const cartItems = products
    .filter((p) => (cart[p.id] ?? 0) > 0)
    .map((p) => {
      const qty = cart[p.id];
      const taxable = p.sellingPricePaisa * qty;
      const tax = Math.round((taxable * p.gstRateBps) / 10000);
      const shortage = Math.max(0, qty - p.currentStockPackets);
      return { product: p, qty, taxable, tax, total: taxable + tax, shortage };
    });

  const subtotalPaisa = cartItems.reduce((s, i) => s + i.taxable, 0);
  const totalTaxPaisa = cartItems.reduce((s, i) => s + i.tax, 0);
  const grandTotalPaisa = subtotalPaisa + totalTaxPaisa;
  const anyShortage = cartItems.some((i) => i.shortage > 0);

  const updateQty = (productId: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!customerId) {
      showToast('Select Customer', 'Please choose a retailer or distributor.', 'error');
      return;
    }
    if (cartItems.length === 0) {
      showToast('Empty Order', 'Add at least one snack product quantity.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<SalesOrder>('/sales/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          notes,
          items: cartItems.map((i) => ({
            productId: i.product.id,
            quantityPackets: i.qty,
          })),
        }),
      });
      showToast(
        `Order ${created.orderNumber} Submitted`,
        created.hasStockShortage
          ? 'Submitted with stock shortage alert for Factory Admin review.'
          : 'Sent to Factory Admin for verification & GST billing.',
        created.hasStockShortage ? 'info' : 'success',
      );
      navigate(`/orders/${created.id}`);
    } catch (err: any) {
      showToast('Order Failed', err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Sales Order"
        subtitle="Select customer, browse SavorSouth snack catalog, and submit order with live GST preview"
        breadcrumbs={[{ label: 'Sales' }, { label: 'Create Order' }]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Catalog Section */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-2xl border border-[#183D32]/10 bg-white p-4 shadow-card space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#252B29]/45" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search snacks by name or SKU..."
                  className="w-full rounded-xl border border-[#183D32]/15 bg-[#FFF8ED]/40 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#183D32] focus:bg-white"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      categoryFilter === cat
                        ? 'bg-[#183D32] text-white'
                        : 'bg-[#FFF8ED] text-[#183D32] hover:bg-[#D9A441]/25'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleProducts.map((product) => {
                const qty = cart[product.id] ?? 0;
                const shortage = qty > product.currentStockPackets;
                return (
                  <motion.div
                    key={product.id}
                    whileHover={{ y: -2 }}
                    className="group rounded-2xl border border-[#183D32]/10 bg-white overflow-hidden shadow-card hover:shadow-elevated transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-square bg-[#FFF8ED] overflow-hidden">
                        <img
                          src={product.imageUrl || '/images/products/murukku.jpg'}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span
                          className={`absolute top-2.5 right-2.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-sm ${
                            product.currentStockPackets <= 0
                              ? 'bg-[#B85C38] text-white'
                              : product.currentStockPackets <= product.reorderLevelPackets
                                ? 'bg-[#D9A441] text-[#183D32]'
                                : 'bg-[#183D32]/90 text-[#FFF8ED]'
                          }`}
                        >
                          Stock: {product.currentStockPackets} pkts
                        </span>
                        <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#183D32]">
                          {product.category}
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-sm font-bold text-[#183D32] leading-snug">
                            {product.name}
                          </h4>
                          <span className="text-sm font-extrabold text-[#B85C38] tabular-nums shrink-0">
                            {formatINR(product.sellingPricePaisa)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#252B29]/65">
                          SKU: {product.sku} • HSN: {product.hsnCode} • GST {(product.gstRateBps / 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    <div className="px-4 pb-4 space-y-2">
                      {shortage && (
                        <p className="text-[11px] font-semibold text-[#B85C38] flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Shortage: {qty - product.currentStockPackets} pkts
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQty(product.id, qty - 10)}
                          className="rounded-xl border border-[#183D32]/20 p-2 text-[#183D32] hover:bg-[#FFF8ED]"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty || ''}
                          placeholder="0 pkts"
                          onChange={(e) => updateQty(product.id, Math.max(0, Number(e.target.value)))}
                          className="w-full rounded-xl border border-[#183D32]/20 py-1.5 px-2 text-center text-sm font-semibold tabular-nums outline-none focus:border-[#183D32]"
                        />
                        <button
                          type="button"
                          onClick={() => updateQty(product.id, qty + 10)}
                          className="rounded-xl bg-[#183D32] p-2 text-white hover:bg-[#235344]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Order Summary Sticky Card */}
        <div className="space-y-4">
          <div className="sticky top-20 rounded-2xl border border-[#183D32]/15 bg-white p-5 shadow-elevated space-y-4">
            <div className="flex items-center justify-between border-b border-[#183D32]/10 pb-3">
              <h3 className="font-display text-base font-bold text-[#183D32] flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#D9A441]" />
                Order Summary
              </h3>
              <span className="rounded-full bg-[#FFF8ED] px-2.5 py-0.5 text-xs font-semibold text-[#183D32]">
                {cartItems.length} SKUs
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#183D32] mb-1.5">
                Select Customer
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-xl border border-[#183D32]/20 bg-[#FFF8ED]/35 px-3 py-2 text-sm outline-none focus:border-[#183D32]"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.state} - {c.stateCode})
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <p className="mt-1.5 text-[11px] text-[#252B29]/70">
                  Tax Rule:{' '}
                  <strong className="text-[#183D32]">
                    {isInterState
                      ? `Inter-State IGST (${selectedCustomer.state} ${selectedCustomer.stateCode})`
                      : `Intra-State CGST + SGST (Tamil Nadu 33)`}
                  </strong>
                </p>
              )}
            </div>

            {anyShortage && (
              <div className="rounded-xl border border-[#B85C38]/35 bg-[#B85C38]/10 p-3 text-xs text-[#B85C38]">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Insufficient Finished Goods Stock
                </p>
                <p className="mt-1">
                  You can still submit this order for Admin review, or reduce quantity to match
                  available packets. Admin dispatch will remain blocked until stock is produced.
                </p>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto divide-y divide-[#183D32]/10">
              {cartItems.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#252B29]/55">
                  Enter packet quantities on product cards to build order.
                </p>
              ) : (
                cartItems.map((item) => (
                  <div key={item.product.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-[#183D32]">{item.product.name}</p>
                      <p className="text-[#252B29]/60">
                        {item.qty} pkts × {formatINR(item.product.sellingPricePaisa)}
                        {item.shortage > 0 && (
                          <span className="ml-1.5 font-bold text-[#B85C38]">
                            (Shortage: {item.shortage})
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="font-bold tabular-nums">{formatINR(item.taxable)}</p>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[#183D32]/10 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#252B29]/70">Taxable Subtotal</span>
                <span className="font-semibold tabular-nums">{formatINR(subtotalPaisa)}</span>
              </div>
              {isInterState ? (
                <div className="flex justify-between">
                  <span className="text-[#252B29]/70">Estimated IGST</span>
                  <span className="font-semibold tabular-nums">{formatINR(totalTaxPaisa)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-[#252B29]/70">CGST (Half)</span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(Math.floor(totalTaxPaisa / 2))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#252B29]/70">SGST (Half)</span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(totalTaxPaisa - Math.floor(totalTaxPaisa / 2))}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-[#183D32]/10 pt-2 text-sm font-extrabold text-[#183D32]">
                <span>Estimated Total</span>
                <span className="tabular-nums">{formatINR(grandTotalPaisa)}</span>
              </div>
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions or notes..."
              className="w-full rounded-xl border border-[#183D32]/15 bg-[#FFF8ED]/30 p-2.5 text-xs outline-none focus:border-[#183D32]"
            />

            <button
              onClick={handleSubmit}
              disabled={submitting || cartItems.length === 0}
              className="w-full rounded-xl bg-[#183D32] py-3 text-sm font-semibold text-white shadow hover:bg-[#235344] disabled:opacity-50 transition-all"
            >
              {submitting ? 'Submitting Order...' : 'Submit Sales Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 5 & 7. ORDERS LIST (Incoming Orders / My Orders)
export function OrdersListPage({ mineOnly = false }: { mineOnly?: boolean }) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    apiFetch<SalesOrder[]>('/sales/orders')
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [mineOnly]);

  const filtered =
    statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter);

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'orderNumber',
      header: 'Order No',
      sortValue: (o) => o.orderNumber,
      render: (o) => (
        <div>
          <span className="font-bold text-[#183D32]">{o.orderNumber}</span>
          {o.hasStockShortage && o.status !== 'DISPATCHED' && o.status !== 'REJECTED' && (
            <span className="ml-2 rounded-full bg-[#B85C38]/12 px-2 py-0.5 text-[10px] font-bold text-[#B85C38]">
              Shortage
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (o) => o.customer.name,
      render: (o) => (
        <div>
          <p className="font-medium text-[#252B29]">{o.customer.name}</p>
          <p className="text-[11px] text-[#252B29]/60">
            {o.customer.city}, {o.customer.state} ({o.customer.stateCode})
          </p>
        </div>
      ),
    },
    {
      key: 'salesman',
      header: 'Salesman',
      render: (o) => <span className="text-xs">{o.salesman.name}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (o) => o.orderDate,
      render: (o) => <span className="text-xs">{formatDate(o.orderDate)}</span>,
    },
    {
      key: 'total',
      header: 'Order Total',
      align: 'right',
      sortValue: (o) => o.totalAmountPaisa,
      render: (o) => <span className="font-bold">{formatINR(o.totalAmountPaisa)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge status={o.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={mineOnly ? 'My Sales Orders' : 'Incoming Sales Orders'}
        subtitle="Track order submissions, verification, stock checks, GST billing, and dispatch"
        breadcrumbs={[{ label: 'Sales' }, { label: mineOnly ? 'My Orders' : 'Incoming Orders' }]}
        actions={
          <button
            onClick={() => navigate('/orders/new')}
            className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            + Create Order
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <DataTable
        data={filtered}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search order #, customer, state..."
        searchKeys={(o) => `${o.orderNumber} ${o.customer.name} ${o.customer.state} ${o.salesman.name}`}
        onRowClick={(o) => navigate(`/orders/${o.id}`)}
        filterSlot={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#183D32]/15 bg-white px-3 py-2 text-xs font-medium outline-none"
          >
            {['ALL', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'INVOICED', 'DISPATCHED', 'REJECTED'].map(
              (st) => (
                <option key={st} value={st}>
                  Status: {st}
                </option>
              ),
            )}
          </select>
        }
      />
    </div>
  );
}

// 8. ORDER DETAILS (Workflow Stepper, Edit Quantities/Prices, Approve/Reject/Invoice/Dispatch)
export function OrderDetailsPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editRows, setEditRows] = useState<
    Array<{ productId: string; quantityPackets: number; unitPriceRupees: number }>
  >([]);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const canManage = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    if (!id) return;
    setLoading(true);
    apiFetch<SalesOrder>(`/sales/orders/${id}`)
      .then((o) => {
        setOrder(o);
        setEditRows(
          o.items.map((it) => ({
            productId: it.productId,
            quantityPackets: it.quantityPackets,
            unitPriceRupees: it.unitPricePaisa / 100,
          })),
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const runAction = async (fn: () => Promise<any>, successTitle: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(successTitle);
      load();
    } catch (err: any) {
      showToast('Action Blocked', err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  if (!order) return <ErrorBanner message="Sales order not found" />;

  const steps = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'INVOICED', 'DISPATCHED'];
  const currentStepIdx = steps.indexOf(order.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`${order.customer.name} • ${order.customer.state} (${order.customer.stateCode}) • Submitted by ${order.salesman.name}`}
        breadcrumbs={[{ label: 'Orders', to: '/orders' }, { label: order.orderNumber }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {order.invoice && (
              <button
                onClick={() => navigate(`/invoices/${order.invoice!.id}`)}
                className="flex items-center gap-1.5 rounded-xl bg-[#D9A441] px-4 py-2 text-xs font-bold text-[#183D32] hover:bg-[#C69332]"
              >
                <FileText className="w-4 h-4" />
                View GST Invoice ({order.invoice.invoiceNumber})
              </button>
            )}
            {canManage && (order.status === 'SUBMITTED' || order.status === 'VERIFIED') && (
              <>
                <button
                  disabled={busy}
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-xl border border-[#183D32]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
                >
                  {editing ? 'Cancel Edit' : 'Verify / Edit Qty & Price'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setRejectModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-[#B85C38]/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#B85C38] hover:bg-[#B85C38]/10"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      () => apiFetch(`/sales/orders/${order.id}/approve`, { method: 'POST' }),
                      'Order Approved',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344] disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Order
                </button>
              </>
            )}
            {canManage && order.status === 'APPROVED' && (
              <button
                disabled={busy}
                onClick={() =>
                  runAction(
                    () => apiFetch(`/sales/orders/${order.id}/invoice`, { method: 'POST' }),
                    'GST Invoice Generated',
                  )
                }
                className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
              >
                <Receipt className="w-4 h-4" />
                Generate GST Invoice
              </button>
            )}
            {canManage && (order.status === 'INVOICED' || order.status === 'APPROVED') && (
              <button
                disabled={busy}
                onClick={() =>
                  runAction(
                    () => apiFetch(`/sales/orders/${order.id}/dispatch`, { method: 'POST' }),
                    'Order Dispatched & Stock Deducted',
                  )
                }
                className="flex items-center gap-1.5 rounded-xl bg-[#B85C38] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9E4B2B]"
              >
                <Truck className="w-4 h-4" />
                Record Dispatch
              </button>
            )}
          </div>
        }
      />

      {/* Workflow Stepper */}
      <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#252B29]/60">
            Order-to-Dispatch Workflow
          </span>
          <StatusBadge status={order.status} />
        </div>
        {order.status === 'REJECTED' ? (
          <div className="rounded-xl bg-[#B85C38]/10 border border-[#B85C38]/30 p-3 text-xs text-[#B85C38]">
            <strong>Rejected:</strong> {order.rejectionReason}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {steps.map((st, idx) => {
              const done = currentStepIdx >= idx;
              return (
                <div
                  key={st}
                  className={`rounded-xl border p-2.5 text-center text-[11px] font-semibold transition-colors ${
                    done
                      ? 'border-[#183D32] bg-[#183D32] text-white'
                      : 'border-[#183D32]/15 bg-[#FFF8ED]/40 text-[#252B29]/60'
                  }`}
                >
                  {idx + 1}. {st}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Finished Goods Availability Check */}
      {order.stockCheck && order.status !== 'DISPATCHED' && order.status !== 'REJECTED' && (
        <div
          className={`rounded-2xl border p-5 shadow-card ${
            order.stockCheck.hasShortage
              ? 'border-[#B85C38]/40 bg-[#B85C38]/8'
              : 'border-emerald-200 bg-emerald-50/60'
          }`}
        >
          <h3 className="font-display text-sm font-bold text-[#183D32] flex items-center gap-2">
            {order.stockCheck.hasShortage ? (
              <AlertTriangle className="w-4 h-4 text-[#B85C38]" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            )}
            Finished Goods Stock Availability Check
          </h3>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {order.stockCheck.items.map((sc) => (
              <div
                key={sc.productId}
                className="rounded-xl bg-white border border-[#183D32]/10 p-3 text-xs"
              >
                <p className="font-bold text-[#183D32]">{sc.productName}</p>
                <div className="mt-1.5 flex justify-between text-[#252B29]/75">
                  <span>Requested: {sc.requested} pkts</span>
                  <span>Available: {sc.available} pkts</span>
                </div>
                {!sc.sufficient ? (
                  <p className="mt-1.5 font-bold text-[#B85C38]">
                    Insufficient Stock — Shortage: {sc.shortage} packets
                  </p>
                ) : (
                  <p className="mt-1.5 font-semibold text-emerald-700">Stock Sufficient</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line Items Table (Editable during verification) */}
      <div className="rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-[#183D32] mb-3">Order Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FFF8ED] text-xs font-semibold text-[#183D32]">
              <tr>
                <th className="px-4 py-2.5 text-left">Product</th>
                <th className="px-4 py-2.5 text-right">Quantity (Pkts)</th>
                <th className="px-4 py-2.5 text-right">Unit Price (INR)</th>
                <th className="px-4 py-2.5 text-right">GST %</th>
                <th className="px-4 py-2.5 text-right">Taxable</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#183D32]/10">
              {order.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-[#183D32]">
                    {item.product.name}
                    <span className="block text-[11px] text-[#252B29]/60">
                      HSN {item.product.hsnCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        type="number"
                        min={1}
                        value={editRows[idx]?.quantityPackets ?? item.quantityPackets}
                        onChange={(e) => {
                          const next = [...editRows];
                          next[idx] = { ...next[idx], quantityPackets: Number(e.target.value) };
                          setEditRows(next);
                        }}
                        className="w-24 rounded-lg border border-[#183D32]/25 px-2 py-1 text-right"
                      />
                    ) : (
                      item.quantityPackets
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {editing ? (
                      <input
                        type="number"
                        step="0.5"
                        value={editRows[idx]?.unitPriceRupees ?? item.unitPricePaisa / 100}
                        onChange={(e) => {
                          const next = [...editRows];
                          next[idx] = { ...next[idx], unitPriceRupees: Number(e.target.value) };
                          setEditRows(next);
                        }}
                        className="w-24 rounded-lg border border-[#183D32]/25 px-2 py-1 text-right"
                      />
                    ) : (
                      formatINR(item.unitPricePaisa)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(item.gstRateBps / 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatINR(item.lineSubtotalPaisa)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {formatINR(item.lineTotalPaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing && (
          <div className="mt-4 flex justify-end">
            <button
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await apiFetch(`/sales/orders/${order.id}/verify`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      items: editRows.map((r) => ({
                        productId: r.productId,
                        quantityPackets: r.quantityPackets,
                        unitPricePaisa: Math.round(r.unitPriceRupees * 100),
                      })),
                    }),
                  });
                  setEditing(false);
                }, 'Order Verified & Updated')
              }
              className="rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              Save Verification Changes
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col items-end gap-1 border-t border-[#183D32]/10 pt-4 text-xs">
          <div className="flex w-64 justify-between">
            <span className="text-[#252B29]/70">Taxable Subtotal:</span>
            <span className="font-semibold tabular-nums">{formatINR(order.subtotalPaisa)}</span>
          </div>
          <div className="flex w-64 justify-between">
            <span className="text-[#252B29]/70">Estimated GST:</span>
            <span className="font-semibold tabular-nums">{formatINR(order.estimatedTaxPaisa)}</span>
          </div>
          <div className="flex w-64 justify-between text-sm font-extrabold text-[#183D32] pt-1">
            <span>Total Amount:</span>
            <span className="tabular-nums">{formatINR(order.totalAmountPaisa)}</span>
          </div>
        </div>
      </div>

      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Sales Order" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-[#252B29]/75">
            Provide a reason for rejecting {order.orderNumber}. This is recorded in the audit log.
          </p>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g., Insufficient stock or credit limit exceeded"
            className="w-full rounded-xl border border-[#183D32]/20 p-3 text-sm outline-none focus:border-[#183D32]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRejectModal(false)}
              className="rounded-xl border px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              disabled={rejectReason.trim().length < 3 || busy}
              onClick={() =>
                runAction(async () => {
                  await apiFetch(`/sales/orders/${order.id}/reject`, {
                    method: 'POST',
                    body: JSON.stringify({ reason: rejectReason }),
                  });
                  setRejectModal(false);
                }, 'Order Rejected')
              }
              className="rounded-xl bg-[#B85C38] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// 9. INVOICE MANAGEMENT
export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const canManage = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    setLoading(true);
    apiFetch<Invoice[]>('/sales/invoices')
      .then(setInvoices)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCancelInvoice = async () => {
    if (!cancelTarget) return;
    try {
      await apiFetch(`/sales/invoices/${cancelTarget.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      showToast('Invoice Cancelled & Credit Note Issued');
      setCancelTarget(null);
      setReason('');
      load();
    } catch (err: any) {
      showToast('Cannot Cancel Invoice', err.message, 'error');
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice No',
      sortValue: (i) => i.invoiceNumber,
      render: (i) => (
        <div>
          <span className="font-bold text-[#183D32]">{i.invoiceNumber}</span>
          {i.creditNoteNumber && (
            <span className="block text-[10px] font-semibold text-[#B85C38]">
              Credit Note: {i.creditNoteNumber}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (i) => i.customer.name,
      render: (i) => (
        <div>
          <p className="font-medium">{i.customer.name}</p>
          <p className="text-[11px] text-[#252B29]/60">
            {i.isInterState ? `IGST (${i.customer.state})` : 'CGST + SGST (Tamil Nadu)'}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (i) => i.invoiceDate,
      render: (i) => <span className="text-xs">{formatDate(i.invoiceDate)}</span>,
    },
    {
      key: 'taxable',
      header: 'Taxable',
      align: 'right',
      render: (i) => formatINR(i.taxableAmountPaisa),
    },
    {
      key: 'gst',
      header: 'GST',
      align: 'right',
      render: (i) => formatINR(i.cgstPaisa + i.sgstPaisa + i.igstPaisa),
    },
    {
      key: 'total',
      header: 'Invoice Total',
      align: 'right',
      sortValue: (i) => i.totalAmountPaisa,
      render: (i) => <span className="font-bold">{formatINR(i.totalAmountPaisa)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance Due',
      align: 'right',
      render: (i) => (
        <span
          className={`font-semibold ${
            i.totalAmountPaisa - i.paidAmountPaisa > 0 && i.status === 'POSTED'
              ? 'text-[#B85C38]'
              : 'text-emerald-700'
          }`}
        >
          {i.status === 'CANCELLED' ? '₹0.00' : formatINR(i.totalAmountPaisa - i.paidAmountPaisa)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <StatusBadge status={i.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (i) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/invoices/${i.id}`)}
            className="rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-xs font-semibold text-[#183D32] hover:bg-[#183D32] hover:text-white transition-colors"
          >
            PDF / View
          </button>
          {canManage && i.status === 'POSTED' && i.paidAmountPaisa === 0 && (
            <button
              onClick={() => setCancelTarget(i)}
              className="rounded-lg bg-[#B85C38]/10 px-2.5 py-1 text-xs font-semibold text-[#B85C38] hover:bg-[#B85C38] hover:text-white transition-colors"
            >
              Credit Note
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="GST Invoice Management"
        subtitle="Financial-year Tax Invoices with CGST+SGST (TN) & IGST (Inter-State) + Credit Notes"
        breadcrumbs={[{ label: 'Sales' }, { label: 'GST Invoices' }]}
      />

      <DataTable
        data={invoices}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search invoice number, customer..."
        searchKeys={(i) => `${i.invoiceNumber} ${i.customer.name} ${i.financialYear}`}
        onRowClick={(i) => navigate(`/invoices/${i.id}`)}
      />

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Issue Credit Note for ${cancelTarget?.invoiceNumber}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#252B29]/75">
            Posted GST invoices are never deleted. Cancelling marks the invoice as CANCELLED and
            generates a sequential Credit Note record.
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for credit note cancellation..."
            className="w-full rounded-xl border border-[#183D32]/20 p-3 text-sm outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCancelTarget(null)}
              className="rounded-xl border px-4 py-2 text-xs font-medium"
            >
              Keep Invoice
            </button>
            <button
              disabled={reason.trim().length < 3}
              onClick={handleCancelInvoice}
              className="rounded-xl bg-[#B85C38] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Cancel &amp; Issue Credit Note
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// 10. INVOICE PDF PREVIEW & DOWNLOAD
export function InvoiceDetailPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState<{ invoice: Invoice; company: CompanySettings } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ invoice: Invoice; company: CompanySettings }>(`/sales/invoices/${id}`)
      .then(setPayload)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-white" />;
  if (!payload) return <ErrorBanner message="Invoice not found" />;

  const { invoice, company } = payload;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Tax Invoice ${invoice.invoiceNumber}`}
        subtitle={`Financial Year ${invoice.financialYear} • ${
          invoice.isInterState ? 'Inter-State IGST' : 'Intra-State CGST + SGST'
        }`}
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: invoice.invoiceNumber }]}
        actions={
          <>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-[#183D32]/20 bg-white px-4 py-2 text-xs font-semibold text-[#183D32] hover:bg-[#FFF8ED]"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={() => generateInvoicePdf(invoice, company)}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Download className="w-4 h-4" />
              Download GST PDF
            </button>
          </>
        }
      />

      {/* Printable Invoice Card */}
      <div className="mx-auto max-w-4xl rounded-2xl border border-[#183D32]/15 bg-white shadow-elevated overflow-hidden">
        <div className="bg-[#183D32] p-6 sm:p-8 text-[#FFF8ED] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-white">
              {company.companyName}
            </h2>
            <p className="text-xs text-[#D9A441] font-medium">{company.tagline}</p>
            <p className="mt-2 text-xs text-[#FFF8ED]/80">
              {company.address}, {company.city}, {company.state} ({company.stateCode})
            </p>
            <p className="text-xs text-[#FFF8ED]/80">
              GSTIN: <strong>{company.gstin}</strong> • FSSAI: {company.fssaiLicense}
            </p>
          </div>
          <div className="sm:text-right">
            <span className="inline-block rounded-lg bg-[#D9A441] px-3 py-1 text-xs font-extrabold text-[#183D32]">
              {invoice.status === 'CANCELLED' ? 'CANCELLED (CREDIT NOTE)' : 'TAX INVOICE'}
            </span>
            <p className="mt-2 font-display text-lg font-bold text-white">{invoice.invoiceNumber}</p>
            <p className="text-xs text-[#FFF8ED]/80">Date: {formatDate(invoice.invoiceDate)}</p>
            {invoice.creditNoteNumber && (
              <p className="text-xs font-bold text-[#D9A441]">CN: {invoice.creditNoteNumber}</p>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="rounded-xl bg-[#FFF8ED] p-4 flex flex-col sm:flex-row sm:justify-between gap-4 text-xs">
            <div>
              <p className="font-bold uppercase tracking-wider text-[#183D32]/70">Billed To</p>
              <p className="mt-1 font-display text-sm font-bold text-[#183D32]">
                {invoice.customer.name}
              </p>
              <p className="text-[#252B29]/80">
                {invoice.customer.address}, {invoice.customer.city}
              </p>
              <p className="text-[#252B29]/80">
                State: {invoice.customer.state} (Code: {invoice.customer.stateCode}) • GSTIN:{' '}
                {invoice.customer.gstin || 'Unregistered'}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="font-bold uppercase tracking-wider text-[#183D32]/70">Supply Details</p>
              <p className="mt-1 font-semibold text-[#183D32]">
                {invoice.isInterState ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)'}
              </p>
              <p className="text-[#252B29]/70">FY: {invoice.financialYear}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[#183D32]/5 text-[#183D32]">
                <tr>
                  <th className="px-3 py-2.5 text-left">Product</th>
                  <th className="px-3 py-2.5 text-left">HSN</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Rate</th>
                  <th className="px-3 py-2.5 text-right">Taxable</th>
                  {invoice.isInterState ? (
                    <th className="px-3 py-2.5 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="px-3 py-2.5 text-right">CGST</th>
                      <th className="px-3 py-2.5 text-right">SGST</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#183D32]/10">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-medium">{item.productName}</td>
                    <td className="px-3 py-3 font-mono text-xs">{item.hsnCode}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.quantityPackets} pkts</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatINR(item.unitPricePaisa)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatINR(item.taxableAmountPaisa)}
                    </td>
                    {invoice.isInterState ? (
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatINR(item.igstPaisa)}
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatINR(item.cgstPaisa)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatINR(item.sgstPaisa)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-3 text-right font-bold tabular-nums">
                      {formatINR(item.totalAmountPaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-xs rounded-xl border border-[#D9A441]/50 bg-[#FFF8ED]/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Taxable Amount</span>
                <span className="font-semibold tabular-nums">
                  {formatINR(invoice.taxableAmountPaisa)}
                </span>
              </div>
              {invoice.isInterState ? (
                <div className="flex justify-between">
                  <span>IGST</span>
                  <span className="font-semibold tabular-nums">{formatINR(invoice.igstPaisa)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>CGST</span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(invoice.cgstPaisa)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST</span>
                    <span className="font-semibold tabular-nums">
                      {formatINR(invoice.sgstPaisa)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-[#183D32]/15 pt-2 text-sm font-extrabold text-[#183D32]">
                <span>Invoice Total</span>
                <span className="tabular-nums">{formatINR(invoice.totalAmountPaisa)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Paid Amount</span>
                <span className="font-semibold tabular-nums">
                  {formatINR(invoice.paidAmountPaisa)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#B85C38]">
                <span>Outstanding Balance</span>
                <span className="tabular-nums">
                  {formatINR(invoice.totalAmountPaisa - invoice.paidAmountPaisa)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
