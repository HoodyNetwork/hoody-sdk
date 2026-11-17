#!/usr/bin/env bun
// The terminal Hub on fixtures, in this terminal, through the same lifecycle the CLI mounts (mountFixtureHub ->
// startTermHub): only the client is the fixture one.
//   bun scripts/term/dev.ts [--page schedules] [--fx <state>] [--path "/schedules?sel=a"] [--strict] [--lax-globals] [--log file] [--web-origin https://host] [--real-clock]
// Fixture flavour: a web-only COMPONENT is drawn as a labelled placeholder; a missing non-visual export throws
// TERM_UNSUPPORTED (the page's error boundary shows it). --strict loads with the ship rules instead (any placeholder,
// web-only module or partial sibling fails the load, naming the module). Diagnostics never reach the terminal raw:
// every line goes through the sanitiser (prim/safe.ts) into --log (default: dropped while the frame is up, printed
// after exit). Ctrl+C is the Hub's own key (asks when something is unsaved; twice leaves; three fast ones end the run).
// Strict globals are ON by default, as in the tests and the ship build: installed FIRST (before any hub module, all
// imported dynamically below), so a DOM global read while modules load traps too, and the mount keeps them on.
// --lax-globals turns them off, for chasing one read at a time only: it prints a banner before the frame, after exit
// and as a receipt line, and the run exits non-zero so a lax run never passes for a clean one. --strict-load is the
// old spelling of the default and changes nothing.
const LAX = process.argv.includes('--lax-globals');
const LAX_BANNER = 'hoody hub dev: LAX GLOBALS (--lax-globals): no DOM-global traps; the ship build and the tests would trap here';
if (LAX) process.stderr.write(LAX_BANNER + '\n');
else await import('../../src/term/env/install-strict');
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import path from 'node:path';
import { fixtureClock } from './clock';
import { installTermLoader } from './loader';
import { SRC } from './resolve';
import { FIXTURE_WEB_ORIGIN } from './fixture-origin';
import { devRoute } from './dev-route';
import { hardInterrupt } from './dev-interrupt';

const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const src = (p: string): string => path.join(SRC, p);
const strict = process.argv.includes('--strict');

// The fixture clock (clock.ts fixtureClock), as goldens: shots taken at any real time draw the same relative times and
// day groups. --real-clock draws on the real clock (watching a page live; never for a shot).
if (!process.argv.includes('--real-clock')) fixtureClock();
installTermLoader({ flavour: strict ? 'strict' : 'fixture', fixtures: true });
// TERM_IDLE_FILE: report the idle signal there for a driver in another process (shots.ts via termshot). The timer
// ledger goes on before react is imported and holds long Hub timers, as in goldens (src/term/app/idle.ts).
const idleFile = process.env.TERM_IDLE_FILE;
const idle = idleFile ? await import(src('term/app/idle.ts')) as typeof import('../../src/term/app/idle') : null;
idle?.trackTimers({ holdLong: true });
const { safeDiagnostic } = await import(src('term/prim/safe.ts')) as typeof import('../../src/term/prim/safe');

// Warnings would be written over the frame: sanitised, to the log file, or held until exit.
const log = arg('log');
const sink = log ? Bun.file(log).writer() : null;
const held: string[] = [];
const note = (...a: unknown[]): void => {
  const line = safeDiagnostic(a.map((x) => (x instanceof Error ? x.stack ?? x.message : String(x))).join(' '), 4000);
  if (sink) { sink.write(line + '\n'); void sink.flush(); } else if (held.length < 200) held.push(line);
};
console.error = console.warn = note;

