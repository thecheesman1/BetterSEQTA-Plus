import { formatDuration, getLessonStatus, type CountdownLesson } from "./status";

const L = (from: string, until: string, description: string): CountdownLesson => ({
  from,
  until,
  description,
});

const day = [
  L("08:45:00", "08:55:00", "House Group"),
  L("08:55:00", "09:35:00", "German"),
  L("09:35:00", "10:15:00", "German"),
  L("11:15:00", "11:55:00", "HPE"),
];

const at = (hh: number, mm: number, ss = 0) => new Date(2026, 10, 3, hh, mm, ss);

describe("getLessonStatus", () => {
  it("is between lessons before school starts", () => {
    const s = getLessonStatus(day, at(8, 30));
    expect(s.kind).toBe("between");
    if (s.kind === "between") {
      expect(s.next.description).toBe("House Group");
      expect(s.startsInMs).toBe(15 * 60_000);
    }
  });

  it("tracks progress through the current lesson", () => {
    const s = getLessonStatus(day, at(9, 15));
    expect(s.kind).toBe("in-lesson");
    if (s.kind === "in-lesson") {
      expect(s.lesson.from).toBe("08:55:00");
      expect(s.endsInMs).toBe(20 * 60_000);
      expect(s.progress).toBeCloseTo(0.5);
      expect(s.next?.from).toBe("09:35:00");
    }
  });

  it("hands over exactly on the bell for back-to-back lessons", () => {
    const s = getLessonStatus(day, at(9, 35));
    expect(s.kind === "in-lesson" && s.lesson.from).toBe("09:35:00");
  });

  it("counts down to the next lesson during a break", () => {
    const s = getLessonStatus(day, at(10, 45));
    expect(s.kind).toBe("between");
    if (s.kind === "between") {
      expect(s.next.description).toBe("HPE");
      expect(s.startsInMs).toBe(30 * 60_000);
    }
  });

  it("is done after the last lesson and with no lessons", () => {
    expect(getLessonStatus(day, at(15, 0)).kind).toBe("done");
    expect(getLessonStatus([], at(10, 0)).kind).toBe("done");
  });

  it("prefers the overlapping lesson that ends first", () => {
    const s = getLessonStatus(
      [L("09:00", "10:00", "Long"), L("09:00", "09:30", "Short")],
      at(9, 10),
    );
    expect(s.kind === "in-lesson" && s.lesson.description).toBe("Short");
  });
});

describe("formatDuration", () => {
  it.each([
    [45_000, "45s"],
    [60_000, "1 min"],
    [61_000, "2 min"],
    [7 * 60_000, "7 min"],
    [65 * 60_000, "1h 05m"],
  ])("%d ms -> %s", (ms, out) => expect(formatDuration(ms)).toBe(out));
});
