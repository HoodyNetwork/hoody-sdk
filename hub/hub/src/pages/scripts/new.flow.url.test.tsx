// Vitest (New script): the flow's URLs are real history. /scripts/new is replaced by
// its draft's URL; each step change pushes ?step=, so browser Back walks the steps and keeps every input; another
// draft is another URL.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import strings from './strings.en.json';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const describeBox = () => screen.getByRole('textbox', { name: strings['flow.what.describe'] });


// The draft map is per tab: each test starts with none.
beforeEach(() => { clearDrafts(); mintDraft('aaaaaaaaaa'); mintDraft('abcdefghij'); mintDraft('bbbbbbbbbb'); });

describe('New script flow: URLs', () => {
  it('replaces /scripts/new with the draft\'s own URL, keeping ?exec= and ?idea=', async () => {
    const r = await renderPage(page, { state: 'many', path: '/scripts/new?exec=3&idea=kv-note' });
    await waitFor(() => expect(r.router.state.location.pathname).toMatch(/^\/scripts\/new\/[0-9a-z]{10}$/));
    expect(r.router.state.location.searchStr).toContain('exec=3');
    expect(r.router.state.location.searchStr).toContain('idea=kv-note');
    // Replaced, not pushed: Back from step 1 leaves the flow, never returns to the bare /scripts/new.
    expect(r.router.history.length).toBe(1);
  });

  it('pushes each step: What → Where → Build, then Back lands on Where with every input kept', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new' });
    await waitFor(() => expect(r.router.state.location.pathname).toMatch(/^\/scripts\/new\/[0-9a-z]{10}$/));
    const draft = r.router.state.location.pathname;
    await user.type(describeBox(), 'Count sign-ups every Monday');
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toBe(`${draft}?step=where`));
    const address = screen.getByRole('textbox', { name: strings['new.address'] });
    await user.clear(address);
    await user.type(address, '/monday');
    await user.click(await screen.findByRole('button', { name: strings['flow.where.build'] }, SLOW));
    await waitFor(() => expect(loc(r)).toBe(`${draft}?step=build`));
    await act(async () => { r.router.history.back(); });
    await waitFor(() => expect(loc(r)).toBe(`${draft}?step=where`));
    expect((screen.getByRole('textbox', { name: strings['new.address'] }) as HTMLInputElement).value).toBe('/monday');
    await act(async () => { r.router.history.back(); });
    await waitFor(() => expect(loc(r)).toBe(draft));
    expect((describeBox() as HTMLTextAreaElement).value).toBe('Count sign-ups every Monday');
  });

  it('a deep link past what is reachable is clamped with replace, never pushed', async () => {
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/abcdefghij?step=check' });
    await waitFor(() => expect(loc(r)).toBe('/scripts/new/abcdefghij'));
    expect(r.router.history.length).toBe(1);
  });

  it('two drafts are two URLs with their own inputs, each kept in this tab', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'first');
    // The typed description is not kept anywhere else: leaving asks first.
    void r.router.navigate({ href: '/scripts/new/bbbbbbbbbb' } as never);
    await user.click(await screen.findByRole('button', { name: strings['flow.leave.go'] }, SLOW));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/scripts/new/bbbbbbbbbb'));
    await waitFor(() => expect((describeBox() as HTMLTextAreaElement).value).toBe(''));
    // The first draft is kept in this tab: its URL brings back what was typed.
    r.router.history.back();
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/scripts/new/aaaaaaaaaa'));
    await waitFor(() => expect((describeBox() as HTMLTextAreaElement).value).toBe('first'));
  });

  it('an id that is not a draft id shows the can\'t-open page, never "does not exist"', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/not-a-draft' });
    expect(await screen.findByText(strings['flow.gone.title'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['flow.gone.new'] })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/does not exist|doesn't exist|not found/i);
  });
});
