import { addDays, localToISO, todayISO } from "./dates";

/** Agenda de demos: turnos de 30 minutos de 09:00 a 17:00 (hora argentina), de lunes a viernes. */
export const DEMO_SLOT_MINUTES = 30;
export const DEMO_DAY_START = "09:00";
export const DEMO_DAY_END = "17:00";
export const DEMO_MIN_NOTICE_HOURS = 24;
export const DEMO_DAYS_AHEAD = 21;

const pad = (n: number) => String(n).padStart(2, "0");

export function slotTimes(): string[] {
  const [sh, sm] = DEMO_DAY_START.split(":").map(Number);
  const [eh, em] = DEMO_DAY_END.split(":").map(Number);
  const out: string[] = [];
  for (let m = sh * 60 + sm; m + DEMO_SLOT_MINUTES <= eh * 60 + em; m += DEMO_SLOT_MINUTES) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

function isWeekday(iso: string) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/** Turnos ofrecidos (ISO UTC) desde ahora + 24 h, agrupados por día. */
export function upcomingSlots(now = new Date()): { date: string; slots: string[] }[] {
  const minStart = now.getTime() + DEMO_MIN_NOTICE_HOURS * 3600_000;
  const days: { date: string; slots: string[] }[] = [];
  const today = todayISO();
  for (let i = 0; i <= DEMO_DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    if (!isWeekday(date)) continue;
    const slots = slotTimes().map((t) => localToISO(date, t)).filter((iso) => Date.parse(iso) >= minStart);
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

export function isValidSlot(iso: string, now = new Date()): boolean {
  return upcomingSlots(now).some((d) => d.slots.includes(new Date(iso).toISOString()));
}
