// Vitest: Open with's drawer and the Preview's Open in ‹Top›.
// The checks (useProbes), the start (useOpenWith), the remembered choice's store and the launch list are stand-ins
// here, so every assertion is about what the drawer offers, plans, starts, stores and navigates to.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Core from '@core';
import type * as Kit from '@kit';
import type { Probes, ProbeRow } from './probes';
import type { OwOutcome, StartOpts } from './useOpenWith';
import type { ScriptPlan } from './plan';
import type { RememberDoc } from './remember';
import type * as RememberMod from './remember';
import type * as OpsMod from '../../parts/ops';

const CID = 'b'.repeat(24);
const SUB = 'c'.repeat(32);
const target = { project: { id: 'a'.repeat(24) }, container: { id: CID, server_name: 'n1' } };
const launcher = { candidateId: 'sys-bash', path: '/usr/bin/bash' };

const S = vi.hoisted(() => ({
  probes: null as unknown as Omit<Probes, 'refresh' | 'reprobe' | 'dropLauncher'>,
  started: [] as { plan: ScriptPlan; o: StartOpts }[],
  answer: null as OwOutcome | null,
  went: [] as string[],
  served: true,
  exec: true,
  doc: { v: 1, t: {} } as RememberDoc,
  status: 'ok' as string,
  kept: [] as unknown[],
  dropped: [] as string[],
  rows: [] as unknown[],
  runs: new Map<string, unknown>(),
  inval: [] as string[],
  placeAt: null as unknown,
  placeKey: 'a1',
  probeOn: [] as boolean[],
}));

vi.mock('./probes', () => ({
  useProbes: (a: { enabled: boolean }) => (S.probeOn.push(a.enabled), { ...S.probes, refresh: () => undefined, reprobe: (id: string) => void S.inval.push(`reprobe:${id}`), dropLauncher: () => void S.inval.push('dropLauncher') }),
  reprobeOn: (_t: unknown, id: string) => void S.inval.push(`reprobe:${id}`),
  dropLauncherOn: () => void S.inval.push('dropLauncher'),
}));
// The launcher panel: one button that reports the place this test sets (its own launch flow is Apps' tests').
vi.mock('../AppLauncher', () => ({ AppLauncher: ({ onPlaced }: { onPlaced: (p: unknown, key: string) => void }) => <button type="button" onClick={() => onPlaced(S.placeAt, S.placeKey)}>placed</button> }));
vi.mock('./useOpenWith', () => ({
  useOpenWith: () => ({
    live: { m: null, target: null },
    start: async (plan: ScriptPlan, o: StartOpts) => {
      S.started.push({ plan, o });
      return S.answer ?? { kind: 'listed', key: 'k1', done: Promise.resolve() };
    },
    wordsOf: () => ({ key: 'w.started', vars: { p: 'Nano', file: 'a b.txt' } }),
  }),
}));
vi.mock('./remember', async (orig) => {
  const real = await orig<typeof RememberMod>();
  return {
    ...real,
    useRemembered: () => ({
      doc: S.doc,
      status: S.status,
      keep: (type: string, pick: Parameters<typeof real.remember>[2]) => { if (!real.keepable(pick)) return false; S.kept.push([type, pick]); return true; },
      drop: (type: string) => { S.dropped.push(type); return true; },
      used: () => true,
    }),
  };
});
vi.mock('../../parts/ops', async (orig) => ({
  ...(await orig<typeof OpsMod>()),
  useOps: () => ({ runs: S.runs, patches: new Map(), epoch: 0 }),
  merge: () => S.rows,
}));
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), useCan: () => S.exec }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return { ...real, useGo: () => (to: string) => void S.went.push(to), usePageLink: (id: string) => (id === 'board' ? (S.served ? { kind: 'hub', path: '/board' } : null) : real.usePageLink(id)) };
});

const { default: OpenWith, OpenTop, topOf } = await import('./OpenWith');
const { resetEndsForTests, watchedForTests } = await import('./ends');
const { ops } = await import('../../parts/ops');
const { capture } = await import('@core');
const { sqliteStudioUrl } = await import('./sqlite');

