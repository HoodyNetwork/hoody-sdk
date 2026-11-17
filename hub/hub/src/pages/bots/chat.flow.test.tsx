// Vitest: a chat app says what waits on the person without a click (the Chat apps badge, a line
// on each app card with the button to where it is fixed), and writes its flow out in plain steps: the Setup Verdict and Track,
// the Telegram privacy step, the owner code and invite steps, and how a group joins with the command each platform accepts.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, renderPage, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetCodesForTests } from './codes';
import type { BotView, Change, Channel, ChannelChange, ChannelSettings, ChannelVars, Right } from './data';
import page from './page';
import { ChatAppsTab } from './parts/ChatAppsTab';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => resetCodesForTests());

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state: string, extra = '') => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps${extra}` });
const drawer = () => screen.findByRole('dialog');
const rail = async (name: string) => userEvent.click(within(await drawer()).getByRole('button', { name }));
// A sentence with a chat app's name: the kit draws the name with its mark, so the text reads the same.
const named = (s: string) => s.replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord');
// A Track step by its name: the kit adds the step's state for screen readers after it.
const step = (k: keyof typeof strings) => new RegExp(`^${strings[k]}`);
// The innermost element whose text holds `text` (a sentence split around the app marks, maybe followed by a link).
const whole = (text: string) => (_: string, el: Element | null) => !!el && (el.textContent ?? '').includes(text) && ![...el.children].some((c) => (c.textContent ?? '').includes(text));

describe('waiting on the person, without a click', () => {
  it('the Chat apps tab carries a badge: an asking group, an app without an owner, Telegram privacy on', async () => {
    await open('channelGroupAsks');
    const tab = await screen.findByRole('tab', { name: new RegExp(strings['tab.apps']) });
    // The count says what it counts: a bare "3" beside "Chat apps" reads as how many apps there are.
    expect(tab).toHaveTextContent(`${strings['tab.apps']}3 ${strings['tab.appsUnit']}`);
  });

  it('the Work tab says its count is of open tasks', async () => {
    await open('channelGroupAsks');
    const tab = await screen.findByRole('tab', { name: new RegExp(strings['tab.work']) });
    expect(tab).toHaveTextContent(new RegExp(`^${strings['tab.work']}\\d+ ${strings['tab.workUnit']}$`));
  });

  it('while every app is paused the badge counts nothing (a paused app asks nothing)', async () => {
    await open('channelsPaused');
    const tab = await screen.findByRole('tab', { name: new RegExp(strings['tab.apps']) });
    // channelsPaused: the Slack app has no owner and the Telegram privacy note stays, but both apps are paused.
    expect(tab).toHaveTextContent(new RegExp(`^${strings['tab.apps']}$`));
  });

  it("each app's row names what waits, and Review opens the app's Chats on the asking group", async () => {
    await open('channelGroupAsks');
    const row = await screen.findByRole('row', { name: /Support chat/ });
    // The Needs you cell names the first wait (the asking group, waitingOf order) and how many more; the row menu holds each.
    const first = strings['apps.need.requested_one'].replace('{{count}}', '1');
    expect(within(row).getByText(strings['apps.needsMore'].replace('{{first}}', first).replace('{{count}}', '1'))).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    expect(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['flow.wait.go.privacy']}`) })).toHaveTextContent(strings['flow.wait.privacy']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(row).getByRole('button', { name: strings['flow.wait.go.requested'] }));
    const d = await drawer();
    expect(within(d).getByRole('region', { name: strings['chan.rail.chats'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['flow.chat.requestedLine'])).toBeInTheDocument();
    // The asking group comes first.
    const names = within(within(d).getByRole('table', { name: /Chats of/ })).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    const asking = names.findIndex((n) => n.startsWith('testgroup'));
    const settled = names.findIndex((n) => n.startsWith('Support chat'));
    expect(asking).toBeGreaterThanOrEqual(0);
    expect(settled).toBeGreaterThanOrEqual(0);
    expect(asking).toBeLessThan(settled);
  });

  it('the app with no owner says so, and its button opens Setup on the owner steps', async () => {
    await open('channelGroupAsks');
    await userEvent.click(await screen.findByRole('button', { name: strings['flow.wait.go.owner'] }));
    const d = await drawer();
    expect(within(d).getByRole('region', { name: step('setup.step.owner') })).toBeInTheDocument();
  });

  it("the Bot header's Fix opens Chat apps when a chat app is all that needs fixing", async () => {
    const { router } = await renderPage(page, { state: 'chatAppAttention', path: `/bots?sel=${encodeURIComponent(KEY)}` });
    await userEvent.click(await screen.findByRole('button', { name: strings['bot.primary.fixApps'] }));
    expect(new URLSearchParams(router.state.location.searchStr).get('tab')).toBe('apps');
  });

  it('a model problem keeps Fix in settings', async () => {
    await renderPage(page, { state: 'needsKey', path: `/bots?sel=${encodeURIComponent(KEY)}` });
    expect(await screen.findByRole('button', { name: strings['bot.primary.fix'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['bot.primary.fixApps'] })).toBeNull();
  });
});

