// Vitest: Upload's pure rules (upload.ts).
import { describe, expect, it } from 'vitest';
import type { FileUploadOutcome } from '@core';
import { checkOf, LIMITS, MAX_UNKNOWN, metaOf, planOf, sendName, verdictOf, type UploadEntry } from './upload';

const GiB = 1024 ** 3;
const SHA = 'a'.repeat(64);
const entry: UploadEntry = { id: 'b:0:x', path: '/tmp/a.txt', size: 3, sha256: SHA, phase: 'unknown' };
const file = (name: string) => ({ name, dir: false, size: 3, modified: 0 }) as never;
const dir = (name: string) => ({ name, dir: true, size: null, modified: 0 }) as never;
const meta = { v: 1, batch: 'b1', computer: 'c1', computerName: 'atlas', folder: '/tmp', files: [entry], left: 2 };

describe('planOf', () => {
  it('a free name goes as it is; a taken one offers Keep both (create only) or Skip', () => {
    const p = planOf('/tmp', ['a.txt'], [{ name: 'a.txt', size: 3 }, { name: 'b.txt', size: 4 }]);
    expect(p.problem).toBeNull();
    expect(p.bytes).toBe(7);
    expect(p.rows[0]).toMatchObject({ i: 0, taken: true, keepAs: 'a-1.txt', bad: null });
    expect(p.rows[1]).toMatchObject({ i: 1, taken: false, keepAs: null, bad: null });
    expect(sendName(p.rows[0]!, 'keep')).toBe('a-1.txt');
    expect(sendName(p.rows[0]!, 'skip')).toBeNull();
    expect(sendName(p.rows[1]!, 'skip')).toBe('b.txt');
  });
  it('names earlier rows will write count as taken for the later ones (two picks of one name never collide)', () => {
    const p = planOf('/tmp', ['a.txt'], [{ name: 'a.txt', size: 1 }, { name: 'a.txt', size: 1 }, { name: 'c.txt', size: 1 }, { name: 'c.txt', size: 1 }]);
    expect(p.rows.map((r) => sendName(r, 'keep'))).toEqual(['a-1.txt', 'a-2.txt', 'c.txt', 'c-1.txt']);
    const s = planOf('/tmp', ['a.txt'], [{ name: 'a.txt', size: 1 }, { name: 'a.txt', size: 1 }, { name: 'c.txt', size: 1 }, { name: 'c.txt', size: 1 }], 'skip');
    expect(s.rows.map((r) => sendName(r, 'skip'))).toEqual([null, null, 'c.txt', null]);
  });
  it('Skip reserves no Keep-both name: a pick whose name is free is sent even when it equals a skipped row\'s name-1', () => {
    const picked = [{ name: 'a.txt', size: 1 }, { name: 'a-1.txt', size: 1 }];
    const s = planOf('/tmp', ['a.txt'], picked, 'skip');
    expect(s.rows.map((r) => sendName(r, 'skip'))).toEqual([null, 'a-1.txt']);
    // With Keep both the first takes a-1.txt, so the second becomes a-1-1.txt (never two writes of one name).
    const k = planOf('/tmp', ['a.txt'], picked, 'keep');
    const sent = k.rows.map((r) => sendName(r, 'keep'));
    expect(sent[0]).toBe('a-1.txt');
    expect(new Set(sent).size).toBe(2);
  });
  it('a name the program refuses, or a file over 10 GiB, is never sent', () => {
    const p = planOf('/tmp', [], [{ name: 'bad\nname', size: 1 }, { name: ' lead', size: 1 }, { name: 'big.iso', size: LIMITS.fileBytes + 1 }, { name: 'edge.iso', size: LIMITS.fileBytes }]);
    expect(p.rows.map((r) => r.bad)).toEqual(['chars', 'spaces', 'tooBig', null]);
    expect(p.rows.map((r) => sendName(r, 'keep'))).toEqual([null, null, null, 'edge.iso']);
  });
  it('a taken name with no free Keep-both name is not sent', () => {
    const taken = ['a.txt', ...Array.from({ length: 999 }, (_, k) => `a-${k + 1}.txt`)];
    const p = planOf('/tmp', taken, [{ name: 'a.txt', size: 1 }]);
    expect(p.rows[0]).toMatchObject({ taken: true, keepAs: null, bad: 'noKeepName' });
  });
  it('a folder too deep for core: every name is refused (deep), nothing sent', () => {
    const deep = '/a/b/c/d/e/f/g/h';
    const p = planOf(deep, [], [{ name: 'x', size: 1 }]);
    expect(p.rows[0]!.bad).not.toBeNull();
    expect(sendName(p.rows[0]!, 'keep')).toBeNull();
  });
  it('the batch limits: empty, over 5,000 files, over 50 GiB; at the limit is fine', () => {
    expect(planOf('/tmp', [], []).problem).toBe('empty');
    const many = (n: number) => Array.from({ length: n }, (_, k) => ({ name: `f${k}`, size: 0 }));
    expect(planOf('/tmp', [], many(LIMITS.files)).problem).toBeNull();
    expect(planOf('/tmp', [], many(LIMITS.files + 1)).problem).toBe('tooMany');
    const sized = (n: number, size: number) => Array.from({ length: n }, (_, k) => ({ name: `f${k}`, size }));
    expect(planOf('/tmp', [], sized(5, 10 * GiB)).problem).toBeNull();
    expect(planOf('/tmp', [], [...sized(5, 10 * GiB), { name: 'one', size: 1 }]).problem).toBe('tooBig');
    expect(MAX_UNKNOWN).toBe(10);
  });
});

