import type { Assessment } from "./types";

/** Weight (any unit, e.g. percent) for an assessment, or null when unknown. */
export type WeightLookup = (a: Assessment) => number | null;

export type TargetVerdict =
  | "locked-in" // already guaranteed, even with 0 on everything left
  | "on-track" // needed average is at or below what you're currently scoring
  | "stretch" // achievable, but above your current average
  | "impossible" // would need more than 100%
  | "no-remaining"; // nothing left to sit; the result is what it is

export interface TargetResult {
  subject: string;
  /** Weighted average of marked work so far, or null with nothing marked. */
  current: number | null;
  markedCount: number;
  remainingCount: number;
  /** Share of the subject's total weight that's already marked (0..1). */
  markedShare: number;
  /** Average % needed across remaining work, or null if nothing remains. */
  needed: number | null;
  /** Best possible final result (100% on everything left). */
  bestCase: number | null;
  /** Worst possible final result (0% on everything left). */
  worstCase: number | null;
  verdict: TargetVerdict;
  /** Assessments whose weight was guessed (mean of known weights, or equal). */
  estimatedWeights: number;
}

/** Marked = has a grade. Remaining = not graded yet (pending or overdue). */
function isMarked(a: Assessment): boolean {
  return a.graded && typeof a.finalGrade === "number";
}

/** Assessments for one subject due in the given year: one reporting year. */
export function subjectYearAssessments(
  all: Assessment[],
  subject: string,
  year: number,
): Assessment[] {
  return all.filter((a) => a.subject === subject && new Date(a.due).getFullYear() === year);
}

export function computeTarget(
  assessments: Assessment[],
  subject: string,
  target: number,
  weightOf: WeightLookup,
): TargetResult {
  const known = assessments.map(weightOf).filter((w): w is number => w != null && w > 0);
  // Unknown weights get the mean of the known ones; with none known, every
  // assessment counts equally. Either way the user is told it's a guess.
  const fallback = known.length ? known.reduce((s, w) => s + w, 0) / known.length : 1;

  let estimatedWeights = 0;
  const weighted = assessments.map((a) => {
    const w = weightOf(a);
    if (w == null || w <= 0) {
      estimatedWeights++;
      return { a, w: fallback };
    }
    return { a, w };
  });

  const marked = weighted.filter(({ a }) => isMarked(a));
  const remaining = weighted.filter(({ a }) => !isMarked(a));

  const markedWeight = marked.reduce((s, { w }) => s + w, 0);
  const remainingWeight = remaining.reduce((s, { w }) => s + w, 0);
  const totalWeight = markedWeight + remainingWeight;
  const earned = marked.reduce((s, { a, w }) => s + (a.finalGrade as number) * w, 0);

  const current = markedWeight > 0 ? earned / markedWeight : null;
  const base: Omit<TargetResult, "needed" | "verdict"> = {
    subject,
    current,
    markedCount: marked.length,
    remainingCount: remaining.length,
    markedShare: totalWeight > 0 ? markedWeight / totalWeight : 0,
    bestCase: totalWeight > 0 ? (earned + 100 * remainingWeight) / totalWeight : null,
    worstCase: totalWeight > 0 ? earned / totalWeight : null,
    estimatedWeights,
  };

  if (remainingWeight === 0) {
    return { ...base, needed: null, verdict: "no-remaining" };
  }

  // target * total = earned + needed * remaining
  const needed = (target * totalWeight - earned) / remainingWeight;

  let verdict: TargetVerdict;
  if (needed <= 0) verdict = "locked-in";
  else if (needed > 100) verdict = "impossible";
  else if (current != null && needed <= current) verdict = "on-track";
  else verdict = "stretch";

  return { ...base, needed: Math.max(0, needed), verdict };
}

/** Builds a WeightLookup from the Assessment Averages plugin's cached data. */
export function weightLookupFromAveragesCache(
  weightings: Record<string, { weight?: string }> | undefined,
  overrides: Record<string, string> | undefined,
): WeightLookup {
  return (a) => {
    const raw = overrides?.[String(a.id)] ?? weightings?.[String(a.id)]?.weight;
    const n = raw == null ? NaN : Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
}
