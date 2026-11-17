// Vitest: a save whose answer may have gone through stays on the page's hold banner once the drawer closes.
// The kit's leave-toast (a second Check again for the same send) is off here: it outlived the banner's warned
// Dismiss and page moves, covered the floating New entry on a phone, and its Check again then said
// "no answer" for a hold the person had already stopped waiting for. So the banner must be on screen wherever
// the page is: in the 403 layout, and in an open entry's detail for any hold (the list is off screen on a phone).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { deleteEntry } from './data';
import { requestLog, resetFixtureVaults } from './fixtures';
import { GLOBAL } from './logic';

const toasts = vi.hoisted(() => ({ shown: [] as { tone?: string }[] }));
vi.mock('../../kit/states/Toast', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const real = m.showToast as (c: { tone?: string }, timeout?: number) => string;
  return {
    ...m,
    showToast: (c: { tone?: string }, timeout?: number) => {
      toasts.shown.push(c);
      return real(c, timeout);
    },
  };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  toasts.shown.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

describe('a held save after its drawer closes', () => {
  it('shows only the page banner: no leave-toast with its own Check again', async () => {
    await renderPage(page, { state: 'unknown', path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'held-save');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await screen.findByText('Saving held-save in Personal may have gone through');
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: /^close$/i }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The leave-toast fires a tick after the drawer unmounts.
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByText('Saving held-save in Personal may have gone through')).toBeInTheDocument();
    expect(toasts.shown.filter((c) => c.tone === 'unknown')).toEqual([]);
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });
});

describe('a hold stays reachable wherever the page is', () => {
  const heldDelete = /^Deleting shared-webhook-url in .+ may have gone through$/;
  const holdOn = async () => {
    const first = await renderPage(page, { state: 'unknown', path: '/vault' });
    await act(async () => {
      expect((await deleteEntry(GLOBAL, 'shared-webhook-url')).outcome).toBe('pending');
    });
    first.unmount();
  };

  it('the 403 layout still shows the hold, and its warned Stop tracking frees it', async () => {
    await holdOn();
    await renderPage(page, { state: 'forbidden', path: '/vault' });
    expect(await screen.findByText(strings['forbidden.title'])).toBeInTheDocument();
    const banner = (await screen.findByText(heldDelete)).closest('[role="alert"]') as HTMLElement;
    await userEvent.click(within(banner).getByRole('button', { name: /stop/i }));
    const ask = await screen.findByRole('alertdialog', { name: strings['hold.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(screen.queryByText(heldDelete)).toBeNull());
    expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });

  it('the banner button, the warned question and its confirm use one verb', async () => {
    await holdOn();
    await renderPage(page, { state: 'unknown', path: '/vault' });
    const banner = (await screen.findByText(heldDelete)).closest('[role="alert"]') as HTMLElement;
    const confirm = strings['hold.dismissConfirm'];
    // The kit banner's close is the button "Stop tracking" (the same words as HeldBand), no ellipsis.
    await userEvent.click(within(banner).getByRole('button', { name: confirm }));
    const ask = await screen.findByRole('alertdialog', { name: strings['hold.dismissTitle'] });
    expect(strings['hold.dismissTitle'].startsWith(`${confirm} `)).toBe(true);
    expect(within(ask).getByRole('button', { name: confirm })).toBeInTheDocument();
    // The bodies that say how to end a hold name the same button.
    for (const k of ['hold.bodyDelete', 'hold.bodyClear', 'hold.unproven'] as const) expect(strings[k]).toContain(confirm.toLowerCase());
  });

  it("another entry's open detail shows the hold, once", async () => {
    await holdOn();
    await renderPage(page, { state: 'unknown', path: '/vault?sel=github-token' });
    const details = await screen.findByRole('region', { name: 'Details' });
    await within(details).findByText(heldDelete);
    expect(screen.getAllByText(heldDelete)).toHaveLength(1);
  });

  it('a not-found detail shows the hold too', async () => {
    await holdOn();
    await renderPage(page, { state: 'unknown', path: '/vault?sel=no-such-entry' });
    const details = await screen.findByRole('region', { name: 'Details' });
    await within(details).findByText(heldDelete);
    expect(screen.getAllByText(heldDelete)).toHaveLength(1);
  });
});
