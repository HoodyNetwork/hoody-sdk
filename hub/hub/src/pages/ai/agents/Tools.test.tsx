// The Agent tools editor on real core (fixture transport). One setAgentTools per save with the whole list, never a
// toggle; strict with nothing ticked saves `tools: none` and the list read back keeps it; not strict with nothing ticked asks
// before it gives every tool; a fresh list read guards every send; a lost answer stays "may have gone through" (never sent
// again) until a fresh list shows what it wrote; a refusal is failed; product-owned agents are read-only; a changed chat says
// what its New chat line now reads.
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient, refreshFresh, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the editor's leave guard, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the editor, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { AgentTools } from './Tools';
import { useAgents } from './data';
import { computerRealms } from '../realmRules.testing';
import aiStrings from '../strings.en.json';
import { TOOL_CATALOGUE, toolsRules, toolsSeed, type ToolsAgent, type ToolsOpts } from './toolsFixtures';
import agentStrings from './strings.en.json';
import strings from './Tools.strings.en.json';
import toolNames from './toolNames.strings.en.json';
import kitForms from '@kit/forms/forms.strings.en.json';
import kitWords from '@kit/strings.en.json';
import sectionWords from '@kit/layouts/anatomy/strings.en.json';

type K = keyof typeof strings;
const w = (k: K, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
type GroupKey = 'group.coding' | 'group.agents' | 'group.more' | 'group.other';
/** A group's fold title: its label and its on/total count (the fold's line follows it in the trigger). */
const title = (g: GroupKey, on: number, total: number) => w('group.title', { group: w(g), count: w('group.count', { on, total }) });
/** The words of the search row's note while ticks are unsaved ("After this save: …"). */
const afterNote = () => screen.queryByText(new RegExp(`^${w('after').split(':')[0]}:`));

let sent: FixtureRequest[] = [];
const patches = () => sent.filter((r) => r.method !== 'GET');
const listReads = () => sent.filter((r) => r.method === 'GET' && r.path === '/agents');
let store: ToolsAgent[] = [];
/** Every agent call the transport sent: method, path and the realm read from its URL. kit.ts sends an agent call's realm in
 *  its URL only (admit: never in the built query), so a fixture request's query never carries it; the recorder is how a test
 *  reads it (as the GitHub Global case in settings/connections/accounts.test.tsx reads the fetched URLs). */
type AgentCall = { method: string; path: string; realm: string | null };
let agentCalls: AgentCall[] = [];
function recordAgentCalls(t: ReturnType<typeof bootFixtureCore>, first?: (c: AgentCall) => Response | undefined): void {
  agentCalls = [];
  const real = t.fetch.bind(t);
  t.fetch = (url, init, meta) => {
    const c: AgentCall = { method: meta.method.toUpperCase(), path: meta.path, realm: new URL(url, 'http://fixture.invalid').searchParams.get('realm') };
    agentCalls.push(c);
    const own = first?.(c);
    return own ? Promise.resolve(own) : real(url, init, meta);
  };
}
/** The realms the agent calls to `path` sent, in order. */
const realmsOf = (path: string, method = 'GET'): (string | null)[] => agentCalls.filter((c) => c.path === path && c.method === method).map((c) => c.realm);
/** Answers an agent call before the rules see it (a list of another realm); undefined: the rules answer. */
let answerFirst: ((c: AgentCall) => Response | undefined) | undefined;

type LeaveRef = { current: ((go: () => void, stay?: () => void) => void) | null };
let nav: (to: string) => Promise<void> = async () => {};
let where = () => '';
async function show(name: string, o: ToolsOpts & { realm?: string; rules?: FixtureRule[]; onShowSource?: () => void; onHeldChange?: (held: boolean) => void; keep?: boolean; strictMode?: boolean; leaveRef?: LeaveRef; hostGuard?: boolean } = {}) {
  const { realm, rules, onShowSource, onHeldChange, keep, strictMode, leaveRef, hostGuard, ...opts } = o;
  if (!keep) {
    sent = [];
    const seed = opts.seed ?? toolsSeed();
    store = seed;
    recordAgentCalls(bootFixtureCore({ rules: [...(rules ?? []), ...toolsRules({ ...opts, seed, onSend: (r) => sent.push(r), beforeList: (s, n, r) => { store = s; opts.beforeList?.(s, n, r); } })], ...(realm !== undefined ? { realm } : {}) }), (c) => answerFirst?.(c));
  }
  const Page = () => <AgentTools name={name} computer="atlas" onShowSource={onShowSource} onHeldChange={onHeldChange} leaveRef={leaveRef} hostGuard={hostGuard} />;
  const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: ['/ai/agents'] }) });
  nav = (to) => router.navigate({ to: to as never });
  where = () => router.state.location.pathname;
  await act(async () => {
    const tree = <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
    render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
    await router.load();
  });
  await screen.findByRole('heading', { name: strings.title }).catch(() => undefined);
}
// Each group is a fold, open until the person closes it (a search opens every group with a match). A box is reached
// the way a person reaches it: every closed group's title is pressed first, then the box is found.
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const groupTitle = new RegExp(`^(${(['group.coding', 'group.agents', 'group.web', 'group.todos', 'group.automation', 'group.memory', 'group.logs', 'group.fleet', 'group.more', 'group.other'] as const).map((g) => esc(w(g))).join('|')}) · `);
const openGroups = () => { for (const b of screen.queryAllByRole('button', { name: groupTitle, expanded: false })) fireEvent.click(b); };
/** A tool's English name, the name its box has (an id the table does not know shows as itself). */
const toolName = (tool: string): string => (toolNames as Record<string, string>)[`name.${tool}`] ?? tool;
const box = (tool: string) => { openGroups(); return screen.getByRole('checkbox', { name: toolName(tool) }); };
const tick = async (tool: string) => { await userEvent.click(box(tool)); };
const button = (k: K) => screen.getByRole('button', { name: w(k) });
const agent = (name: string) => store.find((a) => a.name === name)!;

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  answerFirst = undefined;
});

