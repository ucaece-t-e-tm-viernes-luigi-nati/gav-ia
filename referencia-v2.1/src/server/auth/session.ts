import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/server/env";
import { asService } from "@/server/db";
import { verifyPassword } from "./password";

const DEMO_COOKIE = "gavia_session";
const SESSION_HOURS = 12;

function sign(payload: string) {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Devuelve el id del usuario autenticado, verificado del lado del servidor. */
export async function getAuthUserId(): Promise<string | null> {
  if (env.mode === "demo") {
    const raw = (await cookies()).get(DEMO_COOKIE)?.value;
    if (!raw) return null;
    const [uid, exp, sig] = raw.split(".");
    if (!uid || !exp || !sig) return null;
    const expected = Buffer.from(sign(`${uid}.${exp}`));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (Number(exp) < Date.now()) return null;
    return uid;
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

// Limitador simple de intentos (por proceso). En producción, complementar con
// la protección de Supabase Auth y un WAF / rate limit del hosting.
const attempts = new Map<string, { count: number; until: number }>();
function tooManyAttempts(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.count >= 5) return true;
  if (!a || a.until <= now) attempts.set(key, { count: 0, until: now + 10 * 60_000 });
  return false;
}
function registerFailure(key: string) {
  const a = attempts.get(key);
  if (a) a.count++;
}

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = email.toLowerCase();
  if (tooManyAttempts(key)) return { ok: false, error: "Demasiados intentos. Esperá unos minutos y volvé a intentar." };
  const invalid = { ok: false as const, error: "Correo o contraseña incorrectos." };

  if (env.mode === "demo") {
    const user = await asService((db) =>
      db.one<{ id: string; encrypted_password: string }>(
        `select id, encrypted_password from auth.users where lower(email) = lower($1)`,
        [email],
      ),
    );
    if (!user || !(await verifyPassword(password, user.encrypted_password))) {
      registerFailure(key);
      return invalid;
    }
    const exp = Date.now() + SESSION_HOURS * 3600_000;
    const payload = `${user.id}.${exp}`;
    (await cookies()).set(DEMO_COOKIE, `${payload}.${sign(payload)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      maxAge: SESSION_HOURS * 3600,
    });
    attempts.delete(key);
    return { ok: true };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Solo el código (sin correo ni contraseña) para poder distinguir credenciales inválidas de errores de configuración.
    if (error.code !== "invalid_credentials") console.warn("[GAVIA] Supabase Auth rechazó el ingreso:", error.code, error.status);
    registerFailure(key);
    return invalid;
  }
  attempts.delete(key);
  return { ok: true };
}

const SUPABASE_ONLY = "Disponible solo con Supabase Auth (no en el modo demo).";

/** Verifica el enlace de invitación o recuperación (plantilla con token_hash) y abre la sesión. */
export async function verifyEmailLink(tokenHash: string, type: "invite" | "recovery" | "magiclink" | "email") {
  if (env.mode === "demo") return { ok: false as const, error: SUPABASE_ONLY };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  return error ? { ok: false as const, error: "El enlace no es válido o ya venció. Pedí uno nuevo." } : { ok: true as const };
}

export async function updatePassword(password: string) {
  if (env.mode === "demo") return { ok: false as const, error: SUPABASE_ONLY };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false as const, error: error.message.includes("different") ? "La contraseña nueva debe ser distinta de la anterior." : "No se pudo actualizar la contraseña." } : { ok: true as const };
}

export async function requestPasswordReset(email: string) {
  if (env.mode === "demo") return { ok: false as const, error: SUPABASE_ONLY };
  const key = `reset:${email.toLowerCase()}`;
  if (tooManyAttempts(key)) return { ok: false as const, error: "Demasiados intentos. Esperá unos minutos." };
  registerFailure(key);
  const supabase = await supabaseServer();
  // No se revela si el correo existe: la respuesta es siempre la misma.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.appUrl}/auth/confirm` });
  return { ok: true as const };
}

export async function signOut() {
  const store = await cookies();
  store.delete("gavia_balneario");
  if (env.mode === "demo") {
    store.delete(DEMO_COOKIE);
    return;
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
}
