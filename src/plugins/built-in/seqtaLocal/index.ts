import { type Plugin } from "@/plugins/core/types";
import browser from "@/lib/browser";

/** Re-push often enough that a restarted server picks the session up quickly. */
const PUSH_EVERY_MS = 2 * 60_000;

const push = () =>
  browser.runtime.sendMessage({ type: "seqtaLocalPush" }).catch(() => undefined);

const seqtaLocalPlugin: Plugin<{}> = {
  id: "seqta-local",
  name: "SEQTA Local",
  description:
    "Shares your SEQTA session with the SEQTA Local server on this computer (localhost:28661) so it can show your data in its own web UI",
  version: "1.0.0",
  settings: {},
  // Despite the name, this is what shows the plugin's on/off switch in settings.
  disableToggle: true,
  beta: true,
  // Sends your session cookie somewhere, so it's strictly opt-in.
  defaultEnabled: false,

  run: async () => {
    void push();
    const interval = window.setInterval(push, PUSH_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void push();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  },
};

export default seqtaLocalPlugin;
