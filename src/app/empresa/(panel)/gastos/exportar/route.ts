import type { NextRequest } from "next/server";
import { tenantForRead } from "@/server/auth/context";
import { asUser } from "@/server/db";
import { listExpenses } from "@/server/repos/exports";
import { fileResponse, toPdf, toXlsx } from "@/server/exports/sheet";
import { formatDate, isISODate } from "@/lib/dates";
import { METHOD_LABEL } from "@/features/reservas/labels";
import { fileSlug } from "@/server/exports/names";

/** Exporta los gastos del período (solo el dueño). */
export async function GET(request: NextRequest) {
  const t = await tenantForRead(["owner"]);
  if (!t || t.role !== "owner") return new Response("No encontrado", { status: 404 });
  const sp = request.nextUrl.searchParams;
  const format = sp.get("formato") === "pdf" ? "pdf" : "xlsx";
  const from = sp.get("desde") ?? "";
  const to = sp.get("hasta") ?? "";
  if (!isISODate(from) || !isISODate(to) || to < from) return new Response("Rango de fechas inválido", { status: 400 });
  const cat = sp.get("categoria");
  const categoryId = cat && /^[0-9a-f-]{36}$/i.test(cat) ? cat : null;
  const rows = await asUser(t.viewer.id, (db) => listExpenses(db, t.balnearioId, { from, to, categoryId }));
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + Number(r.amount_cents));
  const report = {
    title: `Gastos · ${t.balnearioName}`,
    subtitle: `Del ${formatDate(from)} al ${formatDate(to)}${categoryId && rows[0] ? ` · categoría ${rows[0].category}` : ""} · ${rows.length} gastos`,
    columns: [
      { header: "Fecha", width: 12 }, { header: "Categoría", width: 20 }, { header: "Empleado", width: 22 }, { header: "Descripción", width: 36 }, { header: "Medio", width: 14 },
      { header: "Registró", width: 20 }, { header: "Importe", kind: "money" as const },
    ],
    rows: rows.map((r) => [formatDate(r.spent_on), r.category, r.employee ?? "", r.description, METHOD_LABEL[r.payment_method] ?? r.payment_method, r.author ?? "", Number(r.amount_cents)]),
    totals: [
      ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, cents]) => ({ label: `Subtotal ${label}`, cents })),
      { label: "Total del período", cents: rows.reduce((s, r) => s + Number(r.amount_cents), 0) },
    ],
  };
  const body = format === "pdf" ? toPdf(report) : await toXlsx(report);
  return fileResponse(body, `gastos-${fileSlug(t.balnearioName)}-${from}-a-${to}`, format);
}