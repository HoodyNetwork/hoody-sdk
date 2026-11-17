// Vitest: revoke every key of a Bot link. A destructive, held change: the Bot's name is typed to arm it, a lost answer holds it
// (Check again only reads; nothing is sent twice), and only a read that shows no key left proves it.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { KEY_REVOKE_ALL_READS, LOCK_KEYS, PROVES, ROUTES, linkOf, readsOf, registerTargets, sendKeyRevokeAll } from './data';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state?: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=link` });
const name = () => strings['keys.revokeAll'];

describe('the live send', () => {
  it('is one POST to the link\'s revoke-all route, with no body', async () => {
    const seen: Array<{ method: string; path: string }> = [];
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    bootFixtureCore({ rules: [reply(ROUTES.keyRevokeAll, (req: FixtureRequest) => { seen.push({ method: req.method, path: req.path }); return answers.ok({ data: { revoked_count: 3 } }); })] });
    const r = await sendKeyRevokeAll({ linkId: 'bu_1' });
    expect(seen).toEqual([{ method: 'POST', path: '/bot-urls/bu_1/keys/revoke-all' }]);
    expect(r).toEqual({ revoked: 3 });
  });
});

describe('the link as the page reads it', () => {
  const raw = (extra: Record<string, unknown>) => ({ id: 'bu_1', label: 'chief', url: 'https://x.test', status: 'active', ...extra });
  it('a key list is known only when the answer carries an array: a missing, null or non-array list is unknown, never an empty known one', () => {
    expect(linkOf(raw({ keys: [] })).keysKnown).toBe(true);
    expect(linkOf(raw({ keys: [{ id: 'k1', name: 'ci' }] })).keysKnown).toBe(true);
    for (const keys of [undefined, null, {}, 'x', 5]) {
      const l = linkOf(raw(keys === undefined ? {} : { keys }));
      expect(l.keysKnown, JSON.stringify(keys)).toBe(false);
      expect(l.keys).toEqual([]);
    }
  });
  it('so a lost Revoke all is not proved by an answer without the key list', () => {
    const id = { linkId: 'bu_1' };
    expect(PROVES.keyRevokeAll?.(id, [[{ bot0: linkOf(raw({})) }]])).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, [[{ bot0: linkOf(raw({ keys: null })) }]])).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, [[{ bot0: linkOf(raw({ keys: [] })) }]])).toBe('applied');
    expect(PROVES.keyRevokeAll?.(id, [[{ bot0: linkOf(raw({ keys: [{ id: 'k1', name: 'ci' }] })) }]])).toBeUndefined();
  });
});

describe('what proves it', () => {
  const link = (over: Record<string, unknown>) => ({ id: 'bu_1', keysKnown: true, keys: [], ...over });
  const read = (...links: unknown[]) => [[Object.fromEntries(links.map((l, i) => [`bot${i}`, l]))]] as const;
  const id = { linkId: 'bu_1' };
  it('is applied only by this link listed whole with no key left', () => {
    expect(PROVES.keyRevokeAll?.(id, read(link({})))).toBe('applied');
    expect(PROVES.keyRevokeAll?.(id, read(link({ keys: [{ id: 'k1' }] })))).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, read(link({ keysKnown: false })))).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, read(link({ id: 'bu_2' })))).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, read())).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, [[]])).toBeUndefined();
    expect(PROVES.keyRevokeAll?.({}, read(link({})))).toBeUndefined();
  });
  it('a link past the account\'s first page is proved on its computer\'s own list: the read-back reads both lists', () => {
    // A page source's query key: hub, account, scope, generation, src, page, read, params, target.
    const key = (read: string, params: unknown): readonly unknown[] => ['hub', 'acct', 'global', 1, 'src', 'bots', read, params, null];
    const reads = readsOf(KEY_REVOKE_ALL_READS);
    expect(reads(key('link', null))).toBe(true);
    expect(reads(key('linkHere', 'c-atlas'))).toBe(true);
    expect(reads(key('view', KEY))).toBe(false);
    // The account's page (more follow) does not hold the link; the computer's list does, with no key left: applied.
    expect(PROVES.keyRevokeAll?.(id, [[{ 'c-other~r~bot': link({ id: 'bu_9' }), more: null }, { [KEY]: link({}) }]])).toBe('applied');
    expect(PROVES.keyRevokeAll?.(id, [[{ more: null }, { [KEY]: link({ keys: [{ id: 'k1' }] }) }]])).toBeUndefined();
    expect(PROVES.keyRevokeAll?.(id, [[{ more: null }, { more: null }]])).toBeUndefined();
  });
  it('the lock is the link alone', () => {
    expect(LOCK_KEYS.keyRevokeAll?.({ linkId: 'bu_1', extra: 'x' })).toEqual({ linkId: 'bu_1' });
  });
});

describe('the link tab', () => {
  /** The Keys section's head menu, which holds Revoke all keys. */
  const keysHead = async () => within((await screen.findByRole('heading', { name: strings['keys.heading'] })).closest('header') as HTMLElement);
  const openKeysMenu = async () => userEvent.click((await keysHead()).getByRole('button', { name: 'More actions' }));
  const item = () => screen.findByRole('menuitem', { name: new RegExp(`^${name()}`) });

  it('offers Revoke all keys in the Keys menu while the link has keys, in the danger tone and last', async () => {
    await open();
    await openKeysMenu();
    expect((await item()).className).toMatch(/danger/);
  });

  it('has no Keys menu for a link without keys', async () => {
    await open('noKeys');
    await screen.findByText(strings['keys.empty']);
    expect((await keysHead()).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(screen.queryByRole('button', { name: name() })).toBeNull();
  });

  it('asks for the Bot\'s name before it revokes, and closes when it is done', async () => {
    await open();
    await openKeysMenu();
    await userEvent.click(await item());
    const dlg = within(await screen.findByRole('alertdialog'));
    const go = dlg.getByRole('button', { name: strings['keys.revokeAllGo'] });
    expect(go).toBeDisabled();
    await userEvent.type(dlg.getByRole('textbox'), 'Chief');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a lost answer keeps the dialog with Check again and arms nothing again', async () => {
    await open('revokeAllUnknown');
    await openKeysMenu();
    await userEvent.click(await item());
    const dlg = within(await screen.findByRole('alertdialog'));
    await userEvent.type(dlg.getByRole('textbox'), 'Chief');
    await userEvent.click(dlg.getByRole('button', { name: strings['keys.revokeAllGo'] }));
    // The dialog is rebuilt as a held one: ask the screen again.
    const held = async () => within(await screen.findByRole('alertdialog'));
    expect(await (await held()).findByRole('button', { name: /check again/i })).toBeInTheDocument();
    await waitFor(async () => expect((await held()).getByRole('button', { name: strings['keys.revokeAllGo'] })).toBeDisabled());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByText(strings['keys.revokeAllMaybe'])).toBeInTheDocument();
    await openKeysMenu();
    expect(await item()).toHaveAttribute('aria-disabled', 'true');
  }, 60_000);
});