describe('Telegram privacy', () => {
  it('Setup opens the privacy step: on, the BotFather steps with @name, re-adding, and the pause-and-resume row', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    const d = await drawer();
    const card = within(d).getByRole('region', { name: step('setup.step.privacy') });
    expect(within(card).getByText(strings['setup.tag.privacyOn'])).toBeInTheDocument();
    expect(within(card).getByText('/setprivacy')).toBeInTheDocument();
    expect(within(card).getByText('@atlas_support_bot')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: new RegExp(strings['setup.privacy.open']) })).toHaveAttribute('href', 'https://t.me/BotFather');
    expect(within(card).getByText(strings['setup.privacy.readd'])).toBeInTheDocument();
    expect(within(card).getByText(strings['setup.privacy.restart'])).toBeInTheDocument();
    // the standing band lives in Chats now; Setup says it in its Verdict
    expect(within(d).queryByText(strings['flow.privacy.title'])).toBeNull();
    expect(within(d).getByText(strings['setup.mark.privacy'])).toBeInTheDocument();
  });

  it('Chats shows the warning with a button to the steps, and each group row says what the Bot sees', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(strings['flow.privacy.title'])).toBeInTheDocument();
    expect(within(d).getAllByText(strings['flow.chat.privacyLine'])).toHaveLength(2);
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.privacy.fix'] }));
    // the band's button opens Setup on the privacy step itself
    expect(within(await drawer()).getByRole('region', { name: step('setup.step.privacy') })).toBeInTheDocument();
    expect(within(d).getByText(strings['setup.privacy.restart'])).toBeInTheDocument();
  });

  it('no warning on Slack or Discord', async () => {
    await open('channelGroupAsks', '&app=ch-sl');
    const d = await drawer();
    expect(within(d).queryByText(strings['flow.privacy.title'])).toBeNull();
  });
});

describe('how a group joins', () => {
  it('Slack: the steps open while it has no group, with !bind and a mention typed as a plain message', async () => {
    await open('channelGroupAsks', '&app=ch-sl');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(`!bind ${strings['flow.group.atBot']}`)).toBeVisible();
    expect(within(d).getByText(whole(named(strings['flow.group.bindPlain'].replace('{{app}}', '{{slack}}'))))).toBeInTheDocument();
    expect(within(d).getByText(strings['flow.group.approveRow'])).toBeInTheDocument();
  });

  it('Telegram: one click away once it has groups; privacy first, @name, /bind, approve here or in the private chat', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText('/bind')).not.toBeVisible();
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
    expect(within(d).getByText('/setprivacy')).toBeInTheDocument();
    expect(within(d).getByText(strings['flow.group.privacyNote'])).toBeInTheDocument();
    expect(within(d).getByText(strings['flow.group.addRow.telegram'])).toBeInTheDocument();
    expect(within(d).getByText('@atlas_support_bot')).toBeInTheDocument();
    expect(within(d).getByText('/bind')).toBeVisible();
    expect(within(d).getByText(whole(named(strings['flow.group.mentionOnPrivacy'])))).toBeInTheDocument();
  });
});

