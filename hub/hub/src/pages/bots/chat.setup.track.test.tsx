// Vitest: the Setup Verdict and Track drawn from an app's state. The
// Verdict's sentence marks the first wrong thing (a webhook or a refused token in danger, no owner or privacy on in warn) and
// says nothing marked when all is well; the open step holds what the page passed in (the owner code, the token fields, the
// webhook's Remove); the page may open a step itself, and a press on a closed step asks the page to open it.
import { cleanup, screen, userEvent, within } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { PRIVACY_NOTE } from './chatFlow';
import type { Channel } from './data';
import { SetupTrack } from './parts/ChatSetup';
import { mount } from './routed';
import strings from './strings.en.json';

const app = (over: Partial<Channel> = {}): Channel =>
  ({
    id: 'c1',
    kind: 'telegram',
    label: 'T Main',
    state: 'running',
    reason: null,
    notes: [],
    needsOwner: false,
    principals: [{ id: 'p1', name: 'Ana', platformUser: 'ana', owner: true }],
    chatRows: [],
    homeChat: null,
    view: { settings: {}, effective: {} },
    identity: { username: 'shop_bot' },
    ...over,
  }) as unknown as Channel;
const ownerless = { needsOwner: true, principals: [] } as Partial<Channel>;
const doneAll = app({ kind: 'slack', homeChat: 'Team', chatRows: [{ id: 'g1', kind: 'group', state: 'approved', title: 'Team', platformChat: '-1', view: { settings: {}, effective: {} } }] as Channel['chatRows'] });

const draw = (channel: Channel, extra: Partial<Parameters<typeof SetupTrack>[0]> = {}) =>
  mount(
    <SetupTrack
      channel={channel}
      owner={<p>OWNER-NODE</p>}
      token={<p>TOKEN-FIELDS</p>}
      tokenPrimary={<button type="button">TOKEN-GO</button>}
      webhookPrimary={<button type="button">WEBHOOK-GO</button>}
      chatsButton={<button type="button">CHATS-GO</button>}
      settingsButton={<button type="button">SETTINGS-GO</button>}
      restartButton={<button type="button">RESTART-GO</button>}
      open={undefined}
      onOpen={() => undefined}
      {...extra}
    />,
  );
const step = (k: keyof typeof strings) => new RegExp(`^${strings[k]}`);
const verdict = () => screen.getByRole('group', { name: strings['setup.label'] });
const mark = () => verdict().querySelector('[data-verdict-mark]');
const segments = () => [...verdict().querySelectorAll('[data-segment]')].map((x) => x.getAttribute('data-segment'));

