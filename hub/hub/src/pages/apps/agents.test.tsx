// Vitest: Coding agents in the launcher (the Board's AppLauncher; Programs' Launch an app drawer shows the same
// FindPane). Open first asks the computer's system source for the agent's program and opens only that exact program
// (never a longer name such as claude-helper, never another source's row) through the launcher's one send (useApps),
// so the C9 hold, the result panel and the Apps list are the ones every launch has. A launch of the same program
// from Search and one from an agent card hold each other. The agent words (not installed, its install line) follow
// only a launch stamped at Open from an agent card, never a name. While Coding agents is shown, the ready-to-open
// search is not mounted (nothing asked, no warming retry) and the typed words are kept for the way back. The hold
// also reaches across tabs and reloads: the candidate identity is kept in the recent list.
// Live mode with the core's run-open machine scripted per test, as launch.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RunOpen, RunProgress, RunResult, Target } from '@core';
import { useCurrentComputer } from '@core';
import { useState, type ReactNode } from 'react';
import { Icon, type PageManifest } from '@kit';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import type * as Fixtures from '@app/fixtures';
import type * as Logic from './logic';
import type { Candidate, Item } from './logic';

type Answer = Candidate[] | 'fail' | 'warming' | 'hold';
const S = vi.hoisted(() => ({
  reqs: [] as unknown[],
  open: (() => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' })) as (o: { onProgress?: (e: RunProgress) => void }) => Promise<unknown>,
  /** The system source's answer per program name (undefined: nothing found). */
  system: {} as Record<string, Answer>,
  /** The program names the agents list asked the system source for, in order. */
  asked: [] as string[],
  /** Each agent's read as the badge sees it (by program name), and whether the list turned the reads on. */
  reads: {} as Record<string, { data?: { rows: Candidate[]; partial: boolean; warming: boolean; failed: boolean; warned?: boolean }; error?: unknown; isFetching?: boolean; dataUpdatedAt?: number }>,
  enabled: [] as boolean[],
  /** The words the ready-to-open search and the catalogue were asked with, and how many search hooks are mounted. */
  finds: [] as string[],
  catalogs: [] as string[],
  mounted: 0,
  /** The ready search's source reads asked again (useFind's warming retry), by source key. */
  refetches: [] as string[],
  /** Reads of the system source the fixtures were asked for (the agents list must ask none before Open). */
  systemReads: 0,
  held: [] as string[],
  /** Answers a held search ('hold') with these rows, or with a whole read. */
  release: (_rows: Candidate[]) => undefined as void,
  releaseWith: (_read: unknown) => undefined as void,
}));
const PID = 'a'.repeat(24);
const CID = 'b'.repeat(24);

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { useEffect: effect } = await import('react');
  const read = (rows: Candidate[], o: { warming?: boolean } = {}) => ({ rows, partial: false, warming: !!o.warming, failed: false });
  return {
    ...real,
    LIVE: true,
    useAgentSearch: (exes: readonly string[], _t?: unknown, o: { enabled?: boolean } = {}) => {
      S.enabled.push(!!o.enabled);
      return exes.map((exe) => ({
        ...S.reads[exe],
        refetch: () => {
          S.asked.push(exe);
          const a = S.system[exe];
          if (a === 'hold')
            return new Promise((res) => {
              S.release = (rows: Candidate[]) => res({ data: read(rows), error: null });
              S.releaseWith = (data: unknown) => res({ data, error: null });
            });
          return Promise.resolve(a === 'fail' ? { data: undefined, error: new Error('unreachable') } : { data: a === 'warming' ? read([], { warming: true }) : read(a ?? []), error: null });
        },
      }));
    },
    useCatalog: (...args: Parameters<typeof real.useCatalog>) => {
      S.catalogs.push(args[0] ?? '');
      return real.useCatalog(...args);
    },
    useFind: (...args: Parameters<typeof real.useFind>) => {
      S.finds.push(args[0]);
      effect(() => {
        S.mounted++;
        return () => void S.mounted--;
      }, []);
      return real.useFind(...args);
    },
  };
});
// A source warming up is asked again after WARM_RETRY_MS (data.ts useFind). Here it is a delay no other timer uses,
// so a test holds that one timer and runs it when it chooses (holdWarmRetry), never racing a wall clock.
const WARM_MS = 4321;
vi.mock('./logic', async (orig) => ({ ...(await orig<typeof Logic>()), WARM_RETRY_MS: 4321 }));
// The ready search's reads (the fixtures answer them): each refetch of a source is counted where useFind calls it.
vi.mock('@app/fixtures', async (orig) => {
  const real = await orig<typeof Fixtures>();
  return {
    ...real,
    fixtureSource: (id: string) => {
      const src = real.fixtureSource(id);
      return {
        ...src,
        useQuery: <T,>(key: string) => {
          if (key === 'search.system') S.systemReads++;
          const r = src.useQuery<T>(key);
          return key.startsWith('search.') ? { ...r, refetch: (...a: Parameters<typeof r.refetch>) => (S.refetches.push(key), r.refetch(...a)) } : r;
        },
      };
    },
  };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect: effect, useState } = await import('react');
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  const machine = {
    open: (req: unknown, o: { onProgress?: (e: RunProgress) => void }) => {
      S.reqs.push(req);
      return S.open(o ?? {});
    },
    status: () => Promise.resolve({ ok: false, code: 'unreachable', message: '', state: 'unknown' }),
    close: () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' }),
    watch: (_h: unknown, o: { signal: AbortSignal }) =>
      new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ ok: false, code: 'aborted', message: '', state: 'unknown' }))),
  } as unknown as RunOpen;
  return {
    ...real,
    useCurrentComputer: () => t,
    useRunOpen: () => {
      const [m, setM] = useState<RunOpen | null>(null);
      effect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness } = await import('./launch/harness');
const { default: strings } = await import('./strings.en.json');
const { ops } = await import('./parts/ops');
const { fromHandle, loadRecent, readRecent, saveRecent } = await import('./parts/recent');
const { AppLauncher } = await import('./launch');
const { FindPane, FIND_DEBOUNCE_MS } = await import('./launch/FindPane');
const { AgentsPane } = await import('./launch/AgentsPane');
const { AGENTS: REAL_AGENTS } = await import('./agents');
const { default: l } = await import('./launch/launch.module.css');
const { useApps } = await import('./launch/useApps');
const { candidateOf, sameApp, unresolved } = await import('./logic');

const H = (tag: string) => ({ v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: tag, opens_in: 'terminal', computer: { project: PID, computer_id: CID } });
const fill = (key: string, vars: Record<string, string>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), (strings as Record<string, string>)[key] ?? '');
const never = () => new Promise<never>(() => {});
/** The launches this session listed, each with its state now (a state change is a patch over the listed launch). */
const states = () => ops.get().launches.map((l) => ops.get().patches.get(l.key)?.state ?? l.state);
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

