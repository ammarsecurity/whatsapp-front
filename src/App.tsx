import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { AccountProvider } from './context/AccountContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { AccountsPage } from './pages/AccountsPage'
import { ContactsPage } from './pages/ContactsPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { InboxPage } from './pages/InboxPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { SuperAdminPage } from './pages/SuperAdminPage'

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AccountProvider>
                  <Layout />
                </AccountProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <SuperAdminPage />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  )
}
