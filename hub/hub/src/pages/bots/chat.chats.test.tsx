// Vitest: the Chats section and the Settings additions of a chat app: the live sends of approve, mute, forget, home chat,
// rename and webhook removal, the list the agent returns, the group-readers warning, and the held-change rules.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROUTES, channelChangeCall, registerTargets, type Change, type Channel, type ChannelChange, type ChannelVars } from './data';
import { ChatsSection as ChatsBody } from './parts/ChatChats';
import { emptyDraft as noDraft } from './parts/ChatSettings';
import page from './page';
import { mount } from './routed';
import strings from './strings.en.json';
// A string that names chat apps reads with the names in place (the kit's ChatNames draws each with its mark, rule 19).
const named = (s: string, app = '') => s.replace('{{app}}', app).replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord');
// The element whose whole text is `text` (a sentence split around the app marks), not one of its ancestors.
const whole = (text: string) => (_: string, el: Element | null) => !!el && el.textContent === text && ![...el.children].some((c) => c.textContent === text);
const markOf = (el: Element, app: string) => el.querySelector(`[data-chat-app="${app}"] svg`);
// The Chats table's body rows (the header row is left out) and one row's menu item: the row's one inline fix is a button, the rest
// of its verbs are items of its Row actions menu.
const tableRows = (table: HTMLElement): HTMLElement[] => within(table).getAllByRole('row').slice(1);
async function menuItem(row: HTMLElement, name: string): Promise<HTMLElement> {
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menuitem', { name: new RegExp(`^${name}`) });
}
async function pickItem(row: HTMLElement, name: string): Promise<void> {
  await userEvent.click(await menuItem(row, name));
}

