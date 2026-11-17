// The Agents view with the real tools editor and the real file editor on real core (fixture
// transport). Choosing an agent shows its tools between the overview and the file; a save from the page is one setAgentTools
// with the whole list and the overview follows the list read again; strict with nothing ticked saves `tools: none`; a delete
// gives the tools a fresh editor; the changed-chat note's Reset link moves to the file. Changing the agent the view keeps
// itself asks before unsaved ticks go, and asks once when the file has a draft too. A tools save changes the file under an
// open draft: the file's save is refused with its Compare, never written over.
import { answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, realmsView, reply, switchLosses, type FixtureRequest, type FixtureRule } from '@core';
import { identity, setIdentity, setRealm } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- a router harness for the editors' leave guards, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- the router's type, for the blocker counter below
import type * as RouterMod from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentsView, type AgentsViewProps } from './AgentsView';
import { routes } from '../routes';
import { sourceRoutes } from './sourceApi';
import { toolsRoutes } from './toolsApi';
import { toolsRules, toolsSeed } from './toolsFixtures';
import agentStrings from './strings.en.json';
import src from './Source.strings.en.json';
import strings from './Tools.strings.en.json';
import toolNames from './toolNames.strings.en.json';

// The route guard's held navigation: each blocked one's reset/proceed, counted when called (Stay must let it go with reset).
const NAV = vi.hoisted(() => ({ resets: 0, proceeds: 0 }));
vi.mock('@tanstack/react-router', async (orig) => {
  const real = await orig<typeof RouterMod>();
  const wrapped = new WeakMap<() => void, () => void>();
  const count = (f: (() => void) | undefined, key: 'resets' | 'proceeds') => {
    if (!f) return f;
    let w = wrapped.get(f);
    if (!w) { w = () => { NAV[key] += 1; f(); }; wrapped.set(f, w); }
    return w;
  };
  return {
    ...real,
    useBlocker: ((o: Parameters<typeof real.useBlocker>[0]) => {
      const r = real.useBlocker(o) as { status: string; reset?: () => void; proceed?: () => void };
      return r.status === 'blocked' ? { ...r, reset: count(r.reset, 'resets'), proceed: count(r.proceed, 'proceeds') } : r;
    }) as typeof real.useBlocker,
  };
});

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const w = (k: keyof typeof strings, v: Record<string, string | number> = {}) => fill(strings[k], v);
const ws = (k: keyof typeof src, v: Record<string, string | number> = {}) => fill(src[k], v);

let sent: FixtureRequest[] = [];
// GET /tools fails while this is true (a catalogue read again after the ticks).
let catalogueFails = false;
// GET /agents fails while this is true (the list read again after edits).
let listFails = false;
// GET /agents answers something that is not a list while this is true (useAgents: failed, no rows).
let listMalformed = false;
// The next list reads leave helper out (`drop`) or answer an empty list (`empty`).
let listChange: 'drop' | 'empty' | null = null;
// GET /agents on this computer answers something that is not a list.
let malformedOn: string | null = null;
// GET /agents in this realm answers a list without helper.
let realmWithout: string | null = null;
const changes = () => sent.filter((r) => r.method !== 'GET');
const nameOf = (r: FixtureRequest) => decodeURIComponent(r.path.split('/')[2] ?? '');

// The agents' files: one revision per agent, which a tools save moves too (the tools line is in the file).
function files(): { rules: FixtureRule[]; bump: (name: string) => void } {
  const revs = new Map<string, number>();
  const rev = (n: string) => `r${revs.get(n) ?? 1}`;
  const bump = (n: string) => { revs.set(n, (revs.get(n) ?? 1) + 1); };
  const path = (n: string) => `/home/ada/.hoody/agents/${n}.md`;
  return {
    bump,
    rules: [
      reply(sourceRoutes.get, (r) => answers.ok({ path: path(nameOf(r)), content: `${nameOf(r)} file`, revision: rev(nameOf(r)) })),
      reply(sourceRoutes.put, (r) => {
        sent.push(r);
        const n = nameOf(r);
        if ((r.body as { expected_revision?: string }).expected_revision !== rev(n)) {
          return { status: 409, body: { error: 'revision_conflict', details: { current_revision: rev(n) } } };
        }
        bump(n);
        return answers.ok({ path: path(n), revision: rev(n) });
      }),
      reply(sourceRoutes.remove, (r) => {
        sent.push(r);
        return answers.ok({ output: 'deleted', is_error: false });
      }),
    ],
  };
}

