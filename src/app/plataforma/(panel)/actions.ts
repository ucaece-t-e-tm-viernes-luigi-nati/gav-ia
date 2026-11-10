'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { PoolClient } from 'pg'
import type { FormState } from '@/components/forms'
import { STATUS_LABELS } from '@/components/panel/ui'
import { audit } from '@/lib/audit'
import { addDays, formatDate, formatDateTime, nextDueAfter, todayISO } from '@/lib/dates'
import { q, q1, tx } from '@/lib/db'
import { appUrl, isSuperadminEmail, superadminEmails } from '@/lib/env'
import { requireSuperadmin } from '@/lib/guards'
import { sendMail } from '@/lib/mail'
import { mails } from '@/lib/mail-templates'
import { formatMoney } from '@/lib/money'
import type { Application } from '@/lib/onboarding'
import { MODULE_INFO } from '@/lib/plan'
import { createCredentialUser, findUserByEmail, generateTempPassword, isValidEmail, normalizeEmail, randomToken, setUserPassword, sha256, TEMP_PASSWORD_HOURS } from '@/lib/users'
import { createLayout, starterLayout } from '@/server/db/layouts'
import type { Db } from '@/server/db/types'

// Cada action vuelve a verificar que quien llama es del equipo (requireSuperadmin → 404 si no).

const str = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? '').trim().slice(0, max)
const actor = (u: { id: string }) => ({ id: u.id, role: 'superadmin' })
const MEDIOS_PAGO = 'transferencia bancaria o Mercado Pago (te pasamos los datos por este medio)'
const UUID_RE = /^[0-9a-f-]{36}$/i
const refresh = () => revalidatePath('/plataforma', 'layout')

function parseCents(value: string) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

function slugify(text: string) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'balneario'
  )
}

/** Adaptador PoolClient → Db (la interfaz de src/server/db) para reusar createLayout dentro de la transacción. */
function asDb(client: PoolClient): Db {
  return {
    many: async <T,>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as T[],
    one: async <T,>(text: string, params?: unknown[]) => ((await client.query(text, params)).rows[0] ?? null) as T | null,
    exec: async (text: string, params?: unknown[]) => {
      await client.query(text, params)
    },
  }
}

const OWNER_EMAILS = `(SELECT array_agg(p.email) FROM memberships m JOIN profiles p ON p.id = m.user_id
                        WHERE m.balneario_id = b.id AND m.role = 'owner' AND m.active)`

// ---------------- Solicitudes ----------------

/**
 * Aprobar: crea el balneario (cliente) con su plano inicial armado con las cantidades del alta, el usuario dueño con
 * contraseña temporal y la membresía owner; fija plan, abono, fin de prueba y día de pago. Todo en una transacción.
 */
