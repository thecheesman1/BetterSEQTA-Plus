import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { booleanSetting, defineSettings, Setting } from "@/plugins/core/settingsHelpers";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { lessonKey, nowMinutes, parseYmd, toMinutes, ymd } from "@/plugins/shared/dates";
import { getDay, isRealClass, type TimetableLesson } from "@/plugins/shared/timetableCache";
import { clearAnnotations, setAnnotation } from "@/plugins/shared/lessonAnnotations";
import {
  escapeHtml,
  readHomeCards,
  watchHomeLessons,
  type HomeLessonCard,
} from "@/plugins/shared/homeLessons";
import { newNoteId, notesForLesson, pruneNotes, type LessonNote } from "./notes";
import styles from "./styles.css?inline";

const settings = defineSettings({
  quickCapture: booleanSetting({
    default: true,
    title: "Alt+N quick note",
    description: "Alt+N opens a note for the lesson you're in (or the next one)",
  }),
});

class LessonNotesPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.quickCapture) quickCapture!: boolean;
}
const instance = new LessonNotesPluginClass();

type Storage = { notes: LessonNote[] };
type Target = { code: string; subject: string; date: string; from: string };

const SOURCE = "lesson-notes";
const EDITOR_ID = "bsplus-note-editor";
const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const lessonNotesPlugin: Plugin<typeof settings, Storage> = {
  id: "lesson-notes",
  name: "Lesson Notes",
  description:
    "Jot a note on a lesson; it pops up next time that subject comes around (home, Lesson Countdown, Ask SEQTA)",
  version: "1.0.0",
  settings: instance.settings,
  disableToggle: true,
  beta: true,
  defaultEnabled: true,
  styles,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};
    await api.storage.loaded;
    api.storage.notes = pruneNotes(api.storage.notes ?? []);

    const notes = () => api.storage.notes ?? [];
    const save = (next: LessonNote[]) => {
      api.storage.notes = next;
      renderCards(readHomeCards());
      void publishAnnotations();
    };
    const setDone = (id: string) =>
      save(notes().map((n) => (n.id === id ? { ...n, done: true, doneAt: Date.now() } : n)));
    const remove = (id: string) => save(notes().filter((n) => n.id !== id));

    // ---- editor -----------------------------------------------------------------
    const closeEditor = () => document.getElementById(EDITOR_ID)?.remove();

    const openEditor = (t: Target, anchor?: DOMRect) => {
      closeEditor();
      const box = document.createElement("div");
      box.id = EDITOR_ID;
      const own = notesForLesson(notes(), t.code, t.date, t.from).own;
      box.innerHTML = `
        <div class="bsplus-note-head">📝 <b>${escapeHtml(t.subject)}</b><span>${escapeHtml(DATE_FMT.format(parseYmd(t.date)))} · ${escapeHtml(t.from)}</span></div>
        <ul class="bsplus-note-own">${own
          .map(
            (n) =>
              `<li data-id="${escapeHtml(n.id)}" class="${n.done ? "is-done" : ""}"><span>${escapeHtml(n.text)}</span><button class="bsplus-note-del" title="Delete">×</button></li>`,
          )
          .join("")}</ul>
        <textarea rows="2" maxlength="300" placeholder="bring USB, finish Q4–7, test Friday…"></textarea>
        <div class="bsplus-note-foot"><span>Shows up next ${escapeHtml(t.subject)} lesson · Enter to save</span><button class="bsplus-note-save">Save</button></div>`;
      document.body.appendChild(box);

      // Under the card when there is one, else bottom-centre (Alt+N).
      if (anchor) {
        const w = box.offsetWidth;
        box.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8)}px`;
        const below = anchor.bottom + 8;
        box.style.top =
          below + box.offsetHeight < window.innerHeight
            ? `${below}px`
            : `${Math.max(8, anchor.top - box.offsetHeight - 8)}px`;
      } else {
        box.classList.add("is-floating");
      }

      const input = box.querySelector("textarea")!;
      input.focus();
      const commit = () => {
        const text = input.value.trim();
        if (text) {
          save([...notes(), { id: newNoteId(), ...t, text, done: false, createdAt: Date.now() }]);
        }
        closeEditor();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") closeEditor();
      });
      box.querySelector(".bsplus-note-save")!.addEventListener("click", commit);
      box.querySelectorAll<HTMLElement>(".bsplus-note-del").forEach((b) =>
        b.addEventListener("click", () => {
          const li = b.closest("li")!;
          remove(li.dataset.id!);
          li.remove();
        }),
      );
    };

    const onOutside = (e: MouseEvent) => {
      const box = document.getElementById(EDITOR_ID);
      const t = e.target as Element;
      if (box && !box.contains(t) && !t.closest?.(".bsplus-note-btn")) closeEditor();
    };
    document.addEventListener("mousedown", onOutside);

    // ---- home cards -----------------------------------------------------------
    function renderCards(cards: HomeLessonCard[]) {
      for (const card of cards) {
        if (!card.programmeID || !card.el.isConnected) continue;
        const subject = card.el.querySelector("h2")?.textContent?.trim() || card.code;
        const target: Target = { code: card.code, subject, date: card.date, from: card.from };

        let btn = card.el.querySelector<HTMLElement>(":scope > .bsplus-note-btn");
        if (!btn) {
          btn = document.createElement("div");
          btn.className = "day-button clickable bsplus-note-btn";
          btn.title = "Add a lesson note";
          btn.textContent = "✎";
          card.el.appendChild(btn);
        }
        btn.onclick = (e) => {
          e.stopPropagation();
          openEditor(target, card.el.getBoundingClientRect());
        };

        card.el.querySelector(":scope > .bsplus-note-line")?.remove();
        const { carried, own } = notesForLesson(notes(), card.code, card.date, card.from);
        const show = carried[0] ?? own.find((n) => !n.done);
        if (!show) continue;
        const line = document.createElement("div");
        line.className = `bsplus-note-line${carried.length ? "" : " is-own"}`;
        line.innerHTML = `<span title="${escapeHtml([...carried, ...own].map((n) => n.text).join("\n"))}">📝 ${
          carried.length ? "<i>last time:</i> " : ""
        }${escapeHtml(show.text)}${carried.length > 1 ? ` <b>+${carried.length - 1}</b>` : ""}</span>${
          carried.length ? `<button class="bsplus-note-tick" title="Done">✓</button>` : ""
        }`;
        line.querySelector(".bsplus-note-tick")?.addEventListener("click", (e) => {
          e.stopPropagation();
          setDone(show.id);
        });
        // After any change-alert pills, else after the h3s.
        const after =
          card.el.querySelector(":scope > .bsplus-change-pills") ??
          [...card.el.querySelectorAll(":scope > h3")].pop();
        if (after) after.after(line);
        else card.el.appendChild(line);
      }
    }
    const stopWatching = watchHomeLessons(renderCards);

    // ---- Lesson Countdown annotations (today) ---------------------------------
    let today: TimetableLesson[] = [];
    async function publishAnnotations() {
      clearAnnotations(SOURCE);
      try {
        today = (await getDay(ymd())).filter(isRealClass);
      } catch {
        return;
      }
      for (const l of today) {
        const { carried } = notesForLesson(notes(), l.code, l.date, l.from);
        if (!carried.length) continue;
        setAnnotation(lessonKey(l.date, l.from), {
          source: SOURCE,
          icon: "📝",
          text: carried[0].text + (carried.length > 1 ? ` (+${carried.length - 1})` : ""),
        });
      }
    }
    void publishAnnotations();

    // ---- Alt+N: note for the lesson you're in, else the next one ---------------
    const onKey = (e: KeyboardEvent) => {
      if (!api.settings.quickCapture || !e.altKey || e.key.toLowerCase() !== "n") return;
      const t = nowMinutes();
      const lesson =
        today.find((l) => toMinutes(l.from) <= t && t < toMinutes(l.until)) ??
        today.find((l) => toMinutes(l.from) > t);
      if (!lesson) return;
      e.preventDefault();
      openEditor({
        code: lesson.code,
        subject: lesson.description || lesson.code,
        date: lesson.date,
        from: lesson.from,
      });
    };
    document.addEventListener("keydown", onKey);

    return () => {
      stopWatching();
      clearAnnotations(SOURCE);
      closeEditor();
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
      document.querySelectorAll(".bsplus-note-btn, .bsplus-note-line").forEach((e) => e.remove());
    };
  },
};

export default lessonNotesPlugin;
