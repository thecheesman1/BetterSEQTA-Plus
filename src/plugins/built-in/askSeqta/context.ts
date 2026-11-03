import browser from "@/lib/browser";
import { getUserInfo } from "@/seqta/utils/userInfo";
import { mergeConsecutiveLessons, relativeDue, type ContextLesson } from "./format";

/** Plain-text snapshot of the student's SEQTA data for the model to answer from. */

const CACHE_MS = 5 * 60_000;
const MESSAGE_LIST = 25;
const MESSAGE_BODIES = 8;
const BODY_CHARS = 1500;
const GRADES = 60;
const NOTICE_CHARS = 600;
const SUBMISSION_LOOKUPS = 20;
const WEIGHTINGS_KEY = "plugin.assessments-average.storage.weightings";
const OVERRIDES_KEY = "plugin.assessments-average.storage.weightingOverrides";

let cached: { at: number; text: string } | null = null;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(ymdStr: string): string {
  return new Date(`${ymdStr.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${location.origin}/seqta/student/${path}?`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  }).then((r) => r.json() as Promise<T>);
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((n) => n.remove());
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

// ---- timetable ------------------------------------------------------------

type RawLesson = {
  date: string;
  from: string;
  until: string;
  description?: string;
  type?: string;
  room?: string;
  staff?: string;
};

async function timetableSection(student: number): Promise<string> {
  const from = new Date();
  const until = new Date();
  until.setDate(until.getDate() + 7);
  const res = await post<{ payload?: { items?: RawLesson[] } }>("load/timetable", {
    from: ymd(from),
    until: ymd(until),
    student,
  });
  const lessons: ContextLesson[] = (res.payload?.items ?? []).map((l) => ({
    date: l.date,
    from: l.from,
    until: l.until,
    name: l.description || (l.type === "tutorial" ? "Tutorial" : "Lesson"),
    room: l.room,
    staff: l.staff,
  }));
  if (!lessons.length) return "## Timetable (next 7 days)\nNo lessons.";

  const lines: string[] = [];
  let day = "";
  for (const l of mergeConsecutiveLessons(lessons)) {
    if (l.date !== day) {
      day = l.date;
      lines.push(`\n${dayLabel(l.date)}:`);
    }
    lines.push(
      `- ${l.from.slice(0, 5)}–${l.until.slice(0, 5)} ${l.name}${l.periods > 1 ? ` (${l.periods} periods back to back)` : ""}${l.room ? `, room ${l.room}` : ""}${l.staff ? `, ${l.staff}` : ""}`,
    );
  }
  return `## Timetable (next 7 days; back-to-back periods of the same class are already merged)${lines.join("\n")}`;
}

// ---- assessments ------------------------------------------------------------

type Upcoming = {
  id: number;
  title: string;
  subject: string;
  due: string;
  metaclassID: number;
  status?: string;
  overdue?: boolean;
  graded?: boolean;
};

async function weightLookup(): Promise<(id: number) => string | null> {
  try {
    const got = await browser.storage.local.get([WEIGHTINGS_KEY, OVERRIDES_KEY]);
    const weights = (got[WEIGHTINGS_KEY] ?? {}) as Record<string, { weight?: string }>;
    const overrides = (got[OVERRIDES_KEY] ?? {}) as Record<string, string>;
    return (id) => {
      const w = overrides[String(id)] ?? weights[String(id)]?.weight;
      return w && Number.parseFloat(w) > 0 ? `${Number.parseFloat(w)}%` : null;
    };
  } catch {
    return () => null;
  }
}

/** true = something's been submitted, false = nothing yet, null = couldn't check. */
async function isSubmitted(a: Upcoming, student: number): Promise<boolean | null> {
  try {
    const res = await post<{ payload?: unknown[] }>("assessment/submissions/get", {
      assessment: a.id,
      metaclass: a.metaclassID,
      student,
    });
    return Array.isArray(res.payload) ? res.payload.length > 0 : null;
  } catch {
    return null;
  }
}