let setProps: (p: AgentsViewProps) => void = () => {};
// The harness router, for a path change (the route's LeaveGuard).
let navigate: (to: string) => Promise<void> = async () => {};
let pathname = () => '';
function Page({ first }: { first: AgentsViewProps }) {
  const [p, set] = useState(first);
  setProps = set;
  return <AgentsView {...p} />;
}

async function show(first: AgentsViewProps = {}) {
  sent = [];
  catalogueFails = false;
  listFails = false;
  listMalformed = false;
  listChange = null;
  malformedOn = null;
  realmWithout = null;
  const f = files();
  bootFixtureCore({
    rules: [
      ...f.rules,
      reply(toolsRoutes.catalogue, () => answers.refused(500, 'internal_error'), { when: () => catalogueFails }),
      reply(routes.agents, () => answers.ok({ nope: true }), { when: (r) => listMalformed || (malformedOn !== null && r.target?.container.id === malformedOn) }),
      reply(routes.agents, () => answers.ok({ items: [{ name: 'general', provenance: 'user', tools: ['read_file'] }], meta: { total: 1 } }), { when: () => realmWithout !== null && realmsView().selected === realmWithout }),
      ...toolsRules({
        seed: toolsSeed(),
        listFails: () => listFails,
        beforeList: (st) => {
          if (listChange === 'empty') st.splice(0);
          else if (listChange === 'drop' && st.some((a) => a.name === 'helper')) st.splice(st.findIndex((a) => a.name === 'helper'), 1);
        },
        onSend: (r) => {
          if (r.method === 'GET') return;
          sent.push(r);
          f.bump(nameOf(r));
        },
      }),
    ],
  });
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Page first={first} /> }), history: createMemoryHistory({ initialEntries: ['/ai/agents'] }) });
  navigate = (to) => router.navigate({ to: to as never });
  pathname = () => router.state.location.pathname;
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
const rerender = async (p: AgentsViewProps) => { await act(async () => { setProps(p); }); };

// A row's name carries its description too, so the agent is chosen by its own name cell (exact text).
const pick = async (name: string) => {
  const index = await screen.findByRole('table', { name: agentStrings['list.label'] });
  await userEvent.click(await within(index).findByText(name, { selector: 'bdi' }));
};
// Each tools group is a fold, open until the person closes it; a box is reached by pressing every closed group's title first.
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const groupTitle = new RegExp(`^(${(['group.coding', 'group.agents', 'group.web', 'group.todos', 'group.automation', 'group.memory', 'group.logs', 'group.fleet', 'group.more', 'group.other'] as const).map((g) => esc(w(g))).join('|')}) · `);
const openGroups = () => { for (const b of screen.queryAllByRole('button', { name: groupTitle, expanded: false })) fireEvent.click(b); };
/** A tool's English name, the name its box has (an id the table does not know shows as itself). */
const toolName = (tool: string): string => (toolNames as Record<string, string>)[`name.${tool}`] ?? tool;
const box = (tool: string) => { openGroups(); return screen.getByRole('checkbox', { name: toolName(tool) }); };
const ready = async (tool: string, on: boolean) => { await waitFor(() => (on ? expect(box(tool)).toBeChecked() : expect(box(tool)).not.toBeChecked())); };
// The file editor sits folded under the settings rows (AgentSource `folded`): it is mounted, so the view's tests reach it as is.
const editorOf = (name: string) => screen.queryByRole('textbox', { name: ws('label', { name }), hidden: true }) as HTMLTextAreaElement | null;
const fileLoaded = async (name: string) => { await waitFor(() => expect(editorOf(name)).toBeTruthy()); };
const dialogs = () => [...screen.queryAllByRole('alertdialog'), ...screen.queryAllByRole('dialog')];
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
});

