// New chat on /ai and /ai/new, on real core (fixture transport), through the tab's routes. The screen itself sends
// nothing: a start goes only through the kit's starter (its phases are tested below with a fake starter, the engine side
// in ask/). A new chat works on this computer (the configured default agent) until the person picks an agent; the agent
// picker's lines follow each agent's effective tools; product-owned agents are never offered; the choice is remembered per
// account (never the folder); Claude Code only when ready, preselected by the realm's default; one realm only; "Work in a
// folder" opens the folder's page.
import { accountPref, answers, bootFixtureCore, chooseComputer, fixtureWorld, providers, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import { provideActiveConversations, type ShellData, type StartAt, type StartDoor, type StartOpts, type StartPhase, type StartState, type Starter, type ActiveConversationProvider } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogue7k } from '@kit/pickers/fixtures/catalogue7k';
import { MAX_TEXT } from '@ask/io';
import AiTab from '../tab';
import { routes } from '../routes';
import { newChatRules, newChatSeed, type NewChatOpts } from './fixtures';
import { PREF_KEY } from './NewChat';
import { defaultModel, parseRemembered } from './logic';
import paneStrings from '../parts/Pane.strings.en.json';
import strings from './NewChat.strings.en.json';
import aiStrings from '../strings.en.json';
import scheduleAsk from '@kit/scheduleAsk.strings.en.json';
import approvalModes from '@kit/agent/ApprovalMode.strings.en.json';
import { isOff } from '@app/testing';
import type * as AiData from '../data';
// eslint-disable-next-line no-restricted-imports -- the shell's own route-change focus, run as the shell runs it
import { focusShownTitle } from '@shell/pageHost';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const ACME = fixtureWorld.realms[1]!.id;
// The computer's realms as the AI page reads them (../data useComputer): a test may name them (null: its record proves no
// realm list, as membershipOf reads a missing or malformed realm_ids), else (undefined) the fixtures' own (atlas is in
// Personal only).
const realmsRead = vi.hoisted(() => ({ ids: undefined as string[] | null | undefined }));
vi.mock('../data', async (orig) => {
  const m = await orig<typeof AiData>();
  const useComputer: typeof m.useComputer = () => {
    const q = m.useComputer();
    const ids = realmsRead.ids;
    return ids !== undefined && q.data ? ({ ...q, data: { ...q.data, realmIds: ids } } as typeof q) : q;
  };
  return { ...m, useComputer };
});
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
let sent: FixtureRequest[] = [];
/** Every request the page made, whatever its route (recorded at the transport, rule or no rule). An agent call keeps the realm
 *  read from its URL: kit.ts sends an agent call's realm in its URL only, so a fixture request's query never carries it. */
let every: { method: string; path: string; realm?: string | null }[] = [];
const writes = () => every.filter((r) => r.method !== 'GET');
const reads = (suffix: string) => sent.filter((r) => r.method === 'GET' && r.path.endsWith(suffix));
/** The realms the agent reads of exactly `path` sent, in order. */
const realmsOf = (path: string) => every.filter((r) => r.method === 'GET' && r.path === path).map((r) => r.realm);

const shellOf = (running = true): ShellData => ({ realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running }] as ShellData['computers'] });

type OpenOpts = NewChatOpts & { realm?: string; running?: boolean; remount?: boolean; first?: FixtureRule[]; target?: null };
let shellRunning: (running: boolean) => void = () => {};
/** remount: the same page session drawn again (as after leaving New chat and coming back), no new boot. first: rules
 *  ahead of New chat's. Every request, matched or not, is recorded in `every`. */
async function open(path: string, o: OpenOpts = {}) {
  sent = [];
  every = [];
  if (!o.remount) {
    const t = bootFixtureCore({ rules: [...(o.first ?? []), ...newChatRules({ ...o, onSend: (r) => sent.push(r) })], ...(o.realm ? { realm: o.realm } : {}), ...(o.target === null ? { target: null } : {}) });
    const hoody = t.hoody.bind(t), fetchIt = t.fetch.bind(t);
    t.hoody = (method, url, body, opts, meta) => (every.push({ method: method.toUpperCase(), path: meta.path }), hoody(method, url, body, opts, meta));
    t.fetch = (url, init, meta) => (every.push({ method: (init.method ?? 'GET').toUpperCase(), path: meta.path, realm: new URL(url, 'http://fixture.invalid').searchParams.get('realm') }), fetchIt(url, init, meta));
    if (o.target !== null) act(() => chooseComputer(atlas));
  }
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [path] }) });
  const tree = (running: boolean) => (
    <ShellDataProvider value={shellOf(running)}>
      <main id="hub-main">
        <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
      </main>
    </ShellDataProvider>
  );
  let r: ReturnType<typeof render> | null = null;
  await act(async () => {
    r = render(tree(o.running ?? true));
    await router.load();
  });
  shellRunning = (running) => act(() => r!.rerender(tree(running)));
  return router;
}

const heading = () => screen.findByRole('heading', { level: 1, name: strings.title });
const optionsChip = () => screen.getByRole('button', { name: /^Options/ });
const agentChip = () => screen.getByRole('button', { name: /^Agent: / });
/** The agent chip names the agent the chat would start on. */
const agentIs = (name: string) => expect(agentChip()).toHaveAccessibleName(fill(strings['agent.chip'], { name }));
const WORK = strings['agent.general'];
const CHAT = strings['agent.chat'];
/** Options: the panel the Options chip opens. While it is open the page behind it is out of reach. */
async function openOptions() {
  await userEvent.click(optionsChip());
  return screen.findByRole('dialog', { name: strings['options.title'] });
}
async function closeOptions() {
  await userEvent.click(screen.getByRole('button', { name: strings['options.done'] }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['options.title'] })).toBeNull());
}
/** The agent picker, once the agent chip may be pressed (the computer's agent is readable). */
async function openPicker() {
  await waitFor(() => expect(isOff(agentChip())).toBe(false));
  await userEvent.click(agentChip());
  return screen.findByRole('dialog', { name: strings['pick.title'] });
}
/** An agent's row in the picker, by the agent's name on the computer. */
const pickRow = (picker: HTMLElement, name: string) => picker.querySelector(`tr[data-row-id="${name}"]`) as HTMLElement | null;
const rowOf = async (picker: HTMLElement, name: string) => waitFor(() => { const r = pickRow(picker, name); if (!r) throw new Error(`no row ${name}`); return r; });
/** A setting row's own text in Options: its name, its help and its control. */
const settingOf = (panel: HTMLElement, name: string) => within(panel).getAllByText(name)[0]!.closest('[data-sg-row]') as HTMLElement;

let width = 1300;
beforeEach(() => {
  width = 1300;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
});

afterEach(() => {
  cleanup();
  realmsRead.ids = undefined;
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('New chat: the screen', () => {
  it('/ai and /ai/new on desktop show New chat: the heading, the computer and its realm, the first-run agent and Options', async () => {
    for (const path of ['/ai', '/ai/new']) {
      const router = await open(path);
      expect(await heading()).toBeInTheDocument();
      expect(screen.getByText(fill(strings.lead, { computer: 'atlas' }))).toBeInTheDocument();
      // Where the chat will run: the realm, then the computer with its state.
      const where = screen.getByText('Personal').closest('p')!;
      expect(where).toHaveTextContent('atlas');
      expect(where).toHaveTextContent(strings['where.running']);
      // Nothing picked yet: a new chat works on this computer, and Options hold only defaults. This test runs on the starts
      // provider the app registers (the agent panel's own engine, here on the fixture agent), not a fake: a new chat there starts
      // with Allow everything switched on, so the chip and the Approvals row must say that and never that the chat asks. If the
      // engine's default for a new conversation changes, this is where the page's words are checked against it.
      await waitFor(() => agentIs(WORK));
      await waitFor(() => expect(optionsChip()).toHaveAccessibleName(new RegExp(`^${fill(strings['options.chipSummary'], { summary: approvalModes['am.state.everything'] })}$`)));
      if (path === '/ai') {
        const row = settingOf(await openOptions(), strings['approvals.legend']);
        expect(row).toHaveTextContent(fill(strings['approvals.defaultOn'], { mode: approvalModes['am.state.everything'] }));
        expect(row).not.toHaveTextContent(strings['approvals.defaultLine']);
        await closeOptions();
      }
      expect(router.state.location.pathname).toBe(path);
      cleanup();
      queryClient.clear();
    }
  });

  it('the composer wears the plate and the ways to start come right under it, in one group', async () => {
    await open('/ai/new');
    await heading();
    const box = screen.getByRole('textbox').closest('.plate');
    expect(box).not.toBeNull();
    const strip = screen.getByRole('list', { name: strings['sug.label'] });
    expect(strip.parentElement).toBe(box!.closest('.start'));
    // Work on this computer leads, Just chat is next to it.
    const cells = within(strip).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent);
    expect(cells).toEqual([strings['sug.general'], strings['sug.chat'], strings['sug.folder'], strings['sug.daily']]);
  });

  it('on a phone /ai/new is New chat and /ai is the chat list', async () => {
    width = 390;
    await open('/ai/new');
    expect(await heading()).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    await open('/ai');
    await screen.findByRole('navigation', { name: 'AI' });
    expect(screen.queryByRole('heading', { name: strings.title })).toBeNull();
  });

  it('the model chip starts on the free Hoody model, never an Anthropic one', async () => {
    await open('/ai/new');
    await heading();
    const chip = screen.getByRole('button', { name: /^Model: / });
    expect(chip.getAttribute('aria-label')).toMatch(/hoody[- ]free/i);
    expect(chip.getAttribute('aria-label')).not.toMatch(/anthropic|claude/i);
  });

  it('with no starter Send is off and says why; typing and Enter send nothing', async () => {
    await open('/ai/new');
    await heading();
    sendOff(strings['send.unavailable']);
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'Fix the build{Enter}');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(writes()).toEqual([]);
  });

  it('adding a file keeps nothing and says when files come', async () => {
    await open('/ai/new');
    await heading();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    expect(screen.getByText(strings['files.notReady'])).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /attach/i })).toBeNull();
    expect(writes()).toEqual([]);
  });
});

