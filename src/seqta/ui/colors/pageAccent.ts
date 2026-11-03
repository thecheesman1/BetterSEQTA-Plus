import { extractSolidColor } from "./parseCssColor";
import { settingsState } from "@/seqta/utils/listeners/SettingsState";

/**
 * A solid accent colour for the current theme. --better-main can be a
 * gradient, which color-mix() rejects (taking the whole declaration with it),
 * so pull the first solid stop out of it.
 */
export function solidPageAccent(fallback = "#3b82f6"): string {
  const fromVar = extractSolidColor(
    getComputedStyle(document.documentElement).getPropertyValue("--better-main"),
  );
  if (fromVar) return fromVar;
  const fromSettings = settingsState.selectedColor?.trim();
  return (fromSettings && extractSolidColor(fromSettings)) || fallback;
}
