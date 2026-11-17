// On Computers, a computer that does not answer a read is said to be not reachable (core reachOf, kit
// UnreachableState), never shown as fewer programs or desktops; one that answered with an error keeps its own words.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { lostReads } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import stateStrings from '@kit/states/strings.en.json';

const REACH = /^atlas isn't reachable right now/;
const host = { ...page, load: () => import('./widget') };

describe('computers: a computer that does not answer', () => {
  it('Programs tab: the not-reachable state with Try again, not the generic table error', async () => {
    await renderPage(page, { state: 'programsLost', path: '/computers?sel=atlas.00a1&tab=programs' });
    const panel = await screen.findByRole('tabpanel', undefined, { timeout: 8000 });
    const reach = await within(panel).findByText(REACH, undefined, { timeout: 8000 });
    expect(reach.closest('[data-reach="unreachable"]')).not.toBeNull();
    const retry = within(panel).getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toBeEnabled());
    const before = lostReads.programs;
    await userEvent.click(retry);
    await waitFor(() => expect(lostReads.programs).toBeGreaterThan(before));
  }, 30000);

  it('Desktop tab: the list gets no answer: a not-reachable line with Try again; desktop 1 still opens', async () => {
    await renderPage(page, { state: 'desktopsLost', path: '/computers?sel=atlas.00a1&tab=desktop' });
    await screen.findByTitle('atlas, desktop 1', undefined, { timeout: 8000 });
    const reach = await screen.findByText(REACH, undefined, { timeout: 8000 });
    const line = reach.closest('[data-reach="unreachable"]') as HTMLElement;
    expect(line).not.toBeNull();
    const before = lostReads.desktops;
    await userEvent.click(within(line).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(lostReads.desktops).toBeGreaterThan(before));
    expect(await screen.findByText(REACH, undefined, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('Desktop tab: the list answered with an error: its own warning, never the not-reachable words', async () => {
    await renderPage(page, { state: 'desktopsDown', path: '/computers?sel=atlas.00a1&tab=desktop' });
    await screen.findByTitle('atlas, desktop 1', undefined, { timeout: 8000 });
    const band = (await screen.findByText(strings['desktop.listDown'], undefined, { timeout: 8000 })).closest('[role]') as HTMLElement;
    expect(screen.queryByText(REACH)).toBeNull();
    // It reads the list again (Try again), and its facts sit behind Details.
    expect(within(band).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    const before = lostReads.desktopsDown;
    await userEvent.click(within(band).getByRole('button', { name: strings['desktop.tryAgain'] }));
    await waitFor(() => expect(lostReads.desktopsDown).toBeGreaterThan(before));
  }, 30000);

  it('widget: programs with no answer say so, never a hidden programs link with nothing said', async () => {
    await renderPage(host, { state: 'programsLost' });
    const reach = await screen.findByText(REACH, undefined, { timeout: 8000 });
    expect(reach.closest('[data-reach="unreachable"]')).not.toBeNull();
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toBeEnabled());
    const before = lostReads.programs;
    await userEvent.click(retry);
    await waitFor(() => expect(lostReads.programs).toBeGreaterThan(before));
  }, 30000);

  it('widget: programs answered with an error: "Couldn\'t read its programs" with Try again, never the not-reachable words', async () => {
    await renderPage(host, { state: 'programsDown' });
    const line = await screen.findByText((_, el) => el?.getAttribute('role') === 'alert' && !!el.textContent?.includes(strings['widget.programsUnread']), undefined, { timeout: 8000 });
    // The mapped reason and next step stay (what ErrorState said): a 500 reads as the server's problem.
    expect(line.textContent).toContain(stateStrings['err.server']);
    expect(within(line).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText(REACH)).toBeNull();
    const before = lostReads.programsDown;
    await userEvent.click(within(line).getByRole('button', { name: strings['widget.tryAgain'] }));
    await waitFor(() => expect(lostReads.programsDown).toBeGreaterThan(before));
  }, 30000);

  it('widget: programs refused with a 403: the permission words stay with the title (the mapped sentence, never lost)', async () => {
    await renderPage(host, { state: 'programsDenied' });
    const line = await screen.findByText((_, el) => el?.getAttribute('role') === 'alert' && !!el.textContent?.includes(strings['widget.programsUnread']), undefined, { timeout: 8000 });
    expect(line.textContent).toContain(stateStrings['err.forbidden']);
    expect(within(line).getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText(REACH)).toBeNull();
  }, 30000);
});
