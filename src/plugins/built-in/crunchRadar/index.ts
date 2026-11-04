import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import {
  defineSettings,
  numberSetting,
  selectSetting,
  Setting,
} from "@/plugins/core/settingsHelpers";
import browser from "@/lib/browser";
import { getUserInfo } from "@/seqta/utils/userInfo";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { addDays, parseYmd, ymd } from "@/plugins/shared/dates";
import { getLessons, getSubjectColours } from "@/plugins/shared/timetableCache";
import { onAssessmentEvents } from "@/plugins/shared/assessmentEvents";
import { escapeHtml } from "@/plugins/shared/homeLessons";
import { buildRadar, itemLoad, type RadarItem, type RadarWeek } from "./load";
import styles from "./styles.css?inline";

const settings = defineSettings({
  daysAhead: selectSetting({
    options: ["7", "14", "21"] as const,
    default: "14",
    title: "Days ahead",
    description: "How far ahead the radar looks",
  }),
  crunchThreshold: numberSetting({
    default: 4,
    min: 1,
    max: 20,
    step: 0.5,
    title: "Crunch threshold",
    description:
      "Weekly load that counts as a crunch week (10% of a subject = 1, unknown weight = 1)",
  }),
});

class CrunchRadarPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.daysAhead)
  daysAhead!: "7" | "14" | "21";

  @Setting(settings.crunchThreshold)
  crunchThreshold!: number;
}
const instance = new CrunchRadarPluginClass();

const ROOT_CLASS = "bsplus-crunch";
const WEIGHTINGS_KEY = "plugin.assessments-average.storage.weightings";
const OVERRIDES_KEY = "plugin.assessments-average.storage.weightingOverrides";

async function loadWeights(): Promise<(id: number) => number | null> {
  const got = await browser.storage.local.get([WEIGHTINGS_KEY, OVERRIDES_KEY]);
  const weights = (got[WEIGHTINGS_KEY] ?? {}) as Record<string, { weight?: string }>;
  const overrides = (got[OVERRIDES_KEY] ?? {}) as Record<string, string>;
  return (id) => {
    const n = Number.parseFloat(overrides[String(id)] ?? weights[String(id)]?.weight ?? "");
    return Number.isFinite(n) && n > 0 ? n : null;
  };
}

