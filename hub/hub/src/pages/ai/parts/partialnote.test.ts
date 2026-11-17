// Vitest: the All computers list's notice waits only while a read is out, so a read that answers must reach
// the list at once even when coverage stays unproven (pending -> failed): the part's digest changes.
import { describe, expect, it } from 'vitest';
import { digest, type Part } from './AllReads';
import { settled } from './coverage.logic';
import type { ChatsRead } from './data';

const read = (o: Partial<ChatsRead>): ChatsRead => ({
  rows: [], total: 3, shown: 3, loaded: 3, loadMore: undefined, loadingMore: false, gatesMore: false, moreGates: undefined, needs: 0,
  gatesError: null, sources: [], folders: [], isPending: false, error: null, refetch: () => undefined, reread: async () => false, ...o,
});
const feed = { tokens: null, live: true, why: undefined, retry: () => undefined } as unknown as Part['feed'];

describe('settled', () => {
  it('a source that stops pending, still incomplete, changes the digest', () => {
    const pending = digest({ feed, read: read({ sources: [{ kind: 'gates', computer: '', state: 'pending' }] }) });
    const failed = digest({ feed, read: read({ sources: [{ kind: 'gates', computer: '', state: 'failed' }] }) });
    expect(failed).not.toBe(pending);
  });
  it('settled: no source pending', () => {
    expect(settled([])).toBe(true);
    expect(settled([{ kind: 'gates', computer: '', state: 'failed' }, { kind: 'sessions', computer: '', state: 'complete' }])).toBe(true);
    expect(settled([{ kind: 'gates', computer: '', state: 'failed' }, { kind: 'feed', computer: '', state: 'pending' }])).toBe(false);
  });
});
