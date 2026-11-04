/**
 * Watches SEQTA's notifications (the `heartbeat` endpoint) and classifies the
 * assessment ones. Polls on its own instead of reading Notification Collector's
 * archive, because that archive only exists while "save locally" is on.
 *
 * Results Drop diffs these against its own seen-list; Crunch Radar just
 * refreshes when something new is published.
 */
import { fetchAllNotifications } from "@/plugins/built-in/notificationCollector/archive";

export type AssessmentEventKind = "result" | "feedback" | "published" | "other";

export type AssessmentEvent = {
  id: number;
  kind: AssessmentEventKind;
  timestamp: string;
  assessmentID: number;
  programmeID: number;
  metaclassID: number;
  title: string;
  subtitle: string;
  subjectCode: string;
};

const POLL_MS = 90_000;
const listeners = new Set<(events: AssessmentEvent[]) => void>();
let timer: number | null = null;
let last: AssessmentEvent[] | null = null;
let polling = false;

/** Titles look like "Results and feedback for X released", "Details for X released"… */
export function classify(title: string): AssessmentEventKind {
  const t = title.trim().toLowerCase();
  if (t.startsWith("results")) return "result";
  if (t.startsWith("feedback")) return "feedback";
  if (t.startsWith("details")) return "published";
  return "other";
}

function toEvent(raw: Record<string, unknown>): AssessmentEvent | null {
  const a = raw.coneqtAssessments as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return null;
  const title = String(a.title ?? "");
  return {
    id: Number(raw.notificationID),
    kind: classify(title),
    timestamp: String(raw.timestamp ?? ""),
    assessmentID: Number(a.assessmentID ?? 0),
    programmeID: Number(a.programmeID ?? 0),
    metaclassID: Number(a.metaclassID ?? 0),
    title,
    subtitle: String(a.subtitle ?? ""),
    subjectCode: String(a.subjectCode ?? ""),
  };
}

async function poll() {
  if (polling || document.hidden) return;
  polling = true;
  try {
    const raw = await fetchAllNotifications();
    last = raw.map(toEvent).filter((e): e is AssessmentEvent => !!e && !!e.id);
    for (const l of listeners) l(last);
  } catch (e) {
    console.warn("[BetterSEQTA+] assessment events: poll failed", e);
  } finally {
    polling = false;
  }
}

const onVisible = () => {
  if (!document.hidden) void poll();
};

/** Subscribe to the full classified list (fires on every poll). */
export function onAssessmentEvents(cb: (events: AssessmentEvent[]) => void): () => void {
  listeners.add(cb);
  if (last) cb(last);
  if (timer == null) {
    timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    void poll();
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer != null) {
      window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/** Force a poll now (e.g. after the user opens the page). */
export function refreshAssessmentEvents(): Promise<void> {
  return poll();
}