export async function approveApplication(applicationId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const planId = str(fd, 'plan_id', 40)
  const priceCents = parseCents(str(fd, 'price', 12))
  const trialDays = Number(str(fd, 'trial_days', 3))
  const billingDay = Number(str(fd, 'billing_day', 2))
  if (priceCents === null) return { error: 'Precio inválido.' }
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return { error: 'Días de prueba inválidos.' }
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) return { error: 'El día de pago tiene que ser entre 1 y 28.' }
  if (!UUID_RE.test(planId)) return { error: 'Elegí un plan.' }
  const plan = await q1<{ id: string; name: string; currency: string }>(`SELECT id, name, currency FROM plans WHERE id = $1`, [planId])
  if (!plan) return { error: 'Elegí un plan.' }

  const today = todayISO()
  const trialEnds = trialDays > 0 ? addDays(today, trialDays) : null
  const nextDue = trialEnds ?? today
  let password: string | null = null
  let app: Application | null = null
  let clientName = ''

  try {
    await tx(async (db) => {
      const { rows } = await db.query<Application>(`SELECT * FROM client_application WHERE id = $1 AND status = 'pending_review' FOR UPDATE`, [applicationId])
      app = rows[0] ?? null
      if (!app) throw new Error('not_pending')
      const d = app.data ?? {}
      clientName = d.name ?? app.contact_name ?? 'Balneario'
      if (isSuperadminEmail(app.email)) throw new Error('reserved_email')
      const team = await findUserByEmail(app.email, db)
      if (team && (team.role === 'admin' || team.role === 'superadmin')) throw new Error('reserved_email')

      let slug = slugify(clientName)
      const taken = await db.query(`SELECT slug FROM balnearios WHERE slug = $1 OR slug LIKE $1 || '-%'`, [slug])
      if (taken.rowCount) slug = `${slug}-${taken.rowCount + 1}`

      const created = await db.query<{ id: string }>(
        `INSERT INTO balnearios (name, slug, city, address, phone, email, season_start, season_end, legal_name, tax_id, data,
                                 plan_id, monthly_price_cents, currency, status, trial_ends_at, billing_day, next_due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11::jsonb,$12,$13,$14,$15,$16::date,$17,$18::date) RETURNING id`,
        [
          clientName, slug, d.city ?? '', d.address ?? '', app.phone ?? '', app.email,
          d.temporada_inicio || null, d.temporada_fin || null, d.legal_name ?? '', d.tax_id ?? '',
          JSON.stringify({ ubicacion: d.ubicacion ?? '', servicios: d.servicios ?? [], website: d.website ?? '', instagram: d.instagram ?? '', carpas: d.carpas ?? 0, sombrillas: d.sombrillas ?? 0, cocheras: d.cocheras ?? 0 }),
          plan.id, priceCents, plan.currency, trialEnds ? 'trial' : 'active', trialEnds, billingDay, nextDue,
        ],
      )
      const balnearioId = created.rows[0].id

      // Plano inicial con las cantidades declaradas en el alta (el dueño lo ajusta después en el editor).
      await createLayout(asDb(db), balnearioId, starterLayout(Number(d.carpas ?? 0), Number(d.sombrillas ?? 0), Number(d.cocheras ?? 0)))

      let userId = team?.id
      if (!userId) {
        password = generateTempPassword()
        userId = await createCredentialUser(db, { email: app.email, name: app.contact_name ?? clientName, password, temporary: true, emailVerified: true })
      }
      await db.query(
        `INSERT INTO memberships (user_id, balneario_id, role, can_edit_plano) VALUES ($1::uuid, $2, 'owner', true)
         ON CONFLICT (user_id, balneario_id) DO UPDATE SET role = 'owner', active = true`,
        [userId, balnearioId],
      )
      await db.query(
        `UPDATE client_application SET status = 'approved', reviewed_by = $2, reviewed_at = now(), review_reason = NULL, client_id = $3, updated_at = now() WHERE id = $1`,
        [applicationId, admin.id, balnearioId],
      )
      await db.query(
        `INSERT INTO audit_log (balneario_id, actor_id, action, entity, entity_id, data) VALUES ($1, $2::uuid, 'application.approve', 'client_application', $3, $4::jsonb)`,
        [balnearioId, admin.id, applicationId, JSON.stringify({ actor_role: 'superadmin', plan: plan.id, priceCents, trialDays, billingDay, newUser: !team })],
      )
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'not_pending') return { error: 'La solicitud ya no está pendiente.' }
    if (error instanceof Error && error.message === 'reserved_email') return { error: 'El email de la solicitud pertenece al equipo de GavIA: no se puede usar para un balneario.' }
    throw error
  }

  const a = app as Application | null
  if (a) {
    await sendMail({
      to: a.email,
      ...mails.approved({
        nombre: a.contact_name ?? '',
        empresa: clientName,
        link: `${appUrl()}/empresa/ingresar`,
        email: a.email,
        password,
        venceClave: formatDateTime(new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000)),
        plan: plan.name,
        monto: priceCents > 0 ? formatMoney(priceCents, plan.currency) : null,
        finPrueba: trialEnds ? formatDate(trialEnds) : null,
        diaPago: billingDay,
        mediosPago: MEDIOS_PAGO,
      }),
      secrets: password ? [password] : [],
    })
  }
  redirect(`/plataforma/solicitudes/${applicationId}`)
}