describe('the agent a new chat starts on', () => {
  it('with nothing picked it is the computer\'s configured default agent: General as shipped, another agent when the computer says so', async () => {
    await open('/ai/new');
    await heading();
    await waitFor(() => agentIs(WORK));
    cleanup();
    queryClient.clear();
    await open('/ai/new', { agents: newChatSeed().map((a) => (a.name === 'reviewer' ? { ...a, is_configured_default: true } : a)) });
    await heading();
    await waitFor(() => agentIs('reviewer'));
    // Nothing was picked, so nothing is remembered: the default follows the computer.
    expect(accountPref(PREF_KEY, parseRemembered).get().agent).toBeNull();
  });

  it('a default that is product-owned, or a failed agents read, leaves General', async () => {
    await open('/ai/new', { agents: newChatSeed().map((a) => (a.name === 'bot' ? { ...a, is_configured_default: true } : a)) });
    await heading();
    await waitFor(() => expect(reads('/agents').length).toBeGreaterThan(0));
    agentIs(WORK);
    cleanup();
    queryClient.clear();
    await open('/ai/new', { agentsFail: true });
    await heading();
    await screen.findByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }));
    agentIs(WORK);
  });

  it('Send waits for the agents read while the default is not known yet, then starts on it', async () => {
    const f = fakeStarter();
    let answer: () => void = () => undefined;
    const held = new Promise<void>((res) => { answer = res; });
    const seed = newChatSeed().map((a) => (a.name === 'reviewer' ? { ...a, is_configured_default: true } : a));
    await open('/ai/new', { first: [reply(routes.agents, async () => { await held; return answers.ok({ items: seed }); })] });
    await heading();
    await userEvent.type(screen.getByRole('textbox'), 'Fix the build');
    sendOff(strings['send.agentLoading']);
    await userEvent.click(sendButton());
    expect(f.log.starts).toEqual([]);
    await act(async () => { answer(); });
    await waitFor(() => agentIs('reviewer'));
    await userEvent.click(sendButton());
    expect(f.log.starts.map((x) => x.opts.agent)).toEqual(['reviewer']);
  });

  it('a Just chat kept from before picks were marked is not kept: General once, said in a band whose Just chat is a pick and whose OK ends it', async () => {
    await open('/ai/new');
    await heading();
    const old = { agent: { kind: 'chat' }, approvals: 'strict', runsWith: 'hoody' };
    await waitFor(() => expect(accountPref<unknown>(PREF_KEY, (raw) => raw).set(old)).toBe(true));
    cleanup();
    await open('/ai/new', { remount: true });
    await heading();
    expect(await screen.findByText(strings['band.chatDropped'])).toBeInTheDocument();
    await waitFor(() => agentIs(WORK));
    // Approvals carried over.
    expect(optionsChip()).toHaveAccessibleName(new RegExp(strings['summary.strict']));
    await userEvent.click(screen.getByRole('button', { name: strings['band.chatDroppedOk'] }));
    expect(screen.queryByText(strings['band.chatDropped'])).toBeNull();
    agentIs(WORK);
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'hoody' }));
    // The same value again, answered with Just chat: that is a pick, and it is remembered.
    expect(accountPref<unknown>(PREF_KEY, (raw) => raw).set(old)).toBe(true);
    cleanup();
    await open('/ai/new', { remount: true });
    await heading();
    await userEvent.click(await screen.findByRole('button', { name: strings['band.chatDroppedPick'] }));
    expect(screen.queryByText(strings['band.chatDropped'])).toBeNull();
    agentIs(CHAT);
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: { kind: 'chat' }, approvals: 'strict', runsWith: 'hoody' }));
    cleanup();
    await open('/ai/new', { remount: true });
    await heading();
    await waitFor(() => agentIs(CHAT));
    expect(screen.queryByText(strings['band.chatDropped'])).toBeNull();
  });
});

describe('the agent picker', () => {
  it('lists the agents a chat can start on, in groups, never Hoody\'s own; each row says what it can do on this computer', async () => {
    await open('/ai/new');
    await heading();
    const picker = await openPicker();
    const general = await rowOf(picker, 'general');
    const chat = await rowOf(picker, 'chat');
    for (const name of ['reviewer', 'mine']) expect(pickRow(picker, name)).not.toBeNull();
    for (const never of ['bot', 'script-writer']) expect(pickRow(picker, never)).toBeNull();
    expect(general).toHaveTextContent(WORK);
    expect(chat).toHaveTextContent(CHAT);
    await waitFor(() => expect(chat).toHaveTextContent(strings['pick.reach.none']));
    expect(general).toHaveTextContent(strings['pick.reach.acts']);
    expect(pickRow(picker, 'reviewer')).toHaveTextContent(strings['pick.reach.read']);
    expect(pickRow(picker, 'mine')).toHaveTextContent(strings['pick.reach.acts']);
    expect(chat).not.toHaveTextContent(strings['pick.changed']);
    // The agent the chat would start on is marked; the two usual ways lead, then where an agent comes from.
    expect(general).toHaveTextContent(strings['pick.current']);
    expect(chat).not.toHaveTextContent(strings['pick.current']);
    expect([...picker.querySelectorAll('tr[data-row-id]')].map((r) => r.getAttribute('data-row-id'))).toEqual(['general', 'chat', 'reviewer', 'mine']);
    const table = within(picker).getByRole('table', { name: strings['pick.table'] });
    for (const g of ['start', 'builtin', 'yours'] as const) expect(within(table).getByText(strings[`pick.g.${g}`])).toBeInTheDocument();
    expect(within(table).queryByText(strings['pick.g.folder'])).toBeNull();
    expect(within(picker).getByRole('link', { name: strings['pick.manage'] })).toHaveAttribute('href', '/ai/agents');
    expect(writes()).toEqual([]);
  });

  it('a press on a row picks that agent, closes the picker back to the agent chip, and is remembered', async () => {
    await open('/ai/new');
    await heading();
    const picker = await openPicker();
    await userEvent.click(await rowOf(picker, 'reviewer'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['pick.title'] })).toBeNull());
    agentIs('reviewer');
    await waitFor(() => expect(agentChip()).toHaveFocus());
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' }));
    // Reopened: the pick is the marked row. Just chat is one press from here.
    const again = await openPicker();
    expect(await rowOf(again, 'reviewer')).toHaveTextContent(strings['pick.current']);
    await userEvent.click(await rowOf(again, 'chat'));
    await waitFor(() => agentIs(CHAT));
    expect(writes()).toEqual([]);
  });

  it('search covers the name and the description; the filter narrows by what an agent can do, or to the person\'s own', async () => {
    await open('/ai/new', { agents: [...newChatSeed(), { name: 'docs', provenance: 'user', description: 'Writes the handbook', strict_tools: true, tools: ['read_file'] }] });
    await heading();
    const picker = await openPicker();
    await rowOf(picker, 'docs');
    const search = within(picker).getByRole('searchbox');
    await userEvent.type(search, 'handbook');
    await waitFor(() => expect(pickRow(picker, 'mine')).toBeNull());
    expect(pickRow(picker, 'docs')).not.toBeNull();
    await userEvent.clear(search);
    await rowOf(picker, 'mine');
    await userEvent.click(within(picker).getByRole('radio', { name: strings['pick.reach.read'] }));
    await waitFor(() => expect(pickRow(picker, 'general')).toBeNull());
    expect([...picker.querySelectorAll('tr[data-row-id]')].map((r) => r.getAttribute('data-row-id')).sort()).toEqual(['docs', 'reviewer']);
    await userEvent.click(within(picker).getByRole('radio', { name: strings['pick.yours'] }));
    await waitFor(() => expect(pickRow(picker, 'reviewer')).toBeNull());
    expect([...picker.querySelectorAll('tr[data-row-id]')].map((r) => r.getAttribute('data-row-id')).sort()).toEqual(['docs', 'mine']);
  });

  it('a chat someone gave a tool says what it can now do, and that it was changed', async () => {
    await open('/ai/new', { agents: [{ name: 'chat', provenance: 'user', strict_tools: true, tools: ['bash'] }, { name: 'general', provenance: 'shipped default (embedded)' }] });
    await heading();
    const picker = await openPicker();
    const chat = await rowOf(picker, 'chat');
    await waitFor(() => expect(chat).toHaveTextContent(strings['pick.reach.acts']));
    expect(chat).toHaveTextContent(strings['pick.changed']);
    expect(chat).not.toHaveTextContent(strings['pick.reach.none']);
  });
});

