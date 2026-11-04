import { blockStart, notesForLesson, pruneNotes, type LessonNote } from "./notes";

const N = (over: Partial<LessonNote>): LessonNote => ({
  id: Math.random().toString(36),
  code: "9DIGA",
  subject: "Digital Tech",
  date: "2026-11-04",
  from: "10:15",
  text: "bring USB",
  done: false,
  createdAt: 1,
  ...over,
});

describe("notesForLesson", () => {
  const notes = [
    N({ date: "2026-11-02", text: "earlier" }),
    N({ date: "2026-11-04", from: "10:15", text: "this lesson" }),
    N({ date: "2026-11-04", from: "08:45", text: "earlier today" }),
    N({ date: "2026-11-06", text: "future" }),
    N({ date: "2026-11-01", text: "ticked", done: true }),
    N({ code: "9ENGA1", date: "2026-11-01", text: "other subject" }),
  ];

  it("carries open notes from earlier lessons of the same subject", () => {
    const { carried, own } = notesForLesson(notes, "9DIGA", "2026-11-04", "10:15");
    expect(carried.map((n) => n.text).sort()).toEqual(["earlier", "earlier today"]);
    expect(own.map((n) => n.text)).toEqual(["this lesson"]);
  });

  it("works with 12h-free HH:MM:SS input", () => {
    expect(notesForLesson(notes, "9DIGA", "2026-11-04", "10:15:00").own).toHaveLength(1);
  });
});

describe("blockStart", () => {
  const day = [
    { code: "TERRA3", from: "08:45" },
    { code: "9HASSA1", from: "10:15" },
    { code: "9HASSA1", from: "11:15" }, // after recess, still the same double
    { code: "9MATHSA1", from: "14:35" },
    { code: "9MATHSA1", from: "13:55" }, // any order in
    { code: "9ENGA1", from: "11:55" },
  ];

  it("maps both halves of a double to its first period", () => {
    expect(blockStart(day, "9MATHSA1", "14:35")).toBe("13:55");
    expect(blockStart(day, "9MATHSA1", "13:55:00")).toBe("13:55");
    expect(blockStart(day, "9HASSA1", "11:15")).toBe("10:15");
  });

  it("leaves singles and unknown lessons alone", () => {
    expect(blockStart(day, "9ENGA1", "11:55")).toBe("11:55");
    expect(blockStart(day, "9DIGA", "09:00")).toBe("09:00");
  });

  it("makes a note from period 1 'own' (not 'last time') in period 2", () => {
    const notes = [N({ code: "9MATHSA1", date: "2026-11-04", from: "13:55", text: "calc" })];
    const p2 = notesForLesson(
      notes,
      "9MATHSA1",
      "2026-11-04",
      blockStart(day, "9MATHSA1", "14:35"),
    );
    expect(p2.carried).toHaveLength(0);
    expect(p2.own).toHaveLength(1);
  });
});

describe("pruneNotes", () => {
  it("drops notes ticked more than 30 days ago, keeps open ones", () => {
    const now = 100 * 24 * 60 * 60_000;
    const kept = pruneNotes(
      [
        N({ text: "open" }),
        N({ text: "old done", done: true, doneAt: 1 }),
        N({ text: "new done", done: true, doneAt: now - 1000 }),
      ],
      now,
    );
    expect(kept.map((n) => n.text)).toEqual(["open", "new done"]);
  });
});
