/**
 * Home page lesson cards (`#day-container .day`) carry data-bsplus-date and
 * data-bsplus-from (set in LoadHomePage). SEQTA/BetterSEQTA re-render them when
 * you change day, so watch the container and hand plugins the fresh cards.
 */

export type HomeLessonCard = {
  el: HTMLElement;
  date: string;
  from: string;
  code: string;
  programmeID: number;
  metaID: number;
};

export function readHomeCards(): HomeLessonCard[] {
  return [...document.querySelectorAll<HTMLElement>("#day-container .day")]
    .filter((el) => el.dataset.bsplusDate && el.dataset.bsplusFrom)
    .map((el) => ({
      el,
      date: el.dataset.bsplusDate!,
      from: el.dataset.bsplusFrom!,
      code: el.dataset.bsplusCode ?? "",
      programmeID: Number(el.dataset.bsplusProgrammeId ?? 0),
      metaID: Number(el.dataset.bsplusMetaId ?? 0),
    }));
}

/**
 * Calls `cb` with the current cards whenever the home lesson strip re-renders.
 * Our own edits inside cards are ignored (only direct children changes count).
 */
export function watchHomeLessons(cb: (cards: HomeLessonCard[]) => void): () => void {
  let observed: Element | null = null;
  let scheduled = false;
  const fire = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const cards = readHomeCards();
      if (cards.length) cb(cards);
    });
  };
  const childObserver = new MutationObserver(fire);
  const attach = () => {
    const container = document.getElementById("day-container");
    if (container === observed) return;
    childObserver.disconnect();
    observed = container;
    if (container) {
      childObserver.observe(container, { childList: true });
      fire();
    }
  };
  // #main is swapped wholesale on navigation; re-find the container cheaply.
  const interval = window.setInterval(attach, 1000);
  attach();
  return () => {
    window.clearInterval(interval);
    childObserver.disconnect();
  };
}

/** Insert (or keep) a plugin-owned element in a home card, idempotently. */
export function upsertInCard(card: HTMLElement, className: string, make: () => HTMLElement) {
  let el = card.querySelector<HTMLElement>(`:scope > .${className}`);
  if (!el) {
    el = make();
    el.classList.add(className);
    card.appendChild(el);
  }
  return el;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
