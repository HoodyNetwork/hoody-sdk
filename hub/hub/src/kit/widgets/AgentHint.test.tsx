import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AskModule from '../ask';
import type * as CoreModule from '@core';
// The two switches the Hoody Agent action reads: Ask on in this Hub (kit/ask askOn), and the Hub not shown inside
// another page (core isFramed). Both stay the real ones unless a test flips them here.
const sw = vi.hoisted(() => ({ askOff: false, framed: false }));
vi.mock('../ask', async (orig) => {
  const real = await orig<typeof AskModule>();
  return { ...real, askOn: () => !sw.askOff && real.askOn() };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreModule>();
  return { ...real, isFramed: () => sw.framed || real.isFramed() };
});
import { act, fireEvent, render, screen, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useSyncExternalStore, type ReactElement } from 'react';
import { dropAskDraft, useAskDock, type AskDock } from '../ask';
import { capture } from '@core';
import { makeT } from '../strings';
import { AgentHint } from './AgentHint';
import { AGENT_CAN_EVERYWHERE, AGENT_HINT_CAN, AGENT_HINT_PAGES, AGENT_HINT_STARTERS, agentHintScope, agentHintTarget, hideHint, mainPrompt, readAgentKind, readHiddenHints, starterPrompt, type AgentHintFacts, type AgentHintPage } from './agentHints';
import strings from './AgentHint.strings.en.json';
import overlay from '../overlays/strings.en.json';

beforeEach(() => {
  window.localStorage.clear();
  sw.askOff = false;
  sw.framed = false;
});

const S = strings as Record<string, string>;
const PERSONAL = { id: 'f1f1f1f1f1f1f1f1f1f1f1f1', name: 'Personal' };
/** Realm Personal, computer atlas in it: what a computer page passes when one is shown. */
const F: AgentHintFacts = { realm: PERSONAL, computer: { computer: { id: 'c0a7150000000000000000a1', name: 'atlas' }, realm: PERSONAL } };
afterEach(() => {
  act(() => dropAskDraft());
  vi.restoreAllMocks();
});
const tt = makeT(strings);
/** The prompts a page shows for these facts: the main one and each starter, for a remote agent or the Hoody Agent. */
const promptsOf = (page: AgentHintPage, facts: AgentHintFacts, to: 'remote' | 'hoody' = 'remote') => {
  const target = agentHintTarget(tt, agentHintScope(page, facts));
  return { main: mainPrompt(tt, page, target, to), starters: AGENT_HINT_STARTERS[page].map((id) => ({ id, text: starterPrompt(tt, page, id, target, to) })) };
};
/** The prompt shown with this exact text (lines kept: the element shows them as written). */
const shown = (root: HTMLElement, text: string) => within(root).getByText((_, el) => !!el && el.hasAttribute('data-prompt') && el.textContent === text);
/** The dock as kit/ask holds it (the Ask panel reads the same). */
let dock: AskDock | null = null;
function DockProbe() {
  dock = useAskDock();
  return null;
}

/** Mounts the hint under its own router, as on every page (its links read the router). `rerender` swaps the element in
 *  place, so state the hint holds across a prop change stays mounted. */
async function mount(first: ReactElement): Promise<{ rerender: (ui: ReactElement) => Promise<void>; unmount: () => void; where: () => string }> {
  let current = first;
  const seen = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    seen.add(fn);
    return () => void seen.delete(fn);
  };
  const Host = () => useSyncExternalStore(subscribe, () => current);
  const router = createRouter({ routeTree: createRootRoute({ component: Host }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  let r: RenderResult | undefined;
  await act(async () => {
    r = render(<RouterProvider router={router} />);
    await router.load();
  });
  return {
    rerender: async (ui) => {
      current = ui;
      await act(async () => seen.forEach((fn) => fn()));
    },
    unmount: () => r?.unmount(),
    where: () => router.state.location.href,
  };
}

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings['hint.label'] }));
  return screen.findByRole('dialog', { name: strings['hint.title'] });
};

