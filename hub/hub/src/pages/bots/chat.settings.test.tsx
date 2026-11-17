// Vitest: the chat app settings form and the chat settings dialog: the values shown are the agent's effective ones, a change waits in
// a draft until Save and goes out as one change of only what changed, a refused value is kept with its error and never blocks another
// setting's Save, and a lost answer holds the form.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { act, renderPage, render, screen, userEvent, waitFor, within } from '@app/testing';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROUTES, channelChangeCall, channelOf, registerTargets, type Change, type Channel, type ChannelChange, type ChannelSettings, type ChannelVars, type ChatRow } from './data';
import { ChatsSection as ChatsBody } from './parts/ChatChats';
import { emptyDraft as noDraft } from './parts/ChatSettings';
import { AllAppsSettings, ChangeFailed, ChannelSettingsSection, draftDirty, emptyDraft, refusalDetail, useSettingsSave } from './parts/ChatSettings';
import page from './page';
import { mount } from './routed';
import strings from './strings.en.json';
// A string that names chat apps reads with the names in place (the kit's ChatNames draws each with its mark, rule 19).
const named = (s: string, app = '') => s.replace('{{app}}', app).replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord');
// The element whose whole text is `text` (a sentence split around the app marks), not one of its ancestors.
const whole = (text: string) => (_: string, el: Element | null) => !!el && el.textContent === text && ![...el.children].some((c) => c.textContent === text);
const markOf = (el: Element, app: string) => el.querySelector(`[data-chat-app="${app}"] svg`);

// The drawer keeps a chat's settings draft; here a small host does.
function ChatsSection(p: { channel: Channel; change: Change<ChannelChange, ChannelVars> }) {
  const [draft, setDraft] = useState(noDraft);
  return <ChatsBody {...p} draft={draft} onDraft={setDraft} />;
}

beforeAll(async () => {
  await import('./view');
}, 30000);

// One body row of the Chats table (the header row is left out).
const tableRow = (n: number): HTMLElement => within(screen.getByRole('table')).getAllByRole('row')[n + 1] as HTMLElement;

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = async (state: string | undefined, app = 'ch-tg') => {
  await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=${app}` });
  await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.settings'] }));
};

const eff = (e: Record<string, [unknown, string]>) => Object.fromEntries(Object.entries(e).map(([k, [value, source]]) => [k, { value, source }]));
const channel: Channel = {
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 2, homeChat: null, reason: '', principals: [],
  chatRows: [
    { id: 'd1', platformChat: '1', kind: 'dm', title: 'Ana', state: 'approved', view: { settings: {}, effective: eff({ mention_only: [true, 'default'], reply_style: ['thread', 'default'], format: ['rich', 'default'], rate_user_per_min: [10, 'default'], rate_user_per_hour: [20, 'default'], rate_user_per_day: [100, 'default'], rate_chat_per_min: [20, 'default'] }) } },
    { id: 'g1', platformChat: '-1', kind: 'group', title: 'Team', state: 'approved', view: { settings: { format: 'plain' }, effective: eff({ mention_only: [true, 'default'], reply_style: ['thread', 'default'], format: ['plain', 'chat'], rate_user_per_min: [10, 'default'], rate_user_per_hour: [20, 'default'], rate_user_per_day: [100, 'default'], rate_chat_per_min: [20, 'default'] }) } },
  ],
  view: {
    settings: { gate_deciders: 'named' },
    effective: eff({
      dm_policy: ['owner', 'default'], group_mode: ['owner_approves', 'default'], gate_deciders: ['named', 'channel'], push_events: [['report'], 'default'], home_chat: [null, 'default'],
      mention_only: [true, 'default'], part_chars: [4096, 'default'], max_parts: [8, 'default'], hide_secrets: [true, 'default'], channel_lease: [true, 'default'], blocked_users: [[], 'default'],
    }),
  },
  notes: [{ code: 'telegram_privacy_on', field: 'mention_only' }],
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

// The drawer draws Save and Discard in its foot; here a small host draws the same parts under the form.
function Section({ ch, change }: { ch: Channel; change: Change<ChannelChange, ChannelVars> }) {
  const [draft, setDraft] = useState(emptyDraft);
  const foot = useSettingsSave({ channel: ch, change, draft, onDraft: setDraft, active: true });
  return (
    <>
      <ChannelSettingsSection channel={ch} change={change} draft={draft} onDraft={foot.onDraft} />
      <footer>
        {foot.reason}
        {foot.secondary}
        {foot.primary}
      </footer>
    </>
  );
}
const save = () => screen.getByRole('button', { name: strings['set.save'] });
/** Settings for all chat apps is an item of the Apps head menu. */
const openAllApps = async () => {
  const head = (await screen.findByRole('heading', { name: strings['chan.title'] })).closest('header') as HTMLElement;
  await userEvent.click(within(head).getByRole('button', { name: 'More actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['set.bot.open']}`) }));
};
/** Support chat's row has a fix inline (the privacy note), so its Manage is in the row menu. */
const manageSupport = async () => {
  const row = await screen.findByRole('row', { name: /Support chat/ });
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.manage']}`) }));
};
const openAll = async () => userEvent.click(screen.getByRole('button', { name: new RegExp(strings['set.all']) }));

type Seen = { method: string; path: string; body: unknown };
function capture(route: (typeof ROUTES)[keyof typeof ROUTES]): Seen[] {
  const seen: Seen[] = [];
  registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
  bootFixtureCore({ rules: [reply(route, (req: FixtureRequest) => { seen.push({ method: req.method, path: req.path, body: req.body }); return answers.ok({ ok: true }); })] });
  return seen;
}

