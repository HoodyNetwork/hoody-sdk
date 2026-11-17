// Vitest: the Snapshots tab's send-time check. A change goes by name, so each send asks isVmUnsure right before its
// request, whatever the controls drew. Here the answer turns to "unsure" with no redraw of the tab (controls stay on,
// open questions stay open), so only that check can stop the send: take, a confirmed restore and a confirmed delete.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports fixtures.snap and calls its states(), so it must start the cycle.
import './fixtures';
import { snapLog, snapOrder, resetSnapFixtures } from './fixtures.snap';
import page from './page';
import type * as Unsure from './parts/unsure';
import strings from './strings.en.json';

// What the send-time check answers on top of the real one; the render-time hook keeps the real answer.
const sendTime = { unsure: false };
vi.mock('./parts/unsure', async (orig) => {
  const real = await orig<typeof Unsure>();
  return { ...real, isVmUnsure: (name: string) => sendTime.unsure || real.isVmUnsure(name) };
});

vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const STOPPED = '/vms/win11?tab=snapshots';
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const button = (name: string) => screen.findByRole('button', { name }, WAIT);
const dialog = (name: string) => screen.findByRole('alertdialog', { name }, WAIT).catch(() => screen.findByRole('dialog', { name }, WAIT));
const restoreButton = () => button(say('snap.row.restoreName', { label: 'clean-install' }));
const readsSince = (before: number) => snapOrder.slice(before).filter((x) => x.startsWith('read:'));

beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => {
  resetSnapFixtures();
  sendTime.unsure = false;
});

describe('the send-time check alone stops a change while the name is not sure', () => {
  it('take: the drawer still offers it; pressing it reads no list and sends nothing', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await restoreButton();
    await userEvent.click(await button(strings['snap.take.open']));
    const drawer = await dialog(say('snap.take.title', { vm: 'win11' }));
    const go = within(drawer).getByRole('button', { name: strings['snap.take.go'] });
    sendTime.unsure = true;
    expect(go).not.toHaveAttribute('aria-disabled', 'true');
    const before = snapOrder.length;
    await userEvent.click(go);
    await pause(1500);
    expect(readsSince(before)).toEqual([]);
    expect(snapLog).toEqual([]);
  });

  it('restore: the question stays open; confirming reads no list and sends nothing', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await userEvent.click(await restoreButton());
    const d = await dialog(say('snap.restore.title', { label: 'clean-install' }));
    sendTime.unsure = true;
    const before = snapOrder.length;
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
    await pause(1500);
    expect(readsSince(before)).toEqual([]);
    expect(snapLog).toEqual([]);
  });

  it('delete: the question stays open; confirming reads no list and sends nothing', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const row = (await restoreButton()).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${say('snap.row.deleteName', { label: 'clean-install' })}`) }, WAIT));
    const d = await dialog(say('snap.remove.title', { label: 'clean-install' }));
    sendTime.unsure = true;
    const before = snapOrder.length;
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.remove.go'] }));
    await pause(1500);
    expect(readsSince(before)).toEqual([]);
    expect(snapLog).toEqual([]);
  });

  it('control: with the check answering "sure", the same delete is sent once', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    const row = (await restoreButton()).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${say('snap.row.deleteName', { label: 'clean-install' })}`) }, WAIT));
    const d = await dialog(say('snap.remove.title', { label: 'clean-install' }));
    await userEvent.click(within(d).getByRole('button', { name: strings['snap.remove.go'] }));
    await waitFor(() => expect(snapLog).toEqual([{ change: 'remove', vm: 'win11', label: 'clean-install' }]), WAIT);
  });
});
