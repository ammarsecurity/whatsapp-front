import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from './ui/Alert'
import { DEFAULT_API_URL, getApiUrl } from '../lib/storage'

const MIN_API_BUILD = '2026-08-18-v28'

interface HealthResponse {
  success?: boolean
  apiBuild?: string
  features?: string[]
}

export function ApiHealthBanner() {
  const [issue, setIssue] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const base = getApiUrl()
      try {
        const res = await fetch(`${base}/health`)
        const text = await res.text()
        if (text.trimStart().startsWith('<!')) {
          if (!cancelled) {
            setIssue(
              `عنوان الـ API "${base}" يعيد HTML وليس خادم Node. استخدم ${DEFAULT_API_URL} من الإعدادات → الخادم.`,
            )
          }
          return
        }
        const data = JSON.parse(text) as HealthResponse
        if (!res.ok || !data.apiBuild) {
          if (!cancelled) {
            setIssue(
              `الخادم على ${base} قديم (لا يوجد apiBuild). ارفع آخر نسخة من الخلفية وأعد تشغيل Node.`,
            )
          }
          return
        }
        if (data.apiBuild < MIN_API_BUILD) {
          if (!cancelled) {
            setIssue(
              `إصدار الخلفية ${data.apiBuild}؛ المطلوب ${MIN_API_BUILD}+. ارفع آخر نسخة وأعد تشغيل الخدمة.`,
            )
          }
        }
      } catch {
        if (!cancelled) {
          setIssue(`تعذّر الوصول إلى الـ API على ${base}. راجع الإعدادات → الخادم.`)
        }
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!issue) return null

  return (
    <Alert variant="error" title="الخلفية غير محدّثة" className="mb-6">
      {issue}{' '}
      <Link to="/settings" className="font-semibold underline">
        فتح الإعدادات
      </Link>
    </Alert>
  )
}
