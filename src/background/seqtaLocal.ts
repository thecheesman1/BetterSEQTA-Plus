/**
 * SEQTA Local: hands the SEQTA session to a Flask server on this computer
 * (127.0.0.1:28661) so it can serve a fully custom web UI. Schools on SSO
 * (SAML) can't log in from a script, so the server borrows the browser's
 * session instead. The cookie is HttpOnly, so only the background (with the
 * `cookies` permission) can read it.
 *
 * Only ever sends to loopback; the server rejects requests without the
 * X-Seqta-Local header, which web pages can't add without a CORS preflight
 * the server never approves.
 */
import browser from "@/lib/browser";

export const SEQTA_LOCAL_PORT = 28661;
const SESSION_URL = `http://127.0.0.1:${SEQTA_LOCAL_PORT}/api/session`;
const TIMEOUT_MS = 5_000;

export async function pushSeqtaSession(origin: string): Promise<{ ok?: boolean; error?: string }> {
  let cookies: chrome.cookies.Cookie[];
  try {
    cookies = await browser.cookies.getAll({ url: origin });
  } catch {
    return { error: "Couldn't read SEQTA cookies (is the cookies permission granted?)" };
  }
  if (!cookies.some((c) => c.name === "JSESSIONID")) return { error: "Not logged in to SEQTA" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Seqta-Local": "1" },
      body: JSON.stringify({
        origin,
        // Load balancers may pin the session to a node, so send the whole jar.
        cookies: cookies.map((c) => ({ name: c.name, value: c.value, path: c.path })),
      }),
      credentials: "omit",
      signal: controller.signal,
    });
    return res.ok ? { ok: true } : { error: `SEQTA Local answered ${res.status}` };
  } catch {
    // Server not running: expected whenever you're not using it.
    return { error: "SEQTA Local server isn't running" };
  } finally {
    clearTimeout(timer);
  }
}
