// Fake-API states of the apps page for hub:dev, hub:shots, tests and specs.
import { fixtureWorld } from '@core';
import { defineFixtures, type QueryAnswer } from '@app/fixtures';
import type { Computer, SourceRead } from './data';
import type { Candidate, OpenApp, Starter } from './logic';
import { openWithFixtureRules } from './launch/openWith/fixtureRules';

const NOW = Date.now();
const MIN = 60000;

// The shell's current computer from core's fixture world: never a page-made name.
const computer: Computer = { name: fixtureWorld.current.name, status: 'running' };

const starter = (s: Partial<Starter> & { id: string; name: string }): Starter => ({ description: '', opensIn: 'web', available: true, shares: false, ...s });

const catalog: Starter[] = [
  starter({ id: 'jupyterlab', name: 'JupyterLab', description: 'Notebooks in the browser', opensIn: 'web' }),
  starter({ id: 'code-server', name: 'VS Code', description: 'A code editor in the browser', opensIn: 'web' }),
  starter({ id: 'miniserve', name: 'Shared folder', description: 'Share files with a link', opensIn: 'web', shares: true }),
  starter({ id: 'firefox', name: 'Firefox', description: 'A web browser on the computer screen', opensIn: 'screen' }),
  starter({ id: 'htop', name: 'htop', description: 'See what the computer is doing', opensIn: 'terminal' }),
  starter({ id: 'btop', name: 'btop', description: 'A resource monitor', opensIn: 'terminal' }),
  starter({ id: 'open-webui', name: 'Open WebUI', description: 'Chat with local models', opensIn: 'web', available: false }),
  starter({ id: 'vlc', name: 'VLC', description: 'Play any video', opensIn: 'screen', available: false }),
];

// The run kit's starter catalogue ids, in its order: copied from its starter catalogue (version 1).
// categories.test.ts pins categories.ts to them. The `catalog` above is a separate, made-up set.
export const starterIds: readonly string[] = ['firefox', 'mousepad', 'vscodium', 'gimp', 'pcmanfm', 'htop', 'ncdu', 'btop', 'jupyterlab', 'miniserve'];

const app = (o: Partial<OpenApp> & { key: string; name: string }): OpenApp => ({
  opensIn: 'web',
  state: 'ready',
  terminal: 15001,
  handle: `${o.key}${o.key}${o.key}`.slice(0, 16),
  source: 'Registry',
  command: '',
  settings: [],
  urls: {},
  startedAt: NOW - 20 * MIN,
  ...o,
});

const opened: OpenApp[] = [
  app({ key: 'a1b2c3', name: 'JupyterLab', catalogId: 'jupyterlab', app: 'jupyterlab', state: 'ready', terminal: 15003, command: 'jupyter lab --no-browser --port 18888', settings: ['JUPYTER_PORT'], urls: { web: 'https://18888-atlas.example.invalid/lab', terminal: 'https://15003-atlas.example.invalid/' }, asksCode: true, startedAt: NOW - 8 * MIN }),
  app({ key: 'b2c3d4', name: 'htop', catalogId: 'htop', app: 'htop', opensIn: 'terminal', state: 'ready', terminal: 15004, urls: { terminal: 'https://15004-atlas.example.invalid/' }, source: 'Installed', command: '/usr/bin/htop', startedAt: NOW - 90 * MIN }),
  app({ key: 'c3d4e5', name: 'Firefox', catalogId: 'firefox', app: 'firefox', opensIn: 'screen', state: 'running', terminal: 15005, urls: { screen: 'https://15005-atlas.example.invalid/screen', terminal: 'https://15005-atlas.example.invalid/' }, source: 'Installed', command: '/usr/bin/firefox', startedAt: NOW - 2 * MIN }),
  app({ key: 'd4e5f6', name: 'VS Code', catalogId: 'code-server', app: 'code-server', state: 'starting', terminal: 15006, command: 'code-server --bind-addr 0.0.0.0:18080', startedAt: NOW - 20000 }),
  app({ key: 'e5f6a7', name: 'Shared folder', catalogId: 'miniserve', app: 'miniserve', state: 'stopped', terminal: 15007, command: 'miniserve /home/user/Shared', urls: { web: 'https://18081-atlas.example.invalid/' }, startedAt: NOW - 5 * 60 * MIN }),
  app({ key: 'f6a7b8', name: 'btop', catalogId: 'btop', app: 'btop', opensIn: 'terminal', state: 'exited', exitCode: 1, terminal: 15008, source: 'Installed', command: '/usr/bin/btop', startedAt: NOW - 26 * 60 * MIN }),
  app({ key: 'a7b8c9', name: 'sqlite-web', app: 'sqlite-web', state: 'unknown', code: 'start_unconfirmed', terminal: 15009, source: 'pkgx', command: 'sqlite_web data.db', settings: ['DB_PATH', 'READ_ONLY'], startedAt: NOW - 3 * MIN }),
  app({ key: 'b8c9d0', name: 'Open WebUI', catalogId: 'open-webui', app: 'open-webui', state: 'not_started', code: 'port_in_use', terminal: null, command: 'open-webui serve --port 18080', startedAt: NOW - 40 * MIN }),
];