describe('the live sends', () => {
  it('a settings change is one PATCH of the app with home_chat at the top level', async () => {
    const seen = capture(ROUTES.chanPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'settings', settings: { dm_policy: 'open', home_chat: 'cht-ana', format: null } }, 'k1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('PATCH');
    expect(seen[0]?.path).toMatch(/\/channels\/ch-tg$/);
    expect(seen[0]?.body).toEqual({ home_chat: 'cht-ana', settings: { dm_policy: 'open', format: null } });
  });

  it('a chat settings change is one PATCH of the chat, and nothing is sent without a chat or a setting', async () => {
    const seen = capture(ROUTES.chatPatch);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatSettings', settings: { mention_only: false } }, 'k2');
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatSettings', target: 'cht-ana', settings: { dm_policy: 'open' } }, 'k3');
    expect(seen).toHaveLength(0);
    await channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'chatSettings', target: 'cht-ana', settings: { mention_only: false } }, 'k4');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toContain('/channels/ch-tg/chats/cht-ana');
    expect(seen[0]?.body).toEqual({ settings: { mention_only: false } });
  });
});

describe('the Bot-wide settings', () => {
  const botView: ChannelSettings = {
    ok: true, paused: false, maxChannels: 4, rateBotPerDay: 200,
    view: { settings: { max_channels: 4 }, effective: eff({ lang: ['en', 'default'], max_channels: [4, 'bot'], rate_bot_per_day: [200, 'default'], hide_secrets: [true, 'default'] }) },
  };
  it('is one PATCH of the Bot with its settings at the top level, and pause stays its own action', async () => {
    const seen = capture(ROUTES.chanSettingsPatch);
    await channelChangeCall({ botKey: KEY, channelId: '', action: 'botSettings', settings: { lang: 'de', max_channels: 3, channels_paused: true } }, 'k1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('PATCH');
    expect(seen[0]?.path).toMatch(/\/channel-settings$/);
    expect(seen[0]?.body).toEqual({ lang: 'de', max_channels: 3 });
    await channelChangeCall({ botKey: KEY, channelId: '', action: 'botSettings', settings: { channels_paused: true } }, 'k2');
    expect(seen).toHaveLength(1);
  });

  it('opens from its button with the values in force, read-only rows marked, and saves one change', async () => {
    const { calls, change } = stub();
    render(<AllAppsSettings settings={botView} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: strings['set.bot.title'] }));
    expect(dlg.getByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) })).toHaveValue('4');
    const hide = dlg.getByText(strings['set.n.hide_secrets']).closest('[data-sg-row]') as HTMLElement;
    expect(within(hide).getByText(strings['set.readOnly'])).toBeInTheDocument();
    expect(dlg.queryByText(strings['set.n.dm_policy'])).toBeNull();
    const primary = dlg.getByRole('button', { name: strings['set.save'] });
    expect(primary).toBeDisabled();
    const field = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) });
    await userEvent.clear(field);
    await userEvent.type(field, '6');
    await userEvent.click(primary);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ channelId: '', action: 'botSettings', settings: { max_channels: 6 } });
  });
});

describe('what the form shows', () => {
  it('the main controls show the values in force, in words', async () => {
    const { change } = stub();
    render(<Section ch={channel} change={change} />);
    expect(screen.getByRole('button', { name: new RegExp(strings['set.n.dm_policy']) })).toHaveTextContent(strings['set.v.dm_policy.owner']);
    expect(screen.getByRole('button', { name: new RegExp(strings['set.n.gate_deciders']) })).toHaveTextContent(strings['set.v.gate_deciders.named']);
    expect(screen.getByRole('checkbox', { name: strings['set.v.push_events.report'] })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] })).not.toBeChecked();
  });

  it('says where a value comes from, and offers the default only for one set here', async () => {
    const { change } = stub();
    render(<Section ch={channel} change={change} />);
    const decider = screen.getByText(strings['set.n.gate_deciders']).closest('[data-sg-row]') as HTMLElement;
    expect(within(decider).getByText(strings['set.from.channel'])).toBeInTheDocument();
    expect(within(decider).getByRole('button', { name: strings['set.reset'] })).toBeInTheDocument();
    const dm = screen.getByText(strings['set.n.dm_policy']).closest('[data-sg-row]') as HTMLElement;
    expect(within(dm).getByText(strings['set.from.default'])).toBeInTheDocument();
    expect(within(dm).queryByRole('button', { name: strings['set.reset'] })).toBeNull();
  });

  it('All settings lists the rest by group, with read-only rows marked and the agent notes beside their setting', async () => {
    const { change } = stub();
    render(<Section ch={channel} change={change} />);
    await openAll();
    expect(screen.getByRole('group', { name: strings['set.g.Format'] })).toBeInTheDocument();
    const hide = screen.getByText(strings['set.n.hide_secrets']).closest('[data-sg-row]') as HTMLElement;
    expect(within(hide).getByText(strings['set.readOnly'])).toBeInTheDocument();
    expect(within(hide).queryByRole('switch')).toBeNull();
    const mention = screen.getByText(strings['set.n.mention_only']).closest('[data-sg-row]') as HTMLElement;
    // The note is the row's help: the switch is described by it, and the app it names carries its mark.
    // Read through aria-describedby's text: the note holds the @BotFather link, and jsdom (no layout) computes a link as a
    // block, so the computed description would read "@BotFather ," where a browser reads "@BotFather,".
    const sw = within(mention).getByRole('switch');
    const described = (sw.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(described).toContain(named(strings['set.note.telegram_privacy_on']));
    expect(markOf(mention, 'telegram')).not.toBeNull();
    // The note names @BotFather as a link to its chat.
    expect(within(mention).getByRole('link', { name: '@BotFather' })).toHaveAttribute('href', 'https://t.me/BotFather');
  });

  it('a Telegram-only row is absent on Slack', async () => {
    const { change } = stub();
    render(<Section ch={{ ...channel, kind: 'slack' }} change={change} />);
    await openAll();
    expect(screen.queryByText(strings['set.n.parse_mode'])).toBeNull();
    expect(screen.getByText(strings['set.n.connection_opens_per_hour'])).toBeInTheDocument();
  });
});

