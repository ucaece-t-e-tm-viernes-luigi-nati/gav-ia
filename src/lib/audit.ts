import 'server-only'
import { q } from './db'

type Actor = { id: string; role?: string | null } | null

/**
 * Registra una acción en audit_log (la tabla de la v2.1, que también llenan los triggers de la base).
 * Nunca guardar contraseñas ni tokens en detail.
 */
export async function audit(
  actor: Actor,
  action: string,
  opts: { clientId?: string | null; entity?: string; entityId?: string; detail?: Record<string, unknown>; actorRole?: string } = {},
) {
  try {
    await q(
      `INSERT INTO audit_log (balneario_id, actor_id, action, entity, entity_id, data)
       VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)`,
      [
        opts.clientId ?? null,
        actor?.id ?? null,
        action,
        opts.entity ?? 'sistema',
        opts.entityId ?? null,
        JSON.stringify({ actor_role: opts.actorRole ?? actor?.role ?? 'system', ...(opts.detail ?? {}) }),
      ],
    )
  } catch (error) {
    console.error('[audit] No se pudo registrar', action, error)
  }
}
