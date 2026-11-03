import { computeProgress, levelFromXp, xpForLevel, xpForMark, type XpAssessment } from "./xp";

let id = 1;
const M = (subject: string, finalGrade: number | null, due: string): XpAssessment => ({
  id: id++,
  subject,
  due,
  graded: finalGrade != null,
  overdue: false,
  status: finalGrade != null ? "MARKS_RELEASED" : "PENDING",
  ...(finalGrade != null ? { finalGrade } : {}),
});

const unlocked = (p: ReturnType<typeof computeProgress>) =>
  p.achievements.filter((a) => a.unlocked).map((a) => a.id);

describe("levels", () => {
  it("has a growing level curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(4500)).toBe(10);
  });

  it("awards bonus XP for A-range, perfect and improved marks", () => {
    expect(xpForMark(60, null)).toBe(70);
    expect(xpForMark(90, null)).toBe(125);
    expect(xpForMark(100, null)).toBe(185);
    expect(xpForMark(80, 65)).toBe(105);
  });
});

describe("computeProgress", () => {
  it("is empty with nothing marked", () => {
    const p = computeProgress([M("Sci", null, "2026-01-01")]);
    expect(p).toMatchObject({ xp: 0, level: 1, marked: 0, streak: 0 });
    expect(unlocked(p)).toEqual([]);
  });

  it("orders by due date for streaks and comebacks", () => {
    const p = computeProgress([
      M("Eng", 80, "2026-03-01"),
      M("Eng", 50, "2026-02-01"), // earlier, breaks nothing after it
      M("Eng", 72, "2026-04-01"),
    ]);
    // 50 -> 80 is a +30 comeback; streak is 80, 72 = 2
    expect(p.streak).toBe(2);
    expect(unlocked(p)).toEqual(expect.arrayContaining(["first-mark", "comeback"]));
  });

  it("tracks the best streak separately from the current one", () => {
    const marks = [90, 85, 88, 91, 77, 40, 75].map((g, i) =>
      M("Sci", g, `2026-01-${String(i + 1).padStart(2, "0")}`),
    );
    const p = computeProgress(marks);
    expect(p.bestStreak).toBe(5);
    expect(p.streak).toBe(1);
    expect(unlocked(p)).toContain("streak-5");
    expect(unlocked(p)).not.toContain("streak-10");
  });

  it("unlocks score and all-rounder achievements", () => {
    const p = computeProgress(
      ["A", "B", "C", "D", "E"].map((s, i) => M(s, i === 0 ? 100 : 75, `2026-05-0${i + 1}`)),
    );
    expect(unlocked(p)).toEqual(
      expect.arrayContaining(["score-95", "score-100", "all-rounder"]),
    );
    const allRounder = p.achievements.find((a) => a.id === "all-rounder")!;
    expect(allRounder.progress).toEqual({ value: 5, goal: 5 });
  });

  it("reports progress inside the current level", () => {
    const p = computeProgress([M("Sci", 90, "2026-01-01")]); // 125 XP
    expect(p.level).toBe(2);
    expect(p.levelXp).toBe(25);
    expect(p.levelSpan).toBe(200);
  });
});
