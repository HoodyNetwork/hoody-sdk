// The ScaleBar's arithmetic, shared by the web part and its terminal twin (no React, no CSS).

/** The most steps a ScaleBar draws; a larger scale is drawn in tenths of its end. */
export const SCALE_STEPS = 10;

/** How a ScaleBar is drawn: `steps` boxes, the first `lit` of them filled. Up to ten steps each step is one unit of the
 *  scale; a larger scale is drawn in ten steps, each value rounded to its share of them (never fewer than one lit for
 *  a value above 0). A value that is not a finite number lights nothing; one past the end lights every step. */
export function scaleSteps(value: number, max: number): { steps: number; lit: number } {
  const end = Number.isFinite(max) ? Math.max(1, Math.round(max)) : 1;
  const v = Number.isFinite(value) ? Math.max(0, Math.min(end, value)) : 0;
  if (end <= SCALE_STEPS) return { steps: end, lit: v > 0 ? Math.max(1, Math.round(v)) : 0 };
  return { steps: SCALE_STEPS, lit: v > 0 ? Math.max(1, Math.round((v / end) * SCALE_STEPS)) : 0 };
}
