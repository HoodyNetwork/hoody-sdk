// The transitioncancel fix, driven through React Aria's own runAfterTransition (the module whose focus moves wait):
// a callback queued while an element transitions several properties must run once they are all cancelled, whether
// the element is still on the page or was removed mid-transition.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runAfterTransition } from 'react-aria/private/utils/runAfterTransition';
import { installTransitionCancelFix, transitionRunsHeld } from './transitionCancel';

// happy-dom's TransitionEvent drops propertyName, which React Aria reads: a minimal one with the fields it uses.
class TestTransitionEvent extends Event {
  readonly propertyName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;
  constructor(type: string, init: TransitionEventInit = {}) {
    super(type, init);
    this.propertyName = init.propertyName ?? '';
    this.elapsedTime = init.elapsedTime ?? 0;
    this.pseudoElement = init.pseudoElement ?? '';
  }
}

const PROPS = ['background-color', 'color', 'border-top-color'];
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const fire = (el: Element, type: string, props = PROPS) => {
  for (const p of props) el.dispatchEvent(new TestTransitionEvent(type, { propertyName: p, bubbles: true }));
};

/** Wait until React Aria has nothing left in its transition set (it drops removed elements at its next frame). A case
 *  that left a property running would hang here, so cases never hold each other. */
const settled = () => new Promise<void>((r) => runAfterTransition(() => r()));

/** Start PROPS on a new element, queue a React Aria callback behind them, optionally detach, then cancel them all;
 *  returns how often the callback ran by the frame after the cancels. */
async function queuedThenCancelled(detach: boolean) {
  const el = document.body.appendChild(document.createElement('a'));
  fire(el, 'transitionrun');
  const cb = vi.fn();
  const cancel = runAfterTransition(cb);
  try {
    await frame();
    expect(cb).not.toHaveBeenCalled(); // queued: the element is still transitioning
    if (detach) el.remove();
    fire(el, 'transitioncancel');
    await frame();
    return cb.mock.calls.length;
  } finally {
    // A red run leaves the callback queued and the element listed: drop the callback, end what is still connected,
    // remove the element, and wait for React Aria's set to empty.
    cancel();
    fire(el, 'transitionend');
    el.remove();
    await settled();
  }
}

