import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { Card, Empty, Metric, PageTitle, StatusBadge, Table, Td } from '@/components/panel/ui'
import { formatDate, formatDateTime } from '@/lib/dates'
import { q, q1 } from '@/lib/db'
import { requireSuperadmin } from '@/lib/guards'
import { formatMoney } from '@/lib/money'
import { listActivePlans } from '@/lib/onboarding'
import { registerPayment, resendAccess, setClientStatus, updateClientPlan } from '../../actions'

export const metadata: Metadata = { title: 'Balneario' }

type Balneario = {
  id: string
  name: string
  city: string
  address: string
  phone: string
  email: string
  status: string
  is_demo: boolean
  plan_id: string | null
  plan_name: string | null
  monthly_price_cents: string
  currency: string
  billing_day: number | null
  next_due_date: string | null
  trial_ends_at: string | null
  season_start: string | null
  season_end: string | null
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const c = await q1<Balneario>(
    `SELECT b.id, b.name, b.city, b.address, b.phone, b.email, b.status, b.is_demo, b.plan_id, p.name AS plan_name,
            b.monthly_price_cents::text, b.currency, b.billing_day,
            to_char(b.next_due_date, 'YYYY-MM-DD') AS next_due_date, to_char(b.trial_ends_at, 'YYYY-MM-DD') AS trial_ends_at,
            to_char(b.season_start, 'YYYY-MM-DD') AS season_start, to_char(b.season_end, 'YYYY-MM-DD') AS season_end
       FROM balnearios b LEFT JOIN plans p ON p.id = b.plan_id WHERE b.id = $1`,
    [id],
  )
  if (!c) notFound()
  const [members, payments, plans, stats] = await Promise.all([
    q<{ userId: string; name: string; email: string; role: string; active: boolean; mustChangePassword: boolean | null }>(
      `SELECT m.user_id::text AS "userId", coalesce(nullif(pr.full_name, ''), pr.email) AS name, pr.email, m.role, m.active, u."mustChangePassword"
         FROM memberships m JOIN profiles pr ON pr.id = m.user_id LEFT JOIN "user" u ON u.id = m.user_id::text
        WHERE m.balneario_id = $1 ORDER BY (m.role = 'owner') DESC, pr.full_name`,
      [id],
    ),
    q<{ id: string; period: string; amount_cents: string; currency: string; status: string; method: string | null; paid_at: Date | null }>(
      `SELECT id, period, amount_cents::text, currency, status, method, paid_at FROM client_payment WHERE client_id = $1 ORDER BY period DESC LIMIT 24`,
      [id],
    ),
    listActivePlans(),
    q1<{ units: number; reservations: number; customers: number; active_now: number }>(
      `SELECT (SELECT count(*)::int FROM units WHERE balneario_id = $1) AS units,
              (SELECT count(*)::int FROM reservations WHERE balneario_id = $1) AS reservations,
              (SELECT count(*)::int FROM customers WHERE balneario_id = $1) AS customers,
              (SELECT count(*)::int FROM reservations WHERE balneario_id = $1 AND status <> 'cancelada' AND current_date BETWEEN start_date AND end_date) AS active_now`,
      [id],
    ),
  ])
  const statusActions = ['active', 'paused', 'cancelled'].filter((s) => s !== c.status)

  return (
    <>
      <Link href="/plataforma/empresas" className="text-xs font-semibold text-muted-foreground hover:text-primary">
        ← Balnearios
      </Link>
      <PageTitle
        title={c.name}
        description={
          <>
            <StatusBadge status={c.status} /> · {c.city || '—'} · {c.address || '—'}
            {c.season_start ? ` · temporada ${formatDate(c.season_start)} al ${formatDate(c.season_end)}` : ''}
            {c.is_demo ? ' · demo' : ''}
          </>
        }
        actions={
          <>
            <Link href={`/plataforma/empresas/${c.id}/supervision`} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
              Supervisar (sin importes)
            </Link>
            {statusActions.map((s) => (
              <form key={s} action={setClientStatus.bind(null, c.id, s)}>
                <button className={`rounded-xl border px-4 py-2 text-sm font-semibold ${s === 'active' ? 'border-primary text-primary' : 'border-border'} hover:bg-muted`}>
                  {s === 'active' ? 'Activar' : s === 'paused' ? 'Pausar' : 'Dar de baja'}
                </button>
              </form>
            ))}
          </>
        }
      />
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Abono mensual" value={formatMoney(Number(c.monthly_price_cents), c.currency)} hint={c.plan_name ?? undefined} />
        <Metric
          label={c.status === 'trial' ? 'Fin de la prueba' : 'Próximo vencimiento'}
          value={formatDate(c.status === 'trial' ? c.trial_ends_at : c.next_due_date)}
          hint={c.billing_day ? `Día de pago: ${c.billing_day}` : undefined}
        />
        <Metric label="Unidades en el plano" value={stats?.units ?? 0} />
        <Metric label="Reservas (en curso hoy)" value={`${stats?.reservations ?? 0} (${stats?.active_now ?? 0})`} hint={`${stats?.customers ?? 0} clientes cargados`} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Registrar pago" description={`Se imputa al vencimiento del ${formatDate(c.next_due_date)} y corre el próximo al mes siguiente.`}>
          <ActionForm action={registerPayment.bind(null, c.id)} submitLabel="Registrar pago" resetOnSuccess>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Monto ({c.currency})
                <input name="amount" inputMode="decimal" required defaultValue={String(Number(c.monthly_price_cents) / 100)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Medio
                <select name="method" className={inputClass}>
                  <option value="transferencia">Transferencia</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="otro">Otro</option>
                </select>
              </label>
            </div>
            <label className={labelClass}>
              Notas / comprobante
              <input name="notes" maxLength={300} className={inputClass} />
            </label>
          </ActionForm>
        </Card>

        <Card title="Plan y facturación">
          <ActionForm action={updateClientPlan.bind(null, c.id)} submitLabel="Guardar plan">
            <label className={labelClass}>
              Plan
              <select name="plan_id" defaultValue={c.plan_id ?? plans[0]?.id ?? ''} className={inputClass}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatMoney(Number(p.price_cents), p.currency)} / mes)
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className={labelClass}>
                Abono / mes
                <input name="price" inputMode="decimal" required defaultValue={String(Number(c.monthly_price_cents) / 100)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Día de pago
                <input name="billing_day" type="number" min={1} max={28} required defaultValue={c.billing_day ?? 10} className={inputClass} />
              </label>
              <label className={labelClass}>
                Próx. venc.
                <input name="next_due_date" type="date" defaultValue={c.next_due_date ?? ''} className={inputClass} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Los módulos (WhatsApp, IA, ocupación, pagos) los habilita el plan elegido.</p>
          </ActionForm>
        </Card>

        <Card title="Equipo del balneario">
          {members.length ? (
            <ul className="flex flex-col gap-3 text-sm">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {m.name} <span className="text-xs font-normal text-muted-foreground">({m.role === 'owner' ? 'dueño' : 'staff'}{m.active ? '' : ', inactivo'})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.email}
                      {m.mustChangePassword && ' · con contraseña temporal'}
                    </p>
                  </div>
                  {!c.is_demo && (
                    <form action={resendAccess.bind(null, c.id, m.userId)}>
                      <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Reenviar acceso</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin usuarios todavía.</Empty>
          )}
        </Card>

        <Card title="Pagos del abono">
          {payments.length ? (
            <Table head={['Período', 'Monto', 'Estado', 'Pagado']}>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td>{p.period}</Td>
                  <Td>{formatMoney(Number(p.amount_cents), p.currency)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td className="text-xs">{p.paid_at ? `${formatDateTime(p.paid_at)} · ${p.method ?? ''}` : '—'}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Sin pagos registrados.</Empty>
          )}
        </Card>

        <Card title="Contacto" className="lg:col-span-2">
          <p className="text-sm">
            {c.email || '—'} · {c.phone || '—'}
          </p>
        </Card>
      </div>
    </>
  )
}
