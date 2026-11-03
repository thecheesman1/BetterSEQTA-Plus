import { computeTarget, weightLookupFromAveragesCache, type WeightLookup } from "./targetGrade";
import type { Assessment } from "./types";

let nextId = 1;
function A(finalGrade: number | null, due = "2026-05-01"): Assessment {
  return {
    id: nextId++,
    title: "t",
    subject: "Science",
    status: finalGrade == null ? "PENDING" : "MARKS_RELEASED",
    due,
    code: "9SCI",
    metaclassID: 1,
    programmeID: 1,
    graded: finalGrade != null,
    overdue: false,
    hasFeedback: false,
    expectationsEnabled: false,
    expectationsCompleted: false,
    reflectionsEnabled: false,
    reflectionsCompleted: false,
    availability: "",
    ...(finalGrade != null ? { finalGrade } : {}),
  };
}

const weights =
  (map: Map<Assessment, number | null>): WeightLookup =>
  (a) =>
    map.get(a) ?? null;

describe("computeTarget", () => {
  it("solves for the average needed on remaining work", () => {
    // 60% marked at 70%, 40% left. Target 80: 80 = 0.6*70 + 0.4*x => x = 95
    const done = A(70);
    const left = A(null);
    const r = computeTarget(
      [done, left],
      "Science",
      80,
      weights(
        new Map([
          [done, 60],
          [left, 40],
        ]),
      ),
    );
    expect(r.current).toBe(70);
    expect(r.needed).toBeCloseTo(95);
    expect(r.verdict).toBe("stretch");
    expect(r.markedShare).toBeCloseTo(0.6);
    expect(r.bestCase).toBeCloseTo(82);
    expect(r.worstCase).toBeCloseTo(42);
  });

  it("is on-track when the needed average is below the current one", () => {
    const done = A(90);
    const left = A(null);
    const r = computeTarget([done, left], "Science", 80, () => 50);
    expect(r.needed).toBeCloseTo(70);
    expect(r.verdict).toBe("on-track");
  });

  it("flags impossible targets and locked-in ones", () => {
    const done = A(40);
    const left = A(null);
    const w = () => 50;
    expect(computeTarget([done, left], "Science", 90, w).verdict).toBe("impossible");
    const great = A(100);
    const r = computeTarget([great, A(null)], "Science", 10, w);
    expect(r.verdict).toBe("locked-in");
    expect(r.needed).toBe(0);
  });

  it("estimates unknown weights from the known ones", () => {
    const a = A(80);
    const b = A(null);
    const c = A(null);
    const r = computeTarget(
      [a, b, c],
      "Science",
      80,
      weights(
        new Map<Assessment, number | null>([
          [a, 20],
          [b, 20],
          [c, null],
        ]),
      ),
    );
    expect(r.estimatedWeights).toBe(1);
    expect(r.needed).toBeCloseTo(80);
  });

  it("weights equally when nothing is known", () => {
    const r = computeTarget([A(60), A(null)], "Science", 70, () => null);
    expect(r.estimatedWeights).toBe(2);
    expect(r.needed).toBeCloseTo(80);
  });

  it("reports no-remaining when everything is marked", () => {
    const r = computeTarget([A(75), A(85)], "Science", 90, () => 1);
    expect(r.verdict).toBe("no-remaining");
    expect(r.needed).toBeNull();
    expect(r.current).toBe(80);
  });
});

describe("weightLookupFromAveragesCache", () => {
  it("prefers manual overrides and parses percent strings", () => {
    const a = A(50);
    const look = weightLookupFromAveragesCache(
      { [String(a.id)]: { weight: "10" } },
      { [String(a.id)]: "25%" },
    );
    expect(look(a)).toBe(25);
    expect(weightLookupFromAveragesCache({}, {})(a)).toBeNull();
  });
});
