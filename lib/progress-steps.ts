/** Langkah progress checklist item (bagi rata 4 tingkat). */
export const PROGRESS_STEPS = [25, 50, 75, 100] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

export function isProgressStep(v: unknown): v is ProgressStep {
  return (
    typeof v === "number" &&
    (PROGRESS_STEPS as readonly number[]).includes(v)
  );
}

export function clampProgressPct(n: number): number {
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  // snap ke langkah terdekat ke bawah yang valid, atau keep if exact
  if ((PROGRESS_STEPS as readonly number[]).includes(n)) return n;
  const lower = [...PROGRESS_STEPS].reverse().find((s) => s <= n);
  return lower ?? 0;
}
