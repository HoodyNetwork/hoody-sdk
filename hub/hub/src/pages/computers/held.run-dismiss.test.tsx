// Held changes: Run's Dismiss names the computer it was sent to, and a create
// or rename that may have gone through cannot be submitted again from its form.
import { chooseComputer, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const named = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const disabled = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';

describe('held changes: Run\'s Dismiss and a held create', () => {
  it("Run: Dismiss frees a command held on a computer that is not the current one, after the tab comes back", async () => {
    const r = await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1&tab=run' });
    // Another computer is current: atlas is only the one shown.
    await act(async () => { chooseComputer(named('cedar')); });
    await userEvent.type(await screen.findByRole('textbox', { name: strings['run.label'] }, { timeout: 8000 }), 'uptime');
    await userEvent.click(screen.getByRole('button', { name: strings['run.go'] }));
    expect(await screen.findByText(strings['held.run'].replace('{{name}}', 'atlas'), {}, { timeout: 8000 })).toBeInTheDocument();
    // Leave the tab and come back: the band comes from core's hold, not this mount.
    await act(async () => { await r.router.navigate({ to: page.path as never, search: { sel: 'atlas.00a1', tab: 'overview' } as never }); });
    await act(async () => { await r.router.navigate({ to: page.path as never, search: { sel: 'atlas.00a1', tab: 'run' } as never }); });
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(strings['held.run'].replace('{{name}}', 'atlas'))).toBeNull(), { timeout: 8000 });
    await act(async () => { await new Promise((res) => setTimeout(res, 300)); });
    expect(screen.queryByText(strings['held.run'].replace('{{name}}', 'atlas'))).toBeNull();
  }, 40000);

  it('Rename: while a rename may have gone through, its confirm is disabled', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3' });
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'cedar') }, { timeout: 8000 }));
      await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.rename'] }));
      return screen.findByRole('alertdialog', {}, { timeout: 8000 });
    };
    const dlg = await open();
    await userEvent.type(within(dlg).getByRole('textbox', { name: strings['rename.label'] }), '-2');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['rename.go'] }));
    // The dialog is read afresh after the send: its body re-renders as the hold arrives, and a node kept from before
    // can be detached by then (a detached root has no getElementById, so the role query throws).
    const live = () => screen.getByRole('alertdialog');
    expect(await screen.findByText(/may already have gone through/i, {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(disabled(within(live()).getByRole('button', { name: strings['rename.go'] }))).toBe(true), { timeout: 8000 });
  }, 40000);

  it('Create: while a create may have gone through, its submit is disabled', async () => {
    await renderPage(page, { state: 'pendingOps' });
    await screen.findByRole('table', {}, { timeout: 8000 });
    await userEvent.click(screen.getAllByRole('button', { name: strings['action.get'] })[0]!);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['create.go'] }));
    expect(await within(dlg).findByText(/may already have been made/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(disabled(within(dlg).getByRole('button', { name: strings['create.go'] }))).toBe(true);
  });
});