describe('zero tools (strict)', () => {
  it('removing the last tool saves tools: none in one PATCH; the read-back and a reload keep it', async () => {
    await show('helper');
    await waitFor(() => expect(box('read_file')).toBeChecked());
    await tick('read_file');
    expect(button('save.list')).toBeEnabled();
    await tick('bash');
    expect(button('save.none')).toBeEnabled();
    await userEvent.click(button('save.none'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.method).toBe('PATCH');
    expect(patches()[0]!.path).toBe('/agents/helper/tools');
    expect(patches()[0]!.body).toEqual({ tools: [], none: true });
    expect(await screen.findByText(w('saved', { name: 'helper', words: agentStrings['tools.none'] }))).toBeInTheDocument();
    expect(agent('helper').tools).toEqual([]);
    expect(screen.getByText(w('reach.none'))).toBeInTheDocument();
    // Reload: a fresh mount on the same computer reads `tools: none` back, nothing ticked, nothing to save.
    cleanup();
    queryClient.clear();
    await show('helper', { keep: true });
    await waitFor(() => expect(screen.getByText(w('reach.none'))).toBeInTheDocument());
    for (const t of TOOL_CATALOGUE) expect(box(t.name)).not.toBeChecked();
    expect(screen.queryByRole('button', { name: w('save.none') })).toBeNull(); // nothing to save: no save bar
    expect(patches()).toHaveLength(1);
  });

  it('the tool list\'s Why ends with the agents question (faq-ai), which opens its answer in place', async () => {
    await show('strictdef');
    // The no-list line holds no bare link: the link closes the Why.
    expect(await screen.findByText(w('base.default'), { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: w('why.more') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: w('why.q') }));
    await userEvent.click(await screen.findByRole('link', { name: w('why.more') }));
    expect(await screen.findByText(aiStrings['faq.agents.a'])).toBeInTheDocument();
  });

  it('a strict agent without a list (Hoody default tools) says so; ticking one saves exactly that list', async () => {
    await show('strictdef');
    expect(await screen.findByText(w('base.default'), { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['grep'] });
    await waitFor(() => expect(agent('strictdef').tools).toEqual(['grep']));
  });
});

describe('strict off', () => {
  it('nothing ticked means every tool: the button says so and asks first; Cancel sends nothing; confirming sends a bare []', async () => {
    await show('loose');
    await waitFor(() => expect(box('grep')).toBeChecked());
    await tick('read_file');
    await tick('grep');
    await userEvent.click(button('save.every'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(w('every.body', { name: 'loose' }))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: /cancel/i }));
    expect(patches()).toHaveLength(0);
    await userEvent.click(button('save.every'));
    const again = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(again).getByRole('button', { name: w('every.confirm') }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: [] });
    await waitFor(() => expect(agent('loose').tools).toBeUndefined());
    expect(await screen.findByText(w('saved', { name: 'loose', words: agentStrings['tools.every'] }))).toBeInTheDocument();
  });

  it('every tool starts all ticked; unticking one saves the others in catalogue order', async () => {
    await show('wide');
    expect(await screen.findByText(w('base.every'), { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: TOOL_CATALOGUE.map((t) => t.name).filter((n) => n !== 'bash') });
  });

  it('a list that ticks the whole catalogue is proved by the agent writing it as no line (Every tool)', async () => {
    await show('loose');
    await waitFor(() => expect(box('grep')).toBeChecked());
    for (const t of TOOL_CATALOGUE) if (!['read_file', 'grep'].includes(t.name)) await tick(t.name);
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(await screen.findByText(w('saved', { name: 'loose', words: agentStrings['tools.every'] }))).toBeInTheDocument();
  });
});

describe('batched ticks', () => {
  it('many ticks are one PATCH with the whole list, never a toggle; Discard puts the ticks back without sending', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await tick('glob_files');
    await tick('bash');
    await userEvent.click(screen.getByRole('button', { name: kitForms['form.discard'] }));
    expect(box('bash')).toBeChecked();
    expect(box('grep')).not.toBeChecked();
    expect(patches()).toHaveLength(0);
    await tick('grep');
    await tick('spawn_agent');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['read_file', 'grep', 'bash', 'spawn_agent'] });
    expect(sent.every((r) => r.method === 'GET' || r.path === '/agents/helper/tools')).toBe(true);
    expect(sent.some((r) => /toggle/.test(r.path))).toBe(false);
  });

  it('names the catalogue does not know stay apart; one can be dropped and is never ticked again here', async () => {
    await show('odd');
    // Not tools here starts open (a name there needs a look); its line shows the raw name, marked Unknown, with no info button.
    const other = await screen.findByRole('button', { name: new RegExp(`^${esc(title('group.other', 1, 1))}`) });
    expect(other).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'legacy_x' })).toBeChecked();
    expect(screen.getByText(w('tag.unknown'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: w('detail.open', { tool: 'legacy_x' }) })).toBeNull();
    openGroups();
    await tick('legacy_x');
    expect(box('legacy_x')).toBeDisabled();
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['read_file', 'bash'] });
  });
});

