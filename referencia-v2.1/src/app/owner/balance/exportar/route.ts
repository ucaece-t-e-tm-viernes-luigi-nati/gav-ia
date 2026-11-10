import type { NextRequest } from "next/server";
import { tenantForAction } from "@/server/auth/context";
import { hasModule } from "@/lib/plan";
import { asUser } from "@/server/db";
import { listExpenses, listPayments, listSales } from "@/server/repos/exports";
import { fileResponse, toPdf, toXlsx, type Report } from "@/server/exports/sheet";
import { fileSlug } from "@/server/exports/names";
import { formatDate, formatDateTime, isISODate } from "@/lib/dates";
import { METHOD_LABEL } from "@/features/reservas/labels";

/**
 * Ingresos y gastos del período en un mismo archivo (Excel: una hoja por sección; PDF: secciones).
 * Solo el dueño. Ingresos = cobros aprobados (plan con pagos) o reservas del período (sin ese módulo).
 */
export async function GET(request: NextRequest) {
  const t = await tenantForAction(["owner"]);
  if (!t || t.role !== "owner") return new Response("No autorizado", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const format = sp.get("formato") === "pdf" ? "pdf" : "xlsx";
  const from = sp.get("desde") ?? "";
  const to = sp.get("hasta") ?? "";
  if (!isISODate(from) || !isISODate(to) || to < from) return new Response("Rango de fechas inválido", { status: 400 });
  const cobros = hasModule(t.modules, "pagos");
  const d = await asUser(t.viewer.id, async (db) => ({
    payments: cobros ? (await listPayments(db, t.balnearioId, { from, to })).filter((p) => p.status === "aprobado") : [],
    sales: cobros ? [] : await listSales(db, t.balnearioId, { from, to }),
    expenses: await listExpenses(db, t.balnearioId, { from, to }),
  }));
  const income = cobros ? d.payments.reduce((s, p) => s + Number(p.amount_cents), 0) : d.sales.reduce((s, r) => s + Number(r.total_cents), 0);
  const expense = d.expenses.reduce((s, e) => s + Number(e.amount_cents), 0);
  const range = `Del ${formatDate(from)} al ${formatDate(to)}`;
  const byCategory = new Map<string, number>();
  for (const e of d.expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount_cents));

  const summary: Report = {
    sheet: "Resumen",
    title: `Ingresos y gastos · ${t.balnearioName}`,
    subtitle: `${range} · ingresos: ${cobros ? "cobros aprobados por fecha de cobro" : "reservas por fecha de inicio"}`,
    columns: [{ header: "Concepto", width: 34 }, { header: "Importe", kind: "money" }],
    rows: [
      [cobros ? "Ingresos (cobros)" : "Ingresos (reservas)", income],
      ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [`Gastos · ${k}`, v] as (string | number)[]),
      ["Gastos totales", expense],
    ],
    totals: [{ label: "Resultado (ingresos − gastos)", cents: income - expense }],
  };
  const incomeReport: Report = cobros
    ? {
        sheet: "Ingresos",
        title: "Ingresos (cobros)",
        subtitle: `${range} · ${d.payments.length} cobros`,
        columns: [{ header: "Fecha", width: 18 }, { header: "Reserva", width: 10 }, { header: "Cliente", width: 30 }, { header: "Medio", width: 16 }, { header: "Facturado", width: 11 }, { header: "Importe", kind: "money" }],
        rows: d.payments.map((p) => [formatDateTime(p.paid_at), `#${p.number}`, p.customer, METHOD_LABEL[p.method] ?? p.method, p.invoiced ? "Sí" : "No", Number(p.amount_cents)]),
        totals: [{ label: "Total ingresos", cents: income }],
      }
    : {
        sheet: "Ingresos",
        title: "Ingresos (reservas)",
        subtitle: `${range} · ${d.sales.length} reservas`,
        columns: [{ header: "Desde", width: 12 }, { header: "Hasta", width: 12 }, { header: "Reserva", width: 10 }, { header: "Cliente", width: 30 }, { header: "Unidades", width: 20 }, { header: "Importe", kind: "money" }],
        rows: d.sales.map((r) => [formatDate(r.start_date), formatDate(r.end_date), `#${r.number}`, r.customer, r.units, Number(r.total_cents)]),
        totals: [{ label: "Total ingresos", cents: income }],
      };
  const expenseReport: Report = {
    sheet: "Gastos",
    title: "Gastos",
    subtitle: `${range} · ${d.expenses.length} gastos`,
    columns: [{ header: "Fecha", width: 12 }, { header: "Categoría", width: 18 }, { header: "Empleado", width: 22 }, { header: "Descripción", width: 36 }, { header: "Medio", width: 14 }, { header: "Importe", kind: "money" }],
    rows: d.expenses.map((e) => [formatDate(e.spent_on), e.category, e.employee ?? "", e.description, METHOD_LABEL[e.payment_method] ?? e.payment_method, Number(e.amount_cents)]),
    totals: [{ label: "Total gastos", cents: expense }],
  };
  const reports = [summary, incomeReport, expenseReport];
  const body = format === "pdf" ? toPdf(reports) : await toXlsx(reports);
  return fileResponse(body, `ingresos-y-gastos-${fileSlug(t.balnearioName)}-${from}-a-${to}`, format);
}