// Vitest: a local address in a reply (`localhost:3000`) is read on the computer the
// chat runs on. Its mark names that computer and port, its tooltip what was written; it opens only through the check of that
// computer's listeners (one read, when Open is pressed), which offers the real port's address (the written path and query kept)
// for a web listener only, says so when the program listens only inside, with Ask the agent to fix it into the chat's draft, and
// says what else it found. Without a computer the chat runs on, or one not proven yours, the address stays as written, Copy only.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import { classifyRuntime, computerRuntime, readLink, type RuntimeInfo } from '@core';
import { setProxyDomain } from '../../core/hosts';
import { LinkHost, markOf, type HostComputer, type HostComputers, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';

interface Rt { isPending: boolean; isError: boolean; isFetching: boolean; data: RuntimeInfo | undefined }
// rt: the card's query hook (its cached answer); fresh: core refreshFresh, the card's own read when it opens.
const core = vi.hoisted(() => ({ rt: vi.fn(), fresh: vi.fn() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, refreshFresh: (...a: unknown[]) => core.fresh(...a), computerRuntime: { ...real.computerRuntime, use: (...a: unknown[]) => core.rt(...a) } };
});

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);
const env = () => ({ proxy: PROXY, origin: 'https://hub.hoody.test' });
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const list = (status: string, more: Partial<HostComputers> = {}): HostComputers => ({ rows: [{ id: C, project_id: P, name: 'atlas', status, server_name: 'sg1' }], complete: true, failed: false, ...more });
const hostOf = (computers: HostComputers | null, more: Partial<LinkHostValue> = {}): LinkHostValue => ({ realm: 'global', lives: atlas, runs: atlas, computers, openHub: () => undefined, ...more });
const port = (n: number) => `https://${P}-${C}-http-${n}.sg1.${PROXY}`;
const info = (kind: 'web' | 'local' | 'other' | null, n = 3000, system: number[] = []): RuntimeInfo => ({ yours: kind ? [{ port: n, program: 'node', kind }] : [], system, terminals: 0, displays: 0 });
const answer = (data: RuntimeInfo | undefined, more: Partial<Rt> = {}): Rt => ({ isPending: data === undefined, isError: false, isFetching: false, data, ...more });

let unmount: (() => void) | null = null;
const mount = (ui: ReactElement): HTMLElement => {
  const root = document.body.appendChild(document.createElement('div'));
  const r = render(ui, { baseElement: root });
  unmount = () => { r.unmount(); root.remove(); };
  return root;
};
const draw = (text: string, host: LinkHostValue) => mount(<LinkHost value={host}><Prose text={text} marks /></LinkHost>);
beforeEach(() => {
  setProxyDomain(PROXY);
  core.fresh.mockResolvedValue({ state: 'fresh', answers: [] });
});
afterEach(() => {
  unmount?.();
  unmount = null;
  setProxyDomain(null);
  core.rt.mockReset();
  core.fresh.mockReset();
});

