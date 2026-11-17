// changesOverview: every unresolved change of the shown account, of every base, named by its facts (base, identity,
// target, realm, sender page) for Home's Needs you lines. The record is the one a real e2e left (a
// script save whose answer was lost, then Discard draft): a held s:scripts:write. Read-only, deep-frozen, and the
// same view filter as heldChanges: another account's changes and a change filed under another realm stay out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { CHANGE_STORE_KEY, readChanges, writeChanges, type StoredChange } from './change-store';
import * as C from './changes';
import { boot, R1 } from './test/env';

const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
const R2 = 'b'.repeat(24);

// discard-held.changes.json (from an e2e run), as it was stored; its account is replaced by the test's.
const FIXTURE = {
  id: '7a11ce0000000000000000aa\u0001s:scripts:write#be0000000000000000000b01/ce0000000000000000000c01\u00003c9021463d85296428f1f26188f3dfa14466d5d120ed08f35ca9c0353a76058a',
  pending: true,
  key: null,
  t: 1794200111184,
  at: 1794200111157,
  fmt: 1,
  meta: {
    base: 's:scripts:write',
    target: { project: { id: 'be0000000000000000000b01' }, computer: { id: 'ce0000000000000000000c01', server_name: 'live-node-1' } },
    realm: null,
    by: 's:scripts:write',
    page: 'scripts',
    identity: { path: 'default/1/discard-held-probe.ts', opId: 'c5cf451ba45101234a771daef45b4813' },
  },
  inc: 'dc6ce6b7-cca9-4763-be54-61cc90922733',
  nonce: '35d8b8e3-36d0-4d21-9cf9-c9a91c77aa19',
  oc: 'ef84007b-f5cf-4c3a-9583-9e07eb3dce55',
};

/** The fixture under this test's account; `realm` files it under that realm (scope '@<realm>', meta.realm). */
function record(o: { realm?: string; account?: string; digest?: string } = {}): StoredChange {
  const own = o.account ?? C.changeOwner();
  const scope = 's:scripts:write' + (o.realm ? '@' + o.realm : '') + '#be0000000000000000000b01/ce0000000000000000000c01';
  // writeChanges takes records as core holds them (the target's computer as `container`) and stores it as `computer`, the
  // fixture's own form; the read back converts it again (change-store.ts toStoredRecord / fromStored).
  const { computer, ...target } = FIXTURE.meta.target;
  return { ...FIXTURE, id: own + scope + '\u0000' + (o.digest ?? FIXTURE.id.slice(FIXTURE.id.lastIndexOf('\u0000') + 1)), meta: { ...FIXTURE.meta, target: { ...target, container: computer }, realm: o.realm ?? null } } as unknown as StoredChange;
}

async function store(list: StoredChange[]): Promise<void> {
  C.reloadChangesForTests();
  writeChanges(list);
  act(() => announce());
  await vi.waitFor(() => expect(readChanges()).toHaveLength(list.length), { timeout: 5000 });
  C.reloadChangesForTests();
}

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { vi.useRealTimers(); });

