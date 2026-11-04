import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { booleanSetting, defineSettings, Setting } from "@/plugins/core/settingsHelpers";
import DOMPurify from "dompurify";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import {
  addDays,
  isWeekend,
  lessonKey,
  nowMinutes,
  parseYmd,
  toMinutes,
  ymd,
} from "@/plugins/shared/dates";
import {
  getDay,
  getSubjectColours,
  isRealClass,
  type TimetableLesson,
} from "@/plugins/shared/timetableCache";
import { escapeHtml } from "@/plugins/shared/homeLessons";
import { findLesson, lessonContent, type CoursePayload } from "./course";
import styles from "./styles.css?inline";

const settings = defineSettings({
  showNext: booleanSetting({
    default: true,
    title: "Show the next lesson between classes",
    description: "Between lessons (and after school), show what's coming up instead of hiding",
  }),
  autoOpen: booleanSetting({
    default: false,
    title: "Open the course page during class",
    description:
      "When you open SEQTA mid-lesson, jump straight to that lesson's course page (once per lesson)",
  }),
});

class ClassModePluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.showNext) showNext!: boolean;
  @Setting(settings.autoOpen) autoOpen!: boolean;
}
const instance = new ClassModePluginClass();

type Storage = { collapsed: boolean; autoOpened: string };

const ROOT_CLASS = "bsplus-classmode";
const courses = new Map<string, Promise<CoursePayload>>();

function loadCourse(programme: number, metaclass: number): Promise<CoursePayload> {
  const key = `${programme}:${metaclass}`;
  let p = courses.get(key);
  if (!p) {
    p = fetch(`${location.origin}/seqta/student/load/courses?`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ programme: String(programme), metaclass: String(metaclass) }),
    })
      .then((r) => r.json())
      .then((j) => (j?.payload ?? {}) as CoursePayload)
      .catch((e) => {
        courses.delete(key);
        throw e;
      });
    courses.set(key, p);
  }
  return p;
}

type Picked = { lesson: TimetableLesson; live: boolean; minutes: number; later: boolean };

/** The lesson on now, else (optionally) the next one today. */
function pick(lessons: TimetableLesson[], showNext: boolean): Picked | null {
  const t = nowMinutes();
  const now = lessons.find((l) => toMinutes(l.from) <= t && t < toMinutes(l.until));
  if (now) {
    return { lesson: now, live: true, minutes: Math.ceil(toMinutes(now.until) - t), later: false };
  }
  const next = showNext ? lessons.find((l) => toMinutes(l.from) > t) : undefined;
  return next
    ? { lesson: next, live: false, minutes: Math.ceil(toMinutes(next.from) - t), later: false }
    : null;
}

/** After school: the first class of the next school day (within a week). */
async function nextSchoolDay(): Promise<Picked | null> {
  for (let i = 1; i <= 7; i++) {
    const date = addDays(ymd(), i);
    if (isWeekend(date)) continue;
    const first = (await getDay(date)).filter(isRealClass)[0];
    if (first) return { lesson: first, live: false, minutes: 0, later: true };
  }
  return null;
}

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
/** 47 -> "47 min", 514 -> "8h 34m" */
function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function whenText({ live, minutes, later, lesson }: Picked): string {
  if (live) return `${duration(minutes)} left`;
  if (!later) return `starts in ${duration(minutes)}`;
  const day =
    lesson.date === addDays(ymd(), 1) ? "Tomorrow" : DAY_FMT.format(parseYmd(lesson.date));
  return `${day} · ${lesson.from}`;
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["style", "class", "id"],
  });
}

