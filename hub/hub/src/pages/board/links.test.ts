import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG, oneSession, startView, TILE_PROGRAMS } from './embed/catalog';
import { boardAddPath, boardConnectSshLink, isNewTerminal, openFits, openTile, parseBoardAdd, type BoardAddAt, type BoardAddRef, parseConnectSsh, parseView, portViewPath, programViewPath, tileHostFits } from './links';

// The page's computer proxy domain, as computers.ts reads it ('' = none here).
const page = vi.hoisted(() => ({ domain: '' }));
vi.mock('./computers', () => ({ computersDomain: () => page.domain }));

const split = (href: string) => href.slice('/board'.length).split('/').filter(Boolean).map(decodeURIComponent);

describe('Board links', () => {
  it('a port and a script view read back as written; a program view is unchanged', () => {
    for (const r of [{ handle: 'atlas.ab12', protocol: 'http' as const, port: 3000 }, { handle: 'atlas.ab12', protocol: 'exec' as const, port: 1, path: '/orders/list' }, { handle: 'atlas.ab12', protocol: 'exec' as const, port: 1, path: '/' }])
      expect(parseView(split(portViewPath(r)))).toEqual(r);
    expect(portViewPath({ handle: 'atlas.ab12', protocol: 'http', port: 8080 })).toBe('/board/open/atlas.ab12/port-8080');
    expect(portViewPath({ handle: 'atlas.ab12', protocol: 'exec', port: 1, path: '/' })).toBe('/board/open/atlas.ab12/script');
    expect(parseView(split(programViewPath({ handle: 'atlas.ab12', program: 'terminal', session: 2 })))).toEqual({ handle: 'atlas.ab12', program: 'terminal', session: 2 });
  });
  it('a port outside 1..65535 or a route with other characters has no view (empty link, null read)', () => {
    expect(portViewPath({ handle: 'a.b123', protocol: 'http', port: 0 })).toBe('');
    expect(portViewPath({ handle: 'a.b123', protocol: 'http', port: 65536 })).toBe('');
    expect(portViewPath({ handle: 'a.b123', protocol: 'exec', port: 1, path: '/orders/[id]' })).toBe('');
    expect(portViewPath({ handle: 'a.b123', protocol: 'exec', port: 1, path: '/a/../b' })).toBe('');
    expect(parseView(['open', 'a.b123', 'port-0'])).toBeNull();
    expect(parseView(['open', 'a.b123', 'port-70000'])).toBeNull();
    expect(parseView(['open', 'a.b123', 'port-80', 'x'])).toBeNull();
    expect(parseView(['open', 'a.b123', 'script', '..'])).toBeNull();
    expect(parseView(['open', 'a.b123', 'script', 'a b'])).toBeNull();
    expect(parseView(['open', '', 'port-80'])).toBeNull();
  });
});

describe('Connect over SSH links', () => {
  it('fills the form through the address: computer by handle, host, user, port; never a secret', () => {
    expect(boardConnectSshLink({ handle: 'atlas.00a1', host: 'db.example.com', user: 'ops', port: 2222 })).toBe('/board?connect=ssh&computer=atlas.00a1&host=db.example.com&user=ops&port=2222');
    expect(boardConnectSshLink({ host: '[::1]' })).toBe('/board?connect=ssh&host=%5B%3A%3A1%5D');
  });
  it('links nothing for a value the form would refuse', () => {
    for (const r of [{ host: '-oProxyCommand=x' }, { host: 'h', user: '-l' }, { host: 'h', port: 0 }, { host: 'h', port: 1.5 }, { host: 'h', handle: 'a b' }, { host: 'h', handle: '' }, { host: '' }]) expect(boardConnectSshLink(r)).toBe('');
  });
  it('reads a link back for the form, leaving out each value it would refuse; anything else is no link', () => {
    expect(parseConnectSsh({ connect: 'ssh', computer: 'atlas.00a1', host: 'db.example.com', user: 'ops', port: 2222 })).toEqual({ computer: 'atlas.00a1', host: 'db.example.com', user: 'ops', port: '2222' });
    expect(parseConnectSsh({ connect: 'ssh', computer: 'a/b', host: 'a b', user: '-x', port: '70000' })).toEqual({});
    expect(parseConnectSsh({ connect: 'ssh', host: 'h', port: '22', password: 'x', key: 'y' })).toEqual({ host: 'h', port: '22' });
    expect(parseConnectSsh({ connect: 'web', host: 'h' })).toBeNull();
    expect(parseConnectSsh({})).toBeNull();
  });
});

