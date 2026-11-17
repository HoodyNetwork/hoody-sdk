// Vitest: usability cases. A save whose answer may have gone through does not
// blame the person for the value it cleared; a plain entry says how to protect it; the shown value's hint names
// the control it means.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { heldChanges } from '@core';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { deleteEntry, dismissHold, LOCK } from './data';
import { REALM_A, requestLog, resetFixtureVaults } from './fixtures';
import { GLOBAL, heldIdentity } from './logic';

const shell = vi.hoisted(() => ({ signOut: vi.fn() as (() => void) | undefined }));
vi.mock('@kit', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  const real = m.useShellData as () => Record<string, unknown>;
  return { ...m, showToast: vi.fn(), useShellData: () => ({ ...real(), signOut: shell.signOut }) };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  shell.signOut = vi.fn();
  vi.stubGlobal('isSecureContext', true);
});

describe('usability', () => {
  it('a save that may have gone through does not say "Enter a value" for the value it cleared', async () => {
    await renderPage(page, { state: 'unknown', path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-value-ci');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect((within(dlg).getByLabelText(strings['edit.value']) as HTMLInputElement).value).toBe('');
    expect(within(dlg).queryByText(strings['value.required'])).toBeNull();
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('a save that may have gone through says so in the form, and why the value field is empty', async () => {
    await renderPage(page, { state: 'unknown', path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-value-ci');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText(/Saving ci-token in Personal may have gone through/)).toBeInTheDocument();
    expect(within(dlg).getByText(new RegExp(strings['edit.sentCleared']))).toBeInTheDocument();
  });

  it('a refused save without a value still says "Enter a value"', async () => {
    await renderPage(page, { path: `/vault` });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(await screen.findByText(strings['value.required'])).toBeInTheDocument();
    expect(requestLog.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('a plain entry says how to protect it with a password; an encrypted one does not', async () => {
    expect(strings['detail.plainHint']).toBeTruthy();
    const { router } = await renderPage(page, { path: `/vault?sel=github-token` });
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(await within(details).findByText(strings['detail.plainHint'])).toBeInTheDocument();
    await router.navigate({ to: '/vault' as never, search: { in: REALM_A, sel: 'db-password' } as never });
    expect(await within(await screen.findByRole('region', { name: 'Details' })).findByRole('heading', { name: 'db-password' })).toBeInTheDocument();
    expect(screen.queryByText(strings['detail.plainHint'])).toBeNull();
  });

  it('the value hint holds whether the value is unread or shown, and says it is read on the eye or Copy and hiding removes it', async () => {
    expect(strings['value.desc']).not.toMatch(/until you press Show\b/);
    expect(strings['value.desc']).not.toMatch(/Masked|Forget value/);
    expect(strings['value.desc']).toMatch(/hiding it removes it from this page/);
    expect(strings['value.desc']).toMatch(/Read only on the eye or Copy/);
  });

  it('an entry without the encrypted marker is not called plain before its value was read', async () => {
    expect(strings['detail.plainHint']).not.toMatch(/^Not encrypted/);
    // Unread, the value may be an envelope saved without the marker: the hint never calls it plain.
    expect(strings['detail.plainHint']).not.toMatch(/\bplain\b/i);
    expect(strings['detail.plainHint']).toContain('To protect this value with a password');
    await renderPage(page, { state: 'unmarked', path: `/vault?sel=old-secret` });
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(await within(details).findByText(strings['detail.plainHint'])).toBeInTheDocument();
    // The eye finds the envelope: the hint goes, nothing was stored.
    await userEvent.click(within(details).getByRole('button', { name: strings['value.showEye'] }));
    expect(await within(details).findByLabelText(strings['value.password'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(strings['detail.plainHint'])).toBeNull());
    expect(requestLog.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('a pending save whose hold was freed elsewhere does not promise a read, whatever other holds remain', async () => {
    await renderPage(page, { state: 'unknown', path: `/vault` });
    // Another partition's change, also held: it must not make this form think its own save is still held.
    await act(async () => {
      expect((await deleteEntry(GLOBAL, 'shared-webhook-url')).outcome).toBe('pending');
    });
    await userEvent.click(await screen.findByRole('button', { name: strings['action.new'] }));
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'ci-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-value-ci');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText(new RegExp(strings['hold.bodyPut']))).toBeInTheDocument();
    const h = heldChanges(LOCK).find((x) => heldIdentity(x.identity)?.op === 'put')!;
    await act(async () => {
      expect(await dismissHold({ change: h, id: heldIdentity(h.identity)!, own: true, from: h.from })).toBe(true);
    });
    expect(await within(dlg).findByText(new RegExp(strings['edit.freedElsewhere']))).toBeInTheDocument();
    expect(within(dlg).queryByText(new RegExp(strings['hold.bodyPut']))).toBeNull();
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
    expect(heldChanges(LOCK)).toHaveLength(1);
  });

  it('without the encrypted marker the list, the facts and the filter say "not marked", never "not encrypted"', async () => {
    expect(strings['lock.no']).toBe('Not marked');
    expect(strings['filter.plain']).toBe('Not marked');
    expect(strings['lock.noLong']).toBe('Not marked as encrypted');
    await renderPage(page, { state: 'unmarked', path: `/vault?sel=old-secret` });
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(await within(details).findByText(strings['lock.noLong'])).toBeInTheDocument();
    expect(screen.queryByText('Not encrypted')).toBeNull();
  });

  it('a 403 points at the top bar for another realm or Global, and offers Sign out', async () => {
    await renderPage(page, { state: 'forbidden', path: '/vault' });
    expect(await screen.findByText(strings['forbidden.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['partition.pickOther'])).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['access.signOut'] }));
    expect(shell.signOut).toHaveBeenCalledTimes(1);
  });

  it('an access-key session offers Sign out, the way to the account vault', async () => {
    await renderPage(page, { state: 'accessKey', path: '/vault' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['access.signOut'] }));
    expect(shell.signOut).toHaveBeenCalledTimes(1);
    expect(requestLog.filter((r) => r.path.startsWith('/vault'))).toEqual([]);
  });

  it('without a shell sign-out the blocked states show no dead button', async () => {
    shell.signOut = undefined;
    await renderPage(page, { state: 'accessKey', path: '/vault' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['access.signOut'] })).toBeNull();
  });
});

describe('Clear vault sits in the page overflow', () => {
  const more = () => screen.findByRole('button', { name: strings['action.more'] });

  it('no Clear button sits in the header beside New entry', async () => {
    await renderPage(page, { path: `/vault` });
    expect(await screen.findByRole('button', { name: strings['action.new'] })).toBeInTheDocument();
    expect(await more()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.clear'] })).toBeNull();
  });

  it('the overflow offers Clear vault… as a danger item that opens the typed confirmation', async () => {
    await renderPage(page, { path: `/vault` });
    await userEvent.click(await more());
    const item = await screen.findByRole('menuitem', { name: strings['action.clear'] });
    expect(item.className).toMatch(/danger/);
    await userEvent.click(item);
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByRole('button', { name: strings['clear.confirm'] })).toBeDisabled();
    expect(requestLog.filter((r) => r.method === 'DELETE')).toEqual([]);
  });

  it('while a 429 wait runs, the item is disabled and says how long to wait', async () => {
    await renderPage(page, { state: 'rateLimited', path: `/vault` });
    await userEvent.click(await more());
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.clear'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.type(within(dlg).getByRole('textbox'), 'Personal');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['clear.confirm'] }));
    expect(await screen.findByText(/Wait \d+ seconds/)).toBeInTheDocument();
    await userEvent.click(await more());
    const item = await screen.findByRole('menuitem', { name: new RegExp(strings['action.clear']) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent(/Wait \d+ s/);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(requestLog.filter((r) => r.method === 'DELETE' && r.path === '/vault')).toHaveLength(1);
  });

  it('an empty vault offers no overflow and no Clear', async () => {
    await renderPage(page, { state: 'empty', path: `/vault` });
    expect(await screen.findByText(strings['empty.title'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.more'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['action.clear'] })).toBeNull();
  });
});
