// Vitest: the Bot's header and the list rows. The header's Stop and Bot
// settings take little room; its meta is one line, the server and the realm behind "+N"; the Bot's ⋯ holds its
// address and its computer and every conversation verb, and the row menu keeps one destructive verb; the paused
// banner says how many actions were used; a Fix button says why beside it; the header's Give it a link
// is not said twice on the Link tab; a row's state is its pill, no dot; "More Bots than the list can show"
// is said only on the last page, with no search and with rows; a running Bot that needs a fix keeps Stop and
// Fix on its header, Bot settings and Details leading its ⋯. The 1350 px row count is measured in a
// browser (header.rows.spec.ts).
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { localSetting } from '@core';
import { viewOf } from './data';
import page from './page';
import strings from './strings.en.json';
import K from '@kit/strings.en.json';

// The page opens on cards; List (the remembered choice) is the dense table. Set once the page is up: a render starts with
// clean storage.
const asTable = () => act(async () => void localSetting('hub.v3.table.present.bots').set('list'));
afterEach(() => void localSetting('hub.v3.table.present.bots').set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state?: string, extra = '') => renderPage(page, { ...(state ? { state } : {}), path: `/bots?sel=${encodeURIComponent(CHIEF)}${extra}` });
const header = async () => (await screen.findByRole('heading', { level: 2, name: 'Chief' })).closest('header') as HTMLElement;

describe('the Bot header', () => {
  it('Stop says "Stop", and Bot settings is an icon button named for what it opens', async () => {
    await open('working');
    const h = await header();
    expect(within(h).getByRole('button', { name: strings['bot.stop'] })).toHaveTextContent(/^Stop/);
    const settings = within(h).getByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) });
    // An icon button: the name is its label, nothing written on it.
    expect(settings.textContent?.trim() ?? '').not.toContain(strings['bot.settingsButton']);
    expect(strings['bot.stop']).toBe('Stop');
  });

  it('shows the computer, the model and Auto-approve in one meta line, the server and realm behind "+2"', async () => {
    await open('working');
    const h = await header();
    // The meta is the header's second line: the line that holds the computer.
    const line = within(h).getByText(/atlas/).closest('a')!.parentElement as HTMLElement;
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('atlas');
    expect(line).toHaveTextContent('Hoody Free');
    expect(within(line).queryByText(/n12 Singapore/)).toBeNull();
    expect(within(line).queryByText(/Acme client/)).toBeNull();
    const more = within(line).getByRole('button', { name: /^\+2 more: n12 Singapore, Acme client$/ });
    expect(more).toHaveTextContent('+2');
    await userEvent.click(more);
    const pop = await screen.findByRole('dialog', { name: strings['bot.hostingTitle'] });
    expect(within(pop).getByText(/n12 Singapore/)).toBeInTheDocument();
    expect(within(pop).getByText(/Acme client/)).toBeInTheDocument();
    // The computer's name in the sentence is a link, so the sentence spans elements: read the paragraph whole.
    expect(within(pop).getByText((_, el) => el?.tagName === 'P' && /^This Bot runs on atlas\./.test(el.textContent ?? ''))).toBeInTheDocument();
  });
});

describe('a Bot that follows the AI page names its model', () => {
  it('the header chip and the list cell name the model the AI page gives, never a blank', async () => {
    await open('followsAiPage');
    const h = await header();
    const line = within(h).getByText(/atlas/).closest('a')!.parentElement as HTMLElement;
    await waitFor(() => expect(line).toHaveTextContent('Hoody Free (AI page)'));
  });
  it('the list cell names it too', async () => {
    await renderPage(page, { state: 'followsAiPage', path: '/bots' });
    await asTable();
    const cell = await screen.findByRole('cell', { name: 'Hoody Free (AI page)' });
    expect(cell).toBeInTheDocument();
  });
  it('with the agents read failed, the chip says the Bots default', async () => {
    await open('followsAiPageUnread');
    const h = await header();
    const line = within(h).getByText(/atlas/).closest('a')!.parentElement as HTMLElement;
    expect(line).toHaveTextContent('Bots default (AI page)');
    expect(screen.queryByText('Hoody Free (AI page)')).toBeNull();
  });
  it('the list cell says the Bots default when the agents read failed', async () => {
    await renderPage(page, { state: 'followsAiPageUnread', path: '/bots' });
    await asTable();
    expect(await screen.findByRole('cell', { name: 'Bots default (AI page)' })).toBeInTheDocument();
  });
});

