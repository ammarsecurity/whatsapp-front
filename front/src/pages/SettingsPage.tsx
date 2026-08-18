import { useEffect, useState } from 'react'
import { ApiDocs } from '../components/docs/ApiDocs'
import { IntegrationsPanel, OptOutPanel } from '../components/IntegrationsPanel'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { PageHeader, SegmentedTabs } from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { ApiClientError } from '../lib/api'
import {
  DEFAULT_API_URL,
  getApiUrl,
  setApiUrl,
} from '../lib/storage'

const PRESETS = [{ label: 'من ملف .env', url: DEFAULT_API_URL }]

type Tab = 'account' | 'integrations' | 'optout' | 'docs' | 'config'

export function SettingsPage() {
  const { user, updateProfile } = useAuth()
  const [tab, setTab] = useState<Tab>('account')
  const [apiUrl, setApiUrlState] = useState(getApiUrl)
  const [saved, setSaved] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState(user?.username ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  useEffect(() => {
    setNewUsername(user?.username ?? '')
  }, [user?.username])

  function save() {
    setApiUrl(apiUrl.trim() || DEFAULT_API_URL)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function saveProfile() {
    setProfileError(null)
    setProfileSuccess(null)

    if (!currentPassword) {
      setProfileError('كلمة المرور الحالية مطلوبة')
      return
    }

    const usernameChanged =
      newUsername.trim().length > 0 && newUsername.trim() !== user?.username
    const passwordChanged = newPassword.length > 0

    if (!usernameChanged && !passwordChanged) {
      setProfileError('غيّر اسم المستخدم أو أدخل كلمة مرور جديدة')
      return
    }

    if (passwordChanged && newPassword.length < 6) {
      setProfileError('كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف')
      return
    }

    if (passwordChanged && newPassword !== confirmPassword) {
      setProfileError('كلمتا المرور الجديدتان غير متطابقتين')
      return
    }

    setProfileLoading(true)
    try {
      await updateProfile({
        currentPassword,
        ...(usernameChanged ? { username: newUsername.trim() } : {}),
        ...(passwordChanged ? { password: newPassword } : {}),
      })
      setProfileSuccess('تم تحديث الحساب بنجاح')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setProfileError(
        err instanceof ApiClientError ? err.message : 'تعذّر تحديث الحساب',
      )
    } finally {
      setProfileLoading(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: 'الحساب' },
    { id: 'integrations', label: 'API والربط' },
    { id: 'optout', label: 'إلغاء الاشتراك' },
    { id: 'docs', label: 'توثيق API' },
    { id: 'config', label: 'الخادم' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="الإعدادات"
        description="حسابك، بيانات الربط الحالية، وتوثيق واجهة البرمجة في تبويبات واضحة."
      />

      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'account' && (
        <Card
          title="حسابك"
          description="تغيير اسم المستخدم أو كلمة المرور"
        >
          <div className="max-w-[700px] space-y-4">
            {profileError && (
              <Alert variant="error" title="خطأ" onDismiss={() => setProfileError(null)}>
                {profileError}
              </Alert>
            )}
            {profileSuccess && (
              <Alert
                variant="success"
                title="تم الحفظ"
                onDismiss={() => setProfileSuccess(null)}
              >
                {profileSuccess}
              </Alert>
            )}

            <Input
              label="كلمة المرور الحالية"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              label="اسم المستخدم"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="username"
              hint={`مسجّل الدخول باسم ${user?.username ?? '—'}`}
            />
            <Input
              label="كلمة المرور الجديدة"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              hint="اتركها فارغة للإبقاء على كلمة المرور الحالية"
            />
            <Input
              label="تأكيد كلمة المرور الجديدة"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <div className="flex justify-end">
              <Button loading={profileLoading} onClick={saveProfile}>
                حفظ التغييرات
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'integrations' && <IntegrationsPanel />}

      {tab === 'optout' && <OptOutPanel />}

      {tab === 'config' && (
        <>
          {saved && (
            <Alert
              variant="success"
              title="تم الحفظ"
              onDismiss={() => setSaved(false)}
            >
              حُفظ عنوان الـ API. أمثلة التوثيق ستستخدم العنوان الجديد.
            </Alert>
          )}

          <Card title="عنوان خادم الـ API">
            <div className="max-w-[700px] space-y-4">
              <Input
                label="عنوان الخادم"
                value={apiUrl}
                onChange={(e) => setApiUrlState(e.target.value)}
                placeholder={DEFAULT_API_URL}
                hint="بدون شرطة في النهاية. يُستخدم لكل طلبات اللوحة وأمثلة cURL."
              />

              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => setApiUrlState(p.url)}
                    className="min-h-11 rounded-[14px] bg-slate-50 px-4 text-[13px] font-medium text-muted transition-colors hover:bg-primary-50 hover:text-primary-700"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={save}>حفظ الإعدادات</Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {tab === 'docs' && <ApiDocs />}
    </div>
  )
}