describe('what Save sends', () => {
  it('nothing until something changed, then only what changed', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ channelId: 'ch-x', action: 'settings', settings: { push_events: ['gate', 'report'].sort((a, b) => ['report', 'gate'].indexOf(a) - ['report', 'gate'].indexOf(b)) } });
  });

  it('changing a value back to what it was is no change', async () => {
    const { change } = stub();
    render(<Section ch={channel} change={change} />);
    const gate = screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] });
    await userEvent.click(gate);
    expect(save()).toBeEnabled();
    await userEvent.click(gate);
    expect(save()).toBeDisabled();
  });

  it('Discard drops the draft', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    await userEvent.click(screen.getByRole('button', { name: strings['set.discard'] }));
    expect(save()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] })).not.toBeChecked();
    expect(calls).toHaveLength(0);
  });

  it('use the default is sent as null and says so before it is saved', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    const decider = screen.getByText(strings['set.n.gate_deciders']).closest('[data-sg-row]') as HTMLElement;
    await userEvent.click(within(decider).getByRole('button', { name: strings['set.reset'] }));
    expect(within(decider).getByText(strings['set.willDefault'])).toBeInTheDocument();
    expect(within(decider).queryByRole('button', { name: strings['set.reset'] })).toBeNull();
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ gate_deciders: null });
  });

  it('a number outside its range blocks Save and says the range; a valid one is sent as a number', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    await openAll();
    const field = screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await userEvent.tab();
    expect(save()).toBeDisabled();
    expect(await screen.findByText('Out of range: 1 to 20')).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, '5');
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ max_parts: 5 });
  });

  it('a refused value does not block another setting: Save sends the valid change and leaves the refused text and its error', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    await openAll();
    const field = screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await userEvent.tab();
    expect(save()).toBeEnabled();
    expect(screen.getByText(strings['set.skipsBad'])).toBeInTheDocument();
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(Object.keys(calls[0]?.settings ?? {})).toEqual(['push_events']);
    // the refused field keeps what was typed and still says why; there is nothing more to save
    expect(screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) })).toHaveValue('99');
    expect(screen.getByText('Out of range: 1 to 20')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('a refused value alone can be discarded', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    await openAll();
    const field = screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    expect(save()).toBeDisabled();
    const discard = screen.getByRole('button', { name: strings['set.discard'] });
    expect(discard).toBeEnabled();
    await userEvent.click(discard);
    expect(screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) })).toHaveValue('8');
    expect(screen.queryByText('Out of range: 1 to 20')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a refused value and its error outlive the form: leaving the section and coming back shows both', async () => {
    const { change } = stub();
    function Host() {
      const [draft, setDraft] = useState(emptyDraft);
      const [shown, setShown] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown((x) => !x)}>
            toggle
          </button>
          {shown && <ChannelSettingsSection channel={channel} change={change} draft={draft} onDraft={setDraft} />}
        </>
      );
    }
    render(<Host />);
    await openAll();
    const field = screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await openAll();
    expect(screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) })).toHaveValue('99');
    expect(screen.getByText('Out of range: 1 to 20')).toBeInTheDocument();
  });

  it('the home chat is chosen among direct messages and approved groups and sent beside the other changes', async () => {
    const { calls, change } = stub();
    render(<Section ch={channel} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['set.n.home_chat']) }));
    await userEvent.click(await screen.findByRole('option', { name: 'Team' }));
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toMatchObject({ home_chat: 'g1' });
    expect(Object.keys(calls[0]?.settings ?? {}).sort()).toEqual(['home_chat', 'push_events']);
  });

  it('after a saved change the draft is empty and the form says Saved', async () => {
    const { change } = stub();
    render(<Section ch={channel} change={change} />);
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    await userEvent.click(save());
    expect(await screen.findByText(strings['set.saved'])).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });
});

describe('the chat settings dialog', () => {
  const chatRow = (id: string) => channel.chatRows.find((c: ChatRow) => c.id === id) as ChatRow;
  it('shows the chat scope rows with where each value comes from, and sends one change for the chat', async () => {
    const { calls, change } = stub();
    await mount(<ChatsSection channel={channel} change={change} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    await userEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Team/ }));
    expect(dlg.getByText(strings['set.n.format'])).toBeInTheDocument();
    expect(dlg.queryByText(strings['set.n.dm_policy'])).toBeNull();
    expect(dlg.getByText(strings['set.from.chat'])).toBeInTheDocument();
    const primary = dlg.getByRole('button', { name: strings['set.save'] });
    expect(primary).toBeDisabled();
    await userEvent.click(dlg.getByRole('switch', { name: strings['set.n.mention_only'] }));
    await userEvent.click(primary);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ channelId: 'ch-x', action: 'chatSettings', target: chatRow('g1').id, settings: { mention_only: false } });
  });
});

