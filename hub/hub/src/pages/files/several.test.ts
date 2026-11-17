// Vitest: the several-items plan and its tally (several.ts).
import { describe, expect, it } from 'vitest';
import { capRest, planRest, planSeveral, sizeRefusal, SEVERAL_FOLDERS_MAX, SEVERAL_MAX, tallyOf, type SevItem, type SevOutcome } from './several';

const f = (name: string, folder = '/home/ada'): SevItem => ({ path: `${folder}/${name}`, name, dir: false, size: 1, modified: 1 });
const d = (name: string, folder = '/home/ada'): SevItem => ({ path: `${folder}/${name}`, name, dir: true, size: null, modified: 1 });
const where = (rows: ReturnType<typeof planSeveral>) => rows.map((r) => r.dest ?? `skip:${r.skip}`);

describe('planSeveral', () => {
  it('free names keep their names, in the order shown', () => {
    expect(where(planSeveral([f('a.txt'), d('docs')], '/tmp', [], 'keep'))).toEqual(['/tmp/a.txt', '/tmp/docs']);
  });

  it('a taken name gets the Keep-both name; no item is planned onto a taken name', () => {
    expect(where(planSeveral([f('a.txt'), d('docs')], '/tmp', ['a.txt', 'docs'], 'keep'))).toEqual(['/tmp/a-1.txt', '/tmp/docs-1']);
  });

  it('with Skip, taken names are left out and free ones still go', () => {
    expect(where(planSeveral([f('a.txt'), f('b.txt')], '/tmp', ['a.txt'], 'skip'))).toEqual(['skip:taken', '/tmp/b.txt']);
  });

  it('a Keep-both name never takes another selected item\'s own name, wherever it is in the list', () => {
    // a.txt is taken there; a-1.txt is also selected (its own name is free), so a.txt becomes a-2.txt.
    expect(where(planSeveral([f('a.txt'), f('a-1.txt')], '/tmp', ['a.txt'], 'keep'))).toEqual(['/tmp/a-2.txt', '/tmp/a-1.txt']);
  });

  it('two Keep-both names never collide with each other', () => {
    // a.txt and a.txt can't both be selected (one folder), but the Keep-both name of one is reserved for the next.
    const rows = planSeveral([f('a.txt'), f('a-1.txt')], '/tmp', ['a.txt', 'a-1.txt'], 'keep');
    expect(where(rows)).toEqual(['/tmp/a-2.txt', '/tmp/a-1-1.txt']);
  });

  it('no free Keep-both name: left out', () => {
    const taken = ['a.txt', ...Array.from({ length: 999 }, (_, i) => `a-${i + 1}.txt`)];
    expect(where(planSeveral([f('a.txt')], '/tmp', taken, 'keep'))).toEqual(['skip:noName']);
  });

  it('a folder into itself is left out; others go', () => {
    expect(where(planSeveral([d('projects'), f('a.txt')], '/home/ada/projects/site', [], 'keep'))).toEqual(['skip:intoItself', '/home/ada/projects/site/a.txt']);
  });

  it('a folder going to its own path is left out too (into itself)', () => {
    expect(where(planSeveral([d('tmp', '')], '/tmp', [], 'keep'))).toEqual(['skip:intoItself']);
  });

  it('a name core cannot send there is left out (badName), and one too deep (deep)', () => {
    expect(where(planSeveral([f('50%.txt')], '/tmp', [], 'keep'))).toEqual(['skip:badName']);
    const deep = '/' + Array.from({ length: 40 }, (_, i) => `d${i}`).join('/');
    expect(planSeveral([f('a.txt')], deep, [], 'keep')[0]!.skip).toBe('deep');
  });

  it('into itself is said before a taken name, with Skip too', () => {
    expect(where(planSeveral([d('projects')], '/home/ada/projects', ['projects'], 'skip'))).toEqual(['skip:intoItself']);
  });

  it('an item left out frees nothing for another: its name stays reserved only when it goes', () => {
    // projects goes into itself (left out); its name is not reserved, so nothing else is renamed for it.
    expect(where(planSeveral([d('projects'), f('a.txt')], '/home/ada/projects', ['a.txt'], 'keep'))).toEqual(['skip:intoItself', '/home/ada/projects/a-1.txt']);
  });
});

describe('tallyOf', () => {
  const rows = planSeveral([f('a.txt'), f('b.txt'), f('c.txt'), f('d.txt')], '/tmp', ['d.txt'], 'skip');
  it('counts done, the one held, and those not sent; plan skips are not counted as not sent', () => {
    const o = new Map<number, SevOutcome>([[0, { kind: 'done', left: 2 }], [1, { kind: 'pending' }]]);
    const t = tallyOf(rows, o);
    expect(t.done).toBe(1);
    expect(t.left).toBe(2);
    expect(t.pending?.item.name).toBe('b.txt');
    expect(t.failed).toBeNull();
    expect(t.notSent).toBe(1);
  });
  it('a refusal is named with its code; a not_sent outcome counts as not sent', () => {
    const o = new Map<number, SevOutcome>([[0, { kind: 'done' }], [1, { kind: 'failed', code: 'DESTINATION_EXISTS' }]]);
    const t = tallyOf(rows, o);
    expect(t.failed).toEqual({ row: rows[1], code: 'DESTINATION_EXISTS' });
    expect(t.pending).toBeNull();
    expect(t.notSent).toBe(1);
    expect(tallyOf(rows, new Map([[0, { kind: 'not_sent', code: 'BUSY' }]])).notSent).toBe(3);
  });
  it('Copy the rest: a name made meanwhile (Copy the rest goes on past it) is counted apart, never as done or refused', () => {
    const o = new Map<number, SevOutcome>([[0, { kind: 'taken' }], [1, { kind: 'done' }], [2, { kind: 'taken' }]]);
    const t = tallyOf(rows, o);
    expect(t).toMatchObject({ done: 1, taken: 2, failed: null, pending: null, notSent: 0 });
    expect(tallyOf(rows, new Map()).taken).toBe(0);
  });
});

