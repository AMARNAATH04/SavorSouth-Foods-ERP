import React, { useEffect, useState } from 'react';
import { Eye, Plus, Save, Shield, ToggleLeft, ToggleRight, Truck, Users } from 'lucide-react';
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
import { CompanySettings, Customer, Product, RoleCode, Supplier } from '../types/erp';
import { formatDateTime, formatINR } from '../utils/format';

// 11. CUSTOMER MANAGEMENT
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'RETAILER' as 'RETAILER' | 'DISTRIBUTOR',
    gstin: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    stateCode: '33',
    phone: '',
    email: '',
    priceCategory: 'STANDARD' as 'STANDARD' | 'WHOLESALE' | 'DISTRIBUTOR',
    creditLimitRupees: '50000',
  });
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    setLoading(true);
    apiFetch<Customer[]>('/master/customers')
      .then(setCustomers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      type: 'RETAILER',
      gstin: '',
      address: '',
      city: '',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '',
      email: '',
      priceCategory: 'STANDARD',
      creditLimitRupees: '50000',
    });
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type,
      gstin: c.gstin || '',
      address: c.address,
      city: c.city,
      state: c.state,
      stateCode: c.stateCode,
      phone: c.phone,
      email: c.email || '',
      priceCategory: c.priceCategory,
      creditLimitRupees: String(c.creditLimitPaisa / 100),
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        type: form.type,
        gstin: form.gstin || null,
        address: form.address,
        city: form.city,
        state: form.state,
        stateCode: form.stateCode,
        phone: form.phone,
        email: form.email || null,
        priceCategory: form.priceCategory,
        creditLimitPaisa: Math.round(Number(form.creditLimitRupees) * 100),
      };
      if (editing) {
        await apiFetch(`/master/customers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Customer Updated');
      } else {
        await apiFetch('/master/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Customer Created');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('Failed to save customer', err.message, 'error');
    }
  };

  const columns: ColumnDef<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      sortValue: (c) => c.name,
      render: (c) => (
        <div>
          <p className="font-bold text-[#183D32]">{c.name}</p>
          <p className="text-[11px] text-[#252B29]/60">
            GSTIN: {c.gstin || 'Unregistered'} • {c.phone}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) => (
        <span className="rounded-full bg-[#FFF8ED] border border-[#D9A441]/35 px-2.5 py-0.5 text-[11px] font-semibold text-[#183D32]">
          {c.type}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State / Code',
      sortValue: (c) => c.state,
      render: (c) => (
        <span className="text-xs">
          {c.city}, {c.state} ({c.stateCode})
        </span>
      ),
    },
    {
      key: 'salesman',
      header: 'Salesman',
      render: (c) => <span className="text-xs">{c.assignedSalesman?.name || 'Unassigned'}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (c) => c.outstandingPaisa ?? 0,
      render: (c) => (
        <span
          className={`font-bold ${
            (c.outstandingPaisa ?? 0) > 0 ? 'text-[#B85C38]' : 'text-emerald-700'
          }`}
        >
          {formatINR(c.outstandingPaisa ?? 0)}
        </span>
      ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            render: (c: Customer) => (
              <button
                onClick={() => openEdit(c)}
                className="rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-xs font-semibold text-[#183D32] hover:bg-[#183D32] hover:text-white"
              >
                Edit
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customer Master"
        subtitle="Retailers & distributors with GST state codes (33 = TN CGST+SGST, others = IGST) and live receivables"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Customers' }]}
        actions={
          canEdit && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Add Customer
            </button>
          )
        }
      />

      <DataTable
        data={customers}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search customer, GSTIN, city, state..."
        searchKeys={(c) => `${c.name} ${c.city} ${c.state} ${c.gstin ?? ''}`}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Customer' : 'Add New Customer'}
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="sm:col-span-2">
            <label className="font-semibold text-[#183D32]">Customer Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              <option value="RETAILER">RETAILER</option>
              <option value="DISTRIBUTOR">DISTRIBUTOR</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">GSTIN</label>
            <input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="font-semibold text-[#183D32]">Address *</label>
            <input
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">City *</label>
            <input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#183D32]">State *</label>
              <input
                required
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
            <div>
              <label className="font-semibold text-[#183D32]">State Code *</label>
              <input
                required
                maxLength={2}
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Phone *</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Credit Limit (INR)</label>
            <input
              type="number"
              value={form.creditLimitRupees}
              onChange={(e) => setForm({ ...form, creditLimitRupees: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3">
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
              Save Customer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 12. PRODUCT MANAGEMENT
export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'Murukku',
    packSizeGrams: '200',
    packLabel: '200 g',
    sellingPriceRupees: '50',
    gstPct: '5',
    hsnCode: '19059090',
    packetsPerCarton: '20',
    reorderLevelPackets: '50',
    imageUrl: '/images/products/murukku.jpg',
    description: '',
  });
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit = user?.role === 'OWNER' || user?.role === 'FACTORY_ADMIN';

  const load = () => {
    setLoading(true);
    apiFetch<Product[]>('/master/products')
      .then(setProducts)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        category: form.category,
        packSizeGrams: Number(form.packSizeGrams),
        packLabel: form.packLabel,
        sellingPricePaisa: Math.round(Number(form.sellingPriceRupees) * 100),
        gstRateBps: Math.round(Number(form.gstPct) * 100),
        hsnCode: form.hsnCode,
        packetsPerCarton: Number(form.packetsPerCarton),
        reorderLevelPackets: Number(form.reorderLevelPackets),
        imageUrl: form.imageUrl || null,
        description: form.description || null,
      };
      if (editing) {
        await apiFetch(`/master/products/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Product Updated');
      } else {
        await apiFetch('/master/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Product Created');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('Failed to save product', err.message, 'error');
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await apiFetch(`/master/products/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      showToast(`${p.name} marked ${!p.isActive ? 'Active' : 'Inactive'}`);
      load();
    } catch (err: any) {
      showToast('Update failed', err.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Product Master"
        subtitle="SavorSouth snack SKUs, HSN codes, GST rates, pack sizes & finished goods stock"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Products' }]}
        actions={
          canEdit && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          )
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-[#183D32]/12 bg-white p-4 shadow-card flex gap-4"
            >
              <img
                src={p.imageUrl || '/images/products/murukku.jpg'}
                alt={p.name}
                className="h-24 w-24 shrink-0 rounded-xl object-cover bg-[#FFF8ED] border border-[#183D32]/10"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display text-sm font-bold text-[#183D32] truncate">
                      {p.name}
                    </h4>
                    <StatusBadge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                  <p className="text-[11px] text-[#252B29]/65 mt-0.5">
                    {p.sku} • {p.category}
                  </p>
                  <p className="text-[11px] text-[#252B29]/65">
                    HSN {p.hsnCode} • GST {(p.gstRateBps / 100).toFixed(0)}% • {p.packLabel}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#183D32]/10 pt-2">
                  <div>
                    <span className="text-sm font-extrabold text-[#B85C38] tabular-nums">
                      {formatINR(p.sellingPricePaisa)}
                    </span>
                    <span className="ml-2 text-xs text-[#252B29]/65">
                      Stock: <strong>{p.currentStockPackets}</strong> pkts
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleActive(p)}
                        title="Toggle active status"
                        className="text-[#183D32] hover:text-[#D9A441]"
                      >
                        {p.isActive ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(p);
                          setForm({
                            name: p.name,
                            sku: p.sku,
                            category: p.category,
                            packSizeGrams: String(p.packSizeGrams),
                            packLabel: p.packLabel,
                            sellingPriceRupees: String(p.sellingPricePaisa / 100),
                            gstPct: String(p.gstRateBps / 100),
                            hsnCode: p.hsnCode,
                            packetsPerCarton: String(p.packetsPerCarton),
                            reorderLevelPackets: String(p.reorderLevelPackets),
                            imageUrl: p.imageUrl || '/images/products/murukku.jpg',
                            description: p.description || '',
                          });
                          setModalOpen(true);
                        }}
                        className="rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-[11px] font-semibold text-[#183D32]"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Product' : 'Create Product'}
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Product Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">SKU *</label>
            <input
              required
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              {[
                'Murukku',
                'Bombay Mixture',
                'Banana Chips',
                'Butter Murukku',
                'Traditional South Indian Snacks',
                'Sweets',
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Pack Label (e.g. 200 g)</label>
            <input
              required
              value={form.packLabel}
              onChange={(e) => setForm({ ...form, packLabel: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Selling Price (INR)</label>
            <input
              type="number"
              step="0.5"
              required
              value={form.sellingPriceRupees}
              onChange={(e) => setForm({ ...form, sellingPriceRupees: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">GST Rate (%)</label>
            <input
              type="number"
              step="0.5"
              required
              value={form.gstPct}
              onChange={(e) => setForm({ ...form, gstPct: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">HSN Code</label>
            <input
              required
              value={form.hsnCode}
              onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Reorder Level (Packets)</label>
            <input
              type="number"
              required
              value={form.reorderLevelPackets}
              onChange={(e) => setForm({ ...form, reorderLevelPackets: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3">
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
              Save Product
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 13. SUPPLIER MANAGEMENT
export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: '',
    gstin: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    stateCode: '33',
    phone: '',
    email: '',
  });
  const { user } = useAuth();
  const { showToast } = useToast();
  const canEdit =
    user?.role === 'OWNER' ||
    user?.role === 'FACTORY_ADMIN' ||
    user?.role === 'PRODUCTION_SUPERVISOR';

  const load = () => {
    setLoading(true);
    apiFetch<Supplier[]>('/master/suppliers')
      .then(setSuppliers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      gstin: '',
      address: '',
      city: '',
      state: 'Tamil Nadu',
      stateCode: '33',
      phone: '',
      email: '',
    });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      gstin: s.gstin || '',
      address: s.address,
      city: s.city,
      state: s.state,
      stateCode: s.stateCode,
      phone: s.phone,
      email: s.email || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, gstin: form.gstin || null, email: form.email || null };
      if (editing) {
        await apiFetch(`/master/suppliers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Supplier Updated');
      } else {
        await apiFetch('/master/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Supplier Added');
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('Failed to save supplier', err.message, 'error');
    }
  };

  const columns: ColumnDef<Supplier>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortValue: (s) => s.name,
      render: (s) => (
        <div className="flex items-center gap-2.5">
          <Truck className="w-4 h-4 text-[#183D32]" />
          <div>
            <p className="font-bold text-[#183D32]">{s.name}</p>
            <p className="text-[11px] text-[#252B29]/60">GSTIN: {s.gstin || '-'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (s) => (
        <span className="text-xs">
          {s.address}, {s.city}, {s.state} ({s.stateCode})
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (s) => (
        <div className="text-xs">
          <p>{s.phone}</p>
          <p className="text-[#252B29]/60">{s.email || '-'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <StatusBadge status={s.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            render: (s: Supplier) => (
              <button
                onClick={() => openEdit(s)}
                className="rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-xs font-semibold text-[#183D32] hover:bg-[#183D32] hover:text-white"
              >
                Edit
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supplier Master"
        subtitle="Raw material and packaging vendors across Tamil Nadu"
        breadcrumbs={[{ label: 'Inventory' }, { label: 'Suppliers' }]}
        actions={
          canEdit && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
            >
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
          )
        }
      />

      <DataTable
        data={suppliers}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search supplier, city, GSTIN..."
        searchKeys={(s) => `${s.name} ${s.city} ${s.gstin ?? ''}`}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="sm:col-span-2">
            <label className="font-semibold text-[#183D32]">Supplier Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">GSTIN</label>
            <input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Phone *</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="font-semibold text-[#183D32]">Address *</label>
            <input
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">City *</label>
            <input
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">State</label>
            <input
              required
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3">
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
              Save Supplier
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 26. USER MANAGEMENT
export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: 'Password@123',
    phone: '',
    roleCode: 'SALESMAN' as RoleCode,
  });
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const load = () => {
    setLoading(true);
    apiFetch<any[]>('/auth/users')
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showToast('User Created');
      setModalOpen(false);
      load();
    } catch (err: any) {
      showToast('Error', err.message, 'error');
    }
  };

  const toggleStatus = async (u: any) => {
    try {
      await apiFetch(`/auth/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      showToast('User Status Updated');
      load();
    } catch (err: any) {
      showToast('Error', err.message, 'error');
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'User',
      sortValue: (u) => u.name,
      render: (u) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#183D32]" />
          <div>
            <p className="font-bold text-[#183D32]">{u.name}</p>
            <p className="text-[11px] text-[#252B29]/60">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#183D32]/10 px-2.5 py-0.5 text-xs font-semibold text-[#183D32]">
          <Shield className="w-3 h-3" /> {u.roleName}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (u) => <span className="text-xs">{u.phone || '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />,
    },
    ...(currentUser?.role === 'OWNER'
      ? [
          {
            key: 'action',
            header: '',
            render: (u: any) => (
              <button
                onClick={() => toggleStatus(u)}
                className="rounded-lg border border-[#183D32]/20 px-2.5 py-1 text-xs font-medium hover:bg-[#FFF8ED]"
              >
                {u.isActive ? 'Deactivate' : 'Activate'}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="User & Role Management"
        subtitle="Manage ERP access across Owner, Factory Admin, Production Supervisor, Salesmen, and Auditor"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Users' }]}
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            <Plus className="w-4 h-4" /> Add Staff User
          </button>
        }
      />

      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search name, email, role..."
        searchKeys={(u) => `${u.name} ${u.email} ${u.roleName}`}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create ERP User" size="sm">
        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#183D32]">Full Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Role</label>
            <select
              value={form.roleCode}
              onChange={(e) => setForm({ ...form, roleCode: e.target.value as RoleCode })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            >
              <option value="SALESMAN">Field Salesman</option>
              <option value="PRODUCTION_SUPERVISOR">Production Supervisor</option>
              <option value="FACTORY_ADMIN">Factory Admin</option>
              <option value="ACCOUNTANT">Accountant / Auditor</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Initial Password *</label>
            <input
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
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
              Create User
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// 27. AUDIT LOGS
export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    apiFetch<any[]>('/master/audit-logs')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<any>[] = [
    {
      key: 'time',
      header: 'Timestamp',
      sortValue: (l) => l.createdAt,
      render: (l) => <span className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: 'user',
      header: 'Actor',
      render: (l) => (
        <div className="text-xs">
          <p className="font-semibold text-[#183D32]">{l.user?.name || 'System'}</p>
          <p className="text-[10px] text-[#252B29]/60">{l.userRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortValue: (l) => l.action,
      render: (l) => (
        <span className="rounded-lg bg-[#FFF8ED] border border-[#D9A441]/30 px-2 py-0.5 text-[11px] font-bold text-[#183D32]">
          {l.action}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity / Reference',
      render: (l) => (
        <span className="text-xs">
          {l.entityType}: <strong>{l.entityLabel || l.entityId}</strong>
        </span>
      ),
    },
    {
      key: 'inspect',
      header: '',
      render: (l) => (
        <button
          onClick={() => setSelected(l)}
          className="inline-flex items-center gap-1 rounded-lg bg-[#183D32]/10 px-2.5 py-1 text-xs font-semibold text-[#183D32]"
        >
          <Eye className="w-3.5 h-3.5" /> Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Immutable Audit Logs"
        subtitle="Chronological trail of logins, orders, GST invoices, stock movements, and production edits"
        breadcrumbs={[{ label: 'Audit' }, { label: 'Audit Logs' }]}
      />

      <DataTable
        data={logs}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search action, user, entity..."
        searchKeys={(l) => `${l.action} ${l.entityType} ${l.entityLabel ?? ''} ${l.user?.name ?? ''}`}
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Audit Record: ${selected?.action}`}
      >
        {selected && (
          <div className="space-y-3 text-xs">
            <p>
              <strong>Timestamp:</strong> {formatDateTime(selected.createdAt)}
            </p>
            <p>
              <strong>Actor:</strong> {selected.user?.name} ({selected.userRole})
            </p>
            {selected.beforeState && (
              <div>
                <p className="font-semibold text-[#B85C38] mb-1">Before State:</p>
                <pre className="rounded-xl bg-slate-50 p-3 overflow-x-auto text-[11px]">
                  {JSON.stringify(selected.beforeState, null, 2)}
                </pre>
              </div>
            )}
            {selected.afterState && (
              <div>
                <p className="font-semibold text-[#183D32] mb-1">After State:</p>
                <pre className="rounded-xl bg-[#FFF8ED] p-3 overflow-x-auto text-[11px]">
                  {JSON.stringify(selected.afterState, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// 28. SETTINGS
export function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    apiFetch<CompanySettings>('/master/settings')
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await apiFetch<CompanySettings>('/master/settings', {
        method: 'PUT',
        body: JSON.stringify({
          companyName: settings.companyName,
          tagline: settings.tagline,
          gstin: settings.gstin,
          fssaiLicense: settings.fssaiLicense,
          address: settings.address,
          city: settings.city,
          state: settings.state,
          stateCode: settings.stateCode,
          phone: settings.phone,
          email: settings.email,
          invoicePrefix: settings.invoicePrefix,
          yieldVarianceTolerancePct: Number(settings.yieldVarianceTolerancePct),
          consumptionVarianceTolerancePct: Number(settings.consumptionVarianceTolerancePct),
          overheadAllocationRule: settings.overheadAllocationRule,
        }),
      });
      setSettings(updated);
      showToast('Company & ERP Settings Saved');
    } catch (err: any) {
      showToast('Failed to save settings', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorBanner message={error} />;
  if (!settings) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Plant & Compliance Settings"
        subtitle="Configure Tamil Nadu factory GSTIN, FSSAI license, invoice prefix, and production tolerances"
        breadcrumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
      />

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-[#183D32]/12 bg-white p-6 shadow-card grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
      >
        <div>
          <label className="font-semibold text-[#183D32]">Company Name</label>
          <input
            value={settings.companyName}
            onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">Brand Tagline</label>
          <input
            value={settings.tagline}
            onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">Factory GSTIN</label>
          <input
            value={settings.gstin}
            onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm font-mono"
          />
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">FSSAI License</label>
          <input
            value={settings.fssaiLicense}
            onChange={(e) => setSettings({ ...settings, fssaiLicense: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm font-mono"
          />
        </div>
        <div className="md:col-span-2">
          <label className="font-semibold text-[#183D32]">Plant Address</label>
          <input
            value={settings.address}
            onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">Home State (GST Origin)</label>
          <input
            value={settings.state}
            onChange={(e) => setSettings({ ...settings, state: e.target.value })}
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-semibold text-[#183D32]">State Code</label>
            <input
              maxLength={2}
              value={settings.stateCode}
              onChange={(e) => setSettings({ ...settings, stateCode: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
          <div>
            <label className="font-semibold text-[#183D32]">Invoice Prefix</label>
            <input
              value={settings.invoicePrefix}
              onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">Yield Variance Tolerance (%)</label>
          <input
            type="number"
            step="0.5"
            value={settings.yieldVarianceTolerancePct}
            onChange={(e) =>
              setSettings({ ...settings, yieldVarianceTolerancePct: Number(e.target.value) })
            }
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="font-semibold text-[#183D32]">Material Consumption Tolerance (%)</label>
          <input
            type="number"
            step="0.5"
            value={settings.consumptionVarianceTolerancePct}
            onChange={(e) =>
              setSettings({
                ...settings,
                consumptionVarianceTolerancePct: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="font-semibold text-[#183D32]">Documented Overhead Allocation Rule</label>
          <textarea
            rows={2}
            value={settings.overheadAllocationRule}
            onChange={(e) =>
              setSettings({ ...settings, overheadAllocationRule: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-[#183D32]/20 p-2.5 text-sm"
          />
        </div>
        <div className="md:col-span-2 flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#183D32] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#235344]"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