describe('Options', () => {
  it('approvals and runs with are remembered per account; the folder is not; no agent is stored by them', async () => {
    await open('/ai/new');
    let panel = await openOptions();
    await userEvent.click(within(panel).getByRole('radio', { name: strings['approvals.strict'] }));
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: strings['summary.strict'] }));
    queryClient.clear();
    cleanup();
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'hoody' }));
    await open('/ai/new', { remount: true });
    await heading();
    // The saved choices open in the background (encrypted per account), then show.
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: strings['summary.strict'] })));
    panel = await openOptions();
    expect(within(panel).getByRole('radio', { name: strings['approvals.strict'] })).toBeChecked();
    expect(writes()).toEqual([]);
  });

  it('each approvals choice says what it does on its row; what never asks under Strict sits in a closed Why whose link opens the full question in place', async () => {
    await open('/ai/new');
    const panel = await openOptions();
    // No starter here says what a start does: the row promises nothing yet (the approvals tests below pin each answer).
    expect(settingOf(panel, strings['approvals.legend'])).toHaveTextContent(fill(strings['approvals.defaultUnknown'], { computer: 'atlas' }));
    expect(settingOf(panel, strings['approvals.legend'])).not.toHaveTextContent(strings['approvals.defaultLine']);
    await userEvent.click(within(panel).getByRole('radio', { name: strings['approvals.strict'] }));
    const row = settingOf(panel, strings['approvals.legend']);
    expect(row).toHaveTextContent(strings['approvals.strictShort']);
    expect(row).not.toHaveTextContent('hook tests');
    // The sentence names only what asks, never a class ("actions with effects") that memory saves and TODO edits belong
    // to, which do not ask.
    expect(strings['approvals.strictShort']).toBe('Asks before commands, file changes, changing web requests, computer actions, images and notifications; helpers, your hooks and MCP servers stay off.');
    expect(row).not.toHaveTextContent(/effects/);
    expect(within(panel).getByText(strings['approvals.why.a'], { exact: false })).not.toBeVisible();
    await userEvent.click(within(panel).getByRole('button', { name: strings['approvals.why.q'] }));
    expect(within(panel).getByText(strings['approvals.why.a'], { exact: false })).toBeVisible();
    await userEvent.click(within(panel).getByRole('link', { name: strings['approvals.why.more'] }));
    expect(await screen.findByText(aiStrings['faq.strictApprovals.a'])).toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it('a typed folder must be absolute; a valid one shows in the summary', async () => {
    await open('/ai/new');
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    const path = await within(panel).findByRole('combobox', { name: strings['folder.path'] });
    await userEvent.type(path, 'srv/shop{Escape}');
    expect(within(panel).getByText(strings['folder.pathBad'])).toBeInTheDocument();
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(new RegExp(`^${strings['options.chip']}$`));
    // The bad path is never taken (no older folder stands in for it): reopened, the path is still asked for.
    const reopened = await openOptions();
    expect(within(reopened).getByRole('button', { name: new RegExp(strings['folder.legend']) })).toHaveTextContent(strings['folder.another']);
    const again = within(reopened).getByRole('combobox', { name: strings['folder.path'] });
    expect(again).toHaveValue('');
    await userEvent.clear(again);
    await userEvent.type(again, '/srv/shop{Escape}');
    expect(within(reopened).queryByText(strings['folder.pathBad'])).toBeNull();
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: 'shop' }));
  });

  it('Claude Code is offered only when ready; otherwise it says so and links its setup', async () => {
    await open('/ai/new', { claude: { logged_in: 'logged_out' } });
    const panel = await openOptions();
    const cc = within(panel).getByRole('radio', { name: strings['runs.claude'] });
    await waitFor(() => expect(within(panel).getByText(fill(strings['runs.claudeNotReady'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument());
    expect(isOff(cc)).toBe(true);
    expect(within(panel).getByRole('link', { name: strings['runs.claudeSetup'] })).toHaveAttribute('href', '/ai/models?section=claude');
  });

  it('a realm whose default is Claude Code preselects it while nothing is remembered; a remembered pick wins', async () => {
    await open('/ai/new', { claude: {}, acpDefault: 'claude' });
    await heading();
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: strings['summary.claude'] })));
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('radio', { name: strings['runs.hoody'] }));
    cleanup();
    await open('/ai/new', { claude: {}, acpDefault: 'claude', remount: true });
    await heading();
    await waitFor(() => expect(reads('/acp/default').length).toBeGreaterThan(0));
    expect(optionsChip()).toHaveAccessibleName(new RegExp(`^${strings['options.chip']}$`));
  });
});


describe('ways to start', () => {
  it('Just chat and Work on this computer pick the agent and put the cursor in the composer; each is remembered as a pick', async () => {
    await open('/ai/new');
    await heading();
    await waitFor(() => agentIs(WORK));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.chat']}`) }));
    agentIs(CHAT);
    expect(screen.getByRole('textbox')).toHaveFocus();
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get().agent).toEqual({ kind: 'chat' }));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.general']}`) }));
    agentIs(WORK);
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get().agent).toEqual({ kind: 'general' }));
  });

  it('Work in a folder: pick a folder, then its page opens (computer handle and realm in the link)', async () => {
    const router = await open('/ai/new');
    await heading();
    await waitFor(() => expect(reads('/sessions/cwds').length).toBeGreaterThan(0));
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
    const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
    const go = within(dlg).getByRole('button', { name: strings['pickFolder.open'] });
    expect(isOff(go)).toBe(true);
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await userEvent.type(within(dlg).getByRole('combobox', { name: strings['folder.path'] }), '/srv/shop{Escape}');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['pickFolder.open'] }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/ai\/f\//));
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
    expect(writes()).toEqual([]);
  });

  // The ask starts here, never on Schedules.
  it('Do it every day asks the agent here: the shared schedule prompt goes in the composer after any words, once; the page stays', async () => {
    const router = await open('/ai/new');
    await heading();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.chat']}`) }));
    agentIs(CHAT);
    const card = screen.getByText(strings['sug.daily']).closest('li')!;
    // The example is the one Schedules' agent step shows: one shared table.
    expect(card).toHaveTextContent(`${scheduleAsk.prompt}${scheduleAsk['ex.backups']}`);
    expect(within(card).getByRole('link', { name: strings['sug.todos'] })).toHaveAttribute('href', '/ai/auto/todos?new=1');
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /loop|schedules/i })).toBeNull();
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(scheduleAsk.prompt);
    await waitFor(() => expect(box).toHaveFocus());
    expect(box.selectionStart).toBe(scheduleAsk.prompt.length);
    // Just chat could set nothing: the ask goes to the General agent.
    agentIs(WORK);
    await userEvent.clear(box);
    await userEvent.type(box, 'check the backups  ');
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(`check the backups\n\n${scheduleAsk.prompt}`);
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(`check the backups\n\n${scheduleAsk.prompt}`);
    // A last paragraph that is just the prompt's word gets the prompt back whole (its space: typing follows it), once.
    await userEvent.clear(box);
    await userEvent.paste(`check the backups\n\n${scheduleAsk.prompt.trim()}`);
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(`check the backups\n\n${scheduleAsk.prompt}`);
    await userEvent.clear(box);
    await userEvent.paste(scheduleAsk.prompt.trim());
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(scheduleAsk.prompt);
    // Words of the person's own that end in the same word stay theirs: the prompt follows them, once.
    await userEvent.clear(box);
    await userEvent.type(box, `move the ${scheduleAsk.prompt.trim()}`);
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(`move the ${scheduleAsk.prompt.trim()}\n\n${scheduleAsk.prompt}`);
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(box).toHaveValue(`move the ${scheduleAsk.prompt.trim()}\n\n${scheduleAsk.prompt}`);
    expect(router.state.location.pathname).toBe('/ai/new');
    expect(writes()).toEqual([]);
  });

  it('Do it every day keeps an agent the person picked that is not Just chat', async () => {
    await open('/ai/new');
    await heading();
    const picker = await openPicker();
    await userEvent.click(await rowOf(picker, 'mine'));
    await waitFor(() => agentIs('mine'));
    const card = screen.getByText(strings['sug.daily']).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    expect(screen.getByRole('textbox')).toHaveValue(scheduleAsk.prompt);
    agentIs('mine');
  });
});