describe('on the page', () => {
  it('the Settings section carries the form beside rename, on and remove', async () => {
    await open(undefined);
    expect(await screen.findByRole('button', { name: strings['chan.name.save'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(strings['set.n.dm_policy']) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['set.save'] })).toBeDisabled();
  }, 60_000);

  it('rename and on are rows of one group, remove is alone in the last group, and Save and Discard are the drawer foot', async () => {
    await open(undefined);
    const app = within(await screen.findByRole('group', { name: strings['chan.set.app'] }));
    expect(app.getByRole('textbox', { name: strings['chan.name.label'] })).toHaveAccessibleDescription(strings['chan.name.help']);
    expect(app.getByRole('button', { name: strings['chan.name.save'] })).toBeDisabled();
    expect(app.getByRole('switch', { name: /is on$/ })).toBeChecked();
    const danger = screen.getByRole('group', { name: strings['chan.set.remove'] });
    expect(within(danger).getByRole('button', { name: strings['chan.remove'] })).toBeEnabled();
    expect(within(danger).getByText(strings['chan.removeBody'])).toBeInTheDocument();
    const groups = screen.getAllByRole('group').filter((g) => g.closest('[data-setting-group]'));
    expect(groups.at(-1)).toBe(danger);
    const foot = screen.getByRole('button', { name: strings['set.save'] }).closest('footer') as HTMLElement;
    expect(foot).not.toBeNull();
    expect(within(foot).getByRole('button', { name: strings['set.discard'] })).toBeDisabled();
    expect(within(foot).getAllByRole('button')).toHaveLength(2);
    // The status line is the foot's: an edit says so there.
    await userEvent.click(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    expect(within(foot).getByText(strings['set.unsaved'])).toBeInTheDocument();
  }, 60_000);

  it('the foot is the Settings section\'s alone', async () => {
    await open(undefined);
    await screen.findByRole('button', { name: strings['set.save'] });
    await userEvent.click(screen.getByRole('button', { name: strings['chan.rail.chats'] }));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['set.save'] })).toBeNull());
  }, 60_000);

  it('a lost answer holds the form and says the change may have gone through', async () => {
    await open('channelChangePending');
    await userEvent.click(await screen.findByRole('checkbox', { name: strings['set.v.push_events.gate'] }));
    await userEvent.click(screen.getByRole('button', { name: strings['set.save'] }));
    expect(await screen.findAllByText(strings['chan.maybe'])).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: strings['set.save'] })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: strings['set.v.push_events.gate'] })).toBeDisabled();
    });
  }, 60_000);
});

describe('a chat as the agent reports it', () => {
  // The agent lists a chat with only what the chat itself sets; what applies comes from the app's effective values.
  const wire = {
    id: 'ch-w', kind: 'telegram', label: 'W', state: 'connected',
    effective: { mention_only: { value: true, source: 'default' }, reply_style: { value: 'thread', source: 'default' }, format: { value: 'rich', source: 'channel' } },
    chats: [{ id: 'g9', platform_chat: '-9', kind: 'group', state: 'approved', title: 'Nine', settings: { mention_only: false } }],
  };
  it('shows the app value with the chat override on top, marked as set for the chat', () => {
    const chat = channelOf(wire).chatRows[0] as ChatRow;
    expect(chat.view.settings).toEqual({ mention_only: false });
    expect(chat.view.effective.mention_only).toEqual({ value: false, source: 'chat' });
    expect(chat.view.effective.reply_style).toEqual({ value: 'thread', source: 'default' });
    expect(chat.view.effective.format).toEqual({ value: 'rich', source: 'channel' });
  });

  it('the dialog shows the stored override, offers the default for it, and lets it be switched back', async () => {
    const { calls, change } = stub();
    const ch = channelOf(wire);
    await mount(<ChatsSection channel={ch} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Nine/ }));
    const mention = dlg.getByText(strings['set.n.mention_only']).closest('[data-sg-row]') as HTMLElement;
    expect(within(mention).getByRole('switch')).not.toBeChecked();
    expect(within(mention).getByText(strings['set.from.chat'])).toBeInTheDocument();
    expect(within(mention).getByRole('button', { name: strings['set.reset'] })).toBeInTheDocument();
    const style = dlg.getByText(strings['set.n.reply_style']).closest('[data-sg-row]') as HTMLElement;
    expect(within(style).getByRole('button')).toHaveTextContent(strings['set.v.reply_style.thread']);
    await userEvent.click(within(mention).getByRole('switch'));
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ mention_only: true });
  });
});

