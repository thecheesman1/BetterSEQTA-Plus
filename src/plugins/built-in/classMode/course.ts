/**
 * Find the content for one lesson occurrence in a `load/courses` payload.
 *
 *   d[k].l[j] = scheduled occurrence j of week k: { d: date, s: start, e: end, p: period }
 *   w[k]      = that week's lessons; lesson.n = the occurrence index it belongs to
 *
 * Counts don't always match (teachers leave slots empty or add extra lessons),
 * so pair by `n`, exactly like SEQTA's own course page does.
 */

export type CourseLesson = {
  t?: string;
  n?: number;
  i?: number;
  h?: string;
  document?: { contents?: string };
};

export type CoursePayload = {
  t?: string;
  d?: { t?: number; w?: number; l?: { d: string; s: string; e: string; p: string }[] }[];
  w?: (CourseLesson | null)[][];
};

export type LessonMatch = {
  lesson: CourseLesson | null;
  term: number | null;
  week: number | null;
  period: string;
  /** True when this slot said "See previous lesson" and we followed it back. */
  continued: boolean;
};

const SEE_PREVIOUS = /^\s*see previous/i;

export function findLesson(course: CoursePayload, date: string, from: string): LessonMatch | null {
  const days = course.d ?? [];
  for (let k = 0; k < days.length; k++) {
    const slots = days[k]?.l ?? [];
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j];
      if (slot.d !== date || slot.s.slice(0, 5) !== from.slice(0, 5)) continue;
      const week = (course.w?.[k] ?? []).filter((x): x is CourseLesson => !!x);
      const at = (n: number) => week.find((x) => x.n === n) ?? null;
      let lesson = at(j);
      let continued = false;
      // Double periods: the second slot often just says "See previous lesson".
      for (let back = j - 1; lesson && SEE_PREVIOUS.test(lesson.t ?? "") && back >= 0; back--) {
        const prev = at(back);
        if (!prev) break;
        lesson = prev;
        continued = true;
      }
      return {
        lesson,
        term: days[k]?.t ?? null,
        week: days[k]?.w ?? null,
        period: slot.p,
        continued,
      };
    }
  }
  return null;
}

export type LessonContent = { html: string[]; resources: string[] };

/** Walk SEQTA's lesson document modules: HTML strings + resource names. */
export function lessonContent(lesson: CourseLesson | null): LessonContent {
  const out: LessonContent = { html: [], resources: [] };
  if (!lesson) return out;
  if (lesson.h && lesson.h.trim()) out.html.push(lesson.h);
  let doc: { document?: { modules?: { content?: { value?: unknown } }[] } } | null = null;
  try {
    doc = JSON.parse(lesson.document?.contents ?? "null");
  } catch {
    return out;
  }
  for (const m of doc?.document?.modules ?? []) {
    const v = m?.content?.value;
    if (typeof v === "string" && v.trim()) out.html.push(v);
    else if (
      v &&
      typeof v === "object" &&
      Array.isArray((v as { resources?: unknown }).resources)
    ) {
      for (const r of (v as { resources: Record<string, unknown>[] }).resources) {
        const name = r?.name ?? r?.filename ?? r?.title;
        if (name) out.resources.push(String(name));
      }
    }
  }
  return out;
}
