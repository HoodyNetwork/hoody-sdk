// Vitest: a path's menu offers Open, Show in Files and Open a terminal here only after the
// path is checked on the conversation's computer (core fileStat, read once the menu opens); a folder opens in Files, a file in
// Files' Preview, and the terminal is Files' own Open terminal here. A `~/` path is written against that computer's agent
// home folder (core agentHome), never the browser's. With no computer, another realm, a home it can't tell, or a check that
// can't answer (404, 403, a failure), only Copy path shows, with one line saying why.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import { LinkHost, type HostComputer, type LinkHostValue } from './linkHost';
import strings from './LinkMark.strings.en.json';
import { Prose } from './Reply';

interface Q { isPending: boolean; isError: boolean; data: unknown; error: unknown }
const core = vi.hoisted(() => ({ stat: vi.fn(), home: vi.fn(), realm: 'global' }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return {
    ...real,
    useCore: () => ({ ...real.useCore(), realm: core.realm }),
    fileStat: { ...real.fileStat, use: (...a: unknown[]) => core.stat(...a) },
    agentHome: { ...real.agentHome, use: (...a: unknown[]) => core.home(...a) },
  };
});

const P = 'a'.repeat(24);
const C = 'b'.repeat(23) + 'f';
const atlas: HostComputer = { id: C, project: P, name: 'atlas', server: 'sg1' };
const T = { project: { id: P }, container: { id: C, server_name: 'sg1' } };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const ok = (data: unknown): Q => ({ isPending: false, isError: false, data, error: null });
const pending: Q = { isPending: true, isError: false, data: undefined, error: null };
const failed = (status?: number): Q => ({ isPending: false, isError: true, data: undefined, error: status ? { status } : new Error('x') });

// The realm's whole list, holding atlas alone: the one case a handle can name atlas for sure.
const WHOLE = { rows: [{ id: C, name: 'atlas' }], complete: true, failed: false };
let opened: string[] = [];
let unmount: (() => void) | null = null;
const draw = (text: string, more: Partial<LinkHostValue> = {}) => {
  const host: LinkHostValue = { realm: 'global', lives: atlas, runs: atlas, computers: WHOLE, want: () => undefined, openHub: (p) => void opened.push(p), ...more } as LinkHostValue;
  const r = render(<LinkHost value={host}><Prose text={text} marks /></LinkHost>);
  unmount = r.unmount;
};
const openMenu = async (target: string) => {
  await userEvent.click(screen.getByRole('button', { name: target }));
  return screen.findByRole('menu');
};
// Each item's own label (its slot), not the line under it.
const names = (m: HTMLElement) => within(m).getAllByRole('menuitem').map((i) => i.querySelector('[slot="label"]')?.textContent?.replace(/…$/, ''));
const handle = `atlas.${C.slice(-4)}`;

beforeEach(() => {
  opened = [];
  core.realm = 'global';
  core.stat.mockReturnValue(pending);
  core.home.mockReturnValue(pending);
});
afterEach(() => {
  unmount?.();
  unmount = null;
  core.stat.mockReset();
  core.home.mockReset();
});

