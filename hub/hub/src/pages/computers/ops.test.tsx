// C9: a lifecycle press whose answer is unknown stays "pending" across a remount (core's lock, not hook state):
// the row still says so in a fresh mount and offers no second Start.
import { describe, expect, it } from 'vitest';
import { act, renderPage, waitFor, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('lifecycle held state survives a remount', () => {
  it('a pending Start shows pending in a fresh mount and cannot be pressed again', async () => {
    const first = await renderPage(page, { state: 'pendingOps' });
    let table = await screen.findByRole('table', {}, { timeout: 8000 });
    await within(table).findByText('cedar');
    const cedar = () => within(table).getAllByRole('row').find((r) => /cedar/.test(r.textContent ?? ''))!;
    await userEvent.click(within(cedar()).getByRole('button', { name: strings['menu.start'] }));
    expect(await within(cedar()).findByText(strings['op.pill.pending'])).toBeInTheDocument();
    // Leave the page and come back through the same router: the page unmounts, core's registry stays.
    await act(async () => { await first.router.navigate({ to: '/__elsewhere' as never }); });
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    await act(async () => { await first.router.navigate({ to: page.path as never }); });
    table = await screen.findByRole('table', {}, { timeout: 8000 });
    await within(table).findByText('cedar');
    expect(await within(cedar()).findByText(strings['op.pill.pending'])).toBeInTheDocument();
    expect(within(cedar()).queryByRole('button', { name: strings['menu.start'] })).toBeNull();
  });

  it('Dismiss frees the held press in core, after a warning', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    const start = async () => (await screen.findAllByRole('button', { name: strings['menu.start'] }, { timeout: 8000 }))[0]!;
    await userEvent.click(await start());
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    // Gone for good: core's lock is released, so the held band does not come back from it.
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });
});
