import type { Metadata } from 'next'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { Card, Empty, PageTitle, Table, Td } from '@/components/panel/ui'
import { q } from '@/lib/db'
import { formatDate } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import { requireSuperadmin } from '@/lib/guards'
import { isInviteUsable, type Invite } from '@/lib/onboarding'
import { createInvite, resendInvite, revokeInvite } from '../actions'

export const metadata: Metadata = { title: 'Invitaciones' }

export default async function InvitesPage() {
  await requireSuperadmin()
  const invites = await q<Invite & { created_at: Date; applications: number }>(
    `SELECT i.*, (SELECT count(*)::int FROM client_application a WHERE a.invite_token = i.token) AS applications
       FROM client_invite i ORDER BY i.created_at DESC LIMIT 200`,
  )
  const base = appUrl()

  return (
    <>
      <PageTitle eyebrow="Plataforma" title="Invitaciones" description="Los balnearios solo pueden darse de alta con uno de estos links." />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="Invitación personal" description="Un solo uso, vence en 14 días. Se manda por mail.">
          <ActionForm action={createInvite} submitLabel="Crear invitación" resetOnSuccess>
            <input type="hidden" name="kind" value="personal" />
            <label className={labelClass}>
              Email del balneario
              <input name="email" type="email" required className={inputClass} />
            </label>
            <label className={labelClass}>
              Nombre del contacto (opcional)
              <input name="name" maxLength={80} className={inputClass} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="send" defaultChecked /> Enviar el link por mail ahora
            </label>
          </ActionForm>
        </Card>
        <Card title="Link de campaña" description="Reutilizable, para compartir por mail o WhatsApp. Cada alta verifica su email con un código.">
          <ActionForm action={createInvite} submitLabel="Crear link de campaña" resetOnSuccess>
            <input type="hidden" name="kind" value="campaign" />
            <label className={labelClass}>
              Nombre de la campaña
              <input name="label" maxLength={80} placeholder="Ej. Cámara de balnearios temporada 2027" className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Vigencia (días)
                <input name="days" type="number" min={1} max={365} defaultValue={30} className={inputClass} />
              </label>
              <label className={labelClass}>
                Cupo (opcional)
                <input name="max_uses" type="number" min={1} className={inputClass} />
              </label>
            </div>
          </ActionForm>
        </Card>
      </div>
      <Card title="Links creados">
        {invites.length ? (
          <Table head={['Tipo', 'Destino', 'Usos', 'Vence', 'Link', '']}>
            {invites.map((i) => {
              const usable = isInviteUsable(i)
              const link = `${base}/empresa/alta/${i.token}`
              return (
                <tr key={i.token} className={usable ? '' : 'opacity-60'}>
                  <Td>{i.kind === 'personal' ? 'Personal' : 'Campaña'}</Td>
                  <Td>
                    {i.email ?? i.label ?? '—'}
                    {i.kind === 'personal' && i.label && <p className="text-xs text-muted-foreground">{i.label}</p>}
                  </Td>
                  <Td>
                    {i.uses}
                    {i.max_uses ? ` / ${i.max_uses}` : ''} · {i.applications} solicitudes
                  </Td>
                  <Td className="text-xs">
                    {i.revoked_at ? 'Revocado' : formatDate(i.expires_at)}
                    {!usable && !i.revoked_at && <p className="text-muted-foreground">no disponible</p>}
                  </Td>
                  <Td>
                    <input readOnly value={link} aria-label="Link de alta" className="w-56 rounded-lg border border-border bg-muted px-2 py-1 font-mono text-[11px]" />
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {usable && i.kind === 'personal' && (
                      <form action={resendInvite.bind(null, i.token)} className="inline">
                        <button className="mr-2 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">Reenviar</button>
                      </form>
                    )}
                    {!i.revoked_at && (
                      <form action={revokeInvite.bind(null, i.token)} className="inline">
                        <button className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">Revocar</button>
                      </form>
                    )}
                  </Td>
                </tr>
              )
            })}
          </Table>
        ) : (
          <Empty>Todavía no creaste invitaciones.</Empty>
        )}
      </Card>
    </>
  )
}
