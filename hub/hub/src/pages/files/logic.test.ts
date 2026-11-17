// Vitest: the Files page's pure rules (paths, what core can open today, the listing, the pane states, the URL).
import { describe, expect, it } from 'vitest';
import { SourceError } from '@core';
import { computerOf } from './data';
import {
  MAX_DEPTH, blockedPath, cleanPath, crumbsOf, displayName, entryOk, findByHandle, handleShared, handleUnique, joinPath, listingOf, paneComputer, paneHref, paneTarget, panesOf, parentOf, partsOf, problemOf, rootListingOf, startHref,
} from './logic';

const C = [
  { id: 'c0a7150000000000000000a1', name: 'atlas' },
  { id: 'c0a7150000000000000000c3', name: 'cedar' },
];

describe('paths', () => {
  it('splits and joins paths', () => {
    expect(partsOf('/')).toEqual([]);
    expect(partsOf('/srv/app')).toEqual(['srv', 'app']);
    expect(joinPath('/', 'srv')).toBe('/srv');
    expect(joinPath('/srv', 'app')).toBe('/srv/app');
    expect(parentOf('/srv/app')).toBe('/srv');
    expect(parentOf('/srv')).toBe('/');
    expect(parentOf('/')).toBe('/');
  });

  it('cleans a path from the URL, or refuses it', () => {
    expect(cleanPath(undefined)).toBe('/');
    expect(cleanPath('')).toBe('/');
    expect(cleanPath('/srv//app/')).toBe('/srv/app');
    expect(cleanPath('srv')).toBeNull();
    expect(cleanPath('/srv/../etc')).toBeNull();
    expect(cleanPath('/./srv')).toBeNull();
    expect(cleanPath('/' + 'a'.repeat(4096))).toBeNull();
  });

  it('opens a folder only when core can address it today', () => {
    expect(blockedPath('/')).toBeNull();
    expect(blockedPath('/srv/app')).toBeNull();
    expect(blockedPath('/' + Array.from({ length: MAX_DEPTH }, (_, i) => `d${i}`).join('/'))).toBeNull();
    expect(blockedPath('/' + Array.from({ length: MAX_DEPTH + 1 }, (_, i) => `d${i}`).join('/'))).toBe('deep');
    // The files program reads these first parts as its own commands (core cannot address them yet).
    for (const a of ['stat', 'grep', 'glob', 'realpath', 'append', 'move', 'copy', 'chmod', 'chown', 'health']) expect(blockedPath(`/${a}/x`)).toBe('alias');
    expect(blockedPath('/srv/copy')).toBeNull();
    expect(blockedPath('/a%b')).toBe('name');
    expect(blockedPath('/a\\b')).toBe('name');
    expect(blockedPath('/a\u0007b')).toBe('name');
    // Linux PATH_MAX, counted as core counts it (UTF-8, parts joined by '/'): 4,096 bytes opens, one more is 'long'.
    const at = (n: number) => '/' + Array.from({ length: 5 }, () => '\u20ac'.repeat(256)).join('/') + '/' + 'x'.repeat(n);
    expect(new TextEncoder().encode(at(251).slice(1)).length).toBe(4096);
    expect(blockedPath(at(251))).toBeNull();
    expect(blockedPath(at(252))).toBe('long');
    expect(blockedPath('/' + 'n'.repeat(257))).toBe('name');
    expect(blockedPath('/caf�')).toBe('lossy');
  });

  it('builds breadcrumbs from the top folder', () => {
    expect(crumbsOf('/')).toEqual([{ name: '/', path: '/' }]);
    expect(crumbsOf('/srv/app')).toEqual([{ name: '/', path: '/' }, { name: 'srv', path: '/srv' }, { name: 'app', path: '/srv/app' }]);
  });

  it('shows control characters escaped, never raw', () => {
    expect(displayName('a\u0007b')).toBe('a\\x07b');
    expect(displayName('a\u009bb')).toBe('a\\x9bb');
    expect(displayName('plain name.txt')).toBe('plain name.txt');
  });
});

