import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { notification } from 'antd'
import { useAuthStore, useNotificationStore, useAlertStore } from './store'
import MainLayout from './components/layout/MainLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DefectsPage from './pages/DefectsPage'
import DefectDetailPage from './pages/DefectDetailPage'
import ProductsPage from './pages/ProductsPage'
import VersionsPage from './pages/VersionsPage'
import AlertsPage from './pages/AlertsPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import CaseAnalysisPage from './pages/CaseAnalysisPage'
import AnalyticsDashboard from './pages/AnalyticsDashboard'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated() ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user, isAuthenticated } = useAuthStore()
  const { addNotification, setUnreadCount } = useNotificationStore()
  const { addAlert } = useAlertStore()
  const [api, contextHolder] = notification.useNotification()

  useEffect(() => {
    if (!isAuthenticated() || !user) return

    // Connect to SSE for real-time notifications
    const evtSource = new EventSource(`/api/sse?userId=${user.id}`)

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'notification') {
        addNotification(data)
        setUnreadCount(prev => prev + 1)
      }

      if (data.type === 'alert') {
        addAlert(data)
        const notifType = data.level === 'critical' ? 'error' : data.level === 'warning' ? 'warning' : 'info'
        api[notifType]({
          message: `🚨 系统预警`,
          description: data.message,
          duration: 8,
          placement: 'topRight',
        })
      }
    }

    evtSource.onerror = () => evtSource.close()

    return () => evtSource.close()
  }, [user])

  return (
    <>
      {contextHolder}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="defects" element={<DefectsPage />} />
          <Route path="defects/:id" element={<DefectDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="case-analysis" element={<CaseAnalysisPage />} />
          <Route path="analytics-board" element={<AnalyticsDashboard />} />
        </Route>
      </Routes>
    </>
  )
}
