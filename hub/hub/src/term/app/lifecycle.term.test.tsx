// The application lifecycle (lifecycle.ts): one mount = session -> boot -> mount -> dispose, and repeated mounts in one
// process leave nothing behind.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Five mount/quit cycles in one process: live timers, query observers and cached queries, stream and process listeners, open sessions do not grow after the first; per-mount module state (session slots: menus, page failures, loading views; class styles) starts empty in each mount and is gone after it (a menu left open in one is closed in the next) | 'repeated mounts leak nothing' |
// | 2 | Dispose order: app unmounted, queries cleared, core disposed (with the exit's reason), session ended; the session's stores refuse a kept handle | 'dispose' |
// | 3 | A failing boot ends the mount before drawing; its session is ended and core disposed; the end keeps the failure's record, not the raw error | 'boot failure' |
// | 4 | Core ending the session (expired) ends the mount | 'expired' |
// | 6 | Strict globals on: a page that reads a browser global and swallows the error FAILS the mount at once: the run ends as a crash, the terminal is restored, the end names the trap, ok is false | 'strict traps' |
// | 7 | Styles are required: without them the start rejects (TERM_STYLES_REQUIRED) and nothing starts (no session) | 'styles required' |
// | 8 | The mount's styles are installed at the terminal's width class, re-selected on a resize, and removed on dispose | 'styles follow the mount' |
// | 9 | Console output while the mount lives never reaches the terminal: the end keeps allowlisted records (method + code, no text), alone it does not fail the mount, the console is given back after; with diagnosticDetail (dev) the record also keeps the sanitised text | 'console is kept' |
// | 10 | whenIdle settles on a drawn page and names nothing pending | 'when idle' |
// | 11 | The end's safe reason: expired, signed-out (core's own sign-out), suspended (core showed a ban), boot-failed with a record and no message | 'expired', 'end reasons' |
// | 12 | The send gate closes FIRST on every end path (q, abort, a trap's crash): before the page unmounts and before the renderer shuts down; a page's unmount cleanup already finds it closed | 'gate closes first' |
// | 13 | A strict trap DURING boot (no run yet) closes the gate at once, before the boot's start returns; the mount then ends as a crash | 'trap during boot closes the gate' |
// | 14 | A page that looks up window[<canary>]: the end's traps, problems and the terminal output name `window.*`, never the key | 'canary trap in the end' |
// | 5 | Host services: clipboard and browser reach the host only checked (bounded text, http(s) address), and only while the mount lives; absent ones read absent | 'host services' |
// | 16 | The mount's colour tier reaches the engine: a 16-colour mount writes no 24-bit or 256-palette colour to the terminal | 'colour tier reaches the engine' |
// | 15 | A boot dispose failing with several errors (core teardown AND the late-answer drain): the end has one `dispose` record per failure, each its own code, no message text | 'dispose failures each recorded' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { PassThrough, Writable } from 'node:stream';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { hostEnv } from '../../core/host-env';
import { discoverPages, visiblePages } from '../../app/pages';
import { currentTermSession, sessionSlotNames } from '../env/session';
import { openMenu, openMenuNow } from '../shell/menus-store';
import { pageFailures, viewsLoading } from './router';
import { fixtureBoot } from './boot';
import { activeStrictGlobals, expectTraps } from '../env/strict-globals';
import { createElement, useEffect } from 'react';
import { createCliRenderer, type CliRenderer } from '../prim/engine';
import { ensureStrictGlobals, startTermHub, type DisposeReason, type TermBoot, type TermHub } from './lifecycle';
import { UNSTYLED_FOR_TESTS, type TermStyles } from './styles';
import { styleResolver, styleWidthClass, type StyleResolver } from '../jsx/style';

setDefaultTimeout(120_000);

// A failed test must not leave its session open for the next.
afterEach(() => { currentTermSession()?.end(); });

const pages: readonly PageManifest[] = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function streams(cols = 100, rows = 30, colsOf?: () => number) {
  let out = '';
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const w = new Writable({ write(c, _e, done) { out += String(c); done(); } });
  Object.defineProperties(w, { isTTY: { value: true }, columns: { get: () => (colsOf ? colsOf() : cols) }, rows: { get: () => rows } });
  return { stdin, stdout: w as unknown as NodeJS.WriteStream, text: () => out };
}
// The renderer writes only the cells that changed and moves the cursor between them: a cursor move reads as a space
// (else words of a diffed frame run together), and runs of spaces read as one.
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*[ABCDEFGHf]/g, ' ').replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g, '').replace(/[ \t]+/g, ' ');

