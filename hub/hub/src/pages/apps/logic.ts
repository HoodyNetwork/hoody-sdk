// Pure rules of the apps page: what a search finds and how it ranks,
// where an app opens, whether a candidate is an app at all, the options check, and what a launch looks like.
// No DOM, no network. The route allowlist, the opening tab, the step machine and the secrets holder belong
// to core, not to this page.
import { utf8Bytes } from '@core/pure';

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────

export type Opens = 'screen' | 'terminal' | 'web';
export const FIND_SOURCES = ['system', 'registry', 'nix', 'pkgx', 'appimage', 'oci'] as const;
export type FindSource = (typeof FIND_SOURCES)[number];
export type Provider = FindSource | 'other';
/** A query shorter than this searches the ready-to-open list only. */
export const FIND_MIN = 2;
/** A source that is warming up is asked again after this long, the wait doubling on each answer that is still
 *  warming, up to WARM_RETRY_MAX_MS. */
export const WARM_RETRY_MS = 10000;
export const WARM_RETRY_MAX_MS = 60000;
/** How many times a source that stays warming is asked again by itself (about 6 minutes in all). After that it reads
 *  as not answering, with its Try again. */
export const WARM_RETRIES = 8;
/** Starters whose Open first says who can see what they serve. */
export const SHARES: readonly string[] = ['miniserve'];
/** Starter secrets the core generates; a caller may not set them. */
const STARTER_SECRETS: readonly string[] = ['JUPYTER_TOKEN'];
export const LIMITS = { args: 64, argBytes: 4096, envNames: 64, envBytes: 64 * 1024, query: 200 } as const;

const words = (list: string): ReadonlySet<string> => new Set(list.split(' ').filter(Boolean));

// ── Candidates ──────────────────────────────────────────────────────────────────────────

export interface Starter {
  id: string;
  name: string;
  description: string;
  opensIn: Opens;
  /** Whether this computer can open it now. */
  available: boolean;
  /** Anyone with the link can see what it serves. */
  shares: boolean;
  ord?: number;
}

/** One search answer's candidate, as core hands it over (checked and cut already). */
export interface Candidate {
  app: string;
  setId: string;
  candidateId: string;
  title: string;
  description: string;
  kind: 'gui' | 'cli' | 'any';
  provider: Provider;
  source: string;
  version: string;
  attr: string;
  path: string;
  tags: string[];
  starterId?: string;
  starterOpens?: Opens | '';
}

/** A literal absolute path to a program: '/' first, no NUL, at most 4096 characters. No character allowlist: argv is
 *  passed as words, never read by a shell, so '@', spaces or non-ASCII names are paths like any other. */
const isProgramPath = (p: unknown): p is string => typeof p === 'string' && p.length <= 4096 && p.startsWith('/') && !p.includes('\0');

/** The program a search answer's candidate runs, and how many arguments its plan gives it. hoody-run's candidate has
 *  no `path`: an argv plan names the absolute binary first (the system provider sends it alone).
 *  Any other plan names none (run_plan.command is shell text; a shell-inline plan is words
 *  for a shell), and a `path` a kit also sends must name the same binary. One rule for the search rows (data.ts) and
 *  Open with's bash launcher (launch/openWith/probes.ts). */
export function argvProgramOf(c: Record<string, unknown>): { path: string; args: number } | null {
  const ep = c.execution_plan && typeof c.execution_plan === 'object' ? (c.execution_plan as Record<string, unknown>) : null;
  if (!ep || ep.mode !== 'argv' || !Array.isArray(ep.argv) || ep.argv.length === 0) return null;
  const exe: unknown = ep.argv[0];
  if (!isProgramPath(exe)) return null;
  return c.path === undefined || c.path === exe ? { path: exe, args: ep.argv.length - 1 } : null;
}

export type Evidence = 'server' | 'known' | 'text' | null;
export interface Row extends Candidate {
  opensIn: Opens | 'unknown';
  by: Evidence;
  /** true: an app; false: a library, plugin or data; null: not sure. */
  runnable: boolean | null;
}

