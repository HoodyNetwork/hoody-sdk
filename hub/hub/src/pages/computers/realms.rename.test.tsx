// The Realms drawer offers the shell's Rename realms: an action under the list that opens the shell's
// dialog on its list of every realm, and nothing where the shell doesn't offer renaming (useRenameRealms() is null: a
// token session pinned to one realm, or no shell, as in renderPage). The list itself is the kit's picker.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { interpolate } from '@kit';
import type * as Kit from '@kit';
import page from './page';
import strings from './strings.en.json';

// The opener the shell would provide; null is renderPage's real answer (no shell around the page).
const shell = vi.hoisted(() => ({ open: null as null | ((realmId?: string) => void) }));
vi.mock('@kit', async (importOriginal) => ({ ...(await importOriginal<typeof Kit>()), useRenameRealms: () => shell.open }));

// The file's first render pays the page's cold start (over 8 s under load, past the old 8 s wait), so the wait and the
// tests' own budget leave room for it.
async function openDrawer() {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=ports' });
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }, { timeout: 30000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.realms'] }));
  return screen.findByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) });
}

afterEach(() => {
  shell.open = null;
});

describe('computers: Rename realms from the Realms drawer', { timeout: 60000 }, () => {
  it('with the shell offering it, Rename realms opens its dialog on the list of every realm and keeps the drawer', async () => {
    const open = vi.fn();
    shell.open = open;
    const d = await openDrawer();
    await userEvent.click(within(d).getByRole('button', { name: strings['realmsd.rename'] }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith();
    expect(screen.getByRole('dialog', { name: interpolate(strings['realmsd.title'], { name: 'atlas' }) })).toBeInTheDocument();
  }, 40000);

  it('where renaming is not offered, the drawer has no Rename realms action', async () => {
    const d = await openDrawer();
    expect(within(d).getByRole('checkbox', { name: /^Personal/ })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['realmsd.rename'] })).toBeNull();
  }, 40000);

  it('the realms are the kit picker, named Realms, with its live line for the count', async () => {
    const d = await openDrawer();
    const list = within(d).getByRole('group', { name: strings['col.realms'] });
    expect(within(list).getByRole('checkbox', { name: /^Personal/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(d).getByRole('status')).toHaveTextContent(interpolate(strings['realmsd.summary_one'], { count: 1, name: 'atlas' }));
  }, 40000);
});