async function upcomingSection(student: number): Promise<string> {
  const [res, weightOf] = await Promise.all([
    post<{ payload?: Upcoming[] }>("assessment/list/upcoming", { student }),
    weightLookup(),
  ]);
  const items = [...(res.payload ?? [])].sort((a, b) => a.due.localeCompare(b.due));
  if (!items.length) return "## Upcoming assessments\nNone.";

  const now = new Date();
  const submitted = await Promise.all(
    items.map((a, i) => (i < SUBMISSION_LOOKUPS ? isSubmitted(a, student) : Promise.resolve(null))),
  );

  return `## Upcoming assessments (SEQTA gives due dates only, no due times)\n${items
    .map((a, i) => {
      const bits = [
        relativeDue(a.due, now),
        `(${dayLabel(a.due)})`,
        submitted[i] === true ? "SUBMITTED" : submitted[i] === false ? "NOT SUBMITTED yet" : null,
        a.graded ? "marked" : null,
        weightOf(a.id) ? `weight ${weightOf(a.id)}` : null,
      ].filter(Boolean);
      return `- ${a.title} (${a.subject}): ${bits.join(", ")}`;
    })
    .join("\n")}`;
}

async function gradesSection(): Promise<string> {
  const { loadGradeAnalytics } = await import("@/plugins/built-in/gradeAnalytics/api");
  const { assessments } = await loadGradeAnalytics();
  const marked = assessments
    .filter((a) => a.graded && typeof a.finalGrade === "number")
    .sort((a, b) => b.due.localeCompare(a.due))
    .slice(0, GRADES);
  if (!marked.length) return "## Recent marks\nNone synced yet (open Analytics once to sync).";
  return `## Recent marks (newest first)\n${marked
    .map(
      (a) =>
        `- ${a.due.slice(0, 10)} ${a.subject}: ${a.title}: ${Math.round(a.finalGrade as number)}%${a.letterGrade ? ` (${a.letterGrade})` : ""}`,
    )
    .join("\n")}`;
}

// ---- notices & messages ---------------------------------------------------------

type Notice = { title?: string; contents?: string; staff?: string; label_title?: string };

async function noticesSection(): Promise<string> {
  const days = [0, 1].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return ymd(d);
  });
  const perDay = await Promise.all(
    days.map((date) =>
      post<{ payload?: Notice[] }>("load/notices", { date })
        .then((r) => r.payload ?? [])
        .catch(() => [] as Notice[]),
    ),
  );
  const lines = days.flatMap((date, i) =>
    perDay[i].length
      ? [
          `\n${dayLabel(date)}:`,
          ...perDay[i].slice(0, 12).map((n) => {
            const body = htmlToText(n.contents ?? "").slice(0, NOTICE_CHARS);
            return `- ${n.title ?? "(untitled)"}${n.label_title ? ` [${n.label_title}]` : ""}${n.staff ? `, from ${n.staff}` : ""}${body ? `: ${body}` : ""}`;
          }),
        ]
      : [],
  );
  return lines.length
    ? `## School notices${lines.join("\n")}`
    : "## School notices\nNone today or tomorrow.";
}

type MessageListItem = {
  id: number;
  subject?: string;
  sender?: string;
  date?: string;
  read?: number | boolean;
};

async function messagesSection(): Promise<string> {
  const list = await post<{ payload?: { messages?: MessageListItem[] } }>("load/message", {
    searchValue: "",
    sortBy: "date",
    sortOrder: "desc",
    action: "list",
    label: "inbox",
    offset: 0,
    limit: MESSAGE_LIST,
    datetimeUntil: null,
  });
  const messages = list.payload?.messages ?? [];
  if (!messages.length) return "## Recent messages\nNone.";

  const bodies = await Promise.all(
    messages.slice(0, MESSAGE_BODIES).map((m) =>
      post<{ payload?: { contents?: string } }>("load/message", { action: "message", id: m.id })
        .then((r) => htmlToText(r.payload?.contents ?? "").slice(0, BODY_CHARS))
        .catch(() => ""),
    ),
  );

  return `## Recent messages (newest first)\n${messages
    .map((m, i) => {
      const head = `- ${m.date?.slice(0, 16).replace("T", " ") ?? ""} from ${m.sender ?? "?"}: "${m.subject ?? "(no subject)"}"${m.read ? "" : " [unread]"}`;
      return bodies[i] ? `${head}\n  ${bodies[i]}` : head;
    })
    .join("\n")}`;
}

/** Each section fails independently, so one broken endpoint doesn't sink the answer. */
export async function buildSeqtaContext(force = false): Promise<string> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.text;

  const { id: student } = await getUserInfo();
  if (student == null) throw new Error("Not signed in to SEQTA");
  const now = new Date();
  const sections = await Promise.all(
    [
      timetableSection(student),
      upcomingSection(student),
      noticesSection(),
      gradesSection(),
      messagesSection(),
    ].map((p) => p.catch(() => "")),
  );

  const text = [
    `Now: ${now.toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    ...sections.filter(Boolean),
  ].join("\n\n");
  cached = { at: Date.now(), text };
  return text;
}
