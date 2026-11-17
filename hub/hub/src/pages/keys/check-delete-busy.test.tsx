// Keys > API keys: the Delete dialog's Check again shares the row's guard. While the dialog's read is out the row's
// Dismiss is off (a Dismiss now could free the delete the read is about to settle), and while it is out
// a press of the row's Check again sends no second read, also from the sticky toast a closed dialog leaves.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ToastModule from '@kit/states/Toast';
import page from './page';
import overlayStrings from '@kit/overlays/strings.en.json';
import strings from './strings.en.json';
import { slowGate } from './fixtures';

// The sticky toast a closed dialog leaves, caught with its Check again (the pattern of pages/ai/keystep.leave.test.tsx).
type Shown = { title: string; action?: { onAction: () => unknown } };
const toasts = vi.hoisted(() => ({ shown: [] as Shown[] }));
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    toasts.shown.push(c);
    return `t${toasts.shown.length}`;
  },
  closeToast: () => undefined,
}));

afterEach(() => {
  slowGate.reset();
  toasts.shown.length = 0;
});

/** An unconfirmed delete of ci-deploy, its dialog still open (its Check again showing). */
async function unconfirmedDelete() {
  await renderPage(page, { state: 'deleteUnknown' });
  const row = () => screen.getByRole('row', { name: /ci-deploy/ });
  await screen.findByRole('row', { name: /ci-deploy/ }, { timeout: 8000 });
  await userEvent.click(row());
  const insp = screen.getByRole('region', { name: 'Details' });
  await userEvent.click(within(insp).getByRole('button', { name: strings['act.delete'] }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: strings['del.go'] }));
  const dialogCheck = await within(dialog).findByRole('button', { name: strings['state.checkAgain'] }, { timeout: 8000 });
  await within(row()).findByRole('button', { name: strings['dismiss.act'] }, { timeout: 8000 });
  return { row, dialogCheck };
}

describe('keys: the Delete dialog Check again and the row guard', () => {
  it("turns the row's Dismiss off while the dialog's read is out", async () => {
    const { row, dialogCheck } = await unconfirmedDelete();
    const dismiss = () => within(row()).getByRole('button', { name: strings['dismiss.act'] });
    expect(dismiss()).toBeEnabled();
    slowGate.hold();
    const before = slowGate.arrived;
    await userEvent.click(dialogCheck);
    await waitFor(() => expect(slowGate.arrived).toBeGreaterThan(before));
    await waitFor(() => expect(dismiss()).toBeDisabled());
    slowGate.release();
    await waitFor(() => expect(dismiss()).toBeEnabled(), { timeout: 8000 });
  }, 40000);

  it("keeps the row guarded while the closed dialog's toast Check is out", async () => {
    const { row } = await unconfirmedDelete();
    // Closed with the delete unconfirmed: its sticky toast keeps the dialog's Check again.
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: overlayStrings.close }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const toastCheck = await waitFor(() => {
      // The newest showing of the notice (it is shown again as the page re-renders): its Check again.
      const a = toasts.shown.map((c) => c.action).filter((x) => x !== undefined);
      expect(a.length).toBeGreaterThan(0);
      return a[a.length - 1]!;
    });
    slowGate.hold();
    const before = slowGate.arrived;
    const out = Promise.resolve(toastCheck.onAction());
    await waitFor(() => expect(slowGate.arrived).toBe(before + 1));
    await waitFor(() => expect(within(row()).getByRole('button', { name: strings['dismiss.act'] })).toBeDisabled());
    await userEvent.click(within(row()).getByRole('button', { name: strings['state.checkAgain'] }));
    await new Promise((r) => setTimeout(r, 300)); // reason: a second read would arrive at the gate within this tick
    expect(slowGate.arrived).toBe(before + 1);
    slowGate.release();
    await out;
  }, 40000);
});
