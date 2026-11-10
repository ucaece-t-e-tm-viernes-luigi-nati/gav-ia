import 'server-only'

function list(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

/** Emails habilitados como superadmin principal (env SUPERADMIN_EMAILS, separados por coma). Nunca hardcodeados. */
export function superadminEmails() {
  return list(process.env.SUPERADMIN_EMAILS)
}

export function isSuperadminEmail(email: string | null | undefined) {
  return !!email && superadminEmails().includes(email.trim().toLowerCase())
}

/** Destinatarios de avisos de nuevas solicitudes. Si no se configura, se usa SUPERADMIN_EMAILS. */
export function notifyEmails() {
  const explicit = list(process.env.SUPERADMIN_NOTIFY_EMAILS)
  return explicit.length ? explicit : superadminEmails()
}

/** URL pública de la app, para armar links en los mails. */
export function appUrl() {
  const explicit = process.env.APP_URL ?? process.env.BETTER_AUTH_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  return host ? `https://${host}` : 'http://localhost:3000'
}

/** Días de gracia entre el vencimiento y la pausa por falta de pago. */
export function pauseAfterDays() {
  const n = Number(process.env.PAUSE_AFTER_DAYS ?? 7)
  return Number.isFinite(n) && n >= 0 ? n : 7
}

export const hasDatabase = () => !!process.env.DATABASE_URL