describe('the tools on the agent page', () => {
  it('choosing an agent shows its tools (groups with counts) between the overview and the file', async () => {
    await show();
    await pick('helper');
    const tools = await screen.findByRole('heading', { name: strings.title });
    await ready('read_file', true);
    // Each group's fold title carries its on/total count.
    expect(screen.getAllByRole('button', { name: new RegExp(`^${esc(w('group.title', { group: w('group.coding'), count: w('group.count', { on: 2, total: 5 }) }))}`) })).toHaveLength(1);
    // Nothing ticked differently yet: no save bar (it shows only while ticks are unsaved).
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
    await fileLoaded('helper');
    const overview = screen.getByRole('article', { name: /helper/ });
    const file = editorOf('helper')!;
    expect(overview.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a product-owned agent shows its tools read-only: the overview\'s owned note (the tools say it no second time), no Save', async () => {
    await show();
    await pick('bot');
    expect(await screen.findByText(agentStrings['ov.owned'])).toBeTruthy();
    expect(screen.queryByText('Hoody sets these tools.')).toBeNull();
    await ready('bash', true);
    expect(box('bash')).toBeDisabled();
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
  });

  it('Save sends one setAgentTools with the whole list (no toggle) and the overview follows the list read again', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await userEvent.click(box('bash'));
    // The save bar sits in the page's sticky footer, outside the tools section.
    const save = await screen.findByRole('button', { name: w('save.list') });
    expect(screen.getByRole('heading', { name: strings.title }).closest('section')!.contains(save)).toBe(false);
    await userEvent.click(save);
    await waitFor(() => expect(changes()).toHaveLength(1));
    expect(changes()[0]!.method).toBe('PATCH');
    expect(changes()[0]!.path).toBe('/agents/helper/tools');
    expect(changes()[0]!.body).toEqual({ tools: ['read_file'] });
    const overview = screen.getByRole('article', { name: /helper/ });
    await waitFor(() => expect(within(overview).getByText(fill(agentStrings['tools.count_one'], { count: 1 }))).toBeTruthy());
  });

  it('strict with nothing ticked: the button says Save: no tools and the body carries none: true', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await userEvent.click(box('read_file'));
    await userEvent.click(box('bash'));
    await userEvent.click(screen.getByRole('button', { name: w('save.none') }));
    await waitFor(() => expect(changes()).toHaveLength(1));
    expect(changes()[0]!.body).toEqual({ tools: [], none: true });
    const overview = screen.getByRole('article', { name: /helper/ });
    await waitFor(() => expect(within(overview).getByText(agentStrings['tools.none'])).toBeTruthy());
  });

  it('another agent gets a fresh editor, and a delete under the same name (the host stays) gives the tools a fresh one too', async () => {
    const onSelect = vi.fn();
    const onDeleted = vi.fn();
    await show({ selected: 'helper', onSelect, onDeleted });
    await ready('bash', true);
    await userEvent.click(box('bash'));
    expect(box('bash')).not.toBeChecked();
    await rerender({ selected: 'loose', onSelect, onDeleted });
    await ready('grep', true);
    await rerender({ selected: 'helper', onSelect, onDeleted });
    await ready('bash', true);
    await userEvent.click(box('bash'));
    await fileLoaded('helper');
    await userEvent.click(screen.getByRole('button', { name: ws('danger.delete') }));
    await userEvent.type(within(screen.getByRole('alertdialog')).getByRole('textbox'), 'helper');
    await userEvent.click(screen.getByRole('button', { name: ws('danger.delete.confirm') }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    await ready('bash', true);
    expect(screen.queryByRole('button', { name: w('save.list') })).toBeNull();
  });

  it("the changed chat's Reset to shipped moves focus to the agent's file", async () => {
    await show();
    await pick('chat');
    await fileLoaded('chat');
    const tools = (await screen.findByRole('heading', { name: strings.title })).closest('section')!;
    await userEvent.click(await within(tools).findByRole('button', { name: w('chat.reset') }));
    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).contains(editorOf('chat'))).toBe(true);
  });
});

