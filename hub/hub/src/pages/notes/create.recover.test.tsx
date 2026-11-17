// Vitest: what a proven create does is bound to the New note dialog that sent it.
//  1. A Check again pressed on the toast of a CLOSED dialog proves the note while a newer New note is open: the newer
//     dialog and its typed title stay, and the page does not jump to the older note.
//  2. A Check again that proves the note inside the dialog closes it with the outcome settled: no "This may have gone
//     through" toast follows the opened note.
import { useMemo } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import kit from '@kit/forms/forms.strings.en.json';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';

// The read behind Check again, held until the test lets it answer.
const read = vi.hoisted(() => ({ hold: false, go: (): void => undefined, asked: 0 }));
vi.mock('./data', async (orig) => {
  const m = await orig<typeof Data>();
  return {
    ...m,
    useApi: () => {
      const api = m.useApi();
      return useMemo(
        () => ({
          ...api,
          node: async (...a: Parameters<typeof api.node>) => {
            read.asked += 1;
            if (read.hold) await new Promise<void>((r) => { read.go = r; });
            return api.node(...a);
          },
        }),
        [api],
      );
    },
  };
});
// Every toast the kit opens (the page test has no toast tray): the pending outcome's own, with its Check again.
type Toast = { title: string; tone?: string; action?: { label: string; onAction: () => unknown } };
const tray = vi.hoisted(() => ({ toasts: [] as Toast[] }));
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: Toast) => { tray.toasts.push(c); return `t${tray.toasts.length}`; }, closeToast: () => undefined }));
const pendingToasts = () => tray.toasts.filter((x) => x.tone === 'unknown');
beforeEach(() => { read.hold = false; read.asked = 0; tray.toasts.length = 0; });

const sel = (r: Awaited<ReturnType<typeof renderPage>>) => new URLSearchParams(r.router.state.location.searchStr).get('sel');
const newButtons = () => screen.findAllByRole('button', { name: strings['action.new'] }, { timeout: 8000 });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const theDialog = () => screen.getByRole('dialog', { name: strings['new.title'] });

async function unknownCreate() {
  const r = await renderPage(page, { state: 'createFound' });
  await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  await userEvent.click((await newButtons())[0] as HTMLElement);
  await userEvent.type(await screen.findByLabelText(strings['new.field']), 'Q4 plan');
  await userEvent.click(screen.getByRole('button', { name: strings['new.create'] }));
  await screen.findAllByRole('button', { name: kit['outcome.check'] }, { timeout: 8000 });
  return r;
}

describe('New note: a proven create and the dialog that sent it', () => {
  it('a recovery from a closed dialog leaves a newer New note and its title alone, and does not navigate', async () => {
    const r = await unknownCreate();
    // Close the dialog: its unknown outcome moves to a toast with its own Check again.
    await userEvent.click(within(theDialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(pendingToasts()).toHaveLength(1), { timeout: 8000 });
    expect(pendingToasts()[0]?.action?.label).toBe(kit['outcome.check']);
    read.hold = true;
    const recovery = pendingToasts()[0]?.action?.onAction();
    await waitFor(() => expect(read.asked).toBe(1));
    // Meanwhile: New note on another computer (the last New note button is another computer's group row), a title typed.
    const all = await newButtons();
    await userEvent.click(all[all.length - 1] as HTMLElement);
    const dialog = await screen.findByRole('dialog', { name: strings['new.title'] });
    const field = within(dialog).getByLabelText(strings['new.field']) as HTMLInputElement;
    expect(field).not.toBeDisabled();
    await userEvent.type(field, 'Draft B');
    // The older read answers: the note is there.
    read.go();
    // The toast's Check again still proves it (true closes the toast).
    expect(await recovery).toBe(true);
    await pause(400);
    expect(screen.getByRole('dialog', { name: strings['new.title'] })).toBeInTheDocument();
    expect((screen.getByLabelText(strings['new.field']) as HTMLInputElement).value).toBe('Draft B');
    expect(sel(r)).toBeNull();
  });

  it('a recovery inside the dialog closes it settled: no "may have gone through" toast after the note opened', async () => {
    const r = await unknownCreate();
    await userEvent.click(within(theDialog()).getByRole('button', { name: kit['outcome.check'] }));
    await waitFor(() => expect(sel(r)).not.toBeNull(), { timeout: 8000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await pause(600);
    expect(pendingToasts()).toEqual([]);
  });
});
