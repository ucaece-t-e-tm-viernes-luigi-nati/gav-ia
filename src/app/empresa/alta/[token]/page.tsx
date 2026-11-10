import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { BrandLink } from '@/components/brand/logo'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { listActivePlans, RESUME_COOKIE, resolveOnboarding, SERVICIOS, type Application } from '@/lib/onboarding'
import { resendCode, saveAccount, saveStep, submitApplication, verifyEmail } from './actions'

export const metadata: Metadata = { title: 'Alta de tu balneario' }

const STEPS = ['Cuenta', 'Tu empresa', 'Tu balneario', 'Plan', 'Revisión']

/** Temporada sugerida: 15/11 al 30/04 (la próxima, si ya pasó abril). */
function defaultSeason() {
  const now = new Date()
  const y = now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1
  return { inicio: `${y}-11-15`, fin: `${y + 1}-04-30` }
}

export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params
  const sp = await searchParams
  const claveParam = typeof sp.clave === 'string' ? sp.clave : null
  const cookie = (await cookies()).get(RESUME_COOKIE)?.value ?? ''
  const cookieKey = cookie.startsWith(`${token}:`) ? cookie.slice(token.length + 1) : null
  const key = claveParam ?? cookieKey

  const resolved = await resolveOnboarding(token, key)
  if (!resolved) notFound()
  const { invite, application } = resolved
  const linkKey = invite.kind === 'campaign' ? (application?.resume_key ?? null) : null

  const maxStep = application ? Math.min(application.step, 5) : 1
  const requested = Number(typeof sp.paso === 'string' ? sp.paso : maxStep)
  const step = Number.isInteger(requested) && requested >= 1 && requested <= maxStep ? requested : maxStep
  const editable = !application || application.status === 'draft' || application.status === 'changes_requested'
  const stepHref = (n: number) => `/empresa/alta/${token}?${linkKey ? `clave=${encodeURIComponent(linkKey)}&` : ''}paso=${n}`

  return (
    <main className="mx-auto max-w-[760px] px-5 py-10">
      <BrandLink href={`/empresa/alta/${token}`} suffix="alta de balnearios" />
      <h1 className="mt-6 text-3xl font-semibold text-navy">Sumá tu balneario a GavIA</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Completá el alta en 5 pasos. Se guarda en cada paso: podés seguir después desde este mismo link.
      </p>

      {!editable && application ? (
        <StatusView application={application} />
      ) : (
        <>
          {application?.status === 'changes_requested' && application.review_reason && (
            <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Necesitamos que corrijas lo siguiente:</p>
                <p className="mt-1 whitespace-pre-line">{application.review_reason}</p>
                <p className="mt-2 text-xs">Revisá los pasos, corregí y volvé a enviar desde &quot;Revisión&quot;.</p>
              </div>
            </div>
          )}
          <ol className="mt-6 flex flex-wrap gap-2" aria-label="Pasos del alta">
            {STEPS.map((label, i) => {
              const n = i + 1
              const reachable = n <= maxStep
              const current = n === step
              const cls = `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${current ? 'bg-navy text-white' : reachable ? 'border border-border bg-card text-foreground' : 'border border-border text-muted-foreground'}`
              return (
                <li key={label}>
                  {reachable && !current ? (
                    <Link href={stepHref(n)} className={cls}>
                      {n}. {label}
                    </Link>
                  ) : (
                    <span className={cls} aria-current={current ? 'step' : undefined}>
                      {n}. {label}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          <section className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-7">
            {step === 1 && <StepAccount token={token} linkKey={linkKey} application={application} lockedEmail={invite.kind === 'personal' ? invite.email : null} />}
            {step === 2 && application && <StepBusiness token={token} linkKey={linkKey} application={application} />}
            {step === 3 && application && <StepFeatures token={token} linkKey={linkKey} application={application} />}
            {step === 4 && application && <StepPlan token={token} linkKey={linkKey} application={application} />}
            {step === 5 && application && <StepReview token={token} linkKey={linkKey} application={application} />}
          </section>
        </>
      )}
    </main>
  )
}

type StepProps = { token: string; linkKey: string | null; application: Application }

function StepAccount({ token, linkKey, application, lockedEmail }: { token: string; linkKey: string | null; application: Application | null; lockedEmail: string | null }) {
  const awaitingCode = application && !application.email_verified_at
  return (
    <>
      <h2 className="text-lg font-bold">1. Tu cuenta</h2>
      <p className="mb-4 text-xs text-muted-foreground">La persona responsable del balneario. A este correo te llegan los avisos y tu usuario.</p>
      <ActionForm action={saveAccount.bind(null, token, linkKey)} submitLabel={awaitingCode ? 'Guardar y reenviar código' : 'Guardar y seguir'}>
        <label className={labelClass}>
          Nombre y apellido
          <input name="contact_name" required maxLength={80} defaultValue={application?.contact_name ?? ''} autoComplete="name" className={inputClass} />
        </label>
        <label className={labelClass}>
          Correo electrónico
          <input name="email" type="email" required defaultValue={lockedEmail ?? application?.email ?? ''} readOnly={!!lockedEmail} autoComplete="email" className={inputClass} />
          {lockedEmail && <span className="text-xs font-normal text-muted-foreground">Es el correo al que te enviamos la invitación.</span>}
        </label>
        <label className={labelClass}>
          WhatsApp
          <input name="phone" required maxLength={40} defaultValue={application?.phone ?? ''} placeholder="2254 555-1234" autoComplete="tel" className={inputClass} />
        </label>
      </ActionForm>
      {awaitingCode && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-semibold">Verificá tu correo</h3>
          <p className="mb-3 text-xs text-muted-foreground">Te enviamos un código de 6 números a {application.email}. Vence en 30 minutos.</p>
          <ActionForm action={verifyEmail.bind(null, token, linkKey)} submitLabel="Verificar" className="flex flex-wrap items-end gap-3">
            <label className={labelClass}>
              Código
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required className={`${inputClass} w-36 tracking-[0.3em]`} />
            </label>
          </ActionForm>
          <form action={resendCode.bind(null, token, linkKey)} className="mt-3">
            <button className="text-xs font-semibold text-primary underline">Reenviar código</button>
          </form>
        </div>
      )}
    </>
  )
}

function StepBusiness({ token, linkKey, application }: StepProps) {
  const d = application.data ?? {}
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">2. Datos de la empresa</h2>
      <ActionForm action={saveStep.bind(null, token, linkKey, 2)} submitLabel="Guardar y seguir">
        <label className={labelClass}>
          Nombre comercial del balneario
          <input name="name" required maxLength={80} defaultValue={d.name ?? ''} className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Razón social (opcional)
            <input name="legal_name" maxLength={120} defaultValue={d.legal_name ?? ''} className={inputClass} />
          </label>
          <label className={labelClass}>
            CUIT (opcional)
            <input name="tax_id" inputMode="numeric" maxLength={13} defaultValue={d.tax_id ?? ''} placeholder="30712345679" className={inputClass} />
          </label>
          <label className={labelClass}>
            Dirección
            <input name="address" required maxLength={120} defaultValue={d.address ?? ''} placeholder="Av. Costanera 1234" className={inputClass} />
          </label>
          <label className={labelClass}>
            Localidad
            <input name="city" required maxLength={60} defaultValue={d.city ?? ''} placeholder="Pinamar" className={inputClass} />
          </label>
          <label className={labelClass}>
            Web (opcional)
            <input name="website" maxLength={200} defaultValue={d.website ?? ''} className={inputClass} />
          </label>
          <label className={labelClass}>
            Instagram (opcional)
            <input name="instagram" maxLength={60} defaultValue={d.instagram ?? ''} placeholder="@tubalneario" className={inputClass} />
          </label>
        </div>
      </ActionForm>
    </>
  )
}

function StepFeatures({ token, linkKey, application }: StepProps) {
  const d = application.data ?? {}
  const season = defaultSeason()
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">3. Tu balneario</h2>
      <p className="mb-4 text-xs text-muted-foreground">Con esto armamos tu plano inicial (después lo ajustás en el editor) y configuramos la temporada.</p>
      <ActionForm action={saveStep.bind(null, token, linkKey, 3)} submitLabel="Guardar y seguir">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            Carpas
            <input name="carpas" type="number" min={0} max={2000} required defaultValue={d.carpas ?? ''} className={inputClass} />
          </label>
          <label className={labelClass}>
            Sombrillas
            <input name="sombrillas" type="number" min={0} max={2000} required defaultValue={d.sombrillas ?? ''} className={inputClass} />
          </label>
          <label className={labelClass}>
            Cocheras (opcional)
            <input name="cocheras" type="number" min={0} max={2000} defaultValue={d.cocheras ?? ''} className={inputClass} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Inicio de temporada
            <input name="temporada_inicio" type="date" required defaultValue={d.temporada_inicio ?? season.inicio} className={inputClass} />
          </label>
          <label className={labelClass}>
            Fin de temporada
            <input name="temporada_fin" type="date" required defaultValue={d.temporada_fin ?? season.fin} className={inputClass} />
          </label>
        </div>
        <label className={labelClass}>
          Ubicación
          <input name="ubicacion" required maxLength={160} defaultValue={d.ubicacion ?? ''} placeholder="Zona norte, frente al mar, a 200 m del centro" className={inputClass} />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Servicios</legend>
          <div className="flex flex-wrap gap-2">
            {SERVICIOS.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="checkbox" name="servicios" value={s} defaultChecked={d.servicios?.includes(s)} className="sr-only" /> {s}
              </label>
            ))}
          </div>
        </fieldset>
      </ActionForm>
    </>
  )
}

