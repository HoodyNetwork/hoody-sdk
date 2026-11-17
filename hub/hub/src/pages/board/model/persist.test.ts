import { describe, expect, it } from 'vitest';
import { addTile, applyPreset, createBoard, freshRealm, isRefusal, onActive, renameBoard, type RealmBoards, type Refusal, type TileRef } from './boards';
import { parseRealmBoards, parseTile, toStored, UNREADABLE_DAYS, UNREADABLE_MAX } from './persist';
import { deleteBoard } from './boards';
import { merge } from './merge';
import { refusedParams, storageRefusal } from '../embed/options';

function seq(): () => number { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; }
const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };

function sample(): RealmBoards {
  const r = seq();
  let s = freshRealm(r);
  s = ok(onActive(s, (b) => ok(applyPreset(b, 'one-two', r))));
  s = ok(onActive(s, (b) => ok(addTile(b, { project: 'p1', computer: 'c1', program: 'files', session: 1, view: 'folder', params: { path: '/srv', sort: 'size' } }, r)).board));
  s = ok(renameBoard(s, s.active, 'Main'));
  return ok(createBoard(s, r));
}

describe('stored Boards', () => {
  it('read(write(x)) is x, through JSON', () => {
    const s = sample();
    expect(parseRealmBoards(JSON.parse(JSON.stringify(toStored(s))))).toEqual({ state: s, notice: null });
  });
  it('a program tile read with options dropped keeps their ids (never values) as dropped, and toStored never writes it', () => {
    const t = parseTile({ project: 'p1', computer: 'c1', program: 'display', session: 1, params: { readonly: true, override_height: '720', record: true } }) as TileRef;
    expect(t).toEqual({ project: 'p1', computer: 'c1', program: 'display', session: 1, params: { readonly: true }, dropped: ['override_height', 'record'] });
    const s = ok(onActive(freshRealm(seq()), (b) => ok(addTile(b, t, seq())).board));
    const text = JSON.stringify(toStored(s));
    expect(text).not.toContain('dropped');
    expect(text).not.toContain('override_height');
    const back = parseRealmBoards(JSON.parse(text)).state.boards[0]?.tiles;
    expect(Object.values(back ?? {}).find((x) => x)).not.toHaveProperty('dropped');
  });
  it('dropped is never a change in the two-tab merge: this tab\'s own write folds back with no conflict, keeping dropped', () => {
    const t = parseTile({ project: 'p1', computer: 'c1', program: 'display', session: 1, params: { readonly: true, record: true } }) as TileRef;
    const r = seq();
    const loaded = ok(createBoard(ok(onActive(freshRealm(r), (b) => ok(addTile(b, t, r)).board)), r));
    const [a, other] = loaded.boards as [RealmBoards['boards'][number], RealmBoards['boards'][number]];
    const mine = ok(renameBoard(loaded, other.id, 'Second'));
    const theirs = parseRealmBoards(JSON.parse(JSON.stringify(toStored(mine)))).state;
    const m = merge(loaded, mine, theirs);
    expect(m.lost).toEqual([]);
    expect(m.changed).toEqual([]);
    const kept = m.state.boards.find((b) => b.id === a.id)!;
    expect(Object.values(a.tiles).find((x) => x)).toHaveProperty('dropped', ['record']);
    expect(Object.values(kept.tiles).find((x) => x)).toHaveProperty('dropped', ['record']);
    expect(toStored({ ...m.state, boards: [kept] }).boards[0]).toEqual(toStored({ ...loaded, boards: [a] }).boards[0]);
  });
  it('nothing stored is a fresh realm, no notice', () => {
    const l = parseRealmBoards(null, seq());
    expect(l.notice).toBeNull();
    expect(l.state.boards).toHaveLength(1);
  });
  it('a foreign shape or an unknown version resets, with a notice', () => {
    for (const raw of ['x', 42, [], {}, { v: 2, active: 'b', boards: [] }, { v: 1, boards: 'x' }, { v: 1, active: 'bxx', boards: [{ id: 'nope' }] }]) {
      const l = parseRealmBoards(raw, seq());
      expect(l.notice).toEqual({ kind: 'reset' });
      expect(l.state.boards).toHaveLength(1);
    }
  });
  it('bad Boards are left out and counted; the rest load', () => {
    const s = toStored(sample()) as unknown as { boards: Array<Record<string, unknown>>; active: string };
    const b0 = s.boards[0] as { tiles: Record<string, unknown> };
    const slot = Object.keys(b0.tiles).find((k) => b0.tiles[k]) as string;
    b0.tiles[slot] = { project: 'evil.test/', computer: 'c', program: 'terminal', session: 1 };
    s.boards.push({ id: 'bdup1', name: 'x', layout: { slot: 'saaa' }, tiles: {} }, { id: 'bdup1', name: 'y', layout: { slot: 'sbbb' }, tiles: {} });
    s.boards.push({ id: 'bbad1', name: 'z', layout: { dir: 'row', ratio: 1.5, a: { slot: 'sa1' }, b: { slot: 'sa2' } }, tiles: {} });
    const l = parseRealmBoards(JSON.parse(JSON.stringify(s)));
    expect(l.notice).toEqual({ kind: 'boards', n: 2 });
    expect(l.state.boards.map((b) => b.id)).toEqual([...sample().boards.map((b) => b.id), 'bdup1']);
    expect(l.state.boards[0]!.tiles[slot]).toBeNull();
  });
  it('layouts with repeated slots, too many slots or too deep are dropped', () => {
    const one = (layout: unknown) => parseRealmBoards({ v: 1, active: 'bone1', boards: [{ id: 'bone1', name: '', layout, tiles: {} }] }, seq()).notice?.kind ?? null;
    expect(one({ dir: 'row', ratio: 0.5, a: { slot: 'saaa' }, b: { slot: 'saaa' } })).toBe('reset');
    let deep: unknown = { slot: 's000' };
    for (let i = 1; i < 9; i++) deep = { dir: 'row', ratio: 0.5, a: deep, b: { slot: 's00' + i } };
    expect(one(deep)).toBe('reset');
    expect(one({ dir: 'diag', ratio: 0.5, a: { slot: 'saaa' }, b: { slot: 'sbbb' } })).toBe('reset');
    expect(one({ slot: 'saaa' })).toBeNull();
  });
  it('more than 9 Boards: the extra ones go', () => {
    const boards = Array.from({ length: 11 }, (_, i) => ({ id: 'bx' + String(i).padStart(3, '0'), name: '', layout: { slot: 'saaa' }, tiles: {} }));
    const l = parseRealmBoards({ v: 1, active: 'bx010', boards }, seq());
    expect(l.state.boards).toHaveLength(9);
    expect(l.state.active).toBe('bx000');
    expect(l.notice).toEqual({ kind: 'boards', n: 2 });
  });
  it('a tile keeps only its own fields; a token or URL never survives as a field', () => {
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'agent', session: 2, url: 'https://x', hdy_token: 'secret' }))
      .toEqual({ project: 'p1', computer: 'c1', program: 'agent', session: 2 });
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'cron', session: 1 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'agent', session: 0 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'agent', session: 1.5 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'files', session: 1, view: '../x' })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'files', session: 1, params: { 'bad key': 1 } })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'files', session: 1, params: { q: 'x'.repeat(9000) } })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', program: 'files', session: 1, params: ['x'] })).toBeNull();
  });
  it('an SSH terminal keeps its ssh {host, user, port} exactly as sent; a bad one, or one on another program, is not a tile (never a plain terminal)', () => {
    const t = { project: 'p1', computer: 'c1', program: 'terminal', session: 4, name: 'ops@db.example.com' };
    const ssh = { host: 'db.example.com', user: 'ops', port: 2222 };
    expect(parseTile({ ...t, ssh })).toEqual({ ...t, ssh });
    const { computer: tc, ...tRest } = t;
    expect(toStored({ ...freshRealm(seq()), recents: [{ ...t, ssh } as TileRef] }).recents[0]).toEqual({ ...tRest, computer: tc, ssh });
    for (const bad of [{ ...ssh, host: '-oProxyCommand=x' }, { ...ssh, host: ' db.example.com' }, { ...ssh, user: '' }, { ...ssh, port: 0 }, { ...ssh, port: '22' }, { host: 'h', user: 'u' }, 'ops@h', null])
      expect(parseTile({ ...t, ssh: bad })).toBeNull();
    expect(parseTile({ ...t, program: 'agent', ssh })).toBeNull();
  });
  it('a web tile keeps an http(s) address exactly as typed and its name; any other address is not a tile', () => {
    expect(parseTile({ url: 'https://user:pw@docs.example/a?b=1', name: '  Docs ' })).toEqual({ url: 'https://user:pw@docs.example/a?b=1', name: 'Docs' });
    expect(parseTile({ url: 'http://example.org' })).toEqual({ url: 'http://example.org' });
    for (const url of ['https:example.org', 'https:/example.org', 'HTTP:x.example', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.org', 'https://', 'https://a b.example', '/relative', 'x'.repeat(10), 'https://e.example/' + 'a'.repeat(2048), 7])
      expect(parseTile({ url })).toBeNull();
  });
  it('a port tile is one computer, http or exec, a port 1..65535 and an optional script path', () => {
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'http', port: 3000 })).toEqual({ project: 'p1', computer: 'c1', protocol: 'http', port: 3000 });
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/orders/list', name: 'Orders', extra: 'x' })).toEqual({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/orders/list', name: 'Orders' });
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'ws', port: 3000 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'http', port: 0 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'http', port: 65536 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'http', port: 80.5 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c 1', protocol: 'http', port: 80 })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: 'orders' })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/a b' })).toBeNull();
    // One route grammar with the picker and the view links: up to ROUTE_MAX, plain segments.
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/' + 'a'.repeat(199) })).toMatchObject({ path: '/' + 'a'.repeat(199) });
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/' + 'a'.repeat(200) })).toBeNull();
    expect(parseTile({ project: 'p1', computer: 'c1', protocol: 'exec', port: 1, path: '/a/../b' })).toBeNull();
  });
  it('a bad tile in a good Board empties its slot and says so', () => {
    const l = parseRealmBoards({ v: 1, active: 'bone1', boards: [{ id: 'bone1', name: 'A', layout: { slot: 'saaa' }, tiles: { saaa: { project: 'p', computer: 'c', program: 'evil', session: 1 } } }] });
    expect(l.notice).toEqual({ kind: 'tile' });
    expect(l.state.boards[0]!.tiles.saaa).toBeNull();
  });
  it('recents keep at most 8 valid picks and drop the rest', () => {
    const pick = (n: number) => ({ project: 'p1', computer: 'c' + n, program: 'terminal', session: 1 });
    const raw = { v: 1, active: 'bone1', boards: [{ id: 'bone1', name: '', layout: { slot: 'saaa' }, tiles: {} }], recents: [pick(1), { program: 'x' }, ...Array.from({ length: 9 }, (_, i) => pick(i + 2))] };
    const l = parseRealmBoards(raw);
    expect(l.state.recents.map((t) => t.computer)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    expect(parseRealmBoards({ ...raw, recents: 'x' }).state.recents).toEqual([]);
  });
  it('an active Board or slot that is gone falls back to the first', () => {
    const l = parseRealmBoards({ v: 1, active: 'bgone1', boards: [{ id: 'bone1', name: 'A', layout: { slot: 'saaa' }, tiles: {}, active: 'szzz', max: 'szzz' }] });
    expect(l.state.active).toBe('bone1');
    expect(l.state.boards[0]).toMatchObject({ active: 'saaa', max: null });
  });
  it('a refused option (credential, command) is dropped on read and on write', () => {
    const raw = { project: 'p1', computer: 'c1', program: 'terminal', session: 1, params: { fontSize: 14, ssh_password: 'x', env: 'A=1', cmd: 'rm', parent_keys: true } };
    expect(parseTile(raw)).toEqual({ project: 'p1', computer: 'c1', program: 'terminal', session: 1, params: { fontSize: 14 }, dropped: ['ssh_password', 'env', 'cmd', 'parent_keys'] });
    expect(JSON.stringify(parseTile(raw))).not.toMatch(/"x"|A=1|"rm"/);
    const s = sample();
    const b = s.boards[0]!;
    const slot = Object.keys(b.tiles).find((k) => b.tiles[k])!;
    const dirty: RealmBoards = { ...s, boards: [{ ...b, tiles: { ...b.tiles, [slot]: { ...(b.tiles[slot] as TileRef), params: { path: '/srv', ssh_password: 'x' } as never } } }, ...s.boards.slice(1)], recents: [raw as never] };
    const out = toStored(dirty);
    expect(JSON.stringify(out)).not.toMatch(/ssh_password|"env"|"cmd"|parent_keys/);
    expect((out.boards[0]!.tiles[slot] as TileRef).params).toEqual({ path: '/srv' });
  });
  it('URL options are kept exactly as typed (user:pw@ and ?key=/?sig=/?token= included); a JWT in a plain field is not', () => {
    const keep = parseTile({ project: 'p1', computer: 'c1', program: 'browser', session: 1, view: 'display', params: { iframe_url: 'https://user:pw@x.example/docs', maximize_new_windows: true } });
    expect((keep as TileRef | null)?.params).toEqual({ iframe_url: 'https://user:pw@x.example/docs', maximize_new_windows: true });
    for (const url of ['https://x.example/side', 'https://x.example/?token=abc', 'https://x.example/#access_token=a', 'https://x.example/?api_key=1', 'https://x.example/?q=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc'])
      expect((parseTile({ project: 'p1', computer: 'c1', program: 'terminal', session: 1, params: { panel: url } }) as TileRef | null)?.params).toEqual({ panel: url });
    expect(storageRefusal('https://x.example/?sig=1')).toBeNull();
    expect(storageRefusal('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc')).toBe('credential');
    expect(storageRefusal('Bearer abc')).toBe('credential');
    expect(storageRefusal('notes')).toBeNull();
  });
  it('a stored ratio inside (0, 1) is clamped to 0.1..0.9', () => {
    const l = parseRealmBoards({ v: 1, active: 'bone1', boards: [{ id: 'bone1', name: '', layout: { dir: 'row', ratio: 0.01, a: { slot: 'saaa' }, b: { slot: 'sbbb' } }, tiles: {} }] });
    expect(l.state.boards[0]!.layout).toMatchObject({ ratio: 0.1 });
  });
  it('an unreadable value is kept as raw text beside the fresh state, and dropped after 30 days', () => {
    const now = 1_000_000_000_000;
    const l = parseRealmBoards({ v: 1, boards: 'nope', mark: 'old' }, seq(), now);
    expect(l.notice).toEqual({ kind: 'reset' });
    expect(l.state.unreadable).toEqual({ at: now, raw: JSON.stringify({ v: 1, boards: 'nope', mark: 'old' }) });
    const written = JSON.parse(JSON.stringify(toStored(l.state)));
    expect(parseRealmBoards(written, seq(), now + 1000).state.unreadable).toEqual(l.state.unreadable);
    expect(parseRealmBoards(written, seq(), now + UNREADABLE_DAYS * 86_400_000).state.unreadable).toBeUndefined();
    expect(parseRealmBoards('x'.repeat(UNREADABLE_MAX * 2), seq(), now).state.unreadable?.raw).toHaveLength(UNREADABLE_MAX);
  });
  it('deleted Board ids are kept (for the two-tab merge), valid and absent ones only', () => {
    const s = ok(deleteBoard(sample(), sample().boards[1]!.id, seq()));
    expect(s.gone).toEqual([sample().boards[1]!.id]);
    const back = parseRealmBoards(JSON.parse(JSON.stringify({ ...toStored(s), gone: [...s.gone!, 'nope', s.boards[0]!.id] })));
    expect(back.state.gone).toEqual(s.gone);
  });
});

describe('refusedParams: what a save cannot keep is named, URLs never', () => {
  it('lists only plain fields holding a JWT or bearer header; URLs with user:pw@ or ?token= are kept', () => {
    expect(refusedParams({
      q: 'Bearer abc123',
      note: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
      iframe_url: 'https://user:pw@x.example/?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
      panel: 'https://x.example/?key=1&sig=2',
      size: 14,
    }).sort()).toEqual(['note', 'q']);
  });
});
