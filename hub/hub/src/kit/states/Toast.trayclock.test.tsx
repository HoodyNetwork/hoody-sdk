// Vitest (timers, case t6): while an open phone tray leaves no band for even one toast, the toasts
// queue and a timed one is paused, not dismissed (C9: nothing is dropped unseen); when the tray closes it shows again and
// runs out only its remaining time. A fake clock drives the toast timers and the once-a-frame placement. The tray here is
// the bare `[data-hub-tray]` Toaster measures; traytoast.spec.ts is the browser check.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Toaster, closeToast, showToast } from './Toast';

const shown = () => document.querySelectorAll('[data-hub-toasts] [role="alertdialog"]').length;
const region = () => document.querySelector<HTMLElement>('[data-hub-toasts]');
let keys: string[] = [];

function setViewport(h: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: h });
  if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => h });
}

/** `ms` of fake time, a frame at a time, letting React and the placement's MutationObserver run in between. */
async function pass(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  vi.useFakeTimers();
  setViewport(40);
});
afterEach(() => {
  for (const k of keys) closeToast(k);
  keys = [];
  vi.useRealTimers();
  cleanup();
  setViewport(768);
});

describe('Toaster beside a phone tray: queued timers pause', () => {
  it('a timed toast queued past its timeout is still there when the tray closes, then runs out its remaining time', async () => {
    render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      const head = document.createElement('div');
      head.dataset.trayHead = '';
      tray.append(head);
      document.body.append(tray);
      keys.push(showToast({ title: 'Saved', tone: 'info' }, 4000));
      await pass(100);
      expect(region()?.dataset.tray, 'precondition: no band, so queued').toBe('queued');
      expect(shown()).toBe(1);
      await pass(10_000);
      expect(shown(), 'paused while queued: not timed out').toBe(1);
      tray.remove();
      setViewport(768);
      await pass(100);
      expect(region()?.dataset.tray, 'the tray closed: the band ends').toBeUndefined();
      await pass(3_500);
      expect(shown(), 'about 3.8 s of its 4 s were left').toBe(1);
      await pass(600);
      expect(shown(), 'its remaining time ran out').toBe(0);
    } finally {
      tray.remove();
    }
  });

  it('a timed toast that arrives after queuing began is paused too, not timed out unseen', async () => {
    render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      document.body.append(tray);
      keys.push(showToast({ title: 'Restart may have gone through', tone: 'unknown' }));
      await pass(100);
      expect(region()?.dataset.tray, 'precondition: queued before the timed toast arrives').toBe('queued');
      keys.push(showToast({ title: 'Saved', tone: 'info' }, 4000));
      await pass(10_000);
      expect(shown(), 'the late timed toast is still there').toBe(2);
      tray.remove();
      setViewport(768);
      await pass(3_000);
      expect(shown(), 'it shows again with nearly all its time left').toBe(2);
      await pass(1_500);
      expect(shown(), 'its remaining time ran out; the sticky one stays').toBe(1);
    } finally {
      tray.remove();
    }
  });

  it('a Toaster remounted while the tray stays queued pauses its timers again, and leaves no hold once the tray goes', async () => {
    const first = render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      document.body.append(tray);
      keys.push(showToast({ title: 'Saved', tone: 'info' }, 4000));
      await pass(100);
      expect(region()?.dataset.tray, 'precondition: queued').toBe('queued');
      first.unmount();
      render(<Toaster />);
      keys.push(showToast({ title: 'Copied', tone: 'info' }, 4000));
      await pass(10_000);
      expect(region()?.dataset.tray, 'still queued').toBe('queued');
      expect(shown(), 'both paused, not timed out').toBe(2);
      tray.remove();
      setViewport(768);
      await pass(100);
      expect(region()?.dataset.tray).toBeUndefined();
      await pass(4_500);
      expect(shown(), 'no stale hold: both ran out').toBe(0);
    } finally {
      tray.remove();
    }
  });

  it('the tray loses its toast budget when the last toast goes: no stale --tray-max', async () => {
    setViewport(400);
    render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      // Readable reserves, as a browser with @property resolves them.
      tray.style.setProperty('--tray-r1', '100px');
      tray.style.setProperty('--tray-r3', '188px');
      document.body.append(tray);
      const key = showToast({ title: 'Saved', tone: 'info' });
      keys.push(key);
      await pass(100);
      expect(tray.style.getPropertyValue('--tray-max'), 'precondition: sized beside the toast').not.toBe('');
      closeToast(key);
      await pass(500);
      expect(shown()).toBe(0);
      expect(tray.style.getPropertyValue('--tray-max'), 'the toast went: the tray takes its own height back').toBe('');
    } finally {
      tray.remove();
    }
  });

  // Through the Toaster: --tray-max follows the scale-normalized height, not the zoomed visual height. With
  // jsdom's toast measuring 0, M = max(R, h − 48) whether the budget queues or not: 592 for h 640, 272 for h 320.
  it.each([
    ['pinch zoom at scale 2: the layout height (640), not the zoomed slice (320)', 320, 2, 0, '592px'],
    ['zoomed and panned down: the same as at the top', 320, 2, 300, '592px'],
    ['a soft keyboard at scale 1: what shows above it (320), as before', 320, 1, 0, '272px'],
  ] as const)('%s', async (_name, height, scale, offsetTop, max) => {
    setViewport(640);
    const had = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height, scale, offsetTop, width: 390, addEventListener: () => undefined, removeEventListener: () => undefined },
    });
    const hadClient = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight');
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 640 });
    const tray = document.createElement('div');
    try {
      render(<Toaster />);
      tray.dataset.hubTray = '';
      tray.style.setProperty('--tray-r1', '100px');
      tray.style.setProperty('--tray-r3', '188px');
      document.body.append(tray);
      keys.push(showToast({ title: 'Saved', tone: 'info' }));
      await pass(100);
      expect(tray.style.getPropertyValue('--tray-max')).toBe(max);
    } finally {
      // A failed row must not leave its tray for the next row to find.
      tray.remove();
      if (had) Object.defineProperty(window, 'visualViewport', had);
      else delete (window as { visualViewport?: unknown }).visualViewport;
      if (hadClient) Object.defineProperty(document.documentElement, 'clientHeight', hadClient);
      else delete (document.documentElement as { clientHeight?: unknown }).clientHeight;
    }
  });

  it('a tray whose reserves cannot be read (no @property): toasts queue, timers pause, and no --tray-max is written', async () => {
    setViewport(768);
    render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      document.body.append(tray);
      keys.push(showToast({ title: 'Saved', tone: 'info' }, 4000));
      await pass(100);
      expect(region()?.dataset.tray, 'unknown reserves: queued, never a band sized against zero').toBe('queued');
      expect(tray.style.getPropertyValue('--tray-max'), 'the tray keeps its own CSS floor').toBe('');
      await pass(10_000);
      expect(shown(), 'paused while queued').toBe(1);
      // One reserve readable, the other not: still unknown.
      tray.style.setProperty('--tray-r1', '100px');
      await pass(100);
      expect(region()?.dataset.tray, 'one unknown reserve still queues').toBe('queued');
      expect(tray.style.getPropertyValue('--tray-max')).toBe('');
      // The reverse: only r3 readable. A guard needing just one readable reserve would size a band against r3 here.
      tray.style.removeProperty('--tray-r1');
      tray.style.setProperty('--tray-r3', '188px');
      await pass(100);
      expect(region()?.dataset.tray, 'only r3 readable still queues').toBe('queued');
      expect(tray.style.getPropertyValue('--tray-max'), 'and writes no --tray-max').toBe('');
    } finally {
      tray.remove();
    }
  });

  it('a sticky toast stays through the queue and after it', async () => {
    render(<Toaster />);
    const tray = document.createElement('div');
    try {
      tray.dataset.hubTray = '';
      document.body.append(tray);
      keys.push(showToast({ title: 'Restart may have gone through', tone: 'unknown' }));
      await pass(100);
      expect(region()?.dataset.tray).toBe('queued');
      await pass(20_000);
      tray.remove();
      await pass(10_000);
      expect(shown()).toBe(1);
    } finally {
      tray.remove();
    }
  });
});
