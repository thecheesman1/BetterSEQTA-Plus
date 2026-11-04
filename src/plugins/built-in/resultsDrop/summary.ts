import type { Assessment } from "@/plugins/built-in/gradeAnalytics/types";
import {
  computeTarget,
  subjectYearAssessments,
  type WeightLookup,
} from "@/plugins/built-in/gradeAnalytics/targetGrade";
import { xpForMark } from "@/plugins/built-in/levelUp/xp";

export type ResultSummary = {
  assessment: Assessment;
  grade: number | null;
  letter: string | null;
  averageBefore: number | null;
  averageAfter: number | null;
  xp: number | null;
};

function isMarked(a: Assessment | undefined): boolean {
  return !!a && a.graded && typeof a.finalGrade === "number";
}

/**
 * What a released mark did: the grade, the subject's weighted average for that
 * year before vs after (same maths as the target calculator), and Level Up XP.
 */
export function summariseResult(
  assessmentId: number,
  before: Assessment[],
  after: Assessment[],
  weightOf: WeightLookup,
): ResultSummary | null {
  const a = after.find((x) => x.id === assessmentId);
  if (!a) return null;
  const year = new Date(a.due).getFullYear();

  // "Before" = the cache without this mark, even if a full sync already had it.
  const beforeList = before.map((x) =>
    x.id === assessmentId ? { ...x, graded: false, finalGrade: undefined } : x,
  );
  const avg = (list: Assessment[]) =>
    computeTarget(subjectYearAssessments(list, a.subject, year), a.subject, 0, weightOf).current;

  const grade = isMarked(a) ? (a.finalGrade as number) : null;
  const prev = subjectYearAssessments(beforeList, a.subject, year)
    .filter((x) => isMarked(x) && x.due <= a.due)
    .sort((x, y) => y.due.localeCompare(x.due))[0];

  return {
    assessment: a,
    grade,
    letter: a.letterGrade ?? null,
    averageBefore: avg(beforeList),
    averageAfter: grade == null ? null : avg(after),
    xp: grade == null ? null : xpForMark(grade, (prev?.finalGrade as number | undefined) ?? null),
  };
}
