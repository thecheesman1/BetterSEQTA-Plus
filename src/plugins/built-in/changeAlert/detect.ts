import type { TimetableLesson } from "@/plugins/shared/timetableCache";

export type LessonChange = {
  kind: "room" | "staff" | "swap";
  usual: string;
  now: string;
};

/** Most common value with at least `min` votes, else null (not enough evidence). */
function majority<T>(values: T[], min: number): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return bestN >= min ? best : null;
}

/**
 * Compare a lesson with the same slot (same start time) on previous weeks.
 * `history` = that weekday's lessons for each earlier week (any order).
 * The timetable repeats weekly, so the majority across past weeks is "usual";
 * one odd week (excursion, relief) can't poison it, and a change that holds
 * for two weeks quietly becomes the new normal.
 */
export function detectChanges(
  lesson: TimetableLesson,
  history: TimetableLesson[][],
): LessonChange[] {
  const matches = history
    .map((day) => day.find((l) => l.from === lesson.from))
    .filter((l): l is TimetableLesson => !!l);
  if (matches.length < 2) return [];

  const usualCode = majority(
    matches.map((m) => m.code),
    2,
  );
  if (usualCode && usualCode !== lesson.code) {
    const usual = matches.find((m) => m.code === usualCode)!;
    return [{ kind: "swap", usual: usual.description || usual.code, now: lesson.description }];
  }

  // Only compare against weeks where this slot was the same class.
  const same = matches.filter((m) => m.code === lesson.code);
  const out: LessonChange[] = [];

  const usualRoom = majority(same.map((m) => m.room).filter(Boolean), 2);
  if (usualRoom && lesson.room && usualRoom !== lesson.room) {
    out.push({ kind: "room", usual: usualRoom, now: lesson.room });
  }

  const usualStaffId = majority(
    same.map((m) => m.staffID).filter((id): id is number => id != null),
    2,
  );
  if (usualStaffId != null && lesson.staffID != null && usualStaffId !== lesson.staffID) {
    const usualName = same.find((m) => m.staffID === usualStaffId)?.staff ?? "";
    out.push({ kind: "staff", usual: usualName, now: lesson.staff });
  }
  return out;
}

export function describeChange(c: LessonChange): { icon: string; short: string; long: string } {
  switch (c.kind) {
    case "room":
      return { icon: "🚪", short: `moved to ${c.now}`, long: `Room change: ${c.usual} → ${c.now}` };
    case "staff":
      return {
        icon: "👤",
        short: `relief: ${c.now}`,
        long: `Relief teacher: ${c.now} (usually ${c.usual})`,
      };
    case "swap":
      return {
        icon: "🔀",
        short: `swapped (usually ${c.usual})`,
        long: `Usually ${c.usual} in this slot`,
      };
  }
}
