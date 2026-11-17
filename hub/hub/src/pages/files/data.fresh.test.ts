// A folder read now for Check again, with whether it is whole: the program's
// `skipped` list present and empty. Only a whole one proves a name absent; one with skipped entries still shows what is
// there. An older program without the list, or an answer that is not a listing, is 'failed'. The top folder (GET /?json)
// is never whole.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as Core from '@core';

const answer: { raw: unknown; fail?: boolean } = { raw: null };
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), api: vi.fn(async () => { if (answer.fail) throw new Error('lost'); return answer.raw; }) }));
const { freshListing } = await import('./data');
const c = { id: 'c1', project_id: 'p1', server_name: 's1' } as never;
const entry = { name: 'a.txt', is_dir: false, size: 3, modified: 1, type: 'file', mode: '644' };

beforeEach(() => { answer.raw = null; answer.fail = false; });

describe('freshListing (a folder read now, and whether it is whole)', () => {
  it('skipped present and empty: the entries, whole', async () => {
    answer.raw = { path: '/tmp', count: 1, skipped: [], entries: [entry] };
    expect(await freshListing(c, '/tmp')).toEqual({ entries: [expect.objectContaining({ name: 'a.txt' })], whole: true });
  });
  it('entries the program could not read (skipped not empty): the entries it shows, never whole', async () => {
    answer.raw = { path: '/tmp', count: 1, skipped: [{ name: 'b.txt', reason: 'unreadable' }], entries: [entry] };
    expect(await freshListing(c, '/tmp')).toEqual({ entries: [expect.objectContaining({ name: 'a.txt' })], whole: false });
  });
  it('an older program (no skipped list) or a skipped that is not a list of named rows: failed', async () => {
    answer.raw = { path: '/tmp', count: 1, entries: [entry] };
    expect(await freshListing(c, '/tmp')).toBe('failed');
    answer.raw = { path: '/tmp', count: 1, skipped: 0, entries: [entry] };
    expect(await freshListing(c, '/tmp')).toBe('failed');
    answer.raw = { path: '/tmp', count: 2, skipped: [{ name: 'b.txt' }], entries: [entry] };
    expect(await freshListing(c, '/tmp')).toBe('failed');
  });
  it('the top folder is never whole: GET /?json drops what it cannot read without a word', async () => {
    answer.raw = { kind: 'Index', paths: [{ name: 'home', path_type: 'Dir', size: 0, mtime: 1 }, { name: 'a.txt', path_type: 'File', size: 3, mtime: 2 }] };
    expect(await freshListing(c, '/')).toEqual({ entries: [expect.objectContaining({ name: 'home', dir: true }), expect.objectContaining({ name: 'a.txt', dir: false })], whole: false });
    answer.raw = { kind: 'Index', paths: [{ name: 'x', path_type: 'Dir', size: 0, mtime: 1 }, { name: 'bad/name', path_type: 'File' }] };
    expect(await freshListing(c, '/')).toEqual({ entries: [expect.objectContaining({ name: 'x' })], whole: false });
  });
  it('a malformed answer (no entries list, not an object) or a read that throws: failed, never an empty list', async () => {
    answer.raw = { path: '/tmp', count: 0, skipped: [], entries: 'none' };
    expect(await freshListing(c, '/tmp')).toBe('failed');
    answer.raw = 'oops';
    expect(await freshListing(c, '/tmp')).toBe('failed');
    expect(await freshListing(c, '/')).toBe('failed');
    answer.raw = { path: '/tmp', count: 0, skipped: [], entries: [] };
    answer.fail = true;
    expect(await freshListing(c, '/tmp')).toBe('failed');
    expect(await freshListing(c, '/')).toBe('failed');
  });
});
