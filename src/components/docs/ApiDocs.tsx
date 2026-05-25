import { BookOpen, Key, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  API_VERSION,
  DOC_ERRORS,
  DOC_QUICK_START,
  DOC_SECTIONS,
} from '../../data/apiDocs'
import { DEFAULT_API_URL, getApiUrl } from '../../lib/storage'
import { EndpointDoc } from './EndpointDoc'
import { CodeBlock } from './CodeBlock'

const NAV_ITEMS = [
  { id: 'intro', title: 'Introduction' },
  { id: 'quickstart', title: 'Quick start' },
  { id: 'headers', title: 'Headers' },
  ...DOC_SECTIONS.filter((s) => s.id !== 'intro').map((s) => ({
    id: s.id,
    title: s.title,
    endpoints: s.endpoints,
  })),
]

export function ApiDocs() {
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
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setActiveSection(id)
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav className="lg:sticky lg:top-6 lg:w-52 lg:shrink-0">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <BookOpen className="h-3.5 w-3.5" />
          On this page
        </p>
        <ul className="space-y-0.5 rounded-xl border border-border bg-panel p-2 text-sm">
          {NAV_ITEMS.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => scrollTo(section.id)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  activeSection === section.id
                    ? 'bg-wa-green/15 font-medium text-wa-green'
                    : 'text-muted hover:bg-card/60 hover:text-text'
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
          className="scroll-mt-24 rounded-xl border border-border bg-gradient-to-br from-wa-teal/20 to-transparent p-6"
        >
          <h2 className="text-xl font-bold text-text">WhatsApp API</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Developer reference for the WhatsApp messaging backend. Base URL,
            authentication, account lifecycle, and message endpoints.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full border border-border bg-panel px-3 py-1 text-muted">
              Version {API_VERSION}
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
            Quick start
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
            Headers
          </h2>
          <CodeBlock
            language="http"
            code={`Content-Type: application/json
Authorization: <jwt_from_login>

# Base URL (no trailing slash)
${baseUrl || DEFAULT_API_URL}`}
          />
        </section>

        {DOC_SECTIONS.filter((s) => s.id !== 'intro').map((section) => (
          <section
            key={section.id}
            id={section.id}
            data-doc-section
            className="scroll-mt-24 space-y-4"
          >
            <div>
              <h2 className="text-lg font-bold text-text">{section.title}</h2>
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
                      <span className="font-medium text-text">{err.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{err.detail}</p>
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