describe('the setup verdict and track', () => {
  it('counts what is done, names the owner, and leaves privacy open', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    const d = await drawer();
    expect(within(d).getByText(strings['setup.count'].replace('{{done}}', '4').replace('{{total}}', '5'))).toBeInTheDocument();
    expect(within(d).getByText(strings['setup.next'].replace('{{step}}', strings['setup.step.privacy']))).toBeInTheDocument();
    const track = within(d).getByRole('list', { name: strings['setup.label'] });
    expect(within(track).getByText('Ana')).toBeInTheDocument();
    expect(within(track).getByRole('region', { name: step('setup.step.privacy') })).toBeInTheDocument();
  });
});

describe('the owner code in plain steps', () => {
  it('Telegram without an owner: a StepList, make the code here, then the private chat with @name (its link) and the send', async () => {
    await open('channelOwnerless', '&app=ch-tg');
    const d = await drawer();
    const list = within(d).getByRole('group', { name: strings['flow.owner.steps'] });
    // Numbered rows grouped by where they happen; the Owner code button is the first row's control.
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('span')?.textContent)).toEqual(['01', '02', '03']);
    expect(within(rows[0] as HTMLElement).getByText(strings['flow.owner.row.get'])).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(whole(named(strings['flow.owner.s2.telegram']).replace('{{at}}', '@atlas_support_bot')))).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: new RegExp(`^${strings['flow.owner.openChat']}`) })).toHaveAttribute('href', 'https://t.me/atlas_support_bot');
    expect(within(rows[2] as HTMLElement).getByText(strings['flow.owner.row.send'])).toBeInTheDocument();
    // No long block in one step: each row is one line; the code's own field says it works once.
    expect(rows[2]?.textContent).toBe(`03${strings['flow.owner.row.send']}`);
    expect(within(list).getByText(strings['flow.group.where.here'])).toBeInTheDocument();
    expect(within(list).getByText(strings['flow.group.where.app'])).toBeInTheDocument();
    // The page updating by itself is one of the step's facts.
    expect(within(within(d).getByLabelText(strings['flow.owner.facts'])).getByText(strings['flow.owner.s4'])).toBeInTheDocument();
    // The code's lifetime (the app's pairing_ttl_minutes, 15 by default) shows before the person makes the code.
    expect(within(within(d).getByLabelText(strings['flow.owner.facts'])).getByText(/\b15 minutes\b/)).toBeInTheDocument();
  });

  it('Slack: the Messages tab of the app', async () => {
    await open('channelGroupAsks', '&app=ch-sl');
    const d = await drawer();
    expect(within(d).getByText(whole(named(strings['flow.owner.s2.slack'])))).toBeInTheDocument();
    expect(within(d).queryByRole('link', { name: /Open the chat/ })).toBeNull();
  });

  it('Connect off says why in the footer: the token, then the Slack app token', async () => {
    await open('channelGroupAsks', '&app=new');
    const d = await drawer();
    await userEvent.click(within(d).getByRole('radio', { name: /Slack/ }));
    await userEvent.click(within(d).getByRole('button', { name: strings['ui.next'] }));
    // The visible footer line (the ReasonButton also carries it as its description).
    const line = (k: 'chan.addFlow.needToken' | 'chan.addFlow.needAppToken') => within(d).queryAllByText(strings[k]).find((x) => x.closest('[data-drawer-reason]'));
    expect(line('chan.addFlow.needToken')).toBeDefined();
    await userEvent.type(within(d).getByLabelText(strings['chan.token']), 'xoxb-1');
    expect(line('chan.addFlow.needAppToken')).toBeDefined();
    expect(within(d).getByRole('button', { name: new RegExp(strings['chan.connect']) })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(within(d).getByLabelText(strings['chan.appToken']), 'xapp-1');
    expect(within(d).queryAllByText(strings['chan.addFlow.needAppToken'])).toHaveLength(0);
    expect(within(d).getByRole('button', { name: strings['chan.connect'] })).toBeEnabled();
  });

  it('the add flow is a Track of two screens: the chat app, then make and connect, with the owner next on the track', async () => {
    await open('channelGroupAsks', '&app=new');
    const d = await drawer();
    const track = within(d).getByRole('list', { name: strings['chan.addFlow.steps'] });
    expect(within(track).getByRole('region', { name: step('chan.addFlow.step.kind') })).toBeInTheDocument();
    // Rule 30: each screen's press is in its open step's foot, not the drawer footer (no step counter, no footer Back).
    const kindStep = within(track).getByRole('region', { name: step('chan.addFlow.step.kind') });
    expect(within(kindStep).getByRole('button', { name: strings['ui.next'] })).toBeInTheDocument();
    expect(within(d).queryByText(/Step 1 of 2/)).toBeNull();
    await userEvent.click(within(kindStep).getByRole('button', { name: strings['ui.next'] }));
    // The app is a done row with the app picked; the connect step is open with its why and foot; the owner is a later row.
    expect(within(track).getByRole('region', { name: step('chan.addFlow.step.connect') })).toBeInTheDocument();
    expect(within(track).getByText(strings['chan.addFlow.why'])).toBeInTheDocument();
    expect(within(track).getByText(strings['chan.addFlow.say'])).toBeInTheDocument();
    expect(within(track).getByText(step('chan.addFlow.step.owner')).closest('li')).toHaveAttribute('data-state', 'later');
    // No third screen: the token goes in here and Connect is the step's press, in its foot.
    const connectStep = within(track).getByRole('region', { name: step('chan.addFlow.step.connect') });
    await userEvent.type(within(d).getByLabelText(strings['chan.token']), '1:x');
    expect(within(d).queryByRole('button', { name: strings['ui.next'] })).toBeNull();
    expect(within(connectStep).getByRole('button', { name: strings['chan.connect'] })).toBeEnabled();
    // The field sits under the list's Back here row; the token field shows what it promises.
    const list = within(d).getByRole('group', { name: strings['chan.setup.title'].replace('{{app}}', 'Telegram') });
    expect(within(list).getByText(strings['chan.addFlow.pasteRow'])).toBeInTheDocument();
    expect(list.compareDocumentPosition(within(d).getByLabelText(strings['chan.token'])) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(d).getAllByText(strings['chan.secretPromise.here']).length).toBeGreaterThan(0);
    // The app's row opens the first screen again.
    await userEvent.click(within(track).getByRole('button', { name: step('chan.addFlow.step.kind') }));
    expect(within(d).getByRole('radiogroup', { name: strings['chan.kind'] })).toBeInTheDocument();
  });

  it('invite codes: their own steps in People', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    await rail(strings['chan.rail.people']);
    const d = await drawer();
    expect(within(d).getByText(whole(named(strings['flow.invite.s3.telegram']).replace('{{at}}', '@atlas_support_bot')))).toBeInTheDocument();
    expect(within(d).getByText(strings['flow.invite.s4'].replace('{{min}}', '15'))).toBeInTheDocument();
  });
});

