// Vitest: a reply's links read against its LinkHost. The own check (the link's
// project and computer in the host's list for this realm), the labels, the non-live states, "Another computer" for not listed,
// someone else's and a failed list, one mark per target and at most 8 per reply, none while streaming and none where the
// reply's Prose does not ask for them (gate cards, file previews), inline code that is one address, and a chat host that reads
// the realm's list only once a reply shows a link on some computer, and never for another realm.
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import { readLink } from '@core';
import { setProxyDomain } from '../../core/hosts';
import { ChatLinkHost, LinkHost, markOf, ownerOf, type HostComputer, type HostComputers, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';

const core = vi.hoisted(() => ({ realm: 'global', all: vi.fn() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, useCore: () => ({ ...real.useCore(), realm: core.realm }), useComputersAll: (...a: unknown[]) => core.all(...a) };
});

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);
const on = (name: string, n: number | string = 1, c = C, p = P) => `https://${p}-${c}-${name}-${n}.sg1.${PROXY}`;
const env = () => ({ proxy: PROXY, origin: 'https://hub.hoody.test' });
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const list = (status: string, more: Partial<HostComputers> = {}): HostComputers => ({ rows: [{ id: C, project_id: P, name: 'atlas', status }], complete: true, failed: false, ...more });
const hostOf = (computers: HostComputers | null, more: Partial<LinkHostValue> = {}): LinkHostValue => ({ realm: 'global', lives: atlas, runs: atlas, computers, openHub: () => undefined, ...more });

let unmount: (() => void) | null = null;
/** Renders into a fresh element of its own and returns it: what the render drew, nothing a portal put on the page. */
const mount = (ui: ReactElement): HTMLElement => {
  const root = document.body.appendChild(document.createElement('div'));
  const r = render(ui, { baseElement: root });
  unmount = () => { r.unmount(); root.remove(); };
  return root;
};
const draw = (text: string, host: LinkHostValue | null, p: { caret?: boolean; marks?: boolean } = {}) => {
  const prose = <Prose text={text} caret={p.caret} marks={p.marks ?? true} />;
  return mount(host ? <LinkHost value={host}>{prose}</LinkHost> : prose);
};
beforeEach(() => setProxyDomain(PROXY));
afterEach(() => {
  core.realm = 'global';
  unmount?.();
  unmount = null;
  setProxyDomain(null);
  vi.restoreAllMocks();
  core.all.mockReset();
});

describe('the own check', () => {
  const read = (url: string) => readLink(url, env())!;
  it('a listed computer is own, with its state', () => {
    expect(ownerOf(read(on('terminal', 3)), hostOf(list('running')))).toEqual({ k: 'own', name: 'atlas', state: 'running' });
    expect(ownerOf(read(on('terminal', 3)), hostOf(list('paused')))).toEqual({ k: 'own', name: 'atlas', state: 'stopped' });
  });
  it('not listed, another project, no list and a failed list are never own', () => {
    expect(ownerOf(read(on('terminal', 1, OTHER)), hostOf(list('running')))).toEqual({ k: 'other' });
    expect(ownerOf(read(on('terminal', 1, C, OTHER)), hostOf(list('running')))).toEqual({ k: 'other' });
    expect(ownerOf(read(on('terminal')), hostOf(null))).toEqual({ k: 'other' });
    expect(ownerOf(read(on('terminal')), hostOf({ rows: [], complete: false, failed: true }))).toEqual({ k: 'failed' });
  });
  it("the chat's own computer gone from a whole list is gone; from a partial list it is unknown, so another computer", () => {
    expect(ownerOf(read(on('terminal')), hostOf({ rows: [], complete: true, failed: false }))).toEqual({ k: 'gone', name: 'atlas' });
    expect(ownerOf(read(on('terminal')), hostOf({ rows: [], complete: false, failed: false }))).toEqual({ k: 'other' });
  });
  it('a row that names no project, and rows kept from a failed read, prove nothing', () => {
    const bare = { rows: [{ id: C, name: 'atlas', status: 'running' }], complete: true, failed: false };
    expect(ownerOf(read(on('terminal', 1, C, OTHER)), hostOf(bare))).toEqual({ k: 'other' });
    expect(ownerOf(read(on('terminal')), hostOf(bare))).toEqual({ k: 'other' });
    expect(ownerOf(read(on('terminal')), hostOf(list('running', { complete: false, failed: true })))).toEqual({ k: 'failed' });
  });
  it('a listed computer without a name is named by its masked id, never the whole id', () => {
    const own = ownerOf(read(on('terminal')), hostOf({ rows: [{ id: C, project_id: P, status: 'running' }], complete: true, failed: false }));
    expect(own.k).toBe('own');
    expect(own.k === 'own' && own.name).not.toContain(C);
  });
  it('a list still loading reads as checking', () => {
    expect(ownerOf(read(on('terminal')), hostOf({ rows: null, complete: false, failed: false }))).toEqual({ k: 'reading' });
  });
});

