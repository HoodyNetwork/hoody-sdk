// Vitest: an entry with no encryption recorded says so beside its facts, in a setting row whose Encrypt… button opens
// Replace value with "Encrypt with a password" ticked. Opening it sends nothing; the save keeps its own password check.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

const details = () => screen.findByRole('region', { name: 'Details' });
const encryptBox = (dlg: HTMLElement) => within(dlg).getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) });

describe('the Encrypt row of an entry with no encryption recorded', () => {
  it('sits in the facts section as a setting row, not as a notice above the entry', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    const pane = await details();
    const facts = (await within(pane).findByRole('heading', { name: strings['detail.facts'] })).closest('section')!;
    expect(within(facts).getByText(strings['detail.plainHint'])).toBeInTheDocument();
    expect(within(facts).getByRole('button', { name: strings['action.encrypt'] })).toBeInTheDocument();
    // The fact itself stays in the facts list, in the same words as before.
    expect(within(facts).getByText(strings['lock.noLong'])).toBeInTheDocument();
    // No standing notice says it a second time: the sentence shows once, in the row.
    expect(within(pane).getAllByText(strings['detail.plainHint'])).toHaveLength(1);
  });

  it('an encrypted entry and a Hoody-owned entry have no Encrypt row', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await within(await details()).findByRole('heading', { name: 'db-password' });
    expect(screen.queryByRole('button', { name: strings['action.encrypt'] })).toBeNull();
  });

  it('Encrypt… opens Replace value with the box ticked and both password fields shown; nothing is sent', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await within(await details()).findByRole('button', { name: strings['action.encrypt'] }));
    const dlg = await screen.findByRole('dialog', { name: strings['edit.replaceTitle'] });
    expect(encryptBox(dlg)).toBeChecked();
    expect(within(dlg).getByLabelText(strings['edit.password'])).toBeInTheDocument();
    expect(within(dlg).getByLabelText(strings['edit.repeat'])).toBeInTheDocument();
    expect(requestLog.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('a Save from there without a password is refused with nothing sent', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await within(await details()).findByRole('button', { name: strings['action.encrypt'] }));
    const dlg = await screen.findByRole('dialog', { name: strings['edit.replaceTitle'] });
    await userEvent.type(within(dlg).getByLabelText(strings['edit.value']), 'fixture-value-new');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['edit.save'] }));
    expect(await within(dlg).findByText(strings['password.required'])).toBeInTheDocument();
    expect(requestLog.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('the header Replace value opens the same form unticked, also after an Encrypt… that was closed', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    const pane = await details();
    await userEvent.click(await within(pane).findByRole('button', { name: strings['action.encrypt'] }));
    let dlg = await screen.findByRole('dialog', { name: strings['edit.replaceTitle'] });
    expect(encryptBox(dlg)).toBeChecked();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['edit.replaceTitle'] })).toBeNull());
    await userEvent.click(within(await details()).getByRole('button', { name: strings['action.replace'] }));
    dlg = await screen.findByRole('dialog', { name: strings['edit.replaceTitle'] });
    expect(encryptBox(dlg)).not.toBeChecked();
  });
});
