import { notesForLesson, pruneNotes, type LessonNote } from "./notes";

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