const classModePlugin: Plugin<typeof settings, Storage> = {
  id: "class-mode",
  name: "Class Mode",
  description: "During a lesson, home shows that lesson's content from the course page",
  version: "1.0.0",
  settings: instance.settings,
  disableToggle: true,
  beta: true,
  defaultEnabled: true,
  styles,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};
    await api.storage.loaded;

    let shownKey = "";
    let generation = 0;

    const removeCard = () => {
      document.querySelectorAll(`.${ROOT_CLASS}`).forEach((e) => e.remove());
      shownKey = "";
    };

    const draw = async (force = false) => {
      const home = document.getElementById("home-container");
      if (!home) return;
      let lessons: TimetableLesson[];
      try {
        lessons = (await getDay(ymd())).filter(isRealClass);
      } catch {
        return;
      }
      const picked =
        pick(lessons, api.settings.showNext) ??
        (api.settings.showNext ? await nextSchoolDay().catch(() => null) : null);
      if (!picked) return removeCard();

      const { lesson, live } = picked;
      const key = `${lessonKey(lesson.date, lesson.from)}|${live}`;
      let root = home.querySelector<HTMLElement>(`:scope > .${ROOT_CLASS}`);
      // Same lesson already rendered: just refresh the countdown text.
      if (root && key === shownKey && !force) {
        const when = root.querySelector(".bsplus-cm-when");
        if (when) when.textContent = whenText(picked);
        return;
      }
      shownKey = key;
      const gen = ++generation;

      if (!root) {
        root = document.createElement("div");
        root.className = `border ${ROOT_CLASS}`;
        home.insertBefore(root, home.querySelector(":scope > .timetable-container"));
      }
      root.classList.toggle("is-collapsed", !!api.storage.collapsed);

      const courseHref = `#?page=/courses/${lesson.programmeID}:${lesson.metaID}`;
      const [course, colours] = await Promise.all([
        loadCourse(lesson.programmeID, lesson.metaID).catch(() => null),
        getSubjectColours().catch(() => new Map<string, string>()),
      ]);
      if (gen !== generation || !root.isConnected) return;

      const match = course ? findLesson(course, lesson.date, lesson.from) : null;
      const content = lessonContent(match?.lesson ?? null);
      const title = match?.lesson?.t?.trim() || "";
      root.style.setProperty("--cm-colour", colours.get(lesson.code) ?? "var(--better-main)");

      const body = content.html.length
        ? `<div class="bsplus-cm-doc">${content.html.map(sanitize).join("<hr>")}</div>`
        : `<p class="bsplus-cm-empty">${
            match ? "Nothing posted for this lesson yet." : "This lesson isn't in the course plan."
          } <a href="${courseHref}">Open the course →</a></p>`;
      const resources = content.resources.length
        ? `<div class="bsplus-cm-files">${content.resources.map((r) => `<span>📎 ${escapeHtml(r)}</span>`).join("")}</div>`
        : "";

      root.innerHTML = `
        <div class="bsplus-cm-head">
          <span class="bsplus-cm-badge${live ? " is-live" : ""}">${live ? "Now" : picked.later ? "Next lesson" : "Up next"}</span>
          <div class="bsplus-cm-titles">
            <div class="bsplus-cm-subject">${escapeHtml(lesson.description)} · ${escapeHtml(lesson.from)}–${escapeHtml(lesson.until)}${lesson.room ? ` · ${escapeHtml(lesson.room)}` : ""}</div>
            <div class="bsplus-cm-title">${escapeHtml(title || "Lesson")}${match?.continued ? " <small>(continued)</small>" : ""}${
              match?.term ? ` <small>T${match.term} W${match.week}</small>` : ""
            }</div>
          </div>
          <span class="bsplus-cm-when">${escapeHtml(whenText(picked))}</span>
          <a class="bsplus-cm-open" href="${courseHref}">Course →</a>
          <button class="bsplus-cm-toggle" title="Collapse">${api.storage.collapsed ? "▾" : "▴"}</button>
        </div>
        <div class="bsplus-cm-body">${body}${resources}</div>`;

      root.querySelector(".bsplus-cm-toggle")!.addEventListener("click", () => {
        api.storage.collapsed = !api.storage.collapsed;
        void draw(true);
      });
      // Teacher links open in a new tab instead of replacing SEQTA.
      root.querySelectorAll<HTMLAnchorElement>(".bsplus-cm-doc a[href]").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    };

    // Opt-in: jump to the course page once per lesson when SEQTA opens mid-class.
    const maybeAutoOpen = async () => {
      if (!api.settings.autoOpen) return;
      const lessons = (await getDay(ymd()).catch(() => [])).filter(isRealClass);
      const picked = pick(lessons, false);
      if (!picked) return;
      const key = lessonKey(picked.lesson.date, picked.lesson.from);
      if (api.storage.autoOpened === key) return;
      api.storage.autoOpened = key;
      location.hash = `?page=/courses/${picked.lesson.programmeID}:${picked.lesson.metaID}`;
    };

    const mount = api.seqta.onMount("#home-container", () => {
      shownKey = "";
      void draw();
    });
    if (document.getElementById("home-container")) void draw();
    void maybeAutoOpen();
    const interval = window.setInterval(() => void draw(), 30_000);
    const unsubNext = api.settings.onChange("showNext", () => void draw(true));

    return () => {
      mount.unregister();
      window.clearInterval(interval);
      unsubNext.unregister();
      removeCard();
    };
  },
};

export default classModePlugin;
