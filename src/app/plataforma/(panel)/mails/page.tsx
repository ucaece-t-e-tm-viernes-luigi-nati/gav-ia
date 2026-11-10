import type { Metadata } from 'next'
import { Card, Empty, PageTitle, StatusBadge } from '@/components/panel/ui'
import { q } from '@/lib/db'
import { formatDateTime } from '@/lib/dates'
import { requireSuperadmin } from '@/lib/guards'
import { mailProviderLabel } from '@/lib/mail'

export const metadata: Metadata = { title: 'Mails' }

export default async function MailsPage() {
  await requireSuperadmin()
  const rows = await q<{ id: string; to_email: string; subject: string; body_text: string | null; template: string | null; status: string; error: string | null; created_at: Date; sent_at: Date | null }>(
    `SELECT id, to_email, subject, body_text, template, status, error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 150`,
  )
  return (
    <>
      <PageTitle eyebrow="Plataforma" title="Mails" description={`Registro de todos los mails (email_outbox). Envío: ${mailProviderLabel()}. Las contraseñas y códigos se guardan enmascarados.`} />
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={m.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <StatusBadge status={m.status} />
                    <span className="font-semibold">{m.subject}</span>
                    <span className="text-muted-foreground">→ {m.to_email}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(m.created_at)}
                      {m.template && ` · ${m.template}`}
                    </span>
                  </summary>
                  {m.error && <p className="mt-2 text-xs text-destructive">Error: {m.error}</p>}
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs">{m.body_text ?? '(sin versión de texto)'}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Todavía no se generaron mails.</Empty>
        )}
      </Card>
    </>
  )
}
