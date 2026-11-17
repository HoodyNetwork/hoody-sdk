// The terminal host env (term/env/session.ts) against core's HostEnv contract (core/host-env.ts): one process env,
// installed once, whose stores, vault and lock table belong to the CURRENT mount session and die with it.
import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { hostEnv, localStore, resetHostEnvForTests, sessionStore } from '../../core/host-env';
import { beginTermSession, currentTermSession, installTermEnv, STORE_SIZE, termHostEnv, type TermSession } from './session';

const open: TermSession[] = [];
function begin(host: Parameters<typeof beginTermSession>[0] = {}): TermSession {
  const s = beginTermSession(host);
  open.push(s);
  return s;
}
afterEach(() => {
  for (const s of open.splice(0)) s.end();
  resetHostEnvForTests();
});
// The rest of the process gets the terminal env back (what the test preload installed): the afterEach above leaves core
// on the browser path, and the next file in a shared process then read window.navigator and indexedDB through it
// (trap-journal, strict-probes.alerts-wipe and upload-engine were red after this file, green alone).
afterAll(() => { resetHostEnvForTests({ unresolved: true }); installTermEnv(); });

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('the terminal env inside one session', () => {
  it('local and session are separate key-value stores with the Storage surface core reads', () => {
    begin();
    const env = termHostEnv();
    env.local!.setItem('a', '1');
    env.local!.setItem('b', '2');
    env.session!.setItem('a', 'S');
    expect([env.local!.getItem('a'), env.local!.getItem('b'), env.local!.getItem('zz')]).toEqual(['1', '2', null]);
    expect(env.session!.getItem('a')).toBe('S');
    expect(env.local!.length).toBe(2);
    expect([env.local!.key(0), env.local!.key(1)].sort()).toEqual(['a', 'b']);
    expect(env.local!.key(2)).toBeNull();
    env.local!.removeItem('a');
    expect([env.local!.getItem('a'), env.local!.length]).toEqual([null, 1]);
  });

  it('setItem stores a string, as Storage does', () => {
    begin();
    const local = termHostEnv().local!;
    local.setItem('n', 5 as unknown as string);
    expect(local.getItem('n')).toBe('5');
  });

  it('the vault keeps keys and account records for the session', async () => {
    begin();
    const v = termHostEnv().vault!;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    await v.putKey('acct', 'k1', key);
    expect([...(await v.keys('acct')).keys()]).toEqual(['k1']);
    expect(await v.account('acct')).toBeNull();
  });

  it('locks is an in-process lock manager with query()', async () => {
    begin();
    const locks = termHostEnv().locks!;
    let release!: () => void;
    void locks.request('x', { mode: 'exclusive' }, () => new Promise<void>((r) => { release = r; }));
    await tick();
    expect(await locks.request('x', { ifAvailable: true }, (l) => l)).toBeNull();
    const snap = await locks.query!();
    expect(snap.held?.map((h) => h.name)).toEqual(['x']);
    release();
    await tick();
    expect(await locks.request('x', { ifAvailable: true }, (l) => (l ? 'got' : null))).toBe('got');
  });

  it('the page is always visible, and visibility, lifecycle and external-change listeners never fire', async () => {
    begin();
    const env = termHostEnv();
    const fired: string[] = [];
    const offs = [
      env.onVisibilityChange(() => fired.push('vis')),
      env.onExternalChange(() => fired.push('ext')),
      ...(['beforeunload', 'pageshow', 'pagehide', 'online', 'offline', 'focus'] as const).map((t) => env.onLifecycle(t, () => fired.push(t))),
    ];
    env.local!.setItem('k', 'v'); // a write in this process is not an external change
    await tick();
    expect(env.visible()).toBe(true);
    expect(fired).toEqual([]);
    for (const off of offs) expect(off()).toBeUndefined();
  });

  it('there is no tab channel', () => {
    begin();
    expect(termHostEnv().channel('hub-anything')).toBeNull();
  });
});

