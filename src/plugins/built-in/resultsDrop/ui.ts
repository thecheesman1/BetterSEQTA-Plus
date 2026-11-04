import { mount, unmount } from "svelte";
import TargetGradeCalculator from "@/plugins/built-in/gradeAnalytics/TargetGradeCalculator.svelte";
import { loadGradeAnalytics } from "@/plugins/built-in/gradeAnalytics/api";
import { syncThemeFromPage } from "@/plugins/built-in/gradeAnalytics/ui";
import { solidPageAccent } from "@/seqta/ui/colors/pageAccent";
import { escapeHtml } from "@/plugins/shared/homeLessons";
import type { ResultSummary } from "./summary";

const STACK_ID = "bsplus-levelup-toasts"; // shared with Level Up so toasts stack, not overlap
const LIFETIME_MS = 15_000;

function stack(): HTMLElement {
  let el = document.getElementById(STACK_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = STACK_ID;
    el.style.setProperty("--lu-accent", solidPageAccent());
    document.body.appendChild(el);
  }
  return el;
}

const pct = (n: number | null) => (n == null ? "–" : `${n.toFixed(1)}%`);

export type ToastOptions = {
  hideMark: boolean;
  onCalculator: (subject: string) => void;
};

/** Slide in a toast; hovering pauses the auto-dismiss. Returns the element. */
function showToast(html: string, extraClass = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = `bsplus-rd-toast ${extraClass}`;
  el.innerHTML = html;
  stack().appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));

  let remaining = LIFETIME_MS;
  let started = Date.now();
  let timer = window.setTimeout(close, remaining);
  function close() {
    el.classList.remove("is-in");
    window.setTimeout(() => el.remove(), 400);
  }
  el.addEventListener("mouseenter", () => {
    window.clearTimeout(timer);
    remaining -= Date.now() - started;
  });
  el.addEventListener("mouseleave", () => {
    started = Date.now();
    timer = window.setTimeout(close, Math.max(2000, remaining));
  });
  el.querySelector(".bsplus-rd-close")?.addEventListener("click", close);
  return el;
}

export function resultToast(s: ResultSummary, kind: "result" | "feedback", opts: ToastOptions) {
  const a = s.assessment;
  const href = `#?page=/assessments/${a.programmeID}:${a.metaclassID}&item=${a.id}`;
  const markText = s.grade != null ? `${Math.round(s.grade)}%` : (s.letter ?? "");
  const delta =
    s.averageBefore != null && s.averageAfter != null ? s.averageAfter - s.averageBefore : null;
  const deltaHtml =
    delta == null
      ? ""
      : `<div class="bsplus-rd-delta">Average ${pct(s.averageBefore)} → <b>${pct(s.averageAfter)}</b>
           <span class="${delta >= 0 ? "is-up" : "is-down"}">${delta >= 0 ? "▲" : "▼"}${Math.abs(delta).toFixed(1)}</span>${
             s.xp ? ` · <span class="bsplus-rd-xp">+${s.xp} XP</span>` : ""
           }</div>`;

  const heading =
    kind === "feedback" ? "Feedback released" : markText ? "Result released" : "Results released";
  const el = showToast(
    `<div class="bsplus-rd-top"><span>${escapeHtml(heading)} · ${escapeHtml(a.subject)}</span><button class="bsplus-rd-close" aria-label="Dismiss">×</button></div>
     <div class="bsplus-rd-title">${escapeHtml(a.title)}</div>
     ${
       markText && kind === "result"
         ? `<button class="bsplus-rd-mark${opts.hideMark ? " is-hidden" : ""}" title="${opts.hideMark ? "Click to reveal" : ""}">${escapeHtml(markText)}</button>`
         : ""
     }
     ${kind === "result" ? deltaHtml : ""}
     <div class="bsplus-rd-actions">
       <a href="${href}">Open</a>
       <button class="bsplus-rd-calc">🎯 What do I need?</button>
     </div>`,
    kind === "feedback" ? "is-feedback" : "",
  );
  el.querySelector(".bsplus-rd-mark")?.addEventListener("click", (e) =>
    (e.currentTarget as HTMLElement).classList.remove("is-hidden"),
  );
  el.querySelector(".bsplus-rd-calc")?.addEventListener("click", () =>
    opts.onCalculator(a.subject),
  );
  return el;
}

export function plainToast(title: string, sub: string) {
  showToast(
    `<div class="bsplus-rd-top"><span>${escapeHtml(title)}</span><button class="bsplus-rd-close" aria-label="Dismiss">×</button></div>
     <div class="bsplus-rd-title">${escapeHtml(sub)}</div>`,
  );
}

/** A short canvas confetti burst from an element. Skipped for reduced motion. */
export function confetti(from: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = from.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.className = "bsplus-rd-confetti";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const colours = ["#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#a78bfa", solidPageAccent()];
  const parts = Array.from({ length: 90 }, () => ({
    x: rect.left + rect.width / 2,
    y: rect.top + 20,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 5 + Math.random() * 6,
    c: colours[Math.floor(Math.random() * colours.length)],
  }));
  const start = performance.now();
  const frame = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - age / 1600);
    for (const p of parts) {
      p.vy += 0.45;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      ctx.restore();
    }
    if (age < 1600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** The Analytics target calculator in a modal, preset to `subject`. */
export async function openCalculator(subject?: string) {
  document.getElementById("bsplus-rd-modal")?.remove();
  const { assessments } = await loadGradeAnalytics();

  const overlay = document.createElement("div");
  overlay.id = "bsplus-rd-modal";
  overlay.innerHTML = `<div class="bsplus-rd-modal-box bsplus-analytics-mount bsplus-analytics-root"><button class="bsplus-rd-modal-close" aria-label="Close">×</button><div class="bsplus-rd-modal-body"></div></div>`;
  document.body.appendChild(overlay);
  // Same theme tokens + dark class the Analytics page applies to its mount.
  syncThemeFromPage(overlay.querySelector<HTMLElement>(".bsplus-rd-modal-box")!);
  const body = overlay.querySelector<HTMLElement>(".bsplus-rd-modal-body")!;

  if (!assessments.length) {
    body.innerHTML = `<p class="bsplus-rd-empty">Open <b>Analytics</b> once so it can sync your grades, then this works anywhere.</p>`;
  }
  const app = assessments.length
    ? mount(TargetGradeCalculator, {
        target: body,
        props: { data: assessments, initialSubject: subject },
      })
    : null;

  const close = () => {
    if (app) void unmount(app);
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector(".bsplus-rd-modal-close")!.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}