describe('states', () => {
  it('All realms, a computer in several realms: pick one realm first; the agent is not read', async () => {
    realmsRead.ids = [PERSONAL, ACME];
    await open('/ai/new', { realm: 'all' });
    await heading();
    expect(await screen.findByText(strings['band.pickRealm'], {}, { timeout: 5000 })).toBeInTheDocument();
    expect(reads('/agents')).toEqual([]);
    expect(reads('/acp/agents')).toEqual([]);
  });

  it('a stopped computer says so and links it; nothing asks its agent', async () => {
    const router = await open('/ai/new', { running: false });
    await heading();
    expect(screen.getByText(fill(strings['band.stopped'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(reads('/agents')).toEqual([]);
    expect(isOff(screen.getByRole('button', { name: /^Model: / }))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: fill(strings['band.openComputer'], { computer: 'atlas' }) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(router.state.location.search).toMatchObject({ sel: HANDLE });
  });

  it('the agent cannot be read: an error with Try again, never an empty agent list', async () => {
    await open('/ai/new', { agentsFail: true });
    await heading();
    expect(await screen.findByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

/** The real catalogue (7k models): OpenAI, Hoody and one more ready; Anthropic needs its key. */
function catalogueRules(): FixtureRule[] {
  const r = catalogue7k('threeReady');
  const pid = (req: FixtureRequest) => req.path.split('/')[2] ?? '';
  return [
    reply(providers.providerRoutes.providers, r.providers),
    reply(providers.providerRoutes.models, (req) => (req.query.ready === 'true' ? r.ready : r.models)),
    reply(providers.providerRoutes.auth, (req) => r.auth(pid(req))),
  ];
}

describe('reads, drawers and what is remembered', () => {
  it('the model drawer is read-only: a model that needs setup leaves for Models and nothing is written', async () => {
    const router = await open('/ai/new', { first: catalogueRules() });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: /^Model: / }));
    const drawer = await screen.findByRole('dialog', { name: strings['model.title'] });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Anthropic' }));
    await userEvent.click((await within(drawer).findAllByRole('option', { name: /^Claude Fable 5\b/ }))[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/models'));
    expect(router.state.location.search).toMatchObject({ connect: 'anthropic' });
    // No key field, no sign-in: the step that writes is Models', not this drawer's.
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(writes()).toEqual([]);
    expect(every.length).toBeGreaterThan(0);
  });

  it('no write is reachable from anything on the screen', async () => {
    await open('/ai/new', { first: catalogueRules(), claude: {} });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: /^Model: / }));
    const drawer = await screen.findByRole('dialog', { name: strings['model.title'] });
    for (const b of within(drawer).getAllByRole('button')) if (!b.closest('[aria-disabled="true"]') && !/close|done/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) await userEvent.click(b).catch(() => undefined);
    expect(writes()).toEqual([]);
  });

  it('the suggestions promise no tools or reach the agent may not have', async () => {
    await open('/ai/new', { agents: [{ name: 'chat', provenance: 'user', tools: ['bash'] }, { name: 'general', provenance: 'user', strict_tools: true, tools: [] }] });
    await heading();
    const list = screen.getByRole('list', { name: strings['sug.label'] });
    expect(list.textContent).toContain(strings['sug.chatLine']);
    expect(list.textContent).toContain(fill(strings['sug.generalLine'], { computer: 'atlas' }));
    expect(list.textContent).not.toMatch(/no tools|can edit|full access|run commands|fix code|set things up/i);
  });

  it('a remembered agent that is not offered (product-owned or gone) falls back to the computer\'s default agent and says so; an offered one stays', async () => {
    const agents = [...newChatSeed(), { name: 'owned', provenance: 'product-owned (read-only)', tools: ['bash'] }];
    await open('/ai/new', { agents });
    await heading();
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).set({ v: 2, agent: { kind: 'other', name: 'owned' }, approvals: 'default', runsWith: 'hoody' })).toBe(true));
    cleanup();
    await open('/ai/new', { agents, remount: true });
    await heading();
    await waitFor(() => expect(screen.getByText(fill(strings['agent.notOffered'], { name: 'owned', computer: 'atlas' }))).toBeInTheDocument());
    agentIs(WORK);
    expect(accountPref(PREF_KEY, parseRemembered).set({ v: 2, agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' })).toBe(true);
    cleanup();
    await open('/ai/new', { remount: true });
    await heading();
    await waitFor(() => agentIs('reviewer'));
    expect(screen.queryByText(/is not offered on/)).toBeNull();
    // An agent the computer no longer lists at all.
    expect(accountPref(PREF_KEY, parseRemembered).set({ v: 2, agent: { kind: 'other', name: 'gone' }, approvals: 'default', runsWith: 'hoody' })).toBe(true);
    cleanup();
    await open('/ai/new', { agents, remount: true });
    await heading();
    await waitFor(() => expect(screen.getByText(fill(strings['agent.notOffered'], { name: 'gone', computer: 'atlas' }))).toBeInTheDocument());
    agentIs(WORK);
  });

  it('a computer that stops after a failed read offers no Try again and asks its agent nothing more', async () => {
    await open('/ai/new', { agentsFail: true });
    await heading();
    await screen.findByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }));
    shellRunning(false);
    await screen.findByText(fill(strings['band.stopped'], { computer: 'atlas' }));
    const asked = reads('/agents').length;
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    // Its agents cannot be read any more: the agent picker is not offered.
    expect(isOff(agentChip())).toBe(true);
    expect(reads('/agents').length).toBe(asked);
  });

  it('an agent list the Hub cannot read is an error band with Try again, never an empty list', async () => {
    await open('/ai/new', { agentsBody: { nope: true } });
    await heading();
    expect(await screen.findByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByText(fill(strings['band.agentsMalformed'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('the model drawer\'s Try again shows pending on its button while its read runs', async () => {
    let answer: () => void = () => undefined;
    let held = false;
    const first = [reply(providers.providerRoutes.providers, () =>
      held ? new Promise((res) => { answer = () => res(answers.refused(500, 'internal_error')); }) : answers.refused(500, 'internal_error'))];
    await open('/ai/new', { first });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: /^Model: / }));
    const drawer = await screen.findByRole('group', { name: strings['model.label'] });
    const tryAgain = await within(drawer).findByRole('button', { name: /Try again/ });
    expect(tryAgain).not.toHaveAttribute('data-pending');
    held = true;
    await userEvent.click(tryAgain);
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /Try again/ })).toHaveAttribute('data-pending'));
    // The drawer's browser goes away on close and the hook stays: reopened, the same read is still pending.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: strings['model.label'] })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /^Model: / }));
    const again = await screen.findByRole('group', { name: strings['model.label'] });
    expect(await within(again).findByRole('button', { name: /Try again/ })).toHaveAttribute('data-pending');
    held = false;
    await act(async () => { answer(); });
    await waitFor(() => expect(within(again).getByRole('button', { name: /Try again/ })).not.toHaveAttribute('data-pending'));
  });

  it('a failed tool catalogue reads again on Try again and what each agent can do comes back', async () => {
    const toolsDown = { on: true };
    await open('/ai/new', { toolsDown });
    await heading();
    const picker = await openPicker();
    const chat = await rowOf(picker, 'chat');
    await waitFor(() => expect(chat).toHaveTextContent(strings['pick.reach.unread']));
    expect(within(picker).getByText(strings['agent.unread'])).toBeInTheDocument();
    const before = reads('/tools').length;
    toolsDown.on = false;
    await userEvent.click(within(picker).getByRole('button', { name: strings['agent.retry'] }));
    await waitFor(() => expect(pickRow(picker, 'chat')).toHaveTextContent(strings['pick.reach.none']));
    expect(reads('/tools').length).toBeGreaterThan(before);
    expect(within(picker).queryByText(strings['agent.unread'])).toBeNull();
  });

  it('a catalogue the Hub cannot read guesses nothing about any agent and offers Try again', async () => {
    await open('/ai/new', { toolsBody: { nope: true } });
    await heading();
    const picker = await openPicker();
    const chat = await rowOf(picker, 'chat');
    await waitFor(() => expect(chat).toHaveTextContent(strings['pick.reach.unread']));
    expect(chat).not.toHaveTextContent(strings['pick.reach.none']);
    expect(within(picker).getByRole('button', { name: strings['agent.retry'] })).toBeInTheDocument();
  });

  it('a typed folder that turns invalid or empty disables Open again', async () => {
    await open('/ai/new');
    await heading();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
    const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    const box = within(dlg).getByRole('combobox', { name: strings['folder.path'] });
    const go = within(dlg).getByRole('button', { name: strings['pickFolder.open'] });
    await userEvent.type(box, '/srv/shop{Escape}');
    expect(isOff(go)).toBe(false);
    await userEvent.clear(box);
    await userEvent.type(box, 'srv{Escape}');
    expect(isOff(go)).toBe(true);
    await userEvent.clear(box);
    await userEvent.type(box, '/srv{Escape}');
    expect(isOff(go)).toBe(false);
    await userEvent.clear(box);
    expect(isOff(go)).toBe(true);
  });

  it('folder history that cannot be read says so with Try again, never "no folders yet"', async () => {
    const cwdsDown = { on: true };
    await open('/ai/new', { cwdsDown });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
    const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
    expect(await within(dlg).findByText(new RegExp(strings['folder.failed'].slice(0, 30)))).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['pickFolder.none'])).toBeNull();
    const before = reads('/sessions/cwds').length;
    cwdsDown.on = false;
    await userEvent.click(within(dlg).getByRole('button', { name: strings['folder.retry'] }));
    await waitFor(() => expect(reads('/sessions/cwds').length).toBeGreaterThan(before));
    await waitFor(() => expect(within(dlg).queryByText(new RegExp(strings['folder.failed'].slice(0, 30)))).toBeNull());
  });

  it('no Hoody model ready: the band shows for Hoody models, never while Claude Code runs the chat', async () => {
    const noneReady = () => {
      const r = catalogue7k('threeReady');
      return [
        reply(providers.providerRoutes.providers, r.providers),
        reply(providers.providerRoutes.models, (req) => (req.query.ready === 'true' ? { status: 200, body: { models: [], status: 'ok' } } : r.models)),
        reply(providers.providerRoutes.auth, () => ({ status: 200, body: { auth: { ready: false, api_key_stored: false, no_auth_ready: false } } })),
      ];
    };
    await open('/ai/new', { first: noneReady() });
    await heading();
    expect(await screen.findByText(strings['band.noModel'], { exact: false })).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    await open('/ai/new', { claude: {}, acpDefault: 'claude', first: noneReady() });
    await heading();
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(new RegExp(strings['summary.claude'])));
    await waitFor(() => expect(reads('/models').length + every.filter((r) => r.path.endsWith('/models')).length).toBeGreaterThan(0));
    expect(screen.queryByText(strings['band.noModel'], { exact: false })).toBeNull();
  });

  it('Claude Code that cannot be checked says so with Check again, never "not ready"', async () => {
    await open('/ai/new', { acpFails: true });
    const panel = await openOptions();
    await waitFor(() => expect(within(panel).getByText(new RegExp(fill(strings['runs.claudeUnknown'], { computer: 'atlas' })))).toBeInTheDocument());
    expect(within(panel).queryByText(fill(strings['runs.claudeNotReady'], { computer: 'atlas' }), { exact: false })).toBeNull();
    expect(within(panel).getByRole('button', { name: strings['runs.claudeRetry'] })).toBeInTheDocument();
  });

  it('while Claude Code is being checked it says so', async () => {
    await open('/ai/new', { first: [reply(routes.acp, () => new Promise(() => undefined))] });
    const panel = await openOptions();
    expect(within(panel).getByText(fill(strings['runs.claudeChecking'], { computer: 'atlas' }), { exact: false })).toBeInTheDocument();
    expect(within(panel).queryByText(fill(strings['runs.claudeNotReady'], { computer: 'atlas' }), { exact: false })).toBeNull();
  });

  it('with no computer the page still has its one heading, and asks for a computer', async () => {
    await open('/ai/new', { target: null });
    const h = await heading();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(h).toHaveAttribute('data-hub-title');
    expect(h).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText(paneStrings['noComputer.title'])).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('All realms, a computer in several realms, reads nothing the chat would run with', async () => {
    realmsRead.ids = [PERSONAL, ACME];
    await open('/ai/new', { realm: 'all' });
    await heading();
    await screen.findByText(strings['band.pickRealm'], {}, { timeout: 5000 });
    for (const path of ['/agents', '/tools', '/acp/agents', '/acp/default', '/sessions/cwds']) expect(reads(path)).toEqual([]);
  });

  it('a folder picked in Options is not remembered', async () => {
    await open('/ai/new');
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await userEvent.type(await within(panel).findByRole('combobox', { name: strings['folder.path'] }), '/srv/shop{Escape}');
    await userEvent.click(within(panel).getByRole('radio', { name: strings['approvals.strict'] }));
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(new RegExp(`${strings['summary.strict']} · shop`));
    cleanup();
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: null, approvals: 'strict', runsWith: 'hoody' }));
    await open('/ai/new', { remount: true });
    await heading();
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: strings['summary.strict'] })));
    expect(optionsChip()).not.toHaveTextContent('shop');
  });
});