describe('markOf', () => {
  const host = hostOf(list('running'));
  const m = (url: string) => markOf(readLink(url, env())!, host);
  it('programs, places, ports, scripts and kit hosts', () => {
    expect(m(on('terminal', 3))).toMatchObject({ kind: 'program', what: { k: 'program', program: 'terminal', n: '3' }, open: { k: 'tab' } });
    expect(m(`${on('files')}/home/user/checkout.ts`)).toMatchObject({ kind: 'place', what: { k: 'place', place: 'checkout.ts' } });
    expect(m(`${on('http', 3000)}/orders?x=1`)).toMatchObject({ kind: 'port', what: { k: 'port', n: '3000' }, open: { k: 'tab', href: `${on('http', 3000)}/orders?x=1` } });
    expect(m(on('https', 8443))).toMatchObject({ kind: 'port', open: null, board: null });
    expect(m(`${on('exec', 1)}/orders/list`)).toMatchObject({ kind: 'script', what: { k: 'path', path: '/orders/list' }, open: { k: 'hub', path: '/scripts' }, runTab: `${on('exec', 1)}/orders/list` });
    expect(m(on('cron', 1))).toMatchObject({ kind: 'kit', open: { k: 'hub', path: '/schedules' } });
    expect(m(on('ssh', 1))).toMatchObject({ kind: 'kit', open: null });
  });
  it('a Board target only for a running computer of yours, never for a script, a kit host or another computer', () => {
    expect(m(on('terminal', 3))?.board).toMatchObject({ family: 'program', name: 'terminal', n: '3', computer: C, project: P });
    expect(markOf(readLink(on('terminal', 3), env())!, hostOf(list('stopped')))?.board).toBeNull();
    expect(m(`${on('exec', 1)}/x`)?.board).toBeNull();
    expect(m(on('terminal', 1, OTHER))).toMatchObject({ kind: 'other', board: null, what: { k: 'masked' } });
  });
  // A local address gets its own mark (linkLocal.test.tsx).
  it('outside links, aliases, program API paths and links with credentials get none', () => {
    expect(m('https://example.com/x')).toBeNull();
    expect(m(`https://my-app.sg1.${PROXY}/`)).toBeNull();
    expect(m(`${on('browser')}/api/v1/status`)).toBeNull();
  });
});