describe('transitioncancel fix', () => {
  const saved = globalThis.TransitionEvent;
  let uninstall: () => void = () => undefined;
  beforeAll(() => {
    globalThis.TransitionEvent = TestTransitionEvent as unknown as typeof TransitionEvent;
  });
  afterEach(() => {
    uninstall();
    uninstall = () => undefined;
  });
  afterAll(() => {
    globalThis.TransitionEvent = saved;
  });

  it('without it, several cancelled properties leave a React Aria callback waiting (the bug)', async () => {
    expect(await queuedThenCancelled(false)).toBe(0);
  });

  it('with it, the callback runs once all are cancelled on an element still on the page', async () => {
    uninstall = installTransitionCancelFix(document);
    expect(await queuedThenCancelled(false)).toBe(1);
  });

  it('with it, the callback runs once all are cancelled on an element removed mid-transition', async () => {
    uninstall = installTransitionCancelFix(document);
    expect(await queuedThenCancelled(true)).toBe(1);
  });

  it('with it, the callback still waits while a property has not ended', async () => {
    uninstall = installTransitionCancelFix(document);
    const el = document.body.appendChild(document.createElement('a'));
    fire(el, 'transitionrun');
    const cb = vi.fn();
    const cancel = runAfterTransition(cb);
    try {
      await frame();
      fire(el, 'transitioncancel', PROPS.slice(0, 2));
      await frame();
      expect(cb).not.toHaveBeenCalled();
      fire(el, 'transitionend', PROPS.slice(2));
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      cancel();
      fire(el, 'transitionend');
      el.remove();
      await settled();
    }
  });

  it('with it, a run started inside another run leaves the outer one covered', async () => {
    uninstall = installTransitionCancelFix(document);
    const outer = document.body.appendChild(document.createElement('a'));
    const inner = document.body.appendChild(document.createElement('b'));
    // The outer element's first run starts a run on the inner one before React Aria's document listener sees it.
    outer.addEventListener('transitionrun', () => fire(inner, 'transitionrun', ['opacity']), { once: true });
    fire(outer, 'transitionrun');
    const cb = vi.fn();
    const cancel = runAfterTransition(cb);
    try {
      await frame();
      fire(outer, 'transitioncancel');
      fire(inner, 'transitionend', ['opacity']);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      cancel();
      fire(outer, 'transitionend');
      outer.remove();
      inner.remove();
      await settled();
    }
  });

  it('with it, a run whose propagation was stopped covers nothing after its dispatch', () => {
    uninstall = installTransitionCancelFix(document);
    const el = document.body.appendChild(document.createElement('a'));
    const stop = (e: Event) => e.stopPropagation();
    document.addEventListener('transitionrun', stop, true);
    try {
      fire(el, 'transitionrun', ['color']);
    } finally {
      document.removeEventListener('transitionrun', stop, true);
    }
    const later = vi.fn();
    el.addEventListener('transitioncancel', later, { once: true });
    fire(el, 'transitioncancel', ['color', 'color']);
    expect(later).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it('with it, runs stopped before the window bubble phase are not kept: each new run prunes the finished ones', () => {
    uninstall = installTransitionCancelFix(document);
    const stop = (e: Event) => e.stopPropagation();
    document.addEventListener('transitionrun', stop, true);
    try {
      for (let i = 0; i < 50; i++) {
        const el = document.body.appendChild(document.createElement('a'));
        fire(el, 'transitionrun', ['color']);
        el.remove();
      }
      // only the latest stopped run is still held, until the next run (or a qualifying registration) prunes it
      expect(transitionRunsHeld(document)).toBe(1);
    } finally {
      document.removeEventListener('transitionrun', stop, true);
    }
    const el = document.body.appendChild(document.createElement('a'));
    fire(el, 'transitionrun', ['color']);
    expect(transitionRunsHeld(document)).toBe(0);
    el.remove();
  });

  it('with it, options are read once each, in the browser order, and not at all outside a run', () => {
    const reads: string[] = [];
    const logged = (once: boolean): AddEventListenerOptions => {
      const o = {};
      for (const k of ['signal', 'passive', 'once', 'capture'] as const)
        Object.defineProperty(o, k, { get: () => (reads.push(k), k === 'once' ? once : undefined), enumerable: true });
      return o;
    };
    const el = document.body.appendChild(document.createElement('a'));
    // A fresh listener per registration: happy-dom skips some option reads for a listener it already has.
    // What the browser (here happy-dom) reads by itself, fix not installed.
    el.addEventListener('transitioncancel', vi.fn(), logged(true));
    const native = reads.splice(0);
    uninstall = installTransitionCancelFix(document);
    el.addEventListener('transitioncancel', vi.fn(), logged(true));
    expect(reads.splice(0), 'outside a run the options go to the browser untouched').toEqual(native);
    el.addEventListener('transitionrun', () => el.addEventListener('transitioncancel', vi.fn(), logged(true)), { once: true });
    fire(el, 'transitionrun', ['color']);
    expect(reads.splice(0), 'during a run: capture, once, passive, signal, each once').toEqual(['capture', 'once', 'passive', 'signal']);
    el.remove();
  });

  it('with it, listener options are kept: null options work, an inherited capture and signal still apply', () => {
    uninstall = installTransitionCancelFix(document);
    const parent = document.body.appendChild(document.createElement('div'));
    const el = parent.appendChild(document.createElement('a'));
    const order: string[] = [];
    const plain = vi.fn();
    const aborted = vi.fn();
    const stop = new AbortController();
    // Options objects whose capture and signal come from their prototype (a spread would drop them).
    const inherit = (base: AddEventListenerOptions) => Object.assign(Object.create(base) as AddEventListenerOptions, { once: true });
    el.addEventListener(
      'transitionrun',
      () => {
        expect(() => el.addEventListener('transitioncancel', plain, null as unknown as AddEventListenerOptions)).not.toThrow();
        parent.addEventListener('transitioncancel', () => order.push('parent capture'), inherit({ capture: true }));
        el.addEventListener('transitioncancel', aborted, inherit({ signal: stop.signal }));
      },
      { once: true },
    );
    el.addEventListener('transitioncancel', () => order.push('target'));
    fire(el, 'transitionrun', ['color']);
    stop.abort();
    fire(el, 'transitioncancel', ['color', 'color']);
    expect(plain).toHaveBeenCalledTimes(2);
    expect(aborted).not.toHaveBeenCalled();
    expect(order).toEqual(['parent capture', 'target', 'parent capture', 'target']);
    parent.remove();
  });

  it('leaves once alone outside a transitionrun, and for other events during one', async () => {
    uninstall = installTransitionCancelFix(document);
    const el = document.body.appendChild(document.createElement('a'));
    const outside = vi.fn();
    el.addEventListener('transitioncancel', outside, { once: true });
    const other = vi.fn();
    el.addEventListener('transitionrun', () => el.addEventListener('focus', other, { once: true }), { once: true });
    fire(el, 'transitionrun', ['color']);
    // the run's dispatch is over
    const after = vi.fn();
    el.addEventListener('transitioncancel', after, { once: true });
    fire(el, 'transitioncancel', ['color', 'color']);
    el.dispatchEvent(new Event('focus'));
    el.dispatchEvent(new Event('focus'));
    expect(outside).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it('installs once per document and uninstalls cleanly; skipped without TransitionEvent', async () => {
    uninstall = installTransitionCancelFix(document);
    expect(installTransitionCancelFix(document)).toBe(uninstall);
    uninstall();
    uninstall = () => undefined;
    expect(Object.prototype.hasOwnProperty.call(Element.prototype, 'addEventListener')).toBe(false);
    expect(await queuedThenCancelled(true)).toBe(0);
    globalThis.TransitionEvent = undefined as unknown as typeof TransitionEvent;
    try {
      uninstall = installTransitionCancelFix(document);
      expect(Object.prototype.hasOwnProperty.call(Element.prototype, 'addEventListener')).toBe(false);
    } finally {
      globalThis.TransitionEvent = TestTransitionEvent as unknown as typeof TransitionEvent;
    }
  });
});
