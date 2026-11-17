// Vitest: what a fresh read proves about a setup change. Answers carry the computers query's real projection (core computersPage).
import { describe, expect, it } from 'vitest';
import type { ComputerPage, ComputerWire } from '@core';
import { provenAnswers } from './data';
import { redeemProves, retryProves } from './logic';

// computersPage's projection of one answer: its rows and whether the list is whole.
const list = (containers: unknown[], totalPages = 1): ComputerPage => ({ rows: containers as ComputerWire[], complete: totalPages <= 1 });

describe('setup proves', () => {
  it.each([
    ['retry', retryProves],
    ['redeem', redeemProves],
  ])('%s is applied only when a computer row exists', (_n, proves) => {
    expect(proves(undefined, [[list([{ id: 'a' }])], []])).toBe('applied');
    expect(proves(undefined, [[list([])], [{ kind: 'invite' }]])).toBeUndefined();
    expect(proves(undefined, [])).toBeUndefined();
  });

  it.each([
    ['retry', retryProves],
    ['redeem', redeemProves],
  ])('%s: a lost reply then a fresh list with the new computer settles the hold, with no setup answer', (_n, proves) => {
    // A first page of a longer list still proves a computer exists.
    expect(proves(undefined, [[list([], 1), list([{ id: 'new' }], 3)]])).toBe('applied');
    expect(proves(undefined, [[list([{ id: 'new' }])], []])).toBe('applied');
  });

  it.each([
    ['retry', retryProves],
    ['redeem', redeemProves],
  ])('%s: rows Home cannot show prove nothing once the read-back cuts them; a usable row still does', (_n, proves) => {
    for (const bad of [[{}], [null], [{ id: '' }], [{ id: 123 }]]) expect(proves(undefined, provenAnswers([[list(bad)], [{ kind: 'invite' }]])), JSON.stringify(bad)).toBeUndefined();
    expect(proves(undefined, provenAnswers([[list([{}, { id: 'a' }], 3)], [{ kind: 'invite' }]]))).toBe('applied');
    expect(redeemProves(undefined, provenAnswers([[list([{}])], [{ kind: 'provisioning' }]]))).toBe('applied');
  });

  it('a bare array is not the query projection and proves nothing', () => {
    expect(retryProves(undefined, [[[{ id: 'a' }]], []])).toBeUndefined();
  });

  it('redeem is also proved by a setup state that is no longer "invite"; retry is not', () => {
    const answers = [[list([])], [{ kind: 'mailbox' }]] as const;
    expect(redeemProves(undefined, answers)).toBe('applied');
    expect(retryProves(undefined, answers)).toBeUndefined();
    expect(redeemProves(undefined, [[list([])], [{ kind: 'invite' }]])).toBeUndefined();
  });
});
