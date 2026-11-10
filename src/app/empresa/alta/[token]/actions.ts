'use server'

import { randomInt, randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { FormState } from '@/components/forms'
import { audit } from '@/lib/audit'
import { isISODate, formatDate, formatDateTime } from '@/lib/dates'
import { q, q1 } from '@/lib/db'
import { appUrl, notifyEmails } from '@/lib/env'
import { sendMail } from '@/lib/mail'
import { mails } from '@/lib/mail-templates'
import { EDITABLE, RESUME_COOKIE, resolveOnboarding, SERVICIOS, type ApplicationData } from '@/lib/onboarding'
import { isValidEmail, normalizeEmail, randomToken, sha256 } from '@/lib/users'

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? '').trim().slice(0, max)
const UUID_RE = /^[0-9a-f-]{36}$/i

function base(token: string, key: string | null) {
  return `/empresa/alta/${token}${key ? `?clave=${encodeURIComponent(key)}` : ''}`
}
function goTo(token: string, key: string | null, paso: number | 'fin'): never {
  const url = base(token, key)
  return redirect(`${url}${url.includes('?') ? '&' : '?'}paso=${paso}`)
}

/** Re-valida el link y la solicitud en cada action (no se confía en nada del cliente). */
async function load(token: string, key: string | null) {
  const resolved = await resolveOnboarding(token, key)
  if (!resolved) notFound()
  const { invite, application } = resolved
  if (application && !(EDITABLE as readonly string[]).includes(application.status)) {
    return { invite, application, locked: true as const }
  }
  return { invite, application, locked: false as const }
}

async function sendCode(applicationId: string, email: string) {
  const code = String(randomInt(100000, 1000000))
  await q(`DELETE FROM verification WHERE identifier = $1`, [`alta:${applicationId}`])
  await q(`INSERT INTO verification (id, identifier, value, "expiresAt") VALUES ($1, $2, $3, now() + interval '30 minutes')`, [randomUUID(), `alta:${applicationId}`, sha256(code)])
  await sendMail({ to: email, ...mails.emailCode({ code }), secrets: [code] })
}