const cwdsAsked = () => every.filter((r) => r.path.endsWith('/sessions/cwds')).length;
const claudeLines = (panel: HTMLElement) => ({
  unknown: within(panel).queryByText(new RegExp(fill(strings['runs.claudeUnknown'], { computer: 'atlas' }))),
  notReady: within(panel).queryByText(fill(strings['runs.claudeNotReady'], { computer: 'atlas' }), { exact: false }),
  setup: within(panel).queryByRole('link', { name: strings['runs.claudeSetup'] }),
  again: within(panel).queryByRole('button', { name: strings['runs.claudeRetry'] }),
});

describe('every read: unreadable is unknown, an empty answer is empty', () => {
  // On a phone /ai/new is New chat alone: the chat list beside it (which reads the folders for its own groups) is not drawn.
  it('folder history: nothing is asked on a stopped computer', async () => {
    width = 390;
    await open('/ai/new', { running: false });
    await heading();
    await openOptions();
    // New chat's own folder read (source 'ai-new') never starts; the transport saw only the chat list's own read.
    const mine = queryClient.getQueryCache().findAll().filter((q) => /ai-new/.test(JSON.stringify(q.queryKey)) && /cwds/.test(JSON.stringify(q.queryKey)));
    expect(mine.every((q) => q.state.dataUpdateCount === 0 && q.state.errorUpdateCount === 0 && q.state.fetchStatus === 'idle')).toBe(true);
    expect(cwdsAsked()).toBeLessThanOrEqual(1);
    expect(screen.queryByText(strings['folder.loading'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['folder.retry'] })).toBeNull();
  });

  it('folder history: failed, then the computer stops: no Try again, nothing more asked', async () => {
    width = 390;
    await open('/ai/new', { cwdsDown: { on: true } });
    const panel = await openOptions();
    await within(panel).findByText(new RegExp(strings['folder.failed'].slice(0, 30)));
    // Counted before the stop: the transition itself, and the stopped folder picker after it, ask nothing.
    const asked = cwdsAsked();
    shellRunning(false);
    await screen.findByText(fill(strings['band.stopped'], { computer: 'atlas' }));
    expect(screen.queryByRole('button', { name: strings['folder.retry'] })).toBeNull();
    await act(async () => { await new Promise((x) => setTimeout(x, 100)); });
    await closeOptions();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
    const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
    expect(within(dlg).queryByRole('button', { name: strings['folder.retry'] })).toBeNull();
    expect(within(dlg).queryByText(strings['pickFolder.none'])).toBeNull();
    expect(cwdsAsked()).toBe(asked);
  });

  for (const [what, body] of [['an answer that is not a list', { nope: true }], ['an entry that is not a folder', { cwds: ['/home/ada', 42] }], ['a relative path', { cwds: ['srv/shop'] }]] as const) {
    it(`folder history: ${what} is unreadable (Try again), never "No folders yet"`, async () => {
      await open('/ai/new', { cwdsBody: body });
      await heading();
      await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
      const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
      expect(await within(dlg).findByText(new RegExp(strings['folder.failed'].slice(0, 30)))).toBeInTheDocument();
      expect(within(dlg).getByRole('button', { name: strings['folder.retry'] })).toBeInTheDocument();
      expect(within(dlg).queryByText(strings['pickFolder.none'])).toBeNull();
    });
  }

  it('folder history: an empty list is "No folders yet"', async () => {
    await open('/ai/new', { cwdsBody: { cwds: [] } });
    await heading();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['sug.folder']) }));
    const dlg = await screen.findByRole('dialog', { name: strings['pickFolder.title'] });
    expect(await within(dlg).findByText(strings['pickFolder.none'])).toBeInTheDocument();
    expect(within(dlg).queryByText(new RegExp(strings['folder.failed'].slice(0, 30)))).toBeNull();
  });

  // Parse at the boundary: real agent status shapes (omitempty fields
  // absent), then one malformed row per field the classifier reads, then rows that contradict themselves.
  const ok = (row: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ status: 'ok', report: { agents: [{ name: 'codex', installed: false, logged_in: 'unknown', startable: false }, row], ...extra } });
  const real = { name: 'claude', installed: true, enabled: true, startable: true, logged_in: 'logged_in', source: 'credentials file', version: '2.1.308', auto_approving: true, install_hint: 'sudo npm install -g @anthropic-ai/claude-code', login_hint: 'claude auth login', setup_user: 'ada', model: 'sonnet', env_display: ['ANTHROPIC_API_KEY=••••'] };
  const radio = (panel: HTMLElement) => within(panel).getByRole('radio', { name: strings['runs.claude'] });
  for (const [what, body, view] of [
    ['signed in, enabled, startable (every optional field the agent sends)', ok({ ...real, login_verified: true, install_state: 'ok', missing_launcher: false }), 'ready'],
    ['signed in, with the optional fields omitted', ok({ name: 'claude', installed: true, enabled: true, startable: true, logged_in: 'logged_in' }), 'ready'],
    ['installed and signed in but not enabled (enabled omitted)', ok({ ...real, enabled: undefined }), 'notReady'],
    ['not installed', ok({ name: 'claude', installed: false, logged_in: 'unknown', startable: false, install_hint: real.install_hint }), 'notReady'],
    ['its launcher missing', ok({ name: 'claude', installed: false, missing_launcher: true, logged_in: 'unknown', startable: false }), 'notReady'],
    ['signed out', ok({ ...real, logged_in: 'logged_out' }), 'notReady'],
    ['a sign-in the agent could not tell', ok({ ...real, logged_in: 'unknown' }), 'unknown'],
  ] as const) {
    it(`Claude Code, real answer: ${what} reads ${view}`, async () => {
      await open('/ai/new', { acpBody: body });
      const panel = await openOptions();
      if (view === 'ready') {
        await waitFor(() => expect(isOff(radio(panel))).toBe(false));
        expect(claudeLines(panel).unknown).toBeNull();
        expect(claudeLines(panel).notReady).toBeNull();
      } else if (view === 'notReady') {
        await waitFor(() => expect(claudeLines(panel).notReady).not.toBeNull());
        expect(claudeLines(panel).unknown).toBeNull();
        expect(isOff(radio(panel))).toBe(true);
      } else {
        await waitFor(() => expect(claudeLines(panel).unknown).not.toBeNull());
        expect(claudeLines(panel).setup).toBeNull();
        expect(isOff(radio(panel))).toBe(true);
      }
    });
  }

  for (const [what, body] of [
    ['an answer without the agent report', { nope: true }],
    ['a row without a name', { status: 'ok', report: { agents: [{ installed: true }] } }],
    // One malformed row per field the classifier reads.
    ['installed missing', ok({ ...real, installed: undefined })],
    ['installed not a yes/no', ok({ ...real, installed: 'true' })],
    ['startable missing', ok({ ...real, startable: undefined })],
    ['startable not a yes/no', ok({ ...real, startable: 1 })],
    ['enabled not a yes/no', ok({ ...real, enabled: 'yes' })],
    ['the sign-in state missing', ok({ ...real, logged_in: undefined })],
    ['the sign-in state not one the agent sends', ok({ ...real, logged_in: 'yes' })],
    ['the launcher field not a yes/no', ok({ ...real, installed: false, missing_launcher: 'unreadable' })],
    ['the verified sign-in not a yes/no', ok({ ...real, login_verified: 'yes' })],
    ['the install state not text', ok({ ...real, install_state: 3 })],
    ['the install state not one the agent sends', ok({ ...real, install_state: 'ready' })],
    ['the setup user not text', ok({ ...real, setup_user: 7 })],
    ['the install hint not text', ok({ ...real, install_hint: true })],
    ['the sign-in hint not text', ok({ ...real, login_hint: [] })],
    // Contradictions.
    ['a second list holding Claude Code beside an empty one', { status: 'ok', report: { agents: [], items: [real] } }],
    ['a ready row beside an empty second list', ok(real, { items: [] })],
    ['two Claude Code rows', { status: 'ok', report: { agents: [real, { ...real, installed: false }] } }],
    ['a missing launcher on an installed agent', ok({ ...real, missing_launcher: true })],
    ['a verified sign-in that is signed out', ok({ ...real, logged_in: 'logged_out', login_verified: true })],
  ] as const) {
    it(`Claude Code: ${what} is unknown with Check again, never setup advice`, async () => {
      await open('/ai/new', { acpBody: body });
      const panel = await openOptions();
      await waitFor(() => expect(claudeLines(panel).unknown).not.toBeNull());
      expect(claudeLines(panel).notReady).toBeNull();
      expect(claudeLines(panel).setup).toBeNull();
      expect(claudeLines(panel).again).not.toBeNull();
      expect(isOff(radio(panel))).toBe(true);
    });
  }

  it('Claude Code: an agent list without Claude Code says it is not ready, with its setup', async () => {
    await open('/ai/new', { acpBody: { status: 'ok', report: { agents: [] } } });
    const panel = await openOptions();
    await waitFor(() => expect(claudeLines(panel).notReady).not.toBeNull());
    expect(claudeLines(panel).setup).not.toBeNull();
    expect(claudeLines(panel).unknown).toBeNull();
  });

  it('agents: an entry the Hub cannot read is the error band with Try again', async () => {
    await open('/ai/new', { agentsBody: { items: [{ name: 'general' }, { name: 7 }] } });
    await heading();
    expect(await screen.findByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByText(fill(strings['band.agentsMalformed'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('agents: an empty list is no error; the chat would work on this computer and the picker lists nothing', async () => {
    await open('/ai/new', { agentsBody: { items: [] } });
    await heading();
    await waitFor(() => expect(reads('/agents').length).toBeGreaterThan(0));
    agentIs(WORK);
    const picker = await openPicker();
    await waitFor(() => expect(within(picker).queryByRole('table')).toBeNull());
    expect(picker.querySelectorAll('tr[data-row-id]')).toHaveLength(0);
    expect(screen.queryByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }))).toBeNull();
  });

  it('tool catalogue: an entry the Hub cannot read is unread with Try again', async () => {
    await open('/ai/new', { toolsBody: { items: [{ name: 'bash' }], meta: { total: 1 } } });
    await heading();
    const picker = await openPicker();
    await waitFor(async () => expect(await rowOf(picker, 'chat')).toHaveTextContent(strings['pick.reach.unread']));
    expect(within(picker).getByRole('button', { name: strings['agent.retry'] })).toBeInTheDocument();
  });

  it('tool catalogue: an empty catalogue is read, never "unread"', async () => {
    await open('/ai/new', { toolsBody: { items: [], meta: { total: 0 } } });
    await heading();
    const picker = await openPicker();
    await waitFor(async () => expect(await rowOf(picker, 'chat')).toHaveTextContent(strings['pick.reach.none']));
    expect(within(picker).queryByRole('button', { name: strings['agent.retry'] })).toBeNull();
  });
});

describe('remembered choice when the browser keeps nothing', () => {
  it('a pick shows at once and is stored for the account', async () => {
    await open('/ai/new');
    await heading();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.general']}`) }));
    agentIs(WORK);
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual({ v: 2, agent: { kind: 'general' }, approvals: 'default', runsWith: 'hoody' }));
  });

  it('a pick the browser refuses to store still shows on this page', async () => {
    await open('/ai/new');
    await heading();
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).get()).toEqual(parseRemembered(null)));
    // The instance, not Storage.prototype: happy-dom keeps each Storage method on the instance once it was used, so a
    // prototype spy never reaches localStorage after boot or the mount wrote to it.
    // eslint-disable-next-line no-restricted-globals -- the test plays a browser that refuses storage
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.chat']}`) }));
      // The pick's own write (its key) reached the refusing store while the break is in place, and the page still shows it.
      await waitFor(() => expect(refuse.mock.calls.map(([k]) => k)).toContain(PREF_KEY));
      agentIs(CHAT);
    } finally {
      refuse.mockRestore();
    }
  });
});