/** Live timers, counted from here on (a timeout leaves the count when it fires or is cleared). */
function timerCensus() {
  const live = new Map<unknown, string>();
  const g = globalThis as unknown as Record<string, (...a: unknown[]) => unknown>;
  const orig = { st: g.setTimeout!, si: g.setInterval!, ct: g.clearTimeout!, ci: g.clearInterval! };
  g.setTimeout = (fn: unknown, ms?: unknown, ...rest: unknown[]) => {
    const h: unknown = orig.st((...a: unknown[]) => { live.delete(h); (fn as (...a: unknown[]) => void)(...a); }, ms, ...rest);
    live.set(h, new Error().stack ?? '');
    return h;
  };
  g.setInterval = (...a: unknown[]) => { const h = orig.si(...a); live.set(h, new Error().stack ?? ''); return h; };
  g.clearTimeout = (h: unknown) => { live.delete(h); return orig.ct(h); };
  g.clearInterval = (h: unknown) => { live.delete(h); return orig.ci(h); };
  return { count: () => live.size, restore: () => { Object.assign(g, { setTimeout: orig.st, setInterval: orig.si, clearTimeout: orig.ct, clearInterval: orig.ci }); } };
}

const observers = () => queryClient.getQueryCache().getAll().reduce((n, q) => n + q.getObserversCount(), 0);
const proc = process as unknown as { listenerCount(e: string): number };
const PROCESS_EVENTS = ['SIGTERM', 'SIGHUP', 'SIGINT', 'SIGWINCH', 'uncaughtException', 'unhandledRejection', 'warning', 'exit'];