describe('the Bot ⋯ menu and the row menu', () => {
  it('the Bot ⋯ offers Copy address and Open computer above the conversation verbs and Delete', async () => {
    await open('working');
    const h = await header();
    await userEvent.click(within(h).getByRole('button', { name: 'More actions' }));
    const menu = await screen.findByRole('menu');
    const names = within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim() ?? '');
    const at = (label: string) => names.findIndex((n) => n.startsWith(label));
    expect(at(strings['row.copyLink'])).toBe(0);
    expect(at(strings['row.openComputer'])).toBe(1);
    for (const verb of [strings['conv.reset'], strings['conv.forget'], strings['conv.purge']]) expect(at(verb)).toBeGreaterThan(at(strings['row.openComputer']));
    expect(at(strings['danger.delete'].replace('…', ''))).toBe(names.length - 1);
  });

  it('the Bot ⋯ has no Copy address while the Bot has no link', async () => {
    await open('noLink');
    const h = await header();
    await userEvent.click(within(h).getByRole('button', { name: 'More actions' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: new RegExp(strings['row.copyLink']) })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: new RegExp(strings['row.openComputer']) })).toBeInTheDocument();
  });

  it('the row menu keeps Open first and Delete last, and none of the conversation verbs (Copy address is its hover icon)', async () => {
    await renderPage(page, { path: '/bots' });
    const row = (await screen.findAllByRole('button', { name: 'Row actions' }))[1]!;
    await userEvent.click(row);
    const menu = await screen.findByRole('menu');
    const names = within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim() ?? '');
    for (const verb of [strings['conv.reset'], strings['conv.forget'], strings['conv.purge']]) expect(names.some((n) => n.startsWith(verb))).toBe(false);
    expect(names[0]).toMatch(new RegExp(`^${strings['action.open']}`));
    expect(names.at(-1)).toMatch(/^Delete this Bot/);
  });
});

describe('the paused banner, the Fix reason and the Link tab', () => {
  it('a Bot paused at its limit says how many of its actions it used', async () => {
    await open('paused');
    expect(await screen.findByText(/It used 20 of 20 actions on its own/)).toBeInTheDocument();
  });

  it('a chat app with no owner says so on the name\'s line, with Fix in Chat apps on the header', async () => {
    await open('chatAppAttention');
    const h = await header();
    expect(within(h).getByRole('button', { name: strings['bot.primary.fixApps'] })).toBeInTheDocument();
    // The button says only "Fix" beside the reason; its name still says where it goes.
    expect(within(h).getByRole('button', { name: strings['bot.primary.fixApps'] })).toHaveTextContent(new RegExp(`^${strings['bot.primary.fixShort']}$`));
    const why = within(h).getByText(strings['bot.why.awaiting_owner']);
    // On the line of the name (the status slot), not in the meta below it.
    expect(why.closest('h2')).toBeNull();
    expect(why.parentElement?.parentElement?.contains(within(h).getByRole('heading', { level: 2 }))).toBe(true);
  });

  it('a model whose provider needs a key says so, with Fix in settings', async () => {
    await open('needsKey');
    const h = await header();
    expect(within(h).getByRole('button', { name: strings['bot.primary.fix'] })).toBeInTheDocument();
    expect(within(h).getByText(strings['bot.why.provider'])).toBeInTheDocument();
  });

  it('groups asking to join name themselves on the button, counted, with no second line', async () => {
    await open('chatsWaiting');
    const h = await header();
    const two = strings['bot.primary.groupWaiting_other'].replace('{{count}}', '2');
    expect(within(h).getByRole('button', { name: two })).toHaveTextContent(two);
    for (const k of ['bot.why.auth_failed', 'bot.why.awaiting_owner', 'bot.why.provider', 'bot.why.checker'] as const) expect(within(h).queryByText(strings[k])).toBeNull();
  });

  it('the header offers Give it a link on Activity, and leaves it to the Link tab there', async () => {
    await open('noLink');
    expect(within(await header()).getByRole('button', { name: strings['link.give'] })).toBeInTheDocument();
  });

  it('on the Link tab only the tab offers Give it a link', async () => {
    await open('noLink', '&tab=link');
    const h = await header();
    await screen.findByText(strings['link.none']);
    expect(within(h).queryByRole('button', { name: strings['link.give'] })).toBeNull();
  });
});

