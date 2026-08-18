import { BookOpen, Key, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  API_VERSION,
  API_BUILD,
  DOC_ERRORS,
  DOC_QUICK_START,
  getVisibleDocSections,
} from '../../data/apiDocs'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_API_URL, getApiUrl } from '../../lib/storage'
import { EndpointDoc } from './EndpointDoc'
import { CodeBlock } from './CodeBlock'

const SECTION_TITLES_AR: Record<string, string> = {
  intro: 'مقدمة',
  'instance-api': 'إرسال بالمفتاح',
  auth: 'المصادقة',
  system: 'النظام',
  accounts: 'الحسابات',
  messages: 'الرسائل',
  contacts: 'جهات الاتصال',
  campaigns: 'الحملات',
  templates: 'قوالب الرسائل',
  'opt-out': 'إلغاء الاشتراك',
  'auto-replies': 'الردود التلقائية',
  integrations: 'الربط والمفاتيح',
  realtime: 'الاتصال اللحظي',
  'admin-health': 'الإدارة — صحة النظام',
  'admin-accounts': 'الإدارة — حسابات واتساب',
  admin: 'الإدارة — المستخدمون',
  errors: 'الأخطاء والاتفاقيات',
}

const ERROR_AR: Record<string, { title: string; detail: string }> = {
  '401': {
    title: 'غير مصرّح',
    detail: 'رمز JWT أو مفتاح API ناقص أو غير صالح. أعد تسجيل الدخول أو راجع ترويسة X-API-Key.',
  },
  '404': {
    title: 'غير موجود',
    detail: 'المسار أو المورد غير موجود. إذا كانت المسارات الجديدة كلها 404، أعد نشر الخلفية وأعد تشغيل الخدمة.',
  },
  '429': {
    title: 'تجاوز الحد / الحصة',
    detail: 'تجاوزت الحصة اليومية للرسائل أو التحقق من الأرقام. راجع GET /api/integrations/quota.',
  },
  '503': {
    title: 'الحساب غير جاهز',
    detail: 'حساب واتساب غير مرتبط أو ما زال يبدأ. راقب GET /api/accounts/:id/status.',
  },
  '4xx/5xx': {
    title: 'شكل الخطأ',
    detail: 'معظم الأخطاء تعيد JSON: { "success": false, "error": "..." }',
  },
}

function sectionTitle(id: string, fallback: string) {
  return SECTION_TITLES_AR[id] ?? fallback
}

export function ApiDocs() {
  const { isSuperAdmin } = useAuth()
  const docSections = useMemo(
    () => getVisibleDocSections(isSuperAdmin),
    [isSuperAdmin],
  )

  const navItems = useMemo(
    () => [
      { id: 'intro', title: 'مقدمة' },
      { id: 'quickstart', title: 'البدء السريع' },
      { id: 'headers', title: 'الترويسات' },
      ...docSections.filter((s) => s.id !== 'intro').map((s) => ({
        id: s.id,
        title: sectionTitle(s.id, s.title),
        endpoints: s.endpoints,
      })),
    ],
    [docSections],
  )

  const [activeSection, setActiveSection] = useState('intro')
  const baseUrl = getApiUrl()

  useEffect(() => {
    const sections = document.querySelectorAll('[data-doc-section]')
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target.id) {
          setActiveSection(visible.target.id)
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    )
    sections.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [docSections])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveSection(id)
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav className="lg:sticky lg:top-6 lg:w-52 lg:shrink-0">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <BookOpen className="h-3.5 w-3.5" />
          في هذه الصفحة
        </p>
        <ul className="space-y-1 rounded-[16px] bg-white p-2 text-[15px] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
          {navItems.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => scrollTo(section.id)}
                className={`w-full rounded-[14px] px-3 py-2 text-start transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary-50 font-semibold text-primary-700'
                    : 'text-muted hover:bg-slate-50 hover:text-text'
                }`}
              >
                {section.title}
              </button>
              {'endpoints' in section &&
                section.endpoints.length > 0 &&
                activeSection === section.id && (
                  <ul className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {section.endpoints.map((ep) => (
                      <li key={ep.id}>
                        <button
                          type="button"
                          onClick={() => scrollTo(ep.id)}
                          className="block w-full truncate rounded px-2 py-1 text-left text-xs text-muted hover:text-text"
                        >
                          {ep.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        <section
          id="intro"
          data-doc-section
          className="scroll-mt-24 rounded-[16px] bg-white p-6 shadow-[0px_1px_3px_rgba(15,23,42,0.08)]"
        >
          <h2 className="text-xl font-bold text-text">واجهة واتساب البرمجية</h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
            مرجع للمطورين: ربط الحسابات، الرسائل الصادرة والواردة، مجموعات جهات الاتصال، الحملات، القوالب، الوارد، الردود التلقائية، الويب هوك، مفاتيح API، وأحداث WebSocket.
            {!isSuperAdmin && (
              <> مسارات الإدارة مخفية في هذا العرض.</>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
            <span className="rounded-full bg-slate-50 px-3 py-1 text-muted">
              الإصدار {API_VERSION}
            </span>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-muted">
              البناء {API_BUILD}
            </span>
            <span className="rounded-full border border-border bg-panel px-3 py-1 font-mono text-wa-green">
              {baseUrl || DEFAULT_API_URL}
            </span>
          </div>
        </section>

        <section
          id="quickstart"
          data-doc-section
          className="scroll-mt-24 space-y-3"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold text-text">
            <Zap className="h-5 w-5 text-wa-green" />
            البدء السريع
          </h2>
          <ol className="space-y-2 rounded-xl border border-border bg-panel p-4 text-sm text-muted">
            {DOC_QUICK_START.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wa-green/15 text-xs font-bold text-wa-green">
                  {i + 1}
                </span>
                <code className="pt-0.5 font-mono text-xs text-text">{step}</code>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="headers"
          data-doc-section
          className="scroll-mt-24 space-y-3"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold text-text">
            <Key className="h-5 w-5 text-wa-green" />
            الترويسات
          </h2>
          <CodeBlock
            language="http"
            code={`Content-Type: application/json
Authorization: <jwt_from_login>
# Or machine access:
X-API-Key: wsk_<your_api_key>

# Base URL (no trailing slash, no /api suffix)
${baseUrl || DEFAULT_API_URL}

# Public health check (no auth)
GET ${baseUrl || DEFAULT_API_URL}/health`}
          />
        </section>

        {docSections.filter((s) => s.id !== 'intro').map((section) => (
          <section
            key={section.id}
            id={section.id}
            data-doc-section
            className="scroll-mt-24 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-text">{sectionTitle(section.id, section.title)}</h2>
              {section.description && (
                <p className="mt-1 text-sm text-muted">{section.description}</p>
              )}
            </div>

            {section.id === 'errors' ? (
              <div className="space-y-3">
                {DOC_ERRORS.map((err) => (
                  <div
                    key={err.code}
                    className="rounded-xl border border-border bg-card/50 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-red-400">
                        {err.code}
                      </span>
                      <span className="font-medium text-text">
                        {ERROR_AR[err.code]?.title ?? err.title}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {ERROR_AR[err.code]?.detail ?? err.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {section.endpoints.map((ep) => (
                  <EndpointDoc key={ep.id} endpoint={ep} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
