// Jump to leaves out Referrals' questions where the page invites nobody: earning
// paused, removed, a token session, a failed read. Read against the real deep index, and through the reader the shell
// loads (manifest searchHide) in the page's own context.
import { renderPage, screen } from '@app/testing';
import { hidesTail } from '@kit';
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import { invites, type State } from './logic';
import page from './page';
import useReferralsSearchHide, { referralsHide } from './searchHide';

const mine = DEEP.filter((e) => e.page === 'referrals');
const STATES: readonly State[] = ['loading', 'error', 'token', 'notEligible', 'paused', 'canJoin', 'member', 'earningPaused', 'removed'];

describe('Referrals in Jump to', () => {
  it('its places in the index are its questions', () => {
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.kind === 'faq')).toBe(true);
  });

  it.each(STATES)('state %s: the questions are listed exactly where the page draws them (or while unknown)', (state) => {
    const h = referralsHide(state);
    const listed = mine.filter((e) => !hidesTail(h, e.to));
    expect(listed).toEqual(state === 'loading' || invites(state) ? mine : []);
  });

  const Probe = () => <output>{JSON.stringify(useReferralsSearchHide())}</output>;
  const probe = { ...page, load: async () => ({ default: Probe }) };
  it.each([
    ['', 'null'],
    ['removed', JSON.stringify({ hide: ['#faq-'] })],
    ['earningPaused', JSON.stringify({ hide: ['#faq-'] })],
  ])('the reader answers in state "%s": %s', async (state, want) => {
    await renderPage(probe, state ? { state } : {});
    expect(await screen.findByText(want, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
