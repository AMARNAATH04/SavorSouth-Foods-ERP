import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  CreditCard,
  Factory,
  FileCheck2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RoleCode } from '../types/erp';
import { cn } from '../utils/format';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles: RoleCode[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Owner Dashboard',
        to: '/owner',
        icon: <LayoutDashboard className="w-4 h-4" />,
        roles: ['OWNER'],
      },
      {
        label: 'Admin Dashboard',
        to: '/admin',
        icon: <ShieldCheck className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN'],
      },
      {
        label: 'Salesman Hub',
        to: '/salesman',
        icon: <ShoppingBag className="w-4 h-4" />,
        roles: ['SALESMAN'],
      },
      {
        label: 'Production Floor',
        to: '/production',
        icon: <Factory className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR'],
      },
    ],
  },
  {
    title: 'Sales & Billing',
    items: [
      {
        label: 'Create Order',
        to: '/orders/new',
        icon: <PlusCircle className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'SALESMAN'],
      },
      {
        label: 'My Orders',
        to: '/my-orders',
        icon: <ClipboardList className="w-4 h-4" />,
        roles: ['SALESMAN'],
      },
      {
        label: 'Incoming Orders',
        to: '/orders',
        icon: <ShoppingCart className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT'],
      },
      {
        label: 'GST Invoices',
        to: '/invoices',
        icon: <Receipt className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT', 'SALESMAN'],
      },
      {
        label: 'Payments',
        to: '/payments',
        icon: <CreditCard className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT'],
      },
    ],
  },
  {
    title: 'Production & Inventory',
    items: [
      {
        label: 'New Production Run',
        to: '/production/new',
        icon: <PlusCircle className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR'],
      },
      {
        label: 'BOM Management',
        to: '/production/boms',
        icon: <Layers className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR'],
      },
      {
        label: 'Variance Analysis',
        to: '/production/variance',
        icon: <Activity className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Raw Materials',
        to: '/inventory/raw-materials',
        icon: <Boxes className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Finished Goods',
        to: '/inventory/finished-goods',
        icon: <Package className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Purchases',
        to: '/purchases',
        icon: <Truck className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Stock Ledger',
        to: '/inventory/ledger',
        icon: <BookOpen className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
    ],
  },
  {
    title: 'Costing, Masters & Audit',
    items: [
      {
        label: 'Costing Dashboard',
        to: '/costing',
        icon: <TrendingUp className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Reports & Exports',
        to: '/reports',
        icon: <FileSpreadsheet className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT'],
      },
      {
        label: 'Products',
        to: '/products',
        icon: <BarChart3 className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'SALESMAN'],
      },
      {
        label: 'Customers',
        to: '/customers',
        icon: <Users className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'SALESMAN', 'ACCOUNTANT'],
      },
      {
        label: 'Suppliers',
        to: '/suppliers',
        icon: <FileCheck2 className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR'],
      },
      {
        label: 'Audit Logs',
        to: '/audit-logs',
        icon: <History className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT'],
      },
      {
        label: 'User Management',
        to: '/users',
        icon: <Users className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN'],
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: <Settings className="w-4 h-4" />,
        roles: ['OWNER', 'FACTORY_ADMIN'],
      },
    ],
  },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, getHomeRoute } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.roles.includes(user.role)),
  })).filter((g) => g.items.length > 0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex h-full flex-col bg-[#183D32] text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <Link
          to={getHomeRoute()}
          onClick={() => isMobile && setMobileOpen(false)}
          className="flex items-center gap-2.5 overflow-hidden"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D9A441] text-[#183D32] font-display font-extrabold text-sm shadow">
            SS
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0">
              <p className="font-display text-sm font-bold leading-tight text-[#FFF8ED] truncate">
                SavorSouth ERP
              </p>
              <p className="text-[10px] text-[#D9A441] tracking-wide truncate">
                Tradition in Every Bite.
              </p>
            </div>
          )}
        </Link>
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {(!collapsed || isMobile) && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#FFF8ED]/45">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => isMobile && setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-2.5 py-2 text-xs font-medium transition-all',
                      isActive
                        ? 'bg-[#D9A441] text-[#183D32] font-semibold shadow-sm'
                        : 'text-[#FFF8ED]/80 hover:bg-white/10 hover:text-white',
                    )
                  }
                  title={collapsed && !isMobile ? item.label : undefined}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        {(!collapsed || isMobile) && (
          <div className="mb-2.5 rounded-xl bg-white/8 px-3 py-2">
            <p className="text-xs font-semibold text-[#FFF8ED] truncate">{user.name}</p>
            <p className="text-[11px] text-[#D9A441] truncate">{user.roleName}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-[#FFF8ED] hover:bg-[#B85C38] transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#FFF8ED]/45">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="hidden lg:block shrink-0 sticky top-0 h-screen overflow-hidden shadow-elevated z-30"
      >
        {renderSidebarContent(false)}
      </motion.aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/45"
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-64 h-full shadow-2xl"
            >
              {renderSidebarContent(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#183D32]/10 bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-xl border border-[#183D32]/15 p-2 text-[#183D32] hover:bg-[#FFF8ED]"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#252B29]/70">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-[#183D32]">SavorSouth Foods</span>
              <span>•</span>
              <span>Tamil Nadu Plant (33)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user.role === 'ACCOUNTANT' && (
              <span className="rounded-full bg-[#D9A441]/15 px-3 py-1 text-[11px] font-semibold text-[#8A6114]">
                Read-Only Auditor Mode
              </span>
            )}
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-[#183D32]">{user.name}</p>
              <p className="text-[11px] text-[#252B29]/60">{user.email}</p>
            </div>
            <span className="rounded-xl bg-[#183D32] px-2.5 py-1 text-[11px] font-semibold text-[#FFF8ED]">
              {user.role.replace(/_/g, ' ')}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1440px] w-full mx-auto pb-20 lg:pb-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </main>

        {/* Salesman Mobile Bottom Navigation */}
        {user.role === 'SALESMAN' && (
          <nav className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-[#183D32]/15 bg-white py-2 lg:hidden shadow-elevated">
            <NavLink
              to="/salesman"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-[#183D32] font-semibold' : 'text-[#252B29]/60',
                )
              }
            >
              <ShoppingBag className="w-5 h-5" />
              Home
            </NavLink>
            <NavLink
              to="/orders/new"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-[#B85C38] font-semibold' : 'text-[#252B29]/60',
                )
              }
            >
              <PlusCircle className="w-5 h-5" />
              New Order
            </NavLink>
            <NavLink
              to="/my-orders"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-[#183D32] font-semibold' : 'text-[#252B29]/60',
                )
              }
            >
              <ClipboardList className="w-5 h-5" />
              My Orders
            </NavLink>
            <NavLink
              to="/customers"
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-[#183D32] font-semibold' : 'text-[#252B29]/60',
                )
              }
            >
              <Users className="w-5 h-5" />
              Customers
            </NavLink>
          </nav>
        )}
      </div>
    </div>
  );
}