describe('listing', () => {
  it('reads the files program listing', () => {
    const rows = listingOf({ path: '/srv', count: 3, entries: [
      { name: 'app', is_dir: true, size: 0, modified: 1_700_000_000 },
      { name: 'notes.txt', is_dir: false, size: 12, modified: null },
      { name: 'caf�', is_dir: false, size: 1 },
    ] });
    expect(rows).toEqual([
      { name: 'app', dir: true, size: null, modified: 1_700_000_000_000, lossy: false },
      { name: 'notes.txt', dir: false, size: 12, modified: null, lossy: false },
      { name: 'caf�', dir: false, size: 1, modified: null, lossy: true },
    ]);
  });

  it('refuses a listing with any entry it cannot read, and a body that is not a listing', () => {
    // One unreadable entry makes the whole answer unreadable: never a shorter list, never a false empty folder.
    for (const bad of [{ name: '', is_dir: true }, { name: 'a/b', is_dir: false }, { is_dir: true }, null, { name: 'ok', is_dir: 'yes' }, { name: 'exists.txt', is_dir: 'false' }]) {
      expect(listingOf({ count: 1, entries: [bad] })).toBeNull();
      expect(listingOf({ entries: [{ name: 'fine', is_dir: false }, bad] })).toBeNull();
    }
    expect(listingOf({ entries: [] })).toEqual([]);
    expect(listingOf({})).toBeNull();
    expect(listingOf(null)).toBeNull();
    expect(listingOf({ entries: 'x' })).toBeNull();
  });

  it('turns actions off on a name the Hub cannot pass on exactly', () => {
    expect(entryOk({ name: 'ok', dir: true, size: null, modified: null, lossy: false })).toBe(true);
    expect(entryOk({ name: 'caf�', dir: true, size: null, modified: null, lossy: true })).toBe(false);
  });
});

describe('pane problems', () => {
  it('says what kept a folder from being read', () => {
    expect(problemOf(new SourceError('forbidden', null, 401), 'open')).toBe('access');
    expect(problemOf(new SourceError('forbidden', null, 403), 'set')).toBe('access');
    expect(problemOf(new SourceError('forbidden', null, 403), 'open')).toBe('refused');
    // Access rules not known for sure: a 403 is not blamed on them, nor on the folder.
    expect(problemOf(new SourceError('forbidden', null, 403), 'unknown')).toBe('denied');
    expect(problemOf(new SourceError('not_found', null, 404), 'open')).toBe('gone');
    // Core's kit leg reads at most the route's byte bound: a bigger listing is an answered 200 it would not read.
    expect(problemOf(new SourceError('server', 'too_large', 200), 'open')).toBe('tooBig');
    expect(problemOf(new SourceError('server', null, 200), 'open')).toBe('unreadable');
    // The page's own select refusing a body that is no listing (core: server, no status).
    expect(problemOf(new SourceError('server'), 'open')).toBe('unreadable');
    // An answer that is not JSON, broken JSON or no listing: 'Couldn't read this folder' with a retry, never "too many entries".
    expect(problemOf(new SourceError('server', 'NOT_JSON', 200), 'open')).toBe('unreadable');
    expect(problemOf(new SourceError('server', 'BAD_JSON', 200), 'open')).toBe('unreadable');
    // Only a read nothing answered is unreachable; a 5xx, a lost body, an unknown throw are failed.
    expect(problemOf(new SourceError('server', null, 502), 'open')).toBe('failed');
    expect(problemOf(new SourceError('network', 'NETWORK'), 'open')).toBe('unreachable');
    expect(problemOf(new SourceError('network', 'TIMEOUT'), 'open')).toBe('unreachable');
    expect(problemOf(new SourceError('network'), 'open')).toBe('failed');
    expect(problemOf(new Error('x'), 'open')).toBe('failed');
  });
});

