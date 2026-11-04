import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import {
  booleanSetting,
  defineSettings,
  numberSetting,
  Setting,
} from "@/plugins/core/settingsHelpers";
import browser from "@/lib/browser";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { settingsState } from "@/seqta/utils/listeners/SettingsState";
import { onAssessmentEvents, type AssessmentEvent } from "@/plugins/shared/assessmentEvents";
import { weightLookupFromAveragesCache } from "@/plugins/built-in/gradeAnalytics/targetGrade";
import { summariseResult } from "./summary";

// Analytics API + the Svelte calculator are heavy and only needed when a mark
// lands or a button is clicked: load them lazily (same as Ask SEQTA does).
const analytics = () => import("@/plugins/built-in/gradeAnalytics/api");
const ui = () => import("./ui");
const openCalculator = (subject?: string) => ui().then((m) => m.openCalculator(subject));
import styles from "./styles.css?inline";
import type { Assessment } from "@/plugins/built-in/gradeAnalytics/types";

const settings = defineSettings({
  hideMark: booleanSetting({
    default: false,
    title: "Hide the mark until clicked",
    description: "For when someone can see your screen",
  }),
  confetti: booleanSetting({ default: true, title: "Confetti for good marks" }),
  confettiMin: numberSetting({
    default: 80,
    min: 0,
    max: 100,
    step: 5,
    title: "Confetti from",
    description: "Minimum mark (%) for confetti",
  }),
  assessmentButton: booleanSetting({
    default: true,
    title: '"What do I need?" button on assessment pages',
    description: "Opens the target grade calculator for the subject you're looking at",
  }),
});

class ResultsDropPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.hideMark) hideMark!: boolean;
  @Setting(settings.confetti) confetti!: boolean;
  @Setting(settings.confettiMin) confettiMin!: number;
  @Setting(settings.assessmentButton) assessmentButton!: boolean;
}
const instance = new ResultsDropPluginClass();

type Storage = { seen: number[]; primed: boolean };

const MAX_TOASTS = 3;
const GIVE_UP_MS = 60 * 60_000; // mark still not visible an hour after release
const MAX_SEEN = 1000;
const WEIGHTINGS_KEY = "plugin.assessments-average.storage.weightings";
const OVERRIDES_KEY = "plugin.assessments-average.storage.weightingOverrides";
const PILL_ID = "bsplus-rd-pill";

async function weightLookup() {
  const got = await browser.storage.local.get([WEIGHTINGS_KEY, OVERRIDES_KEY]);
  return weightLookupFromAveragesCache(
    got[WEIGHTINGS_KEY] as Record<string, { weight?: string }> | undefined,
    got[OVERRIDES_KEY] as Record<string, string> | undefined,
  );
}

const resultsDropPlugin: Plugin<typeof settings, Storage> = {
  id: "results-drop",
  name: "Results Drop",
  description:
    "A toast the moment a mark is released: your mark, how your subject average moved, and the XP you earned",
  version: "1.0.0",
  settings: instance.settings,
  disableToggle: true,
  beta: true,
  defaultEnabled: true,
  styles,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};
    await api.storage.loaded;

    let busy = false;

    const handle = async (events: AssessmentEvent[]) => {
      if (busy) return;
      busy = true;
      try {
        const seen = new Set(api.storage.seen ?? []);
        // First run: everything already there is history. Never toast-storm.
        if (!api.storage.primed) {
          api.storage.seen = events.map((e) => e.id).slice(-MAX_SEEN);
          api.storage.primed = true;
          return;
        }
        const fresh = events.filter((e) => !seen.has(e.id));
        if (!fresh.length) return;

        const markSeen = (e: AssessmentEvent) => seen.add(e.id);
        const toastable = fresh.filter((e) => e.kind === "result" || e.kind === "feedback");
        fresh.filter((e) => !toastable.includes(e)).forEach(markSeen);

        // One past-list fetch per class, however many results it released.
        const byClass = new Map<string, AssessmentEvent[]>();
        for (const e of toastable) {
          const k = `${e.programmeID}:${e.metaclassID}`;
          byClass.set(k, [...(byClass.get(k) ?? []), e]);
        }
        const weightOf = await weightLookup();
        const [{ syncSubjectPast }, { confetti, plainToast, resultToast }] = await Promise.all([
          analytics(),
          ui(),
        ]);
        let shown = 0;
        let overflow = 0;

        for (const list of byClass.values()) {
          const { programmeID, metaclassID } = list[0];
          let synced: { before: Assessment[]; after: Assessment[] };
          try {
            synced = await syncSubjectPast(programmeID, metaclassID);
          } catch (e) {
            console.warn("[BetterSEQTA+] Results Drop: past list failed", e);
            continue; // try again next poll
          }
          for (const e of list) {
            const summary = summariseResult(e.assessmentID, synced.before, synced.after, weightOf);
            const age = Date.now() - new Date(e.timestamp.replace(" ", "T")).getTime();
            // Release lag: the notification can beat the mark. Retry next poll.
            if (e.kind === "result" && (!summary || summary.grade == null) && age < GIVE_UP_MS) {
              continue;
            }
            markSeen(e);
            if (shown >= MAX_TOASTS) {
              overflow++;
              continue;
            }
            shown++;
            if (!summary) {
              plainToast(e.kind === "feedback" ? "Feedback released" : "Results released", e.title);
              continue;
            }
            const el = resultToast(summary, e.kind as "result" | "feedback", {
              hideMark: api.settings.hideMark,
              onCalculator: (subject) => void openCalculator(subject),
            });
            if (
              api.settings.confetti &&
              !api.settings.hideMark &&
              summary.grade != null &&
              summary.grade >= api.settings.confettiMin
            ) {
              requestAnimationFrame(() => confetti(el));
            }
          }
        }
        if (overflow) plainToast(`+${overflow} more released`, "Check Assessments for the rest.");
        api.storage.seen = [...seen].slice(-MAX_SEEN);
      } finally {
        busy = false;
      }
    };

    const unsubEvents = onAssessmentEvents((events) => {
      if (settingsState.hideSensitiveContent) return;
      void handle(events);
    });

    // "What do I need?" pill on assessment pages, preset to that class's subject.
    const updatePill = async () => {
      const match = /page=\/assessments\/(\d+):(\d+)/.exec(location.hash);
      let pill = document.getElementById(PILL_ID);
      if (!match || !api.settings.assessmentButton) {
        pill?.remove();
        return;
      }
      if (!pill) {
        pill = document.createElement("button");
        pill.id = PILL_ID;
        pill.textContent = "🎯 What do I need?";
        document.body.appendChild(pill);
      }
      const [, programme, metaclass] = match.map(Number);
      pill.onclick = async () => {
        const { assessments } = await (await analytics()).loadGradeAnalytics();
        const subject = assessments.find(
          (a) => a.programmeID === programme && a.metaclassID === metaclass,
        )?.subject;
        void openCalculator(subject);
      };
    };
    window.addEventListener("hashchange", updatePill);
    void updatePill();
    const unsubPill = api.settings.onChange("assessmentButton", () => void updatePill());

    return () => {
      unsubEvents();
      unsubPill.unregister();
      window.removeEventListener("hashchange", updatePill);
      document.getElementById(PILL_ID)?.remove();
      document.getElementById("bsplus-rd-modal")?.remove();
    };
  },
};

export default resultsDropPlugin;