async function loadItems(calendarDays: number): Promise<RadarItem[]> {
  const today = ymd();
  const { id: student } = await getUserInfo();
  const [upcomingRes, lessons, weightOf] = await Promise.all([
    fetch(`${location.origin}/seqta/student/assessment/list/upcoming?`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ student }),
    }).then((r) => r.json()),
    getLessons(today, addDays(today, calendarDays - 1)).catch(() => []),
    loadWeights(),
  ]);

  const items: RadarItem[] = [];
  for (const a of (upcomingRes?.payload ?? []) as Record<string, unknown>[]) {
    const id = Number(a.id);
    if (!id || !a.due) continue;
    items.push({
      id,
      title: String(a.title ?? ""),
      subject: String(a.subject ?? a.code ?? ""),
      code: String(a.code ?? ""),
      due: String(a.due).slice(0, 10),
      programmeID: Number(a.programmeID ?? 0),
      metaclassID: Number(a.metaclassID ?? 0),
      weight: weightOf(id),
      inClass: false,
    });
  }
  // In-class tasks the timetable knows about (deduped by id in buildRadar).
  for (const l of lessons) {
    for (const a of l.assessments) {
      if (!a.id) continue;
      items.push({
        id: a.id,
        title: a.title,
        subject: l.description,
        code: l.code,
        due: l.date,
        programmeID: l.programmeID,
        metaclassID: l.metaID,
        weight: weightOf(a.id),
        inClass: true,
      });
    }
  }
  return items;
}

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function render(
  root: HTMLElement,
  weeks: RadarWeek[],
  colours: Map<string, string>,
  daysAhead: number,
) {
  const today = ymd();
  const maxLoad = Math.max(3, ...weeks.flatMap((w) => w.days.map((d) => d.load)));
  const total = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.items.length, 0), 0);
  const crunchWeeks = weeks.filter((w) => w.crunch).length;

  const weekHtml = weeks
    .map((w) => {
      const days = w.days
        .map((d) => {
          const bars = d.items
            .map((it) => {
              const h = (itemLoad(it) / maxLoad) * 100;
              const c = colours.get(it.code) ?? "var(--better-pale, #8e8e8e)";
              return `<span class="bsplus-crunch-bar" style="height:${h.toFixed(1)}%;--c:${escapeHtml(c)}"></span>`;
            })
            .join("");
          const list = d.items
            .map((it) => {
              const href = `#?page=/assessments/${it.programmeID}:${it.metaclassID}&item=${it.id}`;
              const meta = [it.weight != null ? `${it.weight}%` : "", it.inClass ? "in class" : ""]
                .filter(Boolean)
                .join(" · ");
              return `<a class="bsplus-crunch-item" href="${href}" style="--c:${escapeHtml(colours.get(it.code) ?? "#8e8e8e")}"><b>${escapeHtml(it.subject)}</b><span>${escapeHtml(it.title)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</a>`;
            })
            .join("");
          const date = parseYmd(d.date);
          return `<div class="bsplus-crunch-day${d.date === today ? " is-today" : ""}${d.items.length ? " has-items" : ""}" tabindex="${d.items.length ? 0 : -1}">
              <div class="bsplus-crunch-bars">${bars}</div>
              <div class="bsplus-crunch-label"><span>${DAY_FMT.format(date)}</span><b>${date.getDate()}</b>${d.weekend ? '<i title="Includes something due on the weekend">•</i>' : ""}</div>
              ${d.items.length ? `<div class="bsplus-crunch-pop">${list}</div>` : ""}
            </div>`;
        })
        .join("");
      return `<div class="bsplus-crunch-week${w.crunch ? " is-crunch" : ""}">
          ${w.crunch ? '<div class="bsplus-crunch-flag">⚠ crunch week</div>' : ""}
          <div class="bsplus-crunch-days">${days}</div>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <div class="bsplus-crunch-head">
      <h2 class="home-subtitle">Crunch Radar</h2>
      <span class="bsplus-crunch-summary">${
        total
          ? `${total} due in the next ${daysAhead} days${crunchWeeks ? ` · <b>${crunchWeeks} crunch week${crunchWeeks > 1 ? "s" : ""}</b>` : ""}`
          : `Nothing due in the next ${daysAhead} days`
      }</span>
    </div>
    <div class="bsplus-crunch-grid">${weekHtml}</div>`;
}

const crunchRadarPlugin: Plugin<typeof settings> = {
  id: "crunch-radar",
  name: "Crunch Radar",
  description: "A strip on home showing how much is due each day for the next few weeks",
  version: "1.0.0",
  settings: instance.settings,
  disableToggle: true,
  beta: true,
  defaultEnabled: true,
  styles,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};

    let generation = 0;
    const draw = async () => {
      const home = document.getElementById("home-container");
      if (!home) return;
      let root = home.querySelector<HTMLElement>(`:scope > .${ROOT_CLASS}`);
      if (!root) {
        root = document.createElement("div");
        root.className = `border ${ROOT_CLASS}`;
        root.innerHTML = `<div class="bsplus-crunch-head"><h2 class="home-subtitle">Crunch Radar</h2></div><div class="bsplus-crunch-loading"></div>`;
        home.insertBefore(root, home.querySelector(":scope > .upcoming-container"));
      }
      const gen = ++generation;
      const daysAhead = Number(api.settings.daysAhead);
      try {
        const [items, colours] = await Promise.all([
          loadItems(daysAhead),
          getSubjectColours().catch(() => new Map<string, string>()),
        ]);
        if (gen !== generation || !root.isConnected) return;
        render(
          root,
          buildRadar(items, ymd(), daysAhead, api.settings.crunchThreshold),
          colours,
          daysAhead,
        );
      } catch (e) {
        console.warn("[BetterSEQTA+] Crunch radar failed", e);
        if (root.isConnected) root.remove();
      }
    };

    const mount = api.seqta.onMount("#home-container", () => void draw());
    if (document.getElementById("home-container")) void draw();

    // A newly published assessment ("Details for … released") → redraw.
    let knownPublished: Set<number> | null = null;
    const unsubEvents = onAssessmentEvents((events) => {
      const ids = new Set(events.filter((e) => e.kind === "published").map((e) => e.id));
      const fresh = knownPublished && [...ids].some((id) => !knownPublished!.has(id));
      knownPublished = ids;
      if (fresh) void draw();
    });
    const unsubDays = api.settings.onChange("daysAhead", () => void draw());
    const unsubThreshold = api.settings.onChange("crunchThreshold", () => void draw());

    return () => {
      mount.unregister();
      unsubEvents();
      unsubDays.unregister();
      unsubThreshold.unregister();
      document.querySelectorAll(`.${ROOT_CLASS}`).forEach((e) => e.remove());
    };
  },
};

export default crunchRadarPlugin;