async function cycle(page = 'schedules') {
  const s = streams();
  const hub = await startTermHub({ pages, path: pages.find((p) => p.id === page)!.path, boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page, fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  for (let i = 0; i < 800 && !plain(s.text()).includes('schedules on'); i++) await wait(25);
  expect(plain(s.text())).toContain('schedules on');
  await wait(200);
  // Per-mount state lives in the session: a fresh mount starts with no menu open, and leaves one open on purpose.
  expect(openMenuNow()).toBeNull();
  openMenu('account');
  expect(sessionSlotNames()).toContain('shell.menus');
  s.stdin.write('\x1b');
  await wait(100);
  s.stdin.write('q');
  const end = await hub.closed;
  expect(end.exit.reason).toBe('quit');
  expect(end.disposeErrors).toEqual([]);
  return { s, hub, end };
}

function snapshot(s: ReturnType<typeof streams>) {
  return {
    observers: observers(),
    queries: queryClient.getQueryCache().getAll().length,
    session: currentTermSession(),
    stdin: s.stdin.listenerCount('data'),
    stdoutResize: (s.stdout as unknown as Writable).listenerCount('resize'),
    process: Object.fromEntries(PROCESS_EVENTS.map((e) => [e, proc.listenerCount(e)])),
    // Process-wide state of term modules: nothing of the last mount survives it.
    slots: sessionSlotNames(),
    menu: openMenuNow(),
    pageFailures: pageFailures().length,
    viewsLoading: viewsLoading(),
    styles: styleResolver(),
  };
}

test('repeated mounts leak nothing', async () => {
  const timers = timerCensus();
  try {
    const first = await cycle();
    await wait(300);
    const base = { timers: timers.count(), ...snapshot(first.s) };
    expect(base.observers).toBe(0);
    expect(base.queries).toBe(0);
    expect(base.session).toBeNull();
    expect(base.stdin).toBe(0);
    expect(base.stdoutResize).toBe(0);
    expect(base.slots).toEqual([]);
    expect(base.menu).toBeNull();
    expect(base.styles).toBeNull();
    let last = first;
    for (let i = 0; i < 4; i++) last = await cycle();
    await wait(300);
    const after = { timers: timers.count(), ...snapshot(last.s) };
    expect(after).toEqual(base);
  } finally {
    timers.restore();
  }
});

/** A boot that records what the lifecycle asks of it. */
function recordingBoot(o: { fail?: boolean; expireAfter?: number; signOutAfter?: number; suspended?: boolean } = {}) {
  const log: string[] = [];
  const inner = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  const boot: TermBoot = {
    async start(session, end) {
      log.push('start ' + (session.live() ? 'live' : 'dead'));
      await inner.start(session, end);
      if (o.fail) throw new Error('boot refused');
      if (o.expireAfter !== undefined) setTimeout(() => { end('expired'); }, o.expireAfter);
      if (o.signOutAfter !== undefined) setTimeout(() => { end('signed-out'); }, o.signOutAfter);
    },
    suspended: () => o.suspended === true,
    async dispose(reason: DisposeReason) {
      log.push(`dispose ${reason} session=${currentTermSession() ? 'open' : 'closed'} observers=${observers()}`);
      await inner.dispose(reason);
    },
  };
  return { boot, log };
}

test('dispose', async () => {
  const s = streams();
  const r = recordingBoot();
  const hub: TermHub = await startTermHub({ pages, path: '/schedules', boot: r.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  for (let i = 0; i < 800 && !plain(s.text()).includes('schedules on'); i++) await wait(25);
  const kept = currentTermSession()!;
  const end = await hub.end('abort');
  expect(end.exit.reason).toBe('abort');
  expect(end.lastView.page).toBe('schedules');
  // Core disposed after the app (no observer left) and before the session ended (its purge still reads the stores).
  expect(r.log).toEqual(['start live', 'dispose term-abort session=open observers=0']);
  expect(currentTermSession()).toBeNull();
  expect(() => kept.stores()).toThrow('TERM_SESSION_ENDED');
  expect(plain(s.text())).toContain('HOODY');
  expect(s.text()).toContain('\x1b[?1049l');
});

test('boot failure', async () => {
  const s = streams();
  const r = recordingBoot({ fail: true });
  const hub = await startTermHub({ pages, path: '/schedules', boot: r.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  const end = await hub.closed;
  expect(end.exit.reason).toBe('boot-failed');
  expect(r.log[1]).toStartWith('dispose term-error');
  // The end holds the failure's record, never the raw error.
  const err = (end.exit as { error: unknown }).error;
  expect(err).not.toBeInstanceOf(Error);
  expect(err).toMatchObject({ kind: 'boot', code: expect.any(String) });
  expect(currentTermSession()).toBeNull();
  expect(plain(s.text())).not.toContain('HOODY');
});

test('expired', async () => {
  const s = streams();
  const r = recordingBoot({ expireAfter: 400 });
  const hub = await startTermHub({ pages, path: '/schedules', boot: r.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  const end = await hub.closed;
  expect(end.exit.reason).toBe('expired');
  expect(end.reason).toBe('expired');
  expect(r.log[1]).toStartWith('dispose term-abort');
  expect(currentTermSession()).toBeNull();
});

test('end reasons', async () => {
  const s = streams();
  const out = recordingBoot({ signOutAfter: 300 });
  const a = await startTermHub({ pages, path: '/schedules', boot: out.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  expect((await a.closed).reason).toBe('signed-out');
  const t = streams();
  const sus = recordingBoot({ suspended: true });
  const b = await startTermHub({ pages, path: '/schedules', boot: sus.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: t.stdin, stdout: t.stdout, width: 100, height: 30 });
  expect((await b.end('quit')).reason).toBe('suspended');
  const u = streams();
  const bad = recordingBoot({ fail: true });
  const c = await startTermHub({ pages, path: '/schedules', boot: bad.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: u.stdin, stdout: u.stdout, width: 100, height: 30 });
  const ce = await c.closed;
  expect(ce.reason).toBe('boot-failed');
  // The boot's error is a record: no message (it said 'boot refused').
  expect(ce.problems[0]).toMatchObject({ kind: 'boot', code: 'UNHANDLED', name: 'Error' });
  expect(JSON.stringify(ce.problems)).not.toContain('refused');
});

test('host services', async () => {
  const copied: string[] = [];
  const opened: string[] = [];
  const s = streams();
  const hub = await startTermHub({
    pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS,
    stdin: s.stdin, stdout: s.stdout, width: 100, height: 30,
    host: { copy: (t) => copied.push(t), openExternal: (u) => opened.push(u), webOrigin: 'https://hub.example' },
  });
  expect(hostEnv().pageAddress).toEqual({ origin: 'https://hub.example', pathname: '/auth/home', search: '' });
  expect(hostEnv().browserPage).toBe(false);
  const env = hostEnv();
  expect(env.clipboard!.write('abc\x1b]52;c;evil\x07')).toBe(true);
  expect(copied).toEqual(['abc]52;c;evil']);
  expect(env.clipboard!.write('x'.repeat(70 * 1024))).toBe(false);
  expect(env.openExternal!('https://hoody.com/docs')).toBe(true);
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'https://a b', 'https://u:p@x.com/', '/computers']) expect(env.openExternal!(bad)).toBe(false);
  expect(opened).toEqual(['https://hoody.com/docs']);
  expect(env.files).toBeNull();
  const kept = env.clipboard!;
  await hub.end('quit');
  expect(kept.write('after')).toBe(false);
  expect(copied).toHaveLength(1);
  // A mount lent nothing: the facilities are absent.
  const t = streams();
  const bare = await startTermHub({ pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: t.stdin, stdout: t.stdout, width: 100, height: 30 });
  expect(hostEnv().clipboard).toBeNull();
  expect(hostEnv().openExternal).toBeUndefined();
  expect(hostEnv().pageAddress).toBeNull();
  await bare.end();
});

test('strict traps', async () => {
  // Demo reads localStorage in a try/catch (the swallowed case).
  function Swallow() {
    let note = 'storage read';
    try { void (globalThis as { localStorage?: unknown }).localStorage; } catch { note = 'storage refused'; }
    return createElement('text', null, note);
  }
  expectTraps('localStorage');
  const withSwallow = pages.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Swallow }) } as unknown as PageManifest)));
  // Installed here only when no one else did (a preload may run the whole suite under strict globals).
  const mine = activeStrictGlobals() === null;
  ensureStrictGlobals();
  try {
    const s = streams();
    const hub = await startTermHub({ pages: withSwallow, path: '/demo', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
    // The swallowed read ends the mount by itself: no key pressed.
    const end = await hub.closed;
    expect(end.exit.reason).toBe('crash');
    expect(end.ok).toBe(false);
    // The first trap ends it (today that is src/ask's registry at shell start, before the page's own read: either way
    // a trap, never a normal end).
    expect(end.traps.length).toBeGreaterThan(0);
    expect(end.problems[0]).toMatchObject({ kind: 'trap', code: 'TERM_GLOBAL', name: 'TermGlobalError', what: end.traps[0] });
    expect(end.reason).toBe('crashed');
    expect(s.text()).toContain('\x1b[?1049l');
    expect(currentTermSession()).toBeNull();
  } finally {
    if (mine) activeStrictGlobals()?.restore();
  }
});

test('styles required', async () => {
  const s = streams();
  await expect(startTermHub({ pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 } as never)).rejects.toThrow('TERM_STYLES_REQUIRED');
  expect(currentTermSession()).toBeNull();
  expect(s.text()).toBe('');
});

test('styles follow the mount', async () => {
  let cols = 100;
  const s = streams(100, 30, () => cols);
  const asked: string[] = [];
  const marker: StyleResolver = () => undefined;
  const styles: TermStyles = { id: 'spy', classFor: (c) => (c < 140 ? 'medium' : 'wide'), resolver: (w) => { asked.push(w); return marker; } };
  const hub = await startTermHub({ pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, styles, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  expect(styleWidthClass()).toBe('medium');
  expect(styleResolver()).toBe(marker);
  cols = 150;
  (s.stdout as unknown as Writable).emit('resize');
  for (let i = 0; i < 80 && styleWidthClass() !== 'wide'; i++) await wait(25);
  expect(styleWidthClass()).toBe('wide');
  expect(asked).toEqual(['medium', 'wide']);
  const end = await hub.end('quit');
  expect(end.ok).toBe(true);
  expect(styleResolver()).toBeNull();
});

test('console is kept', async () => {
  function Loud() {
    console.error('LOUD-ERROR \x1b]52;c;evil\x07 from a page');
    console.log('LOUD-LOG');
    return createElement('text', null, 'loud page');
  }
  const loud = pages.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Loud }) } as unknown as PageManifest)));
  const before = console.error;
  const s = streams();
  const hub = await startTermHub({ pages: loud, path: '/demo', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  for (let i = 0; i < 400 && !plain(s.text()).includes('loud page'); i++) await wait(25);
  const end = await hub.end('quit');
  expect(plain(s.text())).not.toContain('LOUD');
  // Records only: which console method, a code; the text itself is not kept (it could carry anything).
  expect(end.problems).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'console', what: 'error', code: 'UNHANDLED' }),
    expect.objectContaining({ kind: 'console', what: 'log', code: 'UNHANDLED' }),
  ]));
  expect(JSON.stringify(end.problems)).not.toContain('LOUD');
  expect(end.reason).toBe('quit');
  expect(console.error).toBe(before);
  // A developer's own run may keep the sanitised text (diagnosticDetail): controls neutralised.
  const t = streams();
  const dev = await startTermHub({ pages: loud, path: '/demo', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, diagnosticDetail: true, stdin: t.stdin, stdout: t.stdout, width: 100, height: 30 });
  for (let i = 0; i < 400 && !plain(t.text()).includes('loud page'); i++) await wait(25);
  const devEnd = await dev.end('quit');
  const detail = devEnd.problems.find((p) => p.what === 'error')?.detail ?? '';
  expect(detail).toContain('LOUD-ERROR');
  expect(detail).not.toContain('\x1b');
});

