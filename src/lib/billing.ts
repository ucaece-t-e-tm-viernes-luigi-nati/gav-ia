import 'server-only'
import { audit } from './audit'
import { addDays, formatDate, todayISO } from './dates'
import { q } from './db'
import { pauseAfterDays } from './env'
import { sendMail } from './mail'
import { mails } from './mail-templates'
import { formatMoney } from './money'

type DueClient = {
  id: string
  name: string
  status: string
  monthly_price_cents: string
  currency: string
  next_due_date: string
  emails: string[] | null
}

const DUE_SELECT = `SELECT b.id, b.name, b.status, b.monthly_price_cents::text, b.currency,
       to_char(b.next_due_date, 'YYYY-MM-DD') AS next_due_date,
       (SELECT array_agg(p.email) FROM memberships m JOIN profiles p ON p.id = m.user_id
         WHERE m.balneario_id = b.id AND m.role = 'owner' AND m.active) AS emails
  FROM balnearios b`

async function notify(client: DueClient, mail: { subject: string; html: string; text: string; template: string }) {
  for (const to of client.emails ?? []) await sendMail({ to, ...mail })
}

async function alreadyDone(clientId: string, action: string, due: string) {
  const rows = await q(`SELECT 1 FROM audit_log WHERE balneario_id = $1 AND action = $2 AND data->>'due' = $3 LIMIT 1`, [clientId, action, due])
  return rows.length > 0
}

/**
 * Proceso diario de vencimientos del abono (lo llama el cron de Vercel). Idempotente: si corre dos veces
 * el mismo día no duplica mails.
 * 1. Aviso 5 días antes del vencimiento.
 * 2. Vencido → past_due (+ pago del período marcado como vencido).
 * 3. past_due con más de PAUSE_AFTER_DAYS días → paused (panel en solo lectura).
 * Los balnearios demo (is_demo) no se tocan.
 */
export async function runDailyBilling(today = todayISO()) {
  const result = { reminders: 0, pastDue: 0, paused: 0 }
  const grace = pauseAfterDays()
  const amount = (c: DueClient) => formatMoney(Number(c.monthly_price_cents), c.currency)

  // 1. Aviso previo
  const reminderDate = addDays(today, 5)
  const upcoming = await q<DueClient>(
    `${DUE_SELECT} WHERE b.status IN ('trial','active') AND NOT b.is_demo AND b.monthly_price_cents > 0 AND b.next_due_date = $1::date`,
    [reminderDate],
  )
  for (const c of upcoming) {
    if (await alreadyDone(c.id, 'billing.reminder', c.next_due_date)) continue
    await notify(c, mails.billingReminder({ empresa: c.name, monto: amount(c), fecha: formatDate(c.next_due_date) }))
    await audit(null, 'billing.reminder', { actorRole: 'cron', clientId: c.id, entity: 'balnearios', entityId: c.id, detail: { due: c.next_due_date } })
    result.reminders++
  }

  // 2. Vencidos
  const overdue = await q<DueClient>(
    `${DUE_SELECT} WHERE b.status IN ('trial','active') AND NOT b.is_demo AND b.monthly_price_cents > 0 AND b.next_due_date < $1::date`,
    [today],
  )
  for (const c of overdue) {
    await q(`UPDATE balnearios SET status = 'past_due' WHERE id = $1`, [c.id])
    await q(
      `INSERT INTO client_payment (client_id, period, amount_cents, currency, status, due_date)
       VALUES ($1, to_char($2::date, 'YYYY-MM'), $3, $4, 'overdue', $2::date)
       ON CONFLICT (client_id, period) DO UPDATE SET status = 'overdue' WHERE client_payment.status = 'pending'`,
      [c.id, c.next_due_date, c.monthly_price_cents, c.currency],
    )
    await notify(c, mails.billingOverdue({ empresa: c.name, monto: amount(c), fecha: formatDate(c.next_due_date), fechaPausa: formatDate(addDays(c.next_due_date, grace)) }))
    await audit(null, 'client.past_due', { actorRole: 'cron', clientId: c.id, entity: 'balnearios', entityId: c.id, detail: { due: c.next_due_date, from: c.status } })
    result.pastDue++
  }

  // 3. Pausa por falta de pago
  const toPause = await q<DueClient>(
    `${DUE_SELECT} WHERE b.status = 'past_due' AND NOT b.is_demo AND b.next_due_date < ($1::date - make_interval(days => $2::int))`,
    [today, grace],
  )
  for (const c of toPause) {
    await q(`UPDATE balnearios SET status = 'paused' WHERE id = $1`, [c.id])
    await notify(c, mails.billingPaused({ empresa: c.name }))
    await audit(null, 'client.pause', { actorRole: 'cron', clientId: c.id, entity: 'balnearios', entityId: c.id, detail: { due: c.next_due_date, reason: 'falta de pago' } })
    result.paused++
  }

  return result
}
