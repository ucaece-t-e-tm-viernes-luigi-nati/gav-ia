import type { Metadata } from 'next'
import { Card, Empty, PageTitle, Table, Td } from '@/components/panel/ui'
import { formatDateTime } from '@/lib/dates'
import { q } from '@/lib/db'
import { requireSuperadmin } from '@/lib/guards'

export const metadata: Metadata = { title: 'Auditoría' }

export default async function AuditPage() {
  await requireSuperadmin()
  const rows = await q<{ id: string; action: string; actor: string | null; client: string | null; entity: string; entity_id: string | null; data: Record<string, unknown> | null; created_at: Date }>(
    `SELECT l.id::text, l.action, p.email AS actor, b.name AS client, l.entity, l.entity_id, l.data, l.created_at
       FROM audit_log l
       LEFT JOIN profiles p ON p.id = l.actor_id
       LEFT JOIN balnearios b ON b.id = l.balneario_id
      ORDER BY l.created_at DESC LIMIT 300`,
  )
  return (
    <>
      <PageTitle eyebrow="Plataforma GavIA" title="Auditoría" description="Altas, aprobaciones, rechazos, cambios de estado y plan, pagos, equipo y cambios en los datos de cada balneario. Últimos 300 registros." />
      <Card>
        {rows.length ? (
          <Table head={['Fecha', 'Acción', 'Quién', 'Balneario', 'Detalle']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                <Td className="font-mono text-xs">
                  {r.action}
                  <p className="text-muted-foreground">{r.entity}</p>
                </Td>
                <Td className="text-xs">
                  {r.actor ?? '—'}
                  {typeof r.data?.actor_role === 'string' && <p className="text-muted-foreground">{r.data.actor_role}</p>}
                </Td>
                <Td className="text-xs">{r.client ?? '—'}</Td>
                <Td className="max-w-[320px] break-words font-mono text-[11px] text-muted-foreground">{r.data ? JSON.stringify(r.data).slice(0, 400) : r.entity_id ?? ''}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Sin registros todavía.</Empty>
        )}
      </Card>
    </>
  )
}