const row = (tpl: ProbeRow['tpl'], state: ProbeRow['state'], exe?: string): ProbeRow => ({ tpl, state, ...(exe ? { exe } : {}) });
const file = (o: Partial<{ name: string; type: 'file' | 'dir' | 'symlink'; exec: boolean | null }> = {}) => {
  const name = o.name ?? 'a b.txt';
  return { path: `/home/user/${name}`, name, label: name, type: o.type ?? 'file', ...(o.exec !== undefined ? { exec: o.exec } : {}) } as const;
};

beforeEach(() => {
  S.probes = { rows: [row('nano', 'found', '/usr/bin/nano'), row('mousepad', 'found', '/usr/bin/mousepad'), row('vim', 'absent'), row('nvim', 'unchecked'), row('micro', 'absent'), row('pluma', 'absent'), row('emacs', 'absent'), row('less', 'absent')], screen: 'confirmed', launcher, checking: false };
  S.started = [];
  S.answer = null;
  S.went = [];
  S.served = true;
  S.exec = true;
  S.doc = { v: 1, t: {} };
  S.status = 'ok';
  S.kept = [];
  S.dropped = [];
  S.rows = [];
  S.runs = new Map();
  S.inval = [];
  S.placeAt = null;
  S.placeKey = 'a1';
  resetEndsForTests();
  window.location.hash = '#/files';
});

