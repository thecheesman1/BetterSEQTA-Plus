/** Pure "where am I in the school day" logic for the lesson countdown chip. */

export type CountdownLesson = {
  /** "HH:MM" or "HH:MM:SS", local time, as SEQTA returns it. */
  from: string;
  until: string;
  description: string;
  room?: string;
  staff?: string;
  /** CSS colour for the subject, if known. */
  colour?: string;
};

export type LessonStatus =
  | {
      kind: "in-lesson";
      lesson: CountdownLesson;
      endsInMs: number;
      /** 0..1 through the lesson. */
      progress: number;
      next?: CountdownLesson;
    }
  | { kind: "between"; next: CountdownLesson; startsInMs: number }
  | { kind: "done" };

/** Milliseconds since local midnight for "HH:MM[:SS]". */
export function timeOfDayMs(hhmm: string): number {
  const [h = 0, m = 0, s = 0] = hhmm.split(":").map(Number);
  return ((h * 60 + m) * 60 + s) * 1000;
}

function msSinceMidnight(now: Date): number {
  return (
    ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 +
    now.getMilliseconds()
  );
}

export function getLessonStatus(lessons: CountdownLesson[], now: Date): LessonStatus {
  const t = msSinceMidnight(now);
  const sorted = [...lessons].sort((a, b) => timeOfDayMs(a.from) - timeOfDayMs(b.from));

  // If lessons overlap (SEQTA does this for split classes), prefer the one
  // that ends soonest: that's the one the bell is about to ring for.
  const current = sorted
    .filter((l) => timeOfDayMs(l.from) <= t && t < timeOfDayMs(l.until))
    .sort((a, b) => timeOfDayMs(a.until) - timeOfDayMs(b.until))[0];

  if (current) {
    const start = timeOfDayMs(current.from);
    const end = timeOfDayMs(current.until);
    const next = sorted.find((l) => timeOfDayMs(l.from) >= end);
    return {
      kind: "in-lesson",
      lesson: current,
      endsInMs: end - t,
      progress: end > start ? (t - start) / (end - start) : 1,
      next,
    };
  }

  const next = sorted.find((l) => timeOfDayMs(l.from) > t);
  if (next) return { kind: "between", next, startsInMs: timeOfDayMs(next.from) - t };
  return { kind: "done" };
}

/** "45s", "7 min", "1h 05m". Rounds minutes up so "0 min" never shows. */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.ceil(ms / 1000))}s`;
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
