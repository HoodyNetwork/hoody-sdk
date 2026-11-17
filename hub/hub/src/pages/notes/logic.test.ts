// Vitest: the Notes rules (logic.ts) and the New note flow (flows.ts) over a fake Api.
import { describe, expect, it, vi } from 'vitest';
import type { Api, Settled } from './api';
import { checkNote, createNote } from './flows';
import { checkTitle, clean, createGuard, createOutcome, emptyIsError, emptyKinds, emptyNoneYet, emptyOpenTarget, emptyWays, fileName, listNote, newId, notesCode, parseRecent, readBack, stateOf } from './logic';
import type { Computer, CreateBody, Loaded, Rejection } from './types';

const ID = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const notesErr = (kind: string, status: number, code: string): Rejection => ({ kind, status, code, data: { code, message: 'x' } });
const c: Computer = { id: 'c1', projectId: 'p1', name: 'atlas', state: 'running' };

describe('states', () => {
  it('maps a refusal to one state per computer', () => {
    expect(stateOf({ kind: 'private', status: 403 })).toBe('protected');
    expect(stateOf(notesErr('private', 403, 'forbidden'))).toBe('notOwner');
    expect(stateOf(notesErr('private', 403, 'notebook_no_access'))).toBe('noAccess');
    expect(stateOf({ kind: 'rate_limited', status: 429 })).toBe('busy');
    expect(stateOf({ kind: 'unreachable', code: 'TIMEOUT' })).toBe('unreachable');
    expect(stateOf({ kind: 'unreachable', code: 'NETWORK' })).toBe('cantTell');
    expect(stateOf({ kind: 'unavailable', status: 502 })).toBe('unreachable');
    expect(stateOf({ kind: 'aborted' })).toBe('dropped');
    expect(stateOf({ kind: 'server', status: 500 })).toBe('unexpected');
  });
  it('trusts only Notes codes', () => {
    expect(notesCode(notesErr('bad_request', 400, 'parent_required'))).toBe('parent_required');
    expect(notesCode({ status: 400, code: 'parent_required', data: { code: 'other', message: 'x' } })).toBeNull();
  });
});

describe('titles and ids', () => {
  it('checks a title', () => {
    expect(checkTitle('  Q4 plan ')).toEqual({ value: 'Q4 plan' });
    expect(checkTitle('   ')).toEqual({ err: 'empty' });
    expect(checkTitle('a'.repeat(201))).toEqual({ err: 'long' });
    expect(checkTitle('a\u0007b')).toEqual({ err: 'control' });
  });
  it('picks an id the guard admits', () => {
    const id = newId(1_760_000_000_000, [1, 2, 3, 4, 5]);
    expect(id).toMatch(/^[0-9a-f]{22}08$/);
    expect(createGuard({ id, type: 'page', parentId: ID, attributes: { name: 'x' } })).toBe(true);
    expect(createGuard({ id: 'nope', type: 'page', parentId: ID, attributes: { name: 'x' } })).toBe(false);
  });
  it('cleans display text and names files', () => {
    expect(clean('a‮b​c\n d', 20)).toBe('abc d');
    expect(fileName('Plan: Q4/2026?')).toBe('Plan Q42026.md');
    expect(fileName('')).toBe('note.md');
  });
});

describe('recent', () => {
  it('skips a malformed row and marks the answer partial', () => {
    const r = parseRecent({ notebookId: ID, partial: false, create: null, items: [{ nodeId: ID, name: 'A', sectionName: 'S', changedAt: '2026-10-22T10:00:00Z', hasBody: true }, { nodeId: 'bad' }] }, { userId: ID, notebookId: ID, role: 'owner' });
    expect(r?.items).toHaveLength(1);
    expect(r?.partial).toBe(true);
    expect(parseRecent({ items: 'x' }, null)).toBeNull();
  });
});

describe('a read list', () => {
  it('a partial list is never called empty, even with no usable row', () => {
    expect(listNote(0, true)).toBe('partial');
    expect(listNote(3, true)).toBe('partial');
    expect(listNote(0, false)).toBe('empty');
    expect(listNote(3, false)).toBeNull();
  });
});

