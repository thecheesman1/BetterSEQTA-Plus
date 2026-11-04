import browser from "@/lib/browser";
import { BasePlugin } from "../../core/settings";
import { type Plugin } from "@/plugins/core/types";
import { defineSettings, Setting, stringSetting } from "@/plugins/core/settingsHelpers";
import { isSeqtaEngageExperience } from "@/seqta/utils/isSeqtaEngage";
import { solidPageAccent } from "@/seqta/ui/colors/pageAccent";
import { buildSeqtaContext } from "./context";
import styles from "./styles.css?inline";

const settings = defineSettings({
  serverUrl: stringSetting({
    default: "http://localhost:8737",
    title: "Bridge URL",
    description:
      "Your Ask SEQTA bridge. Run bridge/ask-seqta on your own computer, signed in to your own Claude account",
  }),
  personality: stringSetting({
    default: "",
    title: "Personality",
    description:
      "How Ask SEQTA talks (your own system prompt for its voice). Leave empty for the default: your Discord bot's personality, typing like it's in a Discord channel. It always sticks to your real SEQTA data either way",
    maxLength: 2000,
  }),
  accessKey: stringSetting({
    default: "",
    title: "Access key",
    description: "Only needed if your bridge uses keys.json",
  }),
});

class AskSeqtaPluginClass extends BasePlugin<typeof settings> {
  @Setting(settings.serverUrl)
  serverUrl!: string;

  @Setting(settings.personality)
  personality!: string;

  @Setting(settings.accessKey)
  accessKey!: string;
}

const instance = new AskSeqtaPluginClass();

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "what's on tmrw?",
  "what's due this week?",
  "any messages i should care about?",
  "how cooked am i in maths?",
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Tiny, safe markdown: escape first, then **bold**, `code`, bullet lists, paragraphs. */
function renderAnswer(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/) ?? line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      list.push(inline(bullet[1]));
      continue;
    }
    flush();
    if (line) out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