/** Rechazo con motivo: "puede corregir" (changes_requested, mail con link) o "definitivo" (rejected). */
export async function reviewApplication(applicationId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const reason = str(fd, 'reason', 2000)
  const mode = str(fd, 'mode') === 'reject' ? 'rejected' : 'changes_requested'
  if (reason.length < 5) return { error: 'Escribí el motivo (es obligatorio y le llega al balneario).' }

  const app = await q1<Application & { kind: string }>(
    `UPDATE client_application a SET status = $2, review_reason = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now()
       FROM client_invite i
      WHERE a.id = $1 AND a.status = 'pending_review' AND i.token = a.invite_token
      RETURNING a.*, i.kind`,
    [applicationId, mode, reason, admin.id],
  )
  if (!app) return { error: 'La solicitud ya no está pendiente.' }
  const empresa = app.data?.name ?? app.contact_name ?? 'tu balneario'
  if (mode === 'changes_requested') {
    const link = `${appUrl()}/empresa/alta/${app.invite_token}?corregir=1${app.kind === 'campaign' ? `&clave=${app.resume_key}` : ''}`
    await sendMail({ to: app.email, ...mails.changesRequested({ nombre: app.contact_name ?? '', empresa, motivo: reason, link }) })
  } else {
    await sendMail({ to: app.email, ...mails.rejected({ nombre: app.contact_name ?? '', empresa, motivo: reason }) })
  }
  await audit(actor(admin), mode === 'rejected' ? 'application.reject' : 'application.request_changes', { entity: 'client_application', entityId: applicationId, detail: { reason } })
  redirect(`/plataforma/solicitudes/${applicationId}`)
}

// ---------------- Balnearios ----------------

const ALLOWED_STATUS = ['trial', 'active', 'past_due', 'paused', 'cancelled']

export async function setClientStatus(clientId: string, status: string) {
  const admin = await requireSuperadmin()
  if (!UUID_RE.test(clientId) || !ALLOWED_STATUS.includes(status)) return
  const row = await q1<{ name: string; prev: string; emails: string[] | null }>(
    `WITH prev AS (SELECT status FROM balnearios WHERE id = $1)
     UPDATE balnearios b SET status = $2 WHERE b.id = $1
     RETURNING b.name, (SELECT status FROM prev) AS prev, ${OWNER_EMAILS} AS emails`,
    [clientId, status],
  )
  if (!row) return
  await audit(actor(admin), `client.status.${status}`, { clientId, entity: 'balnearios', entityId: clientId, detail: { from: row.prev, to: status } })
  if (row.prev !== status) {
    for (const to of row.emails ?? []) await sendMail({ to, ...mails.statusChanged({ empresa: row.name, estado: STATUS_LABELS[status] ?? status }) })
  }
  refresh()
}

export async function updateClientPlan(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const planId = str(fd, 'plan_id', 40)
  const priceCents = parseCents(str(fd, 'price', 12))
  const billingDay = Number(str(fd, 'billing_day', 2))
  const nextDue = str(fd, 'next_due_date', 10)
  if (priceCents === null) return { error: 'Precio inválido.' }
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) return { error: 'El día de pago tiene que ser entre 1 y 28.' }
  if (nextDue && !/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return { error: 'Fecha de vencimiento inválida.' }
  if (!UUID_RE.test(planId)) return { error: 'Elegí un plan.' }
  const plan = await q1<{ currency: string }>(`SELECT currency FROM plans WHERE id = $1`, [planId])
  if (!plan) return { error: 'Elegí un plan.' }
  await q(
    `UPDATE balnearios SET plan_id = $2, monthly_price_cents = $3, currency = $4, billing_day = $5,
            next_due_date = coalesce($6::date, next_due_date) WHERE id = $1`,
    [clientId, planId, priceCents, plan.currency, billingDay, nextDue || null],
  )
  await audit(actor(admin), 'client.plan_change', { clientId, entity: 'balnearios', entityId: clientId, detail: { planId, priceCents, billingDay, nextDue } })
  refresh()
  return { ok: true, message: 'Plan actualizado.' }
}

