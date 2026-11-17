// The name dialog (New folder) closes once its pending send is settled: proved made by its own Check again, or settled
// elsewhere (another tab's proof, a Dismiss). It leaves no "may have gone through" toast behind for a change already
// settled. Closed by the person while the send is still unknown (Cancel), it does: that case is the control, and it
// shows the recorder sees the kit's leave toast at all.
// The send's own answer is lost (a folder named `lost`, fixtures.ts), and the listing leaves that name out until the
// test lets it show, so nothing settles the send before the test means it to.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { complete, holdOfLock, lockBase, pendingOf, release } from '@core/changes';
import type * as ToastModule from '@kit/states/Toast';
import formStrings from '@kit/forms/forms.strings.en.json';
import { resetFiles, skipInListingWhile } from './fixtures';
import { FILES_LOCK } from './data';
import page from './page';
import strings from './strings.en.json';

type Shown = { tone?: string; title?: string };
const toasts = vi.hoisted(() => ({ shown: [] as Shown[] }));
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<typeof ToastModule>()),
  showToast: (c: Shown) => {
    toasts.shown.push(c);
    return `t${toasts.shown.length}`;
  },
  closeToast: () => undefined,
}));

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const paneA = () => screen.getByRole('region', { name: strings['pane.a'] });
const table = async () => within(await screen.findByRole('region', { name: strings['pane.a'] })).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const SLOW = { timeout: 20_000 };
// The kit's leave toast: the bare title (the dialog names no subject).
const leaveToasts = () => toasts.shown.filter((c) => c.tone === 'unknown' && c.title === formStrings['outcome.toastTitle']);
// The leave toast opens a tick after its place goes.
const aTick = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

/** New folder "lost", sent, its answer lost: the dialog shows "may have gone through". */
async function pendingNewFolder() {
  await renderPage(page, { path: ADA });
  await table();
  const stop = skipInListingWhile('/home/ada', 'lost');
  await userEvent.click(within(paneA()).getByRole('button', { name: strings['action.newFolder'] }));
  const d = await screen.findByRole('dialog');
  await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'lost');
  await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
  expect(await within(d).findAllByText(/may have gone through/i, undefined, SLOW)).not.toHaveLength(0);
  return { d, stop };
}

beforeEach(() => {
  resetFiles();
  toasts.shown.length = 0;
});

describe('the name dialog leaves no "may have gone through" toast for a settled send', () => {
  it('proved made by its own Check again: it closes, and no toast follows', async () => {
    const { d, stop } = await pendingNewFolder();
    stop();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
    await aTick();
    expect(leaveToasts()).toEqual([]);
  }, 60_000);

  for (const how of ['complete', 'release'] as const) {
    it(`settled elsewhere (${how}) while it shows the pending send: it closes, and no toast follows`, async () => {
      const { d } = await pendingNewFolder();
      const held = pendingOf(lockBase(FILES_LOCK));
      expect(held).toHaveLength(1);
      const { scope, digest } = held[0]!;
      const hold = holdOfLock(scope, digest)!;
      const ok = how === 'complete' ? await complete(scope, digest, hold) : await release(scope, digest, hold, { warned: true, nobodys: true });
      expect(ok, 'the hold was still there to settle').toBe(true);
      await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
      await aTick();
      expect(leaveToasts()).toEqual([]);
    }, 60_000);
  }

  it('closed by the person while the send is unknown: the toast takes the outcome', async () => {
    const { d } = await pendingNewFolder();
    await userEvent.click(within(d).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(d.isConnected).toBe(false), SLOW);
    await aTick();
    expect(leaveToasts()).toHaveLength(1);
  }, 60_000);
});
