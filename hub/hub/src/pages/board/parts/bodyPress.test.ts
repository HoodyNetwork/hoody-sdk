// The body press (bodyPress.ts): one gesture per press, bound to its pointer; a release in place enters, anything
// else ends it without entering.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchBodyPress, type BodyPress } from './bodyPress';

let root: HTMLElement, body: HTMLElement, outside: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"><div id="body"><span id="text">x</span><button id="busy" aria-disabled="true">Check again</button><a id="lnk" href="#x">Open</a></div></div><div id="out"></div>';
  root = document.getElementById('root')!;
  body = document.getElementById('body')!;
  outside = document.getElementById('out')!;
});
afterEach(() => { document.body.innerHTML = ''; });

const press = (o: Partial<BodyPress> = {}): BodyPress => ({ pointerId: 1, button: 0, isPrimary: true, clientX: 10, clientY: 10, target: body, ...o });
function fire(type: string, target: Element, o: { pointerId?: number; x?: number; y?: number } = {}) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: o.pointerId ?? 1, clientX: o.x ?? 10, clientY: o.y ?? 10, isPrimary: (o.pointerId ?? 1) === 1 }));
}
function watch(p: BodyPress = press(), live = true) {
  const enter = vi.fn();
  const stop = watchBodyPress(p, root, live, 4, enter);
  return { enter, stop };
}

describe('watchBodyPress', () => {
  it('a release in place inside the tile enters once', () => {
    const { enter, stop } = watch();
    expect(stop).not.toBeNull();
    fire('pointerup', body);
    fire('pointerup', body);
    expect(enter).toHaveBeenCalledTimes(1);
  });

  it('a press on a control never starts: a busy button (its pointerdown is not stopped), a link', () => {
    expect(watch(press({ target: document.getElementById('busy') })).stop).toBeNull();
    expect(watch(press({ target: document.getElementById('lnk') })).stop).toBeNull();
    expect(watch(press({ target: document.getElementById('text') })).stop).not.toBeNull();
  });

  it('a tile with no frame when pressed never starts, even if it gets one before the release', () => {
    const { enter, stop } = watch(press(), false);
    expect(stop).toBeNull();
    fire('pointerup', body);
    expect(enter).not.toHaveBeenCalled();
  });

  it('only the primary button of the primary pointer starts', () => {
    expect(watch(press({ button: 2 })).stop).toBeNull();
    expect(watch(press({ isPrimary: false })).stop).toBeNull();
  });

  it('a move past the threshold ends it, even when the pointer comes back before the release', () => {
    const { enter } = watch();
    fire('pointermove', body, { y: 60 });
    fire('pointermove', body, { y: 10 });
    fire('pointerup', body);
    expect(enter).not.toHaveBeenCalled();
  });

  it('a small move within the threshold still enters', () => {
    const { enter } = watch();
    fire('pointermove', body, { x: 12, y: 11 });
    fire('pointerup', body, { x: 12, y: 11 });
    expect(enter).toHaveBeenCalledTimes(1);
  });

  it('a release far from the press does not enter', () => {
    const { enter } = watch();
    fire('pointerup', body, { y: 60 });
    expect(enter).not.toHaveBeenCalled();
  });

  it('another pointer can neither complete nor cancel it', () => {
    const { enter } = watch();
    fire('pointermove', body, { pointerId: 2, y: 80 });
    fire('pointerup', body, { pointerId: 2 });
    expect(enter).not.toHaveBeenCalled();
    fire('pointercancel', body, { pointerId: 2 });
    fire('pointerup', body);
    expect(enter).toHaveBeenCalledTimes(1);
  });

  it('its own pointercancel ends it', () => {
    const { enter } = watch();
    fire('pointercancel', body);
    fire('pointerup', body);
    expect(enter).not.toHaveBeenCalled();
  });

  it('a new press of the same pointer ends it (its release was lost, e.g. over a frame)', () => {
    const { enter } = watch();
    fire('pointerdown', outside);
    fire('pointerup', body);
    expect(enter).not.toHaveBeenCalled();
  });

  it('a release outside the tile does not enter', () => {
    const { enter } = watch();
    fire('pointerup', outside);
    expect(enter).not.toHaveBeenCalled();
  });

  it('the disposer removes every listener', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { enter, stop } = watch();
    stop?.();
    fire('pointerup', body);
    expect(enter).not.toHaveBeenCalled();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['pointercancel', 'pointerdown', 'pointermove', 'pointerup']));
    spy.mockRestore();
  });
});
