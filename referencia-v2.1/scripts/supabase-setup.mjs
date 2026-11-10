// Aplica las migraciones en Supabase y otorga el rol superadmin al primer usuario.
// Uso: node --env-file=.env.supabase.local scripts/supabase-setup.mjs
// No imprime secretos.
import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const adminEmail = (process.env.GAVIA_SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
if (!url || url.includes("COMPLETAR")) throw new Error("Falta DATABASE_URL en .env.supabase.local");

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(`create schema if not exists gavia_meta;
    create table if not exists gavia_meta.migrations (name text primary key, applied_at timestamptz not null default now());
    revoke all on schema gavia_meta from public;`);
  const applied = new Set((await sql`select name from gavia_meta.migrations`).map((r) => r.name));
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) {
      console.log(`= ${file} (ya aplicada)`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(`supabase/migrations/${file}`, "utf8"));
      await tx`insert into gavia_meta.migrations (name) values (${file})`;
    });
    console.log(`+ ${file} aplicada`);
  }

  // Perfiles para usuarios creados antes de la migración (el trigger solo cubre altas nuevas).
  const backfill = await sql`insert into public.profiles (id, email, full_name)
    select id, email, coalesce(raw_user_meta_data ->> 'full_name', '') from auth.users where email is not null
    on conflict (id) do nothing returning id`;
  console.log(`Perfiles completados: ${backfill.length}`);

  if (adminEmail) {
    const r = await sql`update public.profiles set platform_role = 'superadmin' where lower(email) = ${adminEmail} returning id`;
    console.log(r.length ? `Superadmin asignado a ${adminEmail}` : `No existe un usuario con el correo ${adminEmail}: crealo en Supabase → Authentication → Users`);
  }
  const counts = await sql`select (select count(*) from public.plans)::int as planes, (select count(*) from public.balnearios)::int as balnearios,
    (select count(*) from public.profiles where platform_role = 'superadmin')::int as superadmins`;
  console.log("Estado:", counts[0]);
} finally {
  await sql.end();
}
