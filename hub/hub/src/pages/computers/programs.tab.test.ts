// The Programs tab: system programs are one collapsed group row of the same table,
// not a second table; Logs goes through the Logs page's own link; stopping or restarting a system
// program asks with the accent action, never danger.
import { describe, expect, it } from 'vitest';
import { heldChanges, programLock } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const open = () => renderPage(page, { path: '/computers?sel=atlas.00a1&tab=programs' });

describe('computers: Programs tab', () => {
  it('system programs sit in one collapsed group row of the programs table', async () => {
    await open();
    const table = await screen.findByRole('table', { name: strings['prog.title'] });
    const group = await within(table).findByRole('button', { name: new RegExp(strings['prog.systemTitle']) });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('row', { name: /hoody-agent/ })).toBeNull();
    expect(screen.queryByRole('table', { name: strings['prog.systemTitle'] })).toBeNull();
    await userEvent.click(group);
    expect(await within(table).findByRole('row', { name: /hoody-agent/ })).toBeInTheDocument();
  });

  it("a program's Logs link opens that program on this computer (logsLinkFor)", async () => {
    await open();
    const table = await screen.findByRole('table', { name: strings['prog.title'] });
    const row = await within(table).findByRole('row', { name: /^web/ });
    expect(within(row).getByRole('link', { name: new RegExp(strings['prog.logs']) })).toHaveAttribute('href', expect.stringMatching(/\/logs\?computer=atlas\.00a1&src=programs&program=1$/));
  });

  it('a system restart asks with the accent action, not danger', async () => {
    await open();
    const table = await screen.findByRole('table', { name: strings['prog.title'] });
    await userEvent.click(await within(table).findByRole('button', { name: new RegExp(strings['prog.systemTitle']) }));
    const row = await within(table).findByRole('row', { name: /hoody-agent/ });
    await userEvent.click(within(row).getByRole('button', { name: /actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['prog.restart'] }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: strings['prog.restart'] }).className).not.toMatch(/danger/i);
  });

  it('a held stop offers a warned Dismiss in its row menu; confirming frees the row and the lock in core', async () => {
    await renderPage(page, { state: 'pendingPrograms', path: '/computers?sel=atlas.00a1&tab=programs' });
    const table = await screen.findByRole('table', { name: strings['prog.title'] });
    const menuOf = async () => within(await within(table).findByRole('row', { name: /^web/ })).getByRole('button', { name: /actions/i });
    await userEvent.click(await menuOf());
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['prog.stop'] }));
    const pill = await within(table).findByText(strings['op.pill.pending']);
    // Short words in the pill; the full sentence is its tooltip.
    expect(pill.closest('[title]')).toHaveAttribute('title', strings['op.pending']);
    expect(heldChanges(programLock.stop)).toHaveLength(1);
    await userEvent.click(await menuOf());
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['held.dismiss'] }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['held.dismissTitle'] });
    expect(within(dialog).getByText(strings['held.dismissBodyChange'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.dismissBody'])).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(within(table).queryByText(strings['op.pill.pending'])).toBeNull());
    expect(heldChanges(programLock.stop)).toHaveLength(0);
  });
});
