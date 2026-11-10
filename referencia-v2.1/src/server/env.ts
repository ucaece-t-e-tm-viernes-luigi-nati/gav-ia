import "server-only";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

export type DataMode = "demo" | "supabase";

function resolveMode(): DataMode {
  const raw = process.env.GAVIA_DATA_MODE;
  if (raw === "supabase") return "supabase";
  if (raw === "demo") return "demo";
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo";
}

export const env = {
  mode: resolveMode(),
  isProduction: process.env.NODE_ENV === "production",
  /**
   * Demo de revisión desplegada (por ejemplo, preview de Vercel): base en memoria con
   * datos ficticios. Requiere activarla de forma explícita; nunca usar con datos reales.
   */
  previewDemo: process.env.GAVIA_ALLOW_PREVIEW_DEMO === "true",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret: process.env.GAVIA_SESSION_SECRET ?? "",
  demoPassword: process.env.GAVIA_DEMO_PASSWORD ?? "",
  // Fuera del proyecto para que el observador de archivos de Next no la vigile.
  devDbDir: process.env.GAVIA_DEV_DB_DIR ?? path.join(os.tmpdir(), `gavia-dev-db-${createHash("sha1").update(process.cwd()).digest("hex").slice(0, 8)}`),
  encryptionKey: process.env.GAVIA_ENCRYPTION_KEY ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  },
};

export function assertConfig() {
  if (env.mode === "demo") {
    if (env.isProduction && !env.previewDemo) {
      throw new Error(
        "El modo demo está deshabilitado en producción. Configurá GAVIA_DATA_MODE=supabase y las variables de Supabase.",
      );
    }
    if (env.sessionSecret.length < 32) throw new Error("Falta GAVIA_SESSION_SECRET (mínimo 32 caracteres).");
    // En una demo desplegada se exige una contraseña larga, aunque los datos sean ficticios.
    if (env.demoPassword.length < (env.previewDemo ? 16 : 10)) throw new Error("Falta GAVIA_DEMO_PASSWORD o es demasiado corta.");
  } else {
    const missing = [
      ["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabaseAnonKey],
      ["DATABASE_URL", env.databaseUrl],
    ].filter(([, v]) => !v);
    if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.map(([k]) => k).join(", ")}`);
  }
}