describe('what the agent refused', () => {
  it('the Bot-wide dialog says which setting and why', async () => {
    const { change } = stub();
    const failed = { ...change, outcome: 'failed', code: 'setting_invalid', details: { field: 'max_channels', reason: 'out_of_range' } } as unknown as Change<ChannelChange, ChannelVars>;
    render(<AllAppsSettings settings={{ ok: true, paused: false, maxChannels: 4, rateBotPerDay: 0, view: { settings: {}, effective: eff({ max_channels: [4, 'default'] }) } }} change={failed} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    expect(await screen.findByText(`${strings['set.n.max_channels']}: ${strings['set.reason.out_of_range']}`)).toBeInTheDocument();
  });

  it('the Bot-wide dialog names a chat app in the refusal with its mark (rule 19), and only on a failed outcome', async () => {
    const { change } = stub();
    const settings: ChannelSettings = { ok: true, paused: false, maxChannels: 4, rateBotPerDay: 0, view: { settings: {}, effective: eff({ max_channels: [4, 'default'] }) } };
    const details = { field: 'parse_mode', reason: 'not_available' };
    const said = `${strings['set.n.parse_mode']}: ${strings['set.reason.not_available']}`;
    const { unmount } = render(<AllAppsSettings settings={settings} change={{ ...change, outcome: 'failed', code: 'setting_conflict', details } as unknown as Change<ChannelChange, ChannelVars>} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    const line = await screen.findByText(whole(said));
    expect(line.closest('[data-dialog-outcome]')).not.toBeNull();
    expect([...line.querySelectorAll('[data-chat-app]')].map((a) => a.getAttribute('data-chat-app'))).toEqual(['telegram']);
    expect(markOf(line, 'telegram')).not.toBeNull();
    unmount();
    // A pending outcome keeps its C9 words: the refusal line is never put on it (nor on no outcome, or no line).
    expect(refusalDetail({ kind: 'pending', code: 'setting_conflict' }, said)).toBeUndefined();
    expect(refusalDetail(undefined, said)).toBeUndefined();
    expect(refusalDetail({ kind: 'failed' }, undefined)).toBeUndefined();
  });

  it('a chat settings dialog names a chat app in the refusal with its mark too (rule 19)', async () => {
    function Refused() {
      const [draft, setDraft] = useState(emptyDraft);
      const [failed, setFailed] = useState(false);
      const change = {
        ...stub().change,
        outcome: failed ? 'failed' : 'idle',
        code: failed ? 'setting_conflict' : undefined,
        details: failed ? { field: 'parse_mode', reason: 'not_available' } : undefined,
        run: async () => { setFailed(true); return { outcome: 'failed' as const }; },
      } as unknown as Change<ChannelChange, ChannelVars>;
      return <ChatsBody channel={channel} change={change} draft={draft} onDraft={setDraft} />;
    }
    await mount(<Refused />);
    await userEvent.click(within(tableRow(1)).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Team/ }));
    const rate = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_min']) });
    await userEvent.clear(rate);
    await userEvent.type(rate, '11');
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    const line = await dlg.findByText(whole(`${strings['set.n.parse_mode']}: ${strings['set.reason.not_available']}`));
    expect(line.closest('[data-dialog-outcome]')).not.toBeNull();
    expect(markOf(line, 'telegram')).not.toBeNull();
  });

  it('the drawer banner names the setting and the reason, and only says it was not made when the agent gave none', () => {
    const { change } = stub();
    const failed = (details?: Record<string, unknown>) => ({ ...change, outcome: 'failed', code: 'setting_invalid', details }) as unknown as Change<ChannelChange, ChannelVars>;
    const { rerender } = render(<ChangeFailed change={failed({ field: 'outbound_rate', reason: 'above_ceiling' })} />);
    expect(screen.getByText(`${strings['set.n.outbound_rate']}: ${strings['set.reason.above_ceiling']}`)).toBeInTheDocument();
    rerender(<ChangeFailed change={failed()} />);
    expect(screen.getByText(strings['chan.failed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['set.reason.above_ceiling'], { exact: false })).toBeNull();
    rerender(<ChangeFailed change={{ ...change, outcome: 'done' } as unknown as Change<ChannelChange, ChannelVars>} />);
    expect(screen.queryByText(strings['chan.failed'])).toBeNull();
  });

  it('a reason the page has no words for shows no made-up line', async () => {
    const { change } = stub();
    const failed = { ...change, outcome: 'failed', code: 'setting_invalid', details: { field: 'max_channels', reason: 'something_new' } } as unknown as Change<ChannelChange, ChannelVars>;
    render(<AllAppsSettings settings={{ ok: true, paused: false, maxChannels: 4, rateBotPerDay: 0, view: { settings: {}, effective: eff({ max_channels: [4, 'default'] }) } }} change={failed} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    await screen.findByRole('dialog', { name: strings['set.bot.title'] });
    expect(screen.queryByText(/max_channels|Most chat apps:/)).toBeNull();
  });
});

describe('closing a dialog that holds changes', () => {
  const botView: ChannelSettings = { ok: true, paused: false, maxChannels: 4, rateBotPerDay: 200, view: { settings: {}, effective: eff({ max_channels: [4, 'default'] }) } };
  it('the Bot-wide dialog asks before it drops a typed change, and keeps it when told to stay', async () => {
    const { change } = stub();
    render(<AllAppsSettings settings={botView} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    const field = await screen.findByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) });
    await userEvent.clear(field);
    await userEvent.type(field, '6');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: strings['set.discardAsk.title'] })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) })).toHaveValue('6');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: strings['set.discardAsk.go'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['set.bot.title'] })).toBeNull());
  });

  it('the Bot-wide dialog closes at once when nothing was typed', async () => {
    const { change } = stub();
    render(<AllAppsSettings settings={botView} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.bot.open'] }));
    await screen.findByRole('dialog', { name: strings['set.bot.title'] });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['set.bot.title'] })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a chat settings dialog asks too, even for a value that is still refused', async () => {
    const { change } = stub();
    await mount(<ChatsSection channel={channel} change={change} />);
    await userEvent.click(within(tableRow(0)).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Ana/ }));
    const field = dlg.getAllByRole('textbox')[0] as HTMLElement;
    await userEvent.type(field, '99999');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: strings['set.discardAsk.title'] })).toBeInTheDocument();
  });
});

describe('one Bot at a time', () => {
  // (Leaving a Bot with browser Back while its Bot-wide dialog holds a typed change drops that change without asking: the dialog
  // belongs to the Bot's own tab. The drawer's own guard does cover its drafts, see below.)
  it('a Bot-wide change typed for one Bot does not follow the person to the next Bot', async () => {
    const { router } = await renderPage(page, { state: 'channelsBoth', path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await openAllApps();
    const field = await screen.findByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) });
    await userEvent.clear(field);
    await userEvent.type(field, '6');
    // Behind the modal the list is inert: go to the next Bot the way Back does, through the URL.
    await act(async () => {
      await router.navigate({ href: `/bots?sel=${encodeURIComponent('c-atlas~a1b2c3d4e5f60718293a4b5c~support')}&tab=apps` });
    });
    expect(await screen.findByRole('row', { name: /Support chat/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['set.bot.title'] })).toBeNull());
  }, 60_000);
});

describe('a Bot-wide change whose answer was lost', () => {
  it('is still held, with Check again and a warned Dismiss, on the chat apps list once its dialog is closed', async () => {
    await renderPage(page, { state: 'channelChangePending', path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await openAllApps();
    const field = await screen.findByRole('textbox', { name: new RegExp(strings['set.n.max_channels']) });
    await userEvent.clear(field);
    await userEvent.type(field, '6');
    await userEvent.click(screen.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: strings['set.bot.title'] })).getByRole('button', { name: strings['set.save'] })).toBeDisabled());
    // A dialog with a lost answer is left through its Cancel, not Esc.
    await userEvent.click(within(screen.getByRole('dialog', { name: strings['set.bot.title'] })).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: strings['set.discardAsk.go'] }));
    const banner = await screen.findByText(strings['chan.maybe']);
    expect(within(banner.closest('[data-outcome]') as HTMLElement).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    await userEvent.click(within(banner.closest('[data-outcome]') as HTMLElement).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByRole('alertdialog', { name: 'Stop tracking this?' })).toBeInTheDocument();
  }, 60_000);
});