describe('the chooser', () => {
  it('offers found programs by where they show; an absent one is not offered; unchecked ones sit under More programs', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Open in Nano' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open in Mousepad' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Vim' })).toBeNull();
    expect(screen.getByText('In a terminal')).toBeInTheDocument();
    expect(screen.getByText("On the computer's display")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /More programs \(1\)/ })).toBeInTheDocument();
  });

  it('chooser_builds_requests_only_through_toLaunch: a press is a planFor plan started through useOpenWith', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    expect(S.started[0]).toEqual({
      plan: { p: 'tpl', tpl: 'nano', target: 'file', path: '/home/user/a b.txt', opens: 'terminal', exe: '/usr/bin/nano' },
      o: { launcher, program: 'Nano', label: 'Nano · a b.txt' },
    });
    // The drawer and the Files entry builds no request of its own: none of the senders or request builders appears.
    for (const f of ['./OpenWith.tsx', '../../links.ts']) {
      // Code only: comments may name what is not used.
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\b(toLaunch|sealLaunch|liveOpen|openRequest|statCall|statRoutes|api\.|fetch\()/);
    }
  });

  it('screen_negative_probe_keeps_launch_enabled: screen rows stay enabled, with one note', async () => {
    S.probes = { ...S.probes, screen: 'unconfirmed' };
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Open in Mousepad' })).toBeEnabled();
    expect(screen.getAllByText(/couldn't confirm this computer has a display/)).toHaveLength(1);
  });

  it('no bash for the launcher: says so and starts nothing', async () => {
    S.probes = { ...S.probes, launcher: null };
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByText(/no bash program was found on it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Nano' })).toBeDisabled();
  });

  it('Run row shown only when planFor accepts: a regular file with its execute bit', async () => {
    const { unmount } = render(<OpenWith target={target} ask={{ kind: 'choose', file: file({ name: 'run.sh', exec: true }) }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Run in a terminal' })).toBeInTheDocument();
    unmount();
    for (const f of [file({ name: 'run.sh', exec: false }), file({ name: 'run.sh', exec: null }), file({ name: 'run.sh' }), file({ name: 'run.sh', type: 'symlink', exec: true })]) {
      const r = render(<OpenWith target={target} ask={{ kind: 'choose', file: f }} onClose={() => undefined} />);
      await screen.findByText('Your own command');
      expect(screen.queryByRole('button', { name: 'Run in a terminal' })).toBeNull();
      r.unmount();
    }
  });

  it('Other command: planned and started as typed, where the person chose', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Other command' }), 'wc -l "$1"');
    await userEvent.click(screen.getByRole('radio', { name: 'Display' }));
    await userEvent.click(screen.getByRole('button', { name: 'Run command' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    expect(S.started[0]!.plan).toEqual({ p: 'cmd', text: 'wc -l "$1"', target: 'file', path: '/home/user/a b.txt', opens: 'screen' });
    expect(S.started[0]!.o.label).toBe('Command · a b.txt');
  });
});

describe('the remembered choice', () => {
  it('the checkbox keeps the program pressed for the type, never Run (and Run in a terminal leaves it as it was)', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file({ name: 'run.sh', exec: true }) }} onClose={() => undefined} />);
    S.probes = { ...S.probes };
    await userEvent.click(await screen.findByRole('checkbox', { name: /Always use the program I pick for \.sh files/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run in a terminal' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    expect(S.started[0]!.plan.p).toBe('run');
    expect(S.kept).toEqual([]);
  });

  it('a template pressed with the checkbox on is kept for the type', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /for \.txt files on this computer/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Open in Nano' }));
    await waitFor(() => expect(S.kept).toEqual([['.txt', { p: 'tpl', target: 'file', tpl: 'nano' }]]));
  });

  it('folders get no checkbox: folder actions are never kept', async () => {
    S.probes = { ...S.probes, rows: [row('thunar', 'found', '/usr/bin/thunar'), row('caja', 'absent'), row('mc', 'absent')] };
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file({ name: 'src', type: 'dir' }) }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Open in Thunar' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open terminal here' }));
    await waitFor(() => expect(S.started[0]?.plan).toEqual({ p: 'here', dir: '/home/user/src' }));
    expect(S.kept).toEqual([]);
  });

  it('unchecking forgets the type; the status line says unsaved, oversized and unreadable', async () => {
    S.doc = { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'nano' }, u: 1 } } };
    const { rerender } = render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    const box = await screen.findByRole('checkbox', { name: 'Always use Nano for .txt files on this computer' });
    expect(box).toBeChecked();
    expect(screen.getByText('Last used')).toBeInTheDocument();
    await userEvent.click(box);
    expect(S.dropped).toEqual(['.txt']);
    for (const [st, words] of [['unsaved', 'Not saved on this browser'], ['oversized', /too many saved choices/], ['locked', "Saved choices can't be read on this browser"], ['saving', 'Saving…'], ['ok', 'Saved ✓']] as const) {
      S.status = st;
      rerender(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
      expect(screen.getByText(words)).toBeInTheDocument();
    }
  });

  it('a stored choice is planned again when used: a template not found is said, never started', async () => {
    S.doc = { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'vim' }, u: 1 } } };
    render(<OpenWith target={target} ask={{ kind: 'last', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByText(/Vim is not on this computer any more/)).toBeInTheDocument();
    expect(S.started).toEqual([]);
  });

  it('a stored choice the plan refuses for this name is not started', async () => {
    S.doc = { v: 1, t: { '.png': { c: { k: 'tpl', id: 'imdisplay' }, u: 1 } } };
    S.probes = { ...S.probes, rows: [row('ristretto', 'absent'), row('eom', 'absent'), row('imdisplay', 'found', '/usr/bin/display'), row('firefox', 'absent')] };
    render(<OpenWith target={target} ask={{ kind: 'last', file: file({ name: 'shot[1].png' }) }} onClose={() => undefined} />);
    expect(await screen.findByText(/would read this file name as something else/)).toBeInTheDocument();
    expect(S.started).toEqual([]);
  });

  it('a stored choice found by the check starts once', async () => {
    S.doc = { v: 1, t: { '.txt': { c: { k: 'tpl', id: 'mousepad' }, u: 1 } } };
    render(<OpenWith target={target} ask={{ kind: 'last', file: file() }} onClose={() => undefined} />);
    await waitFor(() => expect(S.started).toHaveLength(1));
    expect(S.started[0]!.plan).toMatchObject({ p: 'tpl', tpl: 'mousepad', exe: '/usr/bin/mousepad', opens: 'screen' });
  });
});

