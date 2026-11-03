import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { booleanSetting, defineSettings, Setting } from "@/plugins/core/settingsHelpers";
import { getUserInfo } from "@/seqta/utils/userInfo";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { solidPageAccent } from "@/seqta/ui/colors/pageAccent";
import { formatDuration, getLessonStatus, type CountdownLesson } from "./status";
import styles from "./styles.css?inline";

const settings = defineSettings({
  showRoom: booleanSetting({
    default: true,
    title: "Show room",
    description: "Include the room next to the lesson name",
  }),
  showNextInBreaks: booleanSetting({
    default: true,
    title: "Show next lesson in breaks",
    description: "Between lessons, count down to the next one instead of hiding",
  }),
});

class LessonCountdownPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.showRoom)
  showRoom!: boolean;

  @Setting(settings.showNextInBreaks)
  showNextInBreaks!: boolean;
}

const instance = new LessonCountdownPluginClass();

const CHIP_ID = "bsplus-lesson-countdown";
const REFETCH_MS = 30 * 60_000;

function todayKey(d = new Date()): string {
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type RawLesson = {
  from: string;
  until: string;
  description?: string;
  type?: string;
  room?: string;
  staff?: string;
  code?: string;
  tutorID?: number;
};

async function fetchTodaysLessons(date: string): Promise<CountdownLesson[]> {
  const { id: student } = await getUserInfo();
  const post = (path: string, body: unknown) =>
    fetch(`${location.origin}/seqta/student/${path}?`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const [timetable, prefs] = await Promise.all([
    post("load/timetable", { from: date, until: date, student }),
    post("load/prefs", { request: "userPrefs", asArray: true, user: student }).catch(() => null),
  ]);

  const colourPrefs = new Map<string, string>(
    ((prefs?.payload ?? []) as { name: string; value: string }[]).map((p) => [p.name, p.value]),
  );

  return ((timetable?.payload?.items ?? []) as RawLesson[]).map((l) => ({
    from: l.from,
    until: l.until,
    description: l.description || (l.type === "tutorial" ? "Tutorial" : "Lesson"),
    room: l.room,
    staff: l.staff,
    colour:
      colourPrefs.get(
        l.type === "tutorial"
          ? `timetable.tutor.${l.tutorID}`
          : `timetable.subject.colour.${l.code}`,
      ) ?? undefined,
  }));
}

/**
 * Dev only (stripped from production builds): set
 * localStorage["bsplus-countdown-fake-time"] = "10:05" to pretend it's that
 * time today, so the chip can be checked after school.
 */
function now(): Date {
  if (import.meta.env.DEV) {
    try {
      const fake = localStorage.getItem("bsplus-countdown-fake-time");
      const m = fake?.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        const d = new Date();
        const real = new Date();
        d.setHours(Number(m[1]), Number(m[2]), real.getSeconds(), real.getMilliseconds());
        return d;
      }
    } catch {
      /* storage blocked */
    }
  }
  return new Date();
}

function lessonLabel(l: CountdownLesson, withRoom: boolean): string {
  return withRoom && l.room ? `${l.description} · ${l.room}` : l.description;
}

const lessonCountdownPlugin: Plugin<typeof settings> = {
  id: "lesson-countdown",
  name: "Lesson Countdown",
  description: "Shows the current lesson and time until the bell in the top bar",
  version: "1.0.0",
  settings: instance.settings,
  // Despite the name, this is what shows the plugin's on/off switch in settings.
  disableToggle: true,
  styles,
  defaultEnabled: true,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};

    const chip = document.createElement("div");
    chip.id = CHIP_ID;
    chip.innerHTML = `<span class="bsplus-cd-label"></span><span class="bsplus-cd-time"></span><span class="bsplus-cd-bar"><span class="bsplus-cd-fill"></span></span>`;
    const label = chip.querySelector<HTMLElement>(".bsplus-cd-label")!;
    const time = chip.querySelector<HTMLElement>(".bsplus-cd-time")!;
    const fill = chip.querySelector<HTMLElement>(".bsplus-cd-fill")!;

    let lessons: CountdownLesson[] = [];
    let loadedFor = "";
    let loadedAt = 0;
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      const key = todayKey();
      try {
        lessons = await fetchTodaysLessons(key);
        loadedFor = key;
        loadedAt = Date.now();
      } catch (e) {
        console.warn("[BetterSEQTA+] Lesson countdown: failed to load timetable", e);
        loadedAt = Date.now(); // back off; retry on the next refetch window
      } finally {
        loading = false;
      }
    };

    /** SEQTA re-renders its header, so re-attach whenever we fall out. */
    const ensureMounted = () => {
      if (chip.isConnected) return;
      // .userInfo is a centred flex row; the name row inside it is a grid,
      // so the chip goes beside the whole name block, not inside it.
      const userInfo = document.querySelector(".userInfo");
      if (!userInfo) return;
      userInfo.insertBefore(chip, userInfo.firstChild);
    };

    const render = () => {
      const status = getLessonStatus(lessons, now());

      if (status.kind === "in-lesson") {
        const { lesson, endsInMs, progress } = status;
        chip.hidden = false;
        chip.classList.remove("is-break");
        chip.classList.toggle("is-ending", endsInMs <= 5 * 60_000);
        label.textContent = lessonLabel(lesson, api.settings.showRoom);
        time.textContent = `${formatDuration(endsInMs)} left`;
        fill.style.width = `${Math.min(100, progress * 100).toFixed(1)}%`;
        chip.style.setProperty("--cd-colour", lesson.colour ?? solidPageAccent());
        chip.title = `${lesson.description}${lesson.staff ? ` with ${lesson.staff}` : ""}${lesson.room ? ` in ${lesson.room}` : ""}\n${lesson.from.slice(0, 5)}–${lesson.until.slice(0, 5)}${status.next ? `\nNext: ${lessonLabel(status.next, true)}` : ""}`;
        return;
      }

      if (status.kind === "between" && api.settings.showNextInBreaks) {
        const { next, startsInMs } = status;
        chip.hidden = false;
        chip.classList.add("is-break");
        chip.classList.remove("is-ending");
        label.textContent = `Next: ${lessonLabel(next, api.settings.showRoom)}`;
        time.textContent = `in ${formatDuration(startsInMs)}`;
        fill.style.width = "0%";
        chip.style.setProperty("--cd-colour", next.colour ?? solidPageAccent());
        chip.title = `${next.description}${next.staff ? ` with ${next.staff}` : ""} at ${next.from.slice(0, 5)}`;
        return;
      }

      chip.hidden = true;
    };

    const tick = () => {
      const stale = loadedFor !== todayKey() || Date.now() - loadedAt > REFETCH_MS;
      if (stale) void load().then(render);
      ensureMounted();
      render();
    };

    await load();
    tick();
    const interval = window.setInterval(tick, 1000);
    const unsubRoom = api.settings.onChange("showRoom", render);
    const unsubBreaks = api.settings.onChange("showNextInBreaks", render);

    return () => {
      window.clearInterval(interval);
      unsubRoom.unregister();
      unsubBreaks.unregister();
      chip.remove();
    };
  },
};

export default lessonCountdownPlugin;