/** A search answer's candidate (the system source finds programs on $PATH by name, longer names too). */
const cand = (title: string, o: { provider?: Candidate['provider']; setId?: string; id?: string } = {}): Candidate => ({
  app: title, setId: o.setId ?? `set-${title}`, candidateId: o.id ?? `sys:/usr/bin/${title}`, title, description: '', kind: 'any', provider: o.provider ?? 'system', source: 'sys', version: '', attr: '', path: `/usr/bin/${title}`, tags: [],
});
/** The row Search lists for that candidate when `q` was typed (logic findView: the row keeps the words as its app). */
const searchItem = (c: Candidate, q: string): Item => ({
  type: 'row', name: c.title, id: c.candidateId, description: '', opensIn: 'terminal', by: 'server', provider: c.provider, version: '', attr: '', path: c.path, sourceId: c.source, setId: c.setId, app: q,
  shares: false, runnable: true, unsure: false, installed: true, also: [], ready: true, tier: 0, ord: 0, group: 0, detail: '',
});

/** The agents as the catalogue shows them: each one's own mark (kit icons), who makes it, and its
 *  maker's install page. */
const AGENTS = [
  { name: 'Claude Code', exe: 'claude', mark: 'claude', about: 'agents.about.claude', guide: 'https://code.claude.com/docs/en/setup' },
  { name: 'Codex CLI', exe: 'codex', mark: 'openai', about: 'agents.about.codex', guide: 'https://github.com/openai/codex' },
  { name: 'Gemini CLI', exe: 'gemini', mark: 'gemini', about: 'agents.about.gemini', guide: 'https://github.com/google-gemini/gemini-cli' },
  { name: 'OpenCode', exe: 'opencode', mark: 'opencode', about: 'agents.about.opencode', guide: 'https://opencode.ai/docs' },
] as const;

/** The viewBox and first path of a kit mark as the kit draws it: the row's mark is compared with it. */
function markOf(name: (typeof AGENTS)[number]['mark']) {
  const { container, unmount } = render(<Icon name={name} />);
  const svg = container.querySelector('svg')!;
  const out = { box: svg.getAttribute('viewBox'), d: svg.querySelector('path')!.getAttribute('d') };
  unmount();
  return out;
}
const guideLink = (row: HTMLElement, name: string) => within(row).queryByRole('link', { name: new RegExp(`^${fill('agents.guide', { name })}`) });
/** What a row shows beyond the words the catalogue may show (its name, maker, badge, Open, the install page link and the
 *  answers to Open): any command, of any shape, is left over. */
function leftover(row: HTMLElement, x: (typeof AGENTS)[number]): string {
  const allowed = [
    x.name, strings[x.about], strings['act.open'], fill('agents.guide', { name: x.name }), fill('agents.notInstalled', { name: x.name }), fill('agents.unchecked', { name: x.name }),
    strings['agents.badge.installed'], strings['agents.badge.missing'], strings['agents.badge.checking'], strings['agents.badge.unchecked'],
  ].sort((a, b) => b.length - a.length);
  let text = row.textContent ?? '';
  for (const w of allowed) text = text.split(w).join(' ');
  return text.trim();
}
/** A whole read of the system source holding these rows (the list's own read, for the badge). */
const whole = (rows: Candidate[]) => ({ data: { rows, partial: false, warming: false, failed: false } });

let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };
const placed: unknown[] = [];
function Launcher() {
  return <AppLauncher target={useCurrentComputer() as Target} onPlaced={(p) => placed.push(p)} />;
}

/** The pane as Programs' Launch an app drawer mounts it: the table, its choice kept by the pane itself. */
function Drawer() {
  const a = useApps({ target: useCurrentComputer() as Target, nav: { select: () => undefined } });
  return <FindPane a={a} />;
}

/** The agents list beside an Open of a Search row (`search`), on one launcher: what Programs' drawer does when a
 *  person opens Codex from Search, then from its agent card (or the other way round). */
let search: Item | null = null;
function Both() {
  const a = useApps({ target: useCurrentComputer() as Target, nav: { select: () => undefined, onHeld: (k) => void S.held.push(k) } });
  return (
    <>
      <button type="button" onClick={() => search && void a.latest.current.launch(search, { opensIn: 'terminal' })}>
        open-from-search
      </button>
      <AgentsPane a={a} />
    </>
  );
}

/** The agents list on a launcher whose computer the person can switch (the top bar's computer), A ⇄ B. */
const EID = 'e'.repeat(24);
function Switching() {
  const [cid, setCid] = useState(CID);
  const target = { project: { id: PID }, container: { id: cid, server_name: 'n1' } } as unknown as Target;
  const a = useApps({ target, nav: { select: () => undefined } });
  return (
    <>
      <button type="button" onClick={() => setCid(cid === CID ? EID : CID)}>
        switch-computer
      </button>
      <AgentsPane a={a} target={target} />
    </>
  );
}

/** Renders `v` and finds its agents list (a section of Find an app; Both and Switching show the list alone). */
async function showAgents(v: () => ReactNode = () => <Launcher />, _choose = true) {
  View = v;
  await renderPage(page, { path: '/apps' });
  return screen.findByRole('list', { name: strings['agents.tab'] }, { timeout: 4000 });
}
const agentRow = (list: HTMLElement, name: string) => within(list).getByRole('heading', { name }).closest('li') as HTMLElement;
const openAgent = (list: HTMLElement, name: string) => userEvent.click(within(agentRow(list, name)).getByRole('button', { name: strings['act.open'] }));