describe('the drawer guards what is typed', () => {
  it('an unsaved new name asks before the drawer closes', async () => {
    await open(undefined);
    const name = await screen.findByRole('textbox', { name: strings['chan.name.label'] });
    await userEvent.type(name, ' two');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  }, 60_000);

  it('a value still refused counts as unsaved too', async () => {
    await open(undefined);
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['set.all']) }));
    const field = await screen.findByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  }, 60_000);

  it('an untouched drawer closes without asking', async () => {
    await open(undefined);
    await screen.findByRole('textbox', { name: strings['chan.name.label'] });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: strings['chan.name.label'] })).toBeNull());
  }, 60_000);
});

describe('a chat dialog after a partial save', () => {
  function Live({ calls }: { calls: ChannelVars[] }) {
    const [ch, setCh] = useState(channel);
    const [draft, setDraft] = useState(emptyDraft);
    const { change } = stub();
    const live = {
      ...change,
      run: async (v: ChannelVars) => {
        calls.push(v);
        // The agent keeps what was sent: the chat stores it, and the refreshed list says so.
        setCh((c) => ({
          ...c,
          chatRows: c.chatRows.map((r) =>
            r.id !== v.target
              ? r
              : { ...r, view: { settings: { ...r.view.settings, ...v.settings }, effective: { ...r.view.effective, ...Object.fromEntries(Object.entries(v.settings ?? {}).map(([k, x]) => [k, { value: x, source: 'chat' }])) } } },
          ),
        }));
        return { outcome: 'done' as const };
      },
    } as unknown as Change<ChannelChange, ChannelVars>;
    return <ChatsBody channel={ch} change={live} draft={draft} onDraft={setDraft} />;
  }

  it('adopts the refreshed chat as its baseline: the saved value shows, and the old value is a change again', async () => {
    const calls: ChannelVars[] = [];
    await mount(<Live calls={calls} />);
    await userEvent.click(within(tableRow(1)).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Team/ }));
    const rate = () => dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_min']) });
    await userEvent.clear(rate());
    await userEvent.type(rate(), '11');
    // a second field the agent would refuse stays behind with its error
    const hour = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_hour']) });
    await userEvent.clear(hour);
    await userEvent.type(hour, '99999');
    await userEvent.tab();
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ rate_user_per_min: 11 });
    await waitFor(() => expect(rate()).toHaveValue('11'));
    expect(hour).toHaveValue('99999');
    // 10 was the old value: against the saved 11 it is a change to send
    await userEvent.clear(rate());
    await userEvent.type(rate(), '10');
    expect(dlg.getByRole('button', { name: strings['set.save'] })).toBeEnabled();
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.settings).toEqual({ rate_user_per_min: 10 });
  }, 60_000);
});

describe('a field that is back at the agent value', () => {
  it('shows the agent value again, so a later refresh of that value is not hidden behind old text', async () => {
    const { change } = stub();
    const { rerender } = render(<Section ch={channel} change={change} />);
    await openAll();
    const field = () => screen.getByRole('textbox', { name: new RegExp(strings['set.n.max_parts']) });
    await userEvent.clear(field());
    await userEvent.type(field(), '9');
    await userEvent.clear(field());
    await userEvent.type(field(), '8');
    expect(save()).toBeDisabled();
    expect(screen.getByRole('button', { name: strings['set.discard'] })).toBeDisabled();
    // the agent now reports 12
    const refreshed: Channel = { ...channel, view: { ...channel.view, effective: { ...channel.view.effective, max_parts: { value: 12, source: 'channel' } } } };
    rerender(<Section ch={refreshed} change={change} />);
    expect(field()).toHaveValue('12');
  });
});

describe('a Discord chat that overrides mention_only', () => {
  // The agent holds a chat's mention_only false at true unless the message content permission is known present. A chat does not
  // report that; the app's answer does, in one way: its own mention_only is false only with the permission known present, and its
  // note says unknown or missing otherwise (so does the state reason message_content_missing).
  const wire = (appMention: boolean, notes: { code: string; field: string }[] = [], extra: Record<string, unknown> = {}) => ({
    id: 'ch-d', kind: 'discord', label: 'D', state: 'connected',
    effective: { mention_only: { value: appMention, source: 'channel' }, reply_style: { value: 'thread', source: 'default' }, notes },
    chats: [{ id: 'g9', platform_chat: '9', kind: 'group', state: 'approved', title: 'Nine', settings: { mention_only: false } }],
    ...extra,
  });
  const unknown = { code: 'mention_only_capability_unknown', field: 'mention_only' };
  const missing = { code: 'mention_only_capability_missing', field: 'mention_only' };

  it("is held at true, with the app's own note, when the app says the permission is not known", async () => {
    const held = channelOf(wire(true, [unknown])).chatRows[0] as ChatRow;
    expect(held.view.settings).toEqual({ mention_only: false });
    expect(held.view.effective.mention_only).toEqual({ value: true, source: 'chat' });
    expect(held.notes).toEqual([unknown]);
    const { change } = stub();
    await mount(<ChatsSection channel={channelOf(wire(true, [unknown]))} change={change} />);
    await userEvent.click(screen.getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Nine/ }));
    const mention = dlg.getByText(strings['set.n.mention_only']).closest('[data-sg-row]') as HTMLElement;
    expect(within(mention).getByRole('switch')).toBeChecked();
    expect(within(mention).getByText(strings['set.note.mention_only_capability_unknown'])).toBeInTheDocument();
  });

  it('is held at true with the missing note when the app says the permission is missing, or the app state does', () => {
    expect((channelOf(wire(true, [missing])).chatRows[0] as ChatRow).notes).toEqual([missing]);
    const byState = channelOf(wire(true, [], { state_reason: 'message_content_missing' })).chatRows[0] as ChatRow;
    expect(byState.view.effective.mention_only).toEqual({ value: true, source: 'chat' });
    expect(byState.notes).toEqual([missing]);
  });

  it('is shown as stored, with no note invented, when the app says nothing about the permission (it may be present)', () => {
    const open = channelOf(wire(true)).chatRows[0] as ChatRow;
    expect(open.view.effective.mention_only).toEqual({ value: false, source: 'chat' });
    expect(open.notes).toEqual([]);
  });

  it('is shown as reading every message when the app itself does, and for other platforms as set', () => {
    const open = channelOf(wire(false)).chatRows[0] as ChatRow;
    expect(open.view.effective.mention_only).toEqual({ value: false, source: 'chat' });
    expect(open.notes).toEqual([]);
    const tg = channelOf({ ...wire(true, [unknown]), kind: 'telegram' }).chatRows[0] as ChatRow;
    expect(tg.view.effective.mention_only).toEqual({ value: false, source: 'chat' });
    expect(tg.notes).toEqual([]);
  });
});