describe('the fresh read before a send', () => {
  it('a failed fresh read sends nothing and says so', async () => {
    let fail = false;
    await show('helper', { listFails: () => fail });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    fail = true;
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('readFirst'))).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
    // The ticks are kept, under a warning that the list shown is the last one read; Try again reads it, then the save goes.
    expect(screen.getByText(sectionWords.stale)).toBeInTheDocument();
    expect(box('grep')).toBeChecked();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: kitWords['action.retry'] }));
    await waitFor(() => expect(screen.queryByText(sectionWords.stale)).toBeNull());
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
  });

  it('tools changed elsewhere since the ticks: nothing is sent; Load the current list starts from them', async () => {
    await show('helper', { beforeList: (s, n) => { if (n === 2) s.find((a) => a.name === 'helper')!.tools = ['glob_files']; } });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('changed'))).toBeInTheDocument();
    expect(patches()).toHaveLength(0);
    expect(await screen.findByText(w('changedBand'))).toBeInTheDocument();
    expect(button('save.list')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: w('load') }));
    expect(box('glob_files')).toBeChecked();
    expect(box('bash')).not.toBeChecked();
  });

  it('an agent gone at save time sends nothing; the editor says so and keeps the unsaved ticks (never dropped unasked)', async () => {
    await show('helper', { beforeList: (s, n) => { if (n === 2) s.splice(s.findIndex((a) => a.name === 'helper'), 1); } });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('goneAtSave'))).toBeInTheDocument();
    expect(box('grep')).toBeChecked();
    expect(patches()).toHaveLength(0);
  });

  it('onHeldChange says true with unsaved ticks, false when they are undone, and false when the editor closes', async () => {
    const seen: boolean[] = [];
    await show('helper', { onHeldChange: (h) => seen.push(h) });
    await waitFor(() => expect(box('bash')).toBeChecked());
    expect(seen.at(-1)).toBe(false);
    await tick('grep');
    expect(seen.at(-1)).toBe(true);
    await tick('grep');
    expect(seen.at(-1)).toBe(false);
    await tick('grep');
    seen.length = 0;
    cleanup();
    expect(seen).toEqual([false]);
  });

  it('an agent gone from the list with no ticks says it is no longer in the list', async () => {
    await show('helper', { beforeList: (s, n) => { if (n === 2) s.splice(s.findIndex((a) => a.name === 'helper'), 1); } });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(w('gone', { name: 'helper' }))).toBeInTheDocument();
  });
});

describe('C9: a lost answer', () => {
  it('that did write is proved by the list read back: Saved, one PATCH, never failed', async () => {
    await show('helper', { set: 'lost' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('saved', { name: 'helper', words: '1 tool' }))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(patches()).toHaveLength(1);
  });

  it('that the list does not show stays held: ticks locked, Check again reads (never sends); Stop tracking unlocks after a warning', async () => {
    await show('helper', { set: 'notApplied' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    expect(screen.getByText(w('held', { name: 'helper' }))).toBeInTheDocument();
    expect(box('grep')).toBeDisabled();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    const reads = listReads().length;
    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(listReads().length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.getByRole('button', { name: /check again/i })).not.toBeDisabled());
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(patches()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: w('stop') }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(w('stop.body'))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: w('stop.confirm') }));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(box('grep')).not.toBeDisabled();
    expect(patches()).toHaveLength(1);
  });

  it('a held save survives a remount: still held, still never sent again', async () => {
    await show('helper', { set: 'notApplied' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    cleanup();
    await show('helper', { keep: true });
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    expect(box('grep')).toBeDisabled();
    expect(patches()).toHaveLength(1);
  });

  it('a refused save is never shown Saved later, even when the list comes to hold the same tools', async () => {
    await show('helper', { set: 'refuse' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
    // Another tab writes what was refused here; the next save's fresh read brings it in.
    agent('helper').tools = ['read_file'];
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('changed'))).toBeInTheDocument();
    expect(screen.queryByText(w('saved', { name: 'helper', words: '1 tool' }))).toBeNull();
    expect(patches()).toHaveLength(1);
  });

  it("a held save belongs to its agent: another agent's editor on the same computer is not locked by it", async () => {
    await show('helper', { set: 'notApplied' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    cleanup();
    await show('loose', { keep: true });
    await waitFor(() => expect(box('grep')).toBeChecked());
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(box('grep')).not.toBeDisabled();
  });

  it('a refusal (400) is failed, not unknown; the ticks stay usable', async () => {
    await show('helper', { set: 'refuse' });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(screen.getByText(w('refused'))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(box('grep')).not.toBeDisabled();
  });
});

describe('reads and locks', () => {
  it('a product-owned agent is read-only: no Save, every tick disabled; the overview says why, so no line or Why here', async () => {
    await show('bot');
    await waitFor(() => expect(box('bash')).toBeDisabled());
    expect(screen.queryByText('Hoody sets these tools.')).toBeNull();
    expect(screen.queryByRole('button', { name: w('why.q') })).toBeNull();
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
  });

  it('what strict means is a closed Why, not a paragraph and not a switch (the overview already says the mode)', async () => {
    await show('helper');
    const why = await screen.findByRole('button', { name: w('why.q') });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    // Closed, the answer is in the page but hidden (the disclosure panel), so it is not read out with the list.
    expect(screen.getByText(w('why.strict'), { exact: false })).not.toBeVisible();
    expect(screen.queryByText(/^Strict$/)).toBeNull();
    await userEvent.click(why);
    expect(screen.getByText(`${w('why.strict')} ${w('strict.where')}`, { exact: false })).toBeVisible();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a strict agent with no list: the Why speaks of saving with none ticked, so it never contradicts the default-tools line', async () => {
    await show('strictdef');
    expect(await screen.findByText(w('base.default'), { exact: false })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: w('why.q') }));
    expect(screen.getByText(w('why.strict'), { exact: false })).toBeVisible();
    expect(w('why.strict')).toBe('Strict is on: the agent gets exactly the ticked tools, and saving with none ticked gives it no tools at all.');
    expect(w('why.base')).toBe('Strict is off: the ticked tools are a base Hoody adds to; saving with none ticked gives it every tool.');
    expect(screen.queryByText(/none ticked means/)).toBeNull();
  });

  it('a list that is a base says so in the Why', async () => {
    await show('loose');
    await userEvent.click(await screen.findByRole('button', { name: w('why.q') }));
    expect(screen.getByText(w('why.base'), { exact: false })).toBeVisible();
    expect(screen.queryByText(w('why.strict'), { exact: false })).toBeNull();
  });

  it('a catalogue that is not whole is an error, never a shorter list; nothing is sent', async () => {
    await show('helper', { catalogueBody: { items: TOOL_CATALOGUE.slice(1), meta: { total: TOOL_CATALOGUE.length } } });
    expect(await screen.findByText(w('catalogueFailed'))).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(patches()).toHaveLength(0);
  });

  it('All realms, a computer in several realms: reads nothing and asks for one realm', async () => {
    const atlas = fixtureWorld.computers[0] as { id: string };
    const [r1, r2] = fixtureWorld.realms.map((r) => r.id) as [string, string];
    await show('helper', { realm: 'all', rules: [computerRealms(atlas.id, [r1, r2])] });
    expect(await screen.findByText(w('noRealm'))).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('All realms, a computer in no realm: the agent\'s tools are read in Global', async () => {
    const atlas = fixtureWorld.computers[0] as { id: string };
    await show('helper', { realm: 'all', rules: [computerRealms(atlas.id, [])] });
    await waitFor(() => expect(box('bash')).toBeChecked());
    expect(screen.queryByText(w('noRealm'))).toBeNull();
    expect(listReads().length).toBeGreaterThan(0);
    expect(realmsOf('/agents').length).toBeGreaterThan(0);
    for (const r of realmsOf('/agents')) expect(r).toBe('global');
  });

  it('search and the On/Off filter narrow the lines; group counts stay over the whole group', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    const codingCount = () => screen.getByRole('button', { name: new RegExp(`^${esc(title('group.coding', 2, 5))}`) });
    expect(codingCount()).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: w('search') }), 'shell');
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: toolName('read_file') })).toBeNull();
    expect(codingCount()).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: w('search') }));
    // The radio is named by its label alone; its count is its description, so a count never renames it.
    const off = screen.getByRole('radio', { name: w('show.off') });
    expect(off).toHaveAccessibleDescription('4');
    await userEvent.click(off);
    expect(screen.queryByRole('checkbox', { name: toolName('bash') })).toBeNull();
    expect(box('grep')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: w('search') }), 'zzz');
    expect(screen.getByText(w('noMatch'))).toBeInTheDocument();
  });

  it('the filter counts follow the search; Changed shows only the ticks that differ from what the agent holds, each tagged', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    const radio = (k: 'show.all' | 'show.on' | 'show.off' | 'show.changed', count: number) => {
      const r = screen.getByRole('radio', { name: w(k) });
      expect(r).toHaveAccessibleDescription(String(count));
      return r;
    };
    expect(radio('show.all', 6)).toBeInTheDocument();
    expect(radio('show.on', 2)).toBeInTheDocument();
    expect(radio('show.changed', 0)).toBeInTheDocument();
    expect(screen.queryByText(w('tag.changed'), { selector: 'li span' })).toBeNull();
    await tick('grep');
    await tick('bash');
    expect(radio('show.changed', 2)).toBeInTheDocument();
    expect(screen.getAllByText(w('tag.changed'), { selector: 'li span' })).toHaveLength(2);
    await userEvent.click(radio('show.changed', 2));
    expect(screen.getByRole('checkbox', { name: toolName('grep') })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: toolName('read_file') })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: w('search') }), 'file');
    expect(radio('show.changed', 1)).toBeInTheDocument();
    expect(radio('show.all', 4)).toBeInTheDocument();
  });
});

