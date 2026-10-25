import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardHomePage from './pages/dashboard/DashboardHomePage';
import SubscriptionStatusPage from './pages/dashboard/SubscriptionStatusPage';
import PlanSelectionPage from './pages/dashboard/PlanSelectionPage';
import ApiKeyPage from './pages/dashboard/ApiKeyPage';
import SizeChartsPage from './pages/dashboard/SizeChartsPage';
import CreateSizeChartPage from './pages/dashboard/CreateSizeChartPage';
import ProductMappingPage from './pages/dashboard/ProductMappingPage';
import AnchorPointsPage from './pages/dashboard/AnchorPointsPage';
import AnalyticsDashboardPage from './pages/dashboard/AnalyticsDashboardPage';
import IntegrationDocsPage from './pages/dashboard/IntegrationDocsPage';
import SettingsPage from './pages/dashboard/SettingsPage';
import SizeCheckDemo from './pages/demo/SizeCheckDemo';
import AiTestPage from './pages/demo/AiTestPage';
import MobileCapturePage from './pages/mobile/MobileCapturePage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import AdminMerchantsPage from './pages/admin/AdminMerchantsPage';
import AdminMerchantDetailPage from './pages/admin/AdminMerchantDetailPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';
import AdminDemoStudioPage from './pages/admin/AdminDemoStudioPage';
import AdminAuditLogPage from './pages/admin/AdminAuditLogPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import { ROLES } from './utils/roles';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'rounded-lg border border-border bg-surface text-foreground shadow-card',
            duration: 4000,
            success: {
              className: 'rounded-lg border border-success/30 bg-surface text-foreground shadow-card',
              iconTheme: { primary: 'rgb(var(--color-success))', secondary: 'rgb(var(--color-surface))' },
            },
            error: {
              className: 'rounded-lg border border-danger/30 bg-surface text-foreground shadow-card',
              iconTheme: { primary: 'rgb(var(--color-danger))', secondary: 'rgb(var(--color-surface))' },
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/demo/size-check" element={<SizeCheckDemo />} />
          <Route path="/test/ai" element={<AiTestPage />} />
          <Route path="/mobile-capture/:sessionId" element={<MobileCapturePage />} />

          {/*
            Login/Register are full-viewport split-screen pages (Theme F.4) --
            they render their own logo and have no room for a wrapping top
            nav, so they're standalone routes rather than nested under
            PublicLayout. PublicLayout (added in F.3) is kept for a future
            landing/marketing page, matching its own "if any exist" framing;
            it has no route using it right now.
          */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute role={ROLES.MERCHANT}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardHomePage />} />
            <Route path="subscription" element={<SubscriptionStatusPage />} />
            <Route path="subscription/plans" element={<PlanSelectionPage />} />
            <Route path="api-key" element={<ApiKeyPage />} />
            <Route path="size-charts" element={<SizeChartsPage />} />
            <Route path="size-charts/new" element={<CreateSizeChartPage />} />
            <Route path="size-charts/:id/edit" element={<CreateSizeChartPage />} />
            <Route path="product-mapping" element={<ProductMappingPage />} />
            <Route path="product-mapping/:id/anchor-points" element={<AnchorPointsPage />} />
            <Route path="analytics" element={<AnalyticsDashboardPage />} />
            <Route path="docs" element={<IntegrationDocsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route
            path="/admin/*"
            element={
              <ProtectedRoute role={ROLES.SUPER_ADMIN}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="merchants" element={<AdminMerchantsPage />} />
            <Route path="merchants/:id" element={<AdminMerchantDetailPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="demo" element={<AdminDemoStudioPage />} />
            <Route path="audit-log" element={<AdminAuditLogPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
