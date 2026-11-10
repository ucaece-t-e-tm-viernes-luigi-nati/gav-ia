// Diagnóstico de usuarios en Supabase (sin mostrar datos personales salvo el correo configurado).
// Uso: node --env-file=.env.supabase.local scripts/supabase-status.mjs
import postgres from "postgres";

const email = (process.env.GAVIA_SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const [r] = await sql`select count(*)::int as usuarios,
      count(*) filter (where email_confirmed_at is not null)::int as confirmados,
      count(*) filter (where lower(email) = ${email})::int as coincide_correo
    from auth.users`;
  console.log(r);
} finally {
  await sql.end();
}
