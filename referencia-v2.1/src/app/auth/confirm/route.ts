import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailLink } from "@/server/auth/session";

/**
 * Destino de los enlaces de invitación y recuperación de Supabase Auth.
 * Las plantillas de correo deben apuntar a:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite   (o type=recovery)
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const tokenHash = p.get("token_hash") ?? "";
  const type = p.get("type");
  const valid = ["invite", "recovery", "magiclink", "email"].includes(type ?? "");
  const url = request.nextUrl.clone();
  url.search = "";
  if (!tokenHash || !valid) {
    url.pathname = "/login";
    url.searchParams.set("error", "enlace-invalido");
    return NextResponse.redirect(url);
  }
  const res = await verifyEmailLink(tokenHash, type as "invite");
  url.pathname = res.ok ? "/cuenta/clave" : "/login";
  if (!res.ok) url.searchParams.set("error", "enlace-invalido");
  return NextResponse.redirect(url);
}
