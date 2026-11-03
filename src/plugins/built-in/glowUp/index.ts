import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import {
  booleanSetting,
  defineSettings,
  selectSetting,
  Setting,
} from "@/plugins/core/settingsHelpers";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { solidPageAccent } from "@/seqta/ui/colors/pageAccent";
import { settingsState } from "@/seqta/utils/listeners/SettingsState";
import styles from "./styles.css?inline";

const PRESETS = ["Your theme", "Hacker", "Synthwave", "Ember", "Midnight"] as const;
type PresetName = (typeof PRESETS)[number];
const PRESET_SLUG: Record<PresetName, string> = {
  "Your theme": "theme",
  Hacker: "hacker",
  Synthwave: "synthwave",
  Ember: "ember",
  Midnight: "midnight",
};

const settings = defineSettings({
  preset: selectSetting({
    options: PRESETS,
    default: "Your theme",
    title: "Look",
    description:
      "Your theme follows your BetterSEQTA+ colour; the others are fixed looks (Hacker = terminal green)",
  }),
  motion: booleanSetting({
    default: true,
    title: "Animated background",
    description: "Drifting aurora / scrolling grid. Turn off for less motion",
  }),
});

class GlowUpPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.preset)
  preset!: PresetName;

  @Setting(settings.motion)
  motion!: boolean;
}

const instance = new GlowUpPluginClass();

const ROOT_CLASS = "bsplus-glow";
const HERO_ID = "bsplus-glow-hero";

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Still up";
}

function firstName(): string {
  const row = document.querySelector(".userInfoNameRow");
  const nameEl = row
    ? [...row.children].find((c) => !c.classList.contains("userInfoHouseWrap"))
    : null;
  return (nameEl?.textContent ?? "").trim().split(/\s+/)[0] ?? "";
}

function buildHero(): HTMLElement {
  const hero = document.createElement("section");
  hero.id = HERO_ID;
  hero.innerHTML = `
    <div>
      <div class="g-hero-greeting"></div>
      <div class="g-hero-clock"></div>
      <div class="g-hero-date"></div>
    </div>
    <div class="g-hero-next" hidden>
      <span class="g-hero-dot"></span>
      <span class="g-hero-next-text">
        <span class="g-hero-next-kicker"></span>
        <span class="g-hero-next-title"></span>
      </span>
    </div>
    <div class="g-hero-stats">
      <div><strong data-stat="lessons">–</strong><span data-stat-label="lessons">lessons today</span></div>
      <div><strong data-stat="todo">–</strong><span>to submit</span></div>
      <div><strong data-stat="level">–</strong><span>level</span></div>
    </div>`;
  return hero;
}

function updateHero(hero: HTMLElement, use24h: boolean) {
  const now = new Date();
  const name = firstName();
  hero.querySelector(".g-hero-greeting")!.textContent =
    `${greeting(now.getHours())}${name ? `, ${name}` : ""}`;
  hero.querySelector(".g-hero-clock")!.textContent = now.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24h,
  });
  hero.querySelector(".g-hero-date")!.textContent = now.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Stats, read straight off the page so they always match what's shown.
  const lessons = document.querySelectorAll(".day-container .day").length;
  const subtitle = document.querySelector(".home-subtitle")?.textContent ?? "";
  const todo = [...document.querySelectorAll(".upcoming-assessment")].filter(
    (a) => !a.querySelector(".upcoming-submittedtext"),
  ).length;
  const level = document
    .querySelector("#bsplus-levelup-pill .bsplus-lu-pill-lv")
    ?.textContent?.replace(/\D+/g, "");
  const set = (key: string, value: string) => {
    const el = hero.querySelector(`[data-stat="${key}"]`);
    if (el && el.textContent !== value) el.textContent = value;
  };
  set("lessons", String(lessons));
  hero.querySelector('[data-stat-label="lessons"]')!.textContent = /today/i.test(subtitle)
    ? "lessons today"
    : "lessons";
  set("todo", String(todo));
  set("level", level || "–");
  hero.querySelector<HTMLElement>(".g-hero-stats > div:last-child")!.hidden = !level;

  // Mirror the Lesson Countdown chip when it's showing something.
  const chip = document.getElementById("bsplus-lesson-countdown");
  const next = hero.querySelector<HTMLElement>(".g-hero-next")!;
  const label = chip?.querySelector(".bsplus-cd-label")?.textContent?.trim();
  const time = chip?.querySelector(".bsplus-cd-time")?.textContent?.trim();
  if (chip && !chip.hidden && label) {
    const inBreak = chip.classList.contains("is-break");
    next.hidden = false;
    next.querySelector(".g-hero-next-kicker")!.textContent = inBreak
      ? `Up next · ${time ?? ""}`
      : `Right now · ${time ?? ""}`;
    next.querySelector(".g-hero-next-title")!.textContent = label.replace(/^Next:\s*/, "");
    const colour = chip.style.getPropertyValue("--cd-colour");
    if (colour) next.style.setProperty("--g-next-colour", colour);
  } else {
    next.hidden = true;
  }
}