describe('the URL', () => {
  it('reads both panes', () => {
    expect(panesOf({ a: 'atlas.00a1', ap: '/srv', b: 'cedar.00c3' })).toEqual({ a: { handle: 'atlas.00a1', path: '/srv' }, b: { handle: 'cedar.00c3', path: '/' } });
    expect(panesOf({})).toEqual({ a: { handle: undefined, path: '/' }, b: { handle: undefined, path: '/' } });
    expect(panesOf({ ap: '/../x' }).a.path).toBeNull();
    // A pane's id that is no id still browses by its handle, but marks the pane: an ask on it is never acted on.
    expect(panesOf({ a: 'atlas.00a1', acid: '../x' }).a).toEqual({ handle: 'atlas.00a1', path: '/', idBad: true });
    expect(panesOf({ a: 'atlas.00a1', acid: 'c0a7150000000000000000a1' }).a).toEqual({ handle: 'atlas.00a1', path: '/', id: 'c0a7150000000000000000a1' });
  });

  it('rewrites ?computer= into pane A', () => {
    expect(startHref({ computer: 'atlas.00a1', path: '/srv' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv');
    // The link replaces pane A whole: its old folder and view keys go; pane B and the sort stay.
    expect(startHref({ computer: 'cedar.00c3', ap: '/srv', aq: 'old', apage: '2', akind: 'file', asel: 'x', b: 'atlas.00a1', bp: '/etc', bq: 'h' }))
      .toBe('/files?b=atlas.00a1&bp=%2Fetc&bq=h&a=cedar.00c3');
    expect(startHref({ computer: 'atlas.00a1' })).toBe('/files?a=atlas.00a1');
    expect(startHref({ a: 'atlas.00a1' })).toBeNull();
  });

  it("maps a chat path link's select and open onto pane A, once", () => {
    // select names the row to open; open asks the pane once (aopen), Preview only with a row to open.
    expect(startHref({ computer: 'atlas.00a1', path: '/srv/app', select: 'package.json', open: 'preview' }))
      .toBe('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asel=package.json&aopen=preview');
    expect(startHref({ computer: 'atlas.00a1', path: '/srv/app', open: 'here' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&aopen=here');
    expect(startHref({ computer: 'atlas.00a1', path: '/srv', select: 'app' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv&asel=app');
    expect(startHref({ computer: 'atlas.00a1', path: '/srv/app', open: 'preview' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp');
    // An ask the page does not know, and a select that is not one name, are dropped, never carried.
    expect(startHref({ computer: 'atlas.00a1', path: '/srv', open: 'run' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv');
    for (const bad of ['', '.', '..', 'a/b', '/etc/passwd', 'a\0b']) {
      expect(startHref({ computer: 'atlas.00a1', path: '/srv', select: bad, open: 'preview' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv');
    }
    // A link that knows its computer's id names it (acid); a malformed one is dropped.
    expect(startHref({ computer: 'atlas.00a1', cid: 'c0a7150000000000000000a1', path: '/srv' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv&acid=c0a7150000000000000000a1');
    expect(startHref({ computer: 'atlas.00a1', cid: '../x', path: '/srv' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv');
    // A link that names an id the page can't read keeps no ask: the handle alone never stands in for the id it meant.
    expect(startHref({ computer: 'atlas.00a1', cid: '../x', path: '/srv/app', select: 'package.json', open: 'preview' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp');
    expect(startHref({ computer: 'atlas.00a1', cid: '', path: '/srv', open: 'here' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv');
    // The id stays while the pane stays on that handle, and goes with a move to another computer.
    expect(paneHref({ a: 'atlas.00a1', acid: 'c0a7150000000000000000a1' }, 'a', { path: '/srv' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv&acid=c0a7150000000000000000a1');
    expect(paneHref({ a: 'atlas.00a1', acid: 'c0a7150000000000000000a1' }, 'a', { handle: 'cedar.00c3', path: '/' })).toBe('/files?a=cedar.00c3');
    // A link replaces pane A's old ask too.
    expect(startHref({ computer: 'atlas.00a1', aopen: 'here', asel: 'x' })).toBe('/files?a=atlas.00a1');
  });

  it("drops a pane's ask, alone, on every move of that pane", () => {
    const now = { a: 'atlas.00a1', ap: '/srv/app', asel: 'package.json', aopen: 'preview', b: 'cedar.00c3', bopen: 'here' };
    expect(paneHref(now, 'a', { path: '/srv' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv&b=cedar.00c3&bopen=here');
  });

  it('moves one pane and drops only that pane view keys', () => {
    const now = { a: 'atlas.00a1', ap: '/srv', aq: 'x', apage: '2', asel: 'app', akind: 'folder', asort: 'name', b: 'cedar.00c3', bq: 'keep' };
    expect(paneHref(now, 'a', { path: '/srv/app' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&asort=name&b=cedar.00c3&bq=keep');
    expect(paneHref(now, 'b', { handle: 'atlas.00a1', path: '/' })).toBe('/files?a=atlas.00a1&ap=%2Fsrv&aq=x&apage=2&asel=app&akind=folder&asort=name&b=atlas.00a1');
  });

  it('finds a computer by its handle, never by a bare id', () => {
    expect(findByHandle(C, 'atlas.00a1')?.name).toBe('atlas');
    expect(findByHandle(C, 'atlas.0000')).toBeUndefined();
    expect(findByHandle(C, 'c0a7150000000000000000a1')).toBeUndefined();
    expect(findByHandle(C, undefined)).toBeUndefined();
  });

  it('a handle two computers share names neither: the page asks which one', () => {
    const twin = { id: 'd00000000000000000000000a1', name: 'atlas' };
    expect(findByHandle([...C, twin], 'atlas.00a1')).toBeUndefined();
    expect(handleShared([...C, twin], 'atlas.00a1')).toBe(true);
    expect(handleShared(C, 'atlas.00a1')).toBe(false);
    expect(handleUnique([...C, twin], 'atlas.00a1')).toBe(false);
    expect(handleUnique(C, 'atlas.00a1')).toBe(true);
    expect(handleUnique([...C, twin], 'cedar.00c3')).toBe(true);
    expect(findByHandle([...C, twin], 'cedar.00c3')?.name).toBe('cedar');
    expect(handleUnique(C, 'ghost.0000')).toBe(false);
  });

  it("a pane's computer is the one its id names, else the only one with its handle", () => {
    const twin = { id: 'd00000000000000000000000a1', name: 'atlas' };
    const all = [...C, twin];
    expect(paneComputer(all, { handle: 'atlas.00a1', path: '/', id: twin.id })?.id).toBe(twin.id);
    expect(paneComputer(all, { handle: 'atlas.00a1', path: '/' })).toBeUndefined();
    expect(paneComputer(C, { handle: 'atlas.00a1', path: '/' })?.name).toBe('atlas');
    // An id no listed computer has names none, whatever the handle says.
    expect(paneComputer(C, { handle: 'atlas.00a1', path: '/', id: 'e00000000000000000000000a1' })).toBeUndefined();
    // An id that is no id leaves the handle to browse by.
    expect(paneComputer(C, { handle: 'atlas.00a1', path: '/', idBad: true })?.name).toBe('atlas');
  });

  it('a move to a computer whose handle another shares carries its id; any other move carries none', () => {
    const twin = { id: 'd00000000000000000000000a1', name: 'atlas' };
    const all = [...C, twin];
    expect(paneTarget(all, twin, '/')).toEqual({ handle: 'atlas.00a1', path: '/', id: twin.id });
    expect(paneTarget(C, C[0]!, '/srv')).toEqual({ handle: 'atlas.00a1', path: '/srv' });
    expect(paneHref({ a: 'cedar.00c3', acid: 'x1' }, 'a', paneTarget(all, twin, '/'))).toBe(`/files?a=atlas.00a1&acid=${twin.id}`);
    // The same handle, another twin: the id is replaced, never kept from the pane's last computer.
    expect(paneHref({ a: 'atlas.00a1', acid: C[0]!.id, ap: '/srv' }, 'a', paneTarget(all, twin, '/'))).toBe(`/files?a=atlas.00a1&acid=${twin.id}`);
    // A folder move inside the pane keeps the id it has.
    expect(paneHref({ a: 'atlas.00a1', acid: twin.id }, 'a', { handle: 'atlas.00a1', path: '/srv' })).toBe(`/files?a=atlas.00a1&ap=%2Fsrv&acid=${twin.id}`);
  });
});

describe('access rules from the computer list', () => {
  it('keeps rules set, open and not known apart, as the computers page does', () => {
    const rulesOf = (x: Record<string, unknown>) => computerOf({ id: 'c1', ...x })!.rules;
    expect(rulesOf({ proxy_permissions_scope: 'computer' })).toBe('set');
    expect(rulesOf({ proxy_permissions_scope: 'both' })).toBe('set');
    expect(rulesOf({ proxy_permissions_scope: 'none' })).toBe('open');
    expect(rulesOf({ proxy_permissions_scope: 'unknown' })).toBe('unknown');
    expect(rulesOf({ has_proxy_permissions: true })).toBe('set');
    expect(rulesOf({ has_proxy_permissions: false })).toBe('open');
    expect(rulesOf({ has_proxy_permissions: null })).toBe('unknown');
    expect(rulesOf({})).toBe('unknown');
  });
});

describe('rootListingOf (listRootDirectory, GET /?json)', () => {
  const item = (o: Record<string, unknown>) => ({ path_type: 'File', name: 'a', mtime: 1_700_000_000_000, size: 5, ...o });
  it('reads the DirectoryListing paths: folders and links to folders open, mtime stays milliseconds', () => {
    const rows = rootListingOf({ kind: 'Index', paths: [
      item({ path_type: 'Dir', name: 'home', size: 4 }),
      item({ path_type: 'SymlinkDir', name: 'lib', size: 9 }),
      item({ name: 'notes.txt', size: 12 }),
      item({ path_type: 'SymlinkFile', name: 'link.txt', size: 3, revisions: 2 }),
    ] });
    expect(rows).toEqual({ hidden: 0, whole: false, entries: [
      { name: 'home', dir: true, size: null, modified: 1_700_000_000_000, lossy: false, type: 'dir' },
      { name: 'lib', dir: true, size: null, modified: 1_700_000_000_000, lossy: false },
      { name: 'notes.txt', dir: false, size: 12, modified: 1_700_000_000_000, lossy: false, type: 'file' },
      { name: 'link.txt', dir: false, size: 3, modified: 1_700_000_000_000, lossy: false, type: 'symlink' },
    ] });
  });
  it('an empty top folder is an empty list', () => {
    expect(rootListingOf({ kind: 'Index', paths: [] })).toEqual({ entries: [], hidden: 0, whole: false });
  });
  it('an item it cannot show is left out and counted, never the whole folder', () => {
    const bad = [item({ path_type: 'Fifo' }), item({ path_type: '__proto__' }), item({ path_type: 'constructor' }), item({ path_type: 'toString' }), item({ path_type: 'hasOwnProperty' }), item({ path_type: 3 }), item({ name: '' }), item({ name: 'a/b' }), item({ name: 3 }), 'x', null];
    const r = rootListingOf({ kind: 'Index', paths: [item({ name: 'ok.txt' }), ...bad] });
    expect(r?.entries.map((e) => e.name)).toEqual(['ok.txt']);
    expect(r?.hidden).toBe(bad.length);
  });
  it('a body without its paths list is no listing', () => {
    expect(rootListingOf({ path: '/', entries: [] })).toBeNull();
    expect(rootListingOf({ kind: 'Index', paths: 'x' })).toBeNull();
    expect(rootListingOf(null)).toBeNull();
  });
});