// Programs known to open a window / to run in a terminal, by the name the program goes by.
const GUI_APPS = words(
  'xterm uxterm urxvt rxvt rxvt-unicode lxterminal roxterm gnome-terminal konsole alacritty kitty wezterm foot terminator tilix xfce4-terminal mate-terminal sakura ' +
    'firefox chromium chrome google-chrome brave vivaldi epiphany gimp inkscape blender krita vlc audacity libreoffice thunderbird evince okular gedit kate mousepad pluma geany code codium vscodium ' +
    'gparted nautilus thunar dolphin pcmanfm obs obs-studio steam discord slack telegram-desktop signal-desktop element-desktop keepassxc meld wireshark filezilla qbittorrent eog feh ' +
    'xeyes xclock xcalc xedit xfontsel xmessage xlogo glxgears gnome-calculator gnome-system-monitor',
);
const CLI_APPS = words(
  'htop btop top vim vi nvim nano less more tmux screen git curl wget jq yq ripgrep rg fd fzf bat tree ncdu mc ranger lazygit bash zsh fish sh python python3 node bun deno ' +
    'ruby perl go rustc cargo gcc make cmake ffmpeg sqlite3 psql redis-cli docker kubectl terraform ssh scp rsync tar gzip zip unzip ls cat grep sed awk',
);
const GUI_TEXT = /\bx window system\b|\bx11\b|\bwayland\b|\b(gtk|qt)\d?\b|\bgui\b|\bgraphical\b|\bterminal emulator\b|\bweb browser\b|\bimage editor\b|\bvideo player\b|\bdesktop (environment|application)\b/i;
const CLI_TEXT = /\bcommand[- ]?line\b|\bcli\b|\btui\b|\bncurses\b|\bcurses\b|\bterminal[- ]based\b|\bterminal (ui|user interface|tool|utility)\b|\bshell\b/i;