async function StepPlan({ token, linkKey, application }: StepProps) {
  const plans = await listActivePlans()
  const d = application.data ?? {}
  const preferred = application.requested_plan_id ?? plans.find((p) => p.code === 'pro')?.id ?? plans[0]?.id
  return (
    <>
      <h2 className="mb-4 text-lg font-bold">4. Plan</h2>
      <ActionForm action={saveStep.bind(null, token, linkKey, 4)} submitLabel="Guardar y seguir">
        <fieldset>
          <legend className="sr-only">Elegí un plan</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <label key={p.id} className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-accent/60">
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="plan_id" value={p.id} required defaultChecked={preferred === p.id} /> {p.name}
                </span>
                <span className="text-lg font-bold">{formatMoney(Number(p.price_cents), p.currency)} / mes</span>
                <span className="text-xs text-muted-foreground">{p.description}</span>
                <span className="text-xs text-muted-foreground">{p.trial_days} días de prueba gratis</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className={`${labelClass} max-w-xs`}>
          Día del mes que preferís para pagar (1 a 28)
          <input name="billing_day" type="number" min={1} max={28} required defaultValue={d.billing_day ?? 10} className={inputClass} />
        </label>
      </ActionForm>
    </>
  )
}

async function StepReview({ token, linkKey, application }: StepProps) {
  const d = application.data ?? {}
  const plans = await listActivePlans()
  const plan = plans.find((p) => p.id === application.requested_plan_id)
  const rows: Array<[string, string]> = [
    ['Responsable', `${application.contact_name ?? '—'} · ${application.email} · ${application.phone ?? '—'}`],
    ['Balneario', `${d.name ?? '—'}${d.legal_name ? ` (${d.legal_name})` : ''}`],
    ['CUIT', d.tax_id || '—'],
    ['Dirección', `${d.address ?? '—'}, ${d.city ?? '—'}`],
    ['Web / Instagram', `${d.website || '—'} / ${d.instagram || '—'}`],
    ['Carpas / sombrillas / cocheras', `${d.carpas ?? 0} / ${d.sombrillas ?? 0} / ${d.cocheras ?? 0}`],
    ['Temporada', d.temporada_inicio ? `${formatDate(d.temporada_inicio)} al ${formatDate(d.temporada_fin)}` : '—'],
    ['Ubicación', d.ubicacion ?? '—'],
    ['Servicios', d.servicios?.length ? d.servicios.join(', ') : '—'],
    ['Plan', plan ? `${plan.name} · ${formatMoney(Number(plan.price_cents), plan.currency)} / mes · ${plan.trial_days} días de prueba` : '—'],
    ['Día de pago preferido', d.billing_day ? String(d.billing_day) : '—'],
  ]
  return (
    <>
      <h2 className="mb-4 text-lg font-bold">5. Revisión y envío</h2>
      <dl className="mb-5 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[200px_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <ActionForm action={submitApplication.bind(null, token, linkKey)} submitLabel={application.status === 'changes_requested' ? 'Reenviar solicitud' : 'Enviar solicitud'} pendingLabel="Enviando…">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>
            Acepto los términos del servicio y la política de datos de GavIA: usamos estos datos solo para gestionar tu cuenta y configurar el sistema de tu balneario. Lo que facturás y tus gastos son confidenciales.
          </span>
        </label>
      </ActionForm>
    </>
  )
}

function StatusView({ application }: { application: Application }) {
  const messages: Record<string, { title: string; text: string }> = {
    pending_review: {
      title: '¡Recibimos tu solicitud!',
      text: 'La estamos revisando. Te respondemos por mail en un plazo de 2 días hábiles.',
    },
    approved: {
      title: 'Tu solicitud fue aprobada',
      text: 'Te enviamos por mail tu usuario y una contraseña temporal para ingresar al panel de tu balneario.',
    },
    rejected: {
      title: 'Tu solicitud no fue aprobada',
      text: 'Te enviamos el motivo por mail. Gracias por el tiempo que le dedicaste.',
    },
  }
  const m = messages[application.status] ?? messages.pending_review
  return (
    <div role="status" className="mt-8 rounded-2xl border border-border bg-card p-7 text-center">
      <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
      <h2 className="mt-3 text-xl font-bold">{m.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{m.text}</p>
    </div>
  )
}
