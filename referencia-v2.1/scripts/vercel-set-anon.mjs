// Recarga NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel (Production) sin caracteres extra.
// Uso: node --env-file=.env.supabase.local scripts/vercel-set-anon.mjs
import { spawnSync } from "node:child_process";

const value = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").replace(/^﻿/, "").trim();
if (!value) throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
const r = spawnSync("npx.cmd", ["--yes", "vercel@65.7.0", "env", "add", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "--environment", "production", "--type", "config", "--yes", "--force"], {
  input: value,
  encoding: "utf8",
  shell: true,
});
console.log(r.status === 0 ? "NEXT_PUBLIC_SUPABASE_ANON_KEY: ok" : `error (${r.status}): ${(r.stdout + r.stderr).replaceAll(value, "[oculto]").slice(-400)}`);