const glowUpPlugin: Plugin<typeof settings> = {
  id: "glow-up",
  name: "Glow Up",
  description:
    "A completely different look: dock navigation, command bar, bento home and 5 presets",
  version: "1.0.0",
  settings: instance.settings,
  // Despite the name, this is what shows the plugin's on/off switch in settings.
  disableToggle: true,
  styles,
  defaultEnabled: false,
  beta: true,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};
    const root = document.documentElement;

    const applySettings = () => {
      root.dataset.glowPreset = PRESET_SLUG[api.settings.preset as PresetName] ?? "theme";
      root.dataset.glowMotion = api.settings.motion ? "on" : "off";
      root.style.setProperty("--glow-accent", solidPageAccent());
    };

    root.classList.add(ROOT_CLASS);
    applySettings();

    const use24h = () => settingsState.timeFormat !== "12";

    const tick = () => {
      // The theme colour can change while we're on; keep the accent in sync.
      root.style.setProperty("--glow-accent", solidPageAccent());
      const home = document.querySelector(".home-container");
      let hero = document.getElementById(HERO_ID);
      if (home && !hero) {
        hero = buildHero();
        home.prepend(hero);
      }
      if (hero) updateHero(hero, use24h());
      // SEQTA leaves whitespace-only attendance pills; :empty can't catch those.
      document.querySelectorAll<HTMLElement>(".day-container .day > h5").forEach((h) => {
        if (!h.textContent?.trim()) h.dataset.empty = "1";
        else delete h.dataset.empty;
      });
    };
    // Folders (Assessments, Courses...): SEQTA's click puts the sidebar into a
    // sideways "drill" state that's meaningless in the dock and wrecked its
    // layout. Catch the click first (document capture runs before SEQTA's and
    // BetterSEQTA+'s menu listeners) and toggle a popover instead.
    const OPEN = "bsplus-glow-open";
    const closeFolders = () =>
      document.querySelectorAll(`#menu .${OPEN}`).forEach((li) => li.classList.remove(OPEN));
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const folderLabel = target?.closest("#menu > ul > li.hasChildren > label");
      if (folderLabel) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const li = folderLabel.parentElement!;
        const wasOpen = li.classList.contains(OPEN);
        closeFolders();
        if (!wasOpen) li.classList.add(OPEN);
        return;
      }
      // Anything else closes an open folder (a subject inside it navigates).
      if (!target?.closest(`#menu .${OPEN} > .sub`) || target.closest("#menu .sub li.item")) {
        closeFolders();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFolders();
    };
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", closeFolders);

    tick();
    const interval = window.setInterval(tick, 1000);
    const unsubPreset = api.settings.onChange("preset", applySettings);
    const unsubMotion = api.settings.onChange("motion", applySettings);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", closeFolders);
      closeFolders();
      unsubPreset.unregister();
      unsubMotion.unregister();
      root.classList.remove(ROOT_CLASS);
      delete root.dataset.glowPreset;
      delete root.dataset.glowMotion;
      root.style.removeProperty("--glow-accent");
      document.getElementById(HERO_ID)?.remove();
    };
  },
};

export default glowUpPlugin;
