// Vitest (New script, where Cancel lives): a create wizard keeps Cancel in its footer row, beside the step's main action,
// never in the page header. It leaves as before: straight to the scripts when nothing would be lost, and through the
// "leave?" question when something typed would be.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: () => Promise.resolve({ outcome: 'done', data: { matched: false } }) }),
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import * as fx from './new/flowfix';
import strings from './strings.en.json';

// The first render loads the whole wizard: on a busy machine that alone can pass the default limits.
const SLOW = { timeout: 30000 };
const LIMIT = 60000;
const loc = (r: { router: { state: { location: { pathname: string } } } }) => r.router.state.location.pathname;
const footerOf = (el: HTMLElement) => el.closest('[class*="wizardFooter"]');

beforeEach(() => {
  clearDrafts(); mintDraft('bbbbbbbbbb');
  fx.shown.id = fx.ATLAS;
});

describe('New script: Cancel', () => {
  it('sits in the footer row with Continue, before it, and the page header holds no button', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    const go = await screen.findByRole('button', { name: strings['flow.continue'] }, SLOW);
    const cancel = screen.getByRole('button', { name: strings['new.cancel'] });
    expect(footerOf(go)).not.toBeNull();
    expect(footerOf(cancel)).toBe(footerOf(go));
    expect(cancel.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const header = screen.getByRole('heading', { level: 1, name: strings['new.title'] }).closest('header') as HTMLElement;
    expect(header.querySelectorAll('button')).toHaveLength(0);
    // Cancel backs out: no forward glyph.
    expect(cancel.hasAttribute('data-glyph')).toBe(false);
  }, LIMIT);

  it('with nothing typed it goes straight back to the scripts', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    await screen.findByRole('button', { name: strings['flow.continue'] }, SLOW);
    await user.click(screen.getByRole('button', { name: strings['new.cancel'] }));
    await waitFor(() => expect(loc(r)).toBe('/scripts'));
    expect(screen.queryByText(strings['flow.leave.title'])).toBeNull();
  }, LIMIT);

  it('with something typed it asks before leaving, and Stay keeps the step', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
    const cancel = screen.getByRole('button', { name: strings['new.cancel'] });
    expect(footerOf(cancel)).not.toBeNull();
    await user.click(cancel);
    expect(await screen.findByText(strings['flow.leave.title'], undefined, SLOW)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: strings['flow.leave.stay'] }));
    await waitFor(() => expect(screen.queryByText(strings['flow.leave.title'])).toBeNull());
    expect(loc(r)).toBe('/scripts/new/bbbbbbbbbb');
  }, LIMIT);
});
