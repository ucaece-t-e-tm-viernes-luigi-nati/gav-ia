import type { NextRequest } from "next/server";
import { tenantForRead } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { listPayments } from "@/server/repos/exports";
import { fileResponse, toPdf, toXlsx } from "@/server/exports/sheet";
import { formatDate, formatDateTime, isISODate } from "@/lib/dates";
import { METHOD_LABEL } from "@/features/reservas/labels";
import { fileSlug } from "@/server/exports/names";

/** Exporta los cobros del período (solo el dueño, con el módulo de pagos). */
export async function GET(request: NextRequest) {
  const t = await tenantForRead(["owner"]);
  if (!t || t.role !== "owner") return new Response("No encontrado", { status: 404 });
  if (!hasModule(t.modules, "pagos")) return new Response("Módulo no incluido en el plan", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const format = sp.get("formato") === "pdf" ? "pdf" : "xlsx";
  const from = sp.get("desde") ?? "";
  const to = sp.get("hasta") ?? "";
  if (!isISODate(from) || !isISODate(to) || to < from) return new Response("Rango de fechas inválido", { status: 400 });
  const method = sp.get("medio") || null;
  const invoiced = sp.get("facturado") === "si" ? "si" : sp.get("facturado") === "no" ? "no" : null;
  const rows = await asUser(t.viewer.id, (db) => listPayments(db, t.balnearioId, { from, to, method, invoiced }));
  const ok = rows.filter((p) => p.status === "aprobado");
  const sum = (xs: typeof rows) => xs.reduce((s, p) => s + Number(p.amount_cents), 0);
  const filters = [method ? `medio ${METHOD_LABEL[method] ?? method}` : "", invoiced ? (invoiced === "si" ? "solo facturados" : "solo sin facturar") : ""].filter(Boolean).join(" · ");
  const report = {
    title: `Cobros · ${t.balnearioName}`,
    subtitle: `Del ${formatDate(from)} al ${formatDate(to)}${filters ? ` · ${filters}` : ""} · ${rows.length} movimientos`,
    columns: [
      { header: "Fecha", width: 18 }, { header: "Reserva", width: 10 }, { header: "Cliente", width: 26 }, { header: "Medio", width: 16 },
      { header: "Estado", width: 12 }, { header: "Facturado", width: 11 }, { header: "Comprobante", width: 16 }, { header: "Importe", kind: "money" as const },
    ],
    rows: rows.map((p) => [
      formatDateTime(p.paid_at), `#${p.number}`, p.customer, METHOD_LABEL[p.method] ?? p.method,
      p.status === "anulado" ? "Anulado" : "Aprobado", p.invoiced ? "Sí" : "No", p.invoice_ref, Number(p.amount_cents),
    ]),
    totals: [
      { label: "Total cobrado (aprobados)", cents: sum(ok) },
      { label: "Facturado", cents: sum(ok.filter((p) => p.invoiced)) },
      { label: "Sin facturar", cents: sum(ok.filter((p) => !p.invoiced)) },
    ],
  };
  const body = format === "pdf" ? toPdf(report) : await toXlsx(report);
  return fileResponse(body, `cobros-${fileSlug(t.balnearioName)}-${from}-a-${to}`, format);
}