test('when idle', async () => {
  const s = streams();
  const hub = await startTermHub({ pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  const r = await hub.whenIdle({ deadlineMs: 15_000 });
  expect(r.settled).toBe(true);
  expect(r.frame).toContain('HOODY');
  expect(r.pending.queries).toEqual([]);
  await hub.end('quit');
});

test('gate closes first', async () => {
  for (const how of ['q', 'abort'] as const) {
    const log: string[] = [];
    let gate = 'open';
    function Watcher() {
      useEffect(() => () => { log.push(`unmount gate=${gate}`); }, []);
      return createElement('text', null, 'watcher on');
    }
    const withWatcher = pages.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Watcher }) } as unknown as PageManifest)));
    const inner = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
    const boot: TermBoot = {
      start: (session, end) => inner.start(session, end),
      closeGate: () => { if (gate === 'open') log.push('gate'); gate = 'closed'; },
      dispose: async (r) => { log.push(`dispose gate=${gate}`); await inner.dispose(r); },
    };
    const s = streams();
    const hub = await startTermHub({ pages: withWatcher, path: '/demo', boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
    const r = hub.renderer()!;
    const destroy = r.destroy.bind(r);
    (r as unknown as { destroy: () => void }).destroy = () => { log.push(`renderer gate=${gate}`); destroy(); };
    for (let i = 0; i < 800 && !plain(s.text()).includes('watcher on'); i++) await wait(25);
    expect(plain(s.text())).toContain('watcher on');
    if (how === 'q') { s.stdin.write('q'); await hub.closed; } else await hub.end('abort');
    expect(log).toEqual(['gate', 'unmount gate=closed', 'renderer gate=closed', 'dispose gate=closed']);
  }
});

