// @vitest-environment node
// The Shared folders section's pure parts: the "all my computers" list holds each share once, a computer's
// running state comes from the Hub's list (unknown when not listed), and every state has a pill.
import { describe, expect, it } from 'vitest';
import { listAnswer, shareStates, shareWire } from './fixtures';
import { allRows, linkHandle, listKind, runningOf, SHARE_PILL } from './section';
import { shareState, type ShareStateKind } from './state';
import { shareListOf, type ShareList } from './wire';

const list = (...w: readonly Readonly<Record<string, unknown>>[]): ShareList => shareListOf(listAnswer(...w))!;

describe('allRows', () => {
  it('lists every given share, then each received one the given list does not hold, each once', () => {
    const given = list(shareStates.on, shareStates.off);
    const received = list(shareStates.on, shareWire({ id: 'sh_0900', source_path: '/elsewhere' }));
    expect(allRows(given, received).map((r) => r.id)).toEqual(['sh_0001', 'sh_0003', 'sh_0900']);
  });
  it('keeps the received rows when nothing is given', () => {
    expect(allRows(list(), list(shareStates.waiting)).map((r) => r.id)).toEqual(['sh_0005']);
  });
});

describe('listKind', () => {
  const ok = { data: list(), isError: false };
  it('fails a list that failed with nothing to show: never shown as empty', () => {
    expect(listKind([{ data: undefined, isError: true }])).toBe('failed');
    expect(listKind([ok, { data: undefined, isError: true }])).toBe('failed');
  });
  it('loads until every list answered, keeps an older answer as stale after a failed read, else ready', () => {
    expect(listKind([ok, { data: undefined, isError: false }])).toBe('loading');
    expect(listKind([ok, { data: list(), isError: true }])).toBe('stale');
    expect(listKind([ok, ok])).toBe('ready');
  });
});

describe('runningOf', () => {
  it('reads the four buckets: running true, stopped and paused false, others not known', () => {
    expect(runningOf({ id: 'a', name: 'a', status: 'running' })).toBe(true);
    expect(runningOf({ id: 'a', name: 'a', status: 'stopped' })).toBe(false);
    expect(runningOf({ id: 'a', name: 'a', status: 'paused' })).toBe(false);
    expect(runningOf({ id: 'a', name: 'a', status: 'starting' })).toBeNull();
    expect(runningOf({ id: 'a', name: 'a', status: 'failed' })).toBeNull();
  });
  it('is not known for a computer the list does not hold (never read as stopped)', () => {
    expect(runningOf(undefined)).toBeNull();
  });
});

describe('SHARE_PILL', () => {
  it('only a failed share is drawn as danger, and only on is drawn as ok', () => {
    const tones = Object.entries(SHARE_PILL);
    expect(tones.filter(([, p]) => p.tone === 'danger').map(([k]) => k)).toEqual(['failed']);
    expect(tones.filter(([, p]) => p.tone === 'ok').map(([k]) => k)).toEqual(['on']);
  });
  it('has a pill for every state shareState gives', () => {
    const seen = new Set<ShareStateKind>();
    for (const w of Object.values(shareStates)) {
      const row = shareListOf(listAnswer(w))!.rows[0]!;
      for (const ctx of [{ now: 0 }, { now: 0, sourceRunning: false }, { now: 0, targetRunning: false }, { now: 0, hold: 'creating' as const }, { now: 0, unsure: true }, { now: 9e12 }]) {
        seen.add(shareState(row, ctx).kind);
      }
    }
    for (const k of seen) expect(SHARE_PILL[k], k).toBeDefined();
  });
});

describe('linkHandle', () => {
  const cedar = { id: 'c0a7150000000000000000c3', name: 'cedar', status: 'stopped' };
  const atlas = { id: 'c0a7150000000000000000a1', name: 'atlas', status: 'running' };
  const twin = { id: 'dddddddd00000000000000c3', name: 'cedar', status: 'running' };
  it('is the handle when the whole list holds no other computer with it', () => {
    expect(linkHandle(cedar, [atlas, cedar], true)).toBe('cedar.00c3');
  });
  it('is null when another listed computer has the same name and id ending: Files would open the first one', () => {
    expect(linkHandle(cedar, [twin, cedar, atlas], true)).toBeNull();
    expect(linkHandle(twin, [twin, cedar], true)).toBeNull();
    expect(linkHandle(atlas, [twin, cedar, atlas], true)).toBe('atlas.00a1');
  });
  it('is null while the list is not known whole (a clash may be on a page not read yet), or for no computer', () => {
    expect(linkHandle(cedar, [atlas, cedar], false)).toBeNull();
    expect(linkHandle(undefined, [atlas], true)).toBeNull();
  });
});
