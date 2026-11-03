/** Pure formatting helpers for the Ask SEQTA context (unit tested). */

export type ContextLesson = {
  date: string;
  from: string;
  until: string;
  name: string;
  room?: string;
  staff?: string;
};

export type MergedLesson = ContextLesson & { periods: number };

/**
 * Merges back-to-back periods of the same class (same day, name, room and
 * teacher, next one starting exactly when the last ends) into one block.
 * The model kept mangling e.g. three consecutive House Group periods.
 */
export function mergeConsecutiveLessons(lessons: ContextLesson[]): MergedLesson[] {
  const sorted = [...lessons].sort((a, b) =>
    `${a.date}${a.from}`.localeCompare(`${b.date}${b.from}`),
  );
  const out: MergedLesson[] = [];
  for (const l of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.date === l.date &&
      prev.name === l.name &&
      (prev.room ?? "") === (l.room ?? "") &&
      (prev.staff ?? "") === (l.staff ?? "") &&
      prev.until.slice(0, 5) === l.from.slice(0, 5)
    ) {
      prev.until = l.until;
      prev.periods++;
    } else {
      out.push({ ...l, periods: 1 });
    }
  }
  return out;
}

/** "due TODAY", "due tomorrow", "due in 3 days", "3 days overdue". */
export function relativeDue(dueYmd: string, now: Date): string {
  const [y, m, d] = dueYmd.slice(0, 10).split("-").map(Number);
  const due = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "due TODAY";
  if (days === 1) return "due tomorrow";
  if (days > 1) return `due in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${-days} days overdue`;
}
