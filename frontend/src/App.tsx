import React from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/Layout';
import { AuthProvider, getRoleHomeRoute, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CostingDashboardPage, PaymentsPage, ReportsPage } from './pages/FinanceReportsPages';
import {
  FinishedGoodsPage,
  PurchasesPage,
  RawMaterialsPage,
  StockLedgerPage,
} from './pages/InventoryPages';
import { LoginPage } from './pages/LoginPage';
import {
  AuditLogsPage,
  CustomersPage,
  ProductsPage,
  SettingsPage,
  SuppliersPage,
  UsersPage,
} from './pages/MasterPages';
import { OwnerDashboardPage } from './pages/OwnerDashboardPage';
import {
  BomsPage,
  CreateProductionRunPage,
  ProductionDashboardPage,
  ProductionRunDetailsPage,
  VarianceAnalysisPage,
} from './pages/ProductionPages';
import { SalesmanDashboardPage } from './pages/SalesmanDashboardPage';
import {
  CreateOrderPage,
  InvoiceDetailPage,
  InvoicesPage,
  OrderDetailsPage,
  OrdersListPage,
} from './pages/SalesPages';
import { RoleCode } from './types/erp';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: RoleCode[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8ED] text-[#183D32] text-sm font-semibold">
        Loading SavorSouth ERP...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getRoleHomeRoute(user.role)} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleHomeRoute(user.role)} replace />;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<HomeRedirect />} />

              {/* Role Dashboards */}
              <Route
                path="/owner"
                element={
                  <ProtectedRoute roles={['OWNER']}>
                    <OwnerDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN']}>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/salesman"
                element={
                  <ProtectedRoute roles={['SALESMAN', 'OWNER']}>
                    <SalesmanDashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Sales, Orders & GST Invoicing */}
              <Route
                path="/orders/new"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'SALESMAN']}>
                    <CreateOrderPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-orders"
                element={
                  <ProtectedRoute roles={['SALESMAN', 'OWNER']}>
                    <OrdersListPage mineOnly />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT']}>
                    <OrdersListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders/:id"
                element={
                  <ProtectedRoute>
                    <OrderDetailsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices"
                element={
                  <ProtectedRoute>
                    <InvoicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invoices/:id"
                element={
                  <ProtectedRoute>
                    <InvoiceDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Masters */}
              <Route
                path="/customers"
                element={
                  <ProtectedRoute>
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/products"
                element={
                  <ProtectedRoute>
                    <ProductsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/suppliers"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR']}>
                    <SuppliersPage />
                  </ProtectedRoute>
                }
              />

              {/* Inventory & Purchases */}
              <Route
                path="/purchases"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <PurchasesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/raw-materials"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <RawMaterialsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/finished-goods"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <FinishedGoodsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inventory/ledger"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <StockLedgerPage />
                  </ProtectedRoute>
                }
              />

              {/* Production & BOMs */}
              <Route
                path="/production/boms"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <BomsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <ProductionDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production/new"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR']}>
                    <CreateProductionRunPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production/variance"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <VarianceAnalysisPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production/:id"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <ProductionRunDetailsPage />
                  </ProtectedRoute>
                }
              />

              {/* Costing, Payments, Reports & Admin */}
              <Route
                path="/costing"
                element={
                  <ProtectedRoute
                    roles={['OWNER', 'FACTORY_ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}
                  >
                    <CostingDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payments"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT']}>
                    <PaymentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT']}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN']}>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN', 'ACCOUNTANT']}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute roles={['OWNER', 'FACTORY_ADMIN']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<HomeRedirect />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}

export default App;
