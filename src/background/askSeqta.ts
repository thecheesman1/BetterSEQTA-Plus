/**
 * Relays Ask SEQTA questions from the content script to the bridge server.
 * Done here (not in the content script) so the request isn't subject to the
 * SEQTA page's CORS / private-network rules: the extension's host
 * permissions cover it.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TIMEOUT_MS = 100_000;

export type AskSeqtaRequest = {
  server?: unknown;
  key?: unknown;
  question?: unknown;
  context?: unknown;
  history?: unknown;
};

export async function handleAskSeqta(
  req: AskSeqtaRequest,
): Promise<{ answer?: string; error?: string }> {
  let url: URL;
  try {
    url = new URL(`${String(req.server ?? "").replace(/\/+$/, "")}/ask`);
  } catch {
    return { error: "The Ask SEQTA server URL in settings isn't valid." };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    return { error: "Use an https:// server URL (plain http is only allowed for localhost)." };
  }

  const key = typeof req.key === "string" ? req.key.trim() : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The bridge's CSRF guard: web pages can't send this without a CORS
        // preflight, which the bridge never approves.
        "X-Ask-Seqta": "1",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        question: String(req.question ?? ""),
        context: String(req.context ?? ""),
        history: Array.isArray(req.history) ? req.history : [],
      }),
      signal: controller.signal,
      credentials: "omit",
    });
    const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
    if (!res.ok) return { error: data.error || `The server answered ${res.status}.` };
    return { answer: String(data.answer ?? "") };
  } catch (e) {
    return {
      error:
        (e as Error)?.name === "AbortError"
          ? "The server took too long to answer."
          : LOCAL_HOSTS.has(url.hostname)
            ? "Couldn't reach your Ask SEQTA bridge. Is it running? In bridge/ask-seqta run: node server.mjs"
            : "Couldn't reach the Ask SEQTA server.",
    };
  } finally {
    clearTimeout(timer);
  }
}
