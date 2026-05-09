import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DatabaseProvider } from './hooks/useDatabase'
import { Layout } from './components/layout/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { TradingRecordPage } from './pages/TradingRecordPage'
import { LoginPage } from './pages/LoginPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public routes — accessible without login */}
        <Route path="verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="reset-password/:token" element={<ResetPasswordPage />} />

        {!user ? (
          <Route path="*" element={<LoginPage />} />
        ) : (
          <Route element={<DatabaseProvider><Layout /></DatabaseProvider>}>
            <Route index element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="trading-record" element={<TradingRecordPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
