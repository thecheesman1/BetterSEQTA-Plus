/** XP, levels, streaks and achievements, computed purely from assessment history. */

export interface XpAssessment {
  id: number;
  subject: string;
  due: string;
  graded: boolean;
  overdue: boolean;
  status: string;
  finalGrade?: number;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** For countable goals: how far along you are. */
  progress?: { value: number; goal: number };
}

export interface Progress {
  xp: number;
  level: number;
  /** XP earned inside the current level, and the size of the level. */
  levelXp: number;
  levelSpan: number;
  /** Current run of consecutive marks at or above STREAK_THRESHOLD. */
  streak: number;
  bestStreak: number;
  marked: number;
  achievements: Achievement[];
}

export const STREAK_THRESHOLD = 70;

/** Cumulative XP needed to reach `level` (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** XP for a single mark, given the previous mark in the same subject. */
export function xpForMark(grade: number, previousInSubject: number | null): number {
  let xp = Math.round(Math.max(0, Math.min(100, grade)));
  xp += 10; // it got handed in and marked
  if (grade >= 85) xp += 25;
  if (grade >= 100) xp += 50;
  if (previousInSubject != null && grade - previousInSubject >= 10) xp += 15;
  return xp;
}

export function computeProgress(assessments: XpAssessment[]): Progress {
  const marked = assessments
    .filter((a) => a.graded && typeof a.finalGrade === "number")
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime() || a.id - b.id);

  let xp = 0;
  let streak = 0;
  let bestStreak = 0;
  let best = 0;
  let comeback = false;
  const lastBySubject = new Map<string, number>();
  const strongSubjects = new Set<string>();

  for (const a of marked) {
    const grade = a.finalGrade as number;
    const prev = lastBySubject.get(a.subject) ?? null;

    xp += xpForMark(grade, prev);
    if (prev != null && grade - prev >= 15) comeback = true;
    lastBySubject.set(a.subject, grade);

    if (grade >= STREAK_THRESHOLD) {
      streak++;
      strongSubjects.add(a.subject);
    } else {
      streak = 0;
    }
    bestStreak = Math.max(bestStreak, streak);
    best = Math.max(best, grade);
  }

  const level = levelFromXp(xp);
  const levelStart = xpForLevel(level);
  const count = marked.length;

  const goal = (
    id: string,
    icon: string,
    title: string,
    description: string,
    value: number,
    target: number,
  ): Achievement => ({
    id,
    icon,
    title,
    description,
    unlocked: value >= target,
    progress: { value: Math.min(value, target), goal: target },
  });
  const flag = (
    id: string,
    icon: string,
    title: string,
    description: string,
    unlocked: boolean,
  ): Achievement => ({
    id,
    icon,
    title,
    description,
    unlocked,
  });

  const achievements: Achievement[] = [
    goal("first-mark", "🩸", "First Blood", "Get your first mark back", count, 1),
    goal("marks-25", "⚙️", "Grinder", "25 marked assessments", count, 25),
    goal("marks-100", "💯", "Centurion", "100 marked assessments", count, 100),
    flag("score-95", "🧠", "Big Brain", "Score 95% or higher", best >= 95),
    flag("score-100", "✨", "Flawless", "Score a perfect 100%", best >= 100),
    flag(
      "comeback",
      "📈",
      "Comeback Kid",
      "Beat your last mark in a subject by 15+ points",
      comeback,
    ),
    goal("streak-5", "🔥", "On Fire", `5 marks in a row at ${STREAK_THRESHOLD}%+`, bestStreak, 5),
    goal(
      "streak-10",
      "☄️",
      "Unstoppable",
      `10 marks in a row at ${STREAK_THRESHOLD}%+`,
      bestStreak,
      10,
    ),
    goal(
      "all-rounder",
      "🎯",
      "All-Rounder",
      `${STREAK_THRESHOLD}%+ in 5 different subjects`,
      strongSubjects.size,
      5,
    ),
    goal("level-10", "🔟", "Double Digits", "Reach level 10", level, 10),
  ];

  return {
    xp,
    level,
    levelXp: xp - levelStart,
    levelSpan: xpForLevel(level + 1) - levelStart,
    streak,
    bestStreak,
    marked: count,
    achievements,
  };
}
