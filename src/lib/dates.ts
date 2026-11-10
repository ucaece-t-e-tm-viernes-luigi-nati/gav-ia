export const TZ = "America/Argentina/Buenos_Aires";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha de hoy (YYYY-MM-DD) en hora argentina. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function isISODate(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
}

export function startOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(last)}`;
}

export function addMonths(iso: string, n: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de la fecha dada. */
export function startOfWeek(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) {
  if (!value) return "—";
  const iso = value instanceof Date ? value.toISOString() : value;
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("es-AR", { timeZone: iso.length === 10 ? "UTC" : TZ, ...opts }).format(d);
}

export function formatDateLong(iso: string) {
  return formatDate(iso, { weekday: "long", day: "numeric", month: "long" });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Fecha local (YYYY-MM-DD) de un timestamp ISO, en hora argentina. */
export function localDateOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function monthLabel(iso: string) {
  const s = formatDate(iso, { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convierte fecha + hora locales argentinas a ISO UTC (Argentina no usa horario de verano: UTC-3). */
export function localToISO(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}

/** Próxima fecha de vencimiento: el día de pago del mes siguiente al vencimiento anterior. */
export function nextDueAfter(previousDueKey: string, billingDay: number) {
  const [y, m] = previousDueKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, Math.min(Math.max(billingDay, 1), 28)));
  return date.toISOString().slice(0, 10);
}