const UNRESOLVED_WHY = 'An earlier start on this computer may still be on its way. It is checked first.';
/** A starter the test drives: it records every start, check, settle and release, and moves to the phase a test sets.
 *  `phase` is where it begins (a start already there when the page mounts); `onSubscribe(move)` runs when the page subscribes,
 *  which React does in an effect that runs BEFORE the page's own outcome effect of the same commit: a move there is a phase that
 *  changes between the render and the effect. */
function fakeStarter(door: StartDoor = { ok: true }, o: { phase?: StartPhase; auto?: StartState['auto']; onSubscribe?: (move: (p: StartPhase) => void) => void } = {}) {
  const subs = new Set<() => void>();
  let state: StartState = { door, phase: o.phase ?? { k: 'none' }, ...(o.auto ? { auto: o.auto } : {}) };
  const log = { starts: [] as { text: string; opts: StartOpts }[], checks: 0, settles: 0, stale: 0, releases: 0, at: [] as StartAt[] };
  // The contract's unresolved key: an unknown start keeps it until a verdict (opened or notSent) or Stop tracking.
  let unresolved = state.phase.k === 'unknown';
  const set = (next: Partial<StartState>) => {
    state = { ...state, ...next };
    if (next.phase?.k === 'unknown') unresolved = true;
    if (next.phase?.k === 'opened' || next.phase?.k === 'notSent') { unresolved = false; if (!state.door.ok && state.door.why === UNRESOLVED_WHY) state = { ...state, door }; }
    // As the provider: the door never opens over an unresolved key, not even by a test's door().
    else if (next.door?.ok && unresolved) state = { ...state, door: { ok: false, why: UNRESOLVED_WHY } };
    for (const f of [...subs]) f();
  };
  const busy = () => unresolved || state.phase.k === 'waiting' || state.phase.k === 'starting' || state.phase.k === 'unknown';
  const starter: Starter = {
    state: () => state,
    subscribe: (f) => {
      subs.add(f);
      const hook = o.onSubscribe;
      o.onSubscribe = undefined;
      hook?.((p) => set({ phase: p }));
      return () => { subs.delete(f); };
    },
    start: (text, opts) => {
      if (!state.door.ok || busy()) return false;
      log.starts.push({ text, opts });
      set({ phase: { k: 'starting' } });
      return true;
    },
    check: () => { log.checks++; },
    settle: (shown) => {
      if (shown !== state.phase) { log.stale++; return false; }
      log.settles++;
      // Stop tracking an unknown ends the start here: the door opens; the journal keeps the key.
      unresolved = false;
      set({ phase: { k: 'none' }, door });
      return true;
    },
    release: () => { log.releases++; },
  };
  const provider: ActiveConversationProvider = { open: () => null, starter: (_account, at) => { log.at.push(at); return starter; } };
  provideActiveConversations(provider);
  // `silent` swaps the phase without telling subscribers: the screen still shows the old phase object.
  const silent = (p: StartPhase) => { state = { ...state, phase: p }; };
  return { log, silent, starter, phase: (p: StartPhase) => act(() => set({ phase: p })), door: (d: StartDoor) => act(() => set({ door: d })), auto: (a: StartState['auto']) => act(() => set({ auto: a })) };
}
const sendButton = () => screen.getByRole('button', { name: /^Send/ });
// Send waiting is aria-disabled with its reason as the description; the name stays Send.
const sendOff = (why: string) => {
  const b = sendButton();
  expect(b).toHaveAccessibleDescription(why);
  expect(isOff(b)).toBe(true);
  return b;
};
async function typeAndSend(text: string) {
  await userEvent.type(screen.getByRole('textbox'), text);
  // The agent a chat starts on is known once the computer's agents were read.
  await waitFor(() => expect(sendButton()).not.toHaveAccessibleDescription(strings['send.agentLoading']));
  await userEvent.click(sendButton());
}

// What the page says about approvals before Send is what the start does (the starter's `auto`, read from the place the chat
// starts in), under the name the chat's own approvals chip gives that state. It never says a chat asks when it will not.
describe('approvals, said before Send', () => {
  const EVERYTHING = approvalModes['am.state.everything'];
  const approvalsRow = async () => settingOf(await openOptions(), strings['approvals.legend']);

  it('Default where a new chat starts with Allow everything on: the chip and the row say so, by the chat\'s own name for it, and never that it asks', async () => {
    fakeStarter({ ok: true }, { auto: 'on' });
    await open('/ai/new');
    await heading();
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: EVERYTHING })));
    const row = await approvalsRow();
    expect(row).toHaveTextContent(fill(strings['approvals.defaultOn'], { mode: EVERYTHING }));
    expect(row).not.toHaveTextContent(strings['approvals.defaultLine']);
    expect(row).not.toHaveTextContent(approvalModes['am.state.default']);
    expect(within(row).getByRole('radio', { name: strings['approvals.default'] })).toBeChecked();
  });

  it('the row\'s words for that state: it starts on and approves for you, some actions can still ask, how to change it; no promise the agent may not keep', () => {
    expect(strings['approvals.defaultOn']).toMatch(/^This chat starts with \{\{mode\}\} on: it approves actions for you, though some can still ask\. /);
    expect(strings['approvals.defaultOn']).toMatch(/Turn it off in the chat, or pick Ask every time here\.$/);
    expect(strings['approvals.defaultOn'].replace('pick Ask every time here', '')).not.toMatch(/without asking|every action|first message|every time/);
    expect(strings['approvals.defaultOn']).not.toMatch(/\bAsks\b/);
  });

  it('Default where the start leaves it off: the row says it asks, and the chip adds nothing', async () => {
    fakeStarter({ ok: true }, { auto: 'off' });
    await open('/ai/new');
    await heading();
    await waitFor(() => agentIs(WORK));
    expect(optionsChip()).toHaveAccessibleName(new RegExp(`^${strings['options.chip']}$`));
    const row = await approvalsRow();
    expect(row).toHaveTextContent(strings['approvals.defaultLine']);
    expect(row).not.toHaveTextContent(EVERYTHING);
  });

  it('an agent without that switch asks; one that has not answered promises neither', async () => {
    const f = fakeStarter({ ok: true }, { auto: 'none' });
    await open('/ai/new');
    await heading();
    const row = await approvalsRow();
    expect(row).toHaveTextContent(strings['approvals.defaultLine']);
    await f.auto('unknown');
    expect(row).toHaveTextContent(fill(strings['approvals.defaultUnknown'], { computer: 'atlas' }));
    expect(row).not.toHaveTextContent(strings['approvals.defaultLine']);
    expect(row).not.toHaveTextContent(EVERYTHING);
  });

  it('Strict says Strict whatever the start would do under Default; back on Default the state shows again', async () => {
    fakeStarter({ ok: true }, { auto: 'on' });
    await open('/ai/new');
    await heading();
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('radio', { name: strings['approvals.strict'] }));
    const row = settingOf(panel, strings['approvals.legend']);
    expect(row).toHaveTextContent(strings['approvals.strictShort']);
    expect(row).not.toHaveTextContent(EVERYTHING);
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: strings['summary.strict'] }));
    expect(optionsChip()).not.toHaveTextContent(EVERYTHING);
    await userEvent.click(within(await openOptions()).getByRole('radio', { name: strings['approvals.default'] }));
    await closeOptions();
    expect(optionsChip()).toHaveAccessibleName(fill(strings['options.chipSummary'], { summary: EVERYTHING }));
  });

  it('the state follows the place while the page is open (the switch turned off in the agent panel)', async () => {
    const f = fakeStarter({ ok: true }, { auto: 'on' });
    await open('/ai/new');
    await heading();
    await waitFor(() => expect(optionsChip()).toHaveAccessibleName(new RegExp(EVERYTHING)));
    await f.auto('off');
    expect(optionsChip()).toHaveAccessibleName(new RegExp(`^${strings['options.chip']}$`));
  });

  it('what is sent does not change with it: a Default start is still strict false', async () => {
    const f = fakeStarter({ ok: true }, { auto: 'on' });
    await open('/ai/new');
    await heading();
    await typeAndSend('Fix the build');
    expect(f.log.starts).toEqual([{ text: 'Fix the build', opts: { agent: 'general', model: defaultModel('hoody'), strict: false } }]);
  });
});