// The drawer keeps a chat's settings draft; here a small host does.
function ChatsSection(p: { channel: Channel; change: Change<ChannelChange, ChannelVars> }) {
  const [draft, setDraft] = useState(noDraft);
  return <ChatsBody {...p} draft={draft} onDraft={setDraft} />;
}

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = async (state: string | undefined, app = 'ch-tg', section: 'chats' | 'settings' | 'setup' = 'chats') => {
  await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=${app}` });
  if (section !== 'setup') await userEvent.click(await screen.findByRole('button', { name: strings[`chan.rail.${section}`] }));
};

type Seen = { method: string; path: string; body: unknown };
function capture(route: (typeof ROUTES)[keyof typeof ROUTES], answer: unknown = { ok: true }): Seen[] {
  const seen: Seen[] = [];
  registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
  bootFixtureCore({ rules: [reply(route, (req: FixtureRequest) => { seen.push({ method: req.method, path: req.path, body: req.body }); return answers.ok(answer); })] });
  return seen;
}

describe('the live sends', () => {
  it('approve is one PATCH of the chat state; the group warning flag rides only when given', async () => {
    const seen = capture(ROUTES.chatPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-dc', action: 'chatApprove', target: 'cht-general', acknowledgeGroup: true }, 'k1');
    await channelChangeCall({ botKey: KEY, channelId: 'ch-dc', action: 'chatApprove', target: 'cht-dm' }, 'k2');
    expect(seen).toHaveLength(2);
    expect(seen[0]?.method).toBe('PATCH');
    expect(seen[0]?.path).toContain('/channels/ch-dc/chats/cht-general');
    expect(seen[0]?.body).toEqual({ state: 'approved', acknowledge_group_readers: true });
    expect(seen[1]?.body).toEqual({ state: 'approved' });
  });

  it('mute is one PATCH with the muted state', async () => {
    const seen = capture(ROUTES.chatPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatMute', target: 'cht-ana' }, 'k3');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({ state: 'muted' });
  });

  it('forget is one DELETE of the chat, and nothing is sent without a chat', async () => {
    const seen = capture(ROUTES.chatDelete);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatForget' }, 'k4');
    expect(seen).toHaveLength(0);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatForget', target: 'cht-ana' }, 'k5');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('DELETE');
    expect(seen[0]?.path).toContain('/channels/ch-tg/chats/cht-ana');
  });

  it('the home chat is set and cleared through the app, not the chat', async () => {
    const seen = capture(ROUTES.chanPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'homeSet', target: 'cht-ana' }, 'k6');
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'homeClear' }, 'k7');
    expect(seen.map((x) => x.body)).toEqual([{ home_chat: 'cht-ana' }, { home_chat: null }]);
    expect(seen[0]?.path).not.toContain('/chats/');
  });

  it('rename sends the label only, and nothing for an empty one', async () => {
    const seen = capture(ROUTES.chanPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'rename', label: '' }, 'k8');
    expect(seen).toHaveLength(0);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'rename', label: 'Help desk' }, 'k9');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({ label: 'Help desk' });
  });

  it('removing the webhook turns the app on and asks Telegram to delete it, in one PATCH', async () => {
    const seen = capture(ROUTES.chanPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'webhookRemove' }, 'k10');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({ enabled: true, delete_webhook: true });
  });

  it('create carries delete_webhook only when it was asked for', async () => {
    const seen = capture(ROUTES.chanCreate, { id: 'ch-new' });
    await channelChangeCall({ botKey: KEY, channelId: 'new', action: 'create:telegram', token: 't-1' }, 'k11');
    await channelChangeCall({ botKey: KEY, channelId: 'new', action: 'create:telegram', token: 't-2', deleteWebhook: true }, 'k12');
    expect(seen).toHaveLength(2);
    expect((seen[0]?.body as Record<string, unknown>).delete_webhook).toBeUndefined();
    expect((seen[1]?.body as Record<string, unknown>).delete_webhook).toBe(true);
  });

  // The add flow opens the app a create answer names on its Setup: only an answer that states the app's identity, kind and
  // the facts Setup draws from. A partial answer names no app (the drawer closes and the list read shows it).
  const whole = { id: 'ch-new', kind: 'telegram', label: 'Help', state: 'awaiting_owner', needs_owner: true, effective: {}, principals: [], chats: [] };
  for (const [what, answer] of [
    ['an id alone', { id: 'ch-new' }],
    ['an unknown kind', { ...whole, kind: 'irc' }],
    ['no kind', { ...whole, kind: undefined }],
    ['an unknown state', { ...whole, state: 'warming' }],
    ['no owner flag', { ...whole, needs_owner: undefined }],
    ['no people list', { ...whole, principals: undefined }],
  ] as const) {
    it(`a create answer with ${what} names no app`, async () => {
      capture(ROUTES.chanCreate, answer);
      const r = await channelChangeCall({ botKey: KEY, channelId: 'new', action: 'create:telegram', token: 't-1' }, 'k13');
      expect(r?.channel).toBeUndefined();
    });
  }

  it('a whole create answer names the app as stated', async () => {
    capture(ROUTES.chanCreate, whole);
    const r = await channelChangeCall({ botKey: KEY, channelId: 'new', action: 'create:telegram', token: 't-1' }, 'k14');
    expect(r?.channel).toMatchObject({ id: 'ch-new', kind: 'telegram', state: 'needs_owner', needsOwner: true });
  });
});

describe('the Chats section', () => {
  const chatsTable = async () => screen.findByRole('table', { name: strings['chan.chats.list'].replace('{{name}}', 'Support chat') });

  it('lists each chat with its kind, state and the home mark', async () => {
    await open(undefined);
    const rows = tableRows(await chatsTable());
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText(strings['chan.chat.group'])).toBeInTheDocument();
    // The home mark is in the chat's own (pinned) cell, so no width of the table or the list can shed it.
    const firstCell = within(rows[0] as HTMLElement).getAllByRole('cell')[0] as HTMLElement;
    expect(within(firstCell).getByText(strings['chan.chat.home'])).toBeInTheDocument();
    // A plain tag: the accent is the page's one action colour, never a mark on a row.
    expect(within(firstCell).getByText(strings['chan.chat.home']).className).not.toMatch(/accent/);
    expect(within(rows[1] as HTMLElement).getByText(strings['chan.chat.dm'])).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText(strings['chan.chat.home'])).toBeNull();
  }, 60_000);

  it('a chat asking to join comes first with Approve inline; the others keep Chat settings inline and Approve out of the row', async () => {
    await open('channelGroupAsks', 'ch-tg');
    const rows = tableRows(await screen.findByRole('table', { name: /Chats of/ }));
    expect(rows.length).toBeGreaterThan(1);
    expect(within(rows[0] as HTMLElement).getByText(strings['chan.chat.requested'])).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: strings['chan.chat.approve'] })).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).queryByRole('button', { name: strings['set.chat.open'] })).toBeNull();
    // Every other row has Chat settings as its inline button and no inline Approve.
    for (const row of rows.slice(1)) {
      expect(within(row).getByRole('button', { name: strings['set.chat.open'] })).toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: strings['chan.chat.approve'] })).toBeNull();
    }
    // A requested chat's menu still reaches Chat settings.
    await menuItem(rows[0] as HTMLElement, strings['set.chat.open']);
  }, 60_000);

  it('an app with no chats says when one appears', async () => {
    await open(undefined, 'ch-sl');
    expect(await screen.findByText(strings['chan.chats.empty'])).toBeInTheDocument();
  }, 60_000);

  it('a muted chat offers Approve and an approved one offers Mute', async () => {
    await open(undefined, 'ch-dc');
    const rows = tableRows(await screen.findByRole('table', { name: /Chats of/ }));
    // A muted chat keeps Approve in its row menu (inline Approve is the fix of a chat asking to join), an approved one offers Mute.
    expect(within(rows[0] as HTMLElement).queryByRole('button', { name: strings['chan.chat.approve'] })).toBeNull();
    await menuItem(rows[0] as HTMLElement, strings['chan.chat.approve']);
    expect(screen.queryByRole('menuitem', { name: new RegExp(`^${strings['chan.chat.mute']}`) })).toBeNull();
  }, 60_000);

  it('approving a group says everyone there can read replies before anything is confirmed', async () => {
    await open(undefined, 'ch-dc');
    await pickItem(tableRows(await screen.findByRole('table', { name: /Chats of/ }))[0] as HTMLElement, strings['chan.chat.approve']);
    const dlg = within(await screen.findByRole('alertdialog', { name: /Approve general/ }));
    expect(dlg.getByText(new RegExp(strings['chan.chat.approveBody'].slice(0, 30)))).toBeInTheDocument();
    expect(dlg.getByRole('button', { name: strings['chan.chat.approveGo'] })).toBeInTheDocument();
  }, 60_000);

  it('the home chat offers Remove and the others Make home; forget asks first', async () => {
    await open(undefined);
    const rows = tableRows(await chatsTable());
    await menuItem(rows[0] as HTMLElement, strings['chan.chat.clearHome']);
    await userEvent.keyboard('{Escape}');
    await menuItem(rows[1] as HTMLElement, strings['chan.chat.makeHome']);
    await userEvent.keyboard('{Escape}');
    await pickItem(rows[1] as HTMLElement, strings['chan.chat.forget']);
    const dlg = within(await screen.findByRole('alertdialog', { name: /Forget Ana/ }));
    expect(dlg.getByText(new RegExp(strings['chan.chat.forgetBody'].slice(0, 30)))).toBeInTheDocument();
    expect(dlg.getByRole('button', { name: strings['chan.chat.forgetGo'] })).toBeInTheDocument();
  }, 60_000);

  it('a lost answer holds every chat action and says the change may have gone through', async () => {
    await open('channelChangePending');
    const rows = tableRows(await chatsTable());
    await pickItem(rows[1] as HTMLElement, strings['chan.chat.mute']);
    expect(await screen.findAllByText(strings['chan.maybe'])).not.toHaveLength(0);
    // The inline fix is held; the menu's items are held with it.
    await waitFor(() => {
      expect(within(tableRows(screen.getByRole('table', { name: /Chats of/ }))[1] as HTMLElement).getByRole('button', { name: strings['set.chat.open'] })).toBeDisabled();
    });
    await userEvent.click(within(tableRows(screen.getByRole('table', { name: /Chats of/ }))[1] as HTMLElement).getByRole('button', { name: 'Row actions' }));
    for (const it of await screen.findAllByRole('menuitem')) expect(it).toHaveAttribute('aria-disabled', 'true');
  }, 60_000);
});

describe('Settings and the webhook notice', () => {
  it('Rename is offered only for a changed, non-empty name', async () => {
    await open(undefined, 'ch-tg', 'settings');
    const go = await screen.findByRole('button', { name: strings['chan.name.save'] });
    expect(go).toBeDisabled();
    const field = screen.getByRole('textbox', { name: strings['chan.name.label'] });
    await userEvent.clear(field);
    expect(go).toBeDisabled();
    await userEvent.type(field, 'Help desk');
    expect(go).toBeEnabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'Support chat');
    expect(go).toBeDisabled();
  }, 60_000);

  it('the webhook step shows only for the webhook conflict', async () => {
    await open(undefined, 'ch-tg', 'setup');
    await screen.findByRole('list', { name: strings['setup.label'] });
    expect(screen.queryByText(strings['setup.step.webhook'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['chan.webhook.go'] })).toBeNull();
  }, 60_000);

  it('with a webhook set its step is open, offers removal and says what it does before it is confirmed', async () => {
    await open('channelWebhook', 'ch-tg', 'setup');
    // The step's why names Telegram with its mark (rule 19), and so does the dialog; the dialog's title names no app.
    const why = await screen.findByText(whole(named(strings['setup.why.webhook'])));
    expect(markOf(why, 'telegram')).not.toBeNull();
    expect(screen.getByText(strings['setup.say.webhook'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['chan.webhook.go'] }));
    const dlg = within(await screen.findByRole('alertdialog', { name: strings['chan.webhook.confirmTitle'] }));
    expect(markOf(dlg.getByText(whole(named(strings['chan.webhook.confirmBody']))), 'telegram')).not.toBeNull();
  }, 60_000);

  it('a Telegram connect offers to remove an existing webhook', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['chan.addFlow.options']) }));
    expect(await screen.findByRole('checkbox', { name: new RegExp(strings['chan.webhook.create']) })).not.toBeChecked();
    expect(markOf(screen.getByText(whole(named(strings['chan.webhook.createHelp']))), 'telegram')).not.toBeNull();
  }, 60_000);
});

// The section on its own with a recording change: what a click hands to the held change (the page tests above run on fixtures).
describe('what the section hands to the change', () => {
  const channel: Channel = {
    id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 2, homeChat: null, reason: '', principals: [], view: { settings: {}, effective: {} }, notes: [],
    chatRows: [
      { id: 'g1', platformChat: '-1', kind: 'group', title: 'Team', state: 'muted', view: { settings: {}, effective: {} } },
      { id: 'd1', platformChat: '1', kind: 'dm', title: 'Ana', state: 'muted', view: { settings: {}, effective: {} } },
    ],
  };
  const stub = () => {
    const calls: ChannelVars[] = [];
    const change = {
      run: async (v: ChannelVars) => { calls.push(v); return { outcome: 'done' as const }; },
      outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
      readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
    } as unknown as Change<ChannelChange, ChannelVars>;
    return { calls, change };
  };

  it('a group is approved only from the confirm, with the readers acknowledgement', async () => {
    const { calls, change } = stub();
    await mount(<ChatsSection channel={channel} change={change} />);
    await pickItem(tableRows(screen.getByRole('table'))[0] as HTMLElement, strings['chan.chat.approve']);
    expect(calls).toHaveLength(0);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['chan.chat.approveGo'] }));
    expect(calls).toEqual([{ action: 'chatApprove', target: 'g1', acknowledgeGroup: true, channelId: 'ch-x' }]);
  }, 60_000);

  it('a direct chat is approved at once, without the acknowledgement', async () => {
    const { calls, change } = stub();
    await mount(<ChatsSection channel={channel} change={change} />);
    await pickItem(tableRows(screen.getByRole('table'))[1] as HTMLElement, strings['chan.chat.approve']);
    expect(calls).toEqual([{ action: 'chatApprove', target: 'd1', channelId: 'ch-x' }]);
  }, 60_000);

  it('forget is sent only from the confirm', async () => {
    const { calls, change } = stub();
    await mount(<ChatsSection channel={channel} change={change} />);
    await pickItem(tableRows(screen.getByRole('table'))[1] as HTMLElement, strings['chan.chat.forget']);
    expect(calls).toHaveLength(0);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['chan.chat.forgetGo'] }));
    expect(calls).toEqual([{ action: 'chatForget', target: 'd1', channelId: 'ch-x' }]);
  }, 60_000);

  it('make home names the chat, and remove home names none', async () => {
    const { calls, change } = stub();
    const { rerender } = await mount(<ChatsSection channel={channel} change={change} />);
    await pickItem(tableRows(screen.getByRole('table'))[1] as HTMLElement, strings['chan.chat.makeHome']);
    await rerender(<ChatsSection channel={{ ...channel, homeChat: 'd1' }} change={change} />);
    await pickItem(tableRows(screen.getByRole('table'))[1] as HTMLElement, strings['chan.chat.clearHome']);
    expect(calls).toEqual([
      { action: 'homeSet', target: 'd1', channelId: 'ch-x' },
      { action: 'homeClear', channelId: 'ch-x' },
    ]);
  }, 60_000);
});

describe('which chat may be the home chat', () => {
  const view = { settings: {}, effective: {} };
  const channel: Channel = {
    id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 3, homeChat: null, reason: '', principals: [], view, notes: [],
    chatRows: [
      { id: 'g1', platformChat: '-1', kind: 'group', title: 'Muted group', state: 'muted', view },
      { id: 'g2', platformChat: '-2', kind: 'group', title: 'Asking group', state: 'requested', view },
      { id: 'g3', platformChat: '-3', kind: 'group', title: 'Approved group', state: 'approved', view },
    ],
  };
  const change = {
    run: async () => ({ outcome: 'done' as const }),
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<ChannelChange, ChannelVars>;

  it('a group that is not approved cannot be made the home chat, and says to approve it first; an approved one can', async () => {
    await mount(<ChatsSection channel={channel} change={change} />);
    const rows = tableRows(screen.getByRole('table'));
    for (const i of [0, 1]) {
      const item = await menuItem(rows[i] as HTMLElement, strings['chan.chat.makeHome']);
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(within(item).getByText(strings['chan.chat.homeNeedsApproval'])).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
    }
    const ok = await menuItem(rows[2] as HTMLElement, strings['chan.chat.makeHome']);
    expect(ok).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(ok).queryByText(strings['chan.chat.homeNeedsApproval'])).toBeNull();
  });
});

describe('the setup steps of the add flow', () => {
  const addAt = async (state: string | undefined, kindName?: RegExp) => {
    await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    if (kindName) await userEvent.click(await screen.findByRole('radio', { name: kindName }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
  };
  it('lists how to get the credentials, in the order the agent gives them', async () => {
    await addAt(undefined);
    // A step that names the app shows its mark before the name (rule 19); the words are the agent's, unchanged.
    const first = await screen.findByText(whole('Open Telegram and start a chat with @BotFather.'));
    expect(markOf(first, 'telegram')).not.toBeNull();
    expect(first.querySelectorAll('[data-chat-app]')).toHaveLength(1);
    // A StepList group in the chat app, numbered, then the paste row back here.
    const group = first.closest('ol') as HTMLElement;
    expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')).toHaveTextContent(strings['flow.group.where.app']);
    const steps = within(group).getAllByRole('listitem');
    expect(steps.map((x) => x.textContent)).toEqual(['01Open Telegram and start a chat with @BotFather.', '02Send /newbot and follow the questions.', '03Copy the token BotFather gives you.']);
    const list = screen.getByRole('group', { name: strings['chan.setup.title'].replace('{{app}}', 'Telegram') });
    expect(within(list).getAllByRole('listitem').at(-1)).toHaveTextContent(`04${strings['chan.addFlow.pasteRow']}`);
  }, 60_000);

  it('Slack also gives the app manifest to copy', async () => {
    await addAt('channelSetupSlack', /Slack/);
    expect(await screen.findByText(/socket_mode_enabled/)).toBeInTheDocument();
    const row = screen.getByText(whole('Create a Slack app from the manifest.'));
    expect(markOf(row, 'slack')).not.toBeNull();
    // The manifest sits in the row that names it, not after the list.
    expect(within(row.closest('li') as HTMLElement).getAllByLabelText(strings['chan.setup.manifest']).length).toBeGreaterThan(0);
    expect(markOf(screen.getByText(whole(named(strings['chan.setup.manifestHelp']))), 'slack')).not.toBeNull();
  }, 60_000);

  it('Telegram has no manifest', async () => {
    await addAt(undefined);
    await screen.findByText(whole('Open Telegram and start a chat with @BotFather.'));
    expect(screen.getByRole('group', { name: strings['chan.setup.title'].replace('{{app}}', 'Telegram') })).toBeInTheDocument();
    expect(screen.queryAllByLabelText(strings['chan.setup.manifest'])).toHaveLength(0);
  }, 60_000);

  it('never shows another app\'s steps while the right ones are read', async () => {
    await addAt(undefined, /Slack/);
    await screen.findByLabelText(new RegExp(strings['chan.token'].slice(0, 8)));
    expect(screen.queryByText(whole('Open Telegram and start a chat with @BotFather.'))).toBeNull();
  }, 60_000);

  it('says so when this computer cannot connect that app', async () => {
    await addAt('channelSetupUnavailable');
    expect(markOf(await screen.findByText(whole(named(strings['chan.setup.unavailable'], 'Telegram'))), 'telegram')).not.toBeNull();
  }, 60_000);
});
