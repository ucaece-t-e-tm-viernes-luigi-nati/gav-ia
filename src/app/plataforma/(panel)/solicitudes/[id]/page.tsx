import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { Card, PageTitle, StatusBadge } from '@/components/panel/ui'
import { q1 } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { requireSuperadmin } from '@/lib/guards'
import { listActivePlans, type Application } from '@/lib/onboarding'
import { approveApplication, reviewApplication } from '../../actions'

export const metadata: Metadata = { title: 'Solicitud' }

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const app = await q1<Application & { kind: string; reviewer: string | null; reviewed_at: Date | null; created_at: Date }>(
    `SELECT a.*, i.kind, u.email AS reviewer FROM client_application a
       JOIN client_invite i ON i.token = a.invite_token
       LEFT JOIN "user" u ON u.id = a.reviewed_by
      WHERE a.id = $1`,
    [id],
  )
  if (!app) notFound()
  const plans = await listActivePlans()
  const requested = plans.find((p) => p.id === app.requested_plan_id) ?? plans[0]
  const d = app.data ?? {}
  const clientRow = app.status === 'approved' ? await q1<{ client_id: string }>(`SELECT client_id FROM client_application WHERE id = $1`, [id]) : null

  const rows: Array<[string, string]> = [
    ['Responsable', app.contact_name ?? '—'],
    ['Email', `${app.email}${app.email_verified_at ? ' (verificado)' : ' (sin verificar)'}`],
    ['WhatsApp', app.phone ?? '—'],
    ['Nombre del balneario', d.name ?? '—'],
    ['Razón social / CUIT', `${d.legal_name || '—'} / ${d.tax_id || '—'}`],
    ['Dirección y ciudad', `${d.address || '—'}, ${d.city || '—'}`],
    ['Web / Instagram', `${d.website || '—'} / ${d.instagram || '—'}`],
    ['Carpas / sombrillas / cocheras', `${d.carpas ?? 0} / ${d.sombrillas ?? 0} / ${d.cocheras ?? 0}`],
    ['Temporada', d.temporada_inicio ? `${formatDate(d.temporada_inicio)} al ${formatDate(d.temporada_fin)}` : '—'],
    ['Ubicación', d.ubicacion || '—'],
    ['Servicios', d.servicios?.length ? d.servicios.join(', ') : '—'],
    ['Plan pedido', requested?.name ?? app.requested_plan_id ?? '—'],
    ['Día de pago preferido', d.billing_day ? String(d.billing_day) : '—'],
    ['Origen', app.kind === 'personal' ? 'Invitación personal' : 'Link de campaña'],
    ['Enviada', formatDateTime(app.submitted_at)],
  ]

  return (
    <>
      <Link href="/plataforma/solicitudes" className="text-xs font-semibold text-muted-foreground hover:text-primary">
        ← Solicitudes
      </Link>
      <PageTitle title={d.name ?? app.email} description={<StatusBadge status={app.status} />} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card title="Datos enviados">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {app.review_reason && (
            <div className="mt-5 rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">Último motivo enviado</p>
              <p className="whitespace-pre-line">{app.review_reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {app.reviewer} · {formatDateTime(app.reviewed_at)}
              </p>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {app.status === 'pending_review' ? (
            <>
              <Card title="Aprobar" description="Crea el balneario con un plano inicial (según las carpas, sombrillas y cocheras declaradas), el usuario dueño con contraseña temporal y le manda el mail con los datos.">
                <ActionForm action={approveApplication.bind(null, app.id)} submitLabel="Aprobar y enviar acceso" pendingLabel="Aprobando…">
                  <label className={labelClass}>
                    Plan
                    <select name="plan_id" defaultValue={requested?.id} className={inputClass}>
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
                      <input name="price" inputMode="decimal" required defaultValue={requested ? String(Number(requested.price_cents) / 100) : '0'} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Días prueba
                      <input name="trial_days" type="number" min={0} max={365} required defaultValue={requested?.trial_days ?? 15} className={inputClass} />
                    </label>
                    <label className={labelClass}>
                      Día de pago
                      <input name="billing_day" type="number" min={1} max={28} required defaultValue={d.billing_day ?? 10} className={inputClass} />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">El fin de la prueba es la fecha límite del primer pago. Después vence el día elegido de cada mes.</p>
                </ActionForm>
              </Card>
              <Card title="Rechazar" description="El motivo le llega por mail al balneario.">
                <ActionForm action={reviewApplication.bind(null, app.id)} submitLabel="Enviar respuesta" submitClassName="inline-flex w-fit rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">
                  <label className={labelClass}>
                    Motivo
                    <textarea name="reason" required minLength={5} rows={4} className={inputClass} placeholder="Ej.: falta el CUIT o la cantidad de carpas no coincide con la web." />
                  </label>
                  <fieldset className="flex flex-col gap-2 text-sm">
                    <legend className="sr-only">Tipo de rechazo</legend>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="mode" value="changes" defaultChecked className="mt-1" /> Puede corregir (le mandamos un link con sus datos precargados)
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="mode" value="reject" className="mt-1" /> Rechazo definitivo (sin link para reintentar)
                    </label>
                  </fieldset>
                </ActionForm>
              </Card>
            </>
          ) : (
            <Card title="Estado">
              <p className="text-sm text-muted-foreground">
                {app.status === 'draft' && 'El balneario todavía no envió la solicitud.'}
                {app.status === 'changes_requested' && 'Esperando que el balneario corrija y reenvíe.'}
                {app.status === 'rejected' && 'Rechazada de forma definitiva.'}
                {app.status === 'approved' && 'Aprobada.'}
              </p>
              {clientRow?.client_id && (
                <Link href={`/plataforma/empresas/${clientRow.client_id}`} className="mt-3 inline-block text-sm font-semibold text-primary">
                  Ver el balneario →
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
