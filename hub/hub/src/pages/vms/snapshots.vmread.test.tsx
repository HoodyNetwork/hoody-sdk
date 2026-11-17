// Vitest: the Snapshots tab's own read of the VM against the VM the screen shows. Changes go by name, so when that read
// names another VM id, take, restore and delete are off and nothing is sent, also when it turns so during the list
// read a take or a confirmed restore makes right before its send.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// fixtures.ts first: it imports fixtures.snap and calls its states(), so it must start the cycle.
import './fixtures';
import { snapLog, snapOrder, resetSnapFixtures } from './fixtures.snap';
import page from './page';
import type * as Snaps from './snapshots';
import strings from './strings.en.json';

// What the tab's own VM read answers: null leaves the real read alone.
const vmRead: { id: string | null } = { id: null };
vi.mock('./snapshots', async (orig) => {
  const real = await orig<typeof Snaps>();
  return {
    ...real,
    useSnapshotsVm: (name: string, enabled: boolean) => {
      const q = real.useSnapshotsVm(name, enabled);
      return vmRead.id === null || q.data === undefined ? q : { ...q, data: { ...q.data, vmId: vmRead.id } };
    },
  };
});

vi.setConfig({ testTimeout: 45000 });
const WAIT = { timeout: 10000 };
const say = (key: keyof typeof strings, vars: Record<string, string | number> = {}): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), strings[key]);
const STOPPED = '/vms/win11?tab=snapshots';
const OTHER = '0195c0de0000ffff';
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const button = (name: string) => screen.findByRole('button', { name }, WAIT);
const dialog = (name: string) => screen.findByRole('alertdialog', { name }, WAIT).catch(() => screen.findByRole('dialog', { name }, WAIT));
const restoreButton = () => button(say('snap.row.restoreName', { label: 'clean-install' }));
/** Runs `fn` with the tab's VM read turning to another VM at the next list read. */
async function turningDuringRead(fn: (before: number) => Promise<void>) {
  const push = snapOrder.push.bind(snapOrder);
  snapOrder.push = (...xs: string[]) => {
    if (xs.includes('read:win11')) vmRead.id = OTHER;
    return push(...xs);
  };
  try { await fn(snapOrder.length); } finally { snapOrder.push = push; }
}

beforeAll(async () => { await import('./view'); }, 180000);
beforeEach(() => {
  resetSnapFixtures();
  vmRead.id = null;
});

describe("the tab's own read names another VM under the name", () => {
  it('take, restore and delete are off with the reason', async () => {
    vmRead.id = OTHER;
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await waitFor(async () => expect(await restoreButton()).toHaveAttribute('aria-disabled', 'true'), WAIT);
    expect(await button(strings['snap.take.open'])).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(strings['power.why.unread']).length).toBeGreaterThan(0);
    await userEvent.click(await restoreButton());
    await pause(500);
    expect(screen.queryByText(say('snap.restore.title', { label: 'clean-install' }))).toBeNull();
    // Delete sits in the row's menu: off there too, and pressing it asks nothing.
    const row = (await restoreButton()).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    const del = await screen.findByRole('menuitem', { name: new RegExp(`^${say('snap.row.deleteName', { label: 'clean-install' })}`) }, WAIT);
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(del).catch(() => undefined);
    await pause(500);
    expect(screen.queryByText(say('snap.remove.title', { label: 'clean-install' }))).toBeNull();
    expect(snapLog).toEqual([]);
  });

  it('it turns so during the list read a take makes before its send: the read comes back and no take is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await restoreButton();
    await userEvent.click(await button(strings['snap.take.open']));
    const drawer = await dialog(say('snap.take.title', { vm: 'win11' }));
    await turningDuringRead(async (before) => {
      await userEvent.click(within(drawer).getByRole('button', { name: strings['snap.take.go'] }));
      await waitFor(() => expect(snapOrder.slice(before)).toContain('read:win11'), WAIT);
      await pause(1500);
    });
    expect(vmRead.id).toBe(OTHER);
    expect(snapLog).toEqual([]);
  });

  it('it turns so during the list read a confirmed restore makes: nothing is sent', async () => {
    await renderPage(page, { state: 'snap-many', path: STOPPED });
    await userEvent.click(await restoreButton());
    const d = await dialog(say('snap.restore.title', { label: 'clean-install' }));
    await turningDuringRead(async (before) => {
      await userEvent.click(within(d).getByRole('button', { name: strings['snap.restore.go'] }));
      await waitFor(() => expect(snapOrder.slice(before)).toContain('read:win11'), WAIT);
      await pause(1500);
    });
    expect(vmRead.id).toBe(OTHER);
    expect(snapLog).toEqual([]);
  });
});
