import { addDays, isWeekend, parseYmd } from "@/plugins/shared/dates";

export type RadarItem = {
  id: number;
  title: string;
  subject: string;
  code: string;
  due: string; // YYYY-MM-DD
  programmeID: number;
  metaclassID: number;
  /** Percent weight if known (Assessments Average data), else null. */
  weight: number | null;
  inClass: boolean;
};

export type RadarDay = {
  date: string;
  items: RadarItem[];
  load: number;
  /** Something due on the weekend got folded into this Friday. */
  weekend: boolean;
};

export type RadarWeek = { days: RadarDay[]; load: number; crunch: boolean };

/** How heavy one item is. 10% weight = 1 unit; unknown weight = 1 (summatives 2). */
export function itemLoad(item: RadarItem): number {
  if (item.weight != null && item.weight > 0) return Math.max(0.5, item.weight / 10);
  return /summative/i.test(item.title) ? 2 : 1;
}

/** Weekend dates fold back onto the Friday before them. */
function schoolDay(date: string): { date: string; weekend: boolean } {
  if (!isWeekend(date)) return { date, weekend: false };
  const back = parseYmd(date).getDay() === 6 ? -1 : -2;
  return { date: addDays(date, back), weekend: true };
}

/**
 * Build the radar: weekdays from `today` covering `calendarDays`, grouped into
 * Mon–Fri weeks. Past-due items are dropped (SEQTA's "upcoming" keeps them).
 */
export function buildRadar(
  items: RadarItem[],
  today: string,
  calendarDays: number,
  crunchThreshold: number,
): RadarWeek[] {
  const end = addDays(today, calendarDays - 1);
  const days = new Map<string, RadarDay>();
  for (let d = today; d <= end; d = addDays(d, 1)) {
    if (!isWeekend(d)) days.set(d, { date: d, items: [], load: 0, weekend: false });
  }

  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item.id) || item.due < today) continue;
    seen.add(item.id);
    const slot = schoolDay(item.due);
    const day = days.get(slot.date);
    if (!day) continue;
    day.items.push(item);
    day.load += itemLoad(item);
    day.weekend ||= slot.weekend;
  }

  const weeks: RadarWeek[] = [];
  let current: RadarWeek | null = null;
  for (const day of days.values()) {
    if (!current || parseYmd(day.date).getDay() === 1) {
      current = { days: [], load: 0, crunch: false };
      weeks.push(current);
    }
    current.days.push(day);
    current.load += day.load;
  }
  for (const w of weeks) w.crunch = w.load >= crunchThreshold;
  return weeks;
}
