import "server-only";
import { asService, asUser, type Db } from "@/server/db";
import { decryptSecret, encryptSecret } from "@/server/crypto";

export type Provider = "mercadopago" | "whatsapp";

export type IntegrationInfo = {
  id: string;
  provider: Provider;
  mode: "prueba" | "produccion";
  status: "pendiente" | "activa" | "error" | "desactivada";
  publicConfig: Record<string, string>;
  hasSecret: boolean;
  updatedAt: string;
};

/** Lectura con RLS (sin secretos). */
export async function getIntegration(db: Db, balnearioId: string | null, provider: Provider): Promise<IntegrationInfo | null> {
  const r = await db.one<{ id: string; provider: Provider; mode: IntegrationInfo["mode"]; status: IntegrationInfo["status"]; public_config: Record<string, string>; has_secret: boolean; updated_at: string }>(
    `select id, provider, mode, status, public_config, has_secret, updated_at from integrations
      where provider = $2 and balneario_id is not distinct from $1`,
    [balnearioId, provider],
  );
  return r ? { id: r.id, provider: r.provider, mode: r.mode, status: r.status, publicConfig: r.public_config, hasSecret: r.has_secret, updatedAt: r.updated_at } : null;
}

/**
 * Guarda configuración pública con RLS (solo el dueño / superadmin pasa la política)
 * y luego, en una transacción separada, el secreto cifrado con privilegios de servicio.
 */
export async function saveIntegration(
  userId: string,
  balnearioId: string | null,
  provider: Provider,
  data: { mode: "prueba" | "produccion"; status: IntegrationInfo["status"]; publicConfig: Record<string, string>; secrets?: Record<string, string> | null },
) {
  const row = await asUser(userId, (userDb) => userDb.one<{ id: string }>(
    `insert into integrations (balneario_id, provider, mode, status, public_config, updated_by, updated_at)
     values ($1, $2, $3, $4, $5, auth.uid(), now())
     on conflict (coalesce(balneario_id, '00000000-0000-0000-0000-000000000000'::uuid), provider)
     do update set mode = excluded.mode, status = excluded.status, public_config = excluded.public_config, updated_by = auth.uid(), updated_at = now()
     returning id`,
    [balnearioId, provider, data.mode, data.status, JSON.stringify(data.publicConfig)],
  ));
  if (data.secrets) {
    const ciphertext = encryptSecret(data.secrets);
    await asService(async (db) => {
      await db.exec(
        `insert into integration_secrets (integration_id, ciphertext) values ($1, $2)
         on conflict (integration_id) do update set ciphertext = excluded.ciphertext, updated_at = now()`,
        [row!.id, ciphertext],
      );
      await db.exec(`update integrations set has_secret = true where id = $1`, [row!.id]);
    });
  }
  return row!.id;
}

/** Solo backend: devuelve configuración + secretos descifrados. */
export async function loadIntegrationSecrets(balnearioId: string | null, provider: Provider) {
  return asService(async (db) => {
    const r = await db.one<{ id: string; mode: string; status: string; public_config: Record<string, string>; ciphertext: string | null }>(
      `select i.id, i.mode, i.status, i.public_config, s.ciphertext from integrations i
         left join integration_secrets s on s.integration_id = i.id
        where i.provider = $2 and i.balneario_id is not distinct from $1`,
      [balnearioId, provider],
    );
    if (!r) return null;
    return { id: r.id, mode: r.mode, status: r.status, publicConfig: r.public_config, secrets: r.ciphertext ? decryptSecret(r.ciphertext) : null };
  });
}