// The owner code used while the drawer watches: Setup says who the owner is now (the list refreshes on its own).
const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const ana = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'] as Right[], owner: true, lang: '' };
const app = (owned: boolean, privacy = false): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: owned ? 'running' : 'needs_owner', needsOwner: !owned, people: owned ? 1 : 0, chats: 0, homeChat: null, reason: '',
  principals: owned ? [ana] : [], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: privacy ? [{ code: 'telegram_privacy_on', field: 'group_mode' }] : [],
});
const change = { run: async () => ({ outcome: 'done' }), outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<ChannelChange, ChannelVars>;
const pause = { ...change } as unknown as Change<unknown, { paused: boolean }>;
const settings = { ok: true, paused: false } as unknown as ChannelSettings;
let setOwned: (o: boolean) => void = () => undefined;
let setAppState: (st: Channel['state'] | undefined) => void = () => undefined;
function Live({ first, privacy = false }: { first: boolean; privacy?: boolean }) {
  const [owned, set] = useState(first);
  const [st, setSt] = useState<Channel['state'] | undefined>(undefined);
  setOwned = set;
  setAppState = setSt;
  return <ChatAppsTab bot={bot} channels={[st ? { ...app(owned, privacy), state: st } : app(owned, privacy)]} settings={settings} loading={false} change={change} pause={pause} />;
}
async function show(first: boolean, privacy = false) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Live first={first} privacy={privacy} /> }), history: createMemoryHistory({ initialEntries: ['/bots?app=ch-x'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
}

describe('when the owner code is used', () => {
  it('Setup says who the owner is now and the owner step is done', async () => {
    await show(false);
    expect(await screen.findByRole('region', { name: step('setup.step.owner') })).toBeInTheDocument();
    act(() => setOwned(true));
    expect(await screen.findByText(strings['flow.owner.paired'].replace('{{name}}', 'Ana'))).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: step('setup.step.owner') })).toBeNull();
    expect(screen.getByRole('list', { name: strings['setup.label'] }).querySelector('[data-step="owner"]')).toHaveAttribute('data-state', 'done');
  });

  it("Chats' privacy button opens Setup on the privacy step even while the owner step is the one Setup opens", async () => {
    await show(false, true);
    const d = await drawer();
    expect(within(d).getByRole('region', { name: step('setup.step.owner') })).toBeInTheDocument();
    await rail(strings['chan.rail.chats']);
    await userEvent.click(within(await drawer()).getByRole('button', { name: strings['flow.privacy.fix'] }));
    const after = await drawer();
    expect(within(after).getByRole('region', { name: step('setup.step.privacy') })).toBeInTheDocument();
    expect(within(after).queryByRole('region', { name: step('setup.step.owner') })).toBeNull();
  });

  it('a step opened by hand gives way when the next step changes (the owner code used)', async () => {
    await show(false);
    expect(await screen.findByRole('region', { name: step('setup.step.owner') })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: step('setup.step.home') }));
    expect(screen.getByRole('region', { name: step('setup.step.home') })).toBeInTheDocument();
    act(() => setOwned(true));
    expect(await screen.findByRole('region', { name: step('setup.step.group') })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: step('setup.step.home') })).toBeNull();
  });

  it('a hand-opened step does not come back when the next step leaves and returns', async () => {
    await show(true);
    act(() => setAppState('auth_failed'));
    expect(await screen.findByRole('region', { name: step('chan.replaceToken') })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: step('setup.step.home') }));
    expect(screen.getByRole('region', { name: step('setup.step.home') })).toBeInTheDocument();
    act(() => setAppState('starting'));
    act(() => setAppState('auth_failed'));
    expect(await screen.findByRole('region', { name: step('chan.replaceToken') })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: step('setup.step.home') })).toBeNull();
  });

  it('an app that already had its owner when opened shows no "now the owner" line', async () => {
    await show(true);
    await screen.findByRole('list', { name: strings['setup.label'] });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText(strings['flow.owner.paired'].replace('{{name}}', 'Ana'))).toBeNull();
  });
});