describe('tileHostFits: whether the Board can give a terminal or display tile an address', () => {
  const P24 = 'fedcba9876543210fedcba98', C24 = '0123456789abcdef01234567';
  const at = { id: C24, project_id: P24, server_name: 'sg-sin-1' };
  beforeEach(() => { page.domain = 'computers.hoody.com'; });
  it('real 24-character ids: terminal 15001 (the short t- host), terminal 9999 and display 15001 fit', () => {
    expect(tileHostFits('terminal', 15001, at)).toBe(true);
    expect(tileHostFits('terminal', 9999, at)).toBe(true);
    expect(tileHostFits('display', 15001, at)).toBe(true);
  });
  it('a label too long even so does not fit (a 30-character computer id on a display)', () => {
    expect(tileHostFits('display', 1, { ...at, id: '0123456789abcdef0123456789abcd' })).toBe(false);
  });
  it('any other refusal is the tile\'s own to show: no server known yet, or no proxy domain here', () => {
    expect(tileHostFits('display', 1, { id: '0123456789abcdef0123456789abcd', project_id: P24 })).toBe(true);
    page.domain = '';
    expect(tileHostFits('display', 1, { ...at, id: '0123456789abcdef0123456789abcd' })).toBe(true);
  });
});

describe('boardAddPath: one tile put on the Board from another page (Apps: Put on Board)', () => {
  const C = '0123456789abcdef01234567';
  const at = { project: { id: 'fedcba9876543210fedcba98' }, container: { id: C, server_name: 'sg-sin-1' } };
  const q = (href: string) => Object.fromEntries(new URL(href, 'https://hub.test').searchParams);
  it('a terminal, a display or a web port, named by the computer\'s id; read back as the same tile', () => {
    expect(boardAddPath(at, { kind: 'terminal', session: 3 })).toBe(`/board?add=terminal-3&cid=${C}`);
    expect(boardAddPath(at, { kind: 'display', session: 1 })).toBe(`/board?add=display-1&cid=${C}`);
    expect(boardAddPath(at, { kind: 'port', port: 8080, path: '/app/main' })).toBe(`/board?add=port-8080&cid=${C}&path=%2Fapp%2Fmain`);
    expect(boardAddPath(at, { kind: 'port', port: 3000, path: '/' })).toBe(`/board?add=port-3000&cid=${C}`);
    expect(boardAddPath(at, { kind: 'port', port: 3000, path: '' })).toBe(`/board?add=port-3000&cid=${C}`);
    expect(parseBoardAdd(q(boardAddPath(at, { kind: 'terminal', session: 3 })))).toEqual({ cid: C, program: 'terminal', session: 3 });
    expect(parseBoardAdd(q(boardAddPath(at, { kind: 'port', port: 8080, path: '/app/main' })))).toEqual({ cid: C, protocol: 'http', port: 8080, path: '/app/main' });
    expect(parseBoardAdd(q(boardAddPath(at, { kind: 'port', port: 3000, path: '/' })))).toEqual({ cid: C, protocol: 'http', port: 3000 });
  });
  it('no link (\'\') for a number, port or route the Board would not keep, or an id that is not one', () => {
    for (const session of [0, -1, 1.5, 65536, Number.NaN]) {
      expect(boardAddPath(at, { kind: 'terminal', session })).toBe('');
      expect(boardAddPath(at, { kind: 'port', port: session, path: '/' })).toBe('');
    }
    for (const path of ['/a?b=1', '/a/../b', 'app', '/a b', '/' + 'x'.repeat(200)]) expect(boardAddPath(at, { kind: 'port', port: 80, path })).toBe('');
    for (const id of ['', '-abc', 'a/b', 'a.b', 'x'.repeat(81)]) expect(boardAddPath({ ...at, container: { id } }, { kind: 'terminal', session: 1 })).toBe('');
  });
  it('read back only whole, valid and of the right type', () => {
    expect(parseBoardAdd({})).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-3' })).toBeNull();
    expect(parseBoardAdd({ add: 'files-2', cid: C })).toBeNull(); // files has one instance: only files-1
    expect(parseBoardAdd({ add: 'terminal-0', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-65536', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'port-70000', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'port-80', cid: C, path: '/a/../b' })).toBeNull();
    expect(parseBoardAdd({ add: 'port-80', cid: C, path: 7 })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-3', cid: C, path: 7 })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-3', cid: 1234 })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-3', cid: 'a/b' })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-3', cid: C, path: '/x' })).toEqual({ cid: C, program: 'terminal', session: 3 });
  });
});

