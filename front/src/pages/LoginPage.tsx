import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { ApiClientError } from '../lib/api'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'حدث خطأ غير متوقع',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-primary-500 shadow-[0px_4px_12px_rgba(15,23,42,0.12)]">
            <MessageCircle className="h-8 w-8 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-[32px] font-bold leading-tight text-text">وحدة تحكم واتساب</h1>
          <p className="mt-2 text-[15px] text-muted">
            إدارة الأرقام، إرسال الرسائل، ومتابعة حالة الجلسات من مكان واحد
          </p>
        </div>

        <div className="rounded-[16px] bg-white p-8 shadow-[0px_8px_24px_rgba(15,23,42,0.16)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="اسم المستخدم"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
            />
            <Input
              label="كلمة المرور"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <Alert variant="error" title="تعذّر تسجيل الدخول">
                {error}
              </Alert>
            )}

            <Button type="submit" className="w-full" loading={loading} variant="primary">
              دخول
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
