// Vitest: the vault page over core's fixture transport (fixtures.ts). What is sent is read from the fixtures'
// request log; what is shown, from the screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { showToast } from '@kit';
import page from './page';
import strings from './strings.en.json';
import { FIXTURE_PASSWORD, FIXTURE_PLAINTEXT, REALM_A, REALM_B, requestLog, resetFixtureVaults } from './fixtures';
import { decrypt, isEncrypted } from './crypto';
import { ALIAS_KEY } from './logic';
import { act } from '@app/testing';
import { resetChanges } from '@core/changes';
import { bump, setRealm } from '@core/ctx';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(showToast).mockClear();
});

const valueReads = () => requestLog.filter((r) => r.method === 'GET' && /^\/vault\/keys\/./.test(r.path));
const table = () => screen.findByRole('table', { name: strings.title });
const details = () => screen.findByRole('region', { name: 'Details' });
const delItem = (n: string) => n.startsWith(strings['action.delete']);
/** Delete is in the open entry's own menu, not a header button. */
const openDelete = async () => {
  await userEvent.click(within(await details()).getByRole('button', { name: 'More actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: delItem }));
};

describe('the list', () => {
  it('shows names and metadata of the shell realm, and reads no value', async () => {
    await renderPage(page, { path: '/vault' });
    const tb = await table();
    await within(tb).findByRole('row', { name: /github-token/ });
    expect(within(tb).getByRole('row', { name: /db-password/ })).toHaveTextContent(strings['lock.yes']);
    expect(within(tb).getByRole('row', { name: /github-token/ })).toHaveTextContent(strings['lock.no']);
    expect(valueReads()).toEqual([]);
    const lists = requestLog.filter((r) => r.path === '/vault/keys');
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((r) => r.query.realm_id === REALM_A)).toBe(true);
  });

  it('Global sends no realm_id at all and shows Hoody entries as such', async () => {
    await renderPage(page, { path: '/vault', realm: 'all' });
    const tb = await table();
    const row = await within(tb).findByRole('row', { name: new RegExp(ALIAS_KEY.replace('.', '\\.')) });
    expect(row).toHaveTextContent(strings['kind.hoody']);
    const lists = requestLog.filter((r) => r.path === '/vault/keys');
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((r) => !('realm_id' in r.query))).toBe(true);
  });

  it('opening an entry reads no value until the eye is pressed', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await screen.findByText(strings['detail.facts']);
    expect(valueReads()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(valueReads()).toHaveLength(1);
    expect(valueReads()[0]!.query.realm_id).toBe(REALM_A);
  });

  it('another realm is its own partition', async () => {
    await renderPage(page, { path: '/vault', realm: REALM_B });
    const tb = await table();
    await within(tb).findByRole('row', { name: /stripe-key/ });
    expect(within(tb).queryByRole('row', { name: /github-token/ })).toBeNull();
  });
});

describe('values', () => {
  it('an encrypted value opens with its password, and the password field is cleared', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    const pw = await screen.findByLabelText(strings['value.password']);
    await userEvent.type(pw, 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    expect(await screen.findByText(strings['crypto.decrypt-failed'])).toBeInTheDocument();
    expect((screen.getByLabelText(strings['value.password']) as HTMLInputElement).value).toBe('');
    await userEvent.type(screen.getByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(screen.queryByLabelText(strings['value.password'])).toBeNull();
    // Opened from the eye: the plaintext shows at once (one press, no second Show).
    expect(document.body.textContent).toContain(FIXTURE_PLAINTEXT);
  });

  it('hiding the value drops it; the next eye press reads again', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    await userEvent.click(screen.getByRole('button', { name: strings['value.hideEye'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(valueReads()).toHaveLength(2);
  });
});

describe('new entry', () => {
  it('saves with a write id in the metadata, and refuses a name that is taken', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'api-key');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-new-value');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(requestLog.some((r) => r.method === 'PUT')).toBe(true));
    const put = requestLog.find((r) => r.method === 'PUT')!;
    expect(put.query.realm_id).toBe(REALM_A);
    const body = put.body as { value: string; metadata: Record<string, unknown> };
    expect(body.value).toBe('fixture-new-value');
    expect(typeof body.metadata.write_id).toBe('string');
    expect(body.metadata.encrypted).toBeUndefined();
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
  });

  it('refuses a name that is already there, without sending', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'github-token');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'x-value');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    expect(await screen.findByText(strings['notSent.exists'])).toBeInTheDocument();
    expect(requestLog.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('encrypts with a password: what is sent is an envelope that opens with it', async () => {
    await renderPage(page, { path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'sealed');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'top-value');
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
    await userEvent.type(screen.getByLabelText(strings['edit.password']), 'pw-1');
    await userEvent.type(screen.getByLabelText(strings['edit.repeat']), 'pw-1');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await waitFor(() => expect(requestLog.some((r) => r.method === 'PUT')).toBe(true), { timeout: 10_000 });
    const body = requestLog.find((r) => r.method === 'PUT')!.body as { value: string; metadata: Record<string, unknown> };
    expect(isEncrypted(body.value)).toBe(true);
    expect(body.metadata.encrypted).toBe(true);
    expect(await decrypt(body.value, 'pw-1')).toBe('top-value');
  }, 20_000);
});

describe('the open entry', () => {
  it('names its partition once, in its facts, not again under the title', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    const d = await details();
    await within(d).findByText(strings['detail.facts']);
    expect(within(d).getAllByText('Personal', { exact: true })).toHaveLength(1);
  });

  it('Delete is in its menu, last and marked danger; the header keeps Copy name and Replace value', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    const d = await details();
    await within(d).findByRole('button', { name: strings['action.replace'] });
    expect(within(d).getByRole('button', { name: strings['action.copyName'] })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: 'More actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(delItem(items.at(-1)?.textContent ?? '')).toBe(true);
    // Marked danger, not only last.
    expect(items.at(-1)?.className).toMatch(/danger/);
  });
});

describe('refusals in plain words', () => {
  it('403 on the list is a whole-page state', async () => {
    await renderPage(page, { state: 'forbidden', path: '/vault' });
    expect(await screen.findByText(strings['forbidden.title'])).toBeInTheDocument();
  });

  it('429 on a delete: wait words with a countdown, and Delete waits', async () => {
    await renderPage(page, { state: 'rateLimited', path: '/vault?sel=github-token' });
    await openDelete();
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['delete.confirm'] }));
    expect(await screen.findByText(/Too many changes to the vault right now/)).toBeInTheDocument();
    expect(screen.getByText(/\d+ s/)).toBeInTheDocument();
    await userEvent.click(within(await details()).getByRole('button', { name: 'More actions' }));
    const item = await screen.findByRole('menuitem', { name: delItem });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    // Its reason is the countdown, as the item's own accessible description.
    expect(item).toHaveAccessibleDescription(/Wait \d+ s/);
    // Pressed while it waits, it opens nothing and sends nothing: still the one refused DELETE.
    await userEvent.click(item);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });
});

