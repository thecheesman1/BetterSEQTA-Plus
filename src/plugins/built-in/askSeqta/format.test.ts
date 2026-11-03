import { mergeConsecutiveLessons, relativeDue, type ContextLesson } from "./format";

const L = (
  date: string,
  from: string,
  until: string,
  name: string,
  room = "R1",
): ContextLesson => ({
  date,
  from,
  until,
  name,
  room,
  staff: "T",
});

describe("mergeConsecutiveLessons", () => {
  it("merges back-to-back periods of the same class", () => {
    const merged = mergeConsecutiveLessons([
      L("2026-11-04", "09:35:00", "10:15:00", "House Group"),
      L("2026-11-04", "08:45:00", "08:55:00", "House Group"),
      L("2026-11-04", "08:55:00", "09:35:00", "House Group"),
      L("2026-11-04", "10:15:00", "10:55:00", "Humanities"),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ from: "08:45:00", until: "10:15:00", periods: 3 });
    expect(merged[1]).toMatchObject({ name: "Humanities", periods: 1 });
  });

  it("keeps a break, a room change or a new day separate", () => {
    const merged = mergeConsecutiveLessons([
      L("2026-11-04", "10:15", "10:55", "Humanities"),
      L("2026-11-04", "11:15", "11:55", "Humanities"), // break between
      L("2026-11-04", "11:55", "12:35", "Humanities", "R2"), // room change
      L("2026-11-05", "08:45", "09:35", "Humanities", "R2"), // next day
    ]);
    expect(merged.map((m) => m.periods)).toEqual([1, 1, 1, 1]);
  });
});

describe("relativeDue", () => {
  const now = new Date(2026, 10, 3, 23, 11); // Tue 3 Nov, 11:11pm
  it.each([
    ["2026-11-03", "due TODAY"],
    ["2026-11-04", "due tomorrow"],
    ["2026-11-06", "due in 3 days"],
    ["2026-11-02", "1 day overdue"],
    ["2026-10-16", "18 days overdue"],
  ])("%s -> %s", (due, out) => expect(relativeDue(due, now)).toBe(out));
});
