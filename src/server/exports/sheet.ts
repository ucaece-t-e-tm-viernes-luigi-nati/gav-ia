import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatMoney } from "@/lib/money";

export type Column = { header: string; kind?: "text" | "money"; width?: number };
export type Report = {
  title: string;
  /** Nombre de la hoja de Excel (por defecto, el título). */
  sheet?: string;
  subtitle: string;
  columns: Column[];
  /** Importes en centavos en las columnas "money". */
  rows: (string | number)[][];
  totals: { label: string; cents: number }[];
};

/**
 * Planilla Excel con importes numéricos (se pueden sumar y filtrar en Excel).
 * Con varios reportes, cada uno va en su propia hoja del mismo archivo.
 */
export async function toXlsx(input: Report | Report[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GavIA";
  const used = new Set<string>();
  for (const r of Array.isArray(input) ? input : [input]) {
    // Excel no admite * ? : \ / [ ] en el nombre de la hoja (máx. 31 caracteres) y no repite nombres.
    let name = (r.sheet ?? r.title).replace(/[*?:\\/[\]]/g, "").slice(0, 31).trim() || "Hoja";
    while (used.has(name)) name = `${name.slice(0, 28)} ${used.size + 1}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([r.title]).font = { bold: true, size: 14 };
    ws.addRow([r.subtitle]).font = { color: { argb: "FF5B6B7A" } };
    ws.addRow([]);
    const header = ws.addRow(r.columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B5D" } }));
    for (const row of r.rows) {
      ws.addRow(row.map((v, i) => (r.columns[i]?.kind === "money" ? Number(v) / 100 : v)));
    }
    ws.addRow([]);
    for (const t of r.totals) {
      const row = ws.addRow([t.label, ...Array(Math.max(0, r.columns.length - 2)).fill(""), t.cents / 100]);
      row.font = { bold: true };
      row.getCell(Math.max(2, r.columns.length)).numFmt = '"$" #,##0.00';
    }
    r.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width ?? (c.kind === "money" ? 16 : 22);
      if (c.kind === "money") col.numFmt = '"$" #,##0.00';
    });
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Las fuentes estándar de PDF no incluyen los espacios finos de Intl ni el signo menos tipográfico: se normalizan.
const pdfText = (s: string) => s.replace(/[  ]/g, " ").replace(/−/g, "-");

/** PDF con una o varias secciones (una tabla por reporte, en el mismo archivo). */
export function toPdf(input: Report | Report[]): Buffer {
  const reports = Array.isArray(input) ? input : [input];
  const wide = reports.some((r) => r.columns.length > 6);
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  let y = 44;
  reports.forEach((r, idx) => {
    if (idx > 0) {
      y += 28;
      if (y > doc.internal.pageSize.getHeight() - 120) {
        doc.addPage();
        y = 44;
      }
    }
    doc.setFontSize(idx === 0 ? 15 : 12);
    doc.setTextColor(18, 59, 93);
    doc.text(pdfText(r.title), 40, y);
    doc.setFontSize(9);
    doc.setTextColor(91, 107, 122);
    doc.text(pdfText(r.subtitle), 40, y + 16);
    const moneyCols = r.columns.map((c, i) => (c.kind === "money" ? i : -1)).filter((i) => i >= 0);
    autoTable(doc, {
      startY: y + 28,
      head: [r.columns.map((c) => pdfText(c.header))],
      body: r.rows.map((row) => row.map((v, i) => pdfText(r.columns[i]?.kind === "money" ? formatMoney(Number(v)) : String(v ?? "")))),
      foot: r.totals.map((t) => [pdfText(t.label), ...Array(Math.max(0, r.columns.length - 2)).fill(""), pdfText(formatMoney(t.cents))]),
      showFoot: "lastPage",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [18, 59, 93] },
      footStyles: { fillColor: [235, 244, 250], textColor: [18, 59, 93] },
      columnStyles: Object.fromEntries([...moneyCols, r.columns.length - 1].map((i) => [i, { halign: "right" as const }])),
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`GavIA · página ${i} de ${pages}`, 40, doc.internal.pageSize.getHeight() - 20);
  }
  return Buffer.from(doc.output("arraybuffer"));
}
export function fileResponse(body: Buffer, filename: string, format: "xlsx" | "pdf") {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