describe('sizeRefusal', () => {
  it('up to 100 items and 5 folder copies per press; the item bound is said first', () => {
    expect(SEVERAL_MAX).toBe(100);
    expect(SEVERAL_FOLDERS_MAX).toBe(5);
    expect(sizeRefusal(100, 5)).toBeNull();
    expect(sizeRefusal(101, 0)).toBe('tooMany');
    expect(sizeRefusal(10, 6)).toBe('tooManyFolders');
    expect(sizeRefusal(101, 6)).toBe('tooMany');
  });
});

describe('planRest (Copy the rest)', () => {
  it('each missing item goes to its own place in the copy, by the same relative path, in the order given', () => {
    const rows = planRest('/home/ada/site', '/tmp/site', ['sub/empty', 'sub/b.bin', 'link'], new Set(['', 'sub', 'sub/empty']));
    expect(rows.map((r) => [r.item.path, r.item.name, r.item.dir, r.name, r.dest, r.skip])).toEqual([
      ['/home/ada/site/sub/empty', 'empty', true, 'empty', '/tmp/site/sub/empty', null],
      ['/home/ada/site/sub/b.bin', 'b.bin', false, 'b.bin', '/tmp/site/sub/b.bin', null],
      ['/home/ada/site/link', 'link', false, 'link', '/tmp/site/link', null],
    ]);
  });
  it('never a Keep-both name: a name the files program refuses there, or too deep, is left out', () => {
    const rows = planRest('/s', '/a/b/c/d/e/f/g/s', ['x', 'ok'], new Set(['']));
    expect(where(rows)).toEqual(['skip:deep', 'skip:deep']);
    expect(where(planRest('/s', '/t/s', ['50%', 'ok'], new Set([''])))).toEqual(['skip:badName', '/t/s/ok']);
  });
  it('a nested item is judged where it lands, not at the top of the copy', () => {
    // /t/s/a/b/c/d/e/f/x is past the deepest folder core reads; /t/s/x would not be.
    expect(where(planRest('/s', '/t/s', ['a/b/c/d/e/f/x', 'a/y'], new Set(['', 'a', 'a/b', 'a/b/c', 'a/b/c/d', 'a/b/c/d/e', 'a/b/c/d/e/f'])))).toEqual(['skip:deep', '/t/s/a/y']);
  });
});

describe('capRest: one press takes what one several-items press takes, in order', () => {
  const rows = (n: number, dirsAt: readonly number[] = []) => planRest('/s', '/t/s', Array.from({ length: n }, (_, i) => `x${i}`), new Set(['', ...dirsAt.map((i) => `x${i}`)]));
  it('under both bounds: all of them, none more', () => {
    expect(capRest(rows(SEVERAL_MAX, [0, 1, 2, 3, 4]))).toMatchObject({ more: 0 });
    expect(capRest(rows(SEVERAL_MAX)).rows).toHaveLength(SEVERAL_MAX);
  });
  it('over the item bound: the first 100 go, the rest is counted for the next press', () => {
    const c = capRest(rows(SEVERAL_MAX + 7));
    expect(c.rows.map((r) => r.item.name)).toEqual(Array.from({ length: SEVERAL_MAX }, (_, i) => `x${i}`));
    expect(c.more).toBe(7);
  });
  it('over the folder bound: a sixth folder and everything after it wait (the order is kept)', () => {
    const c = capRest(rows(10, [0, 1, 2, 3, 4, 6, 8]));
    expect(c.rows.map((r) => r.item.name)).toEqual(['x0', 'x1', 'x2', 'x3', 'x4', 'x5']);
    expect(c.more).toBe(4);
  });
  it('rows left out by the plan are not counted as waiting either', () => {
    const r = planRest('/s', '/t/s', [...Array.from({ length: SEVERAL_MAX + 1 }, (_, i) => `x${i}`), '50%'], new Set(['']));
    expect(capRest(r).more).toBe(1);
  });
  it('rows left out by the plan do not take a place', () => {
    const r = planRest('/s', '/t/s', ['50%', ...Array.from({ length: SEVERAL_MAX }, (_, i) => `x${i}`)], new Set(['']));
    expect(capRest(r)).toMatchObject({ more: 0 });
    expect(capRest(r).rows).toHaveLength(SEVERAL_MAX + 1);
  });
});