describe('Add links for every tile program (Add to Board from any page)', () => {
  const C = '0123456789abcdef01234567';
  const at = { project: { id: 'fedcba9876543210fedcba98' }, container: { id: C, server_name: 'sg-sin-1' } };
  const q = (href: string) => Object.fromEntries(new URL(href, 'https://hub.test').searchParams);
  const offered = TILE_PROGRAMS.filter((p) => startView(CATALOG, p) !== undefined);
  it('every program the picker offers: its session is linked and read back as the same tile', () => {
    expect(offered).toEqual(expect.arrayContaining(['agent', 'terminal', 'display', 'files', 'browser', 'notes']));
    for (const p of offered) {
      const href = boardAddPath(at, { kind: p, session: 1 });
      expect(href).toBe(`/board?add=${p}-1&cid=${C}`);
      expect(parseBoardAdd(q(href))).toEqual({ cid: C, program: p, session: 1 });
    }
    expect(boardAddPath(at, { kind: 'agent', session: 4 })).toBe(`/board?add=agent-4&cid=${C}`);
    expect(parseBoardAdd({ add: 'browser-2', cid: C })).toEqual({ cid: C, program: 'browser', session: 2 });
  });
  it('a program with one instance (files, sqlite): only session 1, as the picker adds it', () => {
    const single = TILE_PROGRAMS.filter((p) => startView(CATALOG, p) !== undefined && oneSession(CATALOG, p));
    expect(single.length).toBeGreaterThan(0);
    for (const p of single) {
      expect(boardAddPath(at, { kind: p, session: 2 })).toBe('');
      expect(parseBoardAdd({ add: `${p}-2`, cid: C })).toBeNull();
    }
  });
  it('a program the picker does not offer, or a name that is no tile program: links nothing, read back as nothing', () => {
    // Every program is offered today, so the loop would be empty: strip sqlite's views for this test (both fields, restored after).
    const kit = CATALOG.kits.sqlite as { defaultView?: string; views: readonly string[] };
    const saved = { defaultView: kit.defaultView, views: kit.views };
    try {
      Object.assign(kit, { defaultView: undefined, views: [] });
      expect(startView(CATALOG, 'sqlite')).toBeUndefined();
      const notOffered = TILE_PROGRAMS.filter((x) => startView(CATALOG, x) === undefined);
      expect(notOffered).toContain('sqlite');
      for (const p of notOffered) {
        expect(boardAddPath(at, { kind: p, session: 1 })).toBe('');
        expect(parseBoardAdd({ add: `${p}-1`, cid: C })).toBeNull();
      }
    } finally {
      Object.assign(kit, saved);
    }
    expect(parseBoardAdd({ add: 'shell-1', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'Agent-1', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'agent-0', cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'agent-1x', cid: C })).toBeNull();
  });
});