describe('sessions', () => {
  it('a second session cannot begin while one is open, and the open one is left untouched', () => {
    const a = begin();
    termHostEnv().local!.setItem('k', 'A');
    expect(() => beginTermSession()).toThrow('TERM_SESSION_ACTIVE');
    expect(currentTermSession()).toBe(a);
    expect(termHostEnv().local!.getItem('k')).toBe('A');
    termHostEnv().local!.setItem('k2', 'still');
    expect(termHostEnv().local!.getItem('k2')).toBe('still');
  });

  it('A, quit, then B begins', () => {
    begin().end();
    const b = begin();
    expect(currentTermSession()).toBe(b);
  });

  it('currentTermSession names the open session, and null once it ended', () => {
    const s = begin();
    expect(currentTermSession()).toBe(s);
    s.end();
    expect(currentTermSession()).toBeNull();
    s.end(); // idempotent
  });

  it('with no session, a store, vault or lock read throws instead of answering "none"', () => {
    const env = termHostEnv();
    expect(() => env.local).toThrow('TERM_NO_SESSION');
    expect(() => env.session).toThrow('TERM_NO_SESSION');
    expect(() => env.vault).toThrow('TERM_NO_SESSION');
    expect(() => env.locks).toThrow('TERM_NO_SESSION');
  });

  it('a registration made with no session open (a module-load listener) is accepted and survives sessions', () => {
    const env = termHostEnv();
    const off = env.onExternalChange(() => {});
    begin().end();
    begin();
    expect(typeof off).toBe('function');
    off();
  });

  it('the next session starts empty: stores, vault and lock table', async () => {
    const a = begin();
    const env = termHostEnv();
    env.local!.setItem('pref', 'A');
    env.session!.setItem('sel', 'X');
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    await env.vault!.putKey('acct', 'k1', key);
    void env.locks!.request('hub-tab', { mode: 'exclusive' }, () => new Promise<void>(() => {})); // held forever by A
    await tick();
    a.end();

    begin();
    expect(env.local!.getItem('pref')).toBeNull();
    expect(env.local!.length).toBe(0);
    expect(env.session!.getItem('sel')).toBeNull();
    expect((await env.vault!.keys('acct')).size).toBe(0);
    expect(await env.locks!.request('hub-tab', { ifAvailable: true }, (l) => (l ? 'got' : null))).toBe('got');
    expect((await env.locks!.query!()).held).toEqual([]);
  });

  it('a store handle kept from an ended session refuses, so it never writes into the next one', () => {
    const a = begin();
    const old = termHostEnv().local!;
    old.setItem('k', 'A');
    a.end();
    begin();
    expect(() => old.setItem('k', 'stale')).toThrow('TERM_SESSION_ENDED');
    expect(() => old.getItem('k')).toThrow('TERM_SESSION_ENDED');
    expect(termHostEnv().local!.getItem('k')).toBeNull();
  });

  it('a lock manager kept from an ended session refuses new requests and queries', async () => {
    const a = begin();
    const old = termHostEnv().locks!;
    a.end();
    begin();
    let ran = false;
    await expect(old.request('n', {}, () => { ran = true; })).rejects.toThrow('TERM_SESSION_ENDED');
    await expect(old.query!()).rejects.toThrow('TERM_SESSION_ENDED');
    expect(ran).toBe(false);
  });

  it('a lock request still waiting when its session ends is refused, never granted in the next session', async () => {
    const a = begin();
    const locks = termHostEnv().locks!;
    void locks.request('w', {}, () => new Promise<void>(() => {}));
    await tick();
    const waiting = locks.request('w', {}, () => 'granted');
    a.end();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('installing into core', () => {
  it('installTermEnv makes core read the terminal env: localStore() is the session store', () => {
    resetHostEnvForTests({ unresolved: true });
    installTermEnv();
    begin();
    localStore().setItem('through-core', '1');
    expect(termHostEnv().local!.getItem('through-core')).toBe('1');
    expect(sessionStore()).toBe(termHostEnv().session!);
    expect(hostEnv().channel('x')).toBeNull();
    expect(hostEnv().visible()).toBe(true);
  });

  it('installing twice, or after core already resolved its env, throws', () => {
    resetHostEnvForTests({ unresolved: true });
    installTermEnv();
    expect(() => installTermEnv()).toThrow('HOST_ENV_ALREADY_RESOLVED');
    resetHostEnvForTests(); // resolved to the browser path
    expect(() => installTermEnv()).toThrow('HOST_ENV_ALREADY_RESOLVED');
  });
});

describe('kept handles and core\'s lock options', () => {
  it('a vault handle kept from an ended session refuses to read or write', async () => {
    begin();
    const v = termHostEnv().vault!;
    await v.putAccount({ account: 'acct', active: 'k1', signIn: null, migrated: [] });
    open.pop()!.end();
    await expect(v.account('acct')).rejects.toThrow('TERM_SESSION_ENDED');
    await expect(v.keys('acct')).rejects.toThrow('TERM_SESSION_ENDED');
    await expect(v.putAccount({ account: 'acct', active: 'k2', signIn: null, migrated: [] })).rejects.toThrow('TERM_SESSION_ENDED');
  });

  it('an ifAvailable request made just before the end never runs its callback', async () => {
    const s = begin();
    let ran = false;
    const p = termHostEnv().locks!.request('x', { ifAvailable: true }, () => { ran = true; });
    s.end();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    expect(ran).toBe(false);
  });

  it('ifAvailable as the web: a free lock is granted, a held one gives the callback null (the stream budget\'s per-tab count)', async () => {
    begin();
    const locks = termHostEnv().locks!;
    expect(await locks.request('budget', { ifAvailable: true }, (l) => !!l)).toBe(true);
    let release!: () => void;
    void locks.request('budget', {}, () => new Promise<void>((r) => { release = r; }));
    await tick();
    expect(await locks.request('budget', { ifAvailable: true }, (l) => l)).toBeNull();
    release();
  });
});

describe('kept handles stay with their mount', () => {
  it('a clipboard or browser handle from mount A, called after A ended, never reaches mount B', () => {
    const a = { copied: [] as string[], opened: [] as string[] };
    const b = { copied: [] as string[], opened: [] as string[] };
    const sa = begin({ copy: (t) => { a.copied.push(t); }, openExternal: (u) => { a.opened.push(u); } });
    const clip = termHostEnv().clipboard!;
    const open = termHostEnv().openExternal!;
    expect(clip.write('in A')).toBe(true);
    expect(open('https://example.org/a')).toBe(true);
    sa.end();
    begin({ copy: (t) => { b.copied.push(t); }, openExternal: (u) => { b.opened.push(u); } });
    // The old handles, as a late continuation of A would call them.
    expect(clip.write('late from A')).toBe(false);
    expect(open('https://example.org/late')).toBe(false);
    expect(b).toEqual({ copied: [], opened: [] });
    expect(a).toEqual({ copied: ['in A'], opened: ['https://example.org/a'] });
    // B's own handles work.
    expect(termHostEnv().clipboard!.write('in B')).toBe(true);
    expect(b.copied).toEqual(['in B']);
  });

  it("the same through core's public hostEnv() (Handoff's path)", () => {
    resetHostEnvForTests({ unresolved: true });
    installTermEnv();
    const a = { opened: [] as string[] };
    const b = { opened: [] as string[] };
    const sa = begin({ openExternal: (u) => { a.opened.push(u); } });
    const open = hostEnv().openExternal!;
    expect(open('https://example.org/a')).toBe(true);
    sa.end();
    begin({ openExternal: (u) => { b.opened.push(u); } });
    expect(open('https://example.org/late')).toBe(false);
    expect(b.opened).toEqual([]);
    expect(a.opened).toEqual(['https://example.org/a']);
    expect(hostEnv().openExternal!('https://example.org/b')).toBe(true);
    expect(b.opened).toEqual(['https://example.org/b']);
  });

  it('the end empties the stores and lets go of the host services, not only access to them', () => {
    const copy = (_t: string) => {};
    const s = begin({ copy });
    const env = termHostEnv();
    const local = env.local!;
    local.setItem('k', 'secret');
    env.session!.setItem('s', 'secret');
    const keep = s.stores();
    expect((keep.local as unknown as Record<symbol, () => number>)[STORE_SIZE]!()).toBe(1);
    s.end();
    expect(() => keep.local.getItem('k')).toThrow('TERM_SESSION_ENDED');
    const size = (st: unknown) => (st as Record<symbol, () => number>)[STORE_SIZE]!();
    expect(size(keep.local)).toBe(0);
    expect(size(keep.session)).toBe(0);
  });
});
