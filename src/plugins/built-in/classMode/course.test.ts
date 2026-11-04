import { findLesson, lessonContent, type CoursePayload } from "./course";

const doc = (html: string) => ({
  contents: JSON.stringify({ document: { modules: [{ content: { value: html } }] } }),
});

const course: CoursePayload = {
  t: "9A Digital Technology",
  d: [
    {
      t: 2,
      w: 1,
      l: [
        { d: "2026-04-27", s: "08:55:00", e: "09:35:00", p: "P1" },
        { d: "2026-04-27", s: "09:35:00", e: "10:15:00", p: "P2" },
        { d: "2026-04-29", s: "12:35:00", e: "13:15:00", p: "P5" },
        { d: "2026-04-29", s: "13:15:00", e: "13:55:00", p: "P6" },
      ],
    },
  ],
  w: [
    [
      { t: "L1/2: Introduce Course requirements", n: 0, document: doc("<p>Course intro</p>") },
      { t: "See Previous Lesson", n: 1 },
      { t: "L1/2: Introduce Grok", n: 2, document: doc("<p>Grok</p>") },
    ],
  ],
};

describe("findLesson", () => {
  it("pairs slot j with lesson n=j", () => {
    const m = findLesson(course, "2026-04-29", "12:35")!;
    expect(m.lesson?.t).toBe("L1/2: Introduce Grok");
    expect(m).toMatchObject({ term: 2, week: 1, period: "P5", continued: false });
  });

  it("follows 'See Previous Lesson' back for double periods", () => {
    const m = findLesson(course, "2026-04-27", "09:35")!;
    expect(m.lesson?.t).toBe("L1/2: Introduce Course requirements");
    expect(m.continued).toBe(true);
  });

  it("returns an empty match for a slot the teacher left blank", () => {
    const m = findLesson(course, "2026-04-29", "13:15")!;
    expect(m.lesson).toBeNull();
    expect(m.period).toBe("P6");
  });

  it("returns null when the time isn't in this course", () => {
    expect(findLesson(course, "2026-04-28", "08:55")).toBeNull();
  });
});

describe("lessonContent", () => {
  it("collects HTML modules and resource names", () => {
    const lesson = {
      document: {
        contents: JSON.stringify({
          document: {
            modules: [
              { content: { value: "<p>Hi</p>" } },
              { content: { value: { mode: "list", resources: [{ name: "slides.pdf" }] } } },
              { content: {} },
            ],
          },
        }),
      },
    };
    expect(lessonContent(lesson)).toEqual({ html: ["<p>Hi</p>"], resources: ["slides.pdf"] });
  });

  it("survives junk", () => {
    expect(lessonContent({ document: { contents: "{nope" } })).toEqual({ html: [], resources: [] });
    expect(lessonContent(null)).toEqual({ html: [], resources: [] });
  });
});
