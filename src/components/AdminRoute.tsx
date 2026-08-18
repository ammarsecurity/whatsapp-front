import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert } from './ui/Alert'
import { useAuth } from '../context/AuthContext'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isSuperAdmin } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg pt-8">
        <Alert variant="warning" title="Insufficient permissions">
          This page is for administrators only. Your account does not have Super
          Admin access.
        </Alert>
      </div>
    )
  }

  return children
}
