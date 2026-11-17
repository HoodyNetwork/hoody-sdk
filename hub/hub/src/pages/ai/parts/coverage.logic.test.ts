// The one coverage judge answers only "provably complete". Every combination that once broke it is
// a table row: how a query's flags become a read state (a refresh in flight or paused offline,
// an answer kept from another key: pending; a 404 is gone only from the read that answered it), how session pages and
// the All computers list (its own refresh included) become sources, and coverage() over them.
import { describe, expect, it } from 'vitest';
import { allSources, listGap } from './allChats.logic';
import { coverage, freshSources, readState, sessionSources, settled, type ReadFlags, type ReadState, type Source, type SourceKind } from './coverage.logic';

const src = (kind: SourceKind, state: ReadState): Source => ({ kind, computer: '', state });

describe('coverage(): provably complete only when every source answered and nothing remains', () => {
  const rows: Array<[string, Source[], boolean]> = [
    ['nothing to read', [], true],
    ['every read complete', [src('sessions', 'complete'), src('gates', 'complete'), src('waiting', 'complete')], true],
    ['a waiting chat gone (404 from this read: an answer)', [src('sessions', 'complete'), src('waiting', 'gone')], true],
    ['a session page still read', [src('sessions', 'complete'), src('sessions', 'pending')], false],
    ['a session page failed', [src('sessions', 'failed')], false],
    ['a further session page', [src('sessions', 'more')], false],
    ['gates still read', [src('sessions', 'complete'), src('gates', 'pending')], false],
    ['gates failed', [src('gates', 'failed')], false],
    ['more gates pages', [src('gates', 'more')], false],
    ['a waiting chat still read', [src('waiting', 'pending')], false],
    ['a waiting chat failed (after an earlier 404 too)', [src('waiting', 'failed')], false],
    ['more waiting chats than read', [src('waiting', 'more')], false],
    ['the computer list still read (a refresh included)', [src('computers', 'pending')], false],
    ['the computer list failed / capped / unproven', [src('computers', 'failed')], false],
    ['a containers row no computer can be built from', [src('unbuilt', 'failed')], false],
    ['a computer not read or refused', [src('computer', 'failed')], false],
    ['a computer with no answer yet', [src('computer', 'pending')], false],
  ];
  for (const [name, sources, complete] of rows)
    it(`${name} -> ${complete ? 'complete' : 'not proven'}`, () => {
      expect(coverage(sources)).toBe(complete);
    });
});

describe('readState(): one state per read, as it is now', () => {
  const q = (o: Partial<ReadFlags> & { code?: string }): ReadFlags => ({
    isSuccess: o.isSuccess ?? false,
    isError: o.isError ?? false,
    isFetching: o.isFetching ?? false,
    isPaused: o.isPaused ?? false,
    isPlaceholderData: o.isPlaceholderData ?? false,
    error: o.code ? ({ code: o.code } as never) : null,
  });
  const rows: Array<[string, ReadFlags, boolean, ReadState]> = [
    ['no answer yet', q({ isFetching: true }), false, 'pending'],
    ['answered', q({ isSuccess: true }), false, 'complete'],
    ['a refresh of an answer in flight (TanStack keeps isSuccess)', q({ isSuccess: true, isFetching: true }), false, 'pending'],
    ['a refresh of a failure in flight', q({ isError: true, isFetching: true, code: 'internal' }), false, 'pending'],
    ['a refresh of an answer paused offline', q({ isSuccess: true, isPaused: true }), false, 'pending'],
    ['a first read paused offline', q({ isPaused: true }), false, 'pending'],
    ['a waiting chat re-read paused after its 404', q({ isError: true, isPaused: true, code: 'not_found' }), true, 'pending'],
    ['an answer kept from another key (placeholder)', q({ isSuccess: true, isPlaceholderData: true }), false, 'pending'],
    ['failed', q({ isError: true, code: 'internal' }), false, 'failed'],
    ['404 where it is not an answer', q({ isError: true, code: 'not_found' }), false, 'failed'],
    ['404 from this read of a waiting chat', q({ isError: true, code: 'not_found' }), true, 'gone'],
    ['500 after an earlier 404 (nothing remembered)', q({ isError: true, code: 'internal' }), true, 'failed'],
    ['idle without an answer (disabled)', q({}), false, 'pending'],
  ];
  for (const [name, flags, gone, want] of rows)
    it(`${name} -> ${want}`, () => {
      expect(readState(flags, gone)).toBe(want);
    });
});

describe('freshSources(): staleness as sources (no live change feed; offline)', () => {
  const rows: Array<[string, { feedLive: boolean; online: boolean }, boolean]> = [
    ['a live feed, online: nothing added', { feedLive: true, online: true }, true],
    ['no live feed (down, reconnecting, all realms): the answers may be old', { feedLive: false, online: true }, false],
    ['offline with every read idle: the answers may be old', { feedLive: true, online: false }, false],
    ['both', { feedLive: false, online: false }, false],
  ];
  for (const [name, f, want] of rows)
    it(`${name} -> coverage ${want}`, () => {
      expect(coverage([{ kind: 'sessions', computer: '', state: 'complete' }, ...freshSources(f)])).toBe(want);
    });
});

