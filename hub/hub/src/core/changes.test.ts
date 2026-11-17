// The change registry itself (changes.ts), driven without React or routes.
import { beforeEach, describe, expect, it } from 'vitest';
import { complete, guarded, holdOfLock, isPending, pendingMark, release } from './changes';
import { boot, R1 } from './test/env';

beforeEach(() => { boot({ realm: R1 }); });

const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });

describe('await complete() keeps its sequence fence on released changes that keep their key', () => {
  it('an older read-back\'s await complete(upTo) never drops a newer change\'s kept key', async () => {
    await guarded('s', 'd', pendingWith('K1'));
    const mark = pendingMark(), a = holdOfLock('s', 'd')!; // A's read-back starts
    await complete('s', 'd', a); // another proof retires A
    await guarded('s', 'd', pendingWith('K2')); // B, same identity, goes pending after the mark
    await release('s', 'd', holdOfLock('s', 'd')!); // B dismissed: freed, K2 kept
    expect(isPending('s', 'd')).toBe(false);
    expect(await complete('s', 'd', a,{ upTo: mark })).toBe(false); // A's late read-back says applied
    expect(await complete('s', 'd', holdOfLock('s', 'd')!,{ upTo: mark })).toBe(false); // the upTo fence alone holds too
    const seen: Array<string | undefined> = [];
    await guarded('s', 'd', async (k) => { seen.push(k); return { outcome: 'done' as const }; });
    expect(seen).toEqual(['K2']);
  });
  it('a kept key that went pending at or before the mark is still retired', async () => {
    await guarded('s', 'd', pendingWith('K1'));
    const h = holdOfLock('s', 'd')!;
    expect(await release('s', 'd', h)).toBe(true);
    expect(await complete('s', 'd', h,{ upTo: pendingMark() })).toBe(true);
    const seen: Array<string | undefined> = [];
    await guarded('s', 'd', async (k) => { seen.push(k); return { outcome: 'done' as const }; });
    expect(seen).toEqual([undefined]);
  });
});

describe('heldChanges(lock, {realm}) leaves out a change sent in another realm', () => {
  it('a realm filter keeps the shown realm\'s and the realm-less changes; all and no filter keep everything', async () => {
    const { heldChanges } = await import('./changes');
    const base = 'lock:test.held.realm';
    // Scopes as changeScope files them: a realm-scoped change under its realm ('@r1').
    await guarded(base + '@r1', 'a', pendingWith('K1'), { base, target: null, realm: 'r1' });
    await guarded(base + '@r2', 'b', pendingWith('K2'), { base, target: null, realm: 'r2' });
    await guarded(base, 'c', pendingWith('K3'), { base, target: null, realm: null });
    // case-a: a lock not filed under its realm (acrossRealms, e.g. a computer's lifecycle) counts in every view.
    await guarded(base, 'd', pendingWith('K4'), { base, target: null, realm: 'r2' });
    expect(heldChanges('test.held.realm')).toHaveLength(4);
    expect(heldChanges('test.held.realm', { realm: 'all' })).toHaveLength(4);
    expect(heldChanges('test.held.realm', { realm: 'r1' }).map((h) => h.key).sort()).toEqual(['K1', 'K3', 'K4']);
  });
});