describe('markOf, a local address', () => {
  const m = (url: string, host: LinkHostValue = hostOf(list('running'))) => markOf(readLink(url, env())!, host);
  it('reads as the port on the computer the chat runs on, with the written path, query and fragment kept for Open', () => {
    const mk = m('http://localhost:3000/app/orders?tab=open#top');
    expect(mk).toMatchObject({ kind: 'local', name: 'atlas', what: { k: 'port', n: '3000' }, written: 'localhost:3000/app/orders?tab=open#top' });
    expect(mk?.open).toEqual({ k: 'local', computer: C, project: P, port: 3000, href: `${port(3000)}/app/orders?tab=open#top`, board: expect.objectContaining({ family: 'port', name: 'http', n: '3000', path: '/app/orders' }) });
    // Its Copy is what the agent wrote.
    expect(mk?.copy).toBe('http://localhost:3000/app/orders?tab=open#top');
  });
  it('127.0.0.1, 0.0.0.0 and [::1] are local too; no port is the scheme\'s own', () => {
    expect(m('http://127.0.0.1:8080/')?.open).toMatchObject({ k: 'local', port: 8080 });
    expect(m('http://0.0.0.0:5173')?.open).toMatchObject({ k: 'local', port: 5173 });
    expect(m('http://[::1]:4000')?.open).toMatchObject({ k: 'local', port: 4000 });
    expect(m('http://localhost/')?.open).toMatchObject({ k: 'local', port: 80 });
  });
  it('an https local address opens on its https port and is never put on a Board', () => {
    const open = m('https://localhost:8443/x')?.open;
    expect(open).toMatchObject({ k: 'local', port: 8443, board: null });
    expect(open && 'href' in open && open.href).toBe(`https://${P}-${C}-https-8443.sg1.${PROXY}/x`);
  });
  it('without a computer the chat runs on: as written, Copy only, no list wanted', () => {
    expect(m('http://localhost:3000', hostOf(list('running'), { runs: null }))).toMatchObject({ kind: 'local', what: { k: 'written' }, written: 'localhost:3000', open: null, owner: null });
  });
  it('a computer the list does not prove yours, or no list: as written, Copy only; a failed list adds Try again', () => {
    const other: HostComputer = { id: OTHER, project: P, name: 'zed' };
    // Not in a list that is not whole: unknown, so not proven (missing from a whole list it is gone, below).
    expect(m('http://localhost:3000', hostOf(list('running', { complete: false }), { runs: other }))).toMatchObject({ what: { k: 'written' }, open: null, retry: false });
    // Listed under another project: not proven.
    expect(m('http://localhost:3000', hostOf(list('running'), { runs: { id: C, project: OTHER, name: 'atlas' } }))).toMatchObject({ what: { k: 'written' }, open: null });
    expect(m('http://localhost:3000', hostOf(null))).toMatchObject({ what: { k: 'written' }, open: null });
    expect(m('http://localhost:3000', hostOf(list('running', { failed: true })))).toMatchObject({ what: { k: 'written' }, open: null, retry: true });
    expect(m('http://localhost:3000', hostOf({ rows: null, complete: false, failed: false }))).toMatchObject({ what: { k: 'written' }, open: null, owner: { k: 'reading' } });
  });
  it('a computer that is off or gone keeps the label with its state and opens nothing', () => {
    expect(m('http://localhost:3000', hostOf(list('stopped')))).toMatchObject({ what: { k: 'port' }, owner: { k: 'own', state: 'stopped' }, open: null });
    expect(m('http://localhost:3000', hostOf({ rows: [], complete: true, failed: false }))).toMatchObject({ owner: { k: 'gone' }, open: null });
    expect(m('http://localhost:3000', hostOf(list('running'), { runs: { id: OTHER, project: P, name: 'zed' } }))).toMatchObject({ owner: { k: 'gone', name: 'zed' }, open: null });
  });
  it('a list that is not whole proves nothing, even with the computer\'s row in it: as written, no Open', () => {
    expect(m('http://localhost:3000', hostOf(list('running', { complete: false })))).toMatchObject({ what: { k: 'written' }, open: null, owner: null });
  });
  it('the address comes from the list row\'s node only, never the chat\'s own binding', () => {
    const rows = [{ id: C, project_id: P, name: 'atlas', status: 'running' }];
    expect(m('http://localhost:3000', hostOf({ rows, complete: true, failed: false }, { runs: { ...atlas, server: 'old1' } }))).toMatchObject({ what: { k: 'port' }, open: null });
  });
  it('no address for the computer yet (no routing node): the label, no Open', () => {
    expect(m('http://localhost:3000', hostOf({ rows: [{ id: C, project_id: P, name: 'atlas', status: 'running' }], complete: true, failed: false }))).toMatchObject({ what: { k: 'port' }, open: null });
  });
  it('the hard blocks still come first: an acting name or credentials get no mark', () => {
    expect(m('http://localhost:7681/?cmd=ls')).toBeNull();
    expect(m('http://localhost:3000/?iframe_url=https://evil.example')).toBeNull();
    expect(m('http://user:pw@localhost:3000/')).toBeNull();
  });
});