describe('create outcomes', () => {
  const ours = newId(1, [1, 2, 3, 4, 5]);
  it('is created only for our page', () => {
    expect(createOutcome({ ok: true, body: { id: ours, type: 'page' } }, ours)).toBe('created');
    expect(createOutcome({ ok: true, body: { id: 'other', type: 'page' } }, ours)).toBe('unknown');
  });
  it('is final only for a definite refusal', () => {
    expect(createOutcome({ ok: false, err: notesErr('private', 403, 'notebook_readonly') }, ours)).toBe('cantAdd');
    expect(createOutcome({ ok: false, err: { kind: 'private', status: 403 } }, ours)).toBe('protected');
    expect(createOutcome({ ok: false, err: notesErr('bad_request', 400, 'parent_required') }, ours)).toBe('noPlace');
    expect(createOutcome({ ok: false, err: notesErr('not_found', 404, 'notebook_not_found') }, ours)).toBe('gone');
    expect(createOutcome({ ok: false, err: notesErr('bad_request', 409, 'unknown') }, ours)).toBe('taken');
  });
  it('is unknown after anything unclear', () => {
    expect(createOutcome({ ok: false, err: { kind: 'unreachable', code: 'NETWORK' } }, ours)).toBe('unknown');
    expect(createOutcome({ ok: false, err: { kind: 'unavailable', status: 502 } }, ours)).toBe('unknown');
    expect(createOutcome({ ok: false, err: { pending: true } }, ours)).toBe('unknown');
    expect(createOutcome({ ok: false, err: { notSent: true } }, ours)).toBe('notSent');
  });
  it('never reads a read-back as created', () => {
    const sent = { id: ours, parentId: ID, name: 'x' };
    expect(readBack({ ok: true, body: { id: ours, type: 'page', parentId: ID, name: 'x' } }, sent)).toBe('matching');
    expect(readBack({ ok: false }, sent)).toBe('unsure');
  });
});

function fake(sends: Settled[], node: Settled = { ok: false, err: { kind: 'not_found', status: 404 } }) {
  const send = vi.fn(async (_c: Computer, _nb: string, _b: CreateBody): Promise<Settled> => sends.shift() ?? { ok: false, err: { kind: 'unreachable' } });
  const read = vi.fn(async () => node);
  const api: Api = { load: async () => null, send, node: read, download: async () => 'saved' };
  return { api, send, read };
}
const place = { nb: ID, parentId: ID };
let n = 0;
const env = { newId: () => newId(1000 + n++, [n, n, n, n, n]) };