test('trap during boot closes the gate', async () => {
  expectTraps('document');
  const mine = activeStrictGlobals() === null;
  ensureStrictGlobals();
  try {
    const log: string[] = [];
    const inner = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
    const boot: TermBoot = {
      start: async (session, end) => {
        await inner.start(session, end);
        try { void (globalThis as { document?: unknown }).document; } catch { /* swallowed */ }
        log.push('after trap');
        await wait(10);
        log.push('start returns');
      },
      closeGate: () => { log.push('gate'); },
      dispose: (r) => inner.dispose(r),
    };
    const s = streams();
    const hub = await startTermHub({ pages, path: '/demo', boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
    const end = await hub.closed;
    expect(log.slice(0, 3)).toEqual(['gate', 'after trap', 'start returns']);
    expect(end.exit.reason).toBe('crash');
    expect(end.problems[0]).toMatchObject({ kind: 'trap', what: 'document' });
  } finally {
    if (mine) activeStrictGlobals()?.restore();
  }
});

test('canary trap in the end', async () => {
  const CANARY = 'TOKEN_CANARY_ABC123';
  function Peek() {
    try { void (globalThis as unknown as { window: Record<string, unknown> }).window[CANARY]; } catch { /* swallowed */ }
    return createElement('text', null, 'peeked');
  }
  expectTraps('window.*');
  const withPeek = pages.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Peek }) } as unknown as PageManifest)));
  const mine = activeStrictGlobals() === null;
  ensureStrictGlobals();
  try {
    const s = streams();
    const hub = await startTermHub({ pages: withPeek, path: '/demo', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30, diagnosticDetail: true } as never);
    const end = await hub.closed;
    expect(end.ok).toBe(false);
    expect(end.traps).toContain('window.*');
    expect(JSON.stringify(end)).not.toContain(CANARY);
    expect(s.text()).not.toContain(CANARY);
  } finally {
    if (mine) activeStrictGlobals()?.restore();
  }
});