/** Pago manual: registra el pago, corre el vencimiento al mes siguiente y reactiva la cuenta si estaba vencida o pausada. */
export async function registerPayment(clientId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const amountCents = parseCents(str(fd, 'amount', 12))
  const method = str(fd, 'method', 40) || 'transferencia'
  const notes = str(fd, 'notes', 300) || null
  if (!amountCents) return { error: 'Indicá el monto pagado.' }

  const c = await q1<{ name: string; currency: string; status: string; billing_day: number | null; next_due_date: string | null; emails: string[] | null }>(
    `SELECT b.name, b.currency, b.status, b.billing_day, to_char(b.next_due_date, 'YYYY-MM-DD') AS next_due_date, ${OWNER_EMAILS} AS emails
       FROM balnearios b WHERE b.id = $1`,
    [clientId],
  )
  if (!c) return { error: 'Balneario inexistente.' }
  const due = c.next_due_date ?? todayISO()
  const period = due.slice(0, 7)
  const nextDue = nextDueAfter(due, c.billing_day ?? Number(due.slice(8, 10)))
  const newStatus = ['trial', 'past_due', 'paused'].includes(c.status) ? 'active' : c.status

  await tx(async (db) => {
    await db.query(
      `INSERT INTO client_payment (client_id, period, amount_cents, currency, status, method, due_date, paid_at, notes, registered_by)
       VALUES ($1, $2, $3, $4, 'paid', $5, $6::date, now(), $7, $8)
       ON CONFLICT (client_id, period) DO UPDATE SET status = 'paid', amount_cents = $3, method = $5, paid_at = now(), notes = $7, registered_by = $8`,
      [clientId, period, amountCents, c.currency, method, due, notes, admin.id],
    )
    await db.query(`UPDATE balnearios SET next_due_date = $2::date, status = $3 WHERE id = $1`, [clientId, nextDue, newStatus])
  })
  await audit(actor(admin), 'payment.register', { clientId, entity: 'client_payment', entityId: period, detail: { amountCents, method, nextDue, from: c.status, to: newStatus } })
  for (const to of c.emails ?? []) {
    await sendMail({ to, ...mails.paymentRegistered({ empresa: c.name, monto: formatMoney(amountCents, c.currency), periodo: period, proximo: formatDate(nextDue) }) })
  }
  refresh()
  return { ok: true, message: `Pago registrado. Próximo vencimiento: ${formatDate(nextDue)}.` }
}

/** Genera una nueva contraseña temporal para un miembro del balneario y se la manda por mail. */
export async function resendAccess(clientId: string, userId: string) {
  const admin = await requireSuperadmin()
  const row = await q1<{ email: string; name: string }>(
    `SELECT p.email, b.name FROM memberships m JOIN profiles p ON p.id = m.user_id JOIN balnearios b ON b.id = m.balneario_id
      WHERE m.balneario_id = $1 AND m.user_id = $2::uuid`,
    [clientId, userId],
  )
  if (!row) return
  const password = generateTempPassword()
  await tx((db) => setUserPassword(db, userId, password, { temporary: true }))
  await sendMail({
    to: row.email,
    ...mails.staffAccess({ empresa: row.name, link: `${appUrl()}/empresa/ingresar`, email: row.email, password, venceClave: formatDateTime(new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000)), nuevo: false }),
    secrets: [password],
  })
  await audit(actor(admin), 'member.reset_access', { clientId, entity: 'user', entityId: userId })
  refresh()
}

// ---------------- Invitaciones ----------------

