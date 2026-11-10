import 'server-only'
import { notFound } from 'next/navigation'
import { getCurrentUser, type SessionUser } from './auth'
import { q } from './db'
import { superadminEmails } from './env'
import { isSuperadmin, type TenantRole } from './permissions'

// ---------------- Superadmin (/plataforma) ----------------

/** Superadmin (principal o admin del equipo) o 404: no revela que la ruta existe. */
export async function requireSuperadmin(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user || !isSuperadmin(user, superadminEmails())) notFound()
  return user
}

/** Para route handlers: true si quien llama es del equipo (sin lanzar). */
export async function isSuperadminRequest() {
  try {
    const user = await getCurrentUser()
    return !!user && isSuperadmin(user, superadminEmails())
  } catch {
    return false
  }
}

// ---------------- Balnearios (/empresa) ----------------
// El contexto completo del panel (balneario activo, módulos del plan, solo lectura) está en
// src/server/auth/context.ts (requireTenant / requirePermission / tenantForAction).

export type BalnearioMembership = { clientId: string; clientName: string; status: string; role: TenantRole }

/** Membresías activas de un usuario (sin RLS: el userId sale de la sesión). */
export function getMemberships(userId: string) {
  return q<BalnearioMembership>(
    `SELECT b.id AS "clientId", b.name AS "clientName", b.status, m.role
       FROM memberships m JOIN balnearios b ON b.id = m.balneario_id
      WHERE m.user_id = $1::uuid AND m.active
      ORDER BY b.name`,
    [userId],
  )
}

export type ActionState = { ok?: boolean; error?: string; message?: string } | null