beforeEach(() => {
  ops.reset();
  saveRecent({ v: 2, rows: [], ack: [] } as never);
  S.reqs.length = 0;
  S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
  S.system = {};
  S.asked.length = 0;
  S.reads = {};
  S.enabled.length = 0;
  S.finds.length = 0;
  S.catalogs.length = 0;
  S.refetches.length = 0;
  S.systemReads = 0;
  S.held.length = 0;
  search = null;
  placed.length = 0;
});

describe('Coding agents in the launcher', () => {
  it("lists the four agents as a catalogue: each one's own mark and who makes it, no command line; no Hoody agent row", async () => {
    const list = await showAgents();
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(AGENTS.map((x) => x.name));
    for (const x of AGENTS) {
      const row = agentRow(list, x.name);
      const svg = row.querySelector('svg')!;
      const want = markOf(x.mark);
      // the kit mark itself (its grid and its shape), decorative beside the name
      expect([x.name, svg.getAttribute('viewBox'), svg.querySelector('path')!.getAttribute('d')]).toEqual([x.name, want.box, want.d]);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(within(row).getByText(strings[x.about])).toBeInTheDocument();
      // no command anywhere in the row: no code block, no program name as a command, no install or sign-in words
      expect(within(row).queryByRole('region')).toBeNull();
      expect(row.querySelector('pre, code')).toBeNull();
      expect(leftover(row, x), `${x.name} shows nothing beyond its catalogue words`).toBe('');
    }
    expect(within(list).queryByText(/hoody/i)).toBeNull();
  });

  it('in Programs\' drawer too: the agents are a section of Find an app', async () => {
    View = () => <Drawer />;
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByRole('radio', { name: strings['launch.mode.find'] }, { timeout: 4000 })).toBeChecked();
    const list = await screen.findByRole('list', { name: strings['agents.tab'] });
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(AGENTS.map((x) => x.name));
    expect(S.reqs).toEqual([]);
  });

  it('Find an app is the first mode; its agents list reads each program for its badge and sends nothing until Open', async () => {
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByRole('radio', { name: strings['launch.mode.find'] }, { timeout: 4000 })).toBeChecked();
    await screen.findByRole('list', { name: strings['agents.tab'] });
    expect(S.enabled.length).toBeGreaterThan(0);
    expect(S.enabled.every(Boolean)).toBe(true);
    expect(S.asked).toEqual([]);
    expect(S.reqs).toEqual([]);
  });

  it('Open asks the system source for the program, opens only that exact candidate in a terminal, and places it once answered', async () => {
    S.system.claude = [cand('claude-helper', { id: 'sys:/usr/bin/claude-helper' }), cand('claude')];
    S.open = (o) => {
      o.onProgress?.({ handle: H('a'.repeat(16)) } as unknown as RunProgress);
      return Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('a'.repeat(16)) } as unknown as RunResult);
    };
    const list = await showAgents();
    await openAgent(list, 'Claude Code');
    await waitFor(() => expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]));
    expect(S.asked).toEqual(['claude']);
    expect(S.reqs).toEqual([{ app: 'claude', pick: { candidate_id: 'sys:/usr/bin/claude', set_id: 'set-claude' }, opensIn: 'terminal', selector: { source: ['system'] } }]);
  });

  it('a program found only by a longer name (claude-helper) is not the agent: "not installed", nothing executed', async () => {
    S.system.claude = [cand('claude-helper'), cand('Claude', { id: 'sys:/usr/bin/Claude' })];
    const list = await showAgents();
    await openAgent(list, 'Claude Code');
    const row = agentRow(list, 'Claude Code');
    expect(await within(row).findByText(fill('agents.notInstalled', { name: 'Claude Code' }))).toBeInTheDocument();
    // the maker's install page, in a new tab; no command line
    const link = guideLink(row, 'Claude Code')!;
    expect(link).toHaveAttribute('href', 'https://code.claude.com/docs/en/setup');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(leftover(row, AGENTS[0])).toBe('');
    expect(S.asked).toEqual(['claude']);
    expect(S.reqs).toEqual([]);
    expect(placed).toEqual([]);
  });

  it('a row of another source with the exact name is not the agent either: "not installed", nothing executed', async () => {
    S.system.gemini = [cand('gemini', { provider: 'registry', id: 'reg:gemini' }), cand('gemini', { provider: 'nix', id: 'nix:gemini' })];
    const list = await showAgents();
    await openAgent(list, 'Gemini CLI');
    expect(await within(agentRow(list, 'Gemini CLI')).findByText(fill('agents.notInstalled', { name: 'Gemini CLI' }))).toBeInTheDocument();
    expect(S.reqs).toEqual([]);
    expect(placed).toEqual([]);
  });

  it('a system source that does not answer (or is still warming) says it could not check, never "not installed"; nothing executed', async () => {
    S.system.codex = 'fail';
    S.system.opencode = 'warming';
    const list = await showAgents();
    await openAgent(list, 'Codex CLI');
    expect(await within(agentRow(list, 'Codex CLI')).findByText(fill('agents.unchecked', { name: 'Codex CLI' }))).toBeInTheDocument();
    await openAgent(list, 'OpenCode');
    expect(await within(agentRow(list, 'OpenCode')).findByText(fill('agents.unchecked', { name: 'OpenCode' }))).toBeInTheDocument();
    expect(screen.queryByText(fill('agents.notInstalled', { name: 'Codex CLI' }))).toBeNull();
    expect(S.reqs).toEqual([]);
  });

  it('an answer read after the agents list closed opens nothing (the press belonged to the list)', async () => {
    S.system.codex = 'hold';
    const list = await showAgents();
    await openAgent(list, 'Codex CLI');
    await userEvent.click(screen.getByRole('radio', { name: strings['gh.tab'] }));
    await act(async () => S.release([cand('codex')]));
    await pause(50);
    expect(S.reqs).toEqual([]);
    expect(ops.get().launches).toEqual([]);
  });

  it('an answer read after the computer changed opens nothing on the new one, whose Open is not left busy', async () => {
    S.system.codex = 'hold';
    const list = await showAgents(() => <Switching />, false);
    await openAgent(list, 'Codex CLI');
    await userEvent.click(screen.getByRole('button', { name: 'switch-computer' }));
    expect(within(agentRow(list, 'Codex CLI')).getByRole('button', { name: strings['act.open'] })).not.toHaveAttribute('data-pending');
    await act(async () => S.release([cand('codex')]));
    await pause(50);
    expect(S.reqs).toEqual([]);
    expect(ops.get().launches).toEqual([]);
  });

  it('a double press asks the source once and sends one launch', async () => {
    S.system.codex = 'hold';
    const list = await showAgents();
    const open = within(agentRow(list, 'Codex CLI')).getByRole('button', { name: strings['act.open'] });
    await act(async () => {
      open.click();
      open.click();
    });
    expect(S.asked).toEqual(['codex']);
    await act(async () => S.release([cand('codex')]));
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    await pause(50);
    expect(S.reqs).toHaveLength(1);
  });

  it('A → B: computer A\'s "not installed" is not shown for computer B', async () => {
    S.system.codex = [];
    const list = await showAgents(() => <Switching />, false);
    await openAgent(list, 'Codex CLI');
    expect(await within(agentRow(list, 'Codex CLI')).findByText(fill('agents.notInstalled', { name: 'Codex CLI' }))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'switch-computer' }));
    expect(within(agentRow(list, 'Codex CLI')).queryByText(fill('agents.notInstalled', { name: 'Codex CLI' }))).toBeNull();
  });

  it('A → B → A: Open on A is free again, and the late answer of the first press cannot touch a fresh check', async () => {
    S.system.codex = 'hold';
    const list = await showAgents(() => <Switching />, false);
    const open = () => within(agentRow(list, 'Codex CLI')).getByRole('button', { name: strings['act.open'] });
    const notInstalled = fill('agents.notInstalled', { name: 'Codex CLI' });
    await openAgent(list, 'Codex CLI');
    const first = S.release;
    await userEvent.click(screen.getByRole('button', { name: 'switch-computer' }));
    await userEvent.click(screen.getByRole('button', { name: 'switch-computer' }));
    // Back on A while the first press is still out: Open is not left busy, and a press asks again.
    expect(open()).not.toHaveAttribute('data-pending');
    await openAgent(list, 'Codex CLI');
    expect(S.asked).toEqual(['codex', 'codex']);
    const fresh = S.release;
    expect(fresh).not.toBe(first);
    // The first press's answer (an exact row) arrives now: it opens nothing and does not end the fresh check.
    await act(async () => first([cand('codex')]));
    await pause(50);
    expect(S.reqs).toEqual([]);
    expect(ops.get().launches).toEqual([]);
    expect(within(agentRow(list, 'Codex CLI')).queryByText(notInstalled)).toBeNull();
    expect(open()).toHaveAttribute('data-pending');
    // The fresh check's own answer (nothing) is the one that counts.
    await act(async () => fresh([]));
    expect(await within(agentRow(list, 'Codex CLI')).findByText(notInstalled)).toBeInTheDocument();
    expect(S.reqs).toEqual([]);
    expect(open()).not.toHaveAttribute('data-pending');
  });

  it('the install page link shows only for an agent known not to be installed: never while Installed, Checking or Couldn\'t check', async () => {
    S.reads = { claude: whole([]), codex: whole([cand('codex')]), gemini: { isFetching: true }, opencode: { error: new Error('unreachable') } } as never;
    const list = await showAgents();
    expect(within(agentRow(list, 'Claude Code')).getByText(strings['agents.badge.missing'])).toBeInTheDocument();
    expect(guideLink(agentRow(list, 'Claude Code'), 'Claude Code')).not.toBeNull();
    for (const [name, badge] of [['Codex CLI', 'installed'], ['Gemini CLI', 'checking'], ['OpenCode', 'unchecked']] as const) {
      const row = agentRow(list, name);
      expect(within(row).getByText(strings[`agents.badge.${badge}`])).toBeInTheDocument();
      expect([name, guideLink(row, name)]).toEqual([name, null]);
    }
  });

  it("each agent's install link opens its own maker's page in a new tab, without opener or referrer", async () => {
    S.reads = { claude: whole([]), codex: whole([]), gemini: whole([]), opencode: whole([]) } as never;
    const list = await showAgents();
    for (const x of AGENTS) {
      const link = guideLink(agentRow(list, x.name), x.name)!;
      expect([x.name, link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([x.name, x.guide, '_blank', 'noopener noreferrer']);
      expect(leftover(agentRow(list, x.name), x)).toBe('');
    }
  });

  it('the four install pages are pinned: a later edit cannot point an agent elsewhere', () => {
    expect(Object.fromEntries(REAL_AGENTS.map((x) => [x.id, x.guide]))).toEqual({
      claude: 'https://code.claude.com/docs/en/setup',
      codex: 'https://github.com/openai/codex',
      gemini: 'https://github.com/google-gemini/gemini-cli',
      opencode: 'https://opencode.ai/docs',
    });
    expect(REAL_AGENTS.map((x) => [x.name, x.mark, x.guide])).toEqual(AGENTS.map((x) => [x.name, x.mark, x.guide]));
  });

  it('a launch of the agent that the computer answers "nothing found" for says not installed with its install page, never "nothing found"', async () => {
    S.system.gemini = [cand('gemini')];
    S.open = () => Promise.resolve({ ok: false, code: 'no_candidates', message: '', state: 'not_started' });
    const list = await showAgents();
    await openAgent(list, 'Gemini CLI');
    expect(await screen.findByText(fill('agents.notInstalled', { name: 'Gemini CLI' }))).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: new RegExp(`^${fill('agents.guide', { name: 'Gemini CLI' })}`) });
    expect(links.map((x) => x.getAttribute('href'))).toEqual(['https://github.com/google-gemini/gemini-cli']);
    // the result panel holds no command: no code block, and its whole text is exactly the outcome, the install link, Back
    // and Try again, in that order, so a command of any shape, or a missing or moved part, fails it
    expect(document.querySelectorAll('pre, code')).toHaveLength(0);
    // the launcher's own result panel (AppLauncher's outer l.panel), named by its class: a wrapper added inside it cannot
    // narrow what is read
    const panel = screen.getByText(fill('launcher.failed', { name: 'Gemini CLI' })).closest(`.${l.panel}`) as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.contains(links[0]!)).toBe(true);
    expect(panel.textContent).toBe(
      [fill('launcher.failed', { name: 'Gemini CLI' }), fill('agents.notInstalled', { name: 'Gemini CLI' }), fill('agents.guide', { name: 'Gemini CLI' }), strings['launcher.back'], strings['act.retry']].join(''),
    );
    expect(screen.queryByText(fill('find.none', { name: 'gemini' }))).toBeNull();
    expect(placed).toEqual([]);
    expect(S.reqs).toHaveLength(1);
  });
});