describe('changesOverview', () => {
  it('lists the held script save with what it is, where it went and the page that checks it', async () => {
    await store([record()]);
    const rows = C.changesOverview({ realm: R1 });
    expect(rows).toEqual([{
      ref: expect.any(String),
      base: 's:scripts:write',
      identity: { path: 'default/1/discard-held-probe.ts', opId: 'c5cf451ba45101234a771daef45b4813' },
      // Stored as `computer`, read back as core's ChangeTarget names it (`container`).
      target: { project: { id: 'be0000000000000000000b01' }, container: { id: 'ce0000000000000000000c01', server_name: 'live-node-1' } },
      realm: null,
      at: 1794200111157,
      from: { page: 'scripts', path: '/scripts' },
      held: true,
    }]);
    // Deep-frozen copies: a caller never reaches the registry's own data.
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(Object.isFrozen((rows[0]!.target as { container: object }).container)).toBe(true);
    expect(Object.isFrozen(rows[0]!.identity)).toBe(true);
  });

  it('is read-only: listing frees, sends and stores nothing', async () => {
    await store([record()]);
    const before = JSON.stringify(readChanges());
    C.changesOverview({ realm: R1 });
    C.changesOverview({ realm: 'all' });
    expect(JSON.stringify(readChanges())).toBe(before);
    expect(C.unresolvedChanges()).toBe(1);
  });

  it('leaves out a change filed under a realm other than the one shown, and shows it with all realms', async () => {
    await store([record({ realm: R2 })]);
    expect(C.changesOverview({ realm: R1 })).toEqual([]);
    expect(C.changesOverview({ realm: 'all' })).toMatchObject([{ base: 's:scripts:write', realm: R2 }]);
    expect(C.changesOverview({ realm: R2 })).toMatchObject([{ realm: R2 }]);
  });

  it('shows a change filed under the shown realm', async () => {
    await store([record({ realm: R1 })]);
    expect(C.changesOverview({ realm: R1 })).toMatchObject([{ base: 's:scripts:write', realm: R1, held: true }]);
  });

  it("never lists another account's change", async () => {
    await store([record({ account: 'f'.repeat(24) + '\u0001' })]);
    expect(C.changesOverview({ realm: 'all' })).toEqual([]);
  });

  it('leaves out the shared locks the caller names (except), and only those', async () => {
    const meta = { base: 'lock:setup.retry', target: null, realm: null, identity: null, by: 'q:x', page: 'home' };
    await store([record()]);
    await C.guarded('lock:setup.retry', 'd1', () => Promise.resolve({ outcome: 'pending' as const, idem: 'K1' }), meta);
    expect(C.changesOverview({ realm: R1 }).map((r) => r.base).sort()).toEqual(['lock:setup.retry', 's:scripts:write']);
    expect(C.changesOverview({ realm: R1, except: ['setup.retry'] }).map((r) => r.base)).toEqual(['s:scripts:write']);
  });

  it('gives each send its own ref, kept while it is held: two sends at the same moment never share one, and one resolving leaves the other its own', async () => {
    const base = record({ digest: 'e'.repeat(64) }) as unknown as { meta: Record<string, unknown> };
    const twin = { ...base, inc: 'other-inc', nonce: 'other-nonce', meta: { ...base.meta, identity: { path: 'default/1/twin.ts', opId: 'o2' } } } as unknown as StoredChange;
    await store([record(), twin]);
    const both = C.changesOverview({ realm: R1 });
    expect(both.map((r) => r.at)).toEqual([FIXTURE.at, FIXTURE.at]);
    expect(new Set(both.map((r) => r.ref)).size).toBe(2);
    const twinRef = both.find((r) => (r.identity as { path: string }).path === 'default/1/twin.ts')!.ref;
    await store([twin]);
    expect(C.changesOverview({ realm: R1 }).map((r) => r.ref)).toEqual([twinRef]);
    expect(JSON.stringify(both.map((r) => r.ref))).not.toContain('e'.repeat(16));
  });

  it("lists an older build's record that core still counts (unattributed, held), so Home never drops a change core holds", async () => {
    const { fmt: _f, meta: _m, ...older } = record({ digest: 'd'.repeat(64) }) as unknown as Record<string, unknown>;
    void _f; void _m;
    await store([older as unknown as StoredChange]);
    expect(C.unresolvedChanges()).toBe(1);
    const rows = C.changesOverview({ realm: R1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ held: true });
    expect(C.changesOverview({ realm: 'all' })).toHaveLength(1);
  });

  it("lists an older build's record another tab is sending now (not converted while it is out): unattributed", async () => {
    const { fmt: _f, ...older } = record({ digest: 'c'.repeat(64) }) as unknown as Record<string, unknown>;
    void _f;
    await store([{ ...older, pending: false, sending: { tab: 'another-tab', at: Date.now() } } as unknown as StoredChange]);
    const rows = C.changesOverview({ realm: R1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base: null, identity: null, target: null, from: null });
  });

  it('lists oldest first', async () => {
    const later = { ...record({ digest: 'e'.repeat(64) }), at: FIXTURE.at + 5000 } as StoredChange;
    await store([later, record()]);
    expect(C.changesOverview({ realm: R1 }).map((r) => r.at)).toEqual([FIXTURE.at, FIXTURE.at + 5000]);
  });
});
