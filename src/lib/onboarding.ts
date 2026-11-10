import 'server-only'
import { q, q1 } from './db'

// Alta de balnearios por link: invitación personal (un solo uso, 14 días) o link de campaña (reutilizable).

export type Invite = {
  token: string
  kind: 'personal' | 'campaign'
  email: string | null
  label: string | null
  max_uses: number | null
  uses: number
  expires_at: Date
  revoked_at: Date | null
}

export type ApplicationData = {
  // Paso 2: datos de la empresa
  name?: string
  legal_name?: string
  tax_id?: string
  address?: string
  city?: string
  website?: string
  instagram?: string
  // Paso 3: características del balneario (propio de GavIA)
  carpas?: number
  sombrillas?: number
  cocheras?: number
  temporada_inicio?: string
  temporada_fin?: string
  ubicacion?: string
  servicios?: string[]
  // Paso 4: plan
  billing_day?: number
}

export type Application = {
  id: string
  invite_token: string
  resume_key: string
  email: string
  contact_name: string | null
  phone: string | null
  email_verified_at: Date | null
  step: number
  data: ApplicationData
  requested_plan_id: string | null
  status: 'draft' | 'pending_review' | 'changes_requested' | 'approved' | 'rejected'
  review_reason: string | null
  submitted_at: Date | null
  client_id: string | null
}

/** Servicios que puede ofrecer un balneario (paso 3 del alta). */
export const SERVICIOS = [
  'Parador / bar',
  'Restaurante',
  'Duchas y vestuarios',
  'Guardavidas',
  'Estacionamiento',
  'Pileta',
  'Kids club',
  'Wifi',
  'Clases y actividades',
  'Alquiler de reposeras',
] as const

export const RESUME_COOKIE = 'gavia_alta'
export const EDITABLE = ['draft', 'changes_requested'] as const
export const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/
export const KEY_RE = /^[A-Za-z0-9_-]{20,80}$/

export function isInviteUsable(invite: Invite) {
  if (invite.revoked_at) return false
  if (new Date(invite.expires_at) < new Date()) return false
  if (invite.kind === 'campaign' && invite.max_uses !== null && invite.uses >= invite.max_uses) return false
  if (invite.kind === 'personal' && invite.uses > 0) return false
  return true
}

/**
 * Resuelve invitación + solicitud. Devuelve null si el link no sirve (→ 404).
 * - Personal: la solicitud se busca por el token (el link es el secreto, llegó por mail).
 * - Campaña: la solicitud se busca por token + clave de retomar (en la URL o en una cookie).
 * - Con una solicitud existente se puede seguir/corregir aunque el link ya haya vencido.
 */
export async function resolveOnboarding(token: string, resumeKey: string | null) {
  if (!TOKEN_RE.test(token)) return null
  const invite = await q1<Invite>(`SELECT token, kind, email, label, max_uses, uses, expires_at, revoked_at FROM client_invite WHERE token = $1`, [token])
  if (!invite) return null

  let application: Application | null = null
  if (invite.kind === 'personal') {
    application = await q1<Application>(`SELECT * FROM client_application WHERE invite_token = $1 ORDER BY created_at DESC LIMIT 1`, [token])
  } else if (resumeKey && KEY_RE.test(resumeKey)) {
    application = await q1<Application>(`SELECT * FROM client_application WHERE invite_token = $1 AND resume_key = $2`, [token, resumeKey])
  }

  const usable = isInviteUsable(invite)
  if (!application && !usable) return null
  // Un borrador sin enviar sigue la suerte del link: si venció o se revocó → 404.
  if (application?.status === 'draft' && (invite.revoked_at || new Date(invite.expires_at) < new Date())) return null
  return { invite, application }
}

export type PlanOption = {
  id: string
  code: string
  name: string
  description: string
  price_cents: string
  currency: string
  trial_days: number
  features: string[]
}

export function listActivePlans() {
  return q<PlanOption>(
    `SELECT id, code, name, description, price_cents::text, currency, trial_days, features FROM plans WHERE active ORDER BY sort_order, price_cents`,
  )
}