describe('Add link for a new terminal (Computers "New terminal" opens on the Board)', () => {
  const C = '0123456789abcdef01234567';
  const at = { project: { id: 'fedcba9876543210fedcba98' }, container: { id: C, server_name: 'sg-sin-1' } };
  const q = (href: string) => Object.fromEntries(new URL(href, 'https://hub.test').searchParams);
  it('names no number: the Board picks the next free one when it takes the link', () => {
    expect(boardAddPath(at, { kind: 'terminal', session: 'new' })).toBe(`/board?add=terminal-new&cid=${C}`);
    expect(parseBoardAdd(q(boardAddPath(at, { kind: 'terminal', session: 'new' })))).toEqual({ cid: C, program: 'terminal', session: 'new' });
    expect(boardAddPath({ ...at, container: { id: 'a/b' } }, { kind: 'terminal', session: 'new' })).toBe('');
  });
  it('only a terminal takes "new", and only as the whole value', () => {
    for (const add of ['display-new', 'agent-new', 'port-new', 'terminal-new2', 'terminal-New', 'terminal-']) expect(parseBoardAdd({ add, cid: C })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-new' })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-new', cid: 'a/b' })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-new', cid: C, path: 7 })).toBeNull();
  });
  it('isNewTerminal checks the program too', () => {
    expect(isNewTerminal({ kind: 'terminal', session: 'new' })).toBe(true);
    expect(isNewTerminal({ kind: 'port', port: 80, path: '/', session: 'new' } as unknown as BoardAddAt)).toBe(false);
    expect(isNewTerminal({ cid: C, program: 'display', session: 'new' } as unknown as BoardAddRef)).toBe(false);
    expect(isNewTerminal({ cid: C, program: 'terminal', session: 3 })).toBe(false);
  });
});

describe('Add links that open a files or notes tile on one place', () => {
  const C = 'c0a7150000000000000000a1';
  const target = { project: { id: 'p'.repeat(24) }, container: { id: C, server_name: 'n1' } };
  const USER = 'u0000000000000000000000a1';
  const NODE = 'n0000000000000000000000b2';
  const q = (href: string) => Object.fromEntries(new URLSearchParams(href.slice('/board?'.length)));
  it.each<BoardAddAt>([
    { kind: 'files', session: 1, open: { view: 'folder', path: '/srv/my app/ü & ?#' } },
    { kind: 'files', session: 1, open: { view: 'editor', path: '/etc/app.yml' } },
    { kind: 'notes', session: 1, open: { view: 'node', userId: USER, nodeId: NODE } },
  ])('read back as written: %o', (at) => {
    const href = boardAddPath(target, at);
    expect(href).not.toBe('');
    expect(parseBoardAdd(q(href))).toEqual({ cid: C, program: at.kind, session: 1, open: (at as { open: unknown }).open });
  });
  it('a note opens with the notebook sidebar hidden, an option the tile keeps; a files tile gets no such option', () => {
    expect(openTile('notes', { view: 'node', userId: USER, nodeId: NODE })).toEqual({ view: 'node', params: { userId: USER, nodeId: NODE, sidebar: 'hidden' } });
    expect(openTile('files', { view: 'folder', path: '/srv' })).toEqual({ view: 'folder', params: { path: '/srv' } });
    // The link itself names only the note: the default is the Board's, so a link never sets other options.
    expect(boardAddPath(target, { kind: 'notes', session: 1, open: { view: 'node', userId: USER, nodeId: NODE } })).not.toContain('sidebar');
  });
  it('a place the tile cannot open links nothing and reads back as nothing', () => {
    expect(boardAddPath(target, { kind: 'files', session: 1, open: { view: 'folder', path: 'srv' } })).toBe('');
    expect(boardAddPath(target, { kind: 'notes', session: 1, open: { view: 'folder', path: '/srv' } })).toBe('');
    expect(boardAddPath(target, { kind: 'files', session: 1, open: { view: 'folder', path: '/' + 'a'.repeat(2100) } })).toBe('');
    expect(openFits('files', { view: 'folder', path: '/' + 'a'.repeat(1900) })).toBe(true);
    expect(parseBoardAdd({ add: 'files-1', cid: C, open: 'folder', at: '/srv', user: USER })).toBeNull();
    expect(parseBoardAdd({ add: 'notes-1', cid: C, open: 'node', user: USER })).toBeNull();
    expect(parseBoardAdd({ add: 'files-1', cid: C, open: 'search', at: '/srv' })).toBeNull();
    expect(parseBoardAdd({ add: 'files-1', cid: C, at: '/srv' })).toBeNull();
    expect(parseBoardAdd({ add: 'files-1', cid: C, open: 'folder', at: 7 })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-new', cid: C, open: 'folder', at: '/srv' })).toBeNull();
    expect(parseBoardAdd({ add: 'port-80', cid: C, open: 'folder', at: '/srv' })).toBeNull();
  });
});
