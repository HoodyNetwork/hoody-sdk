// build/hub-main.ts decides the colour tier without importing hub/src (the executable holds one copy of the Hub: the
// bundle). Its rule must stay the terminal's own (src/term/prim/tokens.ts tierFromEnv).
import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { tierFromEnv } from '../../../src/term/prim/tokens';
import { dropCacheEnv, dropLibraryOverrides, HUB_CACHE_MARKER } from './hub-cache';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { END_SIGNALS, earlyInterrupt, endLine, keepPlace, mountStore, ownSignals, ownUncaught, tierOf } from './hub-main';
import { systemTryLock } from './hub-store';
import { openAccountStore, readResume } from './hub-store-open';

test('the executable\'s colour tier is tierFromEnv for every environment that decides it', () => {
  const values = {
    NO_COLOR: [undefined, '', '1'],
    TERM: [undefined, 'dumb', 'xterm-256color', 'xterm-direct', 'foot-truecolor'],
    COLORTERM: [undefined, 'truecolor', '24bit', 'yes'],
    HUB_TERM_COLOUR: [undefined, 'truecolor', 'ansi16', 'mono', 'other'],
  };
  let n = 0;
  for (const NO_COLOR of values.NO_COLOR) for (const TERM of values.TERM) for (const COLORTERM of values.COLORTERM) for (const HUB_TERM_COLOUR of values.HUB_TERM_COLOUR) {
    const env = { NO_COLOR, TERM, COLORTERM, HUB_TERM_COLOUR };
    expect({ env, tier: tierOf(env) }).toEqual({ env, tier: tierFromEnv(env) });
    n++;
  }
  expect(n).toBe(300);
});

test('after the engine loaded, the cache leaves the environment children inherit; a user\'s own BUN_TMPDIR stays', () => {
  const ours: Record<string, string | undefined> = { BUN_TMPDIR: '/c/hoody/hub', [HUB_CACHE_MARKER]: '/c/hoody/hub', TMPDIR: '/tmp' };
  dropCacheEnv(ours);
  expect(ours).toEqual({ TMPDIR: '/tmp' });
  const theirs: Record<string, string | undefined> = { BUN_TMPDIR: '/their/tmp' };
  dropCacheEnv(theirs);
  expect(theirs).toEqual({ BUN_TMPDIR: '/their/tmp' });
});

test('the engine\'s load-a-library-from-here switches are dropped before it loads', () => {
  const env: Record<string, string | undefined> = { OPENTUI_LIB_PATH: '/x/evil.so', OTUI_ASSET_ROOT: '/x', OPENTUI_LIBC: 'musl', PATH: '/usr/bin' };
  dropLibraryOverrides(env);
  expect(env).toEqual({ OPENTUI_LIBC: 'musl', PATH: '/usr/bin' });
});

