// applock-host.ts against a fake engine: the body attribute and
// inert marks follow isLocked() synchronously, the host stays operable under a background modal, focus comes back,
// leave/return/idle events reach the engine. The real engine across two pages is the Playwright run.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const eng = vi.hoisted(() => ({
  locked: false,
  listeners: new Set<() => void>(),
  leaveTab: vi.fn(),
  checkIdle: vi.fn(),
  noteInput: vi.fn(),
  set(v: boolean) { this.locked = v; for (const l of [...this.listeners]) l(); },
}));
vi.mock('./applock', () => ({
  isLocked: () => eng.locked,
  onLockChange: (l: () => void) => { eng.listeners.add(l); return () => { eng.listeners.delete(l); }; },
  leaveTab: eng.leaveTab,
  checkIdle: eng.checkIdle,
  noteInput: eng.noteInput,
}));

// app/test-setup.ts imports '@core', which loads this module against the real engine before the mock exists: load
// it again so its './applock' is the fake above.
vi.resetModules();
const { IDLE_TICK_MS, installLockHost, LOCK_HOST_ID, LOCKED_ATTR, uninstallLockHost } = await import('./applock-host');

let ticks: Array<() => void> = [];
const microtasks = () => new Promise((r) => setTimeout(r, 0));
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"><button id="b1">one</button></div><div id="toast"></div>';
  eng.locked = false;
  eng.listeners.clear();
  eng.leaveTab.mockClear(); eng.checkIdle.mockClear(); eng.noteInput.mockClear();
  ticks = [];
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => { uninstallLockHost(); document.getElementById(LOCK_HOST_ID)?.remove(); });

function install(o: { fallbackFocus?: () => void } = {}) {
  const host = installLockHost({ ...o, every: (fn, ms) => { expect(ms).toBe(IDLE_TICK_MS); ticks.push(fn); return () => { ticks = ticks.filter((t) => t !== fn); }; } });
  return host;
}