describe('reach line, All on / All off, save bar', () => {
  it('the section line says how far the tools reach; while ticks are unsaved the search row says what the save leaves, by name; Discard drops the ticks', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    expect(screen.getByText(w('reach.acts', { computer: 'atlas' }))).toBeInTheDocument();
    // The count box and the Now line are gone (the overview above counts the tools).
    expect(screen.queryByText(/^Now/)).toBeNull();
    expect(afterNote()).toBeNull();
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
    await tick('grep');
    await tick('bash');
    await tick('glob_files');
    const changes = w('summary.onOff', { changes: w('summary_other', { count: 3 }), on: `${toolName('glob_files')}, ${toolName('grep')}`, off: toolName('bash') });
    expect(screen.getByText(w('after', { count: w('after.count_other', { count: 3 }), summary: changes }))).toBeInTheDocument();
    expect(button('save.list')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: kitForms['form.discard'] }));
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
    expect(afterNote()).toBeNull();
    expect(box('bash')).toBeChecked();
    expect(box('grep')).not.toBeChecked();
    expect(patches()).toHaveLength(0);
  });
});

describe('All on / All off', () => {
  it('All on / All off tick every tool of the group (and only it), whatever the search shows; a save sends the whole list once', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    await userEvent.type(screen.getByRole('searchbox', { name: w('search') }), 'shell');
    await userEvent.click(screen.getByRole('button', { name: w('group.allOn.aria', { group: w('group.coding') }) }));
    await userEvent.clear(screen.getByRole('searchbox', { name: w('search') }));
    expect(box('write_file')).toBeChecked();
    expect(box('glob_files')).toBeChecked();
    expect(box('spawn_agent')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: w('group.allOn.aria', { group: w('group.agents') }) }));
    expect(box('spawn_agent')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: w('group.allOff.aria', { group: w('group.coding') }) }));
    expect(box('read_file')).not.toBeChecked();
    expect(box('bash')).not.toBeChecked();
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['spawn_agent'] });
  });

  it('All off on a group already off changes nothing: a strict agent on Hoody\'s default tools gets no save', async () => {
    await show('strictdef');
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    await userEvent.click(screen.getByRole('button', { name: w('group.allOff.aria', { group: w('group.coding') }) }));
    expect(screen.queryByRole('button', { name: w('save.none') })).toBeNull();
    expect(afterNote()).toBeNull();
    expect(patches()).toHaveLength(0);
  });

  it('a Hoody-owned agent offers no All on / All off and no save', async () => {
    await show('bot');
    await waitFor(() => expect(box('bash')).toBeDisabled());
    expect(screen.queryByRole('button', { name: w('group.allOff.aria', { group: w('group.coding') }) })).toBeNull();
    // Its details stay open to read: the info button is not a change.
    expect(screen.getByRole('button', { name: w('detail.open', { tool: toolName('bash') }) })).toBeEnabled();
    expect(screen.queryByRole('button', { name: kitForms['form.discard'] })).toBeNull();
  });
});

