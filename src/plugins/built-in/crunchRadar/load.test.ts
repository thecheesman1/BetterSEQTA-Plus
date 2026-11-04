import { buildRadar, itemLoad, type RadarItem } from "./load";

let nextId = 1;
const item = (due: string, over: Partial<RadarItem> = {}): RadarItem => ({
  id: nextId++,
  title: "Task",
  subject: "HASS",
  code: "9HASSA1",
  due,
  programmeID: 1,
  metaclassID: 1,
  weight: null,
  inClass: false,
  ...over,
});

// 2026-11-04 is a Wednesday.
const TODAY = "2026-11-04";

describe("itemLoad", () => {
  it("uses weight when known, 10% = 1", () => {
    expect(itemLoad(item(TODAY, { weight: 25 }))).toBe(2.5);
    expect(itemLoad(item(TODAY, { weight: 2 }))).toBe(0.5);
  });
  it("guesses from the title otherwise", () => {
    expect(itemLoad(item(TODAY, { title: "SUMMATIVE essay" }))).toBe(2);
    expect(itemLoad(item(TODAY))).toBe(1);
  });
});

describe("buildRadar", () => {
  it("lays out weekdays only, split into Mon–Fri weeks", () => {
    const weeks = buildRadar([], TODAY, 14, 4);
    expect(weeks.map((w) => w.days.map((d) => d.date))).toEqual([
      ["2026-11-04", "2026-11-05", "2026-11-06"],
      ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"],
      ["2026-11-16", "2026-11-17"],
    ]);
  });

  it("drops past-due items and folds weekend ones onto Friday", () => {
    const weeks = buildRadar(
      [item("2026-10-16"), item("2026-11-07"), item("2026-11-08")],
      TODAY,
      14,
      4,
    );
    const fri = weeks[0].days.find((d) => d.date === "2026-11-06")!;
    expect(fri.items).toHaveLength(2);
    expect(fri.weekend).toBe(true);
    expect(weeks.flatMap((w) => w.days).reduce((n, d) => n + d.items.length, 0)).toBe(2);
  });

  it("flags crunch weeks by total load", () => {
    const weeks = buildRadar(
      [item("2026-11-10", { weight: 20 }), item("2026-11-11", { weight: 25 })],
      TODAY,
      14,
      4,
    );
    expect(weeks.map((w) => w.crunch)).toEqual([false, true, false]);
  });

  it("dedupes the same assessment from upcoming + timetable", () => {
    const a = item("2026-11-05");
    const weeks = buildRadar([a, { ...a, inClass: true }], TODAY, 7, 4);
    expect(weeks[0].days[1].items).toHaveLength(1);
  });
});
