// Crea (si no existe) el usuario de GAVIA_SUPERADMIN_EMAIL en Supabase Auth con una
// contraseña temporal, que se imprime una sola vez. Luego ejecutar supabase-setup.mjs
// para asignarle el rol superadmin.
// Uso: node --env-file=.env.supabase.local scripts/create-superadmin.mjs
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const email = (process.env.GAVIA_SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
if (!email.includes("@")) throw new Error("Falta GAVIA_SUPERADMIN_EMAIL");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listError) throw listError;
if (list.users.some((u) => u.email?.toLowerCase() === email)) {
  console.log(`El usuario ${email} ya existe: no se modificó su contraseña.`);
} else {
  const password = `Gv-${randomBytes(12).toString("base64url")}`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Equipo GAVIA" } });
  if (error) throw error;
  console.log(`Usuario creado: ${email}`);
  console.log(`Contraseña temporal (se muestra una sola vez): ${password}`);
}
