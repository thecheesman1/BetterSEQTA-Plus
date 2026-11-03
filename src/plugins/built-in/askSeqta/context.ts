import { getUserInfo } from "@/seqta/utils/userInfo";

/** Plain-text snapshot of the student's SEQTA data for the model to answer from. */

const CACHE_MS = 5 * 60_000;
const MESSAGE_LIST = 25;
const MESSAGE_BODIES = 8;
const BODY_CHARS = 1500;
const GRADES = 60;

let cached: { at: number; text: string } | null = null;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

type Lesson = {
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
  const res = await post<{ payload?: { items?: Lesson[] } }>("load/timetable", {
    from: ymd(from),
    until: ymd(until),
    student,
  });
  const items = [...(res.payload?.items ?? [])].sort((a, b) =>
    `${a.date}${a.from}`.localeCompare(`${b.date}${b.from}`),
  );
  if (!items.length) return "## Timetable (next 7 days)\nNo lessons.";
  const lines: string[] = [];
  let day = "";
  for (const l of items) {
    if (l.date !== day) {
      day = l.date;
      const d = new Date(`${l.date}T00:00:00`);
      lines.push(
        `\n${d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}:`,
      );
    }
    const name = l.description || (l.type === "tutorial" ? "Tutorial" : "Lesson");
    lines.push(
      `- ${l.from.slice(0, 5)}–${l.until.slice(0, 5)} ${name}${l.room ? `, room ${l.room}` : ""}${l.staff ? `, ${l.staff}` : ""}`,
    );
  }
  return `## Timetable (next 7 days)${lines.join("\n")}`;
}

type Upcoming = { title: string; subject: string; due: string; status?: string; overdue?: boolean };

async function upcomingSection(student: number): Promise<string> {
  const res = await post<{ payload?: Upcoming[] }>("assessment/list/upcoming", { student });
  const items = [...(res.payload ?? [])].sort((a, b) => a.due.localeCompare(b.due));
  if (!items.length) return "## Upcoming assessments\nNone.";
  return `## Upcoming assessments\n${items
    .map(
      (a) =>
        `- ${a.title} (${a.subject}), due ${new Date(a.due).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}${a.overdue ? " (OVERDUE)" : ""}${a.status ? ` [${a.status.toLowerCase().replace(/_/g, " ")}]` : ""}`,
    )
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

type MessageListItem = {
  id: number;
  subject?: string;
  sender?: string;
  date?: string;
  read?: number | boolean;
  attachments?: boolean;
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
    [timetableSection(student), upcomingSection(student), gradesSection(), messagesSection()].map(
      (p) => p.catch(() => ""),
    ),
  );

  const text = [
    `Now: ${now.toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    ...sections.filter(Boolean),
  ].join("\n\n");
  cached = { at: Date.now(), text };
  return text;
}