const tab = async (dialog: HTMLElement, key: 'prompts' | 'setup' | 'access' | 'can') => {
  await userEvent.click(within(dialog).getByRole('tab', { name: strings[`hint.tab.${key}`] }));
  return within(dialog).getByRole('tabpanel');
};

function clipboard(): string[] {
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (x: string) => (written.push(x), Promise.resolve()) } });
  return written;
}

describe('AgentHint: the surface', () => {
  it('opens a side drawer named "Use with your agent", with the page\'s own lead and four tabs, Prompts first', async () => {
    await mount(<AgentHint page="scripts" facts={F} />);
    const dialog = await open();
    expect(dialog).toHaveAttribute('data-hub-overlay', 'agent-hint');
    expect(dialog).toHaveTextContent(strings['hint.scripts.what']);
    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([strings['hint.tab.prompts'], strings['hint.tab.setup'], strings['hint.tab.access'], strings['hint.tab.can']]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(dialog).not.toHaveTextContent('{{');
  });

  it('the tabs follow the kit keyboard model: arrows move between them', async () => {
    await mount(<AgentHint page="notes" facts={F} />);
    const dialog = await open();
    const first = within(dialog).getByRole('tab', { name: strings['hint.tab.prompts'] });
    act(() => first.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('tab', { name: strings['hint.tab.setup'] })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('npx skills add https://hoody.com/SKILLS/SKILL.md');
  });

  it('is a real button with its name, opened and closed from the keyboard, focus back on it', async () => {
    await mount(<AgentHint page="computers" facts={F} />);
    const button = screen.getByRole('button', { name: strings['hint.label'] });
    expect(button).toHaveAccessibleName(strings['hint.label']);
    expect(button).toHaveTextContent(strings['hint.label']);
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: strings['hint.title'] });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await vi.waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('keeps the Guide link in its footer, and one way to close (the drawer\'s own)', async () => {
    await mount(<AgentHint page="notes" facts={F} />);
    const dialog = await open();
    expect(within(dialog).getByRole('link', { name: strings['hint.guide'] })).toHaveAttribute('href', '/guide#skills');
    // The kit Drawer has one Close (× wide, back arrow on a phone); no footer Close beside it.
    const closes = within(dialog).getAllByRole('button', { name: overlay.close });
    expect(closes).toHaveLength(1);
    await userEvent.click(closes.at(-1)!);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('AgentHint: Prompts', () => {
  it('leads with the two ways in, then the main prompt as the hero: its title, the whole hand-off, Ask Hoody Agent primary and Copy', async () => {
    const written = clipboard();
    await mount(<AgentHint page="scripts" facts={F} />);
    const dialog = await open();
    expect(dialog).toHaveTextContent(strings['hint.prompts.hoody']);
    expect(dialog).toHaveTextContent(strings['hint.prompts.remote']);
    const hero = within(dialog).getByRole('group', { name: strings['hint.scripts.title.main'] });
    const want = promptsOf('scripts', F).main;
    expect(shown(hero, want)).toBeInTheDocument();
    expect(want).toContain('1. Ask me what the script should do');
    expect(want).not.toContain('Tokyo');
    const ask = within(hero).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.scripts.title.main'] }) });
    expect(ask).toHaveTextContent(strings['hint.ask']);
    expect(ask).toHaveAttribute('data-variant', 'primary');
    await act(async () => {
      fireEvent.click(within(hero).getByRole('button', { name: strings['hint.copyMain'] }));
    });
    expect(written).toEqual([want]);
    // One accent in the tab: the hero's Ask; the starters' are quiet.
    expect(within(dialog).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')).toEqual([ask]);
  });

  it('starters: each shown whole, Copy gives exactly what is shown, each with its own Ask Hoody Agent', async () => {
    const written = clipboard();
    await mount(<AgentHint page="scripts" facts={F} />);
    const dialog = await open();
    const list = within(dialog).getByRole('list', { name: strings['hint.prompts.list'] });
    const items = within(list).getAllByRole('listitem');
    const { starters } = promptsOf('scripts', F);
    expect(items).toHaveLength(starters.length);
    for (const [i, p] of starters.entries()) {
      const title = S[`hint.scripts.title.${p.id}`] as string;
      const item = items[i]!;
      expect(shown(item, p.text)).toBeInTheDocument();
      expect(within(item).getByRole('button', { name: tt('hint.askNamed', { title }) })).toBeEnabled();
      await act(async () => {
        fireEvent.click(within(item).getByRole('button', { name: tt('hint.copyPrompt', { title }) }));
      });
      expect(written.at(-1)).toBe(p.text);
    }
    expect(written).toHaveLength(starters.length);
  });

  it('Ask Hoody Agent puts the prompt (no skill line) in a new Ask conversation, never sent, and closes the drawer', async () => {
    render(<DockProbe />);
    await mount(<AgentHint page="programs" facts={F} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.programs.title.main'] }) }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: strings['hint.title'] })).not.toBeInTheDocument());
    expect(dock!.isOpen).toBe(true);
    const draft = dock!.draft!;
    expect(draft.text).toBe(promptsOf('programs', F, 'hoody').main);
    expect(draft.text).not.toContain('Hoody skill');
    expect(draft.text).toContain('- Computer: "atlas" (id c0a7150000000000000000a1)\n- Realm: "Personal" (id f1f1f1f1f1f1f1f1f1f1f1f1)');
    // A prefill, not a start: the person reads it and presses Send.
    expect(draft.start).toBeUndefined();
    expect(draft.onStart).toBeUndefined();
    expect(draft.source).toBe(strings['hint.programs.source']);
    // Bound to the computer it names, as that is the one the shell shows (the test world shows atlas).
    expect(capture().target?.container.id).toBe('c0a7150000000000000000a1');
    expect(draft.computer).toBe('c0a7150000000000000000a1');
  });

  it('a prompt naming another computer than the one shown is not bound to it (it would wait for that computer\'s panel)', async () => {
    render(<DockProbe />);
    const other: AgentHintFacts = { realm: PERSONAL, computer: { computer: { id: 'c0a7150000000000000000b2', name: 'borea' }, realm: PERSONAL } };
    await mount(<AgentHint page="scripts" facts={other} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.scripts.title.main'] }) }));
    await vi.waitFor(() => expect(dock!.draft?.text).toBe(promptsOf('scripts', other, 'hoody').main));
    expect(dock!.draft!.text).toContain('"borea" (id c0a7150000000000000000b2)');
    expect(dock!.draft!.computer).toBeUndefined();
  });

  it('a starter goes to the Hoody Agent the same way, its own words', async () => {
    render(<DockProbe />);
    await mount(<AgentHint page="logs" facts={F} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.logs.title.watch'] }) }));
    await vi.waitFor(() => expect(dock!.draft?.text).toBe(promptsOf('logs', F, 'hoody').starters.find((p) => p.id === 'watch')!.text));
    expect(dock!.draft!.start).toBeUndefined();
  });

  it('never takes the place of a question the Agent has not taken yet: that start stays, nothing is replaced', async () => {
    render(<DockProbe />);
    const told: string[] = [];
    // A start (another page's quick ask) still waiting for the panel.
    act(() => void dock!.open({ text: 'held question', start: true, onStart: (o) => told.push(o) }));
    expect(dock!.draft?.text).toBe('held question');
    await mount(<AgentHint page="notes" facts={F} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.notes.title.main'] }) }));
    expect(dock!.draft?.text).toBe('held question');
    expect(dock!.draft?.start).toBe(true);
    expect(told).toEqual([]);
  });

  it('the Hoody Agent action is off with its true reason when Ask is off, and inside another page', async () => {
    sw.askOff = true;
    const first = await mount(<AgentHint page="scripts" facts={F} />);
    let dialog = await open();
    for (const b of within(dialog).getAllByRole('button', { name: /^Ask Hoody Agent: / })) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(strings['hint.ask.off']);
    }
    // Copy still works.
    expect(within(dialog).getByRole('button', { name: strings['hint.copyMain'] })).toBeEnabled();
    first.unmount();
    sw.askOff = false;
    sw.framed = true;
    await mount(<AgentHint page="scripts" facts={F} />);
    dialog = await open();
    const b = within(dialog).getByRole('button', { name: tt('hint.askNamed', { title: strings['hint.scripts.title.main'] }) });
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(strings['hint.ask.framed']);
  });

  it('says what the prompts act on: the computer and realm by name, their ids masked, and why', async () => {
    await mount(<AgentHint page="notes" facts={F} />);
    const dialog = await open();
    const acts = within(dialog).getByRole('group', { name: strings['hint.actsOn'] });
    expect(acts).toHaveTextContent('atlas');
    expect(acts).toHaveTextContent('Personal');
    expect(acts).toHaveTextContent('c0a7…00a1');
    expect(dialog).toHaveTextContent(strings['hint.why.computer']);
  });

  it('no computer chosen: says so plainly, links to pick one, and every prompt asks which one first', async () => {
    const facts: AgentHintFacts = { realm: PERSONAL, computer: null };
    await mount(<AgentHint page="programs" facts={facts} />);
    const dialog = await open();
    expect(dialog).toHaveTextContent(strings['hint.pick.note']);
    expect(within(dialog).getByRole('group', { name: strings['hint.actsOn'] })).toHaveTextContent(strings['hint.fact.noComputer']);
    expect(within(dialog).getByRole('link', { name: strings['hint.pick.link'] })).toHaveAttribute('href', '/computers');
    const { main, starters } = promptsOf('programs', facts);
    for (const text of [main, ...starters.map((p) => p.text)]) {
      expect(text).toContain('not chosen yet (ask me which one first)');
      expect(shown(dialog, text)).toBeInTheDocument();
    }
  });

  it('keys in a realm: the realm is named, the keys are the ones that can act there; under All realms, every key', async () => {
    const { rerender } = await mount(<AgentHint page="keys" facts={F} />);
    let dialog = await open();
    let acts = within(dialog).getByRole('group', { name: strings['hint.actsOn'] });
    expect(acts).toHaveTextContent('Personal');
    expect(acts).toHaveTextContent(strings['hint.fact.keysRealm']);
    expect(dialog).toHaveTextContent(strings['hint.why.keysRealm']);
    expect(shown(dialog, promptsOf('keys', F).main)).toHaveTextContent('can act in this realm when its realm_ids include f1f1f1f1f1f1f1f1f1f1f1f1');
    expect(dialog).not.toHaveTextContent('whole account,');
    await userEvent.keyboard('{Escape}');
    await rerender(<AgentHint page="keys" facts={{ realm: null, computer: null }} />);
    dialog = await open();
    acts = within(dialog).getByRole('group', { name: strings['hint.actsOn'] });
    expect(acts).toHaveTextContent(strings['hint.fact.allRealms']);
    expect(acts).toHaveTextContent(strings['hint.fact.keysAll']);
    expect(shown(dialog, promptsOf('keys', { realm: null, computer: null }).main)).toHaveTextContent('- Realm: all realms');
  });

  it('follows the facts while open: a realm switch updates the scope and every prompt', async () => {
    const { rerender } = await mount(<AgentHint page="vault" facts={{ realm: PERSONAL, computer: null }} />);
    const dialog = await open();
    expect(shown(dialog, promptsOf('vault', { realm: PERSONAL, computer: null }).main)).toBeInTheDocument();
    await rerender(<AgentHint page="vault" facts={{ realm: null, computer: null }} />);
    expect(shown(dialog, promptsOf('vault', { realm: null, computer: null }).main)).toHaveTextContent('the Global vault (it belongs to no realm)');
    expect(within(dialog).getByRole('group', { name: strings['hint.actsOn'] })).toHaveTextContent(strings['hint.fact.globalVault']);
    expect(dialog).toHaveTextContent(strings['hint.why.globalVault']);
  });

  it('the prompt text is English in body type, never a code block', async () => {
    await mount(<AgentHint page="notes" facts={F} />);
    const dialog = await open();
    const prompt = shown(dialog, promptsOf('notes', F).main);
    expect(prompt.closest('pre, code')).toBeNull();
  });
});

describe('AgentHint: Set up', () => {
  it('coding agents first: both skill commands, each copied whole', async () => {
    const written = clipboard();
    await mount(<AgentHint page="notes" facts={F} />);
    const panel = await tab(await open(), 'setup');
    expect(within(panel).getByRole('radio', { name: strings['hint.setup.kind.coding'] })).toBeChecked();
    for (const line of ['npx skills add https://hoody.com/SKILLS/SKILL.md', 'npx skills add HoodyNetwork/hoody-sdk']) expect(panel).toHaveTextContent(line);
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: `Copy ${strings['hint.setup.cap.sdkSkill']}` }));
    });
    expect(written).toEqual(['npx skills add HoodyNetwork/hoody-sdk']);
    expect(within(panel).getByRole('link', { name: strings['hint.setup.more'] })).toHaveAttribute('href', '/guide#connect');
  });

  it('the agent picker shows that agent\'s way in and is remembered in this browser', async () => {
    const { unmount } = await mount(<AgentHint page="scripts" facts={F} />);
    let panel = await tab(await open(), 'setup');
    await userEvent.click(within(panel).getByRole('radio', { name: strings['hint.setup.kind.cli'] }));
    expect(panel).toHaveTextContent('curl -fsSL https://install.hoody.com | sh');
    expect(panel).toHaveTextContent('hoody computers list');
    expect(readAgentKind()).toBe('cli');
    await userEvent.click(within(panel).getByRole('radio', { name: strings['hint.setup.kind.chat'] }));
    expect(panel).toHaveTextContent('@https://hoody.com Connect to Hoody');
    unmount();
    await mount(<AgentHint page="bots" facts={F} />);
    panel = await tab(await open(), 'setup');
    expect(within(panel).getByRole('radio', { name: strings['hint.setup.kind.chat'] })).toBeChecked();
  });
});

describe('AgentHint: Access', () => {
  it('explains the two ways in for this page\'s reach and, in a realm, offers a key limited to it, showing no secret', async () => {
    const first = await mount(<AgentHint page="keys" facts={F} />);
    let panel = await tab(await open(), 'access');
    expect(panel).toHaveTextContent(strings['hint.access.lead.account']);
    expect(panel).toHaveTextContent(strings['hint.access.browser']);
    expect(panel).toHaveTextContent(strings['hint.access.key']);
    expect(panel).toHaveTextContent(tt('hint.access.realm', { realm: 'Personal' }));
    // The New key form opens for the shell's realm, that realm chosen (pages/keys newForm).
    expect(within(panel).getByRole('link', { name: tt('hint.access.newKeyRealm', { realm: 'Personal' }) })).toHaveAttribute('href', '/keys?new=1');
    expect(within(panel).getByRole('link', { name: strings['hint.access.guide'] })).toHaveAttribute('href', '/guide#keys');
    expect(panel.textContent).not.toMatch(/hdy_/);
    first.unmount();
    const second = await mount(<AgentHint page="bots" facts={{ realm: null, computer: null }} />);
    panel = await tab(await open(), 'access');
    expect(panel).toHaveTextContent(strings['hint.access.lead.computer']);
    expect(panel).toHaveTextContent(strings['hint.access.allRealms']);
    expect(within(panel).getByRole('link', { name: strings['hint.access.newKey'] })).toHaveAttribute('href', '/keys?new=1');
    second.unmount();
    await mount(<AgentHint page="vault" facts={{ realm: { id: PERSONAL.id, name: null }, computer: null }} />);
    panel = await tab(await open(), 'access');
    expect(within(panel).getByRole('link', { name: strings['hint.access.newKeyRealmId'] })).toBeInTheDocument();
  });
});

describe('AgentHint: the API page', () => {
  it('has the same control as every page: its own lead, its hand-off prompt for the selected realm, and its three rows', async () => {
    const facts: AgentHintFacts = { realm: PERSONAL, computer: null };
    await mount(<AgentHint page="api" facts={facts} />);
    const dialog = await open();
    expect(dialog).toHaveTextContent(strings['hint.api.what']);
    expect(dialog).toHaveTextContent(strings['hint.api.title.main']);
    expect(shown(dialog, promptsOf('api', facts).main)).toHaveTextContent('- Computers: every computer in this realm');
    expect(dialog).not.toHaveTextContent('{{');
    const panel = await tab(dialog, 'can');
    const rows = within(within(panel).getByRole('list', { name: strings['hint.can.list'] })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([1, 2, 3].map((n) => S[`can.api.${n}`]));
  });
});

describe('AgentHint: What it can do', () => {
  it('lists what an agent can do with this page\'s things, one row each', async () => {
    for (const page of AGENT_HINT_PAGES) for (let n = 1; n <= AGENT_HINT_CAN[page]; n++) expect(S[`can.${page}.${n}`], `${page} ${n}`).toBeTruthy();
    expect(Object.keys(S).filter((k) => k.startsWith('can.')).length).toBe(AGENT_HINT_PAGES.reduce((a, p) => a + AGENT_HINT_CAN[p], 0));
    await mount(<AgentHint page="bots" facts={F} />);
    const panel = await tab(await open(), 'can');
    const rows = within(within(panel).getByRole('list', { name: strings['hint.can.list'] })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([1, 2, 3, 4].map((n) => S[`can.bots.${n}`]));
  });
});

describe('AgentHint: Can do, everywhere', () => {
  /** The shared rows as written, group by group. */
  const shared = AGENT_CAN_EVERYWHERE.map((g) => ({ title: S[`all.${g.id}.title`]!, rows: Array.from({ length: g.rows }, (_, i) => S[`all.${g.id}.${i + 1}`]!) }));

  it('shows the page\'s own rows under "On this page", then the same groups on every page under "Everywhere else"', async () => {
    for (const page of ['computers', 'vault'] as const) {
      const { unmount } = await mount(<AgentHint page={page} facts={F} />);
      const panel = await tab(await open(), 'can');
      const here = within(panel).getByRole('group', { name: strings['hint.can.here'] });
      const own = within(within(here).getByRole('list', { name: strings['hint.can.list'] })).getAllByRole('listitem');
      expect(own.map((r) => r.textContent)).toEqual(Array.from({ length: AGENT_HINT_CAN[page] }, (_, i) => S[`can.${page}.${i + 1}`]));
      const all = within(panel).getByRole('group', { name: strings['hint.can.everywhere'] });
      expect(here.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(all).toHaveTextContent(strings['hint.can.everywhere.lead']);
      expect(all).toHaveTextContent(strings['hint.can.access']);
      expect(all).toHaveTextContent(strings['hint.can.kit']);
      for (const g of shared) {
        const rows = within(within(all).getByRole('list', { name: g.title })).getAllByRole('listitem');
        expect(rows.map((r) => r.textContent), `${page}: ${g.title}`).toEqual(g.rows);
      }
      expect(panel).not.toHaveTextContent('{{');
      unmount();
    }
  });

  it('every shared row and title is written, and no other all.* string exists', () => {
    for (const g of shared) {
      expect(g.title).toBeTruthy();
      for (const row of g.rows) expect(row).toBeTruthy();
    }
    const want = AGENT_CAN_EVERYWHERE.reduce((n, g) => n + g.rows + 1, 0);
    expect(Object.keys(S).filter((key) => key.startsWith('all.')).length).toBe(want);
    expect(shared.length).toBeGreaterThanOrEqual(4);
    expect(shared.length).toBeLessThanOrEqual(6);
  });

  it('the Computers lead says the agent works through the API and the Kit inside each computer, not only this page\'s API', async () => {
    await mount(<AgentHint page="computers" facts={F} />);
    const dialog = await open();
    const lead = strings['hint.computers.what'];
    expect(dialog).toHaveTextContent(lead);
    expect(lead).toMatch(/Hoody API and the Hoody Kit inside each computer/);
    expect(lead).toMatch(/run commands, edit files, drive a browser and the desktop/);
    for (const page of AGENT_HINT_PAGES) expect(S[`hint.${page}.what`], page).not.toMatch(/same HTTP API|same way this page/i);
  });
});

describe('AgentHint: hide on this page', () => {
  it('follows its page prop: hidden state and the open drawer belong to the page they were for', async () => {
    hideHint('vault');
    const { rerender } = await mount(<AgentHint page="vault" facts={F} />);
    expect(screen.queryByRole('button', { name: strings['hint.label'] })).not.toBeInTheDocument();
    await rerender(<AgentHint page="bots" facts={F} />);
    const dialog = await open();
    expect(dialog).toHaveTextContent(strings['hint.bots.what']);
    await rerender(<AgentHint page="notes" facts={F} />);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: strings['hint.label'] })).toBeInTheDocument();
    await rerender(<AgentHint page="vault" facts={F} />);
    expect(screen.queryByRole('button', { name: strings['hint.label'] })).not.toBeInTheDocument();
  });

  it('hides for this page only, remembered in this browser', async () => {
    const { unmount } = await mount(<AgentHint page="vault" facts={F} />);
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['hint.hide'] }));
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: strings['hint.label'] })).not.toBeInTheDocument());
    expect([...readHiddenHints()]).toEqual(['vault']);
    unmount();
    await mount(<AgentHint page="vault" facts={F} />);
    expect(screen.queryByRole('button', { name: strings['hint.label'] })).not.toBeInTheDocument();
    await mount(<AgentHint page="bots" facts={F} />);
    expect(screen.getByRole('button', { name: strings['hint.label'] })).toBeInTheDocument();
  });

  it('shows and hides without storage: a throwing localStorage never breaks the page', async () => {
    // The accessor itself throws, as in a browser with site data blocked.
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(hideHint('logs')).toBe(false);
      await mount(<AgentHint page="logs" facts={F} />);
      const dialog = await open();
      const panel = await tab(dialog, 'setup');
      await userEvent.click(within(panel).getByRole('radio', { name: strings['hint.setup.kind.cli'] }));
      expect(panel).toHaveTextContent('hoody computers list');
      await userEvent.click(within(dialog).getByRole('button', { name: strings['hint.hide'] }));
      await vi.waitFor(() => expect(screen.queryByRole('button', { name: strings['hint.label'] })).not.toBeInTheDocument());
    } finally {
      if (real) Object.defineProperty(window, 'localStorage', real);
    }
  });

  it('ignores junk in storage', () => {
    window.localStorage.setItem('hub.v3.agentHint.hidden', '{"notes":1}');
    expect(readHiddenHints().size).toBe(0);
    window.localStorage.setItem('hub.v3.agentHint.hidden', '["notes","__proto__",7]');
    expect([...readHiddenHints()]).toEqual(['notes']);
    window.localStorage.setItem('hub.v3.agentHint.agent', 'telnet');
    expect(readAgentKind()).toBe('coding');
  });
});
