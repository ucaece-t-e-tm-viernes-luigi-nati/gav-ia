// Diagnóstico: intenta iniciar sesión con la clave anon y muestra el error de Supabase (sin secretos).
// Uso: node --env-file=.env.supabase.local scripts/auth-check.mjs <correo> <contraseña>
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInWithPassword({ email, password });
console.log(error ? { error: error.message, status: error.status, code: error.code } : { ok: true, user: data.user?.email });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: list } = await admin.auth.admin.listUsers();
const u = list?.users.find((x) => x.email === email.toLowerCase());
console.log(u ? { existe: true, confirmado: !!u.email_confirmed_at, baneado: !!u.banned_until, proveedor: u.app_metadata?.provider } : { existe: false });