const cand = (c: Partial<Candidate> & { candidateId: string; title: string; provider: Candidate['provider'] }): Candidate => ({
  app: '',
  setId: 'set-1',
  description: '',
  kind: 'any',
  source: '',
  version: '',
  attr: '',
  path: '',
  tags: [],
  ...c,
});

const read = (rows: Candidate[], o: Partial<SourceRead> = {}): SourceRead => ({ rows, partial: false, warming: false, failed: false, ...o });

const sys = read([cand({ candidateId: 's1', title: 'jupyter-notebook', provider: 'system', path: '/usr/local/bin/jupyter-notebook', description: 'Jupyter notebook server, a terminal-based tool', source: 'PATH' })]);
const registry = read([cand({ candidateId: 'r1', title: 'JupyterLab', provider: 'registry', source: 'hoody', version: '4.2.5', starterId: 'jupyterlab', starterOpens: 'web', description: 'Notebooks in the browser' })]);
const nix = read([
  cand({ candidateId: 'n1', title: 'jupyter', provider: 'nix', source: 'nixpkgs', version: '1.1.1', attr: 'jupyter', description: 'Multi-user version of the Jupyter notebook, a command-line tool' }),
  cand({ candidateId: 'n2', title: 'jupyterlab', provider: 'nix', source: 'nixpkgs', version: '4.2.5', attr: 'python3Packages.jupyterlab', description: 'Jupyter lab environment notebook server extension' }),
  cand({ candidateId: 'n3', title: 'jupyter-core', provider: 'nix', source: 'nixpkgs', version: '5.7.2', attr: 'python3Packages.jupyter-core', description: 'Base package on which Jupyter projects rely, a library' }),
  cand({ candidateId: 'n4', title: 'jupytext-nvim', provider: 'nix', source: 'nixpkgs', version: '0.2', attr: 'vimPlugins.jupytext-nvim', description: 'Vim plugin for jupyter notebooks' }),
]);
const pkgx = read([cand({ candidateId: 'p1', title: 'jupyter', provider: 'pkgx', source: 'pkgx.dev', version: '1.0.0', description: 'Jupyter notebooks, a command-line tool' })]);
const appimage = read([]);
const oci = read([cand({ candidateId: 'o1', title: 'jupyter/base-notebook', provider: 'oci', source: 'quay.io', version: 'latest', description: 'Base image for Jupyter notebooks' })]);

// The coding agents' system-source answers, per program name (data.ts useAgentSearch): one of each badge. Claude Code
// is installed, Codex CLI is not, Gemini CLI's answer came in part and OpenCode's source failed (both "Couldn't check").
const agents: Record<string, SourceRead> = {
  claude: read([cand({ candidateId: 'system:/usr/local/bin/claude', title: 'claude', provider: 'system', path: '/usr/local/bin/claude', source: 'system' })]),
  codex: read([]),
  gemini: read([], { partial: true }),
  opencode: read([], { failed: true }),
};

const searches = (o: Partial<Record<`search.${'system' | 'registry' | 'nix' | 'pkgx' | 'appimage' | 'oci'}`, QueryAnswer>> = {}): Record<string, QueryAnswer> => ({
  'search.system': { data: sys, delayMs: 150 },
  'search.registry': { data: registry, delayMs: 300 },
  'search.nix': { data: nix, delayMs: 600 },
  'search.pkgx': { data: pkgx, delayMs: 450 },
  'search.appimage': { data: appimage, delayMs: 250 },
  'search.oci': { data: oci, delayMs: 800 },
  ...o,
});

const acts = {
  launch: { outcome: 'done' as const, data: { state: 'ready' as const, accessCode: 'k7Gd-92xQ-LmPz' } },
  stop: { outcome: 'done' as const, data: { state: 'stopped' as const } },
  check: { outcome: 'done' as const, data: { state: 'ready' as const } },
  restart: { outcome: 'done' as const, data: { state: 'starting' as const, accessCode: 'p3Rw-18vNa-Ty0e' } },
  forget: { outcome: 'done' as const },
};

// Open with's checks (stat and the bash search) answer on any page that shows the drawer (Files).
const base = { computer: { data: computer }, catalog: { data: catalog }, opened: { data: opened }, board: { data: {} }, ...searches(), agents: { data: agents, delayMs: 200 }, ...acts, rules: openWithFixtureRules };

