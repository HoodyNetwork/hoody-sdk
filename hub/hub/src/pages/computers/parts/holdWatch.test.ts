// Which ends of a held change the Realms drawer must prove itself (holdWatch): every end but the person's own Dismiss
// that core accepted for the hold shown (released, not judged), and never the hold of a computer the drawer no longer
// shows. An end is always judged or released, once: the drawer's form stays locked until then. A Dismiss answer for
// an older hold, or one arriving after the drawer unmounted, acts on nothing.
import { describe, expect, it } from 'vitest';
import { holdWatch, sameSet, type ShownHold } from './holdWatch';

const H1: ShownHold = { computer: 'c1', realms: ['r1', 'r2'], hold: 't1' };
const H2: ShownHold = { computer: 'c1', realms: ['r1'], hold: 't2' };

function setup() {
  const judged: ShownHold[] = [];
  const released: ShownHold[] = [];
  return { judged, released, w: holdWatch({ judge: (h) => judged.push(h), release: (h) => released.push(h) }) };
}
function deferred() {
  let answer!: (v: boolean) => void;
  const p = new Promise<boolean>((r) => { answer = r; });
  return { p, answer };
}

describe('holdWatch', () => {
  it('a hold that ends while shown (a proof, or a Dismiss elsewhere) is judged once', () => {
    const { judged, released, w } = setup();
    w.seen(H1, 'c1');
    w.seen(H1, 'c1');
    w.seen(null, 'c1');
    w.seen(null, 'c1');
    expect(judged).toEqual([H1]);
    expect(released).toEqual([]);
  });

  it('the person\'s own Dismiss that core accepted is released, not judged, whether the end shows before or after the answer', async () => {
    const a = setup();
    a.w.seen(H1, 'c1');
    const d1 = deferred();
    const r1 = a.w.dismiss(() => d1.p);
    a.w.seen(null, 'c1');
    // Still out: neither judged nor released, so the drawer stays locked.
    expect(a.released).toEqual([]);
    d1.answer(true);
    expect(await r1).toBe(true);
    expect(a.judged).toEqual([]);
    expect(a.released).toEqual([H1]);

    const b = setup();
    b.w.seen(H1, 'c1');
    expect(await b.w.dismiss(async () => true)).toBe(true);
    expect(b.released).toEqual([]);
    b.w.seen(null, 'c1');
    expect(b.judged).toEqual([]);
    expect(b.released).toEqual([H1]);
  });

  it('a Dismiss core refused while the hold ended anyway (a proof freed it meanwhile) is judged after the refusal', async () => {
    const { judged, released, w } = setup();
    w.seen(H1, 'c1');
    const d = deferred();
    const r = w.dismiss(() => d.p);
    w.seen(null, 'c1');
    expect(judged).toEqual([]);
    d.answer(false);
    expect(await r).toBe(false);
    expect(judged).toEqual([H1]);
    expect(released).toEqual([]);
  });

  it('a refused Dismiss with the hold still shown judges nothing; its later end is judged', async () => {
    const { judged, w } = setup();
    w.seen(H1, 'c1');
    expect(await w.dismiss(async () => false)).toBe(false);
    w.seen(H1, 'c1');
    expect(judged).toEqual([]);
    w.seen(null, 'c1');
    expect(judged).toEqual([H1]);
  });

  it('an accepted Dismiss frees only its own token: a newer hold shown later is judged when it ends', async () => {
    const { judged, w } = setup();
    w.seen(H1, 'c1');
    await w.dismiss(async () => true);
    w.seen(H2, 'c1');
    w.seen(null, 'c1');
    expect(judged).toEqual([H2]);
  });

  it('a change of computer is not an end: the earlier computer\'s hold is never judged here', () => {
    const { judged, released, w } = setup();
    w.seen(H1, 'c1');
    w.seen(null, 'c2');
    w.seen(null, undefined);
    expect(judged).toEqual([]);
    expect(released).toEqual([]);
  });

  it('a Dismiss still out when the computer changes answers into nothing: its saved end is never judged or released', async () => {
    const { judged, released, w } = setup();
    w.seen(H1, 'c1');
    const d = deferred();
    const r = w.dismiss(() => d.p);
    w.seen(null, 'c1');
    w.seen(null, 'c2');
    d.answer(false);
    expect(await r).toBe(false);
    expect(judged).toEqual([]);
    expect(released).toEqual([]);
  });

  it('a Dismiss still out when a newer hold shows: its late answer (accepted or refused) releases or judges nothing', async () => {
    for (const answer of [true, false]) {
      const { judged, released, w } = setup();
      w.seen(H1, 'c1');
      const d = deferred();
      const r = w.dismiss(() => d.p);
      w.seen(null, 'c1');
      w.seen(H2, 'c1');
      w.seen(null, 'c1');
      // H2's own end is judged; H1's Dismiss answer, arriving later, touches nothing.
      expect(judged).toEqual([H2]);
      d.answer(answer);
      expect(await r).toBe(answer);
      expect(judged).toEqual([H2]);
      expect(released).toEqual([]);
    }
  });

  it('after drop (the drawer unmounted) a Dismiss answer still out judges or releases nothing; a later mount works again', async () => {
    for (const answer of [true, false]) {
      const { judged, released, w } = setup();
      w.seen(H1, 'c1');
      const d = deferred();
      const r = w.dismiss(() => d.p);
      w.seen(null, 'c1');
      w.drop();
      d.answer(answer);
      expect(await r).toBe(answer);
      expect(judged).toEqual([]);
      expect(released).toEqual([]);
      w.seen(H2, 'c1');
      w.seen(null, 'c1');
      expect(judged).toEqual([H2]);
    }
  });

  it('a Dismiss with no hold shown just runs core\'s', async () => {
    const { judged, released, w } = setup();
    expect(await w.dismiss(async () => true)).toBe(true);
    expect(judged).toEqual([]);
    expect(released).toEqual([]);
  });

  it('sameSet: the same realms both ways; a missing realm is never made up by a repeated one', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameSet(['a', 'a'], ['a', 'b'])).toBe(false);
    expect(sameSet(['a', 'b'], ['a'])).toBe(false);
    expect(sameSet([], [])).toBe(true);
  });
});