test('dispose failures each recorded', async () => {
  const inner = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
  const boot: TermBoot = {
    start: (session, end) => inner.start(session, end),
    dispose: async (r) => {
      await inner.dispose(r);
      throw new AggregateError([new Error('CRYPT_SETTLE_TIMEOUT: hbk_CANARY'), new Error('TERM_WIPE_INCOMPLETE: 1 late answer(s)')], 'TERM_DISPOSE_FAILURES');
    },
  };
  const s = streams();
  const hub = await startTermHub({ pages, path: '/demo', boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  for (let i = 0; i < 800 && !plain(s.text()).includes('HOODY'); i++) await wait(25);
  await hub.end('abort');
  const end = await hub.closed;
  const disp = end.problems.filter((p) => p.kind === 'dispose');
  expect(disp.map((p) => p.code)).toEqual(['CRYPT_SETTLE_TIMEOUT', 'TERM_WIPE_INCOMPLETE']);
  expect(JSON.stringify(end.problems)).not.toContain('CANARY');
});

// An end asked for while the renderer is being created (an abort between the boot and the mount): the renderer that
// then arrives is shut down, and `closed` settles only after it. Before: the mount was disposed at once and the late
// renderer stayed up with nothing to end it.
test('abort while the renderer is being created', async () => {
  const s = streams();
  const r = recordingBoot();
  const ac = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>((res) => { release = res; });
  let asked = false;
  let made: CliRenderer | null = null;
  const starting = startTermHub({
    pages, path: '/schedules', boot: r.boot, queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30, signal: ac.signal,
    createRenderer: async (flags) => { asked = true; await gate; made = await createCliRenderer({ stdin: s.stdin, stdout: s.stdout, ...flags }); return made; },
  });
  for (let i = 0; i < 400 && !asked; i++) await wait(25);
  expect(asked).toBe(true);
  ac.abort();
  let settled = false;
  let hub: TermHub | null = null;
  void starting.then((h) => { hub = h; void h.closed.then(() => { settled = true; }); });
  await wait(300);
  // Nothing is over while the renderer is still on its way.
  expect(settled).toBe(false);
  release();
  const h = await starting;
  const end = await h.closed;
  expect(end.exit.reason).toBe('abort');
  expect(made).not.toBeNull();
  expect((made as unknown as { isDestroyed: boolean }).isDestroyed).toBe(true);
  expect(h.renderer()?.isDestroyed ?? true).toBe(true);
  expect(currentTermSession()).toBeNull();
  expect(r.log.some((l) => l.startsWith('dispose term-abort'))).toBe(true);
  void hub;
});

test('colour tier reaches the engine', async () => {
  const s = streams();
  const hub = await startTermHub({ pages, path: '/schedules', boot: fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null }), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30, colourTier: 'ansi16' });
  for (let i = 0; i < 800 && !plain(s.text()).includes('schedules on'); i++) await wait(25);
  await wait(200);
  await hub.end('abort');
  expect(plain(s.text())).toContain('schedules on');
  // Colour is written, and only as SGR 30-37 / 90-97 / 40-47 / 100-107: never 38;2 / 48;2 (24-bit) or 38;5 / 48;5 (256).
  expect(s.text()).toMatch(/\x1b\[[0-9;]*(3[0-7]|9[0-7])[;m]/);
  expect(s.text()).not.toMatch(/\x1b\[[0-9;]*[34]8;[25];/);
});