export async function createInvite(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const kind = str(fd, 'kind') === 'campaign' ? 'campaign' : 'personal'
  const token = randomToken(24)

  if (kind === 'personal') {
    const email = normalizeEmail(fd.get('email'))
    const name = str(fd, 'name', 80) || null
    if (!isValidEmail(email)) return { error: 'Ingresá un correo válido.' }
    await q(`INSERT INTO client_invite (token, kind, email, label, expires_at, created_by) VALUES ($1, 'personal', $2, $3, now() + interval '14 days', $4)`, [token, email, name, admin.id])
    const link = `${appUrl()}/empresa/alta/${token}`
    const send = fd.get('send') === 'on'
    if (send) await sendMail({ to: email, ...mails.invite({ link, expires: formatDate(addDays(todayISO(), 14)), name }) })
    await audit(actor(admin), 'invite.create', { entity: 'client_invite', detail: { kind, email, sent: send } })
    refresh()
    return { ok: true, message: send ? `Invitación enviada a ${email}.` : 'Invitación creada. Copiá el link de la tabla.' }
  }

  const label = str(fd, 'label', 80) || 'Campaña'
  const days = Number(str(fd, 'days', 3) || 30)
  const maxUsesRaw = str(fd, 'max_uses', 5)
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: 'La vigencia tiene que ser entre 1 y 365 días.' }
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return { error: 'El cupo tiene que ser un número positivo.' }
  await q(
    `INSERT INTO client_invite (token, kind, label, max_uses, expires_at, created_by) VALUES ($1, 'campaign', $2, $3, now() + make_interval(days => $4::int), $5)`,
    [token, label, maxUses, days, admin.id],
  )
  await audit(actor(admin), 'invite.create', { entity: 'client_invite', detail: { kind, label, days, maxUses } })
  refresh()
  return { ok: true, message: 'Link de campaña creado. Copialo de la tabla y compartilo por mail o WhatsApp.' }
}

export async function revokeInvite(token: string) {
  const admin = await requireSuperadmin()
  await q(`UPDATE client_invite SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL`, [token])
  await audit(actor(admin), 'invite.revoke', { entity: 'client_invite', detail: { token: `${token.slice(0, 6)}…` } })
  refresh()
}

export async function resendInvite(token: string) {
  const admin = await requireSuperadmin()
  const invite = await q1<{ email: string | null; label: string | null; expires_at: Date }>(
    `SELECT email, label, expires_at FROM client_invite WHERE token = $1 AND kind = 'personal' AND revoked_at IS NULL AND expires_at > now() AND uses = 0`,
    [token],
  )
  if (!invite?.email) return
  await sendMail({ to: invite.email, ...mails.invite({ link: `${appUrl()}/empresa/alta/${token}`, expires: formatDate(invite.expires_at), name: invite.label }) })
  await audit(actor(admin), 'invite.resend', { entity: 'client_invite', detail: { email: invite.email } })
  refresh()
}

// ---------------- Planes ----------------

export async function savePlan(_: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireSuperadmin()
  const id = str(fd, 'id', 40)
  const code = slugify(str(fd, 'code', 40))
  const name = str(fd, 'name', 40)
  const priceCents = parseCents(str(fd, 'price', 12))
  const currency = str(fd, 'currency', 3) === 'ARS' ? 'ARS' : 'USD'
  const trialDays = Number(str(fd, 'trial_days', 3))
  const sort = Number(str(fd, 'sort', 3) || 0)
  const features = str(fd, 'features', 1000)
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
  const modules = fd.getAll('modules').map(String).filter((m) => m in MODULE_INFO)
  if (!code || !name) return { error: 'El plan necesita código y nombre.' }
  if (priceCents === null) return { error: 'Precio inválido.' }
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return { error: 'Días de prueba inválidos.' }
  const params = [name, str(fd, 'description', 200), JSON.stringify(features), priceCents, currency, trialDays, Number.isFinite(sort) ? sort : 0, fd.get('active') === 'on', modules]
  if (id) {
    if (!UUID_RE.test(id)) return { error: 'Plan inválido.' }
    await q(
      `UPDATE plans SET name = $2, description = $3, features = $4::jsonb, price_cents = $5, currency = $6, trial_days = $7, sort_order = $8, active = $9, modules = $10::text[]
        WHERE id = $1`,
      [id, ...params],
    )
  } else {
    const exists = await q1(`SELECT 1 FROM plans WHERE code = $1`, [code])
    if (exists) return { error: 'Ya existe un plan con ese código.' }
    await q(
      `INSERT INTO plans (code, name, description, features, price_cents, currency, trial_days, sort_order, active, modules, billing_period)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::text[], 'mensual')`,
      [code, ...params],
    )
  }
  await audit(actor(admin), 'plan.save', { entity: 'plans', entityId: id || code, detail: { priceCents, currency, trialDays, modules, active: fd.get('active') === 'on' } })
  refresh()
  return { ok: true, message: `Plan "${name}" guardado. Los balnearios existentes mantienen su abono actual.` }
}