describe('deletes and clears', () => {
  it('a hoody.* entry asks a second time, naming what is lost', async () => {
    await renderPage(page, { path: `/vault?sel=${ALIAS_KEY}`, realm: 'all' });
    expect(await screen.findByText(strings['detail.hoodyNote'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['action.replace'] })).toBeNull();
    await openDelete();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.confirm'] }));
    const second = await screen.findByRole('alertdialog', { name: strings['delete.hoodyTitle'] });
    expect(second).toHaveTextContent(strings['delete.aliasBody']);
    expect(requestLog.some((r) => r.method === 'DELETE')).toBe(false);
    await userEvent.click(within(second).getByRole('button', { name: strings['delete.hoodyConfirm'] }));
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1));
    expect(requestLog.find((r) => r.method === 'DELETE')!.query).toEqual({});
  });

  it('an own entry is deleted after one confirm', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await openDelete();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.confirm'] }));
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1));
    const tb = await table();
    await waitFor(() => expect(within(tb).queryByRole('row', { name: /github-token/ })).toBeNull());
  });

  it('Clear arms only once the partition name is typed exactly', async () => {
    await renderPage(page, { path: '/vault' });
    await table();
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.clear'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('3 entries are removed.');
    const go = within(dlg).getByRole('button', { name: strings['clear.confirm'] });
    expect(go).toBeDisabled();
    const field = within(dlg).getByRole('textbox');
    await userEvent.type(field, 'personal');
    expect(go).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'Personal');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(requestLog.filter((r) => r.method === 'DELETE' && r.path === '/vault')).toHaveLength(1));
    expect(requestLog.find((r) => r.path === '/vault')!.query.realm_id).toBe(REALM_A);
  });
});

