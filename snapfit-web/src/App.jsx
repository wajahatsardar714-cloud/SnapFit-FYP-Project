import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicLayout from './layouts/PublicLayout';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardHomePage from './pages/dashboard/DashboardHomePage';
import SubscriptionStatusPage from './pages/dashboard/SubscriptionStatusPage';
import PlanSelectionPage from './pages/dashboard/PlanSelectionPage';
import ApiKeyPage from './pages/dashboard/ApiKeyPage';
import SizeChartsPage from './pages/dashboard/SizeChartsPage';
import CreateSizeChartPage from './pages/dashboard/CreateSizeChartPage';
import ProductMappingPage from './pages/dashboard/ProductMappingPage';
import AnalyticsDashboardPage from './pages/dashboard/AnalyticsDashboardPage';
import IntegrationDocsPage from './pages/dashboard/IntegrationDocsPage';
import SizeCheckDemo from './pages/demo/SizeCheckDemo';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/demo/size-check" element={<SizeCheckDemo />} />

          <Route element={<PublicLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute>
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
            <Route path="analytics" element={<AnalyticsDashboardPage />} />
            <Route path="docs" element={<IntegrationDocsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
