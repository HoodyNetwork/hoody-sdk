// New TODO's pure parts and its one store. The limits are the agent's (create.ts head, with file:line): the form
// refuses what the agent would cut. The store sends once; a lost answer is never sent again and is settled only by the
// person's pick among look-alikes (same title, details and folder, made since the send).
import { bump, setRealm } from '@core/ctx';
import { boot } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BODY_MAX, EMPTY_TODO, SKEW_MS, identityOf, ledgerSizesForTests, resetLedgerForTests, TAGS_MAX, TAG_MAX, TITLE_MAX, bodyOf, createTodoStore, lookalikes, problemsOf, runes, tagsOf,
  type CreateApi, type NewTodoBody, type Settled, type TodoDraft,
} from './create';

beforeEach(() => {
  boot({ realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' });
  resetLedgerForTests();
});

const d = (o: Partial<TodoDraft> = {}): TodoDraft => ({ ...EMPTY_TODO, title: 'Rotate the keys', cwd: '/home/ada/shop', ...o });

describe('the form: the agent\'s limits, refused instead of cut', () => {
  it('the limits are the agent\'s own numbers, never guessed', () => {
    expect([TITLE_MAX, BODY_MAX, TAGS_MAX, TAG_MAX]).toEqual([200, 1024, 12, 40]);
    expect(problemsOf(d({ title: 'x'.repeat(200) }))).toEqual([]);
    expect(problemsOf(d({ title: 'x'.repeat(201) }))).toEqual(['titleLong']);
    expect(problemsOf(d({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`).join(',') }))).toEqual(['tagsMany']);
    expect(problemsOf(d({ tags: 'z'.repeat(41) }))).toEqual(['tagLong']);
    expect(problemsOf(d({ details: 'y'.repeat(1025) }))).toEqual(['detailsLong']);
  });
  it('a title is required and at most 200 runes, counted as the agent counts them', () => {
    expect(problemsOf(d({ title: '  ' }))).toEqual(['title']);
    expect(problemsOf(d({ title: 'x'.repeat(TITLE_MAX) }))).toEqual([]);
    expect(problemsOf(d({ title: 'x'.repeat(TITLE_MAX + 1) }))).toEqual(['titleLong']);
    // An emoji is one rune to the agent (two UTF-16 units here).
    expect(runes('😀')).toBe(1);
    expect(problemsOf(d({ title: '😀'.repeat(TITLE_MAX) }))).toEqual([]);
    expect(problemsOf(d({ title: ` ${'x'.repeat(TITLE_MAX)} ` })), 'the ends are trimmed before counting').toEqual([]);
  });
  it('details are optional and at most 1024 runes', () => {
    expect(problemsOf(d({ details: 'y'.repeat(BODY_MAX) }))).toEqual([]);
    expect(problemsOf(d({ details: 'y'.repeat(BODY_MAX + 1) }))).toEqual(['detailsLong']);
  });
  it('tags as the agent keeps them: trimmed, leading # dropped, empty and repeated ones dropped; at most 12 of at most 40 runes', () => {
    expect(tagsOf(' #ops, ops , ,##db,db')).toEqual(['ops', 'db']);
    expect(problemsOf(d({ tags: Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`).join(',') }))).toEqual([]);
    expect(problemsOf(d({ tags: Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`).join(',') }))).toEqual(['tagsMany']);
    expect(problemsOf(d({ tags: 'z'.repeat(TAG_MAX) }))).toEqual([]);
    expect(problemsOf(d({ tags: 'z'.repeat(TAG_MAX + 1) }))).toEqual(['tagLong']);
  });
  it('priority is a whole number 0..4', () => {
    for (const p of [0, 1, 2, 3, 4]) expect(problemsOf(d({ priority: p }))).toEqual([]);
    for (const p of [-1, 5, 1.5, Number.NaN]) expect(problemsOf(d({ priority: p })), String(p)).toEqual(['priority']);
  });
  it('the folder is required and absolute (stricter than the agent, which refuses only an empty one)', () => {
    expect(problemsOf(d({ cwd: '' }))).toEqual(['cwd']);
    expect(problemsOf(d({ cwd: 'shop' }))).toEqual(['cwd']);
    expect(problemsOf(d({ cwd: '~/shop' }))).toEqual(['cwd']);
    expect(problemsOf(d({ cwd: '/a\u0007b' }))).toEqual(['cwd']);
    expect(problemsOf(d({ cwd: '/' }))).toEqual([]);
  });
  it('the body: a trimmed title, details and tags only when given, the priority as a number', () => {
    expect(bodyOf(d())).toEqual({ title: 'Rotate the keys', priority: 2, cwd: '/home/ada/shop' });
    expect(bodyOf(d({ title: ' A ', details: ' why \n', tags: '#x, y', priority: 0 }))).toEqual({ title: 'A', body: 'why', priority: 0, tags: ['x', 'y'], cwd: '/home/ada/shop' });
    expect(bodyOf(d({ title: '' }))).toBeNull();
  });
});

const SENT: NewTodoBody = { title: 'Rotate the keys', body: 'Before Friday', priority: 2, cwd: '/home/ada/shop' };
const T0 = Date.parse('2026-11-08T22:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const row = (o: Record<string, unknown>) => ({ id: 'todo_x', num: 9, title: SENT.title, body: SENT.body, cwd: SENT.cwd, created_at: at(1000), ...o });

describe('a lost filing\'s look-alikes', () => {
  it('only open TODOs with the same title, details and folder, made since the send (clock skew allowed), newest first', () => {
    const items = [
      row({ id: 'a', num: 1, created_at: at(-SKEW_MS - 1) }),
      row({ id: 'b', num: 2, created_at: at(-SKEW_MS) }),
      row({ id: 'c', num: 3, created_at: at(5000) }),
      row({ id: 'd', num: 4, body: 'Other words' }),
      row({ id: 'e', num: 5, cwd: '/home/ada' }),
      row({ id: 'f', num: 6, title: 'Rotate the key' }),
    ];
    expect(lookalikes(items, SENT, T0).map((x) => x.id)).toEqual(['c', 'b']);
    expect(lookalikes([row({ body: undefined })], { ...SENT, body: undefined }, T0).map((x) => x.id), 'no details matches none').toEqual(['todo_x']);
  });
  it('the window is approximate: an identical TODO from a minute before the send shows as a possible look-alike; an older one, which a deduped filing may have answered with, does not', () => {
    const recent = row({ id: 'recent', created_at: at(-60_000) });
    const older = row({ id: 'older', created_at: at(-10 * 60_000) });
    expect(lookalikes([recent, older], SENT, T0).map((x) => x.id)).toEqual(['recent']);
  });
});

function fakeApi(o: { create?: () => Settled | Promise<Settled>; list?: () => { ok: true; items: Record<string, unknown>[] } | { ok: false } } = {}) {
  const sent: NewTodoBody[] = [];
  let lists = 0;
  const api: CreateApi = {
    create: async (b) => { sent.push(b); return o.create ? o.create() : { ok: true, body: { status: 'ok', todo: { id: 'todo_new', num: 12 }, deduped: false } }; },
    list: async () => { lists++; return o.list ? o.list() : { ok: true, items: [] }; },
  };
  return { api, sent, lists: () => lists };
}
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };

describe('the store: sent once, never again', () => {
  it('an answer names the TODO; deduped says nothing new was filed', async () => {
    const f = fakeApi();
    const s = createTodoStore({ api: f.api, now: () => T0 });
    await s.send(SENT);
    expect(s.view()).toMatchObject({ phase: 'done', todo: { id: 'todo_new', num: 12 }, deduped: false });
    await s.send(SENT);
    expect(f.sent, 'a done filing is never sent again').toHaveLength(1);
    const g = fakeApi({ create: () => ({ ok: true, body: { status: 'ok', todo: { id: 'todo_old', num: 3 }, deduped: true } }) });
    const s2 = createTodoStore({ api: g.api });
    await s2.send(SENT);
    expect(s2.view()).toMatchObject({ phase: 'done', todo: { id: 'todo_old', num: 3 }, deduped: true });
  });
  it('a refusal keeps nothing out; clear goes back to idle so the form can send again', async () => {
    const f = fakeApi({ create: () => ({ ok: false, err: { kind: 'failed', code: 'bad_request', status: 400 } }) });
    const s = createTodoStore({ api: f.api });
    await s.send(SENT);
    expect(s.view().phase).toBe('refused');
    s.clear();
    expect(s.view().phase).toBe('idle');
  });
  it('a lost answer (or a 2xx naming no TODO) is unsure and never sent again; Check again only reads', async () => {
    for (const create of [() => lost, (): Settled => ({ ok: true, body: { status: 'ok' } })]) {
      const f = fakeApi({ create, list: () => ({ ok: true, items: [row({ id: 'c', num: 3, created_at: at(5000) }), row({ id: 'b', num: 2, created_at: at(10) })] }) });
      const s = createTodoStore({ api: f.api, now: () => T0 });
      await s.send(SENT);
      expect(s.view().phase).toBe('unsure');
      await s.send(SENT);
      await s.check();
      expect(f.sent).toHaveLength(1);
      expect(f.lists()).toBe(1);
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'read' });
      expect(s.view().lookalikes.map((x) => x.id), 'every match, newest first: the page says how many').toEqual(['c', 'b']);
      s.pick('nope');
      expect(s.view().phase).toBe('unsure');
      s.pick('b');
      expect(s.view()).toMatchObject({ phase: 'done', todo: { id: 'b', num: 2 }, picked: true });
    }
  });
  it('after Stop tracking, the same words are never sent again (they may still be filed); changed words are a new TODO', async () => {
    const f = fakeApi({ create: () => lost });
    const s = createTodoStore({ api: f.api, now: () => T0 });
    await s.send(SENT);
    s.forget();
    expect(s.mayBeFiled(SENT)).toBe(true);
    await s.send({ ...SENT });
    expect(f.sent, 'the identical body is refused').toHaveLength(1);
    expect(s.view().phase).toBe('idle');
    const other = { ...SENT, title: 'Rotate the keys today' };
    expect(s.mayBeFiled(other)).toBe(false);
    await s.send(other);
    expect(f.sent.map((b) => b.title)).toEqual([SENT.title, other.title]);
  });
  it('the guard is the agent\'s filing identity: priority, tags, title case and whitespace runs do not make a new filing; other words do', async () => {
    const f = fakeApi({ create: () => lost });
    const s = createTodoStore({ api: f.api, now: () => T0 });
    await s.send(SENT);
    s.forget();
    for (const same of [{ ...SENT, priority: 0 }, { ...SENT, tags: ['x'] }, { ...SENT, title: 'ROTATE  the keys' }, { ...SENT, body: ' Before\n\nFriday ' }]) {
      expect(s.mayBeFiled(same), JSON.stringify(same)).toBe(true);
    }
    expect(identityOf({ title: 'a\ufeffb', cwd: '/', body: '' }), 'U+FEFF is not Go whitespace').not.toBe(identityOf({ title: 'a b', cwd: '/', body: '' }));
    for (const other of [{ ...SENT, title: 'Rotate the key' }, { ...SENT, body: 'After Friday' }, { ...SENT, cwd: '/home/ada' }]) {
      expect(s.mayBeFiled(other), JSON.stringify(other)).toBe(false);
    }
  });
  it('the guard and an unsure filing outlive the store that sent it: a new store in the same place opens unsure, takes the late answer, and a forgotten one stays refused', async () => {
    let answer!: (r: Settled) => void;
    const f = fakeApi({ create: () => new Promise<Settled>((res) => { answer = res; }) });
    const first = createTodoStore({ api: f.api, now: () => T0 });
    void first.send(SENT);
    const second = createTodoStore({ api: f.api, now: () => T0 });
    expect(second.view().phase, 'a filing still out is the new store\'s too').toBe('unsure');
    await second.send(SENT);
    answer(lost);
    await Promise.resolve();
    expect(second.view().phase).toBe('unsure');
    second.forget();
    const third = createTodoStore({ api: f.api, now: () => T0 });
    expect(third.view().phase).toBe('idle');
    expect(third.mayBeFiled(SENT)).toBe(true);
    await third.send(SENT);
    expect(f.sent, 'sent once across three stores').toHaveLength(1);
  });
  it('a late definite answer reaches the store tracking it', async () => {
    let answer!: (r: Settled) => void;
    const f = fakeApi({ create: () => new Promise<Settled>((res) => { answer = res; }) });
    const first = createTodoStore({ api: f.api, now: () => T0 });
    void first.send(SENT);
    const second = createTodoStore({ api: f.api, now: () => T0 });
    answer({ ok: true, body: { status: 'ok', todo: { id: 'todo_late', num: 7 }, deduped: false } });
    await new Promise((r) => setTimeout(r, 0));
    expect(second.view()).toMatchObject({ phase: 'done', todo: { id: 'todo_late', num: 7 } });
    expect(second.mayBeFiled(SENT), 'a definite answer releases the guard').toBe(false);
  });
  it('a check whose read fails says so and keeps it unsure; Stop tracking forgets it and sends nothing', async () => {
    const f = fakeApi({ create: () => lost, list: () => ({ ok: false }) });
    const s = createTodoStore({ api: f.api, now: () => T0 });
    await s.send(SENT);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'failed', lookalikes: [] });
    s.forget();
    expect(s.view().phase).toBe('idle');
    expect(f.sent).toHaveLength(1);
  });
  it('Stop tracking is never undone by count: after 40 forgotten filings the first is still refused', async () => {
    const f = fakeApi({ create: () => lost });
    const s = createTodoStore({ api: f.api, now: () => T0 });
    for (let i = 0; i < 40; i++) {
      await s.send({ ...SENT, title: `Rotate key ${i}` });
      s.forget();
    }
    const again = createTodoStore({ api: f.api, now: () => T0 });
    expect(again.mayBeFiled({ ...SENT, title: 'Rotate key 0' })).toBe(true);
    await again.send({ ...SENT, title: 'Rotate key 0' });
    expect(f.sent).toHaveLength(40);
  });
  it('a late lost answer never undoes Stop tracking: a new store opens idle, the words stay refused', async () => {
    let answer!: (r: Settled) => void;
    const f = fakeApi({ create: () => new Promise<Settled>((res) => { answer = res; }) });
    const first = createTodoStore({ api: f.api, now: () => T0 });
    void first.send(SENT);
    const second = createTodoStore({ api: f.api, now: () => T0 });
    second.forget();
    answer(lost);
    await new Promise((r) => setTimeout(r, 0));
    const third = createTodoStore({ api: f.api, now: () => T0 });
    expect(third.view().phase, 'not tracked again').toBe('idle');
    expect(third.mayBeFiled(SENT)).toBe(true);
    expect(second.view().phase).toBe('idle');
  });
  it('every store tracking one filing hears a pick or Stop tracking in another', async () => {
    const items = [row({ id: 'b', num: 2, created_at: at(10) })];
    const f = fakeApi({ create: () => lost, list: () => ({ ok: true, items }) });
    const a = createTodoStore({ api: f.api, now: () => T0 });
    await a.send(SENT);
    const b = createTodoStore({ api: f.api, now: () => T0 });
    expect(b.view().phase).toBe('unsure');
    await a.check();
    a.pick('b');
    expect(b.view(), 'the other store shows the pick').toMatchObject({ phase: 'done', todo: { id: 'b', num: 2 }, picked: true });
    expect(b.mayBeFiled(SENT), 'a pick settles it').toBe(false);
    const other = { ...SENT, title: 'Rotate the keys again' };
    a.clear();
    const c = createTodoStore({ api: f.api, now: () => T0 });
    await c.send(other);
    const d2 = createTodoStore({ api: f.api, now: () => T0 });
    expect(d2.view().phase).toBe('unsure');
    c.forget();
    expect(d2.view().phase, 'Stop tracking in one drawer stops it in the other').toBe('idle');
    expect(d2.mayBeFiled(other)).toBe(true);
  });
  it('the title is lowercased as Go does: İ is i, a final sigma is σ', () => {
    const id = (title: string) => identityOf({ title, cwd: '/', body: '' });
    expect(id('İ')).toBe(id('i'));
    expect(id('ΟΔΟΣ')).toBe(id('οδοσ'));
    expect(id('ΟΔΟΣ')).not.toBe(id('οδος'));
  });
  it('a store whose context ended stops tracking when it ends: switching away and back around one unsure filing keeps one tracker, the filing stays unsure and refused', async () => {
    const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
    const f = fakeApi({ create: () => lost });
    const first = createTodoStore({ api: f.api, now: () => T0 });
    await first.send(SENT);
    expect(ledgerSizesForTests()).toEqual({ places: 1, trackers: 1 });
    let live = first;
    for (let i = 0; i < 5; i++) {
      setRealm('global'); bump('switch');
      expect(ledgerSizesForTests(), `switch ${i}: the ended store goes at once, the filing stays`).toEqual({ places: 1, trackers: 0 });
      setRealm(R1); bump('switch');
      live = createTodoStore({ api: f.api, now: () => T0 });
      expect(live.view().phase, `switch ${i}: back in the place, it opens unsure`).toBe('unsure');
      expect(ledgerSizesForTests(), `switch ${i}: only the live store tracks it`).toEqual({ places: 1, trackers: 1 });
    }
    expect(live.mayBeFiled(SENT), 'never settled by a switch: still refused').toBe(true);
    await live.send(SENT);
    expect(f.sent).toHaveLength(1);
    live.forget();
    expect(first.view().phase, 'an ended store is told nothing').toBe('unsure');
  });
  it('nothing is kept once settled: no tracker and no empty place after a definite answer or a pick', async () => {
    const f = fakeApi();
    const s = createTodoStore({ api: f.api, now: () => T0 });
    await s.send(SENT);
    expect(ledgerSizesForTests()).toEqual({ places: 0, trackers: 0 });
    const g = fakeApi({ create: () => lost, list: () => ({ ok: true, items: [row({ id: 'b', num: 2 })] }) });
    const t = createTodoStore({ api: g.api, now: () => T0 });
    await t.send(SENT);
    createTodoStore({ api: g.api, now: () => T0 });
    expect(ledgerSizesForTests()).toEqual({ places: 1, trackers: 2 });
    await t.check();
    t.pick('b');
    expect(ledgerSizesForTests()).toEqual({ places: 0, trackers: 0 });
  });
});