describe('customised chat', () => {
  it('a changed chat says what its New chat line now reads, and offers Reset to shipped', async () => {
    const onShowSource = vi.fn();
    await show('chat', { onShowSource });
    expect(await screen.findByText(w('chat.changed'), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(w('chat.line', { line: w('reach.none') }), { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: w('chat.reset') }));
    expect(onShowSource).toHaveBeenCalledTimes(1);
  });

  it('after a save the line follows the new tools: a strict chat with read-only tools reads and searches', async () => {
    await show('chat', { seed: toolsSeed().map((a) => (a.name === 'chat' ? { ...a, strict_tools: true } : a)) });
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(await screen.findByText(w('chat.line', { line: w('reach.read', { computer: 'atlas' }) }), { exact: false })).toBeInTheDocument();
  });

  it('an unmodified shipped chat shows no note', async () => {
    await show('shipchat');
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    expect(screen.queryByText(w('chat.changed'), { exact: false })).toBeNull();
  });
});

const other = () => fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const atlas = () => fixtureWorld.computers.find((c) => c.name === 'atlas')!;

describe('drafts belong to one computer and one read', () => {
  it('ticks never carry to another computer: switching drops the draft, and Save there sends nothing of it', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    expect(box('grep')).toBeChecked();
    await act(async () => { chooseComputer(other()); });
    await waitFor(() => expect(listReads().some((r) => r.target?.container.id === other().id)).toBe(true));
    await waitFor(() => expect(box('bash')).toBeChecked());
    expect(box('grep')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull(); // nothing to save: no save bar
    expect(patches()).toHaveLength(0);
  });

  it('a held save on one computer is never shown Saved by another computer whose agent already has those tools', async () => {
    await show('helper', {
      set: 'notApplied',
      beforeList: (st, _n, r) => { if (r.target?.container.id === other().id) st.find((a) => a.name === 'helper')!.tools = ['read_file']; },
    });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    await act(async () => { chooseComputer(other()); });
    await waitFor(() => expect(listReads().some((r) => r.target?.container.id === other().id)).toBe(true));
    await waitFor(() => expect(box('read_file')).toBeChecked());
    expect(screen.queryByText(w('saved', { name: 'helper', words: '1 tool' }))).toBeNull();
    expect(document.querySelector('[data-outcome="done"]')).toBeNull();
    // Back on the first computer the save is still held.
    await act(async () => { chooseComputer(atlas()); });
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    expect(patches()).toHaveLength(1);
  });

  it('a pre-save read cancelled by another read answers with the cache: nothing is sent, and Save is locked from the press', async () => {
    await show('helper', {
      listDelay: (n) => (n === 2 ? 1500 : 0),
      beforeList: (st, n) => { if (n === 2) st.find((a) => a.name === 'helper')!.tools = ['glob_files']; },
    });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    // From the press: ticks and Save locked, so a second press starts nothing.
    expect(box('glob_files')).toBeDisabled();
    expect(screen.getByRole('button', { name: kitForms['form.saving'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
    await act(async () => { await queryClient.refetchQueries(); });
    await waitFor(() => expect(screen.queryByText(w('readFirst')) ?? screen.queryByText(w('changed'))).not.toBeNull());
    expect(patches()).toHaveLength(0);
  });

  it('strict on Hoody\'s default tools can be saved straight to no tools (tick and untick, then Save: no tools)', async () => {
    await show('strictdef');
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    expect(screen.queryByRole('button', { name: w('save.none') })).toBeNull();
    await tick('grep');
    await tick('grep');
    expect(button('save.none')).toBeEnabled();
    await userEvent.click(button('save.none'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: [], none: true });
    await waitFor(() => expect(agent('strictdef').tools).toEqual([]));
    expect(await screen.findByText(w('saved', { name: 'strictdef', words: agentStrings['tools.none'] }))).toBeInTheDocument();
  });

  it('not strict with tools: none can be saved to every tool (after the confirm)', async () => {
    await show('chat');
    await waitFor(() => expect(box('grep')).not.toBeChecked());
    await tick('grep');
    await tick('grep');
    await userEvent.click(button('save.every'));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: w('every.confirm') }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: [] });
  });

  it('an answered save whose read-back fails never shows the old tools as saved', async () => {
    let fail = false;
    await show('helper', { listFails: () => fail, onSend: undefined });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('read_file');
    await tick('bash');
    const before = sent.length;
    // Fail every list read after the PATCH (the pre-save read is answered first).
    const watch = setInterval(() => { if (patches().length > 0) fail = true; }, 1);
    try {
      await userEvent.click(button('save.none'));
      expect(await screen.findByText(w('savedUnread', { name: 'helper' }))).toBeInTheDocument();
    } finally { clearInterval(watch); }
    expect(sent.length).toBeGreaterThan(before);
    expect(patches()).toHaveLength(1);
    expect(screen.queryByText(w('saved', { name: 'helper', words: '2 tools' }))).toBeNull();
    expect(screen.queryByText(w('saved', { name: 'helper', words: agentStrings['tools.none'] }))).toBeNull();
  });

  it('an answered save says Saved only after the list is read again', async () => {
    await show('helper', { listDelay: (n) => (n === 3 ? 1500 : 0) });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByText(w('saved', { name: 'helper', words: '2 tools' }))).toBeNull();
    expect(await screen.findByText(w('saved', { name: 'helper', words: '1 tool' }), {}, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('a save never rests on a cancelled or stale read', () => {
  it('a pre-save read cancelled back to the cache (no fresh answer) sends nothing, even though the cache matches the ticks', async () => {
    await show('helper', {
      listDelay: (n) => (n === 2 ? 1500 : 0),
      beforeList: (st, n) => { if (n === 2) st.find((a) => a.name === 'helper')!.tools = ['glob_files']; },
    });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    // Cancelled: react-query reverts to the cached list, which still matches what the ticks were based on.
    await act(async () => { await queryClient.cancelQueries(); });
    expect(await screen.findByText(w('readFirst'))).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 200));
    expect(patches()).toHaveLength(0);
  });

  it('switching computer while the pre-save read runs sends nothing to either computer', async () => {
    await show('helper', { listDelay: (n) => (n === 2 ? 800 : 0) });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    await act(async () => { chooseComputer(other()); });
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(patches()).toHaveLength(0);
  });

  it('two presses in the same tick start one save: one pre-save read, one PATCH', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    const reads = listReads().length;
    const b = button('save.list');
    act(() => { fireEvent.click(b); fireEvent.click(b); });
    await waitFor(() => expect(patches()).toHaveLength(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(patches()).toHaveLength(1);
    // One pre-save read, the read-back after the answer, and core's own read after the change: never a second save's reads.
    expect(listReads().length - reads).toBeLessThanOrEqual(3);
  });
});

describe('a read is fresh by its own answer, never by a clock', () => {
  it('a pre-save read cancelled back to a cached list stamped in the same millisecond as the press sends nothing', async () => {
    // One clock for the whole test: the cached list, the press and the cancelled refetch all read the same millisecond.
    vi.spyOn(Date, 'now').mockReturnValue(1_900_000_000_000);
    await show('helper', {
      listDelay: (n) => (n === 2 ? 1500 : 0),
      beforeList: (st, n) => { if (n === 2) st.find((a) => a.name === 'helper')!.tools = ['glob_files']; },
    });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    await act(async () => { await queryClient.cancelQueries(); });
    expect(await screen.findByText(w('readFirst'))).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(patches()).toHaveLength(0);
  });

  it('under StrictMode (effects run twice on mount) Save still sends and settles', async () => {
    await show('helper', { strictMode: true });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(await screen.findByText(w('saved', { name: 'helper', words: '3 tools' }), {}, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('Save reads the list of its own realm only', () => {
  it('a list of this computer cached from another realm, without the agent, neither blocks Save nor is read again', async () => {
    const realm = fixtureWorld.realms[0]!.id; // atlas is in Personal
    // Global's agents of this computer: no helper there (answered before the rules, which keep one store per computer).
    answerFirst = (c) => (c.path === '/agents' && c.realm === 'global'
      ? new Response(JSON.stringify({ items: [], meta: { total: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : undefined);
    await show('helper', { realm });
    await waitFor(() => expect(box('bash')).toBeChecked());
    // Another view of this computer read its Global agents (a Global chat's header) and closed. Its read stays cached
    // (gcTime): refreshFresh re-reads a fetched query with no observer, and a done save's invalidate does not (inactive).
    const globalReads = () => realmsOf('/agents').filter((r) => r === 'global').length;
    function GlobalList() { const g = useAgents(true, 'global'); return g.rows ? <p>{`global agents: ${g.rows.length}`}</p> : null; }
    const side = render(<QueryClientProvider client={queryClient}><GlobalList /></QueryClientProvider>);
    // its answer landed (a read cancelled by the unmount would leave nothing cached and prove nothing here)
    expect(await screen.findByText('global agents: 0')).toBeInTheDocument();
    expect(globalReads()).toBe(1);
    side.unmount();
    await tick('grep');
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(await screen.findByText(w('saved', { name: 'helper', words: '3 tools' }), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(w('readFirst'))).toBeNull();
    // Neither the read before the send nor the one after it went to Global; every other list read named the editor's realm.
    expect(globalReads()).toBe(1);
    const own = realmsOf('/agents').filter((r) => r !== 'global');
    expect(own.length).toBeGreaterThanOrEqual(3); // the editor's first read, the read before the send, the one after it
    for (const r of own) expect(r).toBe(realm);
  });
});

describe('Save never takes a read sent before the press', () => {
  it('a read-back of the list already out when Save is pressed cannot authorize the write: Save sends its own read', async () => {
    // List read 2 is a read-back started before the press: it captures the old tools and answers late. From read 3 on
    // the server holds tools changed elsewhere.
    await show('helper', {
      listDelay: (n) => (n === 2 ? 1500 : 0),
      beforeList: (st, n) => { if (n >= 3) st.find((a) => a.name === 'helper')!.tools = ['glob_files']; },
    });
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('grep');
    const before = listReads().length;
    let early: Promise<unknown> = Promise.resolve();
    await act(async () => {
      early = refreshFresh((k) => k[5] === 'ai-agents' && k[6] === 'list');
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(listReads().length).toBe(before + 1);
    await userEvent.click(button('save.list'));
    expect(await screen.findByText(w('changed'), {}, { timeout: 4000 })).toBeInTheDocument();
    await act(async () => { await early; await new Promise((r) => setTimeout(r, 200)); });
    expect(patches()).toHaveLength(0);
    // The press sent its own request after the earlier one.
    expect(listReads().length).toBeGreaterThanOrEqual(before + 2);
  });
});

describe('route once: a host that owns the route guard (hostGuard) and asks through leaveRef (go, stay)', () => {
  const go = async (to: string) => { await act(async () => { void nav(to); await new Promise((r) => setTimeout(r, 10)); }); };
  const dialogs = () => [...screen.queryAllByRole('alertdialog'), ...screen.queryAllByRole('dialog')];

  it('hostGuard: unsaved ticks hold no path change of their own (the host asks)', async () => {
    await show('helper', { hostGuard: true });
    await tick('bash');
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(0);
    expect(where()).toBe('/ai/agents/loose');
  });

  it('without hostGuard the editor keeps its own guard: a path change with unsaved ticks asks', async () => {
    await show('helper');
    await tick('bash');
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(1);
    expect(where()).toBe('/ai/agents');
  });

  it('leaveRef: Stay calls the host\'s stay and keeps the ticks; Leave runs go', async () => {
    const ref: LeaveRef = { current: null };
    await show('helper', { leaveRef: ref, hostGuard: true });
    await tick('bash');
    const goFn = vi.fn();
    const stay = vi.fn();
    act(() => { ref.current!(goFn, stay); });
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    expect(stay).toHaveBeenCalledTimes(1);
    expect(goFn).not.toHaveBeenCalled();
    expect(box('bash')).not.toBeChecked();
    act(() => { ref.current!(goFn, stay); });
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: w('leave.confirm') }));
    expect(goFn).toHaveBeenCalledTimes(1);
    expect(stay).toHaveBeenCalledTimes(1);
  });

  it('leaveRef without stay (an older host): Stay just closes the dialog', async () => {
    const ref: LeaveRef = { current: null };
    await show('helper', { leaveRef: ref });
    await tick('bash');
    const goFn = vi.fn();
    act(() => { ref.current!(goFn); });
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    expect(dialogs()).toHaveLength(0);
    expect(goFn).not.toHaveBeenCalled();
  });
});


describe('the groups fold', () => {
  /** A group's fold trigger, once the editor has its lists (null until then, or when the group has no line to show). */
  const trigger = (g: GroupKey, on: number, total: number) => screen.queryByRole('button', { name: new RegExp(`^${esc(title(g, on, total))}`) });

  it('each group is a fold titled with its name and on/total count, closed by default; opening one shows its boxes', async () => {
    await show('helper');
    await waitFor(() => expect(trigger('group.coding', 2, 5)).toBeInTheDocument());
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('group.agents', 0, 1)).toHaveAttribute('aria-expanded', 'false');
    // Closed: no box and no description in the page, only the outline.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(TOOL_CATALOGUE[0]!.description.split('\n')[0]!)).toBeNull();
    // Its line says what is in it and how many only read.
    expect(trigger('group.coding', 2, 5)).toHaveAccessibleName(new RegExp(`${esc(w('scope.coding'))} · ${esc(w('group.readOnly', { count: 3 }))}$`));
    expect(trigger('group.agents', 0, 1)).toHaveAccessibleName(new RegExp(`${esc(w('group.readOnly.none'))}$`));
    await userEvent.click(trigger('group.coding', 2, 5)!);
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: toolName('read_file') })).toBeChecked();
    // A tick inside an open group is a change to save; its title counts it; the closed group stays closed.
    await userEvent.click(screen.getByRole('checkbox', { name: toolName('write_file') }));
    expect(trigger('group.coding', 3, 5)).toHaveAccessibleName(new RegExp(`^${esc(w('group.titleChanged', { group: w('group.coding'), count: w('group.count', { on: 3, total: 5 }), changed: w('group.changed', { count: 1 }) }))}`));
    expect(trigger('group.agents', 0, 1)).toHaveAttribute('aria-expanded', 'false');
    expect(button('save.list')).toBeEnabled();
    expect(screen.getByRole('radio', { name: w('show.all') })).toHaveAccessibleDescription('6');
    await userEvent.click(trigger('group.coding', 3, 5)!);
    expect(screen.queryByRole('checkbox', { name: toolName('read_file') })).toBeNull();
  });

  it('a search opens every group with a matching tool, so a match is never hidden; clearing it gives the folds back', async () => {
    await show('helper');
    await waitFor(() => expect(trigger('group.agents', 0, 1)).toBeInTheDocument());
    await userEvent.click(trigger('group.agents', 0, 1)!);
    expect(trigger('group.agents', 0, 1)).toHaveAttribute('aria-expanded', 'true');
    const search = screen.getByRole('searchbox', { name: w('search') });
    await userEvent.type(search, 'file');
    // "file" is in read_file's and write_file's names, grep's "Search file contents." and glob_files' "Find files by
    // name."; bash and spawn_agent do not say it, so Agents has nothing to show.
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('group.agents', 0, 1)).toBeNull();
    expect(screen.getByRole('checkbox', { name: toolName('read_file') })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: toolName('write_file') })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: toolName('bash') })).toBeNull();
    await userEvent.clear(search);
    // Back to the folds as they were: Coding closed as it started, Agents open as the person left it.
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('group.agents', 0, 1)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('checkbox', { name: toolName('read_file') })).toBeNull();
    expect(screen.getByRole('checkbox', { name: toolName('spawn_agent') })).not.toBeChecked();
  });

  it('a filter other than All opens every group with a match the same way; All gives the folds back', async () => {
    await show('helper');
    await waitFor(() => expect(trigger('group.agents', 0, 1)).toBeInTheDocument());
    // A tick, then its group closed: the Changed filter must still show it.
    await userEvent.click(trigger('group.agents', 0, 1)!);
    await userEvent.click(screen.getByRole('checkbox', { name: toolName('spawn_agent') }));
    await userEvent.click(trigger('group.agents', 1, 1)!);
    expect(screen.queryByRole('checkbox', { name: toolName('spawn_agent') })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: w('show.changed') }));
    expect(trigger('group.agents', 1, 1)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: toolName('spawn_agent') })).toBeChecked();
    expect(trigger('group.coding', 2, 5)).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: w('show.on') }));
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: toolName('grep') })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: w('show.all') }));
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('group.agents', 1, 1)).toHaveAttribute('aria-expanded', 'false');
  });

  it('a group closed during a search opens again when the search is cleared and the same words are typed again', async () => {
    await show('helper');
    await waitFor(() => expect(trigger('group.coding', 2, 5)).toBeInTheDocument());
    const search = screen.getByRole('searchbox', { name: w('search') });
    await userEvent.type(search, 'file');
    await userEvent.click(trigger('group.coding', 2, 5)!);
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'false');
    await userEvent.clear(search);
    await userEvent.type(search, 'file');
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
  });

  // A closure belongs to the words it was made under; any change
  // of the words is a new search, so going back to earlier words never brings back a group closed under them.
  it('a group closed during a search opens again once the words change, also when they change back ("file" → "files" → "file")', async () => {
    await show('helper');
    await waitFor(() => expect(trigger('group.coding', 2, 5)).toBeInTheDocument());
    const search = screen.getByRole('searchbox', { name: w('search') });
    await userEvent.type(search, 'file');
    await userEvent.click(trigger('group.coding', 2, 5)!);
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'false');
    // "files": glob_files ("Find files by name.") still matches, in a group opened again by the new words.
    await userEvent.type(search, 's');
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: toolName('glob_files') })).toBeInTheDocument();
    // Back to "file": still a change of the words, so the group stays open with its matches shown.
    await userEvent.type(search, '{Backspace}');
    expect(search).toHaveValue('file');
    expect(trigger('group.coding', 2, 5)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: toolName('read_file') })).toBeChecked();
  });
});

