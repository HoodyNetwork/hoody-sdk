// Vitest: "Take a snapshot…" in a computer's menu opens that computer's Backups tab with its Take drawer open: the one
// take form, so one POST with the typed name, never twice; an unknown outcome stays held with Check again, which only
// reads (C9). The item is off, with its reason, for a computer that is neither running nor stopped, and left out for a
// key without the snapshot rights (as every item the session may not do).
import { describe, expect, it } from 'vitest';
import { type Translate } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computerMenu } from './parts/menu';
import { snapshotTakes } from './snapshots/fixtures';
import page from './page';
import strings from './strings.en.json';
import snapStrings from './snapshots/strings.en.json';
import type { Computer } from './types';

const tt = ((k: keyof typeof strings) => strings[k]) as Translate<typeof strings>;
const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' } as Computer;
const ids = (c: Computer, caps: Parameters<typeof computerMenu>[1]) => computerMenu(c, caps, true, tt, () => {}).map((e) => (e === '-' ? '-' : e.id));
const entry = (c: Computer, caps: Parameters<typeof computerMenu>[1]) => {
  const e = computerMenu(c, caps, true, tt, () => {}).find((x) => x !== '-' && x.id === 'snapshot');
  if (!e || e === '-') throw new Error('no snapshot entry');
  return e;
};

let rendered: Awaited<ReturnType<typeof renderPage>> | null = null;

async function menuItem(name: string, state?: string) {
  rendered = await renderPage(page, { path: '/computers', ...(state ? { state } : {}) });
  const card = await screen.findByRole('article', { name }, { timeout: 30000 });
  await userEvent.click(within(card).getByRole('button', { name: /actions/i }));
  const menu = await screen.findByRole('menu');
  return within(menu).getByRole('menuitem', { name: new RegExp(strings['menu.snapshot']) });
}

/** The Take drawer the menu opened, with `name` typed and given. */
async function takeFromMenu(name: string, state?: string) {
  await userEvent.click(await menuItem('atlas', state));
  const d = await screen.findByRole('dialog', { name: snapStrings['take.title'] }, { timeout: 15000 });
  const field = within(d).getByRole('textbox', { name: snapStrings['field.snapName'] });
  await waitFor(() => expect((field as HTMLInputElement).value).toMatch(/^snap-/));
  await userEvent.clear(field);
  await userEvent.type(field, name);
  await userEvent.click(within(d).getByRole('button', { name: snapStrings['take.go'] }));
  return d;
}

const sent = (name: string) => snapshotTakes.filter((b) => (b as { alias?: unknown } | null)?.alias === name).length;

describe('computers menu: Take a snapshot…', () => {
  it('sits right after Make a copy…, on for a running or stopped computer', () => {
    const list = ids(C, 'all');
    expect(list[list.indexOf('copy') + 1]).toBe('snapshot');
    for (const status of ['running', 'stopped']) expect(entry({ ...C, status }, 'all').isDisabled).toBeFalsy();
  });

  it('is off with the reason for any other status, and left out for a key without the snapshot rights', () => {
    for (const status of ['paused', 'starting', 'failed', 'stopping', undefined]) {
      const e = entry({ ...C, status } as Computer, 'all');
      expect(e.isDisabled).toBe(true);
      expect(e.disabledReason).toBe(strings['menu.snapshotState']);
    }
    for (const caps of [new Set(['computers.update', 'account']), new Set(['computers.features.snapshots', 'account'])]) expect(ids(C, caps)).not.toContain('snapshot');
  });

  it('in the row menu, a paused computer shows the status reason', { timeout: 60000 }, async () => {
    const item = await menuItem('fjord');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).toContain(strings['menu.snapshotState']);
  });

  it('a key without the snapshot rights is not offered the item', { timeout: 60000 }, async () => {
    await renderPage(page, { path: '/computers', state: 'limited' });
    const card = await screen.findByRole('article', { name: 'atlas' }, { timeout: 30000 });
    await userEvent.click(within(card).getByRole('button', { name: /actions/i }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(strings['menu.snapshot']) })).toBeNull();
  });

  it('opens the Backups tab with the Take drawer; a proved take sends one POST and shows in the list', { timeout: 60000 }, async () => {
    const before = sent('from-menu');
    await takeFromMenu('from-menu');
    await waitFor(() => expect(screen.getByRole('tab', { name: strings['tab.backups'] })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: snapStrings['take.title'] })).toBeNull(), { timeout: 10000 });
    expect(await within(document.getElementById('snapshots')!).findByText('from-menu', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(sent('from-menu')).toBe(before + 1);
    // The menu's ask is used once: the address no longer asks for the drawer.
    expect(rendered?.router.state.location.href).not.toMatch(/[?&]take=/);
  });

  it('an unknown take stays held with Check again, which reads only: still one POST, never failed', { timeout: 60000 }, async () => {
    const before = sent('lost-menu');
    const d = await takeFromMenu('lost-menu', 'pendingOps');
    expect(await within(d).findByText(new RegExp(snapStrings['held.take'].split('{{name}}')[0]!.trim()), {}, { timeout: 10000 })).toBeInTheDocument();
    expect(within(d).queryByRole('textbox', { name: snapStrings['field.snapName'] })).toBeNull();
    expect(within(d).queryByText(/failed|could not be taken/i)).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: snapStrings['held.check'] }));
    await waitFor(() => expect(within(d).getByRole('button', { name: snapStrings['held.check'] })).toBeEnabled());
    expect(sent('lost-menu')).toBe(before + 1);
  });
});