describe('a running Bot that needs a fix', () => {
  const menuOf = async (h: HTMLElement) => {
    await userEvent.click(within(h).getByRole('button', { name: K['action.more'] }));
    return screen.findAllByRole('menuitem');
  };
  it('keeps Stop and Fix on the header; Bot settings and Details lead its ⋯', async () => {
    await open('needsKey');
    const h = await header();
    expect(within(h).getByRole('button', { name: strings['bot.stop'] })).toBeInTheDocument();
    expect(within(h).getByRole('button', { name: strings['bot.primary.fix'] })).toBeInTheDocument();
    expect(within(h).queryByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })).toBeNull();
    expect(within(h).queryByRole('button', { name: strings['details.open'] })).toBeNull();
    const items = await menuOf(h);
    expect(items[0]).toHaveTextContent(new RegExp(`^${strings['bot.settingsButton']}`));
    expect(items[1]).toHaveTextContent(strings['details.open']);
  });

  it('Bot settings from the ⋯ opens the settings, as the button did', async () => {
    const { router } = await open('chatAppAttention');
    const items = await menuOf(await header());
    await userEvent.click(items[0]!);
    await waitFor(() => expect((router.state.location.search as Record<string, unknown>).settings).toBe('model'));
  });

  it('Details from the ⋯ opens the panel with the keyboard in it; Close details there gives the keyboard back to the ⋯', async () => {
    const { router } = await open('chatAppAttention');
    const h = await header();
    await userEvent.click((await menuOf(h))[1]!);
    const side = await screen.findByRole('complementary', { name: strings['rail.details'] });
    expect((router.state.location.search as Record<string, unknown>).details).toBe('1');
    await waitFor(() => expect(side).toHaveFocus());
    const close = (await menuOf(h))[1]!;
    expect(close).toHaveTextContent(strings['details.close']);
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByRole('complementary', { name: strings['rail.details'] })).toBeNull());
    await waitFor(() => expect(within(h).getByRole('button', { name: K['action.more'] })).toHaveFocus());
  });

  it("the panel's own Close details gives the keyboard to the ⋯, where Details is", async () => {
    await open('chatAppAttention', '&details=1');
    const h = await header();
    const side = await screen.findByRole('complementary', { name: strings['rail.details'] });
    await userEvent.click(within(side).getByRole('button', { name: strings['details.close'] }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: strings['rail.details'] })).toBeNull());
    await waitFor(() => expect(within(h).getByRole('button', { name: K['action.more'] })).toHaveFocus());
  });

  it.each(['settings', 'details'] as const)('a header button (%s) with the keyboard on it that folds as a running Bot starts to need a fix leaves the keyboard on the ⋯', async (which) => {
    const { queryClient } = await open('working');
    const h = await header();
    const button = which === 'settings'
      ? within(h).getByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })
      : within(h).getByRole('button', { name: strings['details.open'] });
    act(() => button.focus());
    expect(button).toHaveFocus();
    // The live read turns: the running Bot's chat app now waits for an owner (the page's own `view` read).
    const q = queryClient.getQueryCache().findAll().find((x) => x.queryKey[2] === 'view' && CHIEF in ((x.state.data as Record<string, unknown> | undefined) ?? {}));
    expect(q).toBeDefined();
    act(() => {
      queryClient.setQueryData(q!.queryKey, (d: Record<string, Record<string, unknown>>) => ({ ...d, [CHIEF]: { ...d[CHIEF], gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }] } }));
    });
    await waitFor(() => expect(within(h).queryByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })).toBeNull());
    await waitFor(() => expect(within(h).getByRole('button', { name: K['action.more'] })).toHaveFocus());
  });

  it.each(['settings', 'details'] as const)('a header button (%s) the keyboard left for no element before the fold does not pull the keyboard to the ⋯', async (which) => {
    const { queryClient } = await open('working');
    const h = await header();
    const button = which === 'settings'
      ? within(h).getByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })
      : within(h).getByRole('button', { name: strings['details.open'] });
    act(() => button.focus());
    expect(button).toHaveFocus();
    // A click on plain text: the keyboard leaves the button for the page body, and no focusin follows.
    await act(async () => {
      button.blur();
      await Promise.resolve();
    });
    expect(document.body).toHaveFocus();
    const q = queryClient.getQueryCache().findAll().find((x) => x.queryKey[2] === 'view' && CHIEF in ((x.state.data as Record<string, unknown> | undefined) ?? {}));
    expect(q).toBeDefined();
    act(() => {
      queryClient.setQueryData(q!.queryKey, (d: Record<string, Record<string, unknown>>) => ({ ...d, [CHIEF]: { ...d[CHIEF], gate: null, attention: [{ row: 'channels', key: 'chatapp', why: 'awaiting_owner' }] } }));
    });
    await waitFor(() => expect(within(h).queryByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })).toBeNull());
    // Settled: the commit after the fold has run its effects.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(within(h).getByRole('button', { name: K['action.more'] })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('a running Bot with nothing to fix keeps Bot settings and Details on its header, not in its ⋯', async () => {
    await open('working');
    const h = await header();
    expect(within(h).getByRole('button', { name: new RegExp(`^${strings['bot.settingsButton']}`) })).toBeInTheDocument();
    expect(within(h).getByRole('button', { name: strings['details.open'] })).toBeInTheDocument();
    const names = (await menuOf(h)).map((i) => i.textContent ?? '');
    expect(names.some((n) => n.startsWith(strings['bot.settingsButton']) || n === strings['details.open'])).toBe(false);
  });
});