describe('the lock host', () => {
  it('a body child #hub-lock-host, outside the app root; no attribute while unlocked', () => {
    const host = install();
    expect(host.parentElement).toBe(document.body);
    expect(host.id).toBe(LOCK_HOST_ID);
    expect(document.body.hasAttribute(LOCKED_ATTR)).toBe(false);
  });

  it('the host is a React Aria top layer, so a background modal never treats a press in it as outside (or hides it)', () => {
    expect(install().hasAttribute('data-react-aria-top-layer')).toBe(true);
    const pre = document.getElementById(LOCK_HOST_ID)!;
    pre.removeAttribute('data-react-aria-top-layer');
    expect(install()).toBe(pre);
    expect(pre.hasAttribute('data-react-aria-top-layer')).toBe(true);
  });

  it('a page that boots locked carries the attribute from install, before anything renders', () => {
    eng.locked = true;
    install();
    expect(document.body.hasAttribute(LOCKED_ATTR)).toBe(true);
  });

  it('lock: the attribute and inert on every other body child, synchronously; the host stays operable', () => {
    const host = install();
    eng.set(true);
    expect(document.body.hasAttribute(LOCKED_ATTR)).toBe(true);
    expect(document.getElementById('root')!.hasAttribute('inert')).toBe(true);
    expect(document.getElementById('toast')!.hasAttribute('inert')).toBe(true);
    expect(host.hasAttribute('inert')).toBe(false);
  });

  it('a body child added while locked (a portal opened by a timer) becomes inert; unlock removes only the marks the host set', async () => {
    install();
    const already = document.createElement('div');
    already.setAttribute('inert', '');
    document.body.appendChild(already);
    eng.set(true);
    const late = document.createElement('div');
    document.body.appendChild(late);
    await microtasks();
    expect(late.hasAttribute('inert')).toBe(true);
    eng.set(false);
    expect(document.body.hasAttribute(LOCKED_ATTR)).toBe(false);
    expect(late.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('root')!.hasAttribute('inert')).toBe(false);
    expect(already.hasAttribute('inert')).toBe(true);
  });

  // React Aria's overlay hides what is outside it only where it is not hidden already (ariaHideOutside skips an element
  // that is inert and was not hidden by it): a modal opened while locked hid nothing the host had marked. One predicate,
  // read from the DOM: an open modal dialog outside the app root keeps the host's background marks (P2a4).
  const modal = (inner = '<button type="button">close</button>') => {
    const w = document.createElement('div');
    w.innerHTML = `<section role="dialog" tabindex="-1" aria-label="m">${inner}</section>`;
    return { w, d: w.firstElementChild as HTMLElement };
  };
  const marked = () => ['root', 'toast'].map((id) => document.getElementById(id)!.hasAttribute('inert'));

  it('a modal opened while locked: unlock frees its body child and focuses it; the background stays inert while it is open, and is freed the moment it closes', async () => {
    const fallbackFocus = vi.fn();
    install({ fallbackFocus });
    eng.set(true);
    const { w, d } = modal();
    const other = document.createElement('div');
    document.body.append(w, other);
    await microtasks();
    expect(w.hasAttribute('inert')).toBe(true);
    eng.set(false);
    expect(w.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(d);
    expect(marked()).toEqual([true, true]);
    expect(other.hasAttribute('inert')).toBe(true);
    // Other changes while it is open (a toast arrives, the app re-renders) keep the marks.
    document.body.append(document.createElement('div'));
    document.getElementById('b1')!.style.color = 'red';
    await microtasks();
    expect(marked()).toEqual([true, true]);
    w.remove();
    await microtasks();
    expect(marked()).toEqual([false, false]);
    expect(other.hasAttribute('inert')).toBe(false);
    expect(fallbackFocus).toHaveBeenCalledTimes(1);
  });

  it('relock while that modal is still open, unlock again: the background stays inert until it closes', async () => {
    install();
    eng.set(true);
    const { w } = modal();
    document.body.append(w);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([true, true]);
    eng.set(true);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([true, true]);
    expect(w.hasAttribute('inert')).toBe(false);
    w.remove();
    await microtasks();
    expect(marked()).toEqual([false, false]);
  });

  it('the dialog removed while its wrapper stays: the background is freed', async () => {
    install();
    eng.set(true);
    const { w, d } = modal();
    document.body.append(w);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([true, true]);
    d.remove();
    await microtasks();
    expect(w.isConnected).toBe(true);
    expect(marked()).toEqual([false, false]);
  });

  for (const [how, hide] of [
    ['hidden', (e: HTMLElement) => { e.hidden = true; }],
    ['aria-hidden', (e: HTMLElement) => { e.setAttribute('aria-hidden', 'true'); }],
    ['display:none', (e: HTMLElement) => { e.style.display = 'none'; }],
    ['visibility:hidden', (e: HTMLElement) => { e.style.visibility = 'hidden'; }],
  ] as const) {
    it(`a modal hidden in place (${how}, on the dialog or on its wrapper): the background is freed`, async () => {
      for (const onWrapper of [false, true]) {
        document.getElementById('root')!.removeAttribute('inert');
        document.getElementById('toast')!.removeAttribute('inert');
        install();
        eng.set(true);
        const { w, d } = modal();
        document.body.append(w);
        await microtasks();
        eng.set(false);
        expect(marked()).toEqual([true, true]);
        hide(onWrapper ? w : d);
        await microtasks();
        expect(marked()).toEqual([false, false]);
        uninstallLockHost();
        w.remove();
      }
    });
  }

  it('a <dialog> closed in place (its open attribute removed) does not count: the background is freed', async () => {
    install();
    eng.set(true);
    const w = document.createElement('div');
    w.innerHTML = '<dialog open role="dialog"><button type="button">x</button></dialog>';
    document.body.append(w);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([true, true]);
    w.querySelector('dialog')!.removeAttribute('open');
    await microtasks();
    expect(marked()).toEqual([false, false]);
  });

  it('what does not count: a dialog in the app root, an aria-modal="false" dialog, a plain late child', async () => {
    install();
    eng.set(true);
    const inRoot = document.createElement('section');
    inRoot.setAttribute('role', 'dialog');
    document.getElementById('root')!.append(inRoot);
    const nonModal = modal().w;
    nonModal.firstElementChild!.setAttribute('aria-modal', 'false');
    const plain = document.createElement('div');
    plain.innerHTML = '<button type="button">x</button>';
    document.body.append(nonModal, plain);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([false, false]);
    for (const el of [nonModal, plain]) expect(el.hasAttribute('inert')).toBe(false);
  });

  it('an aria-modal="true" dialog counts like a plain one', async () => {
    install();
    eng.set(true);
    const { w, d } = modal();
    d.setAttribute('aria-modal', 'true');
    document.body.append(w);
    await microtasks();
    eng.set(false);
    expect(marked()).toEqual([true, true]);
  });

  it('a modal already open before the lock (React Aria marked the background itself): unlock leaves React Aria\'s marks alone and frees only the host\'s', async () => {
    install();
    const { w } = modal();
    document.body.append(w);
    document.getElementById('root')!.setAttribute('inert', ''); // React Aria's own mark
    eng.set(true);
    expect(w.hasAttribute('inert')).toBe(true);
    eng.set(false);
    expect(w.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('root')!.hasAttribute('inert')).toBe(true);
    expect(document.getElementById('toast')!.hasAttribute('inert')).toBe(true); // the host's, held: a modal is open
    w.remove();
    await microtasks();
    expect(document.getElementById('toast')!.hasAttribute('inert')).toBe(false);
    expect(document.getElementById('root')!.hasAttribute('inert')).toBe(true);
  });

  it('the host keeper: a background modal marking the host inert/aria-hidden while locked is undone at once', async () => {
    const host = install();
    host.setAttribute('aria-hidden', 'true');
    eng.set(true);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    host.setAttribute('inert', '');
    host.setAttribute('aria-hidden', 'true');
    await microtasks();
    expect(host.hasAttribute('inert')).toBe(false);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    eng.set(false);
    host.setAttribute('aria-hidden', 'true');
    await microtasks();
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('unlock gives focus back to the element focused before the lock', () => {
    install();
    const b = document.getElementById('b1') as HTMLButtonElement;
    b.focus();
    eng.set(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    eng.set(false);
    expect(document.activeElement).toBe(b);
  });

  it('unlock with that element gone: the fallback (the page title)', () => {
    const fallbackFocus = vi.fn();
    install({ fallbackFocus });
    document.getElementById('b1')!.focus();
    eng.set(true);
    document.getElementById('b1')!.remove();
    eng.set(false);
    expect(fallbackFocus).toHaveBeenCalledTimes(1);
  });

  it('unlock with that element still there but unable to take focus (disabled, or hidden in a kept page): the fallback', () => {
    const fallbackFocus = vi.fn();
    install({ fallbackFocus });
    const b = document.getElementById('b1') as HTMLButtonElement;
    b.focus();
    eng.set(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    b.disabled = true;
    eng.set(false);
    expect(document.activeElement).not.toBe(b);
    expect(fallbackFocus).toHaveBeenCalledTimes(1);
  });
});

describe('leave, return and idle', () => {
  it('hidden, pagehide and freeze call leaveTab (CANCEL + lock-on-leave); visible calls checkIdle', () => {
    install();
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('freeze'));
    expect(eng.leaveTab).toHaveBeenCalledTimes(3);
    setVisibility('visible');
    expect(eng.checkIdle).toHaveBeenCalledTimes(1);
  });

  it('a bfcache pageshow (persisted) checks idle synchronously in the handler; focus checks too', () => {
    install();
    const e = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(e, 'persisted', { value: true });
    window.dispatchEvent(e);
    expect(eng.checkIdle).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('focus'));
    expect(eng.checkIdle).toHaveBeenCalledTimes(2);
  });

  it('a bfcache pageshow whose idle check locks: the body attribute is set before dispatch returns', () => {
    install();
    eng.checkIdle.mockImplementationOnce(() => { eng.set(true); });
    const e = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(e, 'persisted', { value: true });
    window.dispatchEvent(e);
    expect(document.body.hasAttribute(LOCKED_ATTR)).toBe(true);
    expect(document.getElementById('root')!.hasAttribute('inert')).toBe(true);
  });

  it('the 15 s tick checks idle only while visible, with frameFocus when a Board frame holds focus', () => {
    install();
    expect(ticks.length).toBe(1);
    ticks[0]!();
    expect(eng.checkIdle).toHaveBeenLastCalledWith({ frameFocus: false });
    const f = document.createElement('iframe');
    document.body.appendChild(f);
    f.focus();
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => f });
    ticks[0]!();
    expect(eng.checkIdle).toHaveBeenLastCalledWith({ frameFocus: true });
    delete (document as { activeElement?: unknown }).activeElement;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    ticks[0]!();
    expect(eng.checkIdle).toHaveBeenCalledTimes(2);
  });

  it('pointer, key, wheel and touch input count as input', () => {
    install();
    for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.dispatchEvent(new Event(t));
    expect(eng.noteInput).toHaveBeenCalledTimes(4);
  });
});