describe('held changes on the page', () => {
  it('a lost answer shows a hold; Check again proves it, nothing is resent', async () => {
    await renderPage(page, { state: 'appliedLost', path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'lost-answer');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    // The page's banner shows the hold; the open drawer (modal) has its own Check again for the same send.
    await screen.findByText('Saving lost-answer in Personal may have gone through');
    const drawer = screen.getByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByText('Saving lost-answer in Personal may have gone through')).toBeNull());
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('after the drawer closes, the page banner checks the hold itself', async () => {
    await renderPage(page, { state: 'appliedLost', path: '/vault?edit=new' });
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'lost-two');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'fixture-v');
    await userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
    await screen.findByText('Saving lost-two in Personal may have gone through');
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: /^close$/i }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const banner = screen.getByText('Saving lost-two in Personal may have gone through').closest('[role="alert"]') as HTMLElement;
    await userEvent.click(within(banner).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.queryByText('Saving lost-two in Personal may have gone through')).toBeNull());
    expect(requestLog.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('a held delete has no Check again, and Dismiss asks first', async () => {
    await renderPage(page, { state: 'unknown', path: '/vault?sel=github-token' });
    await openDelete();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.confirm'] }));
    const title = await screen.findByText('Deleting github-token in Personal may have gone through');
    const banner = title.closest('[role="alert"]') as HTMLElement;
    // Shown once, in the open entry's detail (the list is off screen on a narrow page).
    expect(screen.getAllByText('Deleting github-token in Personal may have gone through')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Details' })).toContainElement(banner);
    expect(within(banner).queryByRole('button', { name: /check again/i })).toBeNull();
    await userEvent.click(within(banner).getByRole('button', { name: /dismiss|close|stop/i }));
    const ask = await screen.findByRole('alertdialog', { name: strings['hold.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(screen.queryByText('Deleting github-token in Personal may have gone through')).toBeNull());
    expect(requestLog.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });
});

describe('agent hint (AgentHint)', () => {
  it('offers "Use with your agent" in the header beside the entries', async () => {
    await renderPage(page, { path: '/vault' });
    await screen.findByText('deploy.notes');
    expect(screen.getByRole('button', { name: 'Use with your agent' })).toBeTruthy();
  });

  // Each state waits for its own content first: the loading header has the hint too.
  it('keeps it on an empty vault, a 403 and an access-key session', async () => {
    const shown: Record<string, string> = {
      empty: 'Nothing in this vault yet',
      forbidden: 'This login cannot open the vault',
      accessKey: 'Sign in with your account to open the vault',
    };
    for (const [state, text] of Object.entries(shown)) {
      const r = await renderPage(page, { state, path: '/vault' });
      await screen.findByText(text);
      expect(screen.getByRole('button', { name: 'Use with your agent' })).toBeTruthy();
      r.unmount();
    }
  });
});

describe('the context', () => {
  it('another partition closes the entry and forgets its value', async () => {
    const { router } = await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    await act(() => { setRealm(REALM_B); bump('switch'); });
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['value.hideEye'] })).toBeNull());
    expect(router.state.location.search).not.toHaveProperty('sel');
  });

  it('an access-key session shows the account-only state and sends nothing', async () => {
    await renderPage(page, { state: 'accessKey', path: '/vault' });
    expect(await screen.findByText(strings['token.title'])).toBeInTheDocument();
    expect(requestLog).toEqual([]);
  });
});
