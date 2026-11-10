import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty, PageTitle, StatusBadge, Table, Td } from '@/components/panel/ui'
import { formatDateTime } from '@/lib/dates'
import { q } from '@/lib/db'
import { requireSuperadmin } from '@/lib/guards'

export const metadata: Metadata = { title: 'Solicitudes' }

export default async function ApplicationsPage() {
  await requireSuperadmin()
  const rows = await q<{ id: string; email: string; contact_name: string | null; data: { name?: string; city?: string }; status: string; step: number; submitted_at: Date | null; updated_at: Date; plan: string | null }>(
    `SELECT a.id, a.email, a.contact_name, a.data, a.status, a.step, a.submitted_at, a.updated_at, p.name AS plan
       FROM client_application a LEFT JOIN plans p ON p.id = a.requested_plan_id
      ORDER BY (a.status = 'pending_review') DESC, coalesce(a.submitted_at, a.updated_at) DESC LIMIT 200`,
  )
  return (
    <>
      <PageTitle eyebrow="Plataforma GavIA" title="Solicitudes de alta" description="Las pendientes aparecen primero. Los borradores son altas que todavía no se enviaron." />
      <Card>
        {rows.length ? (
          <Table head={['Balneario', 'Responsable', 'Plan', 'Estado', 'Fecha']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link href={`/plataforma/solicitudes/${a.id}`} className="font-semibold hover:text-primary">
                    {a.data?.name ?? '(sin nombre todavía)'}
                  </Link>
                  <p className="text-xs text-muted-foreground">{a.data?.city ?? ''}</p>
                </Td>
                <Td>
                  <p>{a.contact_name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{a.email}</p>
                </Td>
                <Td>{a.plan ?? '—'}</Td>
                <Td>
                  <StatusBadge status={a.status} />
                  {a.status === 'draft' && <p className="mt-1 text-xs text-muted-foreground">Paso {a.step} de 5</p>}
                </Td>
                <Td className="text-xs text-muted-foreground">{formatDateTime(a.submitted_at ?? a.updated_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Todavía no hay solicitudes.</Empty>
        )}
      </Card>
    </>
  )
}
