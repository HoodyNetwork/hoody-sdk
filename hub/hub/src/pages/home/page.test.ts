// Vitest: the home page's logic and interaction in every fixture state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAskForFixtures } from '@kit/ask';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type { Overview } from './data';
import {
  POLLS,
  POLL_MS,
  arrange,
  effectiveSetup,
  greetingKey,
  homeMode,
  latchFacts,
  moveKey,
  parsePrefs,
  progressOf,
  setHidden,
  shouldPoll,
  stepFocus,
  stepsFrom,
} from './logic';
// The setup panel's 'provisioning' as it would show on a server signal of preparation: no read answers it today
// (an owned free server alone reads 'empty'), so rows that test the panel force the answer.
const forced = vi.hoisted(() => ({ provisioning: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => { data?: unknown };
  return { ...core, useSetupState: (o?: { enabled?: boolean }) => { const r = real(o); return forced.provisioning && r.data ? { ...r, data: { kind: 'provisioning' } } : r; } };
});

import page from './page';
import strings from './strings.en.json';
import './testWaits';

const ov = (patch: Partial<Overview>): Overview => ({
  shared: false,
  realm: { id: 'r', name: 'R', all: false },
  computers: [{ id: 'a', name: 'a', running: true, state: 'running', handle: 'a.a' }],
  pickedId: 'a',
  facts: { computer: true, key: false },
  checklistHidden: false,
  onboarding: false,
  introHidden: false,
  listWhole: true,
  bands: {},
  ...patch,
});

describe('home logic', () => {
  it('picks the greeting by hour', () => {
    expect(greetingKey(4)).toBe('greeting.evening');
    expect(greetingKey(5)).toBe('greeting.morning');
    expect(greetingKey(12)).toBe('greeting.afternoon');
    expect(greetingKey(18)).toBe('greeting.evening');
  });

  it('chooses the dashboard mode from the computer list', () => {
    expect(homeMode(ov({}))).toBe('ready');
    expect(homeMode(ov({ pickedId: undefined }))).toBe('pick-one');
    expect(homeMode(ov({ pickedId: 'gone' }))).toBe('pick-one');
    expect(homeMode(ov({ computers: [] }))).toBe('empty-realm');
    expect(homeMode(ov({ computers: [], accountEmpty: true }))).toBe('setup');
    expect(homeMode(ov({ computers: [], shared: true }))).toBe('shared-empty');
  });

  it('keeps a step ticked once seen true, and unknown is not "not done"', () => {
    const after = latchFacts({ computer: true, key: false }, { computer: null, key: null });
    expect(after.computer).toBe(true);
    expect(after.key).toBeNull();
    const steps = stepsFrom(after);
    expect(steps.find((s) => s.id === 'key')?.unknown).toBe(true);
    // An unknown step never shrinks the count into "all done": no count at all while one is unknown.
    expect(progressOf(steps)).toBeNull();
    expect(progressOf(stepsFrom({ computer: true, key: false }))).toEqual({ done: 1, total: 2 });
  });

  it('polls provisioning a bounded number of times, then reports it stalled', () => {
    expect(shouldPoll('provisioning', 0)).toBe(true);
    expect(shouldPoll('provisioning', POLLS)).toBe(false);
    expect(shouldPoll('invite', 0)).toBe(false);
    expect(effectiveSetup('provisioning', POLLS)).toBe('stalled');
    expect(effectiveSetup('provisioning', 3)).toBe('provisioning');
    expect(effectiveSetup('expired', POLLS)).toBe('expired');
  });

  it('arranges widgets by order, then by the user order, and hides the hidden', () => {
    const w = [
      { key: 'b:x', order: 20 },
      { key: 'a:x', order: 10 },
      { key: 'c:x', order: 30 },
    ];
    expect(arrange(w, { order: [], hidden: [] }).all.map((x) => x.key)).toEqual(['a:x', 'b:x', 'c:x']);
    expect(arrange(w, { order: ['c:x', 'a:x'], hidden: [] }).all.map((x) => x.key)).toEqual(['c:x', 'a:x', 'b:x']);
    expect(arrange(w, { order: [], hidden: ['b:x'] }).shown.map((x) => x.key)).toEqual(['a:x', 'c:x']);
  });

  it('moves a key up or down and stops at the edges', () => {
    expect(moveKey(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveKey(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveKey(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveKey(['a'], 'zz', 1)).toEqual(['a']);
  });

  it('toggles hidden keys without duplicates', () => {
    const p = setHidden(setHidden({ order: [], hidden: [] }, 'a', true), 'a', true);
    expect(p.hidden).toEqual(['a']);
    expect(setHidden(p, 'a', false).hidden).toEqual([]);
  });

  it('drops a stored preference that is not exactly two string lists', () => {
    expect(parsePrefs('nope')).toEqual({ order: [], hidden: [] });
    expect(parsePrefs({ order: ['a', 3, null], hidden: 'x' })).toEqual({ order: ['a'], hidden: [] });
  });

  it('steps keyboard focus between cards', () => {
    expect(stepFocus(-1, 3, 'ArrowRight')).toBe(0);
    expect(stepFocus(0, 3, 'ArrowDown')).toBe(1);
    expect(stepFocus(2, 3, 'ArrowRight')).toBe(2);
    expect(stepFocus(1, 3, 'ArrowLeft')).toBe(0);
    expect(stepFocus(1, 3, 'End')).toBe(2);
    expect(stepFocus(0, 0, 'ArrowRight')).toBe(-1);
  });
});

describe('home page', () => {
  beforeEach(() => setAskForFixtures(true));
  afterEach(() => setAskForFixtures(false));
  const greeting = /Good (morning|afternoon|evening)/;

  it('greets the user and shows the first steps while one is not done', async () => {
    await renderPage(page, { state: 'newAccount' });
    expect(await screen.findByRole('heading', { level: 1, name: greeting })).toBeInTheDocument();
    expect(await screen.findByText(strings['steps.title'])).toBeInTheDocument();
  });

  it('shows the Ask strip for the computer and links the context line', async () => {
    await renderPage(page);
    await screen.findByRole('heading', { level: 1, name: greeting });
    expect(await screen.findByRole('button', { name: strings['ask.submit'] })).toBeInTheDocument();
    const line = document.querySelector('p[class*="context"]');
    if (!line) throw new Error('no context line');
    expect(within(line as HTMLElement).getAllByRole('link').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the load error with a retry', async () => {
    await renderPage(page, { state: 'failed' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('asks for a computer when the realm has none', async () => {
    await renderPage(page, { state: 'emptyRealm' });
    expect(await screen.findByText('Personal has no computers yet')).toBeInTheDocument();
  });

  it.each([
    ['invite', 'setup.invite.title'],
    ['inviteFailed', 'setup.inviteFailed.title'],
    ['capacity', 'setup.capacity.title'],
    ['mailbox', 'setup.mailbox.title'],
    ['expired', 'setup.expired.title'],
    ['reinstalled', 'setup.reinstalled.title'],
  ] as const)('shows the %s setup state', async (state, key) => {
    await renderPage(page, { state, realm: 'all' });
    expect(await screen.findByText(strings[key])).toBeInTheDocument();
  });

  // host_reinstalled: nothing renews its computers; the first action opens Computers' Projects, where they
  // are deleted. Beside it: Get a computer only when a server or slice has room for one, else Rent a server, so an
  // ex-renter with no server left is never stuck.
  it('a reinstalled server with no server left offers Projects and Rent a server, not Get a computer', async () => {
    const r = await renderPage(page, { state: 'reinstalled', realm: 'all' });
    expect(await screen.findByText(strings['setup.reinstalled.body'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['setup.reinstalled.go'] })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: strings['action.getComputer'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['setup.rent'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['setup.rentFirst'] }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/market'));
  });
  it('a reinstalled server with a server that has room offers Projects and Get a computer, not Rent', async () => {
    await renderPage(page, { state: 'reinstalledServer', realm: 'all' });
    expect(await screen.findByText(strings['setup.reinstalled.body'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['setup.reinstalled.go'] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['action.getComputer'] })).toHaveAttribute('href', expect.stringContaining('/computers?new=1'));
    expect(screen.queryByRole('button', { name: strings['setup.rentFirst'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['setup.rent'] })).toBeNull();
  });
  it('a reinstalled server with only a slice whose room is not said offers Get a computer and Rent a server', async () => {
    await renderPage(page, { state: 'reinstalledSlice', realm: 'all' });
    expect(await screen.findByRole('link', { name: strings['action.getComputer'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['setup.rentFirst'] })).toBeInTheDocument();
  });
  it('a reinstalled server whose server list could not be read offers Rent a server, never Get a computer on a guess', async () => {
    await renderPage(page, { state: 'reinstalledServersDown', realm: 'all' });
    expect(await screen.findByRole('button', { name: strings['setup.rentFirst'] })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: strings['action.getComputer'] })).toBeNull();
  });
  it('an expired account is unchanged: Rent another server only, no Projects and no Get a computer', async () => {
    await renderPage(page, { state: 'expired', realm: 'all' });
    expect(await screen.findByText(strings['setup.expired.body'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['setup.rent'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['setup.reinstalled.go'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['setup.rentFirst'] })).toBeNull();
    expect(screen.queryByRole('link', { name: strings['action.getComputer'] })).toBeNull();
  });

  it('keeps Redeem locked after a redeem that may have gone through, and sends nothing again', async () => {
    await renderPage(page, { state: 'inviteRedeemLost', realm: 'all' });
    const box = await screen.findByLabelText(strings['setup.invite.field']);
    await userEvent.type(box, 'abc123');
    const redeem = screen.getByRole('button', { name: strings['setup.invite.redeem'] });
    await userEvent.click(redeem);
    await waitFor(() => expect(document.body.textContent).toMatch(/may have gone through/i));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['setup.invite.redeem'] })).toBeDisabled());
  });

  it('asks to pick a computer when several are shown and none is chosen', async () => {
    await renderPage(page, { state: 'pickOne', computer: false });
    expect(await screen.findByText(strings['pick.title'])).toBeInTheDocument();
  });

  it('shows provisioning for an account with no computer on a preparation signal, then stalled once the polls run out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    forced.provisioning = true;
    try {
      await renderPage(page, { state: 'provisioning', realm: 'all' });
      expect(await screen.findByText(strings['setup.provisioning.title'])).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * (POLLS + 1));
      });
      expect(await screen.findByText(strings['setup.stalled.title'])).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      forced.provisioning = false;
    }
  });

  it('opens the Welcome on request with the computer as its first action, and no "ready" title for an unseen account', async () => {
    await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    expect(await screen.findByText(strings['intro.lead'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open atlas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(/ is ready/);
  });

  it('drops the first steps card once the account has a computer and an API key, with the Welcome open or not', async () => {
    const a = await renderPage(page, { state: 'allKeys' });
    await screen.findByText(strings['actions.title']);
    expect(screen.queryByText(strings['steps.title'])).toBeNull();
    a.unmount();
    // The Welcome is a short entry: it holds no step list of its own.
    await renderPage(page, { state: 'allKeys', path: '/home?intro=1' });
    await screen.findByText(strings['intro.lead']);
    expect(screen.queryByText(strings['steps.title'])).toBeNull();
  });

  it('opens Customize from the URL', async () => {
    await renderPage(page, { path: '/home?customize=1' });
    expect(await screen.findByText(strings['customize.title'])).toBeInTheDocument();
  });
});
