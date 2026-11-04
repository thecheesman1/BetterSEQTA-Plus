/**
 * Tiny shared registry: plugins attach short annotations to a lesson occurrence
 * (key = date@HH:MM), and surfaces like Lesson Countdown show them. Lets Change
 * Alert and Lesson Notes appear in the countdown chip without either plugin
 * knowing about the other.
 */

export type LessonAnnotation = { source: string; icon: string; text: string };

const byKey = new Map<string, Map<string, LessonAnnotation>>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function setAnnotation(key: string, a: LessonAnnotation): void {
  let m = byKey.get(key);
  if (!m) byKey.set(key, (m = new Map()));
  const prev = m.get(a.source);
  if (prev && prev.text === a.text && prev.icon === a.icon) return;
  m.set(a.source, a);
  notify();
}

/** Remove one source's annotations (all keys, or one key). */
export function clearAnnotations(source: string, key?: string): void {
  let changed = false;
  for (const [k, m] of byKey) {
    if (key && k !== key) continue;
    if (m.delete(source)) changed = true;
  }
  if (changed) notify();
}

export function getAnnotations(key: string): LessonAnnotation[] {
  return [...(byKey.get(key)?.values() ?? [])];
}

export function onAnnotationsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