describe('one program, one hold: a launch from Search and one from an agent card hold each other (C9)', () => {
  const codex = cand('codex', { setId: 'set-of-codex' });
  // Search for "code" lists Codex too: the same program in a different answer set, under other words.
  const fromSearch = () => searchItem({ ...codex, setId: 'set-of-code' }, 'code');

  for (const state of ['starting', 'unknown'] as const) {
    it(`a Search launch of Codex still ${state} holds an agent card Open (nothing sent twice)`, async () => {
      S.system.codex = [codex];
      const item = fromSearch();
      const row = fromHandle(H('d'.repeat(16)) as never, { name: 'codex', app: 'code' }, 1)!;
      ops.addLaunch({ key: 'earlier', name: 'codex', app: 'code', candidate: candidateOf(item), opensIn: 'terminal', state, ...(state === 'unknown' ? { code: 'start_unconfirmed' } : {}), terminal: 15001, handle: 'd'.repeat(16), source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
      ops.bind('earlier', row);
      const list = await showAgents();
      await openAgent(list, 'Codex CLI');
      expect(await screen.findByText(fill('launcher.held', { name: 'codex' }))).toBeInTheDocument();
      expect(S.reqs).toEqual([]);
      expect(placed).toEqual([]);
    });

    it(`an agent card launch of Codex still ${state} holds an Open of it from Search (nothing sent twice)`, async () => {
      S.system.codex = [codex];
      S.open = state === 'starting' ? never : () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
      search = fromSearch();
      const list = await showAgents(() => <Both />, false);
      await openAgent(list, 'Codex CLI');
      await waitFor(() => expect(S.reqs).toHaveLength(1));
      await waitFor(() => expect(states()).toEqual([state]));
      await userEvent.click(screen.getByRole('button', { name: 'open-from-search' }));
      await waitFor(() => expect(S.held).toHaveLength(1));
      expect(S.reqs).toHaveLength(1);
    });
  }
});

describe('the same hold across tabs and reloads: the candidate identity is kept in the recent list (C9)', () => {
  const codex = cand('codex', { setId: 'set-of-codex' });
  const fromSearch = () => searchItem({ ...codex, setId: 'set-of-code' }, 'code');
  // The launch is admitted (its handle announced), then left starting or answered unknown.
  const admitted = (state: 'starting' | 'unknown', tag: string) => (o: { onProgress?: (e: RunProgress) => void }) => {
    o.onProgress?.({ handle: H(tag) } as unknown as RunProgress);
    return state === 'starting' ? never() : Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown', handle: H(tag) });
  };
  // Another tab, or this one after a reload: only the recent list is left.
  const freshStore = () => act(() => ops.reset());

  for (const state of ['starting', 'unknown'] as const) {
    it(`a Search launch of Codex (words "code") left ${state}, restored from the recent list, holds the agent card`, async () => {
      S.system.codex = [codex];
      S.open = admitted(state, '1'.repeat(16));
      search = fromSearch();
      const list = await showAgents(() => <Both />, false);
      await userEvent.click(screen.getByRole('button', { name: 'open-from-search' }));
      await waitFor(() => expect(loadRecent().rows).toHaveLength(1));
      expect(loadRecent().rows[0]).toMatchObject({ app: 'code', candidate: candidateOf(search) });
      await freshStore();
      await openAgent(list, 'Codex CLI');
      await waitFor(() => expect(S.held).toHaveLength(1));
      expect(S.reqs).toHaveLength(1);
    });

    it(`an agent card launch of Codex left ${state}, restored from the recent list, holds an Open of it from Search`, async () => {
      S.system.codex = [codex];
      S.open = admitted(state, '2'.repeat(16));
      search = fromSearch();
      const list = await showAgents(() => <Both />, false);
      await openAgent(list, 'Codex CLI');
      await waitFor(() => expect(loadRecent().rows).toHaveLength(1));
      expect(loadRecent().rows[0]).toMatchObject({ app: 'codex', candidate: candidateOf(search) });
      await freshStore();
      await userEvent.click(screen.getByRole('button', { name: 'open-from-search' }));
      await waitFor(() => expect(S.held).toHaveLength(1));
      expect(S.reqs).toHaveLength(1);
    });
  }

  it('reads a stored identity back only when it checks: a row without one (or with a bad one) keeps holding by name', () => {
    const row = { ...fromHandle(H('3'.repeat(16)) as never, { name: 'codex', app: 'code' }, 1)! };
    expect(readRecent({ v: 2, rows: [{ ...row, candidate: 'system:abc123' }], ack: [] }).rows[0]?.candidate).toBe('system:abc123');
    for (const bad of ['', 'system:', 'evil:abc', 'system:a b', 7, 'system:' + 'x'.repeat(201)]) {
      const back = readRecent({ v: 2, rows: [{ ...row, candidate: bad }], ack: [] }).rows;
      expect(back).toHaveLength(1);
      expect(back[0]).not.toHaveProperty('candidate');
    }
    expect(readRecent({ v: 2, rows: [row], ack: [] }).rows[0]).toMatchObject({ app: 'code' });
  });
});

describe('one identity first: two candidates are compared by themselves, the name only when one side has none', () => {
  const r = (o: { app: string; candidate?: string; state?: 'unknown' | 'starting' | 'running' }) => ({ key: o.app + (o.candidate ?? ''), name: o.app, opensIn: 'terminal', state: o.state ?? 'unknown', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, ...o }) as never;
  it('codex-helper (found by "codex") left unknown does not hold the exact Codex card; the same candidate does', () => {
    const helper = r({ app: 'codex', candidate: 'system:helper-id' });
    expect(unresolved([helper], { app: 'codex', candidate: 'system:codex-id' })).toEqual([]);
    expect(unresolved([r({ app: 'code', candidate: 'system:codex-id' })], { app: 'codex', candidate: 'system:codex-id' })).toHaveLength(1);
    expect(unresolved([r({ app: 'codex', candidate: 'system:codex-id', state: 'starting' })], { app: 'codex', candidate: 'system:codex-id' })).toHaveLength(1);
  });
  it('a side without a candidate (a reopen by name, an old stored row) still holds by name; a starter by its id', () => {
    expect(sameApp(r({ app: 'codex' }), { app: 'codex', candidate: 'system:codex-id' })).toBe(true);
    expect(sameApp(r({ app: 'codex', candidate: 'system:codex-id' }), { app: 'codex' })).toBe(true);
    expect(sameApp(r({ app: 'htop' }), { app: 'codex', candidate: 'system:codex-id' })).toBe(false);
    expect(sameApp({ catalogId: 'jupyterlab', app: 'x', candidate: 'a:1' } as never, { catalogId: 'jupyterlab', app: 'y', candidate: 'a:2' })).toBe(true);
  });
});

describe('the agents list\'s real data hook in the fixtures: one answer per program name', () => {
  it('answers each name from the fixtures (one of each badge), never by reading the system search', async () => {
    const real = await vi.importActual<typeof Data>('./data');
    const { agentBadge, AGENTS: all } = await import('./agents');
    let badges: (string | null)[] = [];
    let got: Awaited<ReturnType<ReturnType<typeof real.useAgentSearch>[number]['refetch']>> | undefined;
    function Probe() {
      const asks = real.useAgentSearch(all.map((x) => x.exe), undefined, { enabled: true });
      badges = all.map((x, i) => agentBadge(x, asks[i]));
      return (
        <button type="button" onClick={() => void asks[0]?.refetch().then((x) => (got = x))}>
          probe
        </button>
      );
    }
    View = () => <Probe />;
    await renderPage(page, { path: '/apps' });
    const probe = await screen.findByRole('button', { name: 'probe' }, { timeout: 4000 });
    await waitFor(() => expect(badges).toEqual(['installed', 'missing', 'unchecked', 'unchecked']));
    await userEvent.click(probe);
    await waitFor(() => expect(got).toBeDefined());
    expect(got?.data?.rows.map((c) => c.title)).toEqual(['claude']);
    expect(got?.error).toBeFalsy();
    expect(S.systemReads).toBe(0);
  });

  it('a name the fixtures do not answer reads as not asked: the source could not be asked', async () => {
    const real = await vi.importActual<typeof Data>('./data');
    let got: Awaited<ReturnType<ReturnType<typeof real.useAgentSearch>[number]['refetch']>> | undefined;
    function Probe() {
      const asks = real.useAgentSearch(['nano']);
      return (
        <button type="button" onClick={() => void asks[0]?.refetch().then((x) => (got = x))}>
          probe
        </button>
      );
    }
    View = () => <Probe />;
    await renderPage(page, { path: '/apps' });
    await userEvent.click(await screen.findByRole('button', { name: 'probe' }, { timeout: 4000 }));
    await waitFor(() => expect(got).toBeDefined());
    expect(got?.data).toBeUndefined();
    expect(got?.error).toBeTruthy();
  });
});

describe('agent badges: what the list says of each program before Open', () => {
  const read = (rows: Candidate[], o: { partial?: boolean; warming?: boolean; failed?: boolean } = {}) => ({ rows, partial: !!o.partial, warming: !!o.warming, failed: !!o.failed });
  it('Installed only on a whole answer with the exact program; Not installed only on a whole answer without it', async () => {
    const { agentBadge, AGENTS: all } = await import('./agents');
    const codex = all.find((x) => x.id === 'codex')!;
    expect(agentBadge(codex, { data: read([cand('codex')]) })).toBe('installed');
    expect(agentBadge(codex, { data: read([]) })).toBe('missing');
    // A longer name, or the exact name from another source, is not the program.
    expect(agentBadge(codex, { data: read([cand('codex-helper'), cand('codex', { provider: 'nix', id: 'nix:codex' })]) })).toBe('missing');
    // An answer that did not look everywhere never says Not installed, even with the program in it.
    expect(agentBadge(codex, { data: read([], { partial: true }) })).toBe('unchecked');
    // A program the answer names is there, whole answer or not: Open launches it the same way.
    expect(agentBadge(codex, { data: read([cand('codex')], { partial: true }) })).toBe('installed');
    expect(agentBadge(codex, { data: { ...read([cand('codex')]), warned: true } })).toBe('installed');
    expect(agentBadge(codex, { data: read([cand('codex')], { failed: true }) })).toBe('unchecked');
    expect(agentBadge(codex, { data: read([], { warming: true }) })).toBe('unchecked');
    expect(agentBadge(codex, { data: read([], { failed: true }) })).toBe('unchecked');
    // Any warning, even one with no flag of its own (searchRows `warned`).
    expect(agentBadge(codex, { data: { ...read([]), warned: true } })).toBe('unchecked');
    expect(agentBadge(codex, { error: new Error('unreachable') })).toBe('unchecked');
    // In flight (a first read or Open's ask), and never asked.
    expect(agentBadge(codex, { isFetching: true })).toBe('checking');
    expect(agentBadge(codex, { data: read([]), isFetching: true })).toBe('checking');
    expect(agentBadge(codex, {})).toBeNull();
    expect(agentBadge(codex, undefined)).toBeNull();
  });

  it('each row shows its badge; Couldn\'t check explains that Open checks again', async () => {
    S.reads = {
      claude: { data: read([cand('claude')]) },
      codex: { data: read([]) },
      gemini: { data: read([], { partial: true }) },
      opencode: { isFetching: true },
    };
    const list = await showAgents();
    expect(within(agentRow(list, 'Claude Code')).getByText(strings['agents.badge.installed'])).toBeInTheDocument();
    expect(within(agentRow(list, 'Codex CLI')).getByText(strings['agents.badge.missing'])).toBeInTheDocument();
    expect(within(agentRow(list, 'OpenCode')).getByText(strings['agents.badge.checking'])).toBeInTheDocument();
    const gemini = agentRow(list, 'Gemini CLI');
    expect(within(gemini).queryByText(strings['agents.badge.missing'])).toBeNull();
    await userEvent.click(within(gemini).getByRole('button', { name: new RegExp(strings['agents.badge.unchecked']) }));
    expect(await screen.findByText(strings['agents.badge.uncheckedTip'])).toBeInTheDocument();
    expect(S.asked).toEqual([]);
    expect(S.reqs).toEqual([]);
  });

  it('each badge is a state word with its dot, as the app states beside it; Couldn\'t check keeps its explanation', async () => {
    S.reads = {
      claude: { data: read([cand('claude')]) },
      codex: { data: read([]) },
      gemini: { data: read([], { partial: true }) },
      opencode: { isFetching: true },
    };
    const list = await showAgents();
    // The badge's box: the nearest ancestor of its word that holds the leading dot (a StatusPill; a Tag has none).
    const dotted = (row: HTMLElement, word: string): boolean => {
      for (let el: HTMLElement | null = within(row).getByText(word); el && el !== row; el = el.parentElement)
        if (el.querySelector(':scope > span[aria-hidden="true"]')) return true;
      return false;
    };
    expect(dotted(agentRow(list, 'Claude Code'), strings['agents.badge.installed'])).toBe(true);
    expect(dotted(agentRow(list, 'Codex CLI'), strings['agents.badge.missing'])).toBe(true);
    expect(dotted(agentRow(list, 'OpenCode'), strings['agents.badge.checking'])).toBe(true);
    const gemini = agentRow(list, 'Gemini CLI');
    expect(dotted(gemini, strings['agents.badge.unchecked'])).toBe(true);
    await userEvent.click(within(gemini).getByRole('button', { name: new RegExp(strings['agents.badge.unchecked']) }));
    expect(await screen.findByText(strings['agents.badge.uncheckedTip'])).toBeInTheDocument();
  });

  it('a press answer stands until the list reads a newer one: an older read keeps "Not installed", a newer one replaces it and its line', async () => {
    S.system.codex = [];
    S.reads = { codex: { data: read([cand('codex')]), dataUpdatedAt: 1 } };
    let list = await showAgents();
    await openAgent(list, 'Codex CLI');
    const row = () => agentRow(list, 'Codex CLI');
    expect(await within(row()).findByText(fill('agents.notInstalled', { name: 'Codex CLI' }))).toBeInTheDocument();
    expect(within(row()).getByText(strings['agents.badge.missing'])).toBeInTheDocument();
    expect(within(row()).queryByText(strings['agents.badge.installed'])).toBeNull();
    // A list read that came after the press (here: dated far ahead) wins: Installed, and the press's line goes.
    S.reads = { codex: { data: read([cand('codex')]), dataUpdatedAt: Date.now() + 3_600_000 } };
    S.system.codex = 'hold';
    await openAgent(list, 'Codex CLI');
    await act(async () => S.release([]));
    list = await screen.findByRole('list', { name: strings['agents.tab'] });
    await waitFor(() => expect(within(row()).getByText(strings['agents.badge.installed'])).toBeInTheDocument());
    expect(within(row()).queryByText(fill('agents.notInstalled', { name: 'Codex CLI' }))).toBeNull();
  });

  it('a press answer with any warning says it could not check, never "not installed"', async () => {
    S.system.codex = [];
    const list = await showAgents();
    // The mock answers a whole read; this press gets one with an unnamed warning instead.
    S.system.codex = 'hold';
    await openAgent(list, 'Codex CLI');
    await act(async () => S.releaseWith({ rows: [], partial: false, warming: false, failed: false, warned: true }));
    expect(await within(agentRow(list, 'Codex CLI')).findByText(fill('agents.unchecked', { name: 'Codex CLI' }))).toBeInTheDocument();
    expect(within(agentRow(list, 'Codex CLI')).getByText(strings['agents.badge.unchecked'])).toBeInTheDocument();
  });

  it('a press answer with a warning that names the program opens it (the badge reads such an answer as Installed too)', async () => {
    S.system.codex = [];
    const list = await showAgents();
    S.system.codex = 'hold';
    await openAgent(list, 'Codex CLI');
    await act(async () => S.releaseWith({ rows: [cand('codex')], partial: true, warming: false, failed: false, warned: true }));
    // The launch takes the launcher to its progress; the badge table above pins the same answer as Installed.
    await waitFor(() => expect(ops.get().launches).toHaveLength(1));
  });

  it('Open asks on a query key of its own, never the list read already out (core keys differ)', async () => {
    const real = await vi.importActual<typeof Data>('./data');
    const core = await vi.importActual<typeof Core>('@core');
    const src = core.coreSource('agentkeys', { reads: { 'search.system': { route: real.searchRoute, input: (p: { q: string }) => ({ query: { app: p.q, source: 'system', limit: 50 } }) } } });
    const { reads, presses } = real.agentParams(['codex'], {});
    let hashes: string[] = [];
    function Probe() {
      hashes = [src.useQueryHash('search.system', reads[0]), src.useQueryHash('search.system', presses[0])];
      return <span>keys</span>;
    }
    View = () => <Probe />;
    await renderPage(page, { path: '/apps' });
    await screen.findByText('keys', undefined, { timeout: 4000 });
    expect(hashes[0]).toBeTruthy();
    expect(hashes[1]).not.toBe(hashes[0]);
  });

  it('a row never asked shows no badge', async () => {
    const list = await showAgents();
    for (const x of AGENTS) {
      for (const k of ['installed', 'missing', 'checking', 'unchecked'] as const) expect(within(agentRow(list, x.name)).queryByText(strings[`agents.badge.${k}`])).toBeNull();
    }
  });
});

describe('the agent words follow a launch opened from an agent card, never a name', () => {
  const failed = (app: string, code: string, extra: Record<string, unknown> = {}) => ({ key: 'k', name: app, app, opensIn: 'terminal', state: 'not_started', code, terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, ...extra }) as never;
  it('a card launch says not installed (Try again); an ordinary app named like an agent, or found by its words, keeps "nothing found"', async () => {
    const { launchOf } = await import('./parts/words');
    expect(launchOf(failed('claude', 'no_candidates', { agent: 'claude' }), [])).toMatchObject({ key: 'agents.notInstalled', primary: 'retry' });
    // An ordinary app called "claude", a Search row found by typing "gemini" (Gemini helper), a starter named "codex".
    expect(launchOf(failed('claude', 'no_candidates'), [])).toMatchObject({ key: 'find.none', primary: 'starters' });
    expect(launchOf(failed('gemini', 'no_candidates', { name: 'Gemini helper', candidate: 'system:sys:/usr/bin/gemini-helper' }), [])).toMatchObject({ key: 'find.none', primary: 'starters' });
    expect(launchOf(failed('codex', 'no_candidates', { catalogId: 'codex' }), []).key).not.toBe('agents.notInstalled');
    expect(launchOf(failed('claude', 'unreachable', { agent: 'claude' }), []).key).toBe(launchOf(failed('htop', 'unreachable'), []).key);
  });

  it('a Search row named like an agent, found by typing its name, carries no agent stamp: it fails as "nothing found"', async () => {
    S.open = () => Promise.resolve({ ok: false, code: 'no_candidates', message: '', state: 'not_started' });
    search = searchItem(cand('Claude helper', { id: 'sys:/usr/bin/claude-helper' }), 'claude');
    View = () => <Both />;
    await renderPage(page, { path: '/apps' });
    await userEvent.click(await screen.findByRole('button', { name: 'open-from-search' }, { timeout: 4000 }));
    await waitFor(() => expect(states()).toEqual(['not_started']));
    const { launchOf } = await import('./parts/words');
    const r = ops.get().launches[0]!;
    expect(r).not.toHaveProperty('agent');
    expect(launchOf({ ...r, state: 'not_started', code: 'no_candidates' } as never, []).key).toBe('find.none');
  });
});

describe('while From GitHub is shown the find search is not mounted, and the typed words are kept', () => {
  it('switching before the pause after typing asks no search and no catalogue for the words; back, they are there and asked', async () => {
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await screen.findByRole('radio', { name: strings['launch.mode.find'] }, { timeout: 4000 });
    await userEvent.type(screen.getByRole('searchbox', { name: strings['launch.search'] }), 'htop');
    await userEvent.click(screen.getByRole('radio', { name: strings['gh.tab'] }));
    await waitFor(() => expect(screen.queryByRole('searchbox', { name: strings['launch.search'] })).toBeNull());
    await pause(FIND_DEBOUNCE_MS + 150);
    expect(S.finds).not.toContain('htop');
    expect(S.catalogs).not.toContain('htop');
    expect(S.mounted).toBe(0);
    await userEvent.click(screen.getByRole('radio', { name: strings['launch.mode.find'] }));
    expect(await screen.findByRole('searchbox', { name: strings['launch.search'] })).toHaveValue('htop');
    await waitFor(() => expect(S.finds).toContain('htop'));
  });

  // useFind's warming retry is held here: its timer (delay WARM_MS) is kept, not run; run() fires every one not cleared.
  type Held = { fn: () => void; cleared: boolean };
  let held: Held[] = [];
  let unhold: (() => void) | null = null;
  const holdWarmRetry = () => {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const ids = new Map<unknown, Held>();
    const set = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms !== WARM_MS) return realSet(fn, ms, ...rest);
      const h: Held = { fn, cleared: false };
      const id = { warm: held.length };
      held.push(h);
      ids.set(id, h);
      return id;
    }) as typeof setTimeout);
    const clear = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id?: unknown) => {
      const h = ids.get(id);
      if (h) h.cleared = true;
      else realClear(id as never);
    }) as typeof clearTimeout);
    unhold = () => (set.mockRestore(), clear.mockRestore());
  };
  const runHeld = () => act(() => held.filter((h) => !h.cleared).forEach((h) => h.fn()));
  afterEach(() => {
    unhold?.();
    unhold = null;
    held = [];
  });

  // search-mixed: Packages answers "warming up" after 450 ms, so useFind arms its retry (held, see holdWarmRetry).
  const typeAndWarm = async () => {
    holdWarmRetry();
    View = () => <Drawer />;
    await renderPage(page, { path: '/apps', state: 'search-mixed' });
    await screen.findByRole('radio', { name: strings['launch.mode.find'] }, { timeout: 4000 });
    await userEvent.type(screen.getByRole('searchbox', { name: strings['launch.search'] }), 'jupyter');
    await waitFor(() => expect(S.finds).toContain('jupyter'));
  };

  it('staying on Find an app, a source warming up is asked again by itself (the retry the switch must stop)', async () => {
    await typeAndWarm();
    expect((await screen.findAllByText(/getting ready/i, undefined, { timeout: 2000 })).length).toBeGreaterThan(0);
    await waitFor(() => expect(held.some((h) => !h.cleared)).toBe(true));
    expect(S.refetches).toEqual([]);
    await runHeld();
    await waitFor(() => expect(S.refetches).toContain('search.pkgx'));
  });

  it('switching while a source is warming up stops its retry: past the deadline nothing is asked; back, the words are kept', async () => {
    await typeAndWarm();
    // The warming answer is in (the strip says a source is getting ready), so its retry is armed and held, not run.
    expect((await screen.findAllByText(/getting ready/i, undefined, { timeout: 2000 })).length).toBeGreaterThan(0);
    await waitFor(() => expect(held.some((h) => !h.cleared)).toBe(true));
    expect(S.refetches).toEqual([]);
    await userEvent.click(screen.getByRole('radio', { name: strings['gh.tab'] }));
    await waitFor(() => expect(screen.queryByRole('searchbox', { name: strings['launch.search'] })).toBeNull());
    expect(S.mounted).toBe(0);
    // Past the deadline: every retry the switch did not clear runs now; none is left, so nothing is asked.
    expect(held.every((h) => h.cleared)).toBe(true);
    await runHeld();
    expect(S.refetches).toEqual([]);
    expect(S.mounted).toBe(0);
    await userEvent.click(screen.getByRole('radio', { name: strings['launch.mode.find'] }));
    expect(await screen.findByRole('searchbox', { name: strings['launch.search'] })).toHaveValue('jupyter');
  });
});