describe('the list', () => {
  it('a row shows its state as its pill, with no dot beside the name', async () => {
    await renderPage(page, { path: '/bots' });
    const name = await screen.findByText('Chief', { selector: 'span' });
    const cell = name.closest('[role="cell"], [role="gridcell"], li, tr') ?? name.parentElement!;
    expect(cell.querySelector('[data-tone][aria-hidden="true"]:empty')).toBeNull();
  });

  it('"more Bots than the list can show" waits for the last page, and leaves while a search runs', async () => {
    await renderPage(page, { path: '/bots' });
    await screen.findByText('Chief', { selector: 'span' });
    // The base world lists 23 Bots in pages of 20: page 1 still has rows to give.
    expect(screen.queryByText(new RegExp(strings['notice.more'].replace('.', '\\.')))).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(await screen.findByText(new RegExp(strings['notice.more'].replace('.', '\\.')))).toBeInTheDocument();
    await userEvent.type(screen.getAllByRole('searchbox')[0]!, 'Ledger');
    await waitFor(() => expect(screen.queryByText(new RegExp(strings['notice.more'].replace('.', '\\.')))).toBeNull());
  });

  it('is never said for a computer with no rows (an empty world)', async () => {
    await renderPage(page, { state: 'empty', path: '/bots' });
    await screen.findByText(strings['empty.title']);
    expect(screen.queryByText(new RegExp(strings['notice.more'].replace('.', '\\.')))).toBeNull();
  });
});

describe('the Bot read (data.ts)', () => {
  const raw = (over: Record<string, unknown>) => ({ id: 'b', uid: 'u', name: 'B', model: 'hoody/free', ...over });
  it('carries the autonomy count and limit when a limit is set, and nothing without one', () => {
    expect(viewOf(raw({ autonomy: { used: 7, max: 20 } }) as never, 'k').autonomy).toEqual({ used: 7, max: 20 });
    expect(viewOf(raw({ autonomy: { used: 0, max: 0 } }) as never, 'k').autonomy).toBeUndefined();
    expect(viewOf(raw({}) as never, 'k').autonomy).toBeUndefined();
  });
  it('says what a chat app needs: a refused sign-in before a missing owner', () => {
    const both = viewOf(raw({ channels: [{ state: 'awaiting_owner' }, { state: 'auth_failed' }] }) as never, 'k');
    expect(both.attention).toEqual([{ row: 'channels', key: 'chatapp', why: 'auth_failed' }]);
    const owner = viewOf(raw({ channels: [{ state: 'awaiting_owner' }] }) as never, 'k');
    expect(owner.attention[0]?.why).toBe('awaiting_owner');
    const wait = viewOf(raw({ channels: [{ state: 'active', requested_chats: 3 }] }) as never, 'k');
    expect(wait.attention).toEqual([{ row: 'channels', key: 'chatwait' }]);
  });
});
