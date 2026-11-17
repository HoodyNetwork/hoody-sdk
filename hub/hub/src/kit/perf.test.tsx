// Performance mode: the per-browser switch (kit/perf.ts), and fouc.js applying it before the first paint
// with ?perf=1 / ?perf=0 taken from any Hub address. fouc.js is run as the browser runs it: the classic script.
import { createHash } from 'node:crypto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import foucSource from '../../../public/auth/fouc.js?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from './states/Toast';
import { motionOff, PERF_KEY, perfOn, setPerf, usePerf } from './perf';
import strings from './perf.strings.en.json';

const root = document.documentElement;
const realStorage = window.localStorage;

/** A browser that refuses its storage (private mode, blocked site data): every call throws. */
function refuseStorage(): void {
  const no = () => {
    throw new Error('denied');
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: no, setItem: no, removeItem: no, clear: no } });
}

function fouc(url: string): void {
  history.replaceState(null, '', url);
  new Function(foucSource as string)();
}

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute('data-hx-perf');
  history.replaceState(null, '', '/');
});
afterEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: realStorage });
  vi.restoreAllMocks();
});

describe('fouc.js: Performance mode before the first paint', () => {
  it('?perf=1 stores the choice, sets the attribute and leaves the address, keeping path, other params and hash', () => {
    fouc('/auth/hub/?view=keys&perf=1&lang=en#/keys/shared');
    expect(localStorage.getItem(PERF_KEY)).toBe('1');
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    expect(location.pathname + location.search + location.hash).toBe('/auth/hub/?view=keys&lang=en#/keys/shared');
  });

  it('?perf=0 clears it and removes the attribute, then leaves the address', () => {
    localStorage.setItem(PERF_KEY, '1');
    fouc('/auth/hub/?perf=0#/home');
    expect(localStorage.getItem(PERF_KEY)).toBeNull();
    expect(root.hasAttribute('data-hx-perf')).toBe(false);
    expect(location.pathname + location.search + location.hash).toBe('/auth/hub/#/home');
  });

  it('with no param the stored choice applies; any other value is ignored and stays in the address', () => {
    localStorage.setItem(PERF_KEY, '1');
    fouc('/auth/hub/?perf=yes');
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    expect(localStorage.getItem(PERF_KEY)).toBe('1');
    expect(location.search).toBe('?perf=yes');
    root.removeAttribute('data-hx-perf');
    localStorage.clear();
    fouc('/auth/hub/?perf=true');
    expect(root.hasAttribute('data-hx-perf')).toBe(false);
    expect(localStorage.getItem(PERF_KEY)).toBeNull();
  });

  it('storage that refuses still follows ?perf=1 in this tab and leaves the address', () => {
    refuseStorage();
    fouc('/auth/login?perf=1');
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    expect(location.search).toBe('');
  });

  it('leaving the address keeps every other pair exactly as typed (shared.js reads the raw query, never decoded)', () => {
    fouc('/hoody-hub.html?perf=1&hoody=localhost:8080&q=a%20b+c&x=%3A#/keys');
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    expect(location.search).toBe('?hoody=localhost:8080&q=a%20b+c&x=%3A');
    expect(location.hash).toBe('#/keys');
    // Every perf pair goes (a second one, one with no value); empty pairs and order stay as typed.
    fouc('/auth/hub/?a=1&perf=0&&perf&b#/home');
    expect(location.pathname + location.search + location.hash).toBe('/auth/hub/?a=1&&b#/home');
  });

  it('nothing else in fouc.js changed: without the perf lines it is unchanged', () => {
    const rest = (foucSource as string).replace(/\n {2}\/\/ Performance mode \([^)\n]*hub\/src\/kit\/perf\.ts\)[\s\S]*?data-hx-perf', 'on'\);\n/, '');
    expect(rest).not.toBe(foucSource);
    // A missing or invalid hub_theme_v1 follows the device's scheme.
    // One comment line lost its ticket reference; no code changed.
    // The language list's comment lost its second line (a path in another repository); no code changed.
    expect(createHash('sha256').update(rest).digest('hex')).toBe('b708158044262780f3bb5e82fe8b62fba9c73767da878dd818f80eb480d46d2f');
  });
});

describe('kit/perf: the switch', () => {
  it('setPerf sets the attribute and remembers it in this browser; off removes both', () => {
    expect(setPerf(true)).toBe(true);
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    expect(localStorage.getItem(PERF_KEY)).toBe('1');
    expect(perfOn()).toBe(true);
    expect(setPerf(false)).toBe(true);
    expect(root.hasAttribute('data-hx-perf')).toBe(false);
    expect(localStorage.getItem(PERF_KEY)).toBeNull();
  });

  it('storage that refuses: the tab still follows, and setPerf says it was not kept', () => {
    refuseStorage();
    expect(setPerf(true)).toBe(false);
    expect(perfOn()).toBe(true);
  });

  it('motionOff: on under Performance mode, or under the system reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
    expect(motionOff()).toBe(false);
    setPerf(true);
    expect(motionOff()).toBe(true);
    setPerf(false);
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: true }) as MediaQueryList);
    expect(motionOff()).toBe(true);
  });

  it('another tab turning it on: this tab follows', () => {
    function Probe() {
      return <span>{usePerf().on ? 'on' : 'off'}</span>;
    }
    render(<Probe />);
    expect(screen.getByText('off')).toBeInTheDocument();
    localStorage.setItem(PERF_KEY, '1');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PERF_KEY, newValue: '1' }));
    });
    expect(screen.getByText('on')).toBeInTheDocument();
    expect(root.getAttribute('data-hx-perf')).toBe('on');
  });

  it('each change says so in a toast with Undo; one the browser cannot keep says it lasts until reload', async () => {
    function Toggle() {
      const p = usePerf();
      return (
        <button type="button" onClick={() => p.set(!p.on)}>
          toggle
        </button>
      );
    }
    render(
      <>
        <Toggle />
        <Toaster />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(await screen.findByText(strings['perf.on'])).toBeInTheDocument();
    // Undo turns it back, and says so.
    await userEvent.click(screen.getAllByRole('button', { name: strings['perf.undo'] })[0]!);
    expect(root.hasAttribute('data-hx-perf')).toBe(false);
    expect(await screen.findByText(strings['perf.off'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(root.getAttribute('data-hx-perf')).toBe('on');
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(await screen.findByText(strings['perf.off'])).toBeInTheDocument();
    refuseStorage();
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(await screen.findByText(strings['perf.notKept'])).toBeInTheDocument();
  });
});
