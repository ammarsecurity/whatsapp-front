import { useEffect, useState } from 'react'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { CopyRow } from './ui/CopyRow'
import { Input } from './ui/Input'
import { SegmentedTabs } from './ui/PageHeader'
import { api, ApiClientError } from '../lib/api'
import type { GatewayEnvSecrets, GatewaySettings } from '../types/billing'

type GatewayProvider = 'wayl' | 'fynexpay'
type EnvMode = 'test' | 'live'

function envLabel(env: EnvMode) {
  return env === 'live' ? 'Production (live)' : 'Test'
}

function envSavedLabel(env: EnvMode, meta: GatewayEnvSecrets, withMerchant: boolean) {
  const parts: string[] = []
  if (meta.hasApiKey) parts.push('API')
  if (withMerchant && meta.hasMerchantToken) parts.push('Merchant')
  if (meta.hasWebhookSecret) parts.push('Webhook')
  if (!parts.length) return `${envLabel(env)}: لا مفاتيح`
  return `${envLabel(env)}: ${parts.join(' + ')} محفوظ`
}

function envBlock(data: GatewaySettings, env: EnvMode): GatewayEnvSecrets {
  return env === 'live' ? data.live : data.test
}

export function AdminGatewaySettingsPanel({
  provider,
  title,
  description,
  defaultBaseUrl,
  withMerchant,
}: {
  provider: GatewayProvider
  title: string
  description: string
  defaultBaseUrl: string
  withMerchant: boolean
}) {
  const [settings, setSettings] = useState<GatewaySettings | null>(null)
  const [isEnabled, setIsEnabled] = useState(false)
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl)
  const [activeEnvironment, setActiveEnvironment] = useState<EnvMode>('test')
  const [keysEnvironment, setKeysEnvironment] = useState<EnvMode>('test')
  const [apiKey, setApiKey] = useState('')
  const [merchantToken, setMerchantToken] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.adminGatewaySettings(provider)
      setSettings(data)
      setIsEnabled(data.isEnabled)
      setBaseUrl(data.baseUrl || defaultBaseUrl)
      const env = data.environment === 'live' ? 'live' : 'test'
      setActiveEnvironment(env)
      setKeysEnvironment(env)
      setRedirectUrl(data.redirectUrl || data.suggestedRedirectUrl)
      setWebhookUrl(data.webhookUrl || data.suggestedWebhookUrl)
      const block = envBlock(data, env)
      setApiKey(block.apiKey || '')
      setMerchantToken(block.merchantToken || '')
      setWebhookSecret(block.webhookSecret || '')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [provider])

  useEffect(() => {
    if (!settings) return
    const block = envBlock(settings, keysEnvironment)
    setApiKey(block.apiKey || '')
    setMerchantToken(block.merchantToken || '')
    setWebhookSecret(block.webhookSecret || '')
  }, [keysEnvironment, settings])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await api.saveGatewaySettings(provider, {
        isEnabled,
        baseUrl,
        environment: activeEnvironment,
        keysEnvironment,
        redirectUrl,
        webhookUrl,
        apiKey: apiKey.trim(),
        ...(withMerchant ? { merchantToken: merchantToken.trim() } : {}),
        webhookSecret: webhookSecret.trim(),
      })
      setSettings(result.settings)
      const block = envBlock(result.settings, keysEnvironment)
      setApiKey(block.apiKey || apiKey)
      setMerchantToken(block.merchantToken || merchantToken)
      setWebhookSecret(block.webhookSecret || webhookSecret)
      setSuccess('حُفظت الإعدادات')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setError(null)
    try {
      const result = await api.testGatewayConnection(provider, {
        keysEnvironment,
        baseUrl,
        apiKey: apiKey.trim() || undefined,
        ...(withMerchant ? { merchantToken: merchantToken.trim() || undefined } : {}),
      })
      setSuccess(result.ok ? 'الاتصال ناجح' : 'رفض البوابة بيانات الاعتماد')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'فشل اختبار الاتصال')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card title={title} description={description}>
      {error && (
        <div className="mb-4">
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}
      {success && (
        <div className="mb-4">
          <Alert variant="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Alert>
        </div>
      )}
      {loading || !settings ? (
        <p className="text-[15px] text-muted">جاري التحميل…</p>
      ) : (
        <div className="space-y-5">
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
            />
            تفعيل البوابة في صفحة الدفع
          </label>

          <div className="rounded-[14px] bg-slate-50 p-4 text-[13px] leading-relaxed text-muted">
            <p>
              <span className="font-semibold text-text">البيئة النشطة للدفع:</span>{' '}
              {envLabel(activeEnvironment)}
              {settings.readyForCheckout ? ' · جاهز للدفع' : ' · غير جاهز — أكمل مفاتيح البيئة النشطة'}
            </p>
            <p className="mt-2">{envSavedLabel('test', settings.test, withMerchant)}</p>
            <p>{envSavedLabel('live', settings.live, withMerchant)}</p>
          </div>

          <label className="block space-y-2">
            <span className="block text-[15px] font-medium text-text">البيئة النشطة للدفع</span>
            <select
              className="min-h-11 w-full rounded-[14px] border border-border bg-white px-4 text-[15px]"
              value={activeEnvironment}
              onChange={(e) => setActiveEnvironment(e.target.value as EnvMode)}
            >
              <option value="test">Test — للتجربة</option>
              <option value="live">Production (live) — للزبائن</option>
            </select>
            <p className="text-[13px] text-muted">
              عند التحويل بين test و live تُستخدم المفاتيح المحفوظة لكل بيئة دون إعادة إدخالها.
            </p>
          </label>

          <Input label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />

          <div>
            <p className="mb-2 text-[15px] font-medium text-text">تعديل مفاتيح البيئة</p>
            <SegmentedTabs
              tabs={[
                { id: 'test' as EnvMode, label: 'Test' },
                { id: 'live' as EnvMode, label: 'Production' },
              ]}
              value={keysEnvironment}
              onChange={setKeysEnvironment}
            />
          </div>

          <Input
            label={`API key (${envLabel(keysEnvironment)})`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono text-[13px]"
            autoComplete="off"
            spellCheck={false}
          />
          {withMerchant && (
            <Input
              label={`Merchant Bearer token (${envLabel(keysEnvironment)})`}
              value={merchantToken}
              onChange={(e) => setMerchantToken(e.target.value)}
              className="font-mono text-[13px]"
              autoComplete="off"
              spellCheck={false}
            />
          )}
          <Input
            label={`Webhook secret (${envLabel(keysEnvironment)})`}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="font-mono text-[13px]"
            autoComplete="off"
            spellCheck={false}
          />

          <Input
            label="Redirect URL"
            value={redirectUrl || settings.suggestedRedirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
            hint={
              provider === 'fynexpay'
                ? 'FynexPay يقبل روابط على دومين الواجهة فقط — يُضبط تلقائياً'
                : settings.suggestedRedirectUrl
            }
            readOnly={provider === 'fynexpay'}
          />
          <Input
            label="Webhook URL"
            value={webhookUrl || settings.suggestedWebhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            hint={
              provider === 'fynexpay'
                ? 'يُوجَّه عبر دومين الواجهة إلى الـ API — لا تستخدم subdomain الـ API'
                : undefined
            }
            readOnly={provider === 'fynexpay'}
          />
          {settings.suggestedWebhookUrl && (
            <CopyRow label="رابط الويب هوك المقترح" value={settings.suggestedWebhookUrl} />
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button loading={saving} onClick={save}>
              حفظ
            </Button>
            <Button variant="secondary" loading={testing} onClick={test}>
              اختبار اتصال ({envLabel(keysEnvironment)})
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
