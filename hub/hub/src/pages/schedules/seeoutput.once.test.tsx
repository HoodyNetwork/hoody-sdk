// Vitest: a See output ask is handled once. Leaving the row and coming back (History remounts
// for each row) never opens, scrolls to or focuses that run again; a new press does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const scrolled = vi.fn();
const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });

describe('See output', () => {
  it('opens its run once per press; coming back to the row does not open it again, a new press does', async () => {
    const { router } = await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa3' });
    const see = () => screen.findByRole('button', { name: strings['hist.seeOutput'] });
    await userEvent.click(await see());
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    // A second press on the same row opens it again.
    await userEvent.click(await see());
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(2));
    await act(async () => { router.history.push('/schedules?sel=cron%3Auser%2Fa1'); });
    await settle();
    await act(async () => { router.history.push('/schedules?sel=cron%3Auser%2Fa3'); });
    await see();
    await settle();
    await settle();
    expect(scrolled).toHaveBeenCalledTimes(2);
    await userEvent.click(await see());
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(3));
  });
});
