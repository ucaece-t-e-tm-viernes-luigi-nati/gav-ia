import "server-only";
import { formatDateTime } from "@/lib/dates";
import { pool, q1, tx } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { mails } from "@/lib/mail-templates";
import { createCredentialUser, findUserByEmail, generateTempPassword, setUserPassword, TEMP_PASSWORD_HOURS } from "@/lib/users";

const venceClave = () => formatDateTime(new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000));

/**
 * Busca un usuario por correo o lo crea con una contraseña temporal (cambio obligatorio en el primer
 * ingreso, vence a las 72 h). Le manda el acceso por mail (queda en email_outbox con la clave enmascarada).
 * La autorización (dueño del balneario o equipo de GavIA) la valida quien llama.
 */
export async function findOrCreateUser(
  _actorId: string,
  email: string,
  fullName: string,
  phone = "",
  empresa = "tu balneario",
): Promise<{ userId: string; tempPassword?: string }> {
  const existing = await findUserByEmail(email);
  if (existing) {
    if (phone) await q1(`update profiles set phone = $2 where id = $1::uuid`, [existing.id, phone.trim().slice(0, 40)]);
    await sendMail({ to: existing.email, ...mails.staffAccess({ empresa, link: `${appUrl()}/empresa/ingresar`, email: existing.email, password: null, venceClave: venceClave(), nuevo: true }) });
    return { userId: existing.id };
  }
  const password = generateTempPassword();
  const userId = await tx((db) => createCredentialUser(db, { email, name: fullName, password, temporary: true, emailVerified: true }));
  if (phone) await q1(`update profiles set phone = $2 where id = $1::uuid`, [userId, phone.trim().slice(0, 40)]);
  await sendMail({
    to: email,
    ...mails.staffAccess({ empresa, link: `${appUrl()}/empresa/ingresar`, email, password, venceClave: venceClave(), nuevo: true }),
    secrets: [password],
  });
  return { userId, tempPassword: password };
}

/** Cambia el correo de ingreso. La autorización la valida quien llama. */
export async function updateUserEmail(userId: string, email: string) {
  await pool.query(`update "user" set email = $2, "updatedAt" = now() where id = $1`, [userId, email.trim().toLowerCase()]);
}

/** Asigna una contraseña temporal nueva (blanqueo) y la manda por mail. La autorización la valida quien llama. */
export async function resetUserPassword(userId: string, empresa = "tu balneario"): Promise<string> {
  const password = generateTempPassword();
  await tx((db) => setUserPassword(db, userId, password, { temporary: true }));
  await pool.query(`delete from session where "userId" = $1`, [userId]);
  const u = await q1<{ email: string }>(`select email from "user" where id = $1`, [userId]);
  if (u) {
    await sendMail({
      to: u.email,
      ...mails.staffAccess({ empresa, link: `${appUrl()}/empresa/ingresar`, email: u.email, password, venceClave: venceClave(), nuevo: false }),
      secrets: [password],
    });
  }
  return password;
}