describe('the default row: the English name, the rest on demand', () => {
  it('a row shows the English name only; the id and the description are not in the page until the info button is pressed', async () => {
    await show('helper');
    const read = box('read_file');
    expect(toolName('read_file')).toBe('Read file');
    expect(read).toHaveAccessibleName('Read file');
    expect(read).toBeChecked();
    // Not the description, not the raw id: neither is in the page while the details are shut.
    expect(screen.queryByText('Read a file.', { exact: false })).toBeNull();
    expect(screen.queryByText('read_file')).toBeNull();
    for (const t of TOOL_CATALOGUE) expect(screen.queryByText(t.description.split('\n')[0]!, { exact: false })).toBeNull();
    const info = screen.getByRole('button', { name: w('detail.open', { tool: 'Read file' }) });
    await userEvent.click(info);
    const pop = await screen.findByRole('dialog', { name: w('detail.open', { tool: 'Read file' }) });
    expect(within(pop).getByText('read_file')).toBeInTheDocument();
    expect(within(pop).getByText(w('detail.readOnly'))).toBeInTheDocument();
    expect(within(pop).getByText(/Read a file\./)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(info).toHaveFocus();
    // Opening the details changed nothing.
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
    expect(read).toBeChecked();
  });

  it('a tool that acts says so in its details', async () => {
    await show('helper');
    box('bash');
    await userEvent.click(screen.getByRole('button', { name: w('detail.open', { tool: toolName('bash') }) }));
    const pop = await screen.findByRole('dialog');
    expect(within(pop).getByText('bash')).toBeInTheDocument();
    expect(within(pop).getByText(w('detail.acts'))).toBeInTheDocument();
    expect(within(pop).getByText('Run a shell command.')).toBeInTheDocument();
  });

  it('search matches the English name, the id and the description, and says why when the name itself does not match', async () => {
    await show('helper');
    await waitFor(() => expect(screen.getByRole('searchbox', { name: w('search') })).toBeInTheDocument());
    const search = screen.getByRole('searchbox', { name: w('search') });
    // By the English name ("Search text" is grep's), no extra tag.
    await userEvent.type(search, 'search text');
    expect(screen.getByRole('checkbox', { name: toolName('grep') })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText('grep')).toBeNull();
    expect(screen.queryByText(w('tag.inDescription'))).toBeNull();
    // By the id: the row says it matched there (a short tag; the id itself is in the details).
    await userEvent.clear(search);
    await userEvent.type(search, 'grep');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: toolName('grep') })).toBeInTheDocument();
    expect(screen.getByText(w('tag.inId'))).toBeInTheDocument();
    // By the description: the row says it matched there.
    await userEvent.clear(search);
    await userEvent.type(search, 'shell command');
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText(w('tag.inDescription'))).toBeInTheDocument();
    // Nothing matches: the empty line.
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz-nothing');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('ticks keep their meaning: a tick turns the named tool on or off, and the save sends the list in the catalogue order', async () => {
    await show('helper');
    await tick('spawn_agent');
    await tick('grep');
    await tick('read_file');
    expect(box('grep')).toBeChecked();
    expect(box('read_file')).not.toBeChecked();
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['grep', 'bash', 'spawn_agent'] });
    expect(agent('helper').tools).toEqual(['grep', 'bash', 'spawn_agent']);
  });
});

