import type { Metadata } from 'next'
import { ActionForm, inputClass, labelClass } from '@/components/forms'
import { Card, Empty, PageTitle, Table, Td } from '@/components/panel/ui'
import { q } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/dates'
import { superadminEmails } from '@/lib/env'
import { requireSuperadmin } from '@/lib/guards'
import { createAdmin, removeAdmin, resendAdminLink } from '../actions'

export const metadata: Metadata = { title: 'Equipo' }

type Member = {
  id: string
  name: string
  email: string
  role: string
  emailVerified: boolean
  createdAt: Date
  last_seen: Date | null
}

export default async function TeamPage() {
  const me = await requireSuperadmin()
  const roots = superadminEmails()
  const members = await q<Member>(
    `SELECT u.id, u.name, u.email, u.role, u."emailVerified", u."createdAt",
            (SELECT max(s."updatedAt") FROM session s WHERE s."userId" = u.id) AS last_seen
       FROM "user" u
      WHERE u.role IN ('superadmin', 'admin')
      ORDER BY (u.role = 'superadmin') DESC, u."createdAt"`,
  )

  return (
    <>
      <PageTitle
        eyebrow="Plataforma"
        title="Equipo"
        description="Personas con acceso a esta plataforma. Los admins tienen las mismas funciones que el superadmin principal, pero el superadmin principal no se puede quitar."
      />
      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Sumar un admin" description="Le llega un mail con un link para definir su contraseña (vence en 72 horas).">
          <ActionForm action={createAdmin} submitLabel="Crear admin y enviar link" resetOnSuccess>
            <label className={labelClass}>
              Nombre y apellido
              <input name="name" required minLength={2} maxLength={80} className={inputClass} />
            </label>
            <label className={labelClass}>
              Email
              <input name="email" type="email" required className={inputClass} />
            </label>
          </ActionForm>
        </Card>
        <Card title="Quiénes tienen acceso">
          {members.length ? (
            <Table head={['Persona', 'Rol', 'Estado', 'Último ingreso', '']}>
              {members.map((m) => {
                const isRoot = m.role === 'superadmin' && roots.includes(m.email.toLowerCase())
                const isMe = m.id === me.id
                return (
                  <tr key={m.id}>
                    <Td>
                      <p className="font-semibold">
                        {m.name}
                        {isMe && <span className="ml-1 text-xs font-normal text-muted-foreground">(vos)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </Td>
                    <Td>{isRoot ? 'Superadmin principal' : 'Admin'}</Td>
                    <Td className="text-xs">
                      {m.emailVerified ? 'Activo' : 'Esperando que defina su contraseña'}
                      <p className="text-muted-foreground">desde {formatDate(m.createdAt)}</p>
                    </Td>
                    <Td className="text-xs">{m.last_seen ? formatDateTime(m.last_seen) : '—'}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {isRoot ? (
                        <span className="text-xs text-muted-foreground">No se puede quitar</span>
                      ) : (
                        <>
                          {!m.emailVerified && (
                            <form action={resendAdminLink.bind(null, m.id)} className="inline">
                              <button className="mr-2 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">Reenviar link</button>
                            </form>
                          )}
                          {!isMe && (
                            <form action={removeAdmin.bind(null, m.id)} className="inline">
                              <button className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Quitar acceso</button>
                            </form>
                          )}
                        </>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </Table>
          ) : (
            <Empty>Todavía no hay nadie en el equipo.</Empty>
          )}
        </Card>
      </div>
    </>
  )
}