test('the executable hands its opened store to the mount and keeps the place only after a good run', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-main-test-'));
  fs.chmodSync(home, 0o700);
  const tryLock = await systemTryLock();
  const open = () => openAccountStore({ home, apiOrigin: 'https://api.example.invalid', uid: '64f0ada00000000000000001', tryLock });
  try {
    const store = open();
    expect(mountStore(store)).toEqual({ area: store.area, openedAt: store.openedAt, notice: null });
    // A crash, a failed start, a receipt that does not say: the last good place stays.
    expect(keepPlace(store, { exitCode: 1, ok: false, lastView: { page: 'logs' } }, 'all')).toBe(false);
    expect(keepPlace(store, { exitCode: 0 }, 'all')).toBe(false);
    expect(readResume(store.area)).toEqual({});
    expect(keepPlace(store, { exitCode: 0, ok: true, lastView: { page: 'computers' } }, 'f1f1f1f1f1f1f1f1f1f1f1f1')).toBe(true);
    // A second Hub beside it: read-only, says so, keeps nothing.
    const second = open();
    expect(mountStore(second).notice).not.toBeNull();
    expect(keepPlace(second, { exitCode: 0, ok: true, lastView: { page: 'home' } }, 'all')).toBe(false);
    second.close();
    store.close();
    const next = open();
    expect(readResume(next.area)).toEqual({ page: 'computers', realmId: 'f1f1f1f1f1f1f1f1f1f1f1f1' });
    next.close();
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('while the Hub draws, an error nobody caught reaches the main, not the host\'s handlers; off() gives them back', () => {
  // hubMain itself needs a TTY, so its helper is tested on the real process. The host's handlers stand for the CLI's
  // (a stack on the console the mount keeps, then process.exit(1)); the engine's is added while the Hub draws.
  type L = (...a: unknown[]) => void;
  const proc = process as unknown as { listeners(e: string): L[]; on(e: string, l: L): unknown; off(e: string, l: L): unknown; emit(e: string, ...a: unknown[]): boolean };
  const EVENTS = ['uncaughtException', 'unhandledRejection'];
  // Listeners this process already had (the runner's, another file's) are set aside, so every emit reaches known ones.
  const before = EVENTS.map((e) => [e, proc.listeners(e)] as const);
  for (const [e, ls] of before) for (const l of ls) proc.off(e, l);
  const heard: string[] = [];
  const names = new Map<L, string>();
  const named = (n: string): L => { const l: L = () => { heard.push(n); }; names.set(l, n); return l; };
  // Who listens, in order (the main's own listener is the one with no name here).
  const who = (e: string) => proc.listeners(e).map((l) => names.get(l) ?? 'main');
  const hostEx = [named('host-ex-1'), named('host-ex-2')];
  const hostRej = [named('host-rej-1'), named('host-rej-2')];
  const engine = named('engine');
  let off: (() => void) | null = null;
  try {
    for (const l of hostEx) proc.on('uncaughtException', l);
    for (const l of hostRej) proc.on('unhandledRejection', l);
    off = ownUncaught(() => { heard.push('main'); });
    expect([who('uncaughtException'), who('unhandledRejection')]).toEqual([['main'], ['main']]);
    proc.emit('unhandledRejection', new Error('x'), Promise.resolve());
    proc.emit('uncaughtException', new Error('y'));
    expect(heard.splice(0)).toEqual(['main', 'main']);
    // A listener added meanwhile (the engine's) is left alone and still hears it.
    proc.on('unhandledRejection', engine);
    proc.emit('unhandledRejection', new Error('z'), Promise.resolve());
    expect(heard.splice(0)).toEqual(['main', 'engine']);
    // A second off() puts nothing back twice.
    off();
    off();
    // The positive control: the same emits reach the host's handlers again, in their order; the main hears nothing.
    expect([who('uncaughtException'), who('unhandledRejection')]).toEqual([['host-ex-1', 'host-ex-2'], ['engine', 'host-rej-1', 'host-rej-2']]);
    proc.emit('unhandledRejection', new Error('x'), Promise.resolve());
    proc.emit('uncaughtException', new Error('y'));
    expect(heard.splice(0)).toEqual(['engine', 'host-rej-1', 'host-rej-2', 'host-ex-1', 'host-ex-2']);
  } finally {
    off?.();
    for (const l of [engine, ...hostRej]) proc.off('unhandledRejection', l);
    for (const l of hostEx) proc.off('uncaughtException', l);
    for (const [e, ls] of before) for (const l of ls) proc.on(e, l);
  }
  for (const [e, ls] of before) expect(proc.listeners(e).length).toBe(ls.length);
});

test('while the Hub draws, a signal that ends it reaches the main, not the host\'s handlers; off() gives them back', () => {
  // The host's handlers stand for the CLI's (SIGINT and SIGTERM: process.exit at once, the terminal not restored).
  type L = (...a: unknown[]) => void;
  const proc = process as unknown as { listeners(e: string): L[]; on(e: string, l: L): unknown; off(e: string, l: L): unknown; emit(e: string, ...a: unknown[]): boolean };
  const SIGNALS = ['SIGTERM', 'SIGHUP', 'SIGINT'];
  // Listeners this process already had (the runner's) are set aside, so every emit reaches known ones only.
  const before = SIGNALS.map((e) => [e, proc.listeners(e)] as const);
  for (const [e, ls] of before) for (const l of ls) proc.off(e, l);
  const heard: string[] = [];
  const host = SIGNALS.map((e) => [e, (() => { heard.push('host ' + e); }) as L] as const);
  let off: (() => void) | null = null;
  try {
    for (const [e, l] of host) proc.on(e, l);
    off = ownSignals((s) => { heard.push('main ' + s); });
    for (const e of SIGNALS) expect(proc.listeners(e).length).toBe(1);
    for (const e of SIGNALS) proc.emit(e, e);
    expect(heard.splice(0)).toEqual(['main SIGTERM', 'main SIGHUP', 'main SIGINT']);
    off();
    off();
    // The positive control: the host's handlers are back, alone, and hear the same emits; the main hears nothing.
    for (const [e, l] of host) expect(proc.listeners(e)).toEqual([l]);
    for (const e of SIGNALS) proc.emit(e, e);
    expect(heard.splice(0)).toEqual(['host SIGTERM', 'host SIGHUP', 'host SIGINT']);
  } finally {
    off?.();
    for (const [e, l] of host) proc.off(e, l);
    for (const [e, ls] of before) for (const l of ls) proc.on(e, l);
  }
  for (const [e, ls] of before) expect(proc.listeners(e).length).toBe(ls.length);
});

test('a run ended by a signal exits as a shell reports the signal', () => {
  // Object.entries keeps END_SIGNALS' literal numbers (1 | 2 | 15); the host's are plain numbers.
  for (const [s, n] of Object.entries(END_SIGNALS) as [string, number][]) {
    expect({ s, n }).toEqual({ s, n: os.constants.signals[s as keyof typeof os.constants.signals] });
  }
});

test('a sign-in that expired while the Hub drew says so after the terminal is back, as the start does; other ends say nothing', () => {
  expect(endLine({ exitCode: 0, ok: true, reason: 'expired' }, false)).toEqual({ code: 2, line: 'hoody hub: your sign-in has expired. Run `hoody login`, then `hoody hub` again.' });
  // The sample account has no sign-in to renew.
  expect(endLine({ exitCode: 0, ok: true, reason: 'expired' }, true)).toBeNull();
  for (const reason of ['quit', 'closed', 'signed-out', 'suspended', undefined]) expect(endLine({ exitCode: 0, ok: true, ...(reason ? { reason } : {}) }, false)).toBeNull();
});

test('before the first frame a Ctrl-C leaves at once; from the first frame on every key is the Hub\'s', () => {
  const input = new PassThrough();
  let told = 0;
  const boot = earlyInterrupt(input, () => { told++; });
  // Other keys typed while the mount boots are not a way out.
  input.emit('data', Buffer.from('q\x1b'));
  input.emit('data', 'abc');
  expect(told).toBe(0);
  // The positive control: Ctrl-C (byte 3, as raw mode sends it), as a Buffer or a string, mid-chunk too.
  input.emit('data', Buffer.from([0x61, 0x03]));
  input.emit('data', '\x03');
  expect(told).toBe(2);
  // The first frame: the Hub owns Ctrl-C from here (its own ask-then-leave rule).
  boot.drawn();
  input.emit('data', Buffer.from([0x03]));
  expect(told).toBe(2);
  const n = input.listenerCount('data');
  boot.off();
  expect(input.listenerCount('data')).toBe(n - 1);
});
