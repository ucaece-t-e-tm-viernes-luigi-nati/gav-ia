import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { asService, asUser } from "@/server/db";
import { env } from "@/server/env";
import { hashPassword } from "@/server/auth/password";

/** Contraseña temporal fuerte; se muestra una sola vez a quien da el alta. */
export function tempPassword() {
  return `Gv-${randomBytes(12).toString("base64url")}`;
}

function supabaseAdmin() {
  if (!env.supabaseServiceKey) throw Object.assign(new Error(), { code: "P0001", message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor para gestionar usuarios." });
  return createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Busca un usuario por correo (función con control de permisos en la base) o lo crea
 * con una contraseña temporal. No depende del envío de correos (SMTP).
 * Importante: no llamar dentro de otra transacción (usa transacciones propias).
 */
export async function findOrCreateUser(actorId: string, email: string, fullName: string, phone = ""): Promise<{ userId: string; tempPassword?: string }> {
  // La función SQL rechaza a quien no sea dueño o superadmin.
  const existing = await asUser(actorId, (db) => db.one<{ id: string | null }>(`select find_profile_id_by_email($1) as id`, [email]));
  if (existing?.id) {
    if (phone) await setProfilePhone(existing.id, phone);
    return { userId: existing.id };
  }
  const created = await createAuthUser(email, fullName);
  if (phone) await setProfilePhone(created.userId, phone);
  return created;
}

/** Teléfono de contacto (lo carga quien da el alta; se escribe con privilegios de servicio). */
async function setProfilePhone(userId: string, phone: string) {
  await asService((db) => db.exec(`update profiles set phone = $2 where id = $1`, [userId, phone.trim().slice(0, 40)]));
}

async function createAuthUser(email: string, fullName: string): Promise<{ userId: string; tempPassword?: string }> {

  const password = tempPassword();
  if (env.mode === "demo") {
    const hash = await hashPassword(password);
    const row = await asService((db) =>
      db.one<{ id: string }>(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning id`, [email, hash, JSON.stringify({ full_name: fullName })]),
    );
    return { userId: row!.id, tempPassword: password };
  }

  const { data, error } = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw Object.assign(new Error(), { code: "P0001", message: `No se pudo crear el usuario: ${error?.message ?? "error"}` });
  return { userId: data.user.id, tempPassword: password };
}

/** Cambia el correo de ingreso. La autorización (permiso "usuarios") la valida quien llama. */
export async function updateUserEmail(userId: string, email: string) {
  if (env.mode === "demo") {
    await asService(async (db) => {
      await db.exec(`update auth.users set email = $2 where id = $1`, [userId, email]);
      await db.exec(`update profiles set email = $2 where id = $1`, [userId, email]);
    });
    return;
  }
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (error) throw Object.assign(new Error(), { code: "P0001", message: `No se pudo cambiar el correo: ${error.message}` });
  await asService((db) => db.exec(`update profiles set email = $2 where id = $1`, [userId, email]));
}

/** Define una contraseña elegida por el superadmin. */
export async function setUserPassword(userId: string, password: string) {
  if (env.mode === "demo") {
    const hash = await hashPassword(password);
    await asService((db) => db.exec(`update auth.users set encrypted_password = $2 where id = $1`, [userId, hash]));
    return;
  }
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
  if (error) throw Object.assign(new Error(), { code: "P0001", message: `No se pudo cambiar la contraseña: ${error.message}` });
}

/** Asigna una contraseña temporal nueva (blanqueo). La autorización la valida quien llama. */
export async function resetUserPassword(userId: string): Promise<string> {
  const password = tempPassword();
  if (env.mode === "demo") {
    const hash = await hashPassword(password);
    await asService((db) => db.exec(`update auth.users set encrypted_password = $2 where id = $1`, [userId, hash]));
    return password;
  }
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password });
  if (error) throw Object.assign(new Error(), { code: "P0001", message: `No se pudo blanquear la contraseña: ${error.message}` });
  return password;
}