// ---------------- Equipo de la plataforma (admins) ----------------
// El superadmin principal (SUPERADMIN_EMAILS) no se puede quitar desde acá: tiene rol 'superadmin'
// y estas acciones solo tocan usuarios con rol 'admin'. Nadie puede quitarse a sí mismo.

const ADMIN_LINK_HOURS = 72

async function sendAdminLink(admin: { email: string; name: string }, invitedBy: string) {
  const email = normalizeEmail(admin.email)
  const identifier = `superadmin-setup:${email}`
  const token = randomToken(24)
  await q(`DELETE FROM verification WHERE identifier = $1`, [identifier])
  await q(
    `INSERT INTO verification (id, identifier, value, "expiresAt") VALUES ($1, $2, $3, now() + make_interval(hours => $4::int))`,
    [randomUUID(), identifier, sha256(token), ADMIN_LINK_HOURS],
  )
  const link = `${appUrl()}/plataforma/ingresar/clave?token=${token}`
  await sendMail({ to: email, ...mails.adminInvite({ name: admin.name, invitedBy, email, link, hours: ADMIN_LINK_HOURS }), secrets: [token] })
}

export async function createAdmin(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireSuperadmin()
  const name = str(fd, 'name', 80)
  const email = normalizeEmail(fd.get('email'))
  if (name.length < 2) return { error: 'Escribí el nombre.' }
  if (!isValidEmail(email)) return { error: 'Revisá el email.' }
  if (isSuperadminEmail(email)) return { error: 'Ese correo ya es el superadmin principal.' }

  const existing = await findUserByEmail(email)
  let userId: string
  if (existing) {
    if (existing.role === 'admin' || existing.role === 'superadmin') return { error: 'Esa persona ya es parte del equipo.' }
    const member = await q1(`SELECT 1 FROM memberships WHERE user_id = $1::uuid`, [existing.id])
    if (member) return { error: 'Ese correo pertenece a un balneario. Usá otro correo para el acceso de administrador.' }
    await q(`UPDATE "user" SET role = 'admin', "updatedAt" = now() WHERE id = $1`, [existing.id])
    userId = existing.id
  } else {
    // Contraseña aleatoria que nadie conoce: la persona define la suya con el link del mail.
    userId = await tx((db) => createCredentialUser(db, { email, name, password: randomToken(24), role: 'admin', emailVerified: false }))
  }
  await audit(actor(me), 'admin.create', { entity: 'user', entityId: userId, detail: { email, name } })
  try {
    await sendAdminLink({ email, name: existing?.name || name }, me.name || me.email)
  } catch {
    refresh()
    return { ok: true, message: 'Admin creado, pero el mail no salió. Probá "Reenviar link" en la lista.' }
  }
  refresh()
  return { ok: true, message: `Listo: le mandamos a ${email} el link para definir su contraseña.` }
}

export async function resendAdminLink(userId: string) {
  const me = await requireSuperadmin()
  const target = await q1<{ email: string; name: string; role: string }>(`SELECT email, name, role FROM "user" WHERE id = $1`, [userId])
  if (!target || target.role !== 'admin') return
  await sendAdminLink(target, me.name || me.email)
  await audit(actor(me), 'admin.resend_link', { entity: 'user', entityId: userId })
  refresh()
}

export async function removeAdmin(userId: string) {
  const me = await requireSuperadmin()
  if (userId === me.id) return
  const target = await q1<{ email: string; role: string }>(`SELECT email, role FROM "user" WHERE id = $1`, [userId])
  // Solo se quitan admins del equipo: el superadmin principal (rol 'superadmin', en SUPERADMIN_EMAILS) es intocable.
  if (!target || target.role !== 'admin' || superadminEmails().includes(target.email.toLowerCase())) return
  await tx(async (db) => {
    await db.query(`UPDATE "user" SET role = 'member', "updatedAt" = now() WHERE id = $1`, [userId])
    await db.query(`DELETE FROM session WHERE "userId" = $1`, [userId])
    await db.query(`DELETE FROM verification WHERE identifier = $1`, [`superadmin-setup:${target.email.toLowerCase()}`])
  })
  await audit(actor(me), 'admin.remove', { entity: 'user', entityId: userId, detail: { email: target.email } })
  refresh()
}
