import type { Assessment } from "@/plugins/built-in/gradeAnalytics/types";
import { summariseResult } from "./summary";

const A = (id: number, over: Partial<Assessment> = {}): Assessment =>
  ({
    id,
    title: `Task ${id}`,
    subject: "HASS",
    status: "MARKS_RELEASED",
    due: `2026-0${id}-10`,
    code: "9HASSA1",
    metaclassID: 1,
    programmeID: 1,
    graded: true,
    overdue: false,
    hasFeedback: true,
    expectationsEnabled: false,
    expectationsCompleted: false,
    reflectionsEnabled: false,
    reflectionsCompleted: false,
    availability: "",
    ...over,
  }) as Assessment;

const equalWeights = () => null;

describe("summariseResult", () => {
  const before = [A(1, { finalGrade: 70 }), A(2, { finalGrade: 80 }), A(3, { graded: false })];

  it("computes the mark, average delta and XP", () => {
    const after = [A(1, { finalGrade: 70 }), A(2, { finalGrade: 80 }), A(3, { finalGrade: 90 })];
    const s = summariseResult(3, before, after, equalWeights)!;
    expect(s.grade).toBe(90);
    expect(s.averageBefore).toBe(75);
    expect(s.averageAfter).toBe(80);
    // 90 + 10 handed in + 25 for >=85 + 15 for +10 on the previous (80)
    expect(s.xp).toBe(140);
  });

  it("treats the mark as new even if the cache already had it", () => {
    const after = [A(1, { finalGrade: 70 }), A(2, { finalGrade: 80 }), A(3, { finalGrade: 90 })];
    const s = summariseResult(3, after, after, equalWeights)!;
    expect(s.averageBefore).toBe(75);
    expect(s.averageAfter).toBe(80);
  });

  it("respects weights", () => {
    const after = [A(1, { finalGrade: 70 }), A(2, { finalGrade: 80 }), A(3, { finalGrade: 100 })];
    const weightOf = (a: Assessment) => (a.id === 3 ? 50 : 25);
    const s = summariseResult(3, before, after, weightOf)!;
    expect(s.averageAfter).toBeCloseTo(87.5);
  });

  it("returns no grade (and no XP) when the mark isn't visible yet", () => {
    const s = summariseResult(3, before, before, equalWeights)!;
    expect(s.grade).toBeNull();
    expect(s.xp).toBeNull();
  });

  it("returns null for an unknown assessment", () => {
    expect(summariseResult(99, before, before, equalWeights)).toBeNull();
  });
});
