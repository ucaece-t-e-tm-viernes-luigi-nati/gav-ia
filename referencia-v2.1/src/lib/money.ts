/**
 * Los importes se manejan siempre como enteros en centavos.
 * Nunca se opera con decimales de punto flotante.
 */
const formatters = {
  ARS: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  USD: new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }),
};

/** Pesos por defecto; los planes y la facturación de GAVIA se expresan en dólares. */
export function formatMoney(cents: number | null | undefined, currency: string = "ARS"): string {
  return (formatters[currency as keyof typeof formatters] ?? formatters.ARS).format((cents ?? 0) / 100);
}

/** Divide un importe en cuotas sin perder centavos (la última absorbe la diferencia). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCents - base * (n - 1) : base));
}

/**
 * Convierte un texto ingresado en formato argentino ("12.500,50", "12500", "12500.5")
 * a centavos. Devuelve null si no es un importe válido.
 */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/\s|\$/g, "");
  if (!s) return null;
  let intPart: string;
  let decPart = "";
  if (s.includes(",")) {
    [intPart, decPart = ""] = s.split(",");
    intPart = intPart.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [intPart, decPart] = s.split(".");
  } else {
    intPart = s.replace(/\./g, "");
  }
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Texto editable en formato argentino a partir de centavos ("12500,50"). */
export function centsToInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const dec = Math.abs(cents % 100);
  return dec ? `${whole},${String(dec).padStart(2, "0")}` : String(whole);
}