// Edge cases of the chat flow, one test per case.
const fill = (text: string, vars: Record<string, string>) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), text);
const S = strings as Record<string, string>;
const mode = (m: string) => ({ setting: S['set.n.group_mode'] ?? '', value: S[`set.v.group_mode.${m}`] ?? '', allowed: S['set.n.allowed_chats'] ?? '' });

describe('the group steps say what the app accepts', () => {
  it('1. Slack: the bind command carries a mention of the Bot (Slack passes on only messages that mention it)', async () => {
    await open('channelGroupAsks', '&app=ch-sl');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(`!bind ${strings['flow.group.atBot']}`)).toBeVisible();
    expect(within(d).queryByText('!bind')).toBeNull();
    expect(within(d).getByText(whole(named(strings['flow.group.bindPlain'].replace('{{app}}', '{{slack}}'))))).toBeInTheDocument();
    expect(within(d).getByText(whole(named(strings['flow.group.mentionOnAddressed'].replace('{{app}}', '{{slack}}'))))).toBeInTheDocument();
    expect(within(d).queryByText(strings['flow.group.mentionOn'])).toBeNull();
  });

  it('2. group access open: a requested group is not said to be unread, and approval is not a step', async () => {
    await open('channelGroupOpen', '&app=ch-tg');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(fill(strings['flow.chat.requestedLineOpen'], mode('open')))).toBeInTheDocument();
    expect(within(d).queryByText(strings['flow.chat.requestedLine'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
    expect(within(d).getByText(fill(strings['flow.group.openNote'], mode('open')))).toBeInTheDocument();
    expect(within(d).queryByText(strings['flow.group.approveRow'])).toBeNull();
  });

  it('3a. group access off: the first step turns group chats on', async () => {
    await open('channelGroupsOff', '&app=ch-sl');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(fill(strings['flow.group.modeOff'], mode('off')))).toBeInTheDocument();
  });

  it('3b. group access allowlist: the first step lists the group', async () => {
    await open('channelGroupAllowlist', '&app=ch-sl');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).getByText(fill(strings['flow.group.modeAllowlist'], mode('allowlist')))).toBeInTheDocument();
  });

  it('3c. the default (groups I approve) adds no first step', async () => {
    await open('channelGroupAsks', '&app=ch-sl');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    expect(within(d).queryByText(fill(strings['flow.group.modeOff'], mode('off')))).toBeNull();
    expect(within(d).queryByText(fill(strings['flow.group.modeAllowlist'], mode('allowlist')))).toBeNull();
  });

  it('4. Telegram privacy not reported: the step is unknown, not ticked, and not counted', async () => {
    await open('channelPrivacyUnknown', '&app=ch-tg');
    const d = await drawer();
    // nothing is left to do, so no step opens by itself; the unknown one opens on a press
    expect(within(d).queryByRole('region', { name: step('setup.step.privacy') })).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: step('setup.step.privacy') }));
    expect(within(d).getByRole('region', { name: step('setup.step.privacy') }).closest('li')).toHaveAttribute('data-state', 'unknown');
    expect(within(d).getByText(strings['setup.why.privacyUnknown'])).toBeInTheDocument();
    expect(within(d).queryByText(strings['setup.tag.privacyOn'])).toBeNull();
    expect(within(d).getByText(strings['setup.count'].replace('{{done}}', '4').replace('{{total}}', '4'))).toBeInTheDocument();
    expect(within(d).getByText(strings['setup.verdict.ok'])).toBeInTheDocument();
  });

  it('5. mentions only off while Telegram privacy is on: it does not claim to read every message', async () => {
    await open('channelMentionAllPrivacy', '&app=ch-tg');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
    expect(within(d).getByText(whole(named(strings['flow.group.mentionOffPrivacy'])))).toBeInTheDocument();
    expect(within(d).queryByText(whole(named(strings['flow.group.mentionOff'].replace('{{app}}', '{{telegram}}'))))).toBeNull();
  });

  it('6. the admin way fixes one group only: the steps say the app-wide warning stays', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    const d = await drawer();
    // The privacy step is short rows and a Facts list (no 697-character block): what privacy changes, when it
    // takes effect, when it is checked, and what the admin way does.
    const card = within(d).getByRole('region', { name: step('setup.step.privacy') });
    const facts = within(card).getByLabelText(strings['setup.privacy.facts']);
    expect(within(facts).getByText(strings['setup.fact.admin'])).toBeInTheDocument();
    expect(within(facts).getByText(strings['setup.fact.adminValue'])).toBeInTheDocument();
    expect(within(facts).getByText(strings['setup.fact.joinsValue'])).toBeInTheDocument();
    expect(within(facts).getByText(strings['setup.fact.checkedValue'])).toBeInTheDocument();
    // The StepList rows carry no notes: each is one line.
    const steps = within(card).getByRole('group', { name: strings['setup.privacy.steps'] });
    expect(steps.querySelectorAll('li').length).toBe(4);
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['setup.privacy.why']) }));
    expect(await within(d).findByText(strings['setup.privacy.whyText'])).toBeInTheDocument();
  });

  it('7. the demo answer names no app: Connect closes the drawer, and the new row opens Setup with its Owner code', async () => {
    await open('channelGroupAsks', '&app=new');
    const d = await drawer();
    await userEvent.click(within(d).getByRole('button', { name: strings['ui.next'] }));
    await userEvent.type(within(d).getByLabelText(strings['chan.token']), '1:x');
    await userEvent.click(within(d).getByRole('button', { name: strings['chan.connect'] }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    // The row's Get the owner code on an app without an owner opens Setup, with the Owner code button.
    const row = screen.getByRole('row', { name: /Team workspace/ });
    await userEvent.click(within(row).getByRole('button', { name: strings['flow.wait.go.owner'] }));
    expect(within(await drawer()).getByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
  });
});

// More edge cases of the chat flow, one test per case.
describe('chat flow edge cases', () => {
  it('1. a group access value the page does not know: no bind or approval promise, a neutral line instead', async () => {
    await open('channelGroupModeUnknown', '&app=ch-tg');
    await rail(strings['chan.rail.chats']);
    const d = await drawer();
    const words = { setting: S['set.n.group_mode'] ?? '' };
    expect(within(d).getByText(fill(strings['flow.chat.requestedLineUnknown'], words))).toBeInTheDocument();
    expect(within(d).queryByText(strings['flow.chat.requestedLine'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
    expect(within(d).getByText(fill(strings['flow.group.modeUnknown'], words))).toBeInTheDocument();
    expect(within(d).queryByText('/bind')).toBeNull();
    expect(within(d).queryByText(strings['flow.group.approveRow'])).toBeNull();
  });

  for (const [id, app] of [['ch-sl', '{{slack}}'], ['ch-dc', '{{discord}}']] as const) {
    it(`2. ${id}: the mentions line says the app decides what reaches the Bot without a mention, never a rule`, async () => {
      await open('channelGroupAsks', `&app=${id}`);
      await rail(strings['chan.rail.chats']);
      const d = await drawer();
      if (id === 'ch-dc') await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
      expect(within(d).getByText(whole(named(strings['flow.group.mentionOnAddressed'].replace('{{app}}', app))))).toBeInTheDocument();
      expect(strings['flow.group.mentionOnAddressed']).not.toMatch(/needs the mention/);
    });
  }
});

// The add flow's next screen is the app just made: its Setup with Owner open, and an Owner code
// press for that app. An answer that names no app closes the drawer, and the app's row opens it.
describe('after Connect, the app just made', () => {
  const harness = async (answer: (made: Channel) => unknown, state: Channel['state'] = 'needs_owner', gate?: Promise<void>) => {
    const made: Channel = { ...app(false), id: 'ch-made', label: 'Made here', state };
    const calls: ChannelVars[] = [];
    let addMade: () => void = () => undefined;
    let setList: (l: Channel[]) => void = () => undefined;
    const run = async (v: ChannelVars) => {
      calls.push(v);
      if (v.action.startsWith('create:')) {
        if (gate) await gate;
        return { outcome: 'done', data: answer(made) };
      }
      return v.action === 'ownerCode' ? { outcome: 'done', data: { issued: true } } : { outcome: 'done' };
    };
    const live = { ...change, run } as unknown as Change<ChannelChange, ChannelVars>;
    function List() {
      const [list, set] = useState<Channel[]>([]);
      addMade = () => set([made]);
      setList = set;
      return <ChatAppsTab bot={bot} channels={list} settings={settings} loading={false} change={live} pause={pause} />;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: () => <List /> }), history: createMemoryHistory({ initialEntries: ['/bots?app=new'] }) });
    await act(async () => {
      render(
        <CoreQueryProvider>
          <RouterProvider router={router} />
        </CoreQueryProvider>,
      );
      await router.load();
    });
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['ui.next'] }));
    await userEvent.type(within(d).getByLabelText(strings['chan.token']), '1:x');
    await userEvent.click(within(d).getByRole('button', { name: strings['chan.connect'] }));
    return { calls, addMade: () => act(() => addMade()), setList: (l: Channel[]) => act(() => setList(l)) };
  };

  it('an answer that comes after the add drawer was closed opens nothing', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    await harness((made) => ({ channel: made }), 'starting', gate);
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    await act(async () => { release(); await gate; });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('once the list had the app, a list that drops it closes its drawer (the create answer is not kept)', async () => {
    const { addMade, setList } = await harness((made) => ({ channel: made }), 'starting');
    await screen.findByRole('dialog', { name: /Made here/ });
    addMade();
    setList([]);
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
  });

  it('an answer of another kind than the one picked (the parser turns an unknown kind into Telegram) closes the drawer', async () => {
    // the harness picks Telegram; the answer says Slack
    await harness((made) => ({ channel: { ...made, kind: 'slack' } }));
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
  });

  for (const bad of [{ id: 'new' }, { kind: 'irc' }]) {
    it(`an answer naming no usable app (${JSON.stringify(bad)}) closes the drawer, never a second add flow`, async () => {
      await harness((made) => ({ channel: { ...made, ...bad } }));
      await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    });
  }

  it('the create answer names the app: its drawer opens at once on Setup, Owner open, before the list has it', async () => {
    // A new app is still starting: the track would open nothing by itself, so Owner is open because the add flow asked.
    const { calls, addMade } = await harness((made) => ({ channel: made }), 'starting');
    const setup = await screen.findByRole('dialog', { name: /Made here/ });
    const owner = within(setup).getByRole('region', { name: step('setup.step.owner') });
    await userEvent.click(within(owner).getByRole('button', { name: strings['chan.ownerCode'] }));
    expect(calls.at(-1)).toMatchObject({ channelId: 'ch-made', action: 'ownerCode' });
    // The list then has it: the same drawer stays.
    addMade();
    expect(screen.getByRole('dialog', { name: /Made here/ })).toBe(setup);
  });

  it('an answer that names no app closes the drawer; the card opens Setup and Owner code asks for that app', async () => {
    const { calls, addMade } = await harness(() => ({ channel: { ...app(false), id: '' } }));
    addMade();
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
    const row = await screen.findByRole('row', { name: /Made here/ });
    await userEvent.click(within(row).getByRole('button', { name: strings['flow.wait.go.owner'] }));
    const setup = await screen.findByRole('dialog');
    await userEvent.click(within(setup).getByRole('button', { name: strings['chan.ownerCode'] }));
    expect(calls.at(-1)).toMatchObject({ channelId: 'ch-made', action: 'ownerCode' });
  });
});

describe('the token reveal keeps the keyboard place', () => {
  it('Replace moves focus into the token field, and Cancel returns it to Replace', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    const d = await drawer();
    await userEvent.click(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
    // the row and its field share the words "Bot token": the field is the input
    expect(document.activeElement).toBe(within(d).getAllByLabelText(strings['chan.token']).find((el) => el.tagName === 'INPUT'));
    await userEvent.click(within(d).getByRole('button', { name: strings['ui.cancel'] }));
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: strings['setup.token.replace'] }));
  });
});
