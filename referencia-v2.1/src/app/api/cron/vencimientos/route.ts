import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asService } from "@/server/db";

/**
 * Tarea diaria (Vercel Cron, ver vercel.json): pasa a SUSPENDIDO los balnearios
 * cuyo plan anual venció sin renovarse. Vercel envía "Authorization: Bearer CRON_SECRET".
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const r = await asService((db) => db.one<{ n: number }>(`select suspend_unrenewed_balnearios() as n`));
  return NextResponse.json({ ok: true, suspendidos: r?.n ?? 0 });
}
