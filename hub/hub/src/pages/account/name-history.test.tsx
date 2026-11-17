// Vitest: the display name change and the security history, in the page's fixture states.
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { historyEventKey, nameProblem } from './logic';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}

describe('display name', () => {
  it('judges a name before it is sent: empty, too long and unchanged are refused', () => {
    expect(nameProblem('', 'Ada')).toBe('empty');
    expect(nameProblem('   ', 'Ada')).toBe('empty');
    expect(nameProblem('x'.repeat(101), 'Ada')).toBe('long');
    expect(nameProblem(' Ada ', 'Ada')).toBe('same');
    expect(nameProblem('Ada L.', 'Ada')).toBeNull();
    expect(nameProblem('x'.repeat(100), 'Ada')).toBeNull();
  });

  it('the profile row opens the name drawer, kept in the URL, with the current name filled in', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: strings['p.rename'] }, { timeout: 8000 }));
    const dialog = await openDialog();
    expect(router.state.location.search).toMatchObject({ sheet: 'name' });
    expect(within(dialog).getByLabelText(strings['p.alias'])).toHaveValue('Ada');
  });

  it('refuses an empty name with the field error and sends nothing', async () => {
    await renderPage(page, { state: 'rename-pending', path: '/account?sheet=name' });
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText(strings['p.alias']);
    await userEvent.clear(field);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    expect(await within(dialog).findByText(strings['p.eEmpty'])).toBeInTheDocument();
    // Nothing went out: the pending fixture would have locked the drawer.
    expect(within(dialog).queryByRole('button', { name: strings['check.again'] })).not.toBeInTheDocument();
  });

  it('a saved name closes the drawer and says so', async () => {
    const { router } = await renderPage(page, { path: '/account?sheet=name' });
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText(strings['p.alias']);
    await userEvent.clear(field);
    await userEvent.type(field, 'Ada L.');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    expect(await screen.findByText(strings['p.renamed'])).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'name' }));
  });

  it('a change whose outcome is unknown locks the drawer to Check again (C9: never sent twice)', async () => {
    await renderPage(page, { state: 'rename-pending', path: '/account?sheet=name' });
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText(strings['p.alias']);
    await userEvent.clear(field);
    await userEvent.type(field, 'Ada L.');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    expect(await within(dialog).findByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['p.save'] })).not.toBeInTheDocument();
    expect(within(dialog).getByText(strings['err.pending'])).toBeInTheDocument();
  });

  it('a refused change says so and keeps the drawer open', async () => {
    await renderPage(page, { state: 'rename-failed', path: '/account?sheet=name' });
    const dialog = await openDialog();
    const field = within(dialog).getByLabelText(strings['p.alias']);
    await userEvent.clear(field);
    await userEvent.type(field, 'Ada L.');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['p.save'] }));
    expect(await within(dialog).findByText(strings['err.generic'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['p.save'] })).toBeInTheDocument();
  });

  it('a suspended account gets no name drawer from a link', async () => {
    await renderPage(page, { state: 'suspended', path: '/account?sheet=name' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('security history', () => {
  it('names the events it knows and shows unknown ones as plain text', () => {
    expect(historyEventKey('login')).toBe('h.e.login');
    expect(historyEventKey('login_failed')).toBe('h.e.login_failed');
    expect(historyEventKey('otp_disabled')).toBe('h.e.otp_disabled');
    expect(historyEventKey('something_new')).toBeNull();
  });

  it('lists the sign-ins with where they came from', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['h.title'] }, { timeout: 8000 });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(3);
    expect(within(table).getAllByText(strings['h.e.login']).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/203\.0\.113\.24 · SG/).length).toBeGreaterThan(0);
    // Sign-ins only by default: no refused attempt is mixed in.
    expect(within(table).queryByText(strings['h.e.login_failed'])).not.toBeInTheDocument();
  });

  it('Everything adds refused attempts and other security events, refused ones marked', async () => {
    await renderPage(page, { path: '/account?history=all' });
    const table = await screen.findByRole('table', { name: strings['h.title'] }, { timeout: 8000 });
    expect((await within(table).findAllByText(strings['h.e.login_failed'])).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(strings['h.refused']).length).toBeGreaterThan(0);
    expect(within(table).getByText(strings['h.e.otp_enabled'])).toBeInTheDocument();
    // An event name the page does not know shows as its cleaned text, never dropped.
    expect(within(table).getByText('backup code used')).toBeInTheDocument();
  });

  it('a country the server could not place shows as unknown, never as a place', async () => {
    await renderPage(page, { path: '/account?history=all' });
    const table = await screen.findByRole('table', { name: strings['h.title'] }, { timeout: 8000 });
    expect(within(table).getAllByText(new RegExp(strings['h.noCountry'])).length).toBeGreaterThan(0);
  });

  it('an empty history says so', async () => {
    await renderPage(page, { state: 'history-empty' });
    expect(await screen.findByText(strings['h.none'], {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a history that cannot be read offers a retry and the rest of the page still shows', async () => {
    await renderPage(page, { state: 'history-error' });
    const table = await screen.findByRole('table', { name: strings['h.title'] }, { timeout: 8000 });
    expect(table).toBeInTheDocument();
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /try again|retry/i }).length).toBeGreaterThan(0);
  });

  it('a suspended account keeps the history section (the API serves it to a suspended account), and none of the settings', async () => {
    await renderPage(page, { state: 'suspended' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: strings['h.title'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: strings['s.title'] })).toBeInTheDocument();
    expect((await screen.findAllByText(strings['h.e.login'], undefined, { timeout: 8000 })).length).toBeGreaterThan(0);
    for (const k of ['p.title', 'pw.title', '2fa.title', 'mail.title'] as const) expect(screen.queryByRole('heading', { name: strings[k] })).toBeNull();
  });
});
