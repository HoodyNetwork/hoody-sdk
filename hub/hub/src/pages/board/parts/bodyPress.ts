// A press on a live tile's body that enters the program on its release. One gesture per press, bound to the
// pointer that started it:
//   - only the primary button of the primary pointer, on a tile that has a frame when pressed, never on a control
//     (a busy react-aria button lets its pointerdown through, so the control list is the guard, not propagation);
//   - it ends without entering when that pointer moves `slop` px or more at any time (a scroll or a drag, even one
//     that comes back), is cancelled (the browser took the gesture), or presses again (the old release was lost,
//     e.g. over a frame); other pointers' events are ignored;
//   - a release of that pointer inside the same tile calls `enter` once (a tile unmounted meanwhile cannot hold the
//     release's target: events on detached nodes never reach the window). The caller defers the focus
//     past the release's compatibility mouse events (a touch's mousedown would take the focus back).
// Returns the disposer (the Board calls it on a new gesture and on unmount), or null when the press does not qualify.
export const BODY_CONTROLS = 'button, a, input, select, textarea, iframe, [role="button"], [role="link"], [role="menu"], [role="menuitem"], [role="dialog"], [role="alertdialog"], [contenteditable]';

export interface BodyPress {
  pointerId: number;
  button: number;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

export function watchBodyPress(p: BodyPress, root: HTMLElement, live: boolean, slop: number, enter: () => void, win: Window = window): (() => void) | null {
  if (!live || p.button !== 0 || !p.isPrimary) return null;
  const t = p.target as Element | null;
  if (!t || typeof t.closest !== 'function' || t.closest(BODY_CONTROLS)) return null;
  let moved = false, done = false;
  const own = (ev: PointerEvent) => ev.pointerId === p.pointerId;
  const far = (ev: PointerEvent) => Math.hypot(ev.clientX - p.clientX, ev.clientY - p.clientY) >= slop;
  const move = (ev: PointerEvent) => { if (own(ev) && far(ev)) moved = true; };
  const up = (ev: PointerEvent) => {
    if (!own(ev)) return;
    stop();
    if (!moved && !far(ev) && root.contains(ev.target as Node)) enter();
  };
  const end = (ev: PointerEvent) => { if (own(ev)) stop(); };
  const stop = () => {
    if (done) return;
    done = true;
    win.removeEventListener('pointermove', move, true);
    win.removeEventListener('pointerup', up, true);
    win.removeEventListener('pointercancel', end, true);
    win.removeEventListener('pointerdown', end, true);
  };
  win.addEventListener('pointermove', move, true);
  win.addEventListener('pointerup', up, true);
  win.addEventListener('pointercancel', end, true);
  win.addEventListener('pointerdown', end, true);
  return stop;
}
