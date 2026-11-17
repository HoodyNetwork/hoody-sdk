// Vitest (New script frame): the wizard's flow variant. A step strip over the page (a done step is a button
// back to it), "Your script so far" beside the fill-in steps only, no subtitle repeating the step names, and the footer's
// one line saying what the primary does next (or why it is closed), which the primary points at (aria-describedby).
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
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

const SLOW = { timeout: 14000 };

beforeEach(() => {
  clearDrafts(); mintDraft('bbbbbbbbbb');
  fx.shown.id = fx.ATLAS;
});

describe('New script frame', () => {
  it('shows the steps as a strip, the card beside What, no repeated subtitle, and Continue described by its note', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    const nav = await screen.findByRole('navigation', { name: 'Steps' }, SLOW);
    expect(within(nav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('complementary', { name: strings['flow.rail.title'] })).toBeTruthy();
    expect(screen.queryByText(strings['flow.subtitle'])).toBeNull();
    const note = screen.getByText(strings['flow.note.what']);
    expect(screen.getByRole('button', { name: strings['flow.continue'] }).getAttribute('aria-describedby')).toBe(note.id);
    // Cancel backs out: no forward glyph (the kit's dismiss rule); Continue goes on and keeps it.
    expect(screen.getByRole('button', { name: strings['new.cancel'] }).hasAttribute('data-glyph')).toBe(false);
    expect(screen.getByRole('button', { name: strings['flow.continue'] }).hasAttribute('data-glyph')).toBe(true);
  });

  it('a done step in the strip goes back to it', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'many', path: '/scripts/new/bbbbbbbbbb' });
    await user.click(await screen.findByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }, SLOW));
    await screen.findByRole('textbox', { name: strings['new.address'] }, SLOW);
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    await user.click(within(nav).getByRole('button', { name: `Go back to step 1: ${strings['flow.step.what']}` }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['new.address'] })).toBeNull(), SLOW);
  });
});
