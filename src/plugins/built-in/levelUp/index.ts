import browser from "@/lib/browser";
import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { booleanSetting, defineSettings, Setting } from "@/plugins/core/settingsHelpers";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { solidPageAccent } from "@/seqta/ui/colors/pageAccent";
import { computeProgress, STREAK_THRESHOLD, type Achievement, type Progress } from "./xp";
import styles from "./styles.css?inline";

const settings = defineSettings({
  toasts: booleanSetting({
    default: true,
    title: "Achievement pop-ups",
    description: "Show a pop-up when you unlock an achievement",
  }),
});

class LevelUpPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.toasts)
  toasts!: boolean;
}

const instance = new LevelUpPluginClass();

type LevelUpStorage = { unlocked: string[] };

const PILL_ID = "bsplus-levelup-pill";
const PANEL_ID = "bsplus-levelup-panel";
/** Grade analytics cache keys: bsplus.analytics.v2.<origin>.<studentId> */
const ANALYTICS_KEY_PREFIX = "bsplus.analytics.v2.";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function toast(html: string) {
  let stack = document.getElementById("bsplus-levelup-toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "bsplus-levelup-toasts";
    stack.style.setProperty("--lu-accent", solidPageAccent());
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "bsplus-levelup-toast";
  el.innerHTML = html;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  window.setTimeout(() => {
    el.classList.remove("is-in");
    window.setTimeout(() => el.remove(), 400);
  }, 5000);
}

function achievementHtml(a: Achievement): string {
  const progress =
    a.progress && !a.unlocked
      ? `<span class="bsplus-lu-ach-progress"><span style="width:${(a.progress.value / a.progress.goal) * 100}%"></span></span><span class="bsplus-lu-ach-count">${a.progress.value}/${a.progress.goal}</span>`
      : "";
  return `<li class="bsplus-lu-ach${a.unlocked ? " is-unlocked" : ""}" title="${escapeHtml(a.description)}">
    <span class="bsplus-lu-ach-icon">${a.unlocked ? a.icon : "🔒"}</span>
    <span class="bsplus-lu-ach-text"><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.description)}</small>${progress}</span>
  </li>`;
}

function panelHtml(p: Progress): string {
  const pct = p.levelSpan ? (p.levelXp / p.levelSpan) * 100 : 0;
  const done = p.achievements.filter((a) => a.unlocked).length;
  return `
    <header class="bsplus-lu-head">
      <div class="bsplus-lu-level"><span>LV</span>${p.level}</div>
      <div class="bsplus-lu-head-text">
        <strong>${p.xp.toLocaleString()} XP</strong>
        <span>${(p.levelSpan - p.levelXp).toLocaleString()} XP to level ${p.level + 1}</span>
        <span class="bsplus-lu-bar"><span style="width:${pct.toFixed(1)}%"></span></span>
      </div>
    </header>
    <div class="bsplus-lu-stats">
      <div><strong>${p.streak}</strong><span>streak (${STREAK_THRESHOLD}%+)</span></div>
      <div><strong>${p.bestStreak}</strong><span>best streak</span></div>
      <div><strong>${p.marked}</strong><span>marked</span></div>
    </div>
    <h4 class="bsplus-lu-subhead">Achievements · ${done}/${p.achievements.length}</h4>
    <ul class="bsplus-lu-achs">${p.achievements.map(achievementHtml).join("")}</ul>
    <p class="bsplus-lu-foot">XP: your mark as points, +10 per marked task, +25 for 85%+, +50 for 100%, +15 for beating your last mark in a subject by 10+.</p>`;
}

const levelUpPlugin: Plugin<typeof settings, LevelUpStorage> = {
  id: "level-up",
  name: "Level Up",
  description: "XP, levels, streaks and achievements from your marks",
  version: "1.0.0",
  settings: instance.settings,
  styles,
  defaultEnabled: true,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};

    const pill = document.createElement("button");
    pill.id = PILL_ID;
    pill.type = "button";
    pill.hidden = true;
    pill.innerHTML = `<span class="bsplus-lu-pill-lv"></span><span class="bsplus-lu-pill-ring"></span>`;
    const pillLv = pill.querySelector<HTMLElement>(".bsplus-lu-pill-lv")!;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Level Up progress");

    let progress: Progress | null = null;

    const ensureMounted = () => {
      if (!pill.isConnected) {
        const userInfo = document.querySelector(".userInfo");
        const text = userInfo?.querySelector(".userInfoText");
        if (userInfo) userInfo.insertBefore(pill, text ?? null);
      }
      if (!panel.isConnected) document.body.appendChild(panel);
    };

    const render = () => {
      const accent = solidPageAccent();
      pill.style.setProperty("--lu-accent", accent);
      panel.style.setProperty("--lu-accent", accent);
      document.getElementById("bsplus-levelup-toasts")?.style.setProperty("--lu-accent", accent);
      if (!progress || progress.marked === 0) {
        pill.hidden = true;
        return;
      }
      pill.hidden = false;
      pillLv.textContent = `Lv ${progress.level}`;
      pill.style.setProperty(
        "--lu-pct",
        `${((progress.levelXp / Math.max(1, progress.levelSpan)) * 100).toFixed(1)}%`,
      );
      pill.title = `Level ${progress.level} · ${progress.xp.toLocaleString()} XP · streak ${progress.streak}`;
      if (!panel.hidden) panel.innerHTML = panelHtml(progress);
    };

    const announce = async (p: Progress) => {
      await api.storage.loaded;
      const seen = new Set(api.storage.unlocked ?? []);
      const nowUnlocked = p.achievements.filter((a) => a.unlocked);
      const fresh = nowUnlocked.filter((a) => !seen.has(a.id));
      if (!fresh.length) return;
      api.storage.unlocked = nowUnlocked.map((a) => a.id);
      if (!api.settings.toasts) return;

      if (seen.size === 0 && fresh.length > 1) {
        // First run: one summary instead of a wall of pop-ups.
        toast(
          `<span class="bsplus-lu-toast-icon">⚡</span><span><strong>Level Up is on: you're level ${p.level}</strong><small>${fresh.length} achievements already unlocked. Click your level to see them.</small></span>`,
        );
        return;
      }
      for (const a of fresh) {
        toast(
          `<span class="bsplus-lu-toast-icon">${a.icon}</span><span><strong>Achievement unlocked: ${escapeHtml(a.title)}</strong><small>${escapeHtml(a.description)}</small></span>`,
        );
      }
    };

    const recompute = async () => {
      try {
        const { loadGradeAnalytics } = await import("@/plugins/built-in/gradeAnalytics/api");
        const { assessments } = await loadGradeAnalytics();
        progress = computeProgress(assessments);
        render();
        void announce(progress);
      } catch (e) {
        console.warn("[BetterSEQTA+] Level Up: couldn't read grade history", e);
      }
    };

    const togglePanel = (open = panel.hidden) => {
      panel.hidden = !open;
      pill.setAttribute("aria-expanded", String(open));
      if (open && progress) {
        panel.innerHTML = panelHtml(progress);
        const r = pill.getBoundingClientRect();
        panel.style.top = `${Math.round(r.bottom + 8)}px`;
        panel.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
      }
    };

    const onPillClick = (e: MouseEvent) => {
      e.stopPropagation();
      togglePanel();
    };
    const onDocClick = (e: MouseEvent) => {
      if (!panel.hidden && !panel.contains(e.target as Node)) togglePanel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !panel.hidden) togglePanel(false);
    };
    // Analytics rewrites its cache after each sync: recompute (and maybe toast).
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && Object.keys(changes).some((k) => k.startsWith(ANALYTICS_KEY_PREFIX))) {
        void recompute();
      }
    };

    pill.addEventListener("click", onPillClick);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    browser.storage.onChanged.addListener(onStorage);
    const interval = window.setInterval(ensureMounted, 1000);

    ensureMounted();
    await recompute();

    return () => {
      window.clearInterval(interval);
      pill.removeEventListener("click", onPillClick);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
      browser.storage.onChanged.removeListener(onStorage);
      pill.remove();
      panel.remove();
      document.getElementById("bsplus-levelup-toasts")?.remove();
    };
  },
};

export default levelUpPlugin;
