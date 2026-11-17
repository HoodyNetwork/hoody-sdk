// Vitest: how toasts and an open phone tray share the visual viewport (pure trayToastBudget).
// The tray's reserve R comes first (head + up to 3 rows + safe area; 1 row when the band would fall below T_min); the
// toasts get a band B = vvh − R − 2·gap at the top. Unqueued (B ≥ T_min): the band shows T = min(stack, B) and the tray's
// max height M = max(R, vvh − max(48, T + 2·gap)). Queued (B < T_min): no toast shows (T = 0), the tray takes
// max(R, vvh − 48), or the whole viewport when even R does not fit. The browser check is traytoast.spec.ts.
import { describe, expect, it } from 'vitest';
import { trayToastBudget, trayViewportHeight } from './Toast';

/** The reserves (the tray's --tray-r1/--tray-r3 token sums) for a tray with head 56, rows 44 and a safe area: its frame and head, then its rows
 *  down to the first one or the third. */
const reserve = (rows: number, safe = 0) => ({ r1: 56 + Math.min(rows, 1) * 44 + safe, r3: 56 + Math.min(rows, 3) * 44 + safe });
/** Default text: head 56, rows 44, no safe area, gap --sp-2, T_min 56. */
const at = (vvh: number, stack: number, rows = 6) => trayToastBudget({ vvh, ...reserve(rows), gap: 8, tMin: 56, stack });

describe('trayToastBudget', () => {
  it('(t1) fits: three short toasts all show in the band, the tray shortened to clear them', () => {
    const b = at(640, 3 * 80 + 2 * 8);
    expect(b).toMatchObject({ queued: false, full: false, R: 188, B: 436, T: 256 });
    expect(b.M).toBe(640 - (256 + 16));
  });

  it('(t2, t3) exceeds / one oversized toast: the band is capped at B and the tray keeps its 3-row reserve', () => {
    for (const stack of [700, 520]) {
      const b = at(640, stack);
      expect(b).toMatchObject({ queued: false, R: 188, B: 436, T: 436, M: 188 });
    }
  });

  it('(t4a) 320 px: the three-row reserve is kept and the band scrolls', () => {
    expect(at(320, 520)).toMatchObject({ queued: false, R: 188, B: 116, T: 116, M: 188 });
  });

  it('(t4b) one-row fallback at 240 px: R drops to head + 1 row', () => {
    const b = at(240, 520);
    expect(240 - 188 - 16).toBeLessThan(56);
    expect(240 - 100 - 16).toBeGreaterThanOrEqual(56);
    expect(b).toMatchObject({ queued: false, R: 100, B: 124, T: 124, M: 100 });
  });

  it('(t4c) queue at 160 px: no toast shows, the tray takes max(R, vvh − 48)', () => {
    expect(at(160, 80)).toMatchObject({ queued: true, full: false, R: 100, T: 0, M: 112 });
  });

  it('(t4d) below R (90 px): the full-viewport fallback', () => {
    expect(at(90, 80)).toMatchObject({ queued: true, full: true, T: 0, M: 90 });
  });

  it('branch boundaries, one pixel either side: B = T_min, and vvh = R₁', () => {
    // B = vvh − 188 − 16 = 56 ⇔ vvh = 260 (three rows); below it the one-row reserve.
    expect(at(260, 80)).toMatchObject({ R: 188, B: 56, queued: false });
    expect(at(259, 80)).toMatchObject({ R: 100, queued: false });
    // One row: B = vvh − 100 − 16 = 56 ⇔ vvh = 172.
    expect(at(172, 80)).toMatchObject({ R: 100, B: 56, queued: false });
    expect(at(171, 80)).toMatchObject({ R: 100, queued: true, full: false });
    // vvh = R₁ = 100 keeps the fixed head; 99 takes the whole viewport.
    expect(at(100, 80)).toMatchObject({ queued: true, full: false, M: 100 });
    expect(at(99, 80)).toMatchObject({ queued: true, full: true, M: 99 });
  });

  it('a menu with fewer rows reserves only what it has; the safe area counts in R', () => {
    expect(at(640, 80, 2).R).toBe(56 + 88);
    expect(trayToastBudget({ vvh: 640, ...reserve(6, 34), gap: 8, tMin: 56, stack: 80 }).R).toBe(188 + 34);
  });

  it('the invariant at every size: the band ends a gap above the tray, the tray never below its reserve', () => {
    for (let vvh = 60; vvh <= 1000; vvh += 1)
      for (const stack of [0, 40, 80, 256, 520, 1200]) {
        const b = at(vvh, stack);
        if (b.full) {
          expect(b.M).toBe(vvh);
          continue;
        }
        expect(b.M, `vvh ${vvh}`).toBeGreaterThanOrEqual(b.R);
        expect(b.M).toBeLessThanOrEqual(vvh);
        if (b.queued) expect(b.T).toBe(0);
        else {
          expect(b.T).toBe(Math.min(stack, b.B));
          expect(8 + b.T, `vvh ${vvh} stack ${stack}`).toBeLessThanOrEqual(vvh - b.M - 8);
        }
      }
  });
});

// The tray and the toasts are fixed in the layout viewport, so the budget's height is the visible part of
// the layout in layout px, min(clientHeight, vv.height × scale), never the zoomed visual height alone.
describe('trayViewportHeight (pinch zoom and the soft keyboard)', () => {
  const vv = (height: number, scale: number, offsetTop = 0) => ({ height, scale, offsetTop });
  it('a soft keyboard at scale 1: what shows above it (vv.height), as before', () => {
    expect(trayViewportHeight(vv(320, 1), 640, 640)).toBe(320);
  });
  it('pinch zoom at scale 2, no keyboard: the whole layout height, not the zoomed slice', () => {
    expect(trayViewportHeight(vv(320, 2), 640, 640)).toBe(640);
  });
  it('pinch zoom with a keyboard: the layout height above the keyboard', () => {
    expect(trayViewportHeight(vv(160, 2), 640, 640)).toBe(320);
  });
  it('zoomed and panned down (offsetTop > 0): the same budget as at the top', () => {
    expect(trayViewportHeight(vv(320, 2, 300), 640, 640)).toBe(trayViewportHeight(vv(320, 2), 640, 640));
  });
  it('never more than the layout: a visual viewport taller than clientHeight is capped at clientHeight', () => {
    expect(trayViewportHeight(vv(700, 1), 640, 700)).toBe(640);
  });
  it('no visualViewport: innerHeight', () => {
    expect(trayViewportHeight(undefined, 640, 512)).toBe(512);
  });
});