describe('freshSources(): a refused feed is an answer (the gap is known at once, not after the pending grace)', () => {
  const done: Source = { kind: 'sessions', computer: '', state: 'complete' };
  it('refused: not complete, and settled', () => {
    const src = [done, ...freshSources({ feedLive: false, feedRefused: true, online: true })];
    expect(coverage(src)).toBe(false);
    expect(settled(src)).toBe(true);
  });
  it('not answered yet: not complete, and not settled', () => {
    const src = [done, ...freshSources({ feedLive: false, online: true })];
    expect(coverage(src)).toBe(false);
    expect(settled(src)).toBe(false);
  });
  it('live: nothing added, whatever feedRefused says', () => {
    expect(freshSources({ feedLive: true, feedRefused: true, online: true })).toEqual([]);
  });
});

describe('sessionSources(): the session walk as sources', () => {
  const base = { pageSize: 50, repairing: false };
  const states = (p: Parameters<typeof sessionSources>[0]) => sessionSources(p).map((s) => s.state);
  const rows: Array<[string, Parameters<typeof sessionSources>[0], ReadState[]]> = [
    ['no page yet', { ...base, pages: [], loaded: 0, total: null }, ['pending']],
    ['one full page of 51', { ...base, pages: [{ state: 'complete', size: 50 }], loaded: 50, total: 51 }, ['more']],
    ['the last page read', { ...base, pages: [{ state: 'complete', size: 50 }, { state: 'complete', size: 1 }], loaded: 51, total: 51 }, ['complete', 'complete']],
    ['page 2 pending', { ...base, pages: [{ state: 'complete', size: 50 }, { state: 'pending', size: 0 }], loaded: 50, total: 51 }, ['complete', 'pending']],
    ['page 2 failed', { ...base, pages: [{ state: 'complete', size: 50 }, { state: 'failed', size: 0 }], loaded: 50, total: 51 }, ['complete', 'failed']],
    ['a re-list in flight', { ...base, repairing: true, pages: [{ state: 'complete', size: 50 }, { state: 'complete', size: 1 }], loaded: 50, total: 51 }, ['pending', 'pending']],
    ['an empty later page below the total (unproven)', { ...base, pages: [{ state: 'complete', size: 50 }, { state: 'complete', size: 0 }], loaded: 50, total: 51 }, ['complete', 'failed']],
    ['a full page with no total said (unproven)', { ...base, pages: [{ state: 'complete', size: 50 }], loaded: 50, total: null }, ['failed']],
    ['a short page with no total said', { ...base, pages: [{ state: 'complete', size: 3 }], loaded: 3, total: null }, ['complete']],
  ];
  for (const [name, p, want] of rows)
    it(`${name} -> ${want.join(', ')}`, () => {
      expect(states(p)).toEqual(want);
    });
});

describe('the All computers list as sources (listGap + allSources)', () => {
  const whole = { complete: true, unproven: false, more: false, capped: false, failed: false };
  const rows: Array<[string, Parameters<typeof allSources>[0], boolean]> = [
    ['a whole list, every computer read and complete', { list: listGap(whole), unbuilt: 0, computers: [{ id: 'c1', sources: [src('sessions', 'complete')] }] }, true],
    ['a whole list whose refresh is in flight', { list: listGap(whole, true), unbuilt: 0, computers: [{ id: 'c1', sources: [src('sessions', 'complete')] }] }, false],
    ['the list still read (later pages)', { list: listGap({ ...whole, complete: false, more: true }), unbuilt: 0, computers: [] }, false],
    ['the list failed', { list: listGap({ ...whole, failed: true }), unbuilt: 0, computers: [] }, false],
    ['the list capped', { list: listGap({ ...whole, complete: false, capped: true }), unbuilt: 0, computers: [] }, false],
    ['the list unproven (several pages)', { list: listGap({ ...whole, complete: false, unproven: true }), unbuilt: 0, computers: [] }, false],
    ['an unbuilt row beside complete computers', { list: null, unbuilt: 1, computers: [{ id: 'c1', sources: [src('sessions', 'complete')] }] }, false],
    ['a computer not read (stopped) or refused', { list: null, unbuilt: 0, computers: [{ id: 'c1', unread: true }] }, false],
    ['a computer with no answer yet', { list: null, unbuilt: 0, computers: [{ id: 'c1' }] }, false],
    ['a computer whose only gap is a further page', { list: null, unbuilt: 0, computers: [{ id: 'c1', sources: [src('sessions', 'more')] }] }, false],
  ];
  for (const [name, a, complete] of rows)
    it(`${name} -> ${complete ? 'complete' : 'not proven'}`, () => {
      expect(coverage(allSources(a))).toBe(complete);
    });
  it("a computer's own sources carry its id", () => {
    expect(allSources({ list: null, unbuilt: 0, computers: [{ id: 'c1', sources: [src('gates', 'failed')] }] })).toEqual([{ kind: 'gates', computer: 'c1', state: 'failed' }]);
  });
});
