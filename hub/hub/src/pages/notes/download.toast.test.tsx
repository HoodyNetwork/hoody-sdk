// Vitest: a download error toast carries its fix. A failed download (a read: nothing changed) offers
// Try again, which downloads again; a note too big to download offers Open note, which opens it in its own tab.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Kit from '@kit';
import page from './page';
import strings from './strings.en.json';

type Toast = { title: string; tone?: string; action?: { label: string; onAction: () => unknown } };
const S = vi.hoisted(() => ({ toasts: [] as Toast[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, showToast: (c: Toast) => { S.toasts.push(c); return `toast-${S.toasts.length}`; } };
});
afterEach(() => { S.toasts.length = 0; vi.restoreAllMocks(); });

async function downloadWeeklyPlan(state: string) {
  const user = userEvent.setup();
  await renderPage(page, { state });
  const table = await screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
  const row = await within(table).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
  await user.click(within(row).getByRole('button', { name: 'Row actions' }));
  await user.click(await screen.findByRole('menuitem', { name: strings['action.download'] }));
  await waitFor(() => expect(S.toasts).toHaveLength(1));
  return S.toasts[0]!;
}

describe('Notes: a download error toast carries its fix', () => {
  it('a failed download: an error with Try again, which downloads again (another toast, nothing else)', async () => {
    const toast = await downloadWeeklyPlan('downloadFailed');
    expect(toast).toMatchObject({ title: strings['toast.downloadFailed'], tone: 'error' });
    expect(toast.action?.label).toBe(strings['action.tryAgain']);
    toast.action!.onAction();
    await waitFor(() => expect(S.toasts).toHaveLength(2));
    expect(S.toasts[1]).toMatchObject({ title: strings['toast.downloadFailed'], tone: 'error' });
  });

  it('a note too big to download: an error with Open note, which opens the note in its own tab', async () => {
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    const toast = await downloadWeeklyPlan('downloadTooBig');
    expect(toast).toMatchObject({ title: strings['toast.downloadTooBig'], tone: 'error' });
    expect(toast.action?.label).toBe(strings['action.openNote']);
    toast.action!.onAction();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0]![1]).toBe('_blank');
  });
});
