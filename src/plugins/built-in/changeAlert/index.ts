import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { booleanSetting, defineSettings, Setting } from "@/plugins/core/settingsHelpers";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { addDays, lessonKey, ymd } from "@/plugins/shared/dates";
import { getDay, getLessons, isRealClass } from "@/plugins/shared/timetableCache";
import { clearAnnotations, setAnnotation } from "@/plugins/shared/lessonAnnotations";
import { escapeHtml, watchHomeLessons, type HomeLessonCard } from "@/plugins/shared/homeLessons";
import { describeChange, detectChanges, type LessonChange } from "./detect";
import styles from "./styles.css?inline";

const settings = defineSettings({
  checkTomorrow: booleanSetting({
    default: true,
    title: "Check tomorrow too",
    description: "Show tomorrow's room and teacher changes in Lesson Countdown and on home",
  }),
});

class ChangeAlertPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.checkTomorrow)
  checkTomorrow!: boolean;
}
const instance = new ChangeAlertPluginClass();

const SOURCE = "change-alert";
const WEEKS_BACK = 3;

/** Changes for every real class on `date`, keyed by start time. */
async function changesForDay(date: string): Promise<Map<string, LessonChange[]>> {
  const out = new Map<string, LessonChange[]>();
  // One request covers the 3 weeks of history plus the day itself.
  await getLessons(addDays(date, -7 * WEEKS_BACK), date);
  const [today, ...history] = await Promise.all([
    getDay(date),
    ...Array.from({ length: WEEKS_BACK }, (_, i) => getDay(addDays(date, -7 * (i + 1)))),
  ]);
  for (const lesson of today.filter(isRealClass)) {
    const changes = detectChanges(
      lesson,
      history.map((d) => d.filter(isRealClass)),
    );
    if (changes.length) out.set(lesson.from, changes);
  }
  return out;
}

function markCard(card: HomeLessonCard, changes: LessonChange[] | undefined) {
  const el = card.el;
  el.querySelector(":scope > .bsplus-change-pills")?.remove();
  el.classList.toggle("bsplus-has-change", !!changes?.length);
  if (!changes?.length) return;

  // SEQTA card layout: h2 subject, h3 staff, h3 room. Strike the usual value in place.
  const [staffEl, roomEl] = el.querySelectorAll<HTMLElement>(":scope > h3");
  for (const c of changes) {
    const target = c.kind === "room" ? roomEl : c.kind === "staff" ? staffEl : null;
    if (target && !target.dataset.bsplusChanged) {
      target.dataset.bsplusChanged = "1";
      target.innerHTML = `<s class="bsplus-change-was">${escapeHtml(c.usual)}</s> <b class="bsplus-change-now">${escapeHtml(c.now)}</b>`;
    }
  }
  const pills = document.createElement("div");
  pills.className = "bsplus-change-pills";
  for (const c of changes) {
    const d = describeChange(c);
    const pill = document.createElement("span");
    pill.className = `bsplus-change-pill is-${c.kind}`;
    pill.textContent = `${d.icon} ${c.kind === "room" ? "room change" : c.kind === "staff" ? "relief" : "swapped"}`;
    pill.title = d.long;
    pills.appendChild(pill);
  }
  // After the h3s, so it sits in the gap above the pinned time.
  (roomEl ?? staffEl ?? el.firstElementChild)?.after(pills);
}

const changeAlertPlugin: Plugin<typeof settings> = {
  id: "change-alert",
  name: "Room & Teacher Change Alert",
  description:
    "Flags lessons whose room or teacher differs from the usual (your last 3 weeks), on home and in Lesson Countdown",
  version: "1.0.0",
  settings: instance.settings,
  disableToggle: true,
  beta: true,
  defaultEnabled: true,
  styles,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};

    const dayCache = new Map<string, Promise<Map<string, LessonChange[]>>>();
    const forDay = (date: string) => {
      let p = dayCache.get(date);
      if (!p) {
        p = changesForDay(date).catch((e) => {
          console.warn("[BetterSEQTA+] Change alert: timetable failed", e);
          dayCache.delete(date);
          return new Map<string, LessonChange[]>();
        });
        dayCache.set(date, p);
      }
      return p;
    };

    /** Feed Lesson Countdown (today, and tomorrow's first lessons after school). */
    const publishAnnotations = async () => {
      clearAnnotations(SOURCE);
      const dates = [ymd()];
      if (api.settings.checkTomorrow) dates.push(addDays(ymd(), 1));
      for (const date of dates) {
        const changes = await forDay(date);
        for (const [from, list] of changes) {
          setAnnotation(lessonKey(date, from), {
            source: SOURCE,
            icon: describeChange(list[0]).icon,
            text: list.map((c) => describeChange(c).short).join(", "),
          });
        }
      }
    };

    const stopWatching = watchHomeLessons(async (cards) => {
      const byDate = new Map<string, HomeLessonCard[]>();
      for (const c of cards) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
      for (const [date, list] of byDate) {
        const changes = await forDay(date);
        for (const card of list) {
          if (card.el.isConnected) markCard(card, changes.get(card.from));
        }
      }
    });

    void publishAnnotations();
    // Day rollover / setting flip: recompute. Cached days stay valid (the
    // timetable cache handles freshness), so this is cheap.
    let lastDay = ymd();
    const interval = window.setInterval(() => {
      if (ymd() !== lastDay) {
        lastDay = ymd();
        dayCache.clear();
        void publishAnnotations();
      }
    }, 60_000);
    const unsub = api.settings.onChange("checkTomorrow", () => void publishAnnotations());

    return () => {
      stopWatching();
      window.clearInterval(interval);
      unsub.unregister();
      clearAnnotations(SOURCE);
      document.querySelectorAll(".bsplus-change-pills").forEach((e) => e.remove());
      document
        .querySelectorAll(".bsplus-has-change")
        .forEach((e) => e.classList.remove("bsplus-has-change"));
    };
  },
};

export default changeAlertPlugin;
