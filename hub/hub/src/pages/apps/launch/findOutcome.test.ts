// findOutcome: each row is a reproduced race or a plain case. "Nothing found" ('none') only
// for the words sent, once every place answered in full.
import { describe, expect, it } from 'vitest';
import { FIND_MIN } from '../logic';
import { findOutcome, type FindOutcome, type FindOutcomeInput } from './findOutcome';

const W = 'z'.repeat(Math.max(FIND_MIN, 6));
const ok = { failed: false, pending: false };
const done = (n = 6) => Array.from({ length: n }, () => ({ state: 'done', partial: false }));
const one = (x: { state: string; partial?: boolean }) => [...done(5), { partial: false, ...x }];

const S = 'z'.repeat(FIND_MIN - 1);
const rows: [string, FindOutcomeInput, FindOutcome][] = [
  ['no words', { q: '  ', sent: W, searched: true, catalog: ok, sources: done() }, 'idle'],
  ['fewer than FIND_MIN characters, sent, the catalogue answered', { q: S, sent: S, searched: false, catalog: ok, sources: [] }, 'short'],
  ['long to short during the debounce (the old search is for the long words)', { q: 'f', sent: W, searched: true, catalog: ok, sources: done() }, 'looking'],
  ['short to another short during the debounce', { q: 'g', sent: 'f', searched: false, catalog: ok, sources: [] }, 'looking'],
  ['short words sent, the catalogue still pending', { q: S, sent: S, searched: false, catalog: { failed: false, pending: true }, sources: [] }, 'looking'],
  ['short words sent, the catalogue failed: never "No program ready to install matches"', { q: S, sent: S, searched: false, catalog: { failed: true, pending: false }, sources: [] }, 'unanswered'],
  ['long words not searched yet (no search)', { q: W, sent: W, searched: false, catalog: ok, sources: [] }, 'looking'],
  ['a second query during the debounce, the finished search is for the words before', { q: W + 'q', sent: W, searched: true, catalog: ok, sources: done() }, 'looking'],
  ['the same words with other spaces are the sent words', { q: ` ${W} `, sent: W, searched: true, catalog: ok, sources: done() }, 'none'],
  ['a source still searching', { q: W, sent: W, searched: true, catalog: ok, sources: one({ state: 'searching' }) }, 'looking'],
  ['the catalogue still pending', { q: W, sent: W, searched: true, catalog: { failed: false, pending: true }, sources: done() }, 'looking'],
  ['the catalogue failed, every source answered empty', { q: W, sent: W, searched: true, catalog: { failed: true, pending: false }, sources: done() }, 'unanswered'],
  ['one source unanswered', { q: W, sent: W, searched: true, catalog: ok, sources: one({ state: 'failed' }) }, 'unanswered'],
  ['every source unanswered (search-down)', { q: W, sent: W, searched: true, catalog: ok, sources: done().map(() => ({ state: 'failed', partial: false })) }, 'unanswered'],
  ['a source still getting ready', { q: W, sent: W, searched: true, catalog: ok, sources: one({ state: 'warming' }) }, 'partial'],
  ['a source answered with part of its list', { q: W, sent: W, searched: true, catalog: ok, sources: one({ state: 'done', partial: true }) }, 'partial'],
  ['an unanswered place outranks a partial one', { q: W, sent: W, searched: true, catalog: ok, sources: [...one({ state: 'failed' }), { state: 'warming', partial: false }] }, 'unanswered'],
  ['every place answered in full with nothing', { q: W, sent: W, searched: true, catalog: ok, sources: done() }, 'none'],
];

describe('findOutcome', () => {
  it.each(rows)('%s', (_name, input, want) => {
    expect(findOutcome(input)).toBe(want);
  });
});