const askSeqtaPlugin: Plugin<typeof settings> = {
  id: "ask-seqta",
  name: "Ask SEQTA",
  description: "Ask questions about your timetable, assessments, marks and messages",
  version: "1.0.0",
  settings: instance.settings,
  // Despite the name, this is what shows the plugin's on/off switch in settings.
  disableToggle: true,
  styles,
  defaultEnabled: true,
  beta: true,

  run: async (api) => {
    if (isSeqtaEngageExperience()) return () => {};

    const fab = document.createElement("button");
    fab.id = "bsplus-ask-fab";
    fab.type = "button";
    fab.title = "Ask SEQTA (Alt+A)";
    fab.innerHTML = `<span aria-hidden="true">✨</span><span>Ask</span>`;

    const panel = document.createElement("section");
    panel.id = "bsplus-ask-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Ask SEQTA");
    panel.innerHTML = `
      <header>
        <strong>✨ Ask SEQTA</strong>
        <button type="button" class="bsplus-ask-icon" data-act="clear" title="New chat">↺</button>
        <button type="button" class="bsplus-ask-icon" data-act="close" title="Close (Esc)">✕</button>
      </header>
      <div class="bsplus-ask-log" aria-live="polite"></div>
      <div class="bsplus-ask-suggest"></div>
      <form class="bsplus-ask-form">
        <textarea rows="1" maxlength="2000" placeholder="ask me anything about ur school stuff…"></textarea>
        <button type="submit" title="Send (Enter)">➤</button>
      </form>
      <p class="bsplus-ask-privacy"></p>`;

    const log = panel.querySelector<HTMLElement>(".bsplus-ask-log")!;
    const suggest = panel.querySelector<HTMLElement>(".bsplus-ask-suggest")!;
    const form = panel.querySelector<HTMLFormElement>(".bsplus-ask-form")!;
    const input = panel.querySelector<HTMLTextAreaElement>("textarea")!;
    const sendBtn = form.querySelector<HTMLButtonElement>("button")!;
    const privacy = panel.querySelector<HTMLElement>(".bsplus-ask-privacy")!;

    /** Dev only (stripped from production): localStorage overrides for testing. */
    const devOverride = (name: string): string | null => {
      if (!import.meta.env.DEV) return null;
      try {
        return localStorage.getItem(`bsplus-ask-dev-${name}`);
      } catch {
        return null;
      }
    };
    const serverUrl = () => devOverride("server") ?? api.settings.serverUrl;
    const accessKey = () => devOverride("key") ?? api.settings.accessKey;

    let history: Turn[] = [];
    let busy = false;

    const host = () => {
      try {
        return new URL(serverUrl()).host;
      } catch {
        return "the configured server";
      }
    };

    const bubble = (role: "user" | "assistant" | "error" | "pending", html: string) => {
      const el = document.createElement("div");
      el.className = `bsplus-ask-msg is-${role}`;
      el.innerHTML = html;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    };

    const renderSuggestions = () => {
      suggest.hidden = history.length > 0;
      suggest.innerHTML = SUGGESTIONS.map(
        (s) => `<button type="button">${escapeHtml(s)}</button>`,
      ).join("");
    };

    const ask = async (question: string) => {
      if (busy || !question.trim()) return;
      busy = true;
      sendBtn.disabled = true;
      suggest.hidden = true;
      bubble("user", escapeHtml(question));
      const pending = bubble("pending", "<span></span><span></span><span></span>");
      try {
        const context = await buildSeqtaContext();
        const res = (await browser.runtime.sendMessage({
          type: "askSeqta",
          server: serverUrl(),
          key: accessKey(),
          question,
          context,
          history: history.slice(-6),
          style: api.settings.personality,
        })) as { answer?: string; error?: string } | undefined;
        pending.remove();
        if (!res || res.error) {
          bubble("error", escapeHtml(res?.error ?? "nothing came back. weird."));
          return;
        }
        const answer = res.answer ?? "";
        history.push({ role: "user", content: question }, { role: "assistant", content: answer });
        bubble("assistant", renderAnswer(answer));
      } catch {
        pending.remove();
        bubble("error", "couldn't grab your SEQTA data. SEQTA being SEQTA, probably.");
      } finally {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      }
    };

    const open = (show: boolean = panel.hidden !== false) => {
      panel.hidden = !show;
      fab.classList.toggle("is-open", show);
      if (show) {
        const accent = solidPageAccent();
        panel.style.setProperty("--ask-accent", accent);
        privacy.textContent = `Your question and a snapshot of your SEQTA data (timetable, assessments, marks, recent messages) are sent to ${host()} to answer it.`;
        renderSuggestions();
        input.focus();
        void buildSeqtaContext(); // warm the cache while they type
      }
    };

    const onFab = () => open();
    const onPanelClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "close") open(false);
      if (act === "clear") {
        history = [];
        log.innerHTML = "";
        renderSuggestions();
      }
      const chip = t.closest("button");
      if (chip && chip.parentElement === suggest) void ask(chip.textContent ?? "");
    };
    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      const q = input.value;
      input.value = "";
      input.style.height = "";
      void ask(q);
    };
    const onInputKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    const onInput = () => {
      input.style.height = "";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        open();
      } else if (e.key === "Escape" && !panel.hidden) {
        open(false);
      }
    };

    fab.addEventListener("click", onFab);
    panel.addEventListener("click", onPanelClick);
    form.addEventListener("submit", onSubmit);
    input.addEventListener("keydown", onInputKey);
    input.addEventListener("input", onInput);
    document.addEventListener("keydown", onDocKey);

    const mount = () => {
      fab.style.setProperty("--ask-accent", solidPageAccent());
      if (!fab.isConnected) document.body.appendChild(fab);
      if (!panel.isConnected) document.body.appendChild(panel);
    };
    mount();
    const interval = window.setInterval(mount, 2000);

    return () => {
      window.clearInterval(interval);
      fab.removeEventListener("click", onFab);
      panel.removeEventListener("click", onPanelClick);
      form.removeEventListener("submit", onSubmit);
      input.removeEventListener("keydown", onInputKey);
      input.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onDocKey);
      fab.remove();
      panel.remove();
    };
  },
};

export default askSeqtaPlugin;