describe('landing on the program board', () => {
  const listed = (state: string) => ({ key: 'k1', name: 'Nano · a b.txt', state, opensIn: 'terminal', p: 'tpl', candidate: `other:ow-nano-${SUB}`, computer: CID, urls: { terminal: 'https://t.example/terminal' }, startedAt: 1 });
  const stored = { computer: { project: 'a'.repeat(24), computer_id: CID }, terminal_id: 8003, incarnation: 'i', command_id: 1, launch_tag: 't', display: 8003, name: 'x', opens_in: 'terminal', started_at: 1 };

  it('an accepted launch with a place goes to its program board, keyed, once', async () => {
    const { rerender } = render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    expect(S.went).toEqual([]);
    S.rows = [listed('started')];
    S.runs = new Map([['k1', stored]]);
    rerender(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await waitFor(() => expect(S.went).toHaveLength(1));
    expect(Object.fromEntries(new URL(S.went[0]!, 'https://h').searchParams)).toEqual({ add: 'terminal-8003', cid: CID, for: 'ow:nano', label: 'Nano' });
    rerender(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(S.went).toHaveLength(1);
  });

  it('where the Board is not served here, nothing navigates: Open in a new tab', async () => {
    S.served = false;
    S.rows = [listed('running')];
    S.runs = new Map([['k1', stored]]);
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    expect(await screen.findByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', 'https://t.example/terminal');
    expect(S.went).toEqual([]);
  });

  it('running already: Show it (keyed) and Open another, which starts a second only when pressed', async () => {
    S.answer = { kind: 'running', key: 'k1', words: { key: 'r.running', vars: { p: 'Nano', file: 'a b.txt' } } };
    S.rows = [listed('running')];
    S.runs = new Map([['k1', stored]]);
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    expect(await screen.findByText('Nano is already running, started with a b.txt.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show it' }));
    expect(new URL(S.went[0]!, 'https://h').searchParams.get('for')).toBe('ow:nano');
    S.answer = null;
    await userEvent.click(screen.getByRole('button', { name: 'Open another' }));
    await waitFor(() => expect(S.started).toHaveLength(2));
    expect(S.started[1]!.o).toMatchObject({ another: true });
  });

  it('a hold no row shows: Stop tracking asks first', async () => {
    S.answer = { kind: 'held', words: { key: 'r.held', vars: { p: 'Nano', file: 'a b.txt' } } };
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop tracking…' }));
    expect(screen.getByText('The earlier start may still be running, so the app may open twice. Stop tracking it anyway?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop tracking' })).toBeInTheDocument();
  });
});

describe("what a launch's end tells discovery", () => {
  const ended = (o: object) => ({ key: 'k1', name: 'Nano · a b.txt', state: 'gone', opensIn: 'terminal', p: 'tpl', candidate: `other:ow-nano-${SUB}`, computer: CID, urls: {}, startedAt: 1, ...o });
  // The drawer goes (a landing, a close) before the launch ends; the end then arrives in the launches store.
  async function pressNanoThenLeave(rowOf: object) {
    const r = render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    r.unmount();
    expect(watchedForTests()).toEqual(['k1']);
    S.rows = [rowOf];
    ops.ack('end-arrives');
  }
  it('exit_127_reprobes_the_template_path: once per launch, after the drawer is gone', async () => {
    await pressNanoThenLeave(ended({ exitCode: 127 }));
    expect(S.inval).toEqual(['reprobe:nano']);
    ops.ack('again');
    expect(S.inval).toEqual(['reprobe:nano']);
  });
  it('a refused launcher lookup drops the launcher row, never re-sends', async () => {
    await pressNanoThenLeave(ended({ state: 'failed', code: 'resolve_failed' }));
    expect(S.inval).toEqual(['dropLauncher']);
    expect(S.started).toHaveLength(1);
  });
  it('another end changes nothing', async () => {
    await pressNanoThenLeave(ended({ state: 'exited', exitCode: 1 }));
    expect(S.inval).toEqual([]);
  });
});

describe('the landing fence', () => {
  const listed = { key: 'k1', name: 'Nano · a b.txt', state: 'started', opensIn: 'terminal', p: 'tpl', candidate: `other:ow-nano-${SUB}`, computer: CID, urls: { terminal: 'https://t.example/terminal' }, startedAt: 1 };
  const stored = { computer: { project: 'a'.repeat(24), computer_id: CID }, terminal_id: 8003, incarnation: 'i', command_id: 1, launch_tag: 't', display: 8003, name: 'x', opens_in: 'terminal', started_at: 1 };
  it('landing_requires_unchanged_location: the address moved since the press, so nothing navigates and Show it is offered', async () => {
    const r = render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    await waitFor(() => expect(S.started).toHaveLength(1));
    window.location.hash = '#/files?ap=%2Felsewhere';
    S.rows = [listed];
    S.runs = new Map([['k1', stored]]);
    r.rerender(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Show it' })).toBeInTheDocument();
    expect(S.went).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Show it' }));
    expect(new URL(S.went[0]!, 'https://h').searchParams.get('for')).toBe('ow:nano');
  });
  // A one-program entry (the Preview's Open in ‹Top›, Open in ‹Last used›, Run, Terminal here) starts by itself once
  // its checks allow; the fence is the entry's press, however long the checks took.
  async function oneClick(moveWhileChecking: boolean) {
    const pressedAt = { gen: capture().gen, href: window.location.href };
    S.probes = { ...S.probes, launcher: 'checking' };
    const ask = { kind: 'tpl', file: file(), tpl: 'nano' } as const;
    const r = render(<OpenWith target={target} ask={ask} pressedAt={pressedAt} onClose={() => undefined} />);
    if (moveWhileChecking) window.location.hash = '#/files?ap=%2Felsewhere';
    S.probes = { ...S.probes, launcher };
    r.rerender(<OpenWith target={target} ask={ask} pressedAt={pressedAt} onClose={() => undefined} />);
    await waitFor(() => expect(S.started).toHaveLength(1));
    S.rows = [listed];
    S.runs = new Map([['k1', stored]]);
    r.rerender(<OpenWith target={target} ask={ask} pressedAt={pressedAt} onClose={() => undefined} />);
  }
  it('entry_press_fences_one_click_landing: the address moved while the checks ran, so nothing navigates', async () => {
    await oneClick(true);
    expect(await screen.findByRole('button', { name: 'Show it' })).toBeInTheDocument();
    expect(S.went).toEqual([]);
  });
  it('the same entry with the address unchanged lands once', async () => {
    await oneClick(false);
    await waitFor(() => expect(S.went).toHaveLength(1));
    expect(new URL(S.went[0]!, 'https://h').searchParams.get('for')).toBe('ow:nano');
  });
});

describe('Launch an app here: where it cannot land', () => {
  const app = { key: 'a1', name: 'JupyterLab', state: 'ready', opensIn: 'web', p: 'apphere', app: 'jupyterlab', computer: CID, urls: { web: 'https://w.example/' }, startedAt: 1 };
  it('app_here_unlandable_place_offers_new_tab: a web port leaves the panel for the words, its address and Launch another app', async () => {
    S.placeAt = { kind: 'port', port: 8888, path: '/' };
    S.rows = [app];
    S.runs = new Map([['a1', { computer: { computer_id: CID }, web: { port: 8888, path: '/' } }]]);
    render(<OpenWith target={target} ask={{ kind: 'apphere', dir: file({ name: 'src', type: 'dir' }) }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'placed' }));
    expect(await screen.findByText('The app was started. Find it in Programs > Apps.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'placed' })).toBeNull();
    expect(S.went).toEqual([]);
    expect(screen.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'https://w.example/');
    await userEvent.click(screen.getByRole('button', { name: 'Launch another app' }));
    expect(await screen.findByRole('button', { name: 'placed' })).toBeInTheDocument();
  });
  it('app_here_matches_its_own_launch: another app at the same port never lends its address or board', async () => {
    S.placeAt = { kind: 'port', port: 8888, path: '/own' };
    S.placeKey = 'a1';
    const other = { ...app, key: 'b1', name: 'Other', app: 'other', urls: { web: 'https://other.example/' }, startedAt: 9 };
    S.rows = [other, { ...app, urls: { web: 'https://w.example/own' } }];
    S.runs = new Map([['a1', { computer: { computer_id: CID }, web: { port: 8888, path: '/own' } }], ['b1', { computer: { computer_id: CID }, web: { port: 8888, path: '/' } }]]);
    render(<OpenWith target={target} ask={{ kind: 'apphere', dir: file({ name: 'src', type: 'dir' }) }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'placed' }));
    expect(await screen.findByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'https://w.example/own');
  });
  it('no Board here: the same, never a navigation', async () => {
    S.served = false;
    S.placeAt = { kind: 'terminal', session: 8003 };
    S.rows = [{ ...app, urls: { web: 'https://w.example/', terminal: 'https://t.example/' } }];
    S.runs = new Map([['a1', { computer: { computer_id: CID }, terminal_id: 8003 }]]);
    render(<OpenWith target={target} ask={{ kind: 'apphere', dir: file({ name: 'src', type: 'dir' }) }} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'placed' }));
    expect(await screen.findByText('The app was started. Find it in Programs > Apps.')).toBeInTheDocument();
    expect(S.went).toEqual([]);
    expect(screen.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'https://t.example/');
  });
});