let entry: typeof import('../../src/term/entry.fixture');
try {
  entry = await import(src('term/entry.fixture.ts')) as typeof import('../../src/term/entry.fixture');
} catch (e) {
  process.stderr.write(safeDiagnostic(`load failed: ${(e as Error).message}`) + '\n');
  process.exit(1);
}
const { discoverPages, visiblePages } = await import(src('app/pages.ts')) as typeof import('../../src/app/pages');
// No --page opens Home (dev-route.ts DEV_DEFAULT_PAGE).
const route = devRoute(arg('page'), arg('path'), visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false }));
let reporter: { wrote(): void; poke(): void; stop(): void } | null = null;
if (idle && idleFile) {
  const core = await import(src('core/index.ts')) as { queryClient: import('@tanstack/react-query').QueryClient };
  const { viewsLoading } = await import(src('term/app/router.tsx')) as typeof import('../../src/term/app/router');
  reporter = idle.startIdleReporter({ queryClient: core.queryClient, views: viewsLoading, file: idleFile });
}
// The class styles from the stylesheets (style-table.ts, cached under .term-cache), each width's table built on first use.
const { stylesFromBands } = await import(src('term/app/styles.ts')) as typeof import('../../src/term/app/styles');
const { bandTables } = await import('./style-table');
const bands = bandTables();
const styles = stylesFromBands(bands.keyFor, bands.tableOf, 'stylesheets');
const ac = new AbortController();
// Ctrl+C is the Hub's key, as under the CLI: it asks first when something is at stake, and a second one leaves
// (src/term/shell/keymap.ts interrupt). Only three within 1.5 s end the run from here, for a Hub that no longer answers.
const interrupted = hardInterrupt();
process.on('SIGINT', () => ac.abort());
const stdin = process.stdin;
if (stdin.isTTY) stdin.setRawMode(true);
let code = 0;
try {
  const receipt = await entry.mountFixtureHub({
    client: entry.fixtureClient({ fx: arg('fx') ?? null }),
    context: { profile: 'dev', realmId: 'all' },
    route,
    io: {
      cells: { write: (s: string) => { reporter?.wrote(); process.stdout.write(s); } },
      input: { onData: (cb) => { const on = (b: Buffer): void => { const s = b.toString('utf8'); reporter?.poke(); if (s === '\u0003' && interrupted()) ac.abort(); else cb(s); }; stdin.on('data', on); return () => { stdin.off('data', on); }; } },
      size: () => ({ cols: process.stdout.columns ?? 120, rows: process.stdout.rows ?? 40 }),
      onResize: (cb0) => { const cb = (): void => { reporter?.poke(); cb0(); }; process.stdout.on('resize', cb); return () => { process.stdout.off('resize', cb); }; },
      colourTier: process.env.NO_COLOR ? 'mono' : 'truecolor',
    },
    onSetDefault: async () => {},
    // The web Hub's origin, as a real host gives it (hand-offs then offer Open, QR and the link); none = path form.
    // Default: the fixed fixture origin (fixture-origin.ts), so hand-offs draw as under a real host; --no-web-origin
    // draws the path form a host without one gets.
    ...(process.argv.includes('--no-web-origin') ? {} : { webOrigin: arg('web-origin') ?? FIXTURE_WEB_ORIGIN }),
    signal: ac.signal,
    styles,
    // Development only: receipt records keep their sanitised message (never set by the CLI or the ship entry).
    diagnosticDetail: true,
    strictGlobals: !LAX,
  });
  // The receipt decides the exit code (a trap, crash or dropped error is non-zero), as for the CLI.
  code = receipt.exitCode;
  if (LAX) { note(`receipt: lax ${LAX_BANNER}`); if (code === 0) code = 3; }
  for (const p of receipt.problems) note(`receipt: ${p.kind} ${p.code}${p.what ? ` ${p.what}` : ''}${p.where?.length ? ` in ${p.where.join(' < ')}` : ''}${(p as { detail?: string }).detail ? ` - ${(p as { detail?: string }).detail}` : ''}`);
} catch (e) {
  note(`mount failed: ${(e as Error).message}`);
  code = 1;
} finally {
  reporter?.stop();
  if (stdin.isTTY) stdin.setRawMode(false);
  // Every strict-globals trap with the first frames of its stack (where a DOM global was read), through note().
  const { activeStrictGlobals } = await import(src('term/env/strict-globals.ts')) as typeof import('../../src/term/env/strict-globals');
  for (const r of activeStrictGlobals()?.ledger() ?? []) note(`strict global ${r.name} read at ${r.stack.split('\n').slice(1, 7).map((l) => l.trim()).join(' | ')}`);
  for (const l of held) process.stderr.write(l + '\n');
  if (LAX) process.stderr.write(LAX_BANNER + '\n');
}
process.exit(code);
