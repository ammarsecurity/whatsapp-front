import type { DocEndpoint } from '../../data/apiDocs'
import { getApiUrl } from '../../lib/storage'
import { MethodBadge } from './MethodBadge'
import { CodeBlock } from './CodeBlock'

function buildCurl(endpoint: DocEndpoint, baseUrl: string): string {
  const url = `${baseUrl}${endpoint.path.replace(':accountId', 'ibsprimary').replace(':userId', '1')}`
  const lines = [`curl -X ${endpoint.method} "${url}"`]
  if (endpoint.body) {
    lines.push(`  -H "Content-Type: application/json"`)
    lines.push(`  -d '${JSON.stringify(endpoint.body)}'`)
  }
  if (endpoint.auth) {
    lines.push(`  -H "Authorization: <your_jwt_token>"`)
  }
  return lines.join(' \\\n')
}

export function EndpointDoc({ endpoint }: { endpoint: DocEndpoint }) {
  const base = getApiUrl()

  return (
    <article
      id={endpoint.id}
      className="scroll-mt-24 rounded-xl border border-border bg-card/50 p-5"
    >
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <MethodBadge method={endpoint.method} />
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-text">
          {endpoint.path}
        </code>
      </div>

      <h3 className="text-base font-semibold text-text">{endpoint.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {endpoint.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            endpoint.auth
              ? 'bg-wa-green/10 text-wa-green'
              : 'bg-border/60 text-muted'
          }`}
        >
          {endpoint.auth ? 'Auth required' : 'Public'}
        </span>
      </div>

      {endpoint.params && endpoint.params.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Parameters
          </h4>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Required</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.params.map((p) => (
                  <tr
                    key={p.name}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-wa-green">
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-muted">{p.type}</td>
                    <td className="px-3 py-2 text-muted">
                      {p.required ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-2 text-muted">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {endpoint.body && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Request body
          </h4>
          <CodeBlock code={JSON.stringify(endpoint.body, null, 2)} />
        </div>
      )}

      {endpoint.response && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Example response
          </h4>
          <CodeBlock code={JSON.stringify(endpoint.response, null, 2)} />
        </div>
      )}

      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          cURL example
        </h4>
        <CodeBlock code={buildCurl(endpoint, base)} language="bash" />
      </div>

      {endpoint.notes && endpoint.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm text-muted">
          {endpoint.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span className="text-wa-green">•</span>
              {note}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