describe('verdictOf', () => {
  const refusal = (status: number, code: string | null = 'X') => ({ outcome: 'refusal', rejection: { status, code } }) as unknown as FileUploadOutcome;
  it('2xx done; 412 taken (nothing written); 400/403/404/409/413 refused before anything was written', () => {
    expect(verdictOf({ outcome: 'done', status: 201, data: {} } as unknown as FileUploadOutcome)).toEqual({ at: 'done' });
    expect(verdictOf(refusal(412))).toEqual({ at: 'taken' });
    for (const s of [400, 403, 404, 409, 413]) expect(verdictOf(refusal(s, 'K'))).toEqual({ at: 'refused', code: 'K' });
    expect(verdictOf(refusal(403, null))).toEqual({ at: 'refused', code: '403' });
  });
  it('every other answer, and no answer, is unknown (it may have gone through)', () => {
    for (const s of [401, 408, 422, 429, 500, 502, 503, 507]) expect(verdictOf(refusal(s)).at).toBe('unknown');
    for (const why of ['network', 'timeout', 'aborted', 'redirected', 'stale']) expect(verdictOf({ outcome: 'unknown', why } as unknown as FileUploadOutcome)).toEqual({ at: 'unknown', why });
  });
  it('not sent stays not sent, with its code', () => {
    expect(verdictOf({ outcome: 'not_sent', code: 'aborted' } as unknown as FileUploadOutcome)).toEqual({ at: 'notSent', code: 'aborted' });
  });
});

describe('checkOf (Check again, reads only)', () => {
  const whole = (...entries: never[]) => ({ entries, whole: true });
  const cut = (...entries: never[]) => ({ entries, whole: false });
  it('waits for the listing, then for the SHA-256 when the name is there', () => {
    expect(checkOf(entry, undefined, undefined)).toEqual({ at: 'reading', hash: false });
    expect(checkOf(entry, whole(file('a.txt')), undefined)).toEqual({ at: 'reading', hash: true });
  });
  it('absent: not uploaded; same SHA-256: uploaded; other bytes or a folder: another item has the name', () => {
    expect(checkOf(entry, whole(file('b.txt')), undefined)).toEqual({ at: 'absent' });
    expect(checkOf(entry, whole(file('a.txt')), SHA)).toEqual({ at: 'uploaded' });
    expect(checkOf(entry, whole(file('a.txt')), 'b'.repeat(64))).toEqual({ at: 'other' });
    expect(checkOf(entry, whole(dir('a.txt')), undefined)).toEqual({ at: 'other' });
  });
  it('a failed read decides nothing', () => {
    expect(checkOf(entry, 'failed', undefined)).toEqual({ at: 'failed' });
    expect(checkOf(entry, whole(file('a.txt')), 'failed')).toEqual({ at: 'failed' });
  });
  it('a listing that leaves an entry out proves no absence; what it shows still decides', () => {
    expect(checkOf(entry, cut(file('b.txt')), undefined)).toEqual({ at: 'failed' });
    expect(checkOf(entry, cut(file('a.txt')), undefined)).toEqual({ at: 'reading', hash: true });
    expect(checkOf(entry, cut(file('a.txt')), SHA)).toEqual({ at: 'uploaded' });
    expect(checkOf(entry, cut(dir('a.txt')), undefined)).toEqual({ at: 'other' });
  });
});

describe('metaOf (the hold read back strictly)', () => {
  it('reads a whole meta back', () => {
    expect(metaOf(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
  });
  it('anything else is null (only the warned Stop tracking frees such a hold)', () => {
    const bad: unknown[] = [
      null, 'x', { ...meta, v: 2 }, { ...meta, batch: '' }, { ...meta, computer: '' }, { ...meta, folder: 'tmp' }, { ...meta, left: -1 }, { ...meta, left: 1.5 },
      { ...meta, files: 'x' }, { ...meta, files: [{ ...entry, sha256: 'A'.repeat(64) }] }, { ...meta, files: [{ ...entry, sha256: 'a'.repeat(63) }] },
      { ...meta, files: [{ ...entry, phase: 'done' }] }, { ...meta, files: [{ ...entry, path: '/' }] }, { ...meta, files: [{ ...entry, id: '' }] }, { ...meta, files: [{ ...entry, size: -1 }] },
    ];
    for (const b of bad) expect(metaOf(b), JSON.stringify(b)).toBeNull();
  });
});
