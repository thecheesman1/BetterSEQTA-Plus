/** Local-date helpers shared by the timetable-aware plugins. Dates are YYYY-MM-DD. */

export function ymd(d: Date = new Date()): string {
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function isWeekend(s: string): boolean {
  const day = parseYmd(s).getDay();
  return day === 0 || day === 6;
}

/** "08:45" / "08:45:00" -> minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Key for one lesson occurrence: date + 24h start. */
export function lessonKey(date: string, from: string): string {
  return `${date}@${from.slice(0, 5)}`;
}
