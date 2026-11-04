/**
 * One timetable cache for the plugins that reason about lessons (Change Alert,
 * Lesson Notes, Class Mode, Crunch Radar). Days are fetched in ranges and kept
 * per date: past days for a day, today/future for 30 minutes.
 */
import { getUserInfo } from "@/seqta/utils/userInfo";
import { addDays, ymd } from "./dates";

export type TimetableLesson = {
  date: string;
  /** 24h HH:MM */
  from: string;
  until: string;
  code: string;
  description: string;
  staff: string;
  staffID: number | null;
  room: string;
  period: string;
  type: string;
  programmeID: number;
  metaID: number;
  assessments: { id: number; title: string }[];
};

type Entry = { at: number; lessons: TimetableLesson[] };

const FRESH_MS = 30 * 60_000;
const PAST_MS = 24 * 60 * 60_000;
const days = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();

function normalise(raw: Record<string, unknown>): TimetableLesson {
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const assessments = Array.isArray(raw.assessments)
    ? (raw.assessments as Record<string, unknown>[]).map((a) => ({
        id: Number(a.id),
        title: str(a.title),
      }))
    : [];
  return {
    date: str(raw.date).slice(0, 10),
    from: str(raw.from).slice(0, 5),
    until: str(raw.until).slice(0, 5),
    code: str(raw.code),
    description: str(raw.description),
    staff: str(raw.staff),
    staffID: raw.staffID == null ? null : Number(raw.staffID),
    room: str(raw.room),
    period: str(raw.period),
    type: str(raw.type),
    programmeID: Number(raw.programmeID ?? 0),
    metaID: Number(raw.metaID ?? 0),
    assessments,
  };
}

function isFresh(date: string): boolean {
  const e = days.get(date);
  if (!e) return false;
  const ttl = date < ymd() ? PAST_MS : FRESH_MS;
  return Date.now() - e.at < ttl;
}

async function fetchRange(from: string, until: string): Promise<void> {
  const { id: student } = await getUserInfo();
  const res = await fetch(`${location.origin}/seqta/student/load/timetable?`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ from, until, student }),
  });
  if (!res.ok) throw new Error(`timetable ${res.status}`);
  const json = await res.json();
  const items = ((json?.payload?.items ?? []) as Record<string, unknown>[]).map(normalise);
  const at = Date.now();
  // Mark every day in the range (empty days too, so weekends aren't refetched).
  for (let d = from; d <= until; d = addDays(d, 1)) days.set(d, { at, lessons: [] });
  for (const l of items) days.get(l.date)?.lessons.push(l);
  for (let d = from; d <= until; d = addDays(d, 1)) {
    days.get(d)!.lessons.sort((a, b) => a.from.localeCompare(b.from));
  }
}

/** Lessons for every date in [from, until], fetching only what's stale. */
export async function getLessons(from: string, until: string): Promise<TimetableLesson[]> {
  let start: string | null = null;
  let end: string | null = null;
  for (let d = from; d <= until; d = addDays(d, 1)) {
    if (!isFresh(d)) {
      start ??= d;
      end = d;
    }
  }
  if (start && end) {
    const key = `${start}..${end}`;
    let p = inflight.get(key);
    if (!p) {
      p = fetchRange(start, end).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    await p;
  }
  const out: TimetableLesson[] = [];
  for (let d = from; d <= until; d = addDays(d, 1)) out.push(...(days.get(d)?.lessons ?? []));
  return out;
}

export async function getDay(date: string): Promise<TimetableLesson[]> {
  return getLessons(date, date);
}

/** Real classes only: skips home group / tutorials (no programme). */
export function isRealClass(l: TimetableLesson): boolean {
  return l.type === "class" && l.programmeID !== 0;
}

let coloursPromise: Promise<Map<string, string>> | null = null;

/** Subject code -> colour from the user's SEQTA prefs (cached for the page). */
export function getSubjectColours(): Promise<Map<string, string>> {
  coloursPromise ??= (async () => {
    const { id: user } = await getUserInfo();
    const res = await fetch(`${location.origin}/seqta/student/load/prefs?`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ request: "userPrefs", asArray: true, user }),
    });
    const json = await res.json();
    const map = new Map<string, string>();
    for (const p of (json?.payload ?? []) as { name: string; value: string }[]) {
      const m = /^timetable\.subject\.colour\.(.+)$/.exec(p.name);
      if (m) map.set(m[1], p.value);
    }
    return map;
  })().catch((e) => {
    coloursPromise = null;
    throw e;
  });
  return coloursPromise;
}
