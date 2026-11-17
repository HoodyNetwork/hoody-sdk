// Where the web toast column goes (pure, for tests and both builds): beside a dock, lifted over an open overlay's
// controls, and sharing the screen with a phone tray. Toast.tsx measures the page and calls these; Toast.tsx and the
// terminal Toast.term.tsx re-export them.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The highest the toasts climb above their usual place: half the screen, so a tall form never sends them to the top. */
const LIFT_MAX = 0.5;

export interface ToastPlace {
  /** px off the inline-end edge (a side dock's width). */
  end: number;
  /** px above the usual bottom place. */
  lift: number;
  /** At the top edge instead: nothing below could clear the controls with the whole stack on screen. */
  top: boolean;
}

/**
 * Where the toast column goes (pure, for tests). The column sits against the inline-end edge (the right, or the left
 * when `rtl`); `end` moves it off a dock docked on that edge, and `lift` raises it the least that clears every control
 * in its column, capped at half the screen and never so high that the stack leaves the screen. When even that cannot
 * clear them, the column goes to the top edge if that is clear (`top`); otherwise it keeps the highest lift on screen.
 * `base` is the usual distance from the bottom, `stack` the toasts' total height, `width` the column's width (0 = the
 * full width between `gap` margins, the phone layout).
 */
export function toastPlacement(o: {
  viewW: number;
  viewH: number;
  base: number;
  stack: number;
  width: number;
  gap: number;
  dock: Box | null;
  controls: Box[];
  rtl?: boolean;
}): ToastPlace {
  // Inline coordinates: x counts from the start edge, so the toasts' edge is always viewW.
  const flip = (b: Box): Box => (o.rtl ? { left: o.viewW - b.right, right: o.viewW - b.left, top: b.top, bottom: b.bottom } : b);
  const dock = o.dock && flip(o.dock);
  const controls = o.controls.map(flip);
  const full = o.width === 0;
  const side = !full && dock !== null && dock.right >= o.viewW - 1 && dock.left >= o.width + 2 * o.gap;
  const end = side && dock ? o.viewW - dock.left : 0;
  const right = o.viewW - end - o.gap;
  const left = full ? o.gap : right - o.width;
  const hits = (top: number, under: number) => controls.filter((c) => c.right > left && c.left < right && c.bottom > top && c.top < under);
  // The highest bottom offset: half the screen, and the whole stack still `gap` below the top of the screen.
  const max = Math.max(o.base, Math.min(o.viewH * LIFT_MAX, o.viewH - o.stack - o.gap));
  let bottom = o.base;
  let clear = false;
  for (let i = 0; i < 32; i++) {
    const hit = hits(o.viewH - bottom - o.stack, o.viewH - bottom);
    if (hit.length === 0) {
      clear = true;
      break;
    }
    const next = Math.min(max, o.viewH - Math.min(...hit.map((c) => c.top)) + o.gap);
    if (next <= bottom) break;
    bottom = next;
  }
  if (!clear && hits(o.gap, o.gap + o.stack).length === 0) return { end, lift: 0, top: true };
  return { end, lift: bottom - o.base, top: false };
}

export interface TrayBudget {
  /** The tray's reserve: its frame, head and up to 3 rows (1 on a small screen), as the tray resolves it (--tray-r1/--tray-r3). */
  R: number;
  /** The toasts' band: what the visual viewport leaves above the reserve, less a gap above and below. */
  B: number;
  /** The band's height now (published as --toast-stack-h); 0 while queued. */
  T: number;
  /** The tray's max height. */
  M: number;
  /** No toast shows while the tray is open (the band would be under T_min); timed ones pause. */
  queued: boolean;
  /** Even the reserve does not fit: the tray's own CSS takes the whole viewport, head and rows in one scroll box. */
  full: boolean;
}

/**
 * How toasts and an open phone tray share the visual viewport (pure, for tests). `r1`/`r3` are the tray's
 * reserve with one or three rows (the tray's --tray-r1/--tray-r3), `tMin` one toast's title line + Close, `stack` the
 * toasts' total height. While unqueued the band [gap, gap + T] ends at least `gap` above the tray
 * (T ≤ B ⇒ M ≤ vvh − T − 2·gap) and M ≥ R.
 */
export function trayToastBudget(o: { vvh: number; r1: number; r3: number; gap: number; tMin: number; stack: number }): TrayBudget {
  const band = (r: number) => o.vvh - r - 2 * o.gap;
  const R = band(o.r3) < o.tMin ? o.r1 : o.r3;
  const B = band(R);
  if (B >= o.tMin) {
    const T = Math.min(o.stack, B);
    return { R, B, T, M: Math.max(R, o.vvh - Math.max(48, T + 2 * o.gap)), queued: false, full: false };
  }
  if (o.vvh >= R) return { R, B, T: 0, M: Math.max(R, o.vvh - 48), queued: true, full: false };
  return { R, B, T: 0, M: o.vvh, queued: true, full: true };
}

/**
 * The height trayToastBudget works in, in layout px: a scale-normalized budget, not the part of the layout that shows.
 * The tray and the toast region are position: fixed, so they are laid out in the layout viewport whatever the zoom.
 * vv.height × scale undoes the zoom (vv.height shrinks as scale grows), so pinch zoom alone leaves the budget at the
 * layout height. A soft keyboard that shrinks the visual viewport (or, in resizes-content, the layout) lowers it. So the
 * budget is min(layout height, vv.height × scale). This is a budget only: it does not keep either box visible above a
 * keyboard or in a zoomed, panned slice, and offsetTop is ignored on purpose. No visualViewport: innerHeight.
 */
export function trayViewportHeight(vv: Pick<VisualViewport, 'height' | 'scale'> | null | undefined, layoutH: number, innerH: number): number {
  if (!vv) return innerH;
  const visible = vv.height * (vv.scale || 1);
  return layoutH > 0 ? Math.min(layoutH, visible) : visible;
}
