// Carga en Vercel (entorno Production) las variables de Supabase leídas de .env.supabase.local.
// Uso: node --env-file=.env.supabase.local scripts/vercel-production-env.mjs https://gavia-erp.vercel.app
// No imprime secretos.
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const appUrl = process.argv[2];
if (!appUrl?.startsWith("https://")) throw new Error("Indicá la URL pública de producción como argumento.");

let encryptionKey = process.env.GAVIA_ENCRYPTION_KEY;
if (!encryptionKey) {
  // La clave debe mantenerse estable: se guarda localmente para reutilizarla.
  encryptionKey = randomBytes(32).toString("base64");
  appendFileSync(".env.supabase.local", `\n# Generada automáticamente: no cambiar (cifra credenciales de integraciones)\nGAVIA_ENCRYPTION_KEY=${encryptionKey}\n`);
}

const vars = {
  GAVIA_DATA_MODE: ["supabase", false],
  APP_URL: [appUrl, false],
  NEXT_PUBLIC_SUPABASE_URL: [process.env.NEXT_PUBLIC_SUPABASE_URL, false],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: [process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, false],
  SUPABASE_SERVICE_ROLE_KEY: [process.env.SUPABASE_SERVICE_ROLE_KEY, true],
  DATABASE_URL: [process.env.DATABASE_URL, true],
  GAVIA_ENCRYPTION_KEY: [encryptionKey, true],
  NEXT_TELEMETRY_DISABLED: ["1", false],
};
for (const [name, [value]] of Object.entries(vars)) {
  if (!value || value.includes("COMPLETAR")) throw new Error(`Falta ${name} en .env.supabase.local`);
}
for (const [name, [value, sensitive]] of Object.entries(vars)) {
  const args = ["--yes", "vercel@65.7.0", "env", "add", name, "production", "--force", ...(sensitive ? ["--sensitive"] : [])];
  const r = spawnSync("npx.cmd", args, { input: value, encoding: "utf8", shell: true });
  console.log(`${name}: ${r.status === 0 ? "ok" : `error (${r.status})`}`);
}
