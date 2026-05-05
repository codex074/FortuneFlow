import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DatabaseProvider } from './hooks/useDatabase'
import { Layout } from './components/layout/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { TradingRecordPage } from './pages/TradingRecordPage'

export default function App() {
  return (
    <DatabaseProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="trading-record" element={<TradingRecordPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </DatabaseProvider>
  )
}
