import "server-only";

// Integraciones opcionales: sin estas variables la app funciona igual y las pantallas
// muestran el aviso "no configurado".
export const env = {
  isProduction: process.env.NODE_ENV === "production",
  appUrl: (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  /** Clave AES-256-GCM (base64, 32 bytes) para cifrar credenciales de Mercado Pago / WhatsApp de cada balneario. */
  encryptionKey: process.env.GAVIA_ENCRYPTION_KEY ?? "",
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  },
};

/** ¿Se pueden guardar credenciales cifradas de integraciones? (requiere GAVIA_ENCRYPTION_KEY válida). */
export function integrationsConfigured() {
  return Buffer.from(env.encryptionKey, "base64").length === 32;
}

/** Línea comercial de WhatsApp de GavIA configurada (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID). */
export function gaviaWhatsAppConfigured() {
  return !!(env.whatsapp.accessToken && env.whatsapp.phoneNumberId);
}