/** Paso 1: cuenta (responsable, email, WhatsApp). Crea la solicitud si todavía no existe. */
export async function saveAccount(token: string, key: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const { invite, application, locked } = await load(token, key)
  if (locked) return { error: 'Esta solicitud ya fue enviada.' }

  const contactName = str(fd, 'contact_name', 80)
  const phone = str(fd, 'phone', 40)
  const email = invite.kind === 'personal' && invite.email ? normalizeEmail(invite.email) : normalizeEmail(fd.get('email'))
  if (contactName.length < 2) return { error: 'Decinos tu nombre y apellido.' }
  if (!isValidEmail(email)) return { error: 'Ingresá un correo válido.' }
  if (phone.replace(/\D/g, '').length < 8) return { error: 'Ingresá un WhatsApp válido (con característica).' }

  // En la invitación personal el link llegó a ese mail: el correo queda verificado.
  const verifiedByInvite = invite.kind === 'personal'
  let appId = application?.id
  let resumeKey = application?.resume_key ?? null
  let needsCode = false

  if (!application) {
    resumeKey = randomToken(18)
    const row = await q1<{ id: string }>(
      `INSERT INTO client_application (invite_token, resume_key, email, contact_name, phone, email_verified_at, step)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END, 1) RETURNING id`,
      [token, resumeKey, email, contactName, phone, verifiedByInvite],
    )
    appId = row!.id
    needsCode = !verifiedByInvite
    ;(await cookies()).set(RESUME_COOKIE, `${token}:${resumeKey}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/empresa/alta', maxAge: 60 * 60 * 24 * 30 })
  } else {
    const emailChanged = normalizeEmail(application.email) !== email
    await q(
      `UPDATE client_application SET email = $2, contact_name = $3, phone = $4,
              email_verified_at = CASE WHEN $5 THEN NULL ELSE email_verified_at END, updated_at = now()
        WHERE id = $1`,
      [application.id, email, contactName, phone, emailChanged && !verifiedByInvite],
    )
    needsCode = !verifiedByInvite && (emailChanged || !application.email_verified_at)
  }

  const linkKey = invite.kind === 'campaign' ? resumeKey : null
  if (needsCode) {
    await sendCode(appId!, email)
    goTo(token, linkKey, 1)
  }
  await q(`UPDATE client_application SET step = GREATEST(step, 2) WHERE id = $1`, [appId])
  goTo(token, linkKey, 2)
}

export async function verifyEmail(token: string, key: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const { application, locked } = await load(token, key)
  if (!application || locked) notFound()
  const code = str(fd, 'code', 6).replace(/\D/g, '')
  const row = await q1(`SELECT 1 FROM verification WHERE identifier = $1 AND value = $2 AND "expiresAt" > now()`, [`alta:${application.id}`, sha256(code)])
  if (!row) return { error: 'El código no es correcto o venció. Pedí uno nuevo.' }
  await q(`DELETE FROM verification WHERE identifier = $1`, [`alta:${application.id}`])
  await q(`UPDATE client_application SET email_verified_at = now(), step = GREATEST(step, 2), updated_at = now() WHERE id = $1`, [application.id])
  goTo(token, key, 2)
}

export async function resendCode(token: string, key: string | null) {
  const { application, locked } = await load(token, key)
  if (!application || locked || application.email_verified_at) notFound()
  await sendCode(application.id, application.email)
  goTo(token, key, 1)
}

function intField(fd: FormData, key: string, max: number) {
  const raw = str(fd, key, 6)
  if (!raw) return 0
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null
}

function validateStep(step: number, fd: FormData, current: ApplicationData): { error: string } | { data: ApplicationData; planId?: string } {
  if (step === 2) {
    const name = str(fd, 'name', 80)
    const taxId = str(fd, 'tax_id', 20).replace(/\D/g, '')
    const address = str(fd, 'address', 120)
    const city = str(fd, 'city', 60)
    if (name.length < 2) return { error: 'Poné el nombre comercial del balneario.' }
    if (taxId && taxId.length !== 11) return { error: 'El CUIT tiene que tener 11 números (o dejalo vacío).' }
    if (address.length < 4) return { error: 'Indicá la dirección del balneario.' }
    if (city.length < 2) return { error: 'Indicá la localidad.' }
    return {
      data: { ...current, name, legal_name: str(fd, 'legal_name', 120), tax_id: taxId, address, city, website: str(fd, 'website', 200), instagram: str(fd, 'instagram', 60) },
    }
  }
  if (step === 3) {
    // Paso propio de GavIA: cantidad de carpas y sombrillas, temporada, ubicación y servicios.
    const carpas = intField(fd, 'carpas', 2000)
    const sombrillas = intField(fd, 'sombrillas', 2000)
    const cocheras = intField(fd, 'cocheras', 2000)
    const inicio = str(fd, 'temporada_inicio', 10)
    const fin = str(fd, 'temporada_fin', 10)
    const ubicacion = str(fd, 'ubicacion', 160)
    const servicios = fd.getAll('servicios').map(String).filter((s) => (SERVICIOS as readonly string[]).includes(s)).slice(0, SERVICIOS.length)
    if (carpas === null || sombrillas === null || cocheras === null) return { error: 'Las cantidades tienen que ser números enteros (0 a 2000).' }
    if (carpas + sombrillas < 1) return { error: 'Indicá cuántas carpas y/o sombrillas tiene el balneario.' }
    if (!isISODate(inicio) || !isISODate(fin)) return { error: 'Indicá el inicio y el fin de la temporada.' }
    if (fin <= inicio) return { error: 'El fin de la temporada tiene que ser posterior al inicio.' }
    if (ubicacion.length < 3) return { error: 'Contanos dónde está el balneario (zona, frente al mar, referencias).' }
    return { data: { ...current, carpas, sombrillas, cocheras, temporada_inicio: inicio, temporada_fin: fin, ubicacion, servicios } }
  }
  if (step === 4) {
    const planId = str(fd, 'plan_id', 40)
    const billingDay = Number(str(fd, 'billing_day', 2))
    if (!UUID_RE.test(planId)) return { error: 'Elegí un plan.' }
    if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) return { error: 'El día de pago tiene que ser entre 1 y 28.' }
    return { data: { ...current, billing_day: billingDay }, planId }
  }
  return { error: 'Paso inválido.' }
}

/** Pasos 2 a 4: guarda el borrador y avanza. */
export async function saveStep(token: string, key: string | null, step: number, _: FormState, fd: FormData): Promise<FormState> {
  const { application, locked } = await load(token, key)
  if (!application) notFound()
  if (locked) return { error: 'Esta solicitud ya fue enviada.' }
  if (!application.email_verified_at) goTo(token, key, 1)
  if (step > application.step) return { error: 'Completá los pasos anteriores primero.' }

  const result = validateStep(step, fd, application.data ?? {})
  if ('error' in result) return { error: result.error }
  if (result.planId) {
    const plan = await q1(`SELECT 1 FROM plans WHERE id = $1 AND active`, [result.planId])
    if (!plan) return { error: 'Elegí un plan válido.' }
  }
  await q(
    `UPDATE client_application SET data = $2::jsonb, requested_plan_id = coalesce($3::uuid, requested_plan_id),
            step = GREATEST(step, $4), updated_at = now() WHERE id = $1`,
    [application.id, JSON.stringify(result.data), result.planId ?? null, step + 1],
  )
  goTo(token, key, step + 1)
}

/** Paso 5: envío. Pasa a pending_review y manda los dos mails (superadmin + balneario). */
export async function submitApplication(token: string, key: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const { invite, application, locked } = await load(token, key)
  if (!application) notFound()
  if (locked) return { error: 'Esta solicitud ya fue enviada.' }
  if (fd.get('terms') !== 'on') return { error: 'Para enviar tenés que aceptar los términos y la política de datos.' }

  const d = application.data ?? {}
  if (!application.email_verified_at || !application.contact_name) return { error: 'Falta completar el paso 1.' }
  if (!d.name || !d.address || !d.city) return { error: 'Falta completar el paso 2.' }
  if (d.carpas === undefined || !d.temporada_inicio || !d.temporada_fin || !d.ubicacion) return { error: 'Falta completar el paso 3.' }
  if (!application.requested_plan_id || !d.billing_day) return { error: 'Falta completar el paso 4.' }

  const firstSubmit = application.status === 'draft'
  const updated = await q(
    `UPDATE client_application SET status = 'pending_review', submitted_at = now(), terms_accepted_at = now(), step = 5, updated_at = now()
      WHERE id = $1 AND status IN ('draft','changes_requested') RETURNING id`,
    [application.id],
  )
  if (!updated.length) return { error: 'Esta solicitud ya fue enviada.' }
  if (firstSubmit) await q(`UPDATE client_invite SET uses = uses + 1 WHERE token = $1`, [invite.token])

  const plan = await q1<{ name: string }>(`SELECT name FROM plans WHERE id = $1`, [application.requested_plan_id])
  const fecha = formatDateTime(new Date())
  const adminMail = mails.adminNewApplication({
    empresa: d.name,
    ciudad: d.city ?? '—',
    nombre: application.contact_name,
    email: application.email,
    whatsapp: application.phone ?? '—',
    plan: plan?.name ?? '—',
    fecha: firstSubmit ? fecha : `${fecha} (corregida)`,
    link: `${appUrl()}/plataforma/solicitudes/${application.id}`,
  })
  for (const to of notifyEmails()) await sendMail({ to, ...adminMail })

  await sendMail({
    to: application.email,
    ...mails.applicationReceived({
      nombre: application.contact_name,
      empresa: d.name,
      plazo: 2,
      resumen: [
        ['Balneario', d.name],
        ['Ubicación', `${d.address}, ${d.city} · ${d.ubicacion}`],
        ['Carpas / sombrillas / cocheras', `${d.carpas ?? 0} / ${d.sombrillas ?? 0} / ${d.cocheras ?? 0}`],
        ['Temporada', `${formatDate(d.temporada_inicio)} al ${formatDate(d.temporada_fin)}`],
        ['Servicios', d.servicios?.length ? d.servicios.join(', ') : '—'],
        ['Plan', plan?.name ?? '—'],
        ['Día de pago preferido', String(d.billing_day)],
      ],
    }),
  })
  await audit(null, firstSubmit ? 'application.submit' : 'application.resubmit', { actorRole: 'applicant', entity: 'client_application', entityId: application.id })
  goTo(token, key, 'fin')
}