describe('closing the open agent asks exactly one leave question', () => {
  const back = () => screen.getByRole('button', { name: agentStrings.title });
  const hideList = async () => { await userEvent.click(screen.getByRole('button', { name: /hide list/i })); };
  const closeBy = {
    'the phone Back button': async () => { await userEvent.click(back()); },
    'Escape (list hidden)': async () => {
      await hideList();
      await act(async () => { fireEvent.keyDown(screen.getByRole('heading', { name: 'helper' }), { key: 'Escape' }); });
    },
  };
  for (const [how, close] of Object.entries(closeBy)) {
    it(`${how} with unsaved ticks: one question; Stay keeps the agent and ticks, Leave closes it`, async () => {
      await show();
      await pick('helper');
      await ready('bash', true);
      await userEvent.click(box('bash'));
      await close();
      await settle();
      expect(dialogs()).toHaveLength(1);
      expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
      await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
      await settle();
      expect(dialogs()).toHaveLength(0);
      expect(box('bash')).not.toBeChecked();
      expect(screen.getByRole('article', { name: /helper/ })).toBeTruthy();
      await userEvent.click(back());
      await settle();
      expect(dialogs()).toHaveLength(1);
      await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: w('leave.confirm') }));
      await settle();
      expect(dialogs()).toHaveLength(0);
      expect(screen.queryByRole('article', { name: /helper/ })).toBeNull();
    });

    it(`${how} with a file draft and unsaved ticks: still one question (the file's, naming the ticks)`, async () => {
      await show();
      await pick('helper');
      await ready('bash', true);
      await fileLoaded('helper');
      await userEvent.click(box('bash'));
      await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
      await close();
      await settle();
      expect(dialogs()).toHaveLength(1);
      expect(within(dialogs()[0]!).getByText(fill(agentStrings['leave.alsoTicks'], { name: 'helper' }), { exact: false })).toBeTruthy();
    });

    it(`${how} with nothing unsaved: closes at once, no question`, async () => {
      await show();
      await pick('helper');
      await ready('bash', true);
      await close();
      await settle();
      expect(dialogs()).toHaveLength(0);
      expect(screen.queryByRole('article', { name: /helper/ })).toBeNull();
    });
  }

  it('a host-owned choice: the phone Back button moves the route and the route guard asks once', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await act(async () => { await navigate('/ai/agents/helper'); });
    await ready('bash', true);
    await userEvent.click(box('bash'));
    await userEvent.click(back());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(dialogs()).toHaveLength(1);
    expect(pathname()).toBe('/ai/agents/helper');
    // Leave goes through the one held navigation: the route moves and no second question follows it.
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.leave') }));
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(dialogs()).toHaveLength(0);
    expect(pathname()).not.toBe('/ai/agents/helper');
  });
});

