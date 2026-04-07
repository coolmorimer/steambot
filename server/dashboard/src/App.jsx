import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, AdminRoute, PartnerRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import Landing        from './pages/Landing';
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import VerifyEmail    from './pages/VerifyEmail';
import OAuthCallback  from './pages/OAuthCallback';
import Dashboard      from './pages/Dashboard';
import Accounts       from './pages/Accounts';
import Campaigns      from './pages/Campaigns';
import JobsActivity   from './pages/JobsActivity';
import Telegram       from './pages/Telegram';
import Settings       from './pages/Settings';
import Subscription   from './pages/Subscription';
import ApiKeys        from './pages/ApiKeys';
import Trades         from './pages/Trades';
import CreateTrade    from './pages/CreateTrade';
import TradeView      from './pages/TradeView';
import Balance        from './pages/Balance';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers     from './pages/admin/AdminUsers';
import AdminPlans     from './pages/admin/AdminPlans';
import AdminConfig    from './pages/admin/AdminConfig';
import AdminSupport   from './pages/admin/AdminSupport';
import AdminPayments  from './pages/admin/AdminPayments';
import AdminWithdrawals from './pages/admin/AdminWithdrawals';
import AdminPartners from './pages/admin/AdminPartners';
import AdminLayout   from './components/AdminLayout';
import Referrals from './pages/Referrals';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/landing"         element={<Landing />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/verify-email"    element={<VerifyEmail />} />
        <Route path="/oauth-callback"  element={<OAuthCallback />} />

        {/* Protected */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index              element={<Dashboard />} />
          <Route path="accounts"   element={<Accounts />} />
          <Route path="campaigns"  element={<Campaigns />} />
          <Route path="activity"   element={<JobsActivity />} />
          <Route path="telegram"   element={<Telegram />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="api"          element={<ApiKeys />} />

          {/* P2P Trades */}
          <Route path="trades"         element={<Trades />} />
          <Route path="trades/create"  element={<CreateTrade />} />
          <Route path="trades/:id"     element={<TradeView />} />
          <Route path="balance"        element={<PartnerRoute><Balance /></PartnerRoute>} />
          <Route path="referrals"      element={<Referrals />} />

          {/* Admin */}
          <Route path="admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index             element={<AdminDashboard />} />
            <Route path="users"      element={<AdminUsers />} />
            <Route path="plans"      element={<AdminPlans />} />
            <Route path="config"     element={<AdminConfig />} />
            <Route path="support"    element={<AdminSupport />} />
            <Route path="payments"   element={<AdminPayments />} />
            <Route path="withdrawals" element={<AdminWithdrawals />} />
            <Route path="partners"   element={<AdminPartners />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
