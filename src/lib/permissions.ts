// Matriz de permisos de GavIA. ÚNICO lugar donde se define quién puede qué.
// Se chequea SIEMPRE en el servidor (src/server/auth/context.ts y src/lib/guards.ts): en páginas,
// server actions y route handlers. Además, las políticas RLS de la base (v2.1) vuelven a validar
// cada lectura y escritura del panel del balneario.

export type PlatformRole = 'superadmin' | 'admin' | 'member'
export type TenantRole = 'owner' | 'staff'

// ---------- Superficie del balneario (/empresa) ----------
export type TenantPermission =
  | 'dashboard.view' // resumen (el del dueño incluye finanzas; el del staff, la operación del día)
  | 'finanzas.view' // facturación, ingresos, saldos agregados, exportaciones
  | 'plano.view' // plano y disponibilidad
  | 'plano.edit' // editor del plano (el staff solo si el dueño le habilita "puede editar el plano")
  | 'reservas.manage' // crear, modificar y cancelar reservas
  | 'clientes.manage' // fichas de clientes
  | 'cobros.register' // registrar cobros de reservas (y cobro con QR)
  | 'pagos.view' // listado completo de cobros, facturado / sin facturar
  | 'gastos.manage' // gastos, categorías y empleados
  | 'calendario.view' // calendario, recordatorios y tareas
  | 'conversaciones.manage' // conversaciones de WhatsApp
  | 'reportes.view' // reportes de ocupación e ingresos
  | 'usuarios.manage' // sumar dueños o staff, permisos, blanqueo de clave
  | 'config.manage' // datos del balneario e integraciones (Mercado Pago / WhatsApp)
  | 'plan.view' // plan contratado, abono y pagos a GavIA
  | 'auditoria.view' // actividad del balneario

export const TENANT_PERMISSIONS: Record<TenantRole, readonly TenantPermission[]> = {
  owner: [
    'dashboard.view', 'finanzas.view', 'plano.view', 'plano.edit', 'reservas.manage', 'clientes.manage', 'cobros.register', 'pagos.view',
    'gastos.manage', 'calendario.view', 'conversaciones.manage', 'reportes.view', 'usuarios.manage', 'config.manage', 'plan.view', 'auditoria.view',
  ],
  staff: ['dashboard.view', 'plano.view', 'reservas.manage', 'clientes.manage', 'cobros.register', 'calendario.view', 'conversaciones.manage'],
}

export const TENANT_ROLE_LABELS: Record<TenantRole, { name: string; description: string }> = {
  owner: { name: 'Dueño', description: 'Control total del balneario: operación, finanzas, gastos, usuarios, configuración y plan.' },
  staff: { name: 'Staff', description: 'Operación diaria: plano, reservas, clientes, cobros, calendario y conversaciones. Sin finanzas agregadas.' },
}

export function tenantCan(role: TenantRole | null | undefined, permission: TenantPermission) {
  return !!role && TENANT_PERMISSIONS[role].includes(permission)
}

/** Estados del balneario en los que el panel queda en solo lectura. */
export const READ_ONLY_STATUSES = ['paused', 'cancelled'] as const

export function isReadOnlyStatus(status: string) {
  return (READ_ONLY_STATUSES as readonly string[]).includes(status)
}

// ---------- Superficie del equipo (/plataforma) ----------
// Dos niveles, con las MISMAS funciones en /plataforma:
// - superadmin principal: rol 'superadmin' + email en SUPERADMIN_EMAILS (env). Nadie lo puede quitar desde el panel.
// - admin del equipo: rol 'admin', creado desde /plataforma/equipo por otro superadmin o admin. Se puede quitar.
type PlatformUser = { role: string; email: string; emailVerified: boolean } | null

/** Superadmin principal: rol en la base + email en SUPERADMIN_EMAILS + email verificado. Las tres cosas. */
export function isRootSuperadmin(user: PlatformUser, allowedEmails: string[]) {
  return !!user && user.role === 'superadmin' && user.emailVerified && allowedEmails.includes(user.email.toLowerCase())
}

/** Acceso a /plataforma: superadmin principal o admin del equipo con email verificado. */
export function isSuperadmin(user: PlatformUser, allowedEmails: string[]) {
  return isRootSuperadmin(user, allowedEmails) || (!!user && user.role === 'admin' && user.emailVerified)
}

export const PLATFORM_ROLES = ['superadmin', 'admin'] as const
