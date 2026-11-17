// appStart.ts + OldFile.tsx: a Hub opened from a saved session reads the Hoody's floor once, before the Hub loads.
// Below the floor: the Verdict alone, the Hub never loaded, the session kept, nothing purged or sent. No floor, no
// answer: the Hub loads as before.
import { cleanup, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HubConfigRead } from '@core/origin';
import { startApp } from './appStart';
import { HUB_FILE_BUILD } from './build';
import { mountOldFile } from './OldFile';

const API = { origin: 'https://api.hoody.test', realmApiDomain: '', proxyDomain: '' };
const ok = (fileMin: number | null): HubConfigRead => ({ ok: true, realmApiDomain: '', proxyDomain: '', fileMin });

describe('startApp', () => {
  const run = (read: () => Promise<HubConfigRead>) => {
    const order: string[] = [];
    const showOld = vi.fn(() => { order.push('old'); });
    const loadHub = vi.fn(() => { order.push('hub'); return Promise.resolve(); });
    const done = startApp(API, { read: vi.fn(() => { order.push('read'); return read(); }), loadHub, showOld });
    return { order, showOld, loadHub, done };
  };

  it('loads nothing of the Hub until the floor answers: no session use, no signed-in request before it', async () => {
    let answer!: (v: HubConfigRead) => void;
    const { order, loadHub, done } = run(() => new Promise((res) => { answer = res; }));
    await act(async () => { await Promise.resolve(); });
    expect(order).toEqual(['read']);
    expect(loadHub).not.toHaveBeenCalled();
    answer(ok(HUB_FILE_BUILD));
    expect(await done).toBe('hub');
    expect(order).toEqual(['read', 'hub']);
  });

  it('above this build: the old-file screen once, and the Hub is never loaded', async () => {
    const { order, showOld, loadHub, done } = run(() => Promise.resolve(ok(HUB_FILE_BUILD + 1)));
    expect(await done).toBe('old');
    expect(showOld).toHaveBeenCalledTimes(1);
    expect(showOld).toHaveBeenCalledWith(HUB_FILE_BUILD + 1);
    expect(loadHub).not.toHaveBeenCalled();
    expect(order).toEqual(['read', 'old']);
  });

  it.each([
    ['this build accepted', () => Promise.resolve(ok(HUB_FILE_BUILD))],
    ['no floor named', () => Promise.resolve(ok(null))],
    ['no answer (network, timeout)', () => Promise.resolve({ ok: false, why: 'network' } as HubConfigRead)],
    ['the read threw', () => Promise.reject(new Error('x'))],
  ])('%s: the Hub loads as before', async (_n, read) => {
    const { showOld, loadHub, done } = run(read);
    expect(await done).toBe('hub');
    expect(loadHub).toHaveBeenCalledTimes(1);
    expect(showOld).not.toHaveBeenCalled();
  });

  it('reads only the chosen Hoody', async () => {
    const read = vi.fn(() => Promise.resolve(ok(null)));
    await startApp(API, { read, loadHub: () => Promise.resolve(), showOld: () => {} });
    expect(read).toHaveBeenCalledWith('https://api.hoody.test');
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('mountOldFile', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = ''; localStorage.clear(); });

  it('hides the Hub (inert), shows the out-of-date card with the download on the session\'s Hoody, keeps the session and sends nothing', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.textContent = 'hub';
    document.body.append(root);
    localStorage.setItem('access_token', 'kept');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await act(async () => { mountOldFile(HUB_FILE_BUILD + 4, 'https://api.hoody.test'); });
    expect(root.hidden).toBe(true);
    expect(root.inert).toBe(true);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This Hub is out of date');
    expect(document.body.textContent).toContain(`Build ${HUB_FILE_BUILD + 4} or later`);
    expect(screen.getByRole('link', { name: /^Download the current Hub$/ })).toHaveAttribute('href', 'https://api.hoody.test/auth/hoody-hub.html');
    expect(screen.getByText(/still signed in/)).toBeInTheDocument();
    expect(localStorage.getItem('access_token')).toBe('kept');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
