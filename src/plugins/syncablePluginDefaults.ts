/**
 * Serializable plugin setting defaults for cloud sync backfill.
 *
 * Kept separate from `@/plugins` so the service worker never imports Svelte UI or
 * Vite HMR clients. Values must match each plugin's non-component settings.
 */
function defaultSearchHotkey(): string {
  if (typeof navigator !== "undefined") {
    return navigator.platform.toUpperCase().includes("MAC") ? "cmd+k" : "ctrl+k";
  }
  return "ctrl+k";
}

/** `plugin.<id>.settings` defaults (component/button keys omitted). */
export const SYNCABLE_PLUGIN_SETTING_DEFAULTS: Record<string, Record<string, unknown>> = {
  themes: {},
  "animated-background": { speed: 1 },
  "assessments-average": { lettergrade: false },
  notificationCollector: { saveLocally: true },
  timetable: {},
  timetableEdit: {},
  "profile-picture": { useCloudPfp: false },
  "assessments-overview": {},
  "background-music": { volume: 0.5, pauseOnHidden: true },
  messageFolders: {
    showTagsInAllMessages: true,
  },
  "enhanced-navigation": { autoScrollOnClick: false },
  "global-search": {
    searchHotkey: defaultSearchHotkey(),
    showRecentFirst: true,
    transparencyEffects: true,
    runIndexingOnLoad: true,
    passiveIndexing: true,
  },
  "grade-analytics": { cacheTtlHours: 24 },
  "error-page-kitten": {},
  "timetable-classmates": { enabled: false },
  // Fork plugins. A plugin MUST be listed here or its settings (including its
  // on/off switch) aren't loaded at boot and silently reset on every page load.
  "lesson-countdown": { showRoom: true, showNextInBreaks: true },
  "level-up": { toasts: true },
  "ask-seqta": { serverUrl: "http://localhost:8737", personality: "", accessKey: "" },
  "glow-up": { preset: "Your theme", motion: true },
  "seqta-local": {},
  "app-icons": {},
  "change-alert": { checkTomorrow: true },
  "crunch-radar": { daysAhead: "14", crunchThreshold: 4 },
  "results-drop": { hideMark: false, confetti: true, confettiMin: 80, assessmentButton: true },
  "lesson-notes": { quickCapture: true },
  "class-mode": { showNext: true, autoOpen: false },
};
