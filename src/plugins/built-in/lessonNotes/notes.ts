import { lessonKey } from "@/plugins/shared/dates";

export type LessonNote = {
  id: string;
  code: string;
  subject: string;
  /** The lesson occurrence it was written for. */
  date: string;
  from: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
};

const PRUNE_DONE_MS = 30 * 24 * 60 * 60_000;

/**
 * Notes to show on a lesson occurrence:
 * - `carried`: open notes for this subject written for an EARLIER lesson
 *   ("last time: bring USB"), oldest first
 * - `own`: notes written for this exact lesson
 */
export function notesForLesson(
  notes: LessonNote[],
  code: string,
  date: string,
  from: string,
): { carried: LessonNote[]; own: LessonNote[] } {
  const key = lessonKey(date, from);
  const mine = notes.filter((n) => n.code === code);
  return {
    carried: mine
      .filter((n) => !n.done && lessonKey(n.date, n.from) < key)
      .sort((a, b) => a.createdAt - b.createdAt),
    own: mine.filter((n) => lessonKey(n.date, n.from) === key),
  };
}

/**
 * Start time of the block a lesson belongs to: back-to-back periods of the same
 * subject (doubles, even across recess) count as ONE lesson. Notes are keyed by
 * block, so a note written in period 1 of a double isn't "last time" in period 2.
 * `day` = that date's lessons, any order.
 */
export function blockStart(
  day: { code: string; from: string }[],
  code: string,
  from: string,
): string {
  const sorted = [...day].sort((a, b) => a.from.localeCompare(b.from));
  let i = sorted.findIndex((l) => l.code === code && l.from.slice(0, 5) === from.slice(0, 5));
  if (i < 0) return from.slice(0, 5);
  while (i > 0 && sorted[i - 1].code === code) i--;
  return sorted[i].from.slice(0, 5);
}

export function pruneNotes(notes: LessonNote[], now = Date.now()): LessonNote[] {
  return notes.filter((n) => !n.done || now - (n.doneAt ?? n.createdAt) < PRUNE_DONE_MS);
}

export function newNoteId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
