import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import Landing        from './pages/Landing';
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import VerifyEmail    from './pages/VerifyEmail';
import Dashboard      from './pages/Dashboard';
import Accounts       from './pages/Accounts';
import Campaigns      from './pages/Campaigns';
import JobsActivity   from './pages/JobsActivity';
import Telegram       from './pages/Telegram';
import Settings       from './pages/Settings';
import Subscription   from './pages/Subscription';
import ApiKeys        from './pages/ApiKeys';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers     from './pages/admin/AdminUsers';
import AdminPlans     from './pages/admin/AdminPlans';
import AdminConfig    from './pages/admin/AdminConfig';
import AdminSupport   from './pages/admin/AdminSupport';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/landing"        element={<Landing />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/register"       element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/verify-email"    element={<VerifyEmail />} />

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

          {/* Admin */}
          <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="admin/users"  element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="admin/plans"  element={<AdminRoute><AdminPlans /></AdminRoute>} />
          <Route path="admin/config"   element={<AdminRoute><AdminConfig /></AdminRoute>} />
          <Route path="admin/support" element={<AdminRoute><AdminSupport /></AdminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
