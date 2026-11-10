import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

function key() {
  const k = Buffer.from(env.encryptionKey, "base64");
  if (k.length !== 32) throw new Error("GavIA_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.");
  return k;
}

/** Cifra secretos de integraciones (AES-256-GCM). Nunca se envían al navegador. */
export function encryptSecret(plain: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): Record<string, string> {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