describe('Open in ‹Top› (the Preview)', () => {
  const base = { rows: [row('nano', 'found', '/usr/bin/nano')], checking: false, launcher } as const;
  it('topOf: only after the top check found it; checking first; nothing on a partial or failed result', () => {
    expect(topOf(base, null)).toEqual(row('nano', 'found', '/usr/bin/nano'));
    expect(topOf({ ...base, checking: true }, null)).toBe('checking');
    expect(topOf({ ...base, launcher: 'checking' }, null)).toBe('checking');
    expect(topOf({ ...base, rows: [row('nano', 'absent'), row('vim', 'found', '/usr/bin/vim')] }, null)).toEqual(row('vim', 'found', '/usr/bin/vim'));
    expect(topOf({ ...base, rows: [row('nano', 'unchecked'), row('vim', 'found', '/usr/bin/vim')] }, null)).toBeNull();
    expect(topOf({ ...base, rows: [row('nano', 'failed')] }, null)).toBeNull();
    expect(topOf({ ...base, launcher: null }, null)).toBeNull();
    expect(topOf({ ...base, launcher: 'failed' }, null)).toBeNull();
    expect(topOf({ ...base, rows: [row('nano', 'found', '/usr/bin/nano'), row('vim', 'found', '/usr/bin/vim')] }, { k: 'tpl', id: 'vim' })).toEqual(row('vim', 'found', '/usr/bin/vim'));
  });
  it('the button shows after a found check, a placeholder while checking, nothing otherwise', async () => {
    const onOpen = vi.fn();
    S.probes = { ...S.probes, checking: true };
    const r = render(<OpenTop target={target} file={file()} decodedText={false} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /Open in/ })).toBeNull();
    S.probes = { ...S.probes, checking: false };
    r.rerender(<OpenTop target={target} file={file()} decodedText={false} onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Nano' }));
    expect(onOpen).toHaveBeenCalledWith('nano');
    S.probes = { ...S.probes, rows: [row('nano', 'failed')] };
    r.rerender(<OpenTop target={target} file={file()} decodedText={false} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /Open in/ })).toBeNull();
    S.exec = false;
    S.probes = { ...S.probes, rows: [row('nano', 'found', '/usr/bin/nano')] };
    r.rerender(<OpenTop target={target} file={file()} decodedText={false} onOpen={onOpen} />);
    expect(screen.queryByRole('button', { name: /Open in/ })).toBeNull();
  });
});