describe('one press makes an agent read only', () => {
  it('under "Can change things", Turn all off unticks every tool that can change things, across the groups; read-only tools stay as they were', async () => {
    await show('loose');
    // loose holds read_file and grep (read only); tick every acting tool on first, so there is something to turn off.
    await tick('write_file');
    await tick('bash');
    await tick('spawn_agent');
    await tick('glob_files');
    const acts = screen.getByRole('radio', { name: w('show.acts') });
    expect(acts).toHaveAccessibleDescription('3');
    await userEvent.click(acts);
    // Only the acting tools are listed, from both Coding and Agents.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.queryByRole('checkbox', { name: toolName('read_file') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: w('acts.allOff.aria', { count: 3 }) }));
    for (const tool of ['write_file', 'bash', 'spawn_agent']) expect(screen.getByRole('checkbox', { name: toolName(tool) })).not.toBeChecked();
    // The line above says what the save leaves before anything is sent.
    expect(afterNote()).not.toBeNull();
    expect(patches()).toHaveLength(0);
    await userEvent.click(screen.getByRole('radio', { name: w('show.all') }));
    expect(box('read_file')).toBeChecked();
    expect(box('grep')).toBeChecked();
    expect(box('glob_files')).toBeChecked();
    await userEvent.click(button('save.list'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ tools: ['read_file', 'grep', 'glob_files'] });
  });
});

describe('focus and the empty Turn all off', () => {
  it('a tick that takes its own line away under a narrowing filter gives focus back to the filter', async () => {
    await show('helper');
    await waitFor(() => expect(screen.getByRole('radio', { name: w('show.on') })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('radio', { name: w('show.on') }));
    const shell = screen.getByRole('checkbox', { name: toolName('bash') });
    await userEvent.click(shell);
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: toolName('bash') })).toBeNull());
    await waitFor(() => expect(screen.getByRole('radio', { name: w('show.on') })).toHaveFocus());
  });

  it('Turn all off with nothing on says why and changes nothing', async () => {
    await show('helper');
    await waitFor(() => expect(box('bash')).toBeChecked());
    await tick('bash');
    await userEvent.click(screen.getByRole('radio', { name: w('show.acts') }));
    const off = screen.getByRole('button', { name: w('acts.allOff.aria', { count: 0 }) });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(off);
    expect(screen.getByRole('checkbox', { name: toolName('bash') })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: toolName('write_file') })).not.toBeChecked();
    expect(patches()).toHaveLength(0);
  });
});
