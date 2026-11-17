// Vitest: the Board hands its computer read to Broadcast, so a failed first read shows Broadcast's read error
// with Try again inside the mounted panel, never "no computers" and never a reading state that does not end.
import { cleanup, renderPage, screen, userEvent, within } from '@app/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetBoardsForTests } from './data';
import page from './page';

const g = globalThis as unknown as Record<string, unknown>;

// A browser that can broadcast (capability.ts), so the panel shows its computer step instead of the capability note.
const capable = () => {
  const keys = ['isSecureContext', 'MediaRecorder', 'Request', 'ReadableStream'] as const;
  const had = Object.fromEntries(keys.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const nav = globalThis.navigator as unknown as Record<string, unknown>;
  const hadMedia = Object.getOwnPropertyDescriptor(nav, 'mediaDevices');
  Object.defineProperty(g, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(nav, 'mediaDevices', { value: { getDisplayMedia: () => Promise.reject(new Error('no')) }, configurable: true });
  g.MediaRecorder = Object.assign(function MediaRecorder() {}, { isTypeSupported: () => true });
  g.ReadableStream = class {};
  g.Request = class { headers = { has: () => false }; constructor(_u: string, init: { duplex?: string }) { void init.duplex; } };
  return () => {
    for (const k of keys) { const d = had[k]; if (d) Object.defineProperty(g, k, d); else delete g[k]; }
    if (hadMedia) Object.defineProperty(nav, 'mediaDevices', hadMedia); else delete nav.mediaDevices;
  };
};

// The Board view is a lazy chunk: its first import is transformed cold, which takes tens of seconds on a slow machine.
// Load it once before the tests so the first test's find timeout measures the page, not the transform.
beforeAll(async () => { await page.load(); }, 180_000);

let restore: () => void = () => {};
beforeEach(() => { resetBoardsForTests(); restore = capable(); });
// Unmount first, so the browser stubs are still in place while the panel tears down; both tests fail the read through the page's `state`.
afterEach(() => { cleanup(); restore(); });

describe('Broadcast on the Board: a computer list that is not known', () => {
  it('a failed first read: the panel says the computers could not be read, with Try again', async () => {
    await renderPage(page, { state: 'failed' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Broadcast' }));
    const panel = await screen.findByRole('dialog', { name: 'Broadcast this Board' });
    expect(await within(panel).findByText("Couldn't read your computers")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
  });

  it('the failed read carries its rejection: the read error offers Details', async () => {
    await renderPage(page, { state: 'failed' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Broadcast' }));
    const panel = await screen.findByRole('dialog', { name: 'Broadcast this Board' });
    await within(panel).findByText("Couldn't read your computers");
    expect(within(panel).getByText('Details')).toBeInTheDocument();
  });
});