describe('starting a chat (through the starter)', () => {
  it('the first message may be as long as the chat engine takes, no longer: one character past it holds Send, at it Send starts', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await waitFor(() => expect(sendButton()).not.toHaveAccessibleDescription(strings['send.agentLoading']));
    const box = screen.getByRole('textbox');
    await act(async () => { fireEvent.change(box, { target: { value: 'a'.repeat(MAX_TEXT + 1) } }); });
    expect(isOff(sendButton())).toBe(true);
    await userEvent.click(sendButton());
    expect(f.log.starts).toEqual([]);
    await act(async () => { fireEvent.change(box, { target: { value: 'a'.repeat(MAX_TEXT) } }); });
    expect(isOff(sendButton())).toBe(false);
    await userEvent.click(sendButton());
    expect(f.log.starts.map((x) => x.text.length)).toEqual([MAX_TEXT]);
    expect(writes()).toEqual([]);
  });

  it('a start the starter refuses says it was not sent, until the draft changes', async () => {
    const f = fakeStarter();
    f.starter.start = () => false;
    await open('/ai/new');
    await heading();
    await typeAndSend('Fix the build');
    expect(await screen.findByText(strings['start.notSent'])).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox'), '!');
    await waitFor(() => expect(screen.queryByText(strings['start.notSent'])).toBeNull());
    expect(writes()).toEqual([]);
  });

  it('Send starts once with the first message and the choices, for the top bar computer in its realm; nothing is sent here', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await waitFor(() => expect(f.log.at.length).toBeGreaterThan(0));
    expect(f.log.at.at(-1)).toEqual({ computer: { project: String(atlas.project_id ?? ''), id: atlas.id, name: 'atlas', server: atlas.server_name }, realm: PERSONAL });
    await typeAndSend('Fix the build');
    expect(f.log.starts).toEqual([{ text: 'Fix the build', opts: { agent: 'general', model: defaultModel('hoody'), strict: false } }]);
    expect(writes()).toEqual([]);
  });

  it('All realms, a computer in no realm (no realm at the top lists it): the chat runs in Global and Send starts it there', async () => {
    realmsRead.ids = [];
    const f = fakeStarter();
    await open('/ai/new', { realm: 'all' });
    await heading();
    await waitFor(() => expect(f.log.at.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(f.log.at.at(-1)).toEqual({ computer: { project: String(atlas.project_id ?? ''), id: atlas.id, name: 'atlas', server: atlas.server_name }, realm: 'global' });
    expect(screen.queryByText(strings['band.pickRealm'])).toBeNull();
    await typeAndSend('Fix the build');
    expect(f.log.starts).toEqual([{ text: 'Fix the build', opts: { agent: 'general', model: defaultModel('hoody'), strict: false } }]);
    expect(writes()).toEqual([]);
  });

  it('All realms, a computer in no realm: its agents are read in Global too, so the picker lists them and no failed band shows', async () => {
    realmsRead.ids = [];
    await open('/ai/new', { realm: 'all' });
    await heading();
    // Read in the chat's realm, never in the top bar's All realms (GET /agents refuses that unsent: it would never reach here).
    await waitFor(() => expect(reads('/agents').length).toBeGreaterThan(0), { timeout: 5000 });
    expect(realmsOf('/agents').length).toBeGreaterThan(0);
    expect(realmsOf('/agents')).toEqual(realmsOf('/agents').map(() => 'global'));
    const picker = await openPicker();
    await rowOf(picker, 'reviewer');
    expect(screen.queryByText(fill(strings['band.agentsFailed'], { computer: 'atlas' }))).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('All realms, a computer in one realm: the chat runs in that realm, no realm question', async () => {
    const f = fakeStarter();
    await open('/ai/new', { realm: 'all' });
    await heading();
    await waitFor(() => expect(f.log.at.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(f.log.at.at(-1)?.realm).toBe(PERSONAL);
    expect(screen.queryByText(strings['band.pickRealm'])).toBeNull();
  });

  it('All realms, a computer whose record proves no realm list (missing, not a list, a malformed id): the realm question, never Global; nothing read or started', async () => {
    realmsRead.ids = null;
    const f = fakeStarter();
    await open('/ai/new', { realm: 'all' });
    await heading();
    expect(await screen.findByText(strings['band.pickRealm'], {}, { timeout: 5000 })).toBeInTheDocument();
    for (const path of ['/agents', '/acp/agents', '/acp/default', '/sessions/cwds']) expect(reads(path)).toEqual([]);
    expect(f.log.at).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("All realms, a computer in one realm: the model list asks Claude Code in that realm too, never in the top bar's All realms", async () => {
    await open('/ai/new', { realm: 'all', claude: {} });
    await heading();
    const panel = await openOptions();
    const cc = within(panel).getByRole('radio', { name: strings['runs.claude'] });
    await waitFor(() => expect(isOff(cc)).toBe(false));
    const before = reads('/acp/agents').length;
    await userEvent.click(cc);
    await closeOptions();
    // Runs with Claude Code: the model list reads its Claude Code part. GET /acp/agents refuses 'all' unsent, so this read
    // reaches the agent only when it names the chat's realm.
    await waitFor(() => expect(reads('/acp/agents').length).toBeGreaterThan(before), { timeout: 5000 });
    expect(realmsOf('/acp/agents').length).toBeGreaterThan(0);
    expect(realmsOf('/acp/agents')).toEqual(realmsOf('/acp/agents').map(() => PERSONAL));
    expect(writes()).toEqual([]);
  });

  it('while it starts: it says so, Send is off, a second press starts nothing, and the page stays (no chat claimed)', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await typeAndSend('one');
    expect(screen.getByText(fill(strings['start.starting'], { computer: 'atlas' }))).toBeInTheDocument();
    sendOff(strings['send.busy']);
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(f.log.starts).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/ai/new');
    f.phase({ k: 'waiting' });
    expect(screen.getByText(fill(strings['start.waiting'], { computer: 'atlas' }))).toBeInTheDocument();
    sendOff(strings['send.busy']);
    await userEvent.type(screen.getByRole('textbox'), 'two');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    await userEvent.click(sendButton());
    expect(f.log.starts).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/ai/new');
  });

  it('opened is the only phase that goes to the chat: its link carries the computer handle and the realm', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await typeAndSend('go');
    f.phase({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-new-1' } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-new-1'));
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
    expect(f.log.settles).toBe(1);
  });

  it('a chat New workflow started is not this page\'s: its opening stays on New chat and settles nothing', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    f.phase({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-wf' }, from: 'workflow' });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(router.state.location.pathname).toBe('/ai/new');
    expect(f.log.settles).toBe(0);
    f.phase({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-new-1' }, from: '' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-new-1'));
    expect(f.log.settles).toBe(1);
  });

  it('a New workflow start this page showed unknown: Check again proves it, and New chat goes to its chat', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    f.phase({ k: 'unknown' });
    await userEvent.click(screen.getByRole('button', { name: strings['start.check'] }));
    expect(f.log.checks).toBe(1);
    f.phase({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-wf' }, from: 'workflow' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-wf'));
    expect(f.log.settles).toBe(1);
  });

  it('unknown: it may have been made, never made or not sent; the text stays in the box, Send held; Check again reads (no second start)', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await typeAndSend('maybe');
    f.phase({ k: 'unknown' });
    expect(screen.getByText(fill(strings['start.unknown'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['start.notSent'])).toBeNull();
    expect(screen.queryByText(strings['start.unknownNoText'], { exact: false }), 'this page sent it: its text is here').toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('maybe');
    sendOff(strings['send.busy']);
    await userEvent.click(screen.getByRole('button', { name: strings['start.check'] }));
    expect(f.log.checks).toBe(1);
    expect(screen.getByRole('textbox')).toHaveValue('maybe');
    expect(f.log.starts).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/ai/new');
    await userEvent.click(screen.getByRole('button', { name: strings['start.untrack'] }));
    expect(f.log.settles).toBe(1);
    expect(screen.getByText(strings['start.untracked'])).toBeInTheDocument();
    expect(f.log.starts).toHaveLength(1);
  });

  it('Stop tracking settles only the unknown it shows: a phase that moved on since the press is left alone', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await typeAndSend('maybe');
    f.phase({ k: 'unknown' });
    const untrack = screen.getByRole('button', { name: strings['start.untrack'] });
    // The store moves to a new unknown phase object without a render in between (a reopened screen's start, another mount).
    f.silent({ k: 'unknown' });
    await userEvent.click(untrack);
    expect(f.log.settles).toBe(0);
    expect(f.log.stale).toBe(1);
    expect(screen.queryByText(strings['start.untracked'])).toBeNull();
  });

  it('the unknown line warns before Stop tracking: sending again may start a second chat', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await typeAndSend('maybe');
    f.phase({ k: 'unknown' });
    // The warning is on the line that offers Stop tracking (a warned dismiss, C9), not only after it.
    expect(screen.getByRole('button', { name: strings['start.untrack'] })).toBeInTheDocument();
    expect(screen.getByText(/may start a second chat/)).toBeInTheDocument();
  });

  it('Stop tracking an unknown ends it here: the line says where the chat shows, and Send works again', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await typeAndSend('maybe');
    f.phase({ k: 'unknown' });
    // While it is shown: Send is off with the busy words and Check again is offered.
    expect(screen.getByRole('button', { name: strings['start.check'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['start.untrack'] }));
    expect(f.log.settles).toBe(1);
    // The duplicate risk is said: the first chat shows in the list if it was made.
    expect(screen.getByText(strings['start.untracked'])).toBeInTheDocument();
    // The person's words are kept, and never a Send that names a Check the page no longer offers: Send starts them.
    expect(screen.getByRole('textbox')).toHaveValue('maybe');
    expect(screen.queryByRole('button', { name: strings['start.check'] })).toBeNull();
    expect(sendButton()).not.toHaveAccessibleDescription(UNRESOLVED_WHY);
    await userEvent.click(sendButton());
    expect(f.log.starts.map((x) => x.text)).toEqual(['maybe', 'maybe']);
    expect(router.state.location.pathname).toBe('/ai/new');
  });

  it('a start the provider shows as unknown at mount (a reloaded page) shows the band with Check again, and Send stays off', async () => {
    const f = fakeStarter({ ok: false, why: UNRESOLVED_WHY }, { phase: { k: 'unknown', taken: true } });
    await open('/ai/new');
    await heading();
    // The text was never stored (drafts.ts): the band says so, and the box is empty.
    expect(screen.getByText(`${fill(strings['start.unknown'], { computer: 'atlas' })} ${strings['start.unknownNoText']}`)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: strings['start.check'] }));
    expect(f.log.checks).toBe(1);
    await userEvent.type(screen.getByRole('textbox'), 'another');
    sendOff(UNRESOLVED_WHY);
    expect(f.log.starts).toHaveLength(0);
  });

  it('not sent: says nothing ran and why, keeps the text, and Send it now starts again', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await typeAndSend('again');
    f.phase({ k: 'notSent', why: 'The computer did not answer.' });
    expect(screen.getByText(fill(strings['start.notSentWhy'], { why: 'The computer did not answer.' }))).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('again');
    await userEvent.click(screen.getByRole('button', { name: strings['start.again'] }));
    expect(f.log.starts.map((x) => x.text)).toEqual(['again', 'again']);
  });

  it('a shut door keeps Send off with its reason, and nothing starts', async () => {
    const f = fakeStarter({ ok: false, why: 'Your sends are still being checked.' });
    await open('/ai/new');
    await heading();
    await userEvent.type(screen.getByRole('textbox'), 'blocked{Enter}');
    await waitFor(() => sendOff('Your sends are still being checked.'));
    expect(f.log.starts).toEqual([]);
    f.door({ ok: true });
    await userEvent.click(sendButton());
    expect(f.log.starts).toHaveLength(1);
  });

  it('Strict, a folder and Claude Code reach the start as chosen', async () => {
    const f = fakeStarter();
    await open('/ai/new', { claude: {} });
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('radio', { name: strings['approvals.strict'] }));
    await waitFor(() => expect(isOff(within(panel).getByRole('radio', { name: strings['runs.claude'] }))).toBe(false));
    await userEvent.click(within(panel).getByRole('radio', { name: strings['runs.claude'] }));
    await userEvent.click(within(panel).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await userEvent.type(await within(panel).findByRole('combobox', { name: strings['folder.path'] }), '/srv/shop{Escape}');
    await closeOptions();
    await typeAndSend('ship it');
    expect(f.log.starts).toEqual([{ text: 'ship it', opts: { agent: 'general', claude: { model: '' }, cwd: '/srv/shop', strict: true } }]);
  });

  it('a typed folder that is not a folder yet keeps Send off and says to pick one', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    const panel = await openOptions();
    await userEvent.click(within(panel).getByRole('button', { name: new RegExp(strings['folder.legend']) }));
    await userEvent.click(await screen.findByRole('option', { name: strings['folder.another'] }));
    await within(panel).findByRole('combobox', { name: strings['folder.path'] });
    await closeOptions();
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    sendOff(strings['send.pickFolder']);
    expect(f.log.starts).toEqual([]);
  });

  it('leaving and coming back during a start shows where it is, never "started"; the hold is let go on leaving', async () => {
    const f = fakeStarter();
    await open('/ai/new');
    await heading();
    await typeAndSend('keep');
    cleanup();
    expect(f.log.releases).toBeGreaterThan(0);
    const router = await open('/ai/new', { remount: true });
    await heading();
    expect(await screen.findByText(fill(strings['start.starting'], { computer: 'atlas' }))).toBeInTheDocument();
    sendOff(strings['send.busy']);
    expect(router.state.location.pathname).toBe('/ai/new');
    expect(f.log.starts).toHaveLength(1);
  });

  it('an opened phase that moves on between the render and its effect neither navigates nor clears', async () => {
    // Typed text first (a starter with nothing going on), then a starter whose opened phase moves before the page's effect.
    fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await userEvent.type(screen.getByRole('textbox'), 'keep me');
    const opened: StartPhase = { k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-old' } };
    let f!: ReturnType<typeof fakeStarter>;
    act(() => { f = fakeStarter({ ok: true }, { phase: opened, onSubscribe: (move) => move({ k: 'starting' }) }); });
    await waitFor(() => expect(f.log.stale).toBeGreaterThan(0));
    expect(f.log.settles).toBe(0);
    expect(router.state.location.pathname).toBe('/ai/new');
    expect(await screen.findByText(fill(strings['start.starting'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('keep me');
    expect(screen.queryByText(strings['start.unlinked'])).toBeNull();
  });

  it('an unknown phase that moves on between the render and its effect leaves the typed text alone', async () => {
    fakeStarter();
    await open('/ai/new');
    await heading();
    await userEvent.type(screen.getByRole('textbox'), 'keep me');
    let g!: ReturnType<typeof fakeStarter>;
    act(() => { g = fakeStarter({ ok: true }, { phase: { k: 'unknown' }, onSubscribe: (move) => move({ k: 'none' }) }); });
    await waitFor(() => expect(g.log.at.length).toBeGreaterThan(0));
    expect(screen.getByRole('textbox')).toHaveValue('keep me');
    expect(screen.queryByText(fill(strings['start.unknown'], { computer: 'atlas' }))).toBeNull();
  });

  it('a replaced provider: its old starter and snapshot are never shown, even for one render; the old hold is let go', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await waitFor(() => expect(f.log.at.length).toBeGreaterThan(0));
    // The old starter's start opened without telling the page; the next render on the OLD starter would navigate on it.
    f.silent({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-stale' } });
    let g!: ReturnType<typeof fakeStarter>;
    act(() => { g = fakeStarter(); });
    await waitFor(() => expect(g.log.at.length).toBeGreaterThan(0));
    expect(f.log.settles).toBe(0);
    expect(f.log.releases).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe('/ai/new');
    await typeAndSend('new');
    expect(g.log.starts).toHaveLength(1);
    expect(f.log.starts).toHaveLength(0);
  });

  it('a removed provider: the old starter is never shown; Send is off as unavailable and the hold is let go', async () => {
    const f = fakeStarter();
    const router = await open('/ai/new');
    await heading();
    await waitFor(() => expect(f.log.at.length).toBeGreaterThan(0));
    f.silent({ k: 'opened', ref: { computer: HANDLE, realm: PERSONAL, sid: 'sess-stale' } });
    act(() => { provideActiveConversations(null); });
    await waitFor(() => sendOff(strings['send.unavailable']));
    expect(f.log.settles).toBe(0);
    expect(f.log.releases).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe('/ai/new');
  });
});

// Arriving at New chat puts focus in the composer once, after the shell's title focus, and says the page's
// name in a polite live region; never steals focus, never on a coarse pointer, never again on a re-render.
describe('the composer takes focus on arrival', () => {
  /** Animation frames run only when `frames()` is called, in the order they were asked for (as a browser runs them). */
  let queue: { id: number; cb: FrameRequestCallback }[] = [];
  let nextId = 1;
  const frames = () => act(() => {
    for (let i = 0; i < 20 && queue.length > 0; i++) {
      const now = queue;
      queue = [];
      for (const f of now) f.cb(performance.now());
    }
  });
  beforeEach(() => {
    queue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { const id = nextId++; queue.push({ id, cb }); return id; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { queue = queue.filter((f) => f.id !== id); });
  });
  afterEach(() => vi.restoreAllMocks());
  const composer = () => screen.getByPlaceholderText(strings.placeholder);
  const said = () => [...document.querySelectorAll('[aria-live="polite"]')].map((e) => e.textContent ?? '').find((x) => x === strings.title) ?? '';

  it('the shell focuses the title on the route change first: the composer then takes focus and the title is said', async () => {
    await open('/ai/new');
    await screen.findByPlaceholderText(strings.placeholder);
    window.requestAnimationFrame(focusShownTitle); // the shell's route-change focus, asked for after the page's mount
    await frames();
    expect(composer()).toHaveFocus();
    expect(said()).toBe(strings.title);
  });

  it('the shell\'s title focus comes after the composer took it: it leaves focus in the page, and the title is still said', async () => {
    await open('/ai');
    await screen.findByPlaceholderText(strings.placeholder);
    await frames();
    expect(composer()).toHaveFocus();
    focusShownTitle();
    expect(composer()).toHaveFocus();
    expect(said()).toBe(strings.title);
  });

  it('never steals focus the person placed, and never takes it again on a re-render or a computer change', async () => {
    await open('/ai/new');
    await screen.findByPlaceholderText(strings.placeholder);
    const other = screen.getAllByRole('button')[0]!;
    act(() => other.focus());
    await frames();
    expect(other).toHaveFocus();
    expect(said()).toBe('');
    act(() => other.blur());
    shellRunning(false);
    shellRunning(true);
    await frames();
    expect(composer()).not.toHaveFocus();
  });

  it('/ai then the rail\'s New chat (/ai/new, the same view kept mounted): the composer takes focus again', async () => {
    const router = await open('/ai');
    await screen.findByPlaceholderText(strings.placeholder);
    await frames();
    expect(composer()).toHaveFocus();
    act(() => composer().blur());
    await act(async () => { router.history.push('/ai/new'); await router.load(); });
    await frames();
    expect(composer()).toHaveFocus();
  });

  it('not while a dialog is open', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    try {
      await open('/ai/new');
      await screen.findByPlaceholderText(strings.placeholder);
    await screen.findByPlaceholderText(strings.placeholder);
      await frames();
      expect(composer()).not.toHaveFocus();
    } finally {
      dialog.remove();
    }
  });

  it('not on a coarse pointer (a phone\'s keyboard would open uninvited)', async () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    try {
      await open('/ai/new');
      await screen.findByPlaceholderText(strings.placeholder);
    await screen.findByPlaceholderText(strings.placeholder);
      await frames();
      expect(composer()).not.toHaveFocus();
    } finally {
      window.matchMedia = mm;
    }
  });
});
