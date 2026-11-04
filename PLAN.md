# PLAN

Features for the `custom` fork. **The rule:** a feature has to show up where you already
look (home, the assessment you're on, the top bar) or fire by itself. If you have to go
find it, you'll forget it exists. (RIP the target grade calculator, alive but buried in Analytics.)

Already shipped: Lesson Countdown · Level Up · Ask SEQTA · Glow Up · target grade calculator
(Analytics) · SEQTA Local.

---

## 1. Results Drop 🎯 (next up)

**What you see:** the moment a teacher releases a mark, a toast slides in:

> **HASS · Civics and Citizenship Part A**  **84%**
> Subject average 78.1% → **79.3% ▲1.2** · +120 XP
> [ See feedback ] [ What do I need now? ]

Good marks get a confetti burst. Click the toast to jump to the assessment. On that
assessment's page, the target grade calculator gets embedded inline, so "what do I need
on the next one?" is right there instead of in Analytics.

**How it works (mostly reuse):**
- **Trigger:** Notification Collector already polls `heartbeat` and archives every
  notification per account. Watch its storage (`storage.onChanged`) for **new** IDs. No
  second poller.
- **Filter:** `type === "coneqtassessments"` with a title starting "Results…" or
  "Results and feedback…". "Feedback for…" toasts without a mark. "Details for… released"
  means a *new* assessment was published, so it feeds Crunch Radar (below) instead.
- **Get the mark:** the notification carries `programmeID`, `metaclassID` and
  `assessmentID`. Fetch `assessment/list/past` for that subject, then
  `resolveNumericGradeFromAssessmentPayload` (gradeAnalytics/api.ts).
- **Average delta:** subject average before vs after, using
  `weightLookupFromAveragesCache` (targetGrade.ts) so weights match Assessments Average.
- **XP:** `xpForMark()` from Level Up. Merge the new result into the Analytics cache so
  Level Up recomputes by itself (it already listens for cache writes) and fires its own
  achievement toasts.
- **Toast UI:** reuse Level Up's toast stack (`#bsplus-levelup-toasts`) so toasts stack
  instead of fighting.

**Settings:** on/off · hide the mark until you click it (for when someone's looking at
your screen) · confetti on/off · minimum mark for confetti (default 80%).

**Edge cases:**
- First run: the archive already holds ~46 old results. Mark them all seen silently.
  Never spam 46 toasts.
- Letter-grade-only results: show the letter, skip the delta.
- Mark not in `list/past` yet (release lag): retry on the next poll, give up after 1h.
- Several results at once: one toast each, max 3, then "+N more".
- Glow Up on: toast position has to clear the dock.

**Phase 2 (sick, optional):** the background worker polls `heartbeat` with `alarms` and
fires a real **OS notification** when SEQTA isn't even open. The extension already has
`notifications` + `alarms` + host permissions. It only works while the SEQTA login is
still valid.

**Done when:** a released mark shows up as a toast within one poll, the delta matches
Analytics, Level Up XP moves, no toast storm on first run, and the calculator shows on
the assessment page.

---

## 2. Crunch Radar 📡

**What you see:** a strip on home above Upcoming Assessments with the next 14 days,
weekdays only (10 cells):

```
 THU  FRI │ MON  TUE  WED  THU  FRI │ MON  TUE  WED
  ▆    ▂  │       █▅              ▂ │  ▂
          │     ⚠ crunch            │
```

Each cell is a stack of subject-coloured bars sized by load. Hover (or tap) a day to
list what's due. A ⚠ flags any week over a threshold, so you can see a brutal week one
week early. Today is outlined.

**How it works:**
- **Due items:** `assessment/list/upcoming` (already fetched by home; reuse the result).
- **In-class tests:** timetable lessons carry an `assessments` array. Pull 14 days of
  `load/timetable` once per day and add those too.
- **Load score:** weight from the Assessments Average weightings if known, else 1, with
  summatives × 2 (title contains "SUMMATIVE" or the weight is ≥ 10%).
- **Subject colours:** the existing user prefs (`timetable.subject.colour.<code>`).
- **Cache:** session cache, refreshed when the home page loads. Cheap.

**Settings:** on/off · days ahead (7 / 14 / 21) · crunch threshold.

**Edge cases:**
- Past-due items in "upcoming" (SEQTA keeps them): ignore anything before today.
- Weekends: fold anything due on a weekend into the Friday cell, with a small dot.
- Nothing due: render a calm empty strip, not nothing (so you know it's working).
- Glow Up's bento home: it needs its own grid slot, full width under the hero.
- Teachers publish late, so new items appear over time. A "Details for… released"
  notification triggers a refresh (shared with Results Drop).

**Done when:** the strip matches SEQTA's upcoming list for the next 14 days, includes
in-class tests from the timetable, works with Glow Up on and off, and phone width
doesn't overflow.

---

## 3. Room & Teacher Change Alert 🚪

**What you see:** on days something's different, the changed lesson gets a chip:

> **HASS** · ~~GLA05~~ → **GLA12** 🚪 room change
> **English** · relief: **J. Smith** (usually R. Allchurch)

The Lesson Countdown chip shows it too when that lesson is next ("Next: HASS in
**GLA12** (moved)"), so you see it before you walk to the wrong room. A small "2 changes
today" badge sits on the home lessons card.

**How it works:**
- **Your timetable runs on a 1-week cycle** (checked: `cycles` is plain weekday names, and
  each weekday repeats week to week). So "normal" is the same weekday + period from
  previous weeks.
- **Baseline:** fetch `load/timetable` for the past 3 weeks, once per day, cached. For
  each weekday + period, the most common room and staff across those weeks is "usual".
  Majority vote, so one weird week (an excursion, a relief teacher) doesn't poison the
  baseline.
- **Compare:** today's (and tomorrow's) lessons against the baseline. Room differs → room
  change. `staffID` differs → relief teacher. Code differs → swapped lesson.
- Trim the staff names (SEQTA pads them with a leading space).
- Skip Home Group / TERRA (`programmeID` 0), since it never moves and isn't a real class.

**Settings:** on/off · also check tomorrow (default on; shows on home after 3pm).

**Edge cases:**
- Not enough history (start of term): no baseline means no alerts. Say nothing rather
  than guess.
- Public holiday last week: majority vote across 3 weeks covers it.
- Timetable changes at term start (new rooms for real): if the "change" holds 2 weeks in
  a row, it becomes the new normal by itself, thanks to the vote.

**Done when:** a lesson whose room or teacher differs from its usual shows a chip on home,
in the timetable and in Lesson Countdown, and normal days show nothing.

---

## 4. Lesson Notes 📝

**What you see:** every lesson card (home lessons, timetable, Lesson Countdown popover)
gets a small ✎. Click it and type a quick note ("bring USB", "finish Q4–7", "test on
Friday"). The **next time that subject comes up**, the note surfaces:

> **Digital Tech** · 📝 *last time:* bring USB · finish the micro:bit sketch  [done ✓]

It shows on the lesson card and in Lesson Countdown when that lesson is next. Tick it off
to dismiss.

**How it works:**
- **Storage:** extension `storage.local`, keyed by account + subject code: a list of
  `{ text, createdFor: date+period, done }`. Local only, never sent anywhere.
- **Surfacing:** any open note for a lesson's subject code, written for an *earlier*
  occurrence, shows on the next occurrence until you tick it.
- **Quick capture:** while a lesson is on (Lesson Countdown knows), `Alt+N` opens the note
  box for the current lesson. Zero clicks to find it.
- **Ask SEQTA tie-in (cheap win):** add open notes to Ask SEQTA's context so "what do I
  need for tomorrow?" knows about "bring USB".

**Settings:** on/off · quick-capture shortcut on/off.

**Edge cases:**
- A note written outside class (no current lesson): attach it to the next occurrence of
  the chosen subject.
- Old done notes: auto-prune after 30 days.
- Two lessons of the same subject back to back: the note shows on the first one only.

**Done when:** a note written in one lesson shows on the next lesson of that subject (home,
timetable, Lesson Countdown) until ticked, and `Alt+N` works mid-lesson.

---

## 5. Class Mode 🎓

**What you see:** during a lesson, home (or a button on the Lesson Countdown chip) shows
**this lesson's content**, the same thing you'd get by digging through Courses → subject
→ week → lesson:

> **Now: Digital Tech · Week 3, Lesson 2: Decisions with micro:bit**
> [lesson content…]  [📎 resources]  [open full course →]

Optional: auto-open it when you load SEQTA during class (off by default).

**How it works (checked against the real payload):**
- The current lesson from the timetable gives `programmeID` + `metaID` (= metaclass).
- `load/courses` for that pair returns:
  - `d[k].l` = every scheduled occurrence in week k, as `{ d: date, s: start, e: end, p: period }`
  - `w[k]` = the lesson content for week k (`t` title, `document.contents` modules)
- Find `(k, j)` where `d[k].l[j]` matches today's date + start time, then take `w[k][j]`.
- ⚠ **Verify the j-alignment first:** one week had 4 scheduled slots but only 3 lesson
  docs. Compare against SEQTA's own course page for a few lessons before trusting it. If
  it doesn't line up, fall back to showing the whole week with today's slot highlighted.
- Render the lesson document with the same module walker SEQTA Local uses (HTML from
  `content.value`, resources list), inside SEQTA's styling. No iframe needed since we're
  already on SEQTA.

**Settings:** on/off · auto-open during class (off) · show on home vs chip-only.

**Edge cases:**
- Home Group / TERRA (`programmeID` 0): no course, so show nothing.
- No content published for this lesson: say "nothing posted for this lesson" plus a link
  to the course, rather than a blank card.
- Double periods: two occurrences with the same date, one after the other. Show the first
  one's content for both.
- Between lessons: show the *next* lesson's content with a "starts in 4 min" tag.

**Done when:** in a real lesson the card shows the same content as SEQTA's course page for
that lesson (checked on 3+ subjects), and degrades cleanly when the content isn't there.

---

## Build order

1. Shared bits:
   - an **assessment events** module (watches the notification archive, emits
     `result-released` / `assessment-published`), used by Results Drop and Crunch Radar
   - a **timetable cache** (today + tomorrow + the last 3 weeks, fetched once a day),
     used by Change Alert, Lesson Notes and Class Mode
2. **Room & Teacher Change Alert** (small, pure timetable maths; good warm-up)
3. **Crunch Radar**
4. **Results Drop** toast + delta + XP, then the calculator embed on the assessment page
5. **Lesson Notes**
6. **Class Mode** (verify the course alignment first)
7. Results Drop phase 2 (OS notifications), if everything else feels good

Each feature ships as its own toggleable plugin, **on by default only once it has been
clicked through in the browser**. Each step: typecheck (`svelte-check` wipes `dist/`),
then build, then click through it in the browser, *including* Assessments/Courses pages
with Glow Up on (that bit us before). Commit per feature and **push only to `origin`
(the thecheesman1 fork)**: `upstream`'s push URL is deliberately disabled.

---

## Backlog: more ideas, rated

| # | Idea | What it is | Usable daily? | Effort |
|---|---|---|---|---|
| A | **Actually-overdue radar** | SEQTA says OVERDUE even when you submitted. Check against real submissions and show a red strip only for genuinely missing work. | ✅✅ | M |
| C | **Pack my bag** | After 3pm a home card for tomorrow ("PE → gym gear"). Set the item per subject once. Could fold into Lesson Notes as pinned per-subject notes. | ✅ | S |
| E | **Feedback digest** | All teacher feedback across subjects on one searchable page, plus an Ask SEQTA button: "what do teachers keep telling me?" | 🟡 | M |
| F | **Focus timer** | A Pomodoro on the assessment page that logs time per task and feeds Level Up XP. | 🟡 | S |
| G | **Drag-to-submit** | Drop a file onto an assessment card on home and it submits. Touches real submissions, so it needs careful testing. | ✅ | L |

(B, D and H got promoted to features 3–5 above.) Next pick once 1–5 are in: **A**, since it
kills the "did I hand that in?" panic, and the timetable cache plus assessment events will
already exist by then.

## Open questions

- Results Drop: toast for formatives too, or summatives only? *(Default: both, confetti
  only for summatives.)*
- Should the mark be hidden by default, or shown? *(Default: shown, with a setting to hide.)*
- Crunch threshold: count-based ("3+ things in a week") or weight-based? *(Default:
  weight-based, falling back to count when weights are unknown.)*
