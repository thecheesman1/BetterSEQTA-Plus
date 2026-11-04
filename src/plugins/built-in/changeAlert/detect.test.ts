import type { TimetableLesson } from "@/plugins/shared/timetableCache";
import { detectChanges } from "./detect";

const L = (over: Partial<TimetableLesson>): TimetableLesson => ({
  date: "2026-11-04",
  from: "10:15",
  until: "10:55",
  code: "9HASSA1",
  description: "HASS",
  staff: "M Curtis",
  staffID: 1,
  room: "GLA05",
  period: "Period 3",
  type: "class",
  programmeID: 606,
  metaID: 884,
  assessments: [],
  ...over,
});

describe("detectChanges", () => {
  const usualWeeks = [[L({})], [L({})], [L({})]];

  it("says nothing on a normal day", () => {
    expect(detectChanges(L({}), usualWeeks)).toEqual([]);
  });

  it("flags a room change", () => {
    expect(detectChanges(L({ room: "GLA12" }), usualWeeks)).toEqual([
      { kind: "room", usual: "GLA05", now: "GLA12" },
    ]);
  });

  it("flags a relief teacher by staff id", () => {
    const c = detectChanges(L({ staffID: 9, staff: "J Smith" }), usualWeeks);
    expect(c).toEqual([{ kind: "staff", usual: "M Curtis", now: "J Smith" }]);
  });

  it("flags a swapped lesson instead of room/staff noise", () => {
    const c = detectChanges(
      L({ code: "9ENGA1", description: "English", room: "GLA09" }),
      usualWeeks,
    );
    expect(c).toEqual([{ kind: "swap", usual: "HASS", now: "English" }]);
  });

  it("ignores one odd week (majority vote)", () => {
    const weeks = [[L({ room: "GYM" })], [L({})], [L({})]];
    expect(detectChanges(L({}), weeks)).toEqual([]);
  });

  it("treats a change that held two weeks as the new normal", () => {
    const weeks = [[L({ room: "GLA12" })], [L({ room: "GLA12" })], [L({})]];
    expect(detectChanges(L({ room: "GLA12" }), weeks)).toEqual([]);
  });

  it("needs at least two past weeks of evidence", () => {
    expect(detectChanges(L({ room: "GLA12" }), [[L({})], [], []])).toEqual([]);
  });
});