describe('the agent reasons the page words', () => {
  it.each([
    ['gate_push_to_group', 'push_events'],
    ['message_content_missing', 'mention_only'],
    ['not_available', 'parse_mode'],
    ['open_rights', 'default_rights'],
  ])('%s is spelled out beside its setting', (reason, field) => {
    const { change } = stub();
    const failed = { ...change, outcome: 'failed', code: 'setting_conflict', details: { field, reason } } as unknown as Change<ChannelChange, ChannelVars>;
    render(<ChangeFailed change={failed} />);
    const said = `${strings[`set.n.${field}` as keyof typeof strings]}: ${strings[`set.reason.${reason}` as keyof typeof strings]}`;
    const line = screen.getByText((_, el) => !!el && el.textContent === said && ![...el.children].some((c) => c.textContent === said));
    // A setting of one app names it with its mark (rule 19); the others name no app.
    expect([...line.querySelectorAll('[data-chat-app]')].map((a) => a.getAttribute('data-chat-app'))).toEqual(field === 'parse_mode' ? ['telegram'] : []);
    if (field === 'parse_mode') expect(markOf(line, 'telegram')).not.toBeNull();
  });

  it('the open-policy reason names group chats as well as direct messages', () => {
    expect(strings['set.reason.open_rights']).toMatch(/direct messages/);
    expect(strings['set.reason.open_rights']).toMatch(/group chats/);
  });
});

