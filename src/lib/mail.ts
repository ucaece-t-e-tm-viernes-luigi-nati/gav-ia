import 'server-only'
import nodemailer from 'nodemailer'
import { q1 } from './db'

export type MailInput = {
  to: string
  subject: string
  html: string
  text: string
  /** Nombre de la plantilla, para el listado de /plataforma/mails. */
  template?: string
  /** Valores sensibles (contraseñas, códigos) que se enmascaran en lo que se guarda en email_outbox. */
  secrets?: string[]
}

function mask(value: string, secrets: string[] = []) {
  return secrets.filter(Boolean).reduce((acc, secret) => acc.split(secret).join('••••••••'), value)
}

let transporter: nodemailer.Transporter | null = null
function smtp() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

/**
 * Envía un mail y SIEMPRE lo registra en email_outbox (con secretos enmascarados).
 * MAIL_PROVIDER=smtp → nodemailer (Gmail / Google Workspace con contraseña de aplicación).
 * Cualquier otro valor → solo outbox (útil para demos sin SMTP).
 * Nunca lanza: si el envío falla queda status=failed con el error.
 */
export async function sendMail(input: MailInput) {
  const provider = process.env.MAIL_PROVIDER === 'smtp' && process.env.SMTP_USER && process.env.SMTP_PASS ? 'smtp' : 'outbox'
  const row = await q1<{ id: string }>(
    `INSERT INTO email_outbox (to_email, subject, body_html, body_text, template, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.to, input.subject, mask(input.html, input.secrets), mask(input.text, input.secrets), input.template ?? null, provider === 'smtp' ? 'queued' : 'outbox_only'],
  )
  if (provider !== 'smtp' || !row) return { ok: provider !== 'smtp', id: row?.id }

  try {
    await smtp().sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
    await q1(`UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id])
    return { ok: true, id: row.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await q1(`UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1`, [row.id, mask(message, input.secrets).slice(0, 500)])
    console.error('[mail] Falló el envío', { to: input.to, template: input.template, error: message })
    return { ok: false, id: row.id }
  }
}

export function mailProviderLabel() {
  return process.env.MAIL_PROVIDER === 'smtp' && process.env.SMTP_USER && process.env.SMTP_PASS ? 'SMTP' : 'Solo outbox (sin envío real)'
}