describe('the Verdict', () => {
  it('a refused token: the sentence marks it in danger, and the token step is open under its replace name with the fields', async () => {
    await draw(app({ state: 'auth_failed' }));
    expect(mark()).toHaveAttribute('data-verdict-mark', 'danger');
    expect(mark()).toHaveTextContent(strings['setup.mark.token']);
    expect(segments()[0]).toBe('blocking');
    const card = screen.getByRole('region', { name: step('chan.replaceToken') });
    expect(within(card).getByText(strings['setup.why.token'])).toBeInTheDocument();
    expect(within(card).getByText('TOKEN-FIELDS')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'TOKEN-GO' })).toBeInTheDocument();
  });

  it('a webhook comes first and is the open step; the token waits behind it', async () => {
    await draw(app({ state: 'stopped', reason: 'webhook_set' } as Partial<Channel>));
    expect(mark()).toHaveAttribute('data-verdict-mark', 'danger');
    expect(mark()).toHaveTextContent(strings['setup.mark.webhook']);
    const card = screen.getByRole('region', { name: step('setup.step.webhook') });
    expect(within(card).getByRole('button', { name: 'WEBHOOK-GO' })).toBeInTheDocument();
    expect(within(card).getByText(strings['setup.say.webhook'])).toBeInTheDocument();
    expect(screen.queryByText('TOKEN-FIELDS')).toBeNull();
    expect(screen.getByRole('list', { name: strings['setup.label'] }).querySelector('[data-step]')).toHaveAttribute('data-step', 'webhook');
  });

  it('connected without an owner: the owner mark in warn, the owner step open with the code the page passed, and Next names it', async () => {
    await draw(app(ownerless));
    expect(mark()).toHaveAttribute('data-verdict-mark', 'warn');
    expect(mark()).toHaveTextContent(strings['setup.mark.owner']);
    expect(within(verdict()).getByText(strings['setup.next'].replace('{{step}}', strings['setup.step.owner']))).toBeInTheDocument();
    const card = screen.getByRole('region', { name: step('setup.step.owner') });
    expect(within(card).getByText('OWNER-NODE')).toBeInTheDocument();
  });

  it('privacy on: the privacy mark in warn, and its restart row carries the restart button the page passed', async () => {
    await draw(app({ notes: [{ code: PRIVACY_NOTE, field: 'group_mode' }] as Channel['notes'] }));
    expect(mark()).toHaveAttribute('data-verdict-mark', 'warn');
    expect(mark()).toHaveTextContent(strings['setup.mark.privacy']);
    const card = screen.getByRole('region', { name: step('setup.step.privacy') });
    expect(within(card).getByText(strings['setup.tag.privacyOn'])).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'RESTART-GO' })).toBeInTheDocument();
  });

  it('paused: never "it answers its chats"; the paused mark in warn', async () => {
    // the same app as 'all done' below, only paused
    await draw({ ...doneAll, state: 'paused' } as Channel);
    expect(within(verdict()).queryByText(strings['setup.verdict.ok'])).toBeNull();
    expect(mark()).toHaveAttribute('data-verdict-mark', 'warn');
    expect(mark()).toHaveTextContent(strings['setup.mark.paused']);
  });

  it('a conflict is not "connecting": the sentence names the state, marked warn, and the token step cannot tell', async () => {
    await draw(app({ state: 'conflict' } as Partial<Channel>));
    expect(within(verdict()).queryByText(strings['setup.verdict.connecting'])).toBeNull();
    expect(mark()).toHaveAttribute('data-verdict-mark', 'warn');
    expect(mark()).toHaveTextContent(strings['setup.mark.down']);
    expect(verdict()).toHaveTextContent(strings['chan.state.conflict']);
    expect(screen.getByRole('list', { name: strings['setup.label'] }).querySelector('[data-step="token"]')).toHaveAttribute('data-state', 'unknown');
  });

  it('each marked sentence reads whole, its mark inside it (the sentence is built in JSX, no withParts)', async () => {
    const sentence = () => (mark() as HTMLElement).parentElement?.textContent;
    await draw(app({ state: 'auth_failed' }));
    expect(sentence()).toBe("It can't connect: the app refused its token.");
    cleanup();
    await draw(app(ownerless));
    expect(sentence()).toBe('It is connected, but it has no owner yet.');
    cleanup();
    await draw(app({ state: 'conflict' } as Partial<Channel>));
    expect(sentence()).toBe(`It may not answer right now: the app reports “${strings['chan.state.conflict']}”.`);
  });

  it('paused with only optional steps left: no "Next" points away from the pause', async () => {
    const running = app({ kind: 'slack' });
    await draw(running);
    const nextOf = (id: 'group' | 'home') => strings['setup.next'].replace('{{step}}', strings[`setup.step.${id}`]);
    const named = [nextOf('group'), nextOf('home')].filter((x) => within(verdict()).queryByText(x) !== null);
    // control: the running app names an optional step as next
    expect(named).toHaveLength(1);
    cleanup();
    await draw({ ...running, state: 'paused' } as Channel);
    expect(within(verdict()).queryByText(nextOf('group'))).toBeNull();
    expect(within(verdict()).queryByText(nextOf('home'))).toBeNull();
  });

  it('the home chat is named by its title, never by the id the setting holds', async () => {
    await draw(app({ kind: 'slack', homeChat: 'cht-9', chatRows: [{ id: 'cht-9', kind: 'group', state: 'approved', title: 'Support chat', platformChat: '-1', view: { settings: {}, effective: {} } }] as Channel['chatRows'] }));
    expect(screen.getByText('Support chat')).toBeInTheDocument();
    expect(screen.queryByText('cht-9')).toBeNull();
  });

  it('still connecting: says so with nothing marked and no Next', async () => {
    await draw(app({ state: 'starting' } as Partial<Channel>));
    expect(within(verdict()).getByText(strings['setup.verdict.connecting'])).toBeInTheDocument();
    expect(mark()).toBeNull();
    expect(within(verdict()).queryByText(/^Next:/)).toBeNull();
  });

  it('all done: it answers its chats, nothing marked, every step counted, no step opens by itself', async () => {
    await draw(doneAll);
    expect(within(verdict()).getByText(strings['setup.verdict.ok'])).toBeInTheDocument();
    expect(mark()).toBeNull();
    expect(within(verdict()).getByText(strings['setup.count'].replace('{{done}}', '4').replace('{{total}}', '4'))).toBeInTheDocument();
    expect(segments()).toEqual(['done', 'done', 'done', 'done']);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText(strings['setup.result.groups_one'].replace('{{count}}', '1'))).toBeInTheDocument();
  });

  it('optional steps left are counted apart', async () => {
    await draw(app());
    expect(within(verdict()).getByText(strings['setup.countOptional'].replace('{{done}}', '2').replace('{{total}}', '4').replace('{{optional}}', '2'))).toBeInTheDocument();
  });
});

describe('the group step follows the group setting', () => {
  it('groups off: the step says so and offers Settings, not the bind path', async () => {
    await draw(app({ view: { settings: {}, effective: { group_mode: { value: 'off', source: 'channel' } } } } as unknown as Partial<Channel>), { open: 'group' });
    const card = screen.getByRole('region', { name: step('setup.step.group') });
    expect(within(card).getByText(strings['setup.why.groupOff'])).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'SETTINGS-GO' })).toBeInTheDocument();
    expect(within(card).queryByText(/bind command/)).toBeNull();
  });
  it('any other setting: points to Chats, which has the steps for this setting, and promises no single path', async () => {
    await draw(app(), { open: 'group' });
    const card = screen.getByRole('region', { name: step('setup.step.group') });
    expect(within(card).getByText(strings['setup.why.group'])).toBeInTheDocument();
    expect(strings['setup.why.group']).not.toMatch(/bind command|you approve/);
    expect(within(card).getByRole('button', { name: 'CHATS-GO' })).toBeInTheDocument();
  });
});

describe('the Track', () => {
  it('opens the step the page names, and a press on another asks the page to open that one', async () => {
    const onOpen = vi.fn();
    await draw(app(), { open: 'home', onOpen });
    const home = screen.getByRole('region', { name: step('setup.step.home') });
    expect(within(home).getByRole('button', { name: 'CHATS-GO' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: step('setup.step.group') }));
    expect(onOpen).toHaveBeenCalledWith('group');
  });

  it('open null keeps every step closed even when one needs the person', async () => {
    await draw(app(ownerless), { open: null });
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('OWNER-NODE')).toBeNull();
  });
});
