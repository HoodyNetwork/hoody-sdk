// The stored records that hold request evidence keep their field names through the computer
// rename: hub_ai_req_v1 entries `ct`, hub_ai_journal_v1 / the ask store records `c`, hub_ai_mig_v1 group tuples
// [h, r, s, c, ct, at], hub.v3.script-asks `compId` (asks and drafts). Each golden below is the JSON text the build before
// the rename wrote; the renamed build must read it whole (request evidence, tombstones, unsettled decisions and
// idempotency keys survive), and what it writes back keeps the same names.
import { describe, expect, it } from 'vitest';
import { validRec, parseStore } from '../logic';
import { validEntry } from './entries';
import { parseMig, members } from './migstore';
import { validScriptAsk, validDraftRecord } from '../../core/script-asks';

const K32 = (n: string) => 'hx-' + n.repeat(32).slice(0, 32);
const K24 = (n: string) => 'hx-' + n.repeat(24).slice(0, 24);
const REALM = '0123456789abcdef01234567';
const wire = (s: string): unknown => JSON.parse(s);

describe('hub_ai_req_v1 entries keep ct', () => {
  const golden = JSON.stringify({ k: K24('a'), kind: 'decision', h: 'atlas.4f2a', r: REALM, s: 'sess-1', c: K32('b'), ct: 'c1d2e3f4a5b6c7d8e9f0a1b2', g: 'gate-9', gn: 2, at: 1_700_000_000_000 });
  it('reads a golden entry whole', () => {
    const e = validEntry(wire(golden))!;
    expect(e).not.toBeNull();
    expect(e.ct).toBe('c1d2e3f4a5b6c7d8e9f0a1b2');
    expect(e).toEqual(wire(golden));
  });
  it('an entry with ct missing is not an entry (the field is required)', () => {
    const { ct: _ct, ...rest } = wire(golden) as Record<string, unknown>;
    expect(validEntry(rest)).toBeNull();
    expect(validEntry({ ...rest, computer: 'c1d2e3f4a5b6c7d8e9f0a1b2' })).toBeNull();
  });
});

describe('the ask store / journal records keep c', () => {
  const rec = { p: 'p1', c: 'c1d2e3f4a5b6c7d8e9f0a1b2', r: REALM, s: 'sess-1', t: 'turn-1', k1: K32('1'), k2: K32('2'), rc: 'hello', n: 'abcde12345', at: 5, i: null, q: 3, ph: 'working', l: 'en', k3: [K32('3')], dk: [K32('4')] };
  it('reads a golden record whole: its computer id (c), its unsettled keys and its dismissals', () => {
    const r = validRec(wire(JSON.stringify(rec)))!;
    expect(r).not.toBeNull();
    expect(r.c).toBe(rec.c);
    expect(r.k3).toEqual(rec.k3);
    expect(r.dk).toEqual(rec.dk);
  });
  it('the store text round-trips with the same names', () => {
    const text = JSON.stringify({ v: 1, a: { u1: [rec] } });
    const s = parseStore(text);
    expect(s.a.u1).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(s))).toEqual({ v: 1, a: { u1: [expect.objectContaining({ c: rec.c })] } });
  });
});

describe('hub_ai_mig_v1 keeps its group tuple [h, r, s, c, ct, at]', () => {
  const golden = JSON.stringify({ v: 1, g: [['atlas.4f2a', REALM, 'sess-1', K32('b'), 'c1d2e3f4a5b6c7d8e9f0a1b2', 1_700_000_000_000]], m: { 'AAAAAAAAAAAAAAAAAAAAAA': '0dgate-9' }, t: { '19000': '' } });
  it('reads a golden document: the group, the member (an unsettled decision) and the tombstone bucket', () => {
    const m = parseMig(wire(golden));
    expect(m).not.toBeNull();
    expect(m!.g[0]).toEqual(['atlas.4f2a', REALM, 'sess-1', K32('b'), 'c1d2e3f4a5b6c7d8e9f0a1b2', 1_700_000_000_000]);
    expect(Object.keys(m!.m)).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(m))).toEqual(wire(golden));
    expect(typeof members).toBe('function');
  });
  it('a tuple of another length is not read', () => {
    const bad = wire(golden) as { g: unknown[][] };
    bad.g[0]!.pop();
    expect(parseMig(bad)).toBeNull();
  });
});

describe('hub.v3.script-asks keeps compId (asks and drafts)', () => {
  const ask = { askId: 'ask-1', compId: 'c1d2e3f4a5b6c7d8e9f0a1b2', path: '/w/shop', realm: REALM, owner: 'fp-1', sessionId: 's-1', turnId: 't-1', phase: 'turn', sentAt: 1_700_000_000_000, createKey: K32('5'), turnKey: K32('6') };
  const draft = { draftId: 'abcde12345', mode: 'ai', project: 'p1', compId: 'c1d2e3f4a5b6c7d8e9f0a1b2', realm: REALM, owner: 'fp-1', exec: 1, current: 2, retained: null, state: 'open', deploy: null, updatedAt: 1_700_000_000_000 };
  it('reads a golden ask and a golden draft whole', () => {
    expect(validScriptAsk(wire(JSON.stringify(ask)))).toBe(true);
    expect(validDraftRecord(wire(JSON.stringify(draft)))).toBe(true);
  });
  it('a record spelling the id another way is not a record (the shape is exact)', () => {
    const { compId, ...a } = ask;
    expect(validScriptAsk({ ...a, computerId: compId })).toBe(false);
    const { compId: c2, ...d } = draft;
    expect(validDraftRecord({ ...d, computer: c2 })).toBe(false);
  });
});