export default defineFixtures({
  default: 'many',
  states: {
    many: base,
    // More open apps than one page (50): the pager and ?page.
    long: {
      ...base,
      opened: {
        data: [
          ...opened,
          ...Array.from({ length: 60 }, (_, i) => app({ key: `e${String(i).padStart(5, '0')}`, name: `notebook-${String(i + 1).padStart(2, '0')}`, app: 'jupyterlab', state: 'stopped', terminal: 15100 + i, startedAt: NOW - (60 + i) * MIN })),
        ],
      },
    },
    'no-open': { ...base, opened: { data: [] } },
    loading: { ...base, catalog: { pending: true }, opened: { pending: true } },
    'catalog-failed': { ...base, opened: { data: [] }, catalog: { error: 'server' } },
    'catalog-empty': { ...base, opened: { data: [] }, catalog: { data: [] } },
    'open-error': { ...base, opened: { error: 'network' } },
    'no-computer': { ...base, computer: { data: null } },
    stopped: { ...base, computer: { data: { name: fixtureWorld.current.name, status: 'stopped' } } },
    'search-searching': { ...base, ...searches({ 'search.nix': { pending: true }, 'search.oci': { pending: true } }) },
    'search-mixed': {
      ...base,
      ...searches({ 'search.nix': { error: 'server' }, 'search.pkgx': { data: read(pkgx.rows, { warming: true }), delayMs: 450 }, 'search.oci': { data: read(oci.rows, { partial: true }), delayMs: 800 } }),
    },
    'search-none': { ...base, ...searches({ 'search.system': { data: read([]) }, 'search.registry': { data: read([]) }, 'search.nix': { data: read([]) }, 'search.pkgx': { data: read([]) }, 'search.oci': { data: read([]) } }), catalog: { data: [] } },
    'search-down': {
      ...base,
      catalog: { data: [] },
      ...searches({ 'search.system': { error: 'server' }, 'search.registry': { error: 'server' }, 'search.nix': { error: 'network' }, 'search.pkgx': { error: 'server' }, 'search.appimage': { error: 'server' }, 'search.oci': { error: 'server' } }),
    },
    'launch-pending': { ...base, opened: { data: [] }, launch: { outcome: 'pending' as const } },
    'launch-failed': { ...base, opened: { data: [] }, launch: { outcome: 'failed' as const, code: 'couldnt_start' } },
    'launch-port': { ...base, opened: { data: [] }, launch: { outcome: 'failed' as const, code: 'port_in_use' } },
    'launch-refused': { ...base, opened: { data: [] }, launch: { outcome: 'not_sent' as const, code: 'needs_update' } },
    'stop-pending': { ...base, stop: { outcome: 'pending' as const } },
    'stop-failed': { ...base, stop: { outcome: 'failed' as const, code: 'stop_failed' } },
    'check-pending': { ...base, check: { outcome: 'pending' as const } },
    // A Check still waiting for its answer: the row is busy (one action per row; Stop may still go ahead).
    'check-slow': { ...base, check: { outcome: 'done' as const, delayMs: 600000 } },
    // The details' Board row: htop has a place on the Board; JupyterLab's terminal is one the Board can't show.
    board: { ...base, board: { data: { b2c3d4: { to: '/board?add=terminal&session=15004' }, a1b2c3: { refused: { kind: 'terminal' as const, session: 15003 } } } } },
    // A JupyterLab copy whose Open is not read back: a second Open shows the held note and starts nothing.
    held: { ...base, opened: { data: opened.map((o) => (o.key === 'a1b2c3' ? { ...o, state: 'unknown' as const, code: 'start_unconfirmed' } : o)) } },
    // A source-warming launch and one a newer Open replaced ("Replaced", never "Cancelled").
    warming: {
      ...base,
      opened: {
        data: [
          app({ key: 'd0e1f2', name: 'Grafana', app: 'grafana', state: 'not_started', code: 'source_warming', terminal: null, source: 'Nix', startedAt: NOW - 20000 }),
          app({ key: 'e1f2a3', name: 'VS Code', catalogId: 'code-server', app: 'code-server', state: 'not_started', code: 'replaced', terminal: null, startedAt: NOW - 3 * MIN }),
          ...opened,
        ],
      },
    },
    // After a reload: a stored row while it is read back (no banner, only "Checking …").
    reading: { ...base, opened: { data: [...opened, app({ key: 'c9d0e1', name: 'Gitea', catalogId: 'gitea', app: 'gitea', state: 'unknown', code: 'checking', terminal: 15010, command: '', startedAt: NOW - 30 * MIN })] } },
  },
});