describe('changing the agent the view keeps itself', () => {
  it('unsaved ticks ask first: Stay keeps the ticks and the agent, Leave changes', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await userEvent.click(box('bash'));
    await pick('loose');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(box('bash')).not.toBeChecked();
    expect(screen.getByRole('article', { name: /helper/ })).toBeTruthy();
    await pick('loose');
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: w('leave.confirm') }));
    await waitFor(() => expect(screen.getByRole('article', { name: /loose/ })).toBeTruthy());
    expect(changes()).toHaveLength(0);
  });

  it('a catalogue read that fails after the ticks keeps the leave check: choosing another agent still asks', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await userEvent.click(box('bash'));
    // The page's sticky footer holds the save bar while the ticks are unsaved.
    await waitFor(() => expect(document.querySelector('[class*="detailFooter"]')).not.toBeNull());
    catalogueFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(w('catalogueFailed'))).toBeTruthy();
    // No bar shows over the error, so the page drops its footer (no empty sticky strip).
    await waitFor(() => expect(document.querySelector('[class*="detailFooter"]')).toBeNull());
    await pick('loose');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    await settle();
    expect(screen.getByRole('article', { name: /helper/ })).toBeTruthy();
    catalogueFails = false;
    await act(async () => { await queryClient.refetchQueries(); });
    await waitFor(() => expect(box('bash')).not.toBeChecked());
  });

  it('a host-owned choice: a path change after a failed catalogue read still asks (the route guard stays up)', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await ready('bash', true);
    await userEvent.click(box('bash'));
    catalogueFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(w('catalogueFailed'))).toBeTruthy();
    await act(async () => { void navigate('/ai/agents/loose'); await new Promise((r) => setTimeout(r, 10)); });
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    await settle();
    expect(pathname()).toBe('/ai/agents');
  });

  it('a failed agents-list read after edits keeps the editors: ticks and the file draft stay, and choosing another agent asks', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await fileLoaded('helper');
    await userEvent.click(box('bash'));
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    listFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.stale'])).toBeTruthy();
    expect(box('bash')).not.toBeChecked();
    expect(editorOf('helper')!.value).toBe('mine');
    await pick('loose');
    await settle();
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.stay') }));
    await settle();
    expect(box('bash')).not.toBeChecked();
    expect(editorOf('helper')!.value).toBe('mine');
  });

  it('a host-owned choice: a path change after a failed agents-list read still asks (the editors and their guards stay)', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await ready('bash', true);
    await userEvent.click(box('bash'));
    listFails = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.stale'])).toBeTruthy();
    await act(async () => { void navigate('/ai/agents/loose'); await new Promise((r) => setTimeout(r, 10)); });
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    await settle();
    expect(pathname()).toBe('/ai/agents');
    expect(box('bash')).not.toBeChecked();
  });

  it('an answer that is not a list after edits keeps the last rows and the editors: the draft and ticks stay, leaving asks', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await fileLoaded('helper');
    await userEvent.click(box('bash'));
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    listMalformed = true;
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.stale'])).toBeTruthy();
    expect(screen.getByRole('article', { name: /helper/ })).toBeTruthy();
    expect(editorOf('helper')!.value).toBe('mine');
    await pick('loose');
    await settle();
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.stay') }));
    await settle();
    listMalformed = false;
    await act(async () => { await queryClient.refetchQueries(); });
    await waitFor(() => expect(box('bash')).not.toBeChecked());
    expect(editorOf('helper')!.value).toBe('mine');
    expect(screen.queryByText(agentStrings['state.stale'])).toBeNull();
  });

  it('ticks and a file draft both unsaved: it asks once (the file dialog), and Leave drops both', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await fileLoaded('helper');
    await userEvent.click(box('bash'));
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    await pick('loose');
    await settle();
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(`${ws('leave.body', { name: 'helper' })} ${fill(agentStrings['leave.alsoTicks'], { name: 'helper' })}`)).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.stay') }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(box('bash')).not.toBeChecked();
    expect(editorOf('helper')!.value).toBe('mine');
    await pick('loose');
    await settle();
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.leave') }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('article', { name: /loose/ })).toBeTruthy());
    expect(changes()).toHaveLength(0);
  });
});

describe('the chosen agent leaves the list', () => {
  it('a file draft survives its agent missing from a list read: the editors stay on its last row, and leaving asks', async () => {
    await show();
    await pick('helper');
    await fileLoaded('helper');
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    listChange = 'drop';
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.goneKept'])).toBeTruthy();
    expect(screen.getByRole('article', { name: /helper/ })).toBeTruthy();
    expect(editorOf('helper')!.value).toBe('mine');
    await pick('loose');
    await settle();
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(ws('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.leave') }));
    await waitFor(() => expect(screen.getByRole('article', { name: /loose/ })).toBeTruthy());
    expect(screen.queryByText(agentStrings['state.goneKept'])).toBeNull();
  });

  it('unsaved ticks alone keep it too: the ticks stay on the last row', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await userEvent.click(box('bash'));
    listChange = 'drop';
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.goneKept'])).toBeTruthy();
    expect(box('bash')).not.toBeChecked();
  });

  it('an empty list read under a held file draft keeps the editors; a path change asks', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await fileLoaded('helper');
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    listChange = 'empty';
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.goneKept'])).toBeTruthy();
    // The list itself is empty and says so beside the kept editors (the band names why the agent is still open).
    expect(screen.getByText(agentStrings['state.empty'])).toBeTruthy();
    expect(editorOf('helper')!.value).toBe('mine');
    await act(async () => { void navigate('/ai/agents/loose'); await new Promise((r) => setTimeout(r, 10)); });
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.stay') }));
    await settle();
    expect(pathname()).toBe('/ai/agents');
    expect(editorOf('helper')!.value).toBe('mine');
  });

  it('holding nothing, a missing agent says it is gone and an empty list says no agents (as before)', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await fileLoaded('helper');
    listChange = 'drop';
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(fill(agentStrings['state.gone'], { name: 'helper' }))).toBeTruthy();
    expect(editorOf('helper')).toBeNull();
    listChange = 'empty';
    await act(async () => { await queryClient.refetchQueries(); });
    expect(await screen.findByText(agentStrings['state.empty'])).toBeTruthy();
  });
});