describe('a database opens in SQLite Studio by default', () => {
  const db = () => file({ name: 'shop.db' });
  const studioOf = () => screen.getByRole('link', { name: /SQLite Studio/ });

  it('the chooser shows SQLite Studio first (the one secondary button: the default), at the computer\'s studio with this database; the text programs stay below', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: db() }} onClose={() => undefined} />);
    expect(await screen.findByText('Database')).toBeInTheDocument();
    const link = studioOf();
    expect(link).toHaveAttribute('href', sqliteStudioUrl(target, '/home/user/shop.db'));
    expect(link.getAttribute('href')).toContain('?db=%2Fhome%2Fuser%2Fshop.db');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByRole('button', { name: 'Open in Nano' })).toHaveAttribute('data-variant', 'ghost');
    // First: before every program row.
    const nano = screen.getByRole('button', { name: 'Open in Nano' });
    expect(link.compareDocumentPosition(nano) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(S.started).toHaveLength(0);
  });

  it('works where Files can\'t start programs (no exec, no bash): the studio needs neither', async () => {
    S.exec = false;
    S.probes = { ...S.probes, launcher: null };
    render(<OpenWith target={target} ask={{ kind: 'choose', file: db() }} onClose={() => undefined} />);
    expect(await screen.findByText('Database')).toBeInTheDocument();
    expect(studioOf()).toHaveAttribute('href', sqliteStudioUrl(target, '/home/user/shop.db'));
  });

  it('the Preview\'s top action for a database is Open in SQLite Studio, even without exec; nothing is started', async () => {
    S.exec = false;
    const onOpen = vi.fn();
    render(<OpenTop target={target} file={file({ name: 'Shop.SQLITE3' })} decodedText={false} onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: /Open in SQLite Studio/ });
    expect(link).toHaveAttribute('href', sqliteStudioUrl(target, '/home/user/Shop.SQLITE3'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(S.started).toHaveLength(0);
  });

  it('the Preview\'s studio link sends no program check (probes off)', () => {
    S.probeOn = [];
    render(<OpenTop target={target} file={db()} decodedText={false} onOpen={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Open in SQLite Studio/ })).toBeInTheDocument();
    expect(S.probeOn.length).toBeGreaterThan(0);
    expect(S.probeOn.every((on) => !on)).toBe(true);
  });

  it('a database path the studio refuses (? or # anywhere) keeps the programs: no studio row, the Preview\'s top is the program', async () => {
    for (const name of ['a#b.db', 'a?b.db']) {
      S.probeOn = [];
      const top = render(<OpenTop target={target} file={file({ name })} decodedText={false} onOpen={vi.fn()} />);
      expect(screen.queryByRole('link', { name: /SQLite Studio/ })).toBeNull();
      expect(await screen.findByRole('button', { name: 'Open in Nano' })).toBeInTheDocument();
      expect(S.probeOn.at(-1)).toBe(true);
      top.unmount();
      const chooser = render(<OpenWith target={target} ask={{ kind: 'choose', file: file({ name }) }} onClose={() => undefined} />);
      expect(await screen.findByRole('button', { name: 'Open in Nano' })).toBeInTheDocument();
      expect(screen.queryByText('Database')).toBeNull();
      chooser.unmount();
    }
    const dir = { ...file({ name: 'shop.db' }), path: '/srv/a#b/shop.db' };
    render(<OpenTop target={target} file={dir} decodedText={false} onOpen={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /SQLite Studio/ })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Open in Nano' })).toBeInTheDocument();
  });

  it('only a regular file: a symlink named .db has no studio in either surface', async () => {
    const link = file({ name: 'shop.db', type: 'symlink' });
    const chooser = render(<OpenWith target={target} ask={{ kind: 'choose', file: link }} onClose={() => undefined} />);
    expect((await screen.findAllByRole('button')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Database')).toBeNull();
    chooser.unmount();
    render(<OpenTop target={target} file={link} decodedText={false} onOpen={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /SQLite Studio/ })).toBeNull();
  });

  it('a file that is not a database has no studio row or top link', async () => {
    render(<OpenWith target={target} ask={{ kind: 'choose', file: file() }} onClose={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Open in Nano' })).toBeInTheDocument();
    expect(screen.queryByText('Database')).toBeNull();
    expect(screen.queryByRole('link', { name: /SQLite Studio/ })).toBeNull();
  });
});