describe('marks in a reply', () => {
  it('a bare address is replaced by its label, one real button named for it', () => {
    const c = draw(`The site is up at ${on('http', 3000)} now.`, hostOf(list('running')));
    expect(c.textContent).toContain('atlas · port 3000');
    expect(c.textContent).not.toContain(PROXY);
    expect(screen.getByRole('button', { name: 'Open atlas · port 3000' })).toBeTruthy();
  });
  it('a labelled link keeps the agent words and gains the mark after them', () => {
    // A link holding a computer's ids is the kit's secret link (a button that opens it), so its words are read as text.
    const c = draw(`See [the shop](${on('http', 3000)}).`, hostOf(list('running')));
    expect(c.textContent).not.toContain(C);
    const words = screen.getByText('the shop');
    const open = screen.getByRole('button', { name: 'Open atlas · port 3000' });
    expect(words.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('words that hold an id are not shown: the mark stands alone', () => {
    const c = draw(`See [${C}](${on('http', 3000)}).`, hostOf(list('running')));
    expect(c.textContent).not.toContain(C);
    expect(screen.getByRole('button', { name: 'Open atlas · port 3000' })).toBeTruthy();
  });
  it('a computer that is off says so in its label', () => {
    draw(`Terminal: ${on('terminal', 3)}`, hostOf(list('stopped')));
    expect(screen.getByRole('button', { name: 'Open atlas · Terminal 3 (off)' })).toBeTruthy();
  });
  it('another computer shows the masked host; a failed list adds Try again', () => {
    const retry = vi.fn();
    const c = draw(`Look: ${on('terminal', 1, OTHER)}`, hostOf({ rows: [], complete: false, failed: true, retry }));
    expect(c.textContent).toContain('Another computer');
    expect(c.textContent).not.toContain(OTHER);
    fireEvent.click(screen.getByRole('button', { name: /^More for Another computer/ }));
    expect(screen.getByRole('menuitem', { name: 'Try again' })).toBeTruthy();
  });
  it('a script opens its Hub page through the host, never its address', () => {
    const openHub = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    draw(`Run ${on('exec', 1)}/orders/list`, hostOf(list('running'), { openHub }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the script atlas · /orders/list' }));
    expect(openHub).toHaveBeenCalledWith('/scripts');
    expect(open).not.toHaveBeenCalled();
  });
  it('inline code that is one address keeps its look and gains the mark', () => {
    const c = draw(`Open \`${on('terminal', 2)}\` please`, hostOf(list('running')));
    expect(c.querySelector('code')?.textContent).toBe(on('terminal', 2));
    expect(screen.getByRole('button', { name: 'Open atlas · Terminal 2' })).toBeTruthy();
  });
  it('one mark per target, at most 8 per reply', () => {
    const same = draw(`${on('terminal', 1)} and again ${on('terminal', 1)}`, hostOf(list('running')));
    expect(screen.getAllByRole('button', { name: 'Open atlas · Terminal 1' })).toHaveLength(1);
    // The second is drawn as the address, masked, not as a label.
    expect(same.textContent).toMatch(/and again https:\/\//);
    unmount?.();
    const many = Array.from({ length: 10 }, (_, i) => on('terminal', i + 1)).join(' ');
    draw(many, hostOf(list('running')));
    expect(screen.getAllByRole('button', { name: /^Open atlas · Terminal/ })).toHaveLength(8);
  });
  it('none while the reply streams, none without a host, none where Prose does not ask for them', () => {
    const text = `Up at ${on('http', 3000)}`;
    draw(text, hostOf(list('running')), { caret: true });
    expect(screen.queryByRole('button', { name: /^Open atlas/ })).toBeNull();
    unmount?.();
    draw(text, null);
    expect(screen.queryByRole('button', { name: /^Open atlas/ })).toBeNull();
    unmount?.();
    draw(text, hostOf(list('running')), { marks: false });
    expect(screen.queryByRole('button', { name: /^Open atlas/ })).toBeNull();
  });
});

describe('a chat host', () => {
  const chat = (text: string, realm = 'global') => {
    core.all.mockReturnValue({ rows: [{ id: C, project_id: P, name: 'atlas', status: 'running' }], complete: true, failed: false, retry: () => undefined });
    return mount(
      <ChatLinkHost value={{ chat: atlas, realm, openHub: () => undefined }}>
        <Prose text={text} marks />
      </ChatLinkHost>,
    );
  };
  it('reads the realm list only once a reply shows a link on some computer', () => {
    chat('Nothing to open here, see https://example.com/x');
    expect(core.all).not.toHaveBeenCalled();
    unmount?.();
    chat(`Terminal: ${on('terminal', 3)}`);
    expect(core.all).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open atlas · Terminal 3' })).toBeTruthy();
  });
  it('switched away and back, it shows checking until the new read reports, never the rows read before', () => {
    const host = (text: string) => (
      <ChatLinkHost value={{ chat: atlas, realm: 'global', openHub: () => undefined }}>
        <Prose text={text} marks />
      </ChatLinkHost>
    );
    const text = `Terminal: ${on('terminal', 3)}`;
    core.all.mockReturnValue({ rows: [{ id: C, project_id: P, name: 'atlas', status: 'running' }], complete: true, failed: false, retry: () => undefined });
    const root = document.body.appendChild(document.createElement('div'));
    const r = render(host(text), { baseElement: root });
    unmount = () => { r.unmount(); root.remove(); };
    expect(screen.getByRole('button', { name: 'Open atlas · Terminal 3' })).toBeTruthy();
    core.realm = 'd'.repeat(24);
    r.rerender(host(text));
    expect(root.textContent).toContain('Another computer');
    // Back: the new reader has not reported yet (its first answer is still loading), so the old rows must not show.
    core.all.mockReturnValue({ rows: null, complete: false, failed: false, retry: () => undefined });
    core.realm = 'global';
    // Every frame drawn on the way back is watched: the old rows may not show even for the one draw before the reader reports.
    const seen: string[] = [];
    const note = (m: MutationRecord) => {
      m.addedNodes.forEach((n) => seen.push(n.textContent ?? ''));
      if (m.type === 'characterData') seen.push(m.oldValue ?? '', m.target.textContent ?? '');
    };
    const watch = new MutationObserver((rs) => rs.forEach(note));
    watch.observe(root, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    r.rerender(host(text));
    watch.takeRecords().forEach(note);
    watch.disconnect();
    expect(seen.filter((x) => /atlas · Terminal 3(?! \(checking\))/.test(x))).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Open atlas · Terminal 3' })).toBeNull();
    expect(root.textContent).toContain('(checking)');
  });
  it('a chat in another realm than the one shown reads nothing: its links read Another computer', () => {
    const c = chat(`Terminal: ${on('terminal', 3)}`, 'd'.repeat(24));
    expect(core.all).not.toHaveBeenCalled();
    expect(c.textContent).toContain('Another computer');
  });
});