/** Names are the program's own: lower case, without a "(source)" suffix or a directory. */
const ident = (s: string | undefined): string => String(s ?? '').toLowerCase().replace(/\s*\(.*$/, '').replace(/^.*\//, '').trim();

/**
 * Where a candidate opens, and what says so. The resolver's own kind first (an image always opens in a terminal),
 * then the known lists, then the description when it says one thing. Never a default of "terminal".
 */
export function kindOf(c: Pick<Candidate, 'provider' | 'kind' | 'title' | 'attr' | 'path' | 'description' | 'tags'>): { opensIn: Opens | 'unknown'; by: Evidence } {
  if (c.provider === 'oci') return { opensIn: 'terminal', by: 'server' };
  if (c.kind === 'gui') return { opensIn: 'screen', by: 'server' };
  if (c.kind === 'cli') return { opensIn: 'terminal', by: 'server' };
  for (const n of [ident(c.title), ident(c.attr.split('.').pop()), ident(c.path)]) {
    if (n && GUI_APPS.has(n)) return { opensIn: 'screen', by: 'known' };
    if (n && CLI_APPS.has(n)) return { opensIn: 'terminal', by: 'known' };
  }
  const text = `${c.description} ${c.tags.join(' ')}`;
  const g = GUI_TEXT.test(text);
  const t = CLI_TEXT.test(text);
  return g !== t ? { opensIn: g ? 'screen' : 'terminal', by: 'text' } : { opensIn: 'unknown', by: null };
}
const KIND_RANK: Record<string, number> = { server: 3, known: 2, text: 1 };

const PLUGIN_SETS = /^(vimplugins?|neovimplugins|emacspackages|fishplugins|zshplugins|gnomeextensions|vscode-extensions|tree-sitter-grammars|texlivepackages|nerd-fonts|noto-fonts[a-z-]*)$/;
const LANG_SETS = /^(python[0-9]*packages|python[0-9]+|perl[0-9]*packages|ruby[a-z0-9_]*packages|haskell[a-z0-9]*packages|ocaml[a-z0-9_]*packages|nodepackages[a-z0-9_]*|lua[a-z0-9_]*packages|elmpackages|coqpackages|agdapackages|rpackages|php[0-9]*packages|beampackages|erlang[a-z0-9]*packages|elixir[a-z0-9]*packages|cudapackages|rocmpackages|linuxpackages[a-z0-9_]*)$/;
const NOT_APP_NAME = /^(vimplugin-.+|.+\.n?vim|(python|perl|ruby|lua|ocaml|haskell)[0-9]+(\.[0-9]+)*-.+|(font|fonts|otf|ttf)-.+|.+-(fonts?|icons?|icon-theme|themes?|wallpapers?|headers|data))$/i;
const NOT_APP_TEXT = /\b(library|libraries)\b(?!\s+(manager|management|app|application|viewer|browser|organi[sz]er|server|software|tool))|\bbindings?\b|\bplugins? (for|to)\b|\b(extension|add-?on)s? (for|to)\b|\b(vs ?code|visual studio code) (extension|plugin)s?\b|\bkernel modules?\b|\b(vim|neovim|emacs|gimp|obs|jenkins) plugin\b|\bfonts? (family|collection|for)\b|\btypeface\b|\b(icon|gtk|cursor) themes?\b|\bwallpapers?\b|\bheader files\b|\b(python|perl) (module|package)\b/i;
const EXE_TEXT = /\b(command[- ]?line|cli|terminal|console)\b(?:\s+[\w-]+){0,2}\s+(tool|utility|program|client|application|app|frontend|version)s?\b|\btui\b|\b(terminal|ncurses|curses)[- ]based\b/i;
const INCIDENTAL = /\b(for|building|writing|creating|making|using|to|of|in)\s+(?:an?\s+|the\s+|many\s+)?$/i;
const TOOL_AND = /\b(tool|utility|program|client|application|app)s?\s*(?:,|&|\+|\/|and)\s*$/i;

/**
 * Whether a candidate is something to open: true, false, or null (not sure). Installed programs, registry entries and
 * images are runnable by what they are; the rest is withdrawn by evidence against (plugin sets, library wording) and
 * restored by a tool word that comes first. A package in a language set without a word either way is "not sure":
 * listed with the tools, without Open, never hidden.
 */
export function runnableOf(c: Pick<Candidate, 'provider' | 'kind' | 'title' | 'attr' | 'description'>): boolean | null {
  if (c.provider === 'system' || c.provider === 'registry' || c.provider === 'oci') return true;
  const set = c.attr.includes('.') ? (c.attr.split('.')[0] ?? '').toLowerCase() : '';
  const mixed = !!set && LANG_SETS.test(set);
  const names = [ident(c.title)];
  if (mixed) names.push(ident(c.attr.split('.').pop()));
  if (c.kind === 'gui' || c.kind === 'cli') return true;
  if (set && PLUGIN_SETS.test(set)) return false;
  if (names.some((n) => n && (GUI_APPS.has(n) || CLI_APPS.has(n)))) return true;
  const text = c.description;
  if (NOT_APP_NAME.test(c.title)) return false;
  const exe = EXE_TEXT.exec(text);
  const lib = NOT_APP_TEXT.exec(text);
  if (lib) {
    if (exe && exe.index < lib.index) return true;
    if (TOOL_AND.test(text.slice(0, lib.index))) return true;
    return exe ? null : false;
  }
  if (exe && !INCIDENTAL.test(text.slice(0, exe.index))) return true;
  return mixed ? null : true;
}

/** A candidate with its opening kind and whether it is an app. */
export function classify(c: Candidate): Row {
  const k = kindOf(c);
  return { ...c, opensIn: k.opensIn, by: k.by, runnable: runnableOf(c) };
}

// ── Finding ─────────────────────────────────────────────────────────────────────────────

export type SourceState = 'searching' | 'done' | 'failed';
export interface SourceAnswer {
  state: SourceState;
  rows: Row[];
  /** Some of its backends did not answer. */
  partial: boolean;
  /** Warming up: asked again by itself. */
  warming: boolean;
}
export type Find = Partial<Record<FindSource, SourceAnswer>>;

export interface Item {
  type: 'starter' | 'row';
  name: string;
  /** Starter id, or the candidate id of a row. */
  id: string;
  description: string;
  opensIn: Opens | 'unknown';
  by: Evidence;
  provider: Provider | null;
  version: string;
  attr: string;
  path: string;
  sourceId: string;
  setId: string;
  app: string;
  shares: boolean;
  runnable: boolean;
  /** Not sure it is an app: listed, without Open. */
  unsure: boolean;
  installed: boolean;
  also: string[];
  ready: boolean;
  tier: number;
  ord: number;
  group: 0 | 1;
  /** What tells two rows of one name apart. */
  detail: string;
  /** Opened from a coding agent's card (agents.ts): that agent's id, stamped there and never derived from a name. */
  agent?: string;
  /** A Files launch's purpose marker (Open with, Run in a terminal, a folder launch). Its
   *  presence marks the launch: it opens only from the request openWith's toLaunch built (live.ts sealLaunch). */
  p?: string;
  /** The Open-with identity hash of a marked launch, never a path. */
  subject?: string;
}

/** What a row says about getting it: already on this computer, a starter that opens as is, one
 *  this computer can't open, or a source that downloads it first. A row whose source is not known says nothing. */
export type Availability = 'installed' | 'ready' | 'unavailable' | 'downloads' | 'unknown';
const AVAILABILITY: Readonly<Record<Provider, Availability>> = { system: 'installed', registry: 'downloads', nix: 'downloads', pkgx: 'downloads', appimage: 'downloads', oci: 'downloads', other: 'unknown' };
export function availability(i: Pick<Item, 'type' | 'provider' | 'ready'>): Availability {
  if (i.type === 'starter') return i.ready ? 'ready' : 'unavailable';
  return i.provider ? AVAILABILITY[i.provider] : 'unknown';
}

/** A Files launch's purposes. A stored marker this Hub does not know (a newer Hub's) still marks the row. */
export const PURPOSES = ['tpl', 'cmd', 'run', 'here', 'apphere'] as const;
export type Purpose = (typeof PURPOSES)[number];
/** A row or item launched from Files: it relaunches only through its plan, never by its stored name. */
export const marked = (r: { p?: string | undefined }): boolean => r.p !== undefined;

/** `count`: the rows this source adds to the list as shown (a row two sources return counts for the first; a hidden row
 *  counts once shown), so the chips and `catalogue` add up to the list's length. */
export type SourceStatus = { source: FindSource; state: SourceState | 'warming'; count: number; partial: boolean };

export interface FindResult {
  list: Item[];
  ready: Item[];
  rest: Item[];
  hidden: number;
  searching: boolean;
  noneReady: boolean;
  statuses: SourceStatus[];
  /** The catalogue's apps in the list as shown (the "Ready to install" chip): with the sources' counts, the list's length. */
  catalogue: number;
}

/** How a name ranks for the query: exact, installed, starts with, contains. */
export function tierOf(name: string, installed: boolean, q: string): number {
  const n = name.toLowerCase();
  const k = q.trim().toLowerCase();
  if (n === k) return 0;
  if (installed) return 1;
  if (n.startsWith(k)) return 2;
  return n.includes(k) ? 3 : 4;
}

const dedupeKey = (r: Row): string => [r.provider, r.source, r.title.toLowerCase(), r.version, r.attr, r.path].join('\u0000');
const nixTwin = (sys: Row, rows: readonly Row[]): Row | null => rows.find((r) => r.provider === 'nix' && r.title.toLowerCase() === sys.title.toLowerCase() && !r.attr.includes('.')) ?? null;

export function newFind(): Find {
  const out: Find = {};
  for (const k of FIND_SOURCES) out[k] = { state: 'searching', rows: [], partial: false, warming: false };
  return out;
}

/**
 * The list for a query from what has answered so far. One ranking over the catalogue's apps and every source's
 * results (exact name, installed, prefix, substring), told apart afterwards as ready (starters and installed) and
 * the rest. `all` also lists what cannot be opened. "Nothing ready" is said only once every source has answered
 * and the catalogue has (`pending`).
 */
export function findView(q: string, starters: readonly Starter[], src: Find, o: { all?: boolean; pending?: boolean } = {}): FindResult {
  const kinds = FIND_SOURCES.filter((k) => src[k]);
  const flat: { row: Row; kind: FindSource; ord: number; skip?: boolean; also?: string[]; kindFrom?: { opensIn: Opens | 'unknown'; by: Evidence } }[] = [];
  const seen = new Set<string>();
  kinds.forEach((kind, ki) => {
    const s = src[kind];
    if (!s || (s.state !== 'done' && s.state !== 'failed')) return;
    s.rows.forEach((row, ri) => {
      const key = dedupeKey(row);
      if (seen.has(key)) return;
      seen.add(key);
      flat.push({ row, kind, ord: ki * 1000 + ri });
    });
  });
  const rows = flat.map((x) => x.row);
  const folded = new Set<Row>();

  // A starter met as a registry result is the catalogue's own entry: one row, the catalogue card.
  const all: Starter[] = [...starters];
  const ids = new Set(all.map((c) => c.id));
  // Where each listed row came from, for the counts: a starter a source added is that source's; the rest the catalogue's.
  const origin = new Map<string, FindSource>();
  for (const x of flat) {
    const r = x.row;
    if (!r.starterId) continue;
    x.skip = true;
    if (ids.has(r.starterId)) continue;
    ids.add(r.starterId);
    origin.set(r.starterId, x.kind);
    all.push({ id: r.starterId, name: r.title, description: r.description, opensIn: r.starterOpens || 'terminal', available: true, shares: SHARES.includes(r.starterId), ord: 500 + x.ord });
  }
  // An installed program and a catalogue entry of one name are one row: the entry when it can open here, else the program.
  const usable = new Set<string>();
  const dropStarter = new Set<string>();
  for (const c of all) if (c.available) { usable.add(c.name.toLowerCase()); usable.add(c.id.toLowerCase()); }
  for (const x of flat) {
    const r = x.row;
    if (x.skip || r.provider !== 'system') continue;
    const n = r.title.toLowerCase();
    if (usable.has(n)) { x.skip = true; continue; }
    for (const c of all) if (c.name.toLowerCase() === n || c.id.toLowerCase() === n) dropStarter.add(c.id);
  }
  for (const x of flat) {
    const r = x.row;
    if (x.skip || r.provider !== 'system') continue;
    const twin = nixTwin(r, rows);
    if (!twin) continue;
    x.also = ['nix'];
    folded.add(twin);
    const tk = kindOf(twin);
    if ((KIND_RANK[tk.by ?? ''] ?? 0) > (KIND_RANK[r.by ?? ''] ?? 0)) x.kindFrom = tk;
  }

  const items: Item[] = [];
  const from = new Map<Item, FindSource | 'catalogue'>();
  for (const x of flat) {
    const r = x.row;
    if (x.skip || folded.has(r)) continue;
    const kk = x.kindFrom ?? { opensIn: r.opensIn, by: r.by };
    const installed = r.provider === 'system';
    const it: Item = {
      type: 'row', name: r.title, id: r.candidateId, description: r.description, opensIn: kk.opensIn, by: kk.by, provider: r.provider, version: r.version, attr: r.attr, path: r.path,
      sourceId: r.source, setId: r.setId, app: r.app, shares: false, runnable: r.runnable !== false, unsure: r.runnable === null, installed, also: x.also ?? [],
      ready: installed && r.runnable !== false, tier: tierOf(r.title, installed, q), ord: x.ord, group: 1, detail: '',
    };
    items.push(it);
    from.set(it, x.kind);
  }
  all.forEach((c, ci) => {
    if (dropStarter.has(c.id)) return;
    const it: Item = {
      type: 'starter', name: c.name, id: c.id, description: c.description, opensIn: c.opensIn, by: 'server', provider: null, version: '', attr: '', path: '', sourceId: '', setId: '', app: '',
      shares: c.shares, runnable: true, unsure: false, installed: false, also: [], ready: c.available, tier: tierOf(c.name, false, q), ord: c.ord ?? ci, group: 0, detail: '',
    };
    items.push(it);
    from.set(it, origin.get(c.id) ?? 'catalogue');
  });
  items.sort((a, b) => a.tier - b.tier || a.group - b.group || a.ord - b.ord);

  let hidden = 0;
  const shown: Item[] = [];
  for (const it of items) {
    if (!it.runnable && !o.all) hidden++;
    else shown.push(it);
  }
  const count = new Map<string, number>();
  for (const it of shown) count.set(it.name.toLowerCase(), (count.get(it.name.toLowerCase()) ?? 0) + 1);
  for (const it of shown) if ((count.get(it.name.toLowerCase()) ?? 0) > 1) it.detail = [it.attr, it.sourceId, it.version].find((d) => d && d.toLowerCase() !== it.name.toLowerCase()) ?? '';

  const ready = shown.filter((it) => it.type === 'starter' || it.installed);
  const rest = shown.filter((it) => !(it.type === 'starter' || it.installed));
  const searching = kinds.some((k) => src[k]?.state === 'searching');
  const listed = new Map<FindSource | 'catalogue', number>();
  for (const it of shown) {
    const k = from.get(it) ?? 'catalogue';
    listed.set(k, (listed.get(k) ?? 0) + 1);
  }
  return {
    list: shown,
    ready,
    rest,
    hidden,
    searching,
    noneReady: !searching && !o.pending && !ready.some((it) => it.ready),
    statuses: kinds.map((source) => {
      const s = src[source] as SourceAnswer;
      return { source, state: s.state === 'done' && s.warming ? 'warming' : s.state, count: listed.get(source) ?? 0, partial: s.partial };
    }),
    catalogue: listed.get('catalogue') ?? 0,
  };
}

export type NoteKey = 'failed' | 'warming' | 'partial' | 'sourcesDown' | 'none';
export interface FindNote {
  key: NoteKey;
  primary: 'retry' | 'wait' | 'starters' | null;
}

/** What the results say besides their list: a source that did not answer is never "nothing found". */
export function findNote(v: FindResult): FindNote | null {
  if (v.searching) return null;
  const st = v.statuses;
  const failed = st.filter((x) => x.state === 'failed');
  const warming = st.filter((x) => x.state === 'warming');
  const partial = st.some((x) => x.partial);
  const nothing = !v.ready.length && !v.rest.length && !v.hidden;
  if (st.length && failed.length === st.length && nothing) return { key: 'failed', primary: 'retry' };
  if (warming.length) return { key: nothing ? 'warming' : 'partial', primary: 'wait' };
  if (failed.length || partial) return nothing ? { key: 'sourcesDown', primary: 'retry' } : { key: 'partial', primary: failed.length ? 'retry' : null };
  return nothing ? { key: 'none', primary: 'starters' } : null;
}

// ── Options ─────────────────────────────────────────────────────────────────────────────

export interface EnvRow {
  name: string;
  value: string;
}
export type OptionErrorKey = 'argLong' | 'argBad' | 'argMany' | 'nameBad' | 'reserved' | 'nameTwice' | 'valueBad' | 'envBig';
export interface OptionError {
  field: 'args' | 'env';
  /** The line or row; -1 for the whole field. */
  index: number;
  key: OptionErrorKey;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Args: one per line, blank lines dropped. Env: name/value rows, value as typed. Never echoes a value into an error. */
export function options(argsText: string, envRows: readonly EnvRow[]): { args: string[]; env: Record<string, string> } | { errors: OptionError[] } {
  const errors: OptionError[] = [];
  const args: string[] = [];
  const env = new Map<string, string>();
  let names = 0;
  let bytes = 0;
  const lines = argsText ? argsText.split(/\r?\n/) : [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (utf8Bytes(line) > LIMITS.argBytes) errors.push({ field: 'args', index: i, key: 'argLong' });
    else if (line.includes('\u0000')) errors.push({ field: 'args', index: i, key: 'argBad' });
    else args.push(line);
  });
  if (args.length > LIMITS.args) errors.push({ field: 'args', index: -1, key: 'argMany' });
  envRows.forEach((row, j) => {
    const name = row.name.trim();
    if (!name && !row.value) return;
    if (!ENV_NAME.test(name)) return void errors.push({ field: 'env', index: j, key: 'nameBad' });
    if (name.toUpperCase().startsWith('HOODY_') || STARTER_SECRETS.includes(name)) return void errors.push({ field: 'env', index: j, key: 'reserved' });
    if (env.has(name)) return void errors.push({ field: 'env', index: j, key: 'nameTwice' });
    if (row.value.includes('\u0000')) return void errors.push({ field: 'env', index: j, key: 'valueBad' });
    env.set(name, row.value);
    names++;
    bytes += utf8Bytes(row.value);
  });
  if (names > LIMITS.envNames || bytes > LIMITS.envBytes) errors.push({ field: 'env', index: -1, key: 'envBig' });
  // Object.fromEntries writes every name as an own entry: a variable named __proto__ is kept, never taken as the prototype.
  return errors.length ? { errors } : { args, env: Object.fromEntries(env) };
}

// ── What a launch looks like ────────────────────────────────────────────────────────────

export type LaunchState = 'starting' | 'started' | 'running' | 'ready' | 'stopped' | 'exited' | 'not_started' | 'unknown';
export interface Launch {
  state?: LaunchState;
  code?: string;
  exitCode?: number;
  signal?: string;
  ipv6Only?: boolean;
  opensIn?: Opens;
  /** The same app is already running here (for "Switch to it" after a port clash). */
  twin?: boolean;
  stopping?: boolean;
}
export type Action = 'open' | 'terminal' | 'screen' | 'address' | 'stop' | 'stopAgain' | 'check' | 'openAgain' | 'retry' | 'wait' | 'apps' | 'switch' | 'starters' | 'pick' | 'options' | 'plain' | 'files' | 'remove';
export type LaunchTone = 'busy' | 'ok' | 'warn' | 'bad' | 'off';
export interface LaunchView {
  tone: LaunchTone;
  /** A strings key under "st." or "fail." or "find.". */
  key: string;
  primary: Action | null;
  more: Action[];
  /** Keep reading its status. */
  live: boolean;
}

const FAILED: Record<string, [string, Action | null]> = {
  needs_update: ['fail.outdated', null], unreachable: ['fail.unreachable', 'retry'], access_refused: ['fail.access', 'retry'], invalid_options: ['fail.options', 'options'],
  reserved_name: ['fail.reserved', 'options'], no_candidates: ['find.none', 'starters'], sources_unavailable: ['find.sourcesDown', 'retry'], source_warming: ['find.warming', 'wait'],
  policy_denied: ['fail.policy', 'pick'], args_unsupported: ['fail.args', 'plain'], needs_pick: ['fail.pick', 'pick'], resolve_failed: ['fail.lookup', 'retry'],
  too_many_apps: ['fail.tooMany', 'apps'], busy: ['fail.busy', 'retry'], unsafe_setup: ['fail.unsafe', null], staging_unavailable: ['fail.staging', 'retry'],
  couldnt_start: ['fail.start', 'retry'], cancelled: ['fail.cancelled', null], replaced: ['fail.replaced', null], needs_tools: ['fail.tools', 'pick'],
  exec_off: ['fail.execOff', null], warming_manual: ['fail.warmingManual', 'retry'],
  folder_refused: ['fail.folder', null], shell_unsupported: ['fail.shell', 'retry'],
};

/** One launch's state and reason: one copy key, a tone and exactly one primary action. */
export function view(l: Launch): LaunchView {
  const v = (tone: LaunchTone, key: string, primary: Action | null = null, more: Action[] = [], live = false): LaunchView => ({ tone, key, primary, more, live });
  if (l.stopping) return v('busy', 'st.stopping', null, [], true);
  // Its terminal may still be open (the computer didn't confirm it closed): Remove closes it; never Stop, Check or a
  // second start over it.
  if (l.code === 'terminal_left') return v('warn', 'fail.terminalLeft', 'remove', ['terminal']);
  if (l.code === 'terminal_replaced') return v('off', 'st.closed', 'openAgain');
  switch (l.state) {
    case 'starting':
      return v('busy', 'st.starting', null, [], true);
    case 'started':
      return v('busy', 'st.started', 'terminal', ['stop'], true);
    case 'running':
      if (l.ipv6Only) return v('ok', 'st.runningPlain', 'terminal', ['address', 'stop'], true);
      if (l.opensIn === 'screen') return v('busy', 'st.arriving', 'screen', ['stop'], true);
      if (l.opensIn === 'web') return v('busy', 'st.arriving', 'terminal', ['stop'], true);
      return v('ok', 'st.runningPlain', 'open', ['stop'], true);
    case 'ready':
      return v('ok', 'st.ready', 'open', ['stop'], true);
    case 'stopped':
      return v('off', 'st.closed', 'openAgain');
    case 'exited':
      return l.exitCode === 0 && !l.signal ? v('off', 'st.done', 'terminal', ['openAgain']) : v('bad', 'st.error', 'terminal', ['openAgain']);
    case 'not_started':
      return v('bad', 'st.notStarted', 'openAgain');
    case 'unknown':
      switch (l.code) {
        case 'checking': return v('busy', 'st.checking', null, [], true);
        case 'tracker_lost': return v('warn', 'st.lost', 'terminal', ['stop']);
        // Read it back first (C9); Stop again stays in the row's menu.
        case 'stop_unconfirmed': return v('warn', 'st.stopUnsure', 'check', ['stopAgain', 'terminal']);
        case 'other_user': return v('warn', 'st.admin', 'terminal', ['stopAgain']);
        case 'start_unconfirmed': return v('warn', 'st.startUnsure', 'check', ['openAgain']);
        case 'access_refused': return v('warn', 'fail.access', 'check');
        // The record at its handle names another launch: Check only, never a Stop of it.
        case 'foreign_record': return v('warn', 'st.foreign', 'check', ['terminal']);
        case 'unreachable': return v('warn', 'st.noAnswer', 'check', ['terminal']);
        default: return v('warn', 'st.unsure', 'check', ['terminal', 'stop']);
      }
  }
  if (l.code === 'port_in_use') return v('bad', 'fail.portInUse', l.twin ? 'switch' : 'apps');
  // A code is data: only the table's own entries name a failure, never a name its prototype has (toString).
  const f = l.code && Object.hasOwn(FAILED, l.code) ? FAILED[l.code] : undefined;
  if (f) return v(l.code === 'source_warming' ? 'busy' : l.code === 'replaced' ? 'off' : 'bad', f[0], f[1], [], l.code === 'source_warming');
  return v('bad', 'fail.generic', 'retry');
}

/** What one read-back lets an Open do: 'start' (the copy ended), 'live' (it runs: offer it), 'hold' (nothing new starts). */
export function readBack(r: { transient?: boolean; code?: string; state?: string } | null | undefined): 'start' | 'live' | 'hold' {
  if (!r || r.transient) return 'hold';
  if (r.code === 'terminal_replaced' || r.state === 'stopped' || r.state === 'exited' || r.state === 'not_started') return 'start';
  return r.state === 'starting' || r.state === 'started' || r.state === 'running' || r.state === 'ready' ? 'live' : 'hold';
}

// ── The open list ───────────────────────────────────────────────────────────────────────

/** An app opened from here, as the page lists it. Addresses are built by core (https only), never here. */
export interface OpenApp {
  key: string;
  name: string;
  catalogId?: string;
  /** The words to open it again. */
  app?: string;
  opensIn: Opens;
  state: LaunchState;
  code?: string;
  exitCode?: number;
  signal?: string;
  ipv6Only?: boolean;
  /** The number of the terminal it runs in. */
  terminal: number | null;
  /** A short handle, for support. Never a full id. */
  handle: string;
  source: string;
  command: string;
  /** The names of the settings it was given, never their values. */
  settings: string[];
  /** Where it opens, built by core (https only): never built or edited here. */
  urls: { web?: string; screen?: string; terminal?: string };
  /** Its access code was shown and is gone after a reload. */
  asksCode?: boolean;
  startedAt: number;
  /** Live: the computer (its id) it was opened on; the list shows the current computer's rows only. */
  computer?: string;
  /** A search row's own identity (source and candidate id), whatever words found it. */
  candidate?: string;
  /** Opened from a coding agent's card: the agent's id (its words: not installed, its install line). */
  agent?: string;
  /** A Files launch's purpose marker (Item.p): the row relaunches only through its plan (live.ts recoveryFor). */
  p?: string;
  /** This session holds the launch plan of this marked row (live.ts registerRecovery); none after a reload. */
  planned?: boolean;
  /** While its Open is out: the step the machine reported last (resolve, create, execute), as core names it. */
  phase?: string;
}

/** A row whose Open may still be going through: it holds a second Open of the same app (C9). Removing it from
 *  the list lifts that hold, so the page asks first. */
export function heldOpen(r: Pick<OpenApp, 'state'>): boolean {
  // `started`: admitted, not proven running yet; a second copy over it is a double open too.
  return r.state === 'unknown' || r.state === 'starting' || r.state === 'started';
}

/** Before another Open of an app: its copies that still hold an Open (heldOpen). Nothing new starts over them
 *  (C9: two presses must not start two copies). */
export function unresolved(rows: readonly OpenApp[], item: { catalogId?: string; app?: string; candidate?: string }): OpenApp[] {
  return rows.filter((r) => heldOpen(r) && sameApp(r, item));
}

/** One app, by its starter, its search candidate (whatever the query was: "ht" and "htop" find the same
 *  candidate; a coding agent's card opens the same candidate as Search) or its name. Two sides that both
 *  carry a candidate are compared by it alone (codex-helper found by "codex" is not Codex); the name decides only
 *  when one side has none (a reopen by name, a row stored by an earlier version). */
export function sameApp(r: Pick<OpenApp, 'catalogId' | 'app' | 'candidate'>, item: { catalogId?: string; app?: string; candidate?: string }): boolean {
  if (item.catalogId && r.catalogId === item.catalogId) return true;
  if (item.candidate && r.candidate) return r.candidate === item.candidate;
  return !!(item.app && r.app === item.app);
}

/** The identity of a search row's candidate: its source and candidate id. The run kit derives a candidate id from
 *  what the candidate runs, so one program has one id in every answer; the answer's set id is left out, as it
 *  changes with the words searched ("code" and "codex" list Codex in two sets). */
export const candidateOf = (item: Pick<Item, 'type' | 'id' | 'provider'>): string | undefined => (item.type === 'row' && item.id ? `${item.provider ?? ''}:${item.id}` : undefined);

/** The view a row shows: a launch that never started shows its own reason (a source still warming, a newer Open
 *  that replaced it), the rest their state. The list, its filters and the inspector all read this one. */
export function rowView(r: OpenApp, twin = false): LaunchView {
  const failed = r.state === 'not_started' && !!r.code && r.code !== 'terminal_replaced';
  const v = view(failed ? { code: r.code as string, twin } : { state: r.state, ...(r.code ? { code: r.code } : {}), ...(r.exitCode !== undefined ? { exitCode: r.exitCode } : {}), ...(r.signal ? { signal: r.signal } : {}), ...(r.ipv6Only ? { ipv6Only: true } : {}), opensIn: r.opensIn });
  return marked(r) && !r.planned ? fromFiles(v) : v;
}

const RELAUNCH: ReadonlySet<Action> = new Set(['openAgain', 'retry', 'options', 'pick', 'plain']);
/** A marked row without its plan (after a reload): every relaunch becomes Open again from Files, which sends
 *  nothing (the path is never stored, so only Files can start it again). */
function fromFiles(v: LaunchView): LaunchView {
  const primary = v.primary && RELAUNCH.has(v.primary) ? 'files' : v.primary;
  const more = [...new Set(v.more.map((a) => (RELAUNCH.has(a) ? 'files' : a)))].filter((a) => a !== primary);
  return { ...v, primary, more };
}

export const OPEN_FILTERS = ['running', 'stopped', 'attention'] as const;
export type OpenFilter = (typeof OPEN_FILTERS)[number];

export function openMatches(r: OpenApp, f: OpenFilter | undefined): boolean {
  if (!f) return true;
  const tone = rowView(r).tone;
  if (f === 'running') return r.state === 'starting' || r.state === 'started' || r.state === 'running' || r.state === 'ready';
  if (f === 'stopped') return r.state === 'stopped' || r.state === 'exited';
  return tone === 'bad' || tone === 'warn';
}

export const TABS = ['open', 'find'] as const;
export type Tab = (typeof TABS)[number];
export const isTab = (v: string | undefined): v is Tab => !!v && (TABS as readonly string[]).includes(v);