describe('a local address in a reply', async () => {
  // Open, then the card's own read answers (the mocked refreshFresh resolves at once unless a test holds it).
  const open = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
  it('names the computer and port; its Open names what was written; nothing is read before Open', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    const root = draw('It runs at http://localhost:3000/app.', hostOf(list('running')));
    expect(within(root).getByText('atlas · port 3000')).toBeTruthy();
    expect(within(root).getByRole('button', { name: 'Open atlas · port 3000 (written as localhost:3000/app)' })).toBeTruthy();
    expect(root.textContent).not.toContain('localhost:3000/app.');
    expect(core.rt).not.toHaveBeenCalled();
    expect(core.fresh).not.toHaveBeenCalled();
  });
  it('a web listener: the card offers the real address, path kept, and Put on Board where the host has one', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    const openHub = vi.fn();
    const boardAdd = vi.fn(() => '/board?add=port-3000');
    draw('See http://localhost:3000/app', hostOf(list('running'), { openHub, boardAdd }));
    await open(/^Open atlas · port 3000/);
    expect(core.rt).toHaveBeenCalledWith(C);
    expect(screen.getByText('Port 3000 on atlas has a web address.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open atlas · port 3000' });
    expect(link.getAttribute('href')).toBe(`${port(3000)}/app`);
    expect(link.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Put on Board' }));
    expect(boardAdd).toHaveBeenCalledWith(expect.objectContaining({ n: '3000', path: '/app' }));
    expect(openHub).toHaveBeenCalledWith('/board?add=port-3000');
  });
  it('listening only inside: says so, no address; Ask the agent to fix it goes to the draft, never sent', async () => {
    core.rt.mockReturnValue(answer(info('local')));
    const ask = vi.fn();
    draw('See http://localhost:3000', hostOf(list('running'), { ask }));
    await open(/^Open atlas · port 3000/);
    expect(screen.getByText('The program on port 3000 listens only inside atlas, so it can\'t be opened from here.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open atlas/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent to fix it' }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toContain('port 3000');
    expect(ask.mock.calls[0]![0]).toContain('0.0.0.0');
  });
  it('listening only inside, on a host without a draft: no Ask, still Check again', async () => {
    core.rt.mockReturnValue(answer(info('local')));
    draw('See http://localhost:3000', hostOf(list('running')));
    await open(/^Open atlas · port 3000/);
    expect(screen.queryByRole('button', { name: 'Ask the agent to fix it' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });
  it('nothing there, not a web port, one of Hoody\'s own: says which, no address', async () => {
    const say = async (data: RuntimeInfo, words: string) => {
      core.rt.mockReturnValue(answer(data));
      draw('See http://localhost:3000', hostOf(list('running')));
      await open(/^Open atlas · port 3000/);
      expect(screen.getByText(words)).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Open atlas/ })).toBeNull();
      unmount?.();
      unmount = null;
    };
    await say(info(null), 'Nothing listens on port 3000 on atlas right now.');
    await say(info('other'), "Port 3000 on atlas isn't a web port.");
    await say(info(null, 3000, [3000]), "Port 3000 on atlas is one of Hoody's own.");
  });
  it('the person\'s own program named agent (a home path) on the port: a web address, not one of Hoody\'s own', async () => {
    core.rt.mockReturnValue(answer(classifyRuntime({ network_services: [{ port: 3000, program: 'agent', protocol: 'tcp', ip: '0.0.0.0', path: '/home/me/bin/agent' }] })));
    draw('See http://localhost:3000', hostOf(list('running')));
    await open(/^Open atlas · port 3000/);
    expect(screen.getByText('Port 3000 on atlas has a web address.')).toBeTruthy();
    expect(screen.queryByText("Port 3000 on atlas is one of Hoody's own.")).toBeNull();
  });
  it('checking until the card\'s own read answers, then a failed read with Try again (a read again, nothing opened)', async () => {
    let answerRead: (v: unknown) => void = () => undefined;
    core.fresh.mockReturnValue(new Promise((r) => { answerRead = r; }));
    core.rt.mockReturnValue(answer(info('web')));
    draw('See http://localhost:3000', hostOf(list('running')));
    await open(/^Open atlas · port 3000/);
    // A cached answer (another page's, or an earlier card's) is not this card's read: nothing offered yet.
    expect(screen.getByRole('status').textContent).toBe('Checking port 3000 on atlas…');
    expect(screen.queryByRole('link', { name: /Open atlas/ })).toBeNull();
    expect(core.fresh).toHaveBeenCalledTimes(1);
    // The read is the card's own: a request sent now, joining no read already out.
    expect(core.fresh.mock.calls[0]![1]).toEqual({ own: true });
    await act(async () => { answerRead({ state: 'failed', answers: [] }); });
    expect(screen.getByText("Couldn't read the ports on atlas.")).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Open atlas/ })).toBeNull();
    // Try again: a second own read, which answers.
    core.fresh.mockResolvedValue({ state: 'fresh', answers: [] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(core.fresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Open atlas · port 3000' })).toBeTruthy();
  });
  it('a chat with no computer it runs on: the address as written with its note, Copy only, no read', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    const want = vi.fn();
    const root = draw('See http://localhost:3000', hostOf(list('running'), { runs: null, want }));
    expect(within(root).getByText('localhost:3000, on the computer the agent runs on')).toBeTruthy();
    expect(within(root).queryByRole('button', { name: /^Open/ })).toBeNull();
    expect(within(root).getByRole('button', { name: /More for localhost:3000/ })).toBeTruthy();
    expect(want).not.toHaveBeenCalled();
    expect(core.rt).not.toHaveBeenCalled();
    expect(core.fresh).not.toHaveBeenCalled();
  });
  it('reads nothing for a computer not proven yours or another computer: no local Open, every button pressed', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    const tab = vi.spyOn(window, 'open').mockReturnValue(null);
    const zed: HostComputer = { id: OTHER, project: P, name: 'zed' };
    const hosts: LinkHostValue[] = [
      hostOf(list('running'), { runs: zed }),
      hostOf(list('running', { failed: true })),
      hostOf({ rows: null, complete: false, failed: false }),
      hostOf(null),
      hostOf(list('stopped')),
      hostOf({ rows: [], complete: true, failed: false }),
      hostOf(list('running'), { runs: { id: C, project: OTHER, name: 'atlas' } }),
    ];
    for (const h of hosts) {
      const root = draw(`See http://localhost:3000 and ${`https://${P}-${OTHER}-http-3000.sg1.${PROXY}`}`, h);
      expect(within(root).queryByRole('button', { name: /^Open atlas · port 3000/ })).toBeNull();
      for (const b of within(root).queryAllByRole('button')) fireEvent.click(b);
      unmount?.();
      unmount = null;
    }
    expect(core.rt).not.toHaveBeenCalled();
    expect(core.fresh).not.toHaveBeenCalled();
    // The only tab any press opens is the other computer's link as the agent wrote it (the masked link, opened as written):
    // never an address the Hub built for a local one.
    for (const [href] of tab.mock.calls) expect(new URL(String(href)).href).toBe(new URL(`https://${P}-${OTHER}-http-3000.sg1.${PROXY}`).href);
    tab.mockRestore();
  });
  it('the read names the chat\'s own runs computer, never the computer a link names', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    draw('See http://localhost:3000', hostOf(list('running')));
    await open(/^Open atlas · port 3000/);
    // The mock stands for a hook, called on every render of the card: each call names the chat's own computer.
    const named = core.rt.mock.calls.map((c) => c[0]);
    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named)]).toEqual([C]);
    // The card's own read matches that computer's runtime query only.
    const match = core.fresh.mock.calls[0]![0] as (k: unknown) => boolean;
    expect(match(computerRuntime.key(C))).toBe(true);
    expect(match(computerRuntime.key(OTHER))).toBe(false);
  });
  it('a labelled local link keeps the words and gains the checked Open after them', async () => {
    core.rt.mockReturnValue(answer(info('web')));
    const root = draw('Open [the shop](http://localhost:3000/shop).', hostOf(list('running')));
    expect(within(root).getByText('the shop')).toBeTruthy();
    await open(/^Open atlas · port 3000 \(written as localhost:3000\/shop\)$/);
    expect(screen.getByRole('link', { name: 'Open atlas · port 3000' }).getAttribute('href')).toBe(`${port(3000)}/shop`);
  });
});
