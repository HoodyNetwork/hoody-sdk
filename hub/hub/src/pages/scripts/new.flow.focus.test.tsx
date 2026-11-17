// Vitest (New script): where focus goes. Opening the flow puts the caret in the
// description; a step change (Continue, Back) moves focus into the new step's first field; with the assistant
// unavailable its card is disabled and last, the write way is the default, and nothing focuses a dead box.
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ writer: true }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: () => fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1', { writer: io.writer }), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2', { writer: io.writer })])(),
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

beforeEach(() => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  io.writer = true;
});

describe('New script flow: focus', () => {
  it('opening the flow puts the caret at the end of the description', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const box = await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW);
    await waitFor(() => expect(document.activeElement).toBe(box));
  });

  it('Continue moves focus into the next step\'s first field; Back moves it into the step before', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
    await user.click(screen.getByRole('button', { name: strings['flow.continue'] }));
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    // Two computers: the picker is the step's first field.
    await waitFor(() => expect(document.activeElement && document.activeElement !== document.body).toBe(true));
    // The step is a kit Section: a region named by its title.
    const step = screen.getByRole('region', { name: strings['flow.where.title'] });
    expect(step.contains(document.activeElement)).toBe(true);
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toBe('/scripts/new/aaaaaaaaaa'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: strings['flow.what.describe'] })));
  });

  it('with the assistant unavailable: its card is disabled and last, the write way is the default, no dead box takes focus', async () => {
    io.writer = false;
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const ai = await screen.findByRole('button', { name: new RegExp(strings['flow.what.aiCard']) }, SLOW);
    expect((ai as HTMLButtonElement).disabled).toBe(true);
    const cards = ai.parentElement?.querySelectorAll('button') ?? [];
    expect(cards[cards.length - 1]).toBe(ai);
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`^${strings['flow.what.writeCard']}`) }).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement === document.body || !document.activeElement?.closest('textarea')).toBe(true);
  });

  it('the caret moves without scrolling the page (focus asks for no scroll)', async () => {
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
    const box = await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW);
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('opened on a ready-made idea (?idea=), no description field shows and nothing takes the caret', async () => {
    await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa?idea=kv-note' });
    await screen.findByRole('radiogroup', { name: strings['new.pickIdea'] }, SLOW);
    expect(screen.queryByRole('textbox', { name: strings['flow.what.describe'] })).toBeNull();
    expect(['INPUT', 'TEXTAREA']).not.toContain(document.activeElement?.tagName);
  });
});
