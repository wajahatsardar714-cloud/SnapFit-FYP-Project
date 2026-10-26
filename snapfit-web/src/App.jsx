import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PageLoader from './components/PageLoader';
import PublicLayout from './layouts/PublicLayout';
import { ROLES } from './utils/roles';

// Every page is its own chunk, so a visitor on the public site downloads none
// of the dashboard, admin or camera code (and the reverse).
const HomePage = lazy(() => import('./pages/public/HomePage'));
const PricingPage = lazy(() => import('./pages/public/PricingPage'));
const GuidePage = lazy(() => import('./pages/public/GuidePage'));
const LegalPage = lazy(() => import('./pages/public/LegalPage'));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const SignInPage = lazy(() => import('./pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const DashboardHomePage = lazy(() => import('./pages/dashboard/DashboardHomePage'));
const SubscriptionStatusPage = lazy(() => import('./pages/dashboard/SubscriptionStatusPage'));
const PlanSelectionPage = lazy(() => import('./pages/dashboard/PlanSelectionPage'));
const ApiKeyPage = lazy(() => import('./pages/dashboard/ApiKeyPage'));
const SizeChartsPage = lazy(() => import('./pages/dashboard/SizeChartsPage'));
const CreateSizeChartPage = lazy(() => import('./pages/dashboard/CreateSizeChartPage'));
const ProductMappingPage = lazy(() => import('./pages/dashboard/ProductMappingPage'));
const AnchorPointsPage = lazy(() => import('./pages/dashboard/AnchorPointsPage'));
const AnalyticsDashboardPage = lazy(() => import('./pages/dashboard/AnalyticsDashboardPage'));
const IntegrationDocsPage = lazy(() => import('./pages/dashboard/IntegrationDocsPage'));
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'));
const SizeCheckDemo = lazy(() => import('./pages/demo/SizeCheckDemo'));
const AiTestPage = lazy(() => import('./pages/demo/AiTestPage'));
const MobileCapturePage = lazy(() => import('./pages/mobile/MobileCapturePage'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage'));
const AdminMerchantsPage = lazy(() => import('./pages/admin/AdminMerchantsPage'));
const AdminMerchantDetailPage = lazy(() => import('./pages/admin/AdminMerchantDetailPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminDemoStudioPage = lazy(() => import('./pages/admin/AdminDemoStudioPage'));
const AdminAuditLogPage = lazy(() => import('./pages/admin/AdminAuditLogPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

function App() {
  return (
    // Navigations run as transitions: the current page stays on screen while
    // the next page's chunk loads, instead of flashing the loader.
    <BrowserRouter future={{ v7_startTransition: true }}>
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
        <Suspense fallback={<PageLoader fullScreen />}>
          <Routes>
            {/* Public site: shared header and footer around each page. */}
            <Route element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/privacy" element={<LegalPage page="privacy" />} />
              <Route path="/terms" element={<LegalPage page="terms" />} />
              <Route path="/cookies" element={<LegalPage page="cookies" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* The bare login and sign-up forms: no site header, footer or content. */}
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            <Route path="/demo/size-check" element={<SizeCheckDemo />} />
            <Route path="/test/ai" element={<AiTestPage />} />
            <Route path="/mobile-capture/:sessionId" element={<MobileCapturePage />} />

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
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
