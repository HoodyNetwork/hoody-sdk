// Read old, write new: the stored target of a change record names its computer as target.computer; a record an
// older Hub wrote has target.container. Read: the new spelling first, the old one as the fallback. Write: new only.
import { afterEach, describe, expect, it } from 'vitest';
import { CHANGE_STORE_KEY, readChanges, setChangeStoreAdapter, writeChanges, type StoredChange } from './change-store';

const base = { id: 'u1\u0001lock:x\u0000d1', pending: true, key: 'k-1', t: 100 };
const withTarget = (target: unknown): unknown => ({ ...base, meta: { base: 'lock:x', target, realm: 'r1', by: 'q:x' } });
const stored = (): unknown[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]');
afterEach(() => { setChangeStoreAdapter(null); localStorage.clear(); });

describe('change-store: the stored target spelling', () => {
  it('reads a record written with the old spelling (target.container) as the same target', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget({ project: { id: 'p1' }, container: { id: 'c1' } })]));
    expect(readChanges()![0]!.meta!.target).toEqual({ project: { id: 'p1' }, container: { id: 'c1' } });
  });
  it('reads a record written with the new spelling (target.computer) as the same target', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget({ project: { id: 'p1' }, computer: { id: 'c1' } })]));
    expect(readChanges()![0]!.meta!.target).toEqual({ project: { id: 'p1' }, container: { id: 'c1' } });
  });
  it('a record carrying both spellings with different ids reads the new one', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget({ project: { id: 'p1' }, computer: { id: 'c-new' }, container: { id: 'c-old' } })]));
    expect(readChanges()![0]!.meta!.target).toEqual({ project: { id: 'p1' }, container: { id: 'c-new' } });
  });
  it('a target that names no computer under either spelling is a corrupt record, not an empty target', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget({ project: { id: 'p1' } })]));
    expect(readChanges()).toEqual([]);
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget({ project: { id: 'p1' }, computer: { id: '' } })]));
    expect(readChanges()).toEqual([]);
  });
  it('a null target stays null', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([withTarget(null)]));
    expect(readChanges()![0]!.meta!.target).toBeNull();
  });
  it('writes the new spelling only, and an old record rewritten comes back as the new spelling', () => {
    const r = { ...(withTarget({ project: { id: 'p1' }, container: { id: 'c1' } }) as StoredChange) };
    expect(writeChanges([r])).toBe(true);
    const w = stored()[0] as { meta: { target: Record<string, unknown> } };
    expect(w.meta.target).toEqual({ project: { id: 'p1' }, computer: { id: 'c1' } });
    expect('container' in w.meta.target).toBe(false);
    expect(readChanges()![0]!.meta!.target).toEqual({ project: { id: 'p1' }, container: { id: 'c1' } });
  });
});