describe('createNote', () => {
  it('sends once and reports created', async () => {
    const { api, send } = fake([{ ok: true, body: {} }]);
    send.mockImplementationOnce(async (_c, _nb, body): Promise<Settled> => ({ ok: true, body: { id: body.id, type: 'page' } }));
    expect((await createNote(api, c, place, 'x', env)).kind).toBe('created');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('never resends after an unknown outcome', async () => {
    const { api, send } = fake([{ ok: false, err: { kind: 'unreachable', code: 'NETWORK' } }]);
    expect((await createNote(api, c, place, 'x', env)).kind).toBe('unknown');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('mints a new id once when the id is taken', async () => {
    const taken: Settled = { ok: false, err: notesErr('bad_request', 409, 'unknown') };
    const { api, send } = fake([taken, taken]);
    const r = await createNote(api, c, place, 'x', env);
    expect(r).toEqual({ kind: 'final', outcome: 'taken' });
    expect(send).toHaveBeenCalledTimes(2);
    const ids = send.mock.calls.map((x) => x[2].id);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('holds the note before the send, so a lost answer cannot lose it', async () => {
    const order: string[] = [];
    const { api, send } = fake([{ ok: false, err: { kind: 'unreachable', code: 'NETWORK' } }]);
    send.mockImplementationOnce(async () => {
      order.push('send');
      return { ok: false, err: { kind: 'unreachable', code: 'NETWORK' } };
    });
    await createNote(api, c, place, 'x', env, { hold: () => order.push('hold') });
    expect(order).toEqual(['hold', 'send']);
  });
  it('a resend of a held note keeps its id and body, and a taken answer reads back instead of minting', async () => {
    const held = { id: ID, parentId: ID, name: 'Q4' };
    const taken: Settled = { ok: false, err: notesErr('bad_request', 409, 'unknown') };
    const { api, send } = fake([taken]);
    const seen: string[] = [];
    const r = await createNote(api, c, place, 'ignored', env, { held, hold: (x) => seen.push(x.id) });
    expect(r).toEqual({ kind: 'unknown', sent: held });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[2]).toMatchObject({ id: ID, attributes: { name: 'Q4' } });
    expect(seen).toEqual([ID]);
  });
  it('a held resend that never left, or is refused, stays unknown (held), never not sent and never released', async () => {
    const held = { id: ID, parentId: ID, name: 'Q4' };
    for (const answer of [{ ok: false, err: { kind: 'unreachable', notSent: true } }, { ok: false, err: notesErr('private', 403, 'forbidden') }] as Settled[]) {
      const { api } = fake([answer]);
      expect(await createNote(api, c, place, 'x', env, { held })).toEqual({ kind: 'unknown', sent: held });
    }
  });
  it('check again only reads', async () => {
    const { api, send, read } = fake([]);
    expect(await checkNote(api, c, ID, { id: ID, parentId: ID, name: 'x' })).toBe('unsure');
    expect(read).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the empty list', () => {
  const pc = (name: string, state: Computer['state'] = 'running'): Computer => ({ id: name, projectId: 'p', name, state });
  const ok: Loaded = { state: 'ok', me: { userId: 'u', notebookId: 'n', role: 'owner' }, recent: { items: [], partial: false, create: null } };
  it('sorts each computer by what its Notes answered, in the page order', () => {
    const cs = [pc('a'), pc('b'), pc('c', 'stopped'), pc('d'), pc('e'), pc('f', 'starting'), pc('g'), pc('h'), pc('i')];
    const loads: Record<string, Loaded | undefined> = { a: ok, b: { state: 'unreachable' }, d: { state: 'protected' }, e: { state: 'busy' }, g: { state: 'loading' }, h: { state: 'notOwner' }, i: { state: 'cantTell' }, c: ok };
    const k = emptyKinds(cs, loads);
    const ids = (x: Computer[]) => x.map((c) => c.id);
    expect(ids(k.none)).toEqual(['a']);
    expect(ids(k.failed)).toEqual(['b', 'e', 'i']);
    // Not running wins over whatever an older read said.
    expect(ids(k.off)).toEqual(['c', 'f']);
    expect(ids(k.blocked)).toEqual(['d', 'h']);
    // Not asked yet, or asked and waiting.
    expect(ids(k.reading)).toEqual(['g']);
  });
  it('each of the other states is a kind: unexpected fails, older, noAccess block', () => {
    const k = emptyKinds([pc('x'), pc('y'), pc('z')], { x: { state: 'unexpected' }, y: { state: 'older' }, z: { state: 'noAccess' } });
    expect(k.failed.map((c) => c.id)).toEqual(['x']);
    expect(k.blocked.map((c) => c.id)).toEqual(['y', 'z']);
  });
  it('a list marked partial is not "no notes": some rows were left out, so it fails (Try again), even when empty', () => {
    const part: Loaded = { state: 'ok', me: { userId: 'u', notebookId: 'n', role: 'owner' }, recent: { items: [], partial: true, create: null } };
    const k = emptyKinds([pc('p'), pc('q')], { p: part, q: ok });
    expect(k.failed.map((c) => c.id)).toEqual(['p']);
    expect(k.none.map((c) => c.id)).toEqual(['q']);
    expect(emptyNoneYet(k, 0)).toBe(false);
  });
  it('"No notes yet" only when every computer answered with its whole list and none holds a note: not with one that failed, is blocked, still reading or not running', () => {
    const e = { none: [], failed: [], off: [], blocked: [], reading: [] };
    expect(emptyNoneYet({ ...e, none: [pc('a')] }, 0)).toBe(true);
    // A stopped computer may hold notes.
    expect(emptyNoneYet({ ...e, none: [pc('a')], off: [pc('b', 'stopped')] }, 0)).toBe(false);
    expect(emptyNoneYet({ ...e, none: [pc('a')], failed: [pc('b')] }, 0)).toBe(false);
    expect(emptyNoneYet({ ...e, none: [pc('a')], blocked: [pc('b')] }, 0)).toBe(false);
    expect(emptyNoneYet({ ...e, none: [pc('a')], reading: [pc('b')] }, 0)).toBe(false);
    expect(emptyNoneYet({ ...e, off: [pc('b', 'stopped')] }, 0)).toBe(false);
    // Computers past the ones the page reads were never asked.
    expect(emptyNoneYet({ ...e, none: [pc('a')] }, 2)).toBe(false);
  });
  it('the ways on: New note first, then Try again, Computers, Open Notes; at most two', () => {
    const k = (o: Partial<Record<'failed' | 'off', number>>) => ({ none: [], reading: [], blocked: [], failed: Array.from({ length: o.failed ?? 0 }, (_, i) => pc(`f${i}`)), off: Array.from({ length: o.off ?? 0 }, (_, i) => pc(`o${i}`, 'stopped')) });
    const all = { canNew: true, computers: true, open: true };
    expect(emptyWays(k({ failed: 1, off: 1 }), all)).toEqual(['new', 'retry']);
    expect(emptyWays(k({ failed: 1, off: 1 }), { ...all, canNew: false })).toEqual(['retry', 'computers']);
    expect(emptyWays(k({ off: 2 }), { ...all, canNew: false })).toEqual(['computers', 'open']);
    expect(emptyWays(k({ off: 2 }), { canNew: false, computers: false, open: true })).toEqual(['open']);
    expect(emptyWays(k({}), { canNew: false, computers: true, open: false })).toEqual([]);
    expect(emptyWays(k({}), { ...all, canNew: false })).toEqual(['open']);
  });
  it("Open Notes opens a protected or older computer's Notes first, else one that answered with none; never a failed, stopped or owner-only one, and only with an address", () => {
    const loads: Record<string, Loaded | undefined> = { n1: ok, n2: ok, pr: { state: 'protected' }, ol: { state: 'older' }, no: { state: 'notOwner' }, fa: { state: 'unreachable' } };
    const kinds = (o: Partial<Record<'none' | 'blocked' | 'failed' | 'off', string[]>>) => ({ reading: [], none: (o.none ?? []).map((x) => pc(x)), blocked: (o.blocked ?? []).map((x) => pc(x)), failed: (o.failed ?? []).map((x) => pc(x)), off: (o.off ?? []).map((x) => pc(x, 'stopped')) });
    const url = (c: Computer) => (c.id === 'n1' || c.id === 'nourl' ? null : `https://${c.id}.example/`);
    expect(emptyOpenTarget(kinds({ none: ['n2'], blocked: ['no', 'ol'] }), loads, url)?.id).toBe('ol');
    expect(emptyOpenTarget(kinds({ none: ['n2'], blocked: ['pr'] }), loads, url)?.id).toBe('pr');
    // A computer that answered with none and has an address: its own Notes is a way on (the old list offered it).
    expect(emptyOpenTarget(kinds({ none: ['n1', 'n2'], blocked: ['no'] }), loads, url)?.id).toBe('n2');
    expect(emptyOpenTarget(kinds({ none: ['n1'], blocked: ['no'], failed: ['fa'], off: ['st'] }), loads, url)).toBeUndefined();
  });
});


describe('emptyIsError', () => {
  const c = (id: string, state = 'running') => ({ id, name: id, state }) as unknown as Parameters<typeof emptyKinds>[0][number];
  it('is an error only when every running computer failed to give its list', () => {
    const failed = { state: 'unreachable' } as never;
    const ok = { state: 'ok', recent: { partial: false } } as never;
    expect(emptyIsError(emptyKinds([c('a'), c('b', 'stopped')], { a: failed }))).toBe(true);
    expect(emptyIsError(emptyKinds([c('a'), c('b')], { a: failed, b: ok }))).toBe(false);
    expect(emptyIsError(emptyKinds([c('a'), c('b')], { a: failed }))).toBe(false); // b is still being read
    expect(emptyIsError(emptyKinds([c('b', 'stopped')], {}))).toBe(false);
  });
});