describe('the two editors on one page', () => {
  it('a tools save under an open file draft: the file save is refused with Compare, nothing written over', async () => {
    await show();
    await pick('helper');
    await ready('bash', true);
    await fileLoaded('helper');
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    await userEvent.click(box('bash'));
    await userEvent.click(screen.getByRole('button', { name: w('save.list') }));
    await waitFor(() => expect(changes()).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: ws('save') }));
    await waitFor(() => expect(screen.getByText(ws('conflict'))).toBeTruthy());
    expect(screen.getByRole('button', { name: ws('conflict.compare') })).toBeTruthy();
    expect(changes().map((r) => `${r.method} ${r.path}`)).toEqual(['PATCH /agents/helper/tools', 'PUT /agents/helper/source']);
    expect(editorOf('helper')!.value).toBe('mine');
  });
});

describe('what the view keeps belongs to one read (computer, realm, account, generation)', () => {
  const computerOf = (name: string) => fixtureWorld.computers.find((c) => c.name === name)!;
  const toComputer = async (name: string) => { await act(async () => { chooseComputer(computerOf(name)); }); await settle(); };
  const index = () => screen.queryByRole('table', { name: agentStrings['list.label'] });

  for (const how of ['failed', 'malformed'] as const) {
    it(`another computer whose list read is cached ${how}: none of the first computer's rows show, only its error`, async () => {
      await show();
      await pick('helper');
      await ready('read_file', true);
      if (how === 'failed') listFails = true;
      else malformedOn = computerOf('borealis').id;
      await toComputer('borealis');
      await screen.findByText(agentStrings['state.failed']);
      await toComputer('atlas');
      await waitFor(() => expect(index()).toBeTruthy());
      // A cached failure is read again on the way in (TanStack shows it as loading first); a cached answer that is not a list
      // is shown at once. Either way the first computer's rows never show.
      await act(async () => { chooseComputer(computerOf('borealis')); });
      // Loading again, the table (if drawn) holds none of the first computer's rows.
      expect(screen.queryAllByRole('row', { name: /\bhelper\b/ })).toHaveLength(0);
      expect(await screen.findByText(agentStrings['state.failed'])).toBeTruthy();
      expect(index()).toBeNull();
      expect(screen.queryByText(agentStrings['state.stale'])).toBeNull();
      expect(screen.queryByRole('heading', { name: strings.title })).toBeNull();
    });
  }

  it('a realm change on the same computer while the file holds a draft: the switch names it, and the editor never stays on the new realm', async () => {
    const A = realmsView().selected;
    const other = fixtureWorld.realms.map((r) => r.id).find((id) => id !== A)!;
    const loss = fill(agentStrings['held.loss'], { name: 'helper' });
    await show();
    realmWithout = other;
    // The other realm's list (without helper) is read once, so going back to it answers from that read at once.
    await act(async () => { setRealm(other); });
    await waitFor(() => expect(index()).toBeTruthy());
    await act(async () => { setRealm(A); });
    await pick('helper');
    await fileLoaded('helper');
    expect(switchLosses()).not.toContain(loss);
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    expect(switchLosses()).toContain(loss);
    await act(async () => { setRealm(other); });
    await settle();
    expect(editorOf('helper')).toBeNull();
    expect(screen.queryByText('mine')).toBeNull();
    expect(screen.queryByText(agentStrings['state.goneKept'])).toBeNull();
    expect(screen.getByText(fill(agentStrings['state.gone'], { name: 'helper' }))).toBeTruthy();
    expect(switchLosses()).not.toContain(loss);
  });

  it('another account without a generation bump, whose cached list has the same agent on the same computer and realm: the old draft and ticks are never shown or offered for saving; the switch named them first', async () => {
    const loss = fill(agentStrings['held.loss'], { name: 'helper' });
    await show();
    const before = identity();
    const other = { id: 'u-other-account', banned: false };
    await pick('helper');
    await ready('read_file', true);
    await fileLoaded('helper');
    // The other account's list as core would cache it (the same answer under its key): shown at once, nothing read.
    const listQ = queryClient.getQueryCache().findAll({ predicate: (q) => q.queryKey[0] === 'hub' && q.queryKey[6] === 'list' })
      .find((q) => (q.state.data as { items?: unknown[] } | undefined)?.items !== undefined)!;
    queryClient.setQueryData([listQ.queryKey[0], other.id, ...listQ.queryKey.slice(2)], listQ.state.data);
    await userEvent.click(box('read_file'));
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    expect(switchLosses()).toContain(loss);
    try {
      await act(async () => { setIdentity(other); });
      await settle();
      expect(index()).toBeTruthy();
      expect(screen.queryByDisplayValue('mine')).toBeNull();
      expect(editorOf('helper')?.value ?? '').not.toBe('mine');
      const save = screen.queryByRole('button', { name: w('save.list') });
      if (save) expect(save).toBeDisabled();
      // The ticks are the new editor's (read again for this account), never the old draft's unticked read_file.
      openGroups();
      const tick = screen.queryByRole('checkbox', { name: toolName('read_file') });
      if (tick) expect(tick).toBeChecked();
      expect(switchLosses()).not.toContain(loss);
      expect(changes()).toEqual([]);
    } finally {
      await act(async () => { setIdentity(before); });
    }
  });

});

