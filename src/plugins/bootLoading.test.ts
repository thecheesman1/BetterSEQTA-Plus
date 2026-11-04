/**
 * Plugin settings and storage only load at boot if they're listed:
 *  - settings: SYNCABLE_PLUGIN_SETTING_DEFAULTS (plugins/syncablePluginDefaults.ts)
 *  - storage:  PLUGIN_STORAGE_KEYS (seqta/utils/listeners/SettingsState.ts)
 * Anything unlisted is written to disk but comes back empty on every page load
 * (on/off switches reset, notes vanish). These checks keep new plugins honest.
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { SYNCABLE_PLUGIN_SETTING_DEFAULTS } from "./syncablePluginDefaults";

const BUILT_IN = join(__dirname, "built-in");
const SETTINGS_STATE = readFileSync(
  join(__dirname, "..", "seqta", "utils", "listeners", "SettingsState.ts"),
  "utf8",
);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(dir, e.name))
      : /\.(ts|svelte)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

const plugins = readdirSync(BUILT_IN, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .flatMap((e) => {
    const entry = ["index.ts", "lazy.ts"].map((f) => join(BUILT_IN, e.name, f)).find(existsSync);
    if (!entry) return [];
    const id = /\bid:\s*"([^"]+)"/.exec(readFileSync(entry, "utf8"))?.[1];
    return id ? [{ dir: join(BUILT_IN, e.name), id }] : [];
  });

describe("plugin boot loading", () => {
  it("finds the built-in plugins", () => {
    expect(plugins.length).toBeGreaterThan(20);
  });

  it.each(plugins.map((p) => [p.id, p]))("%s has its settings listed", (_id, p) => {
    expect(Object.keys(SYNCABLE_PLUGIN_SETTING_DEFAULTS)).toContain(p.id);
  });

  it.each(plugins.map((p) => [p.id, p]))("%s's api.storage keys are listed", (_id, p) => {
    const keys = new Set<string>();
    for (const file of walk(p.dir)) {
      for (const m of readFileSync(file, "utf8").matchAll(/\bapi\.storage\.(\w+)\s*=[^=]/g)) {
        keys.add(m[1]);
      }
    }
    for (const key of keys) {
      expect(SETTINGS_STATE).toContain(`"plugin.${p.id}.storage.${key}"`);
    }
  });
});
