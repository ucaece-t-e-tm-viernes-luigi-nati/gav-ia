import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, Empty, PageTitle, STATUS_LABELS, StatusBadge, Table, Td } from '@/components/panel/ui'
import { formatDate } from '@/lib/dates'
import { q } from '@/lib/db'
import { requireSuperadmin } from '@/lib/guards'
import { formatMoney } from '@/lib/money'

export const metadata: Metadata = { title: 'Balnearios' }

const FILTERS = ['trial', 'active', 'past_due', 'paused', 'cancelled']

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requireSuperadmin()
  const { estado } = await searchParams
  const filter = typeof estado === 'string' && FILTERS.includes(estado) ? estado : null
  const rows = await q<{ id: string; name: string; city: string; status: string; plan: string | null; monthly_price_cents: string; currency: string; next_due_date: string | null; units: number; reservations: number; is_demo: boolean }>(
    `SELECT b.id, b.name, b.city, b.status, p.name AS plan, b.monthly_price_cents::text, b.currency,
            to_char(b.next_due_date, 'YYYY-MM-DD') AS next_due_date, b.is_demo,
            (SELECT count(*)::int FROM units u WHERE u.balneario_id = b.id) AS units,
            (SELECT count(*)::int FROM reservations r WHERE r.balneario_id = b.id) AS reservations
       FROM balnearios b LEFT JOIN plans p ON p.id = b.plan_id
      WHERE ($1::text IS NULL OR b.status = $1)
      ORDER BY b.created_at DESC`,
    [filter],
  )

  return (
    <>
      <PageTitle eyebrow="Plataforma GavIA" title="Balnearios" description="Clientes de GavIA: estado comercial, plan, abono y uso del sistema." />
      <nav aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/plataforma/empresas" className={`rounded-full px-3 py-1.5 font-semibold ${!filter ? 'bg-foreground text-background' : 'border border-border bg-card'}`}>
          Todos
        </Link>
        {FILTERS.map((s) => (
          <Link key={s} href={`/plataforma/empresas?estado=${s}`} className={`rounded-full px-3 py-1.5 font-semibold ${filter === s ? 'bg-foreground text-background' : 'border border-border bg-card'}`}>
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length ? (
          <Table head={['Balneario', 'Plan', 'Abono', 'Próx. vencimiento', 'Unidades / reservas', 'Estado']}>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/plataforma/empresas/${c.id}`} className="font-semibold hover:text-primary">
                    {c.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {c.city}
                    {c.is_demo && ' · demo'}
                  </p>
                </Td>
                <Td>{c.plan ?? '—'}</Td>
                <Td>{formatMoney(Number(c.monthly_price_cents), c.currency)}</Td>
                <Td>{formatDate(c.next_due_date)}</Td>
                <Td>
                  {c.units} / {c.reservations}
                </Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No hay balnearios {filter ? 'con ese estado' : 'todavía'}.</Empty>
        )}
      </Card>
    </>
  )
}