describe('a path change asks once for both editors (the view owns the route guard)', () => {
  const go = async (to: string) => { await act(async () => { void navigate(to); await new Promise((r) => setTimeout(r, 10)); }); await settle(); };
  const both = `${ws('leave.body', { name: 'helper' })} ${fill(agentStrings['leave.alsoTicks'], { name: 'helper' })}`;
  const dirtyBoth = async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await ready('bash', true);
    await fileLoaded('helper');
    await userEvent.click(box('bash'));
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
  };

  it('ticks and a file draft: one dialog naming both; Stay keeps both and the path, and the next path change asks again', async () => {
    await dirtyBoth();
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(both)).toBeTruthy();
    NAV.resets = 0;
    NAV.proceeds = 0;
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.stay') }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(pathname()).toBe('/ai/agents');
    // Stay lets the held navigation go (the blocker's reset), never leaves it pending.
    expect(NAV.resets).toBe(1);
    expect(NAV.proceeds).toBe(0);
    expect(box('bash')).not.toBeChecked();
    expect(editorOf('helper')!.value).toBe('mine');
    // Stay let the held navigation go: a later path change is held and asked about again (once), and its Leave goes THERE,
    // never to the path Stay refused.
    await go('/ai/agents/wide');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(both)).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.leave') }));
    await settle();
    await waitFor(() => expect(pathname()).toBe('/ai/agents/wide'));
    await new Promise((r) => setTimeout(r, 20));
    expect(pathname()).toBe('/ai/agents/wide');
    expect(dialogs()).toHaveLength(0);
  });

  it('ticks and a file draft: Leave drops both at once and the path changes (no second dialog)', async () => {
    await dirtyBoth();
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(1);
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: ws('leave.leave') }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    await waitFor(() => expect(pathname()).toBe('/ai/agents/loose'));
    expect(changes()).toHaveLength(0);
  });

  it('ticks only: one dialog, the tools\' own words; Stay keeps them and the path', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await ready('bash', true);
    await fileLoaded('helper');
    await userEvent.click(box('bash'));
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(w('leave.body', { name: 'helper' }))).toBeTruthy();
    await userEvent.click(within(dialogs()[0]!).getByRole('button', { name: /cancel|stay/i }));
    await settle();
    expect(pathname()).toBe('/ai/agents');
    expect(box('bash')).not.toBeChecked();
    await go('/ai/agents/wide');
    expect(dialogs()).toHaveLength(1);
  });

  it('a file draft only: one dialog, the file\'s words without the ticks sentence', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await fileLoaded('helper');
    await act(async () => { fireEvent.change(editorOf('helper')!, { target: { value: 'mine' } }); });
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(1);
    expect(within(dialogs()[0]!).getByText(ws('leave.body', { name: 'helper' }))).toBeTruthy();
  });

  it('nothing held: a path change passes without a dialog', async () => {
    await show({ selected: 'helper', onSelect: vi.fn() });
    await fileLoaded('helper');
    await go('/ai/agents/loose');
    expect(dialogs()).toHaveLength(0);
    expect(pathname()).toBe('/ai/agents/loose');
  });
});