describe('the drawer guards a chat dialog draft', () => {
  it('leaving the page with a value typed in a chat dialog asks first', async () => {
    const { router } = await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await manageSupport();
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.chats'] }));
    await userEvent.click((await screen.findAllByRole('button', { name: strings['set.chat.open'] }))[0] as HTMLElement);
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for/ }));
    const field = dlg.getAllByRole('textbox')[0] as HTMLElement;
    await userEvent.type(field, '5');
    // A held navigation does not settle until it is answered: not awaited.
    act(() => {
      void router.navigate({ href: '/guide' });
    });
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  }, 60_000);

  it('a chat dialog closed with its changes discarded leaves the drawer clean', async () => {
    await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps` });
    await manageSupport();
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.chats'] }));
    await userEvent.click((await screen.findAllByRole('button', { name: strings['set.chat.open'] }))[0] as HTMLElement);
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for/ }));
    await userEvent.type(dlg.getAllByRole('textbox')[0] as HTMLElement, '5');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: strings['set.discardAsk.go'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings for/ })).toBeNull());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['chan.rail.chats'] })).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
  }, 60_000);
});

describe('names the agent would refuse', () => {
  it('a chat app name over 64 characters keeps Rename off and says so', async () => {
    await open(undefined);
    const name = await screen.findByRole('textbox', { name: strings['chan.name.label'] });
    await userEvent.clear(name);
    await userEvent.click(name);
    await userEvent.paste('n'.repeat(65));
    expect(screen.getByRole('button', { name: strings['chan.name.save'] })).toBeDisabled();
    expect(screen.getByText(strings['chan.nameTooLong'].replace('{{max}}', '64'))).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.paste('n'.repeat(64));
    expect(screen.getByRole('button', { name: strings['chan.name.save'] })).toBeEnabled();
  }, 60_000);

  it('a name over 64 characters keeps a new chat app from being connected, and says so', async () => {
    await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    await userEvent.type(await screen.findByLabelText(strings['chan.token']), '123456:abc');
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['chan.addFlow.options']) }));
    const label = screen.getByRole('textbox', { name: strings['chan.label'] });
    await userEvent.click(label);
    await userEvent.paste('n'.repeat(65));
    expect(screen.getByRole('button', { name: new RegExp(strings['chan.connect']) })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(strings['chan.nameTooLong'].replace('{{max}}', '64'))).toBeInTheDocument();
    await userEvent.clear(label);
    await userEvent.paste('n'.repeat(64));
    expect(screen.getByRole('button', { name: strings['chan.connect'] })).toBeEnabled();
  }, 60_000);

  it('the connect step keeps the name and the webhook choice under a closed Options fold', async () => {
    await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    const fold = await screen.findByRole('button', { name: new RegExp(strings['chan.addFlow.options']) });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: strings['chan.label'] })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: new RegExp(strings['chan.webhook.create']) })).toBeNull();
    // the token fields stay in view: the step needs them
    expect(screen.getByLabelText(strings['chan.token'])).toBeInTheDocument();
    await userEvent.click(fold);
    expect(screen.getByRole('textbox', { name: strings['chan.label'] })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(strings['chan.webhook.create']) })).toBeInTheDocument();
  }, 60_000);

  it('the name field of a new chat app says it is a name in this Hub, as the settings one does', async () => {
    await renderPage(page, { state: undefined, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['chan.addFlow.options']) }));
    const label = await screen.findByRole('textbox', { name: 'Name in this Hub' });
    expect(label).toHaveAccessibleDescription('Only you see it. It tells this chat app apart in the list.');
    expect(strings['chan.label']).toBe(strings['chan.name.label']);
  }, 60_000);
});

describe('an ID list being typed', () => {
  const withBlocked = (ids: string[]): Channel => ({ ...channel, view: { ...channel.view, effective: { ...channel.view.effective, blocked_users: { value: ids, source: 'channel' } } } });
  const field = () => screen.getByRole('textbox', { name: new RegExp(strings['set.n.blocked_users']) });

  it('keeps the line break typed after the only ID, so the next ID is a second entry and the first is not replaced', async () => {
    const { calls, change } = stub();
    render(<Section ch={withBlocked(['123'])} change={change} />);
    await openAll();
    expect(field()).toHaveValue('123');
    await userEvent.type(field(), '{Enter}');
    // the list still reads as the agent's: nothing to save, but the typed break stays where it was typed
    expect(field()).toHaveValue('123\n');
    expect(save()).toBeDisabled();
    await userEvent.type(field(), '456');
    expect(field()).toHaveValue('123\n456');
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ blocked_users: ['123', '456'] });
  });

  it('keeps a comma the same way', async () => {
    const { calls, change } = stub();
    render(<Section ch={withBlocked(['123'])} change={change} />);
    await openAll();
    await userEvent.type(field(), ',');
    expect(field()).toHaveValue('123,');
    await userEvent.type(field(), '456');
    await userEvent.click(save());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.settings).toEqual({ blocked_users: ['123', '456'] });
  });

  it('still follows the agent when the list moves under text that only reads as the old list', async () => {
    const { change } = stub();
    const { rerender } = render(<Section ch={withBlocked(['123'])} change={change} />);
    await openAll();
    await userEvent.type(field(), '{Enter}');
    expect(field()).toHaveValue('123\n');
    rerender(<Section ch={withBlocked(['123', '777'])} change={change} />);
    expect(field()).toHaveValue('123\n777');
  });
});

describe('a chat that goes away while its settings are open', () => {
  function Gone({ ch }: { ch: Channel }) {
    const [draft, setDraft] = useState(noDraft);
    return (
      <>
        <ChatsBody channel={ch} change={stub().change} draft={draft} onDraft={setDraft} />
        <output data-testid="draft">{draftDirty(draft) ? 'dirty' : 'clean'}</output>
      </>
    );
  }

  it('closes its dialog and drops its draft, so no hidden draft keeps the drawer dirty', async () => {
    const { rerender } = await mount(<Gone ch={channel} />);
    await userEvent.click(within(tableRow(1)).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Team/ }));
    const rate = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_min']) });
    await userEvent.clear(rate);
    await userEvent.type(rate, '11');
    expect(screen.getByTestId('draft')).toHaveTextContent('dirty');
    await rerender(<Gone ch={{ ...channel, chatRows: channel.chatRows.filter((c) => c.id !== 'g1') }} />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings for Team/ })).toBeNull());
    expect(screen.getByTestId('draft')).toHaveTextContent('clean');
  });
});

describe('a partial save answered after its dialog is gone', () => {
  /** A chat whose Save is answered only when `answer()` is called; `drop()` takes the chat away from the list. */
  function Late({ calls, probe }: { calls: ChannelVars[]; probe: { answer: () => void; drop: () => void } }) {
    const [ch, setCh] = useState(channel);
    const [draft, setDraft] = useState(noDraft);
    // one promise for the whole host: a render must not swap the answer the press is waiting on
    const [{ held, release }] = useState(() => {
      let rel: () => void = () => undefined;
      return { held: new Promise<void>((r) => { rel = r; }), release: () => rel() };
    });
    probe.answer = release;
    probe.drop = () => setCh((c) => ({ ...c, chatRows: c.chatRows.filter((r) => r.id !== 'g1') }));
    const change = {
      ...stub().change,
      run: async (v: ChannelVars) => { calls.push(v); await held; return { outcome: 'done' as const }; },
    } as unknown as Change<ChannelChange, ChannelVars>;
    return (
      <>
        <ChatsBody channel={ch} change={change} draft={draft} onDraft={setDraft} />
        <output data-testid="draft">{draftDirty(draft) ? 'dirty' : 'clean'}</output>
      </>
    );
  }

  const fill = async () => {
    await userEvent.click(within(tableRow(1)).getByRole('button', { name: strings['set.chat.open'] }));
    const dlg = within(await screen.findByRole('dialog', { name: /Settings for Team/ }));
    const rate = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_min']) });
    await userEvent.clear(rate);
    await userEvent.type(rate, '11');
    const hour = dlg.getByRole('textbox', { name: new RegExp(strings['set.n.rate_user_per_hour']) });
    await userEvent.clear(hour);
    await userEvent.type(hour, '99999');
    await userEvent.tab();
    return dlg;
  };

  it('the chat was removed meanwhile: the answer writes no draft', async () => {
    const calls: ChannelVars[] = [];
    const probe = { answer: () => undefined, drop: () => undefined };
    await mount(<Late calls={calls} probe={probe} />);
    const dlg = await fill();
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => probe.drop());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings for Team/ })).toBeNull());
    await act(async () => probe.answer());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('draft')).toHaveTextContent('clean');
  });

  it('the dialog was closed meanwhile: the answer writes no draft', async () => {
    const calls: ChannelVars[] = [];
    const probe = { answer: () => undefined, drop: () => undefined };
    await mount(<Late calls={calls} probe={probe} />);
    const dlg = await fill();
    await userEvent.click(dlg.getByRole('button', { name: strings['set.save'] }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: strings['set.discardAsk.go'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings for Team/ })).toBeNull());
    await act(async () => probe.answer());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('draft')).toHaveTextContent('clean');
  });
});