describe("a path's menu on the conversation's computer", () => {
  it('reads nothing until the menu opens, then stats the path there (an absolute path never reads the home)', async () => {
    draw('See /srv/app/server.js:12 now.');
    expect(core.stat.mock.calls.every((c) => (c[1] as { enabled: boolean }).enabled === false)).toBe(true);
    const m = await openMenu('/srv/app/server.js:12');
    expect(core.stat).toHaveBeenLastCalledWith({ target: T, path: '/srv/app/server.js' }, { enabled: true });
    expect(core.home.mock.calls.every((c) => (c[1] as { enabled: boolean }).enabled === false)).toBe(true);
    // While it checks: Copy path only, with the line that says so.
    expect(names(m)).toEqual(['Copy path']);
    expect(m).toHaveTextContent(fill(strings['path.checking'], { name: 'atlas' }));
  });

  it('a folder: Open in Files, Show in Files (parent, selected), a terminal there, then Copy path', async () => {
    core.stat.mockReturnValue(ok('folder'));
    draw('Look in /srv/app please.');
    const m = await openMenu('/srv/app');
    expect(names(m)).toEqual([strings['path.open'], strings['path.show'], strings['path.terminal'], strings['path.copy']]);
    await userEvent.click(within(m).getByRole('menuitem', { name: strings['path.open'] }));
    await userEvent.click(within(await openMenu('/srv/app')).getByRole('menuitem', { name: strings['path.show'] }));
    await userEvent.click(within(await openMenu('/srv/app')).getByRole('menuitem', { name: new RegExp('^' + strings['path.terminal']) }));
    expect(opened).toEqual([
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv%2Fapp`,
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv&select=app`,
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv%2Fapp&open=here`,
    ]);
  });

  it("a file: Open is Files' Preview of it, the terminal opens in its folder; Copy keeps :line", async () => {
    core.stat.mockReturnValue(ok('file'));
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    draw('Edit /srv/app/server.js:12 next.');
    await userEvent.click(within(await openMenu('/srv/app/server.js:12')).getByRole('menuitem', { name: strings['path.open'] }));
    await userEvent.click(within(await openMenu('/srv/app/server.js:12')).getByRole('menuitem', { name: strings['path.show'] }));
    await userEvent.click(within(await openMenu('/srv/app/server.js:12')).getByRole('menuitem', { name: new RegExp('^' + strings['path.terminal']) }));
    expect(opened).toEqual([
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv%2Fapp&select=server.js&open=preview`,
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv%2Fapp&select=server.js`,
      `/files?computer=${handle}&cid=${C}&path=%2Fsrv%2Fapp&open=here`,
    ]);
    await userEvent.click(within(await openMenu('/srv/app/server.js:12')).getByRole('menuitem', { name: strings['path.copy'] }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/srv/app/server.js:12'));
    vi.unstubAllGlobals();
  });

  it('a check that cannot answer leaves Copy path only, saying why: no such path, refused, failed, not a file or folder', async () => {
    for (const [answer, key] of [[failed(404), 'missing'], [failed(403), 'refused'], [failed(500), 'failed'], [failed(), 'failed'], [ok('other'), 'other']] as const) {
      core.stat.mockReturnValue(answer);
      draw('See /srv/app/x.sock here.');
      const m = await openMenu('/srv/app/x.sock');
      expect(names(m)).toEqual(['Copy path']);
      expect(m).toHaveTextContent(fill(strings[`path.why.${key}`], { name: 'atlas' }));
      unmount?.();
      unmount = null;
    }
    expect(opened).toEqual([]);
  });
});

describe('a ~/ path', () => {
  it("is written against the computer's agent home, read in the chat's realm", async () => {
    core.home.mockReturnValue(ok('/home/ada'));
    core.stat.mockReturnValue(ok('file'));
    draw('See ~/.config/app.toml today.');
    const m = await openMenu('~/.config/app.toml');
    expect(core.home).toHaveBeenLastCalledWith({ target: T, realm: 'global' }, { enabled: true });
    expect(core.stat).toHaveBeenLastCalledWith({ target: T, path: '/home/ada/.config/app.toml' }, { enabled: true });
    await userEvent.click(within(m).getByRole('menuitem', { name: strings['path.open'] }));
    expect(opened).toEqual([`/files?computer=${handle}&cid=${C}&path=%2Fhome%2Fada%2F.config&select=app.toml&open=preview`]);
  });

  it("a home it can't tell (failed, or none named) leaves Copy path only, and stats nothing", async () => {
    for (const answer of [failed(500), ok(null)]) {
      core.home.mockReturnValue(answer);
      core.stat.mockClear();
      draw('See ~/.bashrc today.');
      const m = await openMenu('~/.bashrc');
      expect(names(m)).toEqual(['Copy path']);
      expect(m).toHaveTextContent(strings['path.why.home']);
      expect(core.stat.mock.calls.every((c) => (c[1] as { enabled: boolean }).enabled === false)).toBe(true);
      unmount?.();
      unmount = null;
    }
  });
});

describe('a check belongs to one opening of the menu', () => {
  it('an answer from an earlier opening is never shown: reopened, the menu checks again before offering anything', async () => {
    core.stat.mockReturnValue(ok('folder'));
    draw('Look in /srv/app please.');
    let m = await openMenu('/srv/app');
    expect(names(m)).toEqual([strings['path.open'], strings['path.show'], strings['path.terminal'], strings['path.copy']]);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The path is gone now; the new check has not answered yet.
    core.stat.mockReturnValue(pending);
    m = await openMenu('/srv/app');
    expect(names(m)).toEqual(['Copy path']);
    expect(m).toHaveTextContent(fill(strings['path.checking'], { name: 'atlas' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    core.stat.mockReturnValue(failed(404));
    m = await openMenu('/srv/app');
    await waitFor(() => expect(within(m).getByRole('menuitem')).toHaveTextContent(fill(strings['path.why.missing'], { name: 'atlas' })));
    expect(names(m)).toEqual(['Copy path']);
  });
});

describe("the chat's list of computers is a hint", () => {
  it('a list not read yet, read in part, or showing a twin with the same handle still offers Files: the link names the exact computer and Files proves it when it opens', async () => {
    const twin = { rows: [{ id: C, name: 'atlas' }, { id: 'c'.repeat(20) + C.slice(-4), name: 'atlas' }], complete: true, failed: false };
    for (const computers of [null, { rows: [{ id: C, name: 'atlas' }], complete: false, failed: false }, twin]) {
      core.stat.mockReturnValue(ok('folder'));
      draw('Look in /srv/app please.', { computers });
      const m = await openMenu('/srv/app');
      expect(names(m)).toEqual([strings['path.open'], strings['path.show'], strings['path.terminal'], strings['path.copy']]);
      unmount?.();
      unmount = null;
    }
  });
});

describe('without a computer to check on', () => {
  it('no computer, one with no known server, or a chat in another realm: Copy path only, saying why, nothing read', async () => {
    const cases: [Partial<LinkHostValue>, string, string][] = [
      [{ runs: null }, 'noComputer', 'global'],
      [{ runs: { id: C, project: P, name: 'atlas' } }, 'noComputer', 'global'],
      [{ realm: 'd'.repeat(24) }, 'otherRealm', 'global'],
    ];
    for (const [more, key, realm] of cases) {
      core.realm = realm;
      core.stat.mockClear();
      core.home.mockClear();
      draw('See /srv/app now.', more);
      const m = await openMenu('/srv/app');
      expect(names(m)).toEqual(['Copy path']);
      expect(m).toHaveTextContent(fill(strings[`path.why.${key}` as 'path.why.home'], { name: 'atlas' }));
      expect([...core.stat.mock.calls, ...core.home.mock.calls].every((c) => (c[1] as { enabled: boolean }).enabled === false)).toBe(true);
      unmount?.();
      unmount = null;
    }
  });
});
