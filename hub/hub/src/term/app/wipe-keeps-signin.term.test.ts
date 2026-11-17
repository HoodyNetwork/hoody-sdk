// "Remove all local data" in a terminal, run to its end: what it removes, and what it leaves alone. The terminal's
// words for it say "It does not sign you out: to sign out, run hoody logout" (termWords.json, pages/account w.*), which
// is a statement about the person's sign-in, so it is held by a run, not by reading.
//
// The run is the live entry over the CLI's client (cli-http.ts), with the account's real store (hub-store-open.ts)
// under a scratch home directory. The same directory holds a saved sign-in where the CLI keeps its own
// (<home>/.hoody/config.json), and the CLI side of this test reads its token from that file before each call, as the
// CLI does. Nothing here reads a real profile or opens a socket.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The wipe starts, the mount ends 'signed-out' (the Hub is left), and the Hub's kept settings are off the disk | 'the wipe' |
// | 2 | The saved sign-in is byte for byte what it was, and so is every other file outside the Hub's own directory; the CLI was never asked to renew or change anything | 'the wipe' |
// | 3 | From the confirm to the end nothing that changes server data is sent: no session is ended on the server (the web's sign-out sends DELETE /users/auth/sessions/<sid>; a terminal sends none), no other DELETE, POST, PUT or PATCH | 'the wipe' |
// | 4 | The saved sign-in still works afterwards: a new session opens over the same file, as the same account and session | 'the wipe' |
// | 5 | The Hub's list of the agent sign-in keys it made (what `hoody logout` revokes them from) is still in the store, and none was revoked | 'the wipe' |
import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localStore } from '../../core/host-env';
import { localWipeWarning, removeLocalData } from '../../core/local-wipe';
import { hubStoreDir, openHubStore } from '../../../scripts/term/build/hub-store';
import { openAccountStore, type OpenedStore } from '../../../scripts/term/build/hub-store-open';
import type { HubTermOptions, Receipt } from '../host-types';
import { mountTerminalHub } from '../entry';
import { currentTermSession } from '../env/session';
import { BOOT_KEYS_KEY, readBootKeys } from './boot-keys';
import { openCliHub, type CliHttp } from './cli-http';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(120_000);

const ORIGIN = 'https://api.example.invalid';
const PLACES = { apiOrigin: ORIGIN, realmApiDomain: 'example.invalid' } as const;
const UID = '64f0ada00000000000000001';
const SID = 'sess-1';

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let home = '';
let store: OpenedStore | null = null;
beforeEach(() => {
  // Under the run's own temp directory when it has one (TMPDIR), else in one shared subdirectory: never a new
  // entry at the top level of the system temp directory per run.
  const base = process.env.TMPDIR ? process.env.TMPDIR : path.join(os.tmpdir(), 'hoody-hub-tests');
  fs.mkdirSync(base, { recursive: true });
  home = fs.mkdtempSync(path.join(base, 'hub-wipe-signin-test-'));
  fs.chmodSync(home, 0o700);
});
afterEach(() => {
  currentTermSession()?.end();
  store?.close();
  store = null;
  fs.rmSync(home, { recursive: true, force: true });
});

/** Every file under `dir` but the Hub's own directory, as "path mode sha256". */
function outsideTheHub(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (p === path.join(dir, '.hoody', 'hub')) continue;
      if (e.isDirectory()) { out.push(`${path.relative(dir, p)}/ ${(fs.statSync(p).mode & 0o777).toString(8)}`); walk(p); }
      else out.push(`${path.relative(dir, p)} ${(fs.statSync(p).mode & 0o777).toString(8)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  walk(dir);
  return out;
}

test('the wipe', async () => {
  // The CLI's saved sign-in, where the CLI keeps it, made here for this run (a token of no platform).
  const token = `${b64({ alg: 'HS256' })}.${b64({ id: UID, sid: SID, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  const saved = path.join(home, '.hoody', 'config.json');
  fs.mkdirSync(path.dirname(saved), { mode: 0o700 });
  fs.writeFileSync(saved, JSON.stringify({ baseUrl: ORIGIN, token, refreshToken: 'refresh-of-this-test', expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 86_400_000 }, null, 2) + '\n', { mode: 0o600 });
  const savedBytes = fs.readFileSync(saved);

  // The CLI side: the token is read from the saved file before each call; every request and every renewal is counted.
  const sent: Array<{ method: string; url: string }> = [];
  let renewals = 0;
  const http: CliHttp = {
    getAuthToken: async () => (JSON.parse(fs.readFileSync(saved, 'utf8')) as { token?: string }).token,
    forceRefreshToken: async () => { renewals++; return undefined; },
    getRefreshFailure: () => undefined,
    getFetch: () => async (url, init) => {
      sent.push({ method: String(init?.method ?? 'GET').toUpperCase(), url });
      const p = new URL(url).pathname;
      if (p === '/api/v1/users/auth/me') return json(200, { data: { id: UID, email: 'person@example.invalid', username: 'person' } });
      if (p === '/api/v1/realms') return json(200, { data: { realm_ids: [] } });
      return json(404, { error: 'NOT_FOUND' });
    },
  };
  const opened = await openCliHub(http, PLACES);
  if (!opened.ok) throw new Error('not opened: ' + opened.why);
  expect(opened.client.identity).toEqual({ kind: 'account', uid: UID, sid: SID, source: 'login' });

  // The account's own store, as the launcher opens it (this Hub holds its lock).
  store = openAccountStore({ home, apiOrigin: ORIGIN, uid: UID, tryLock: () => true });
  expect(store.notice).toBeNull();
  const hubDir = hubStoreDir(home, ORIGIN, UID)!;
  expect(hubDir.startsWith(path.join(home, '.hoody', 'hub') + path.sep)).toBe(true);
  // An agent sign-in key an earlier run of the Hub made and listed (ids and names only, never a value).
  const KEPT_KEY = { id: 'tok_kept_by_an_earlier_run', alias: 'hoody-agent auto term abcdefghij', expires_at: new Date(Date.now() + 86_400_000).toISOString(), at: 1 };
  store.area!.set(BOOT_KEYS_KEY, JSON.stringify([KEPT_KEY]));

  let out = '';
  const io: HubTermOptions['io'] = { cells: { write: (t) => { out += t; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' };
  let ended: Receipt | null = null;
  const ac = new AbortController();
  const done = mountTerminalHub({ styles: UNSTYLED_FOR_TESTS, client: opened.client, context: { profile: 'test', realmId: 'all' }, store: { area: store.area, openedAt: store.openedAt, notice: null }, io, onSetDefault: async () => {}, signal: ac.signal });
  void done.then((r) => { ended = r; });
  try {
    for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await wait(25);
    expect(out).toContain('HOODY');
    // Core's account boot settles (it reads who is signed in).
    for (let i = 0; i < 400 && localWipeWarning() === null; i++) await wait(25);
    expect(ended).toBeNull();

    // What the Hub keeps on this device for the account: two settings, written through the Hub's own local store.
    localStore().setItem('hub_theme_v1', 'dark');
    localStore().setItem('hub_hl_v1', 'lime');
    const onDisk = (): string => fs.readdirSync(hubDir).map((f) => fs.readFileSync(path.join(hubDir, f), 'utf8')).join('\n');
    expect(onDisk()).toContain('hub_theme_v1');
    expect(onDisk()).toContain('hub_hl_v1');
    const before = outsideTheHub(home);
    expect(before.some((l) => l.startsWith(path.join('.hoody', 'config.json') + ' 600 '))).toBe(true);

    // The confirm: what the Account page's button runs (pages/account/data.ts), with the warning it showed.
    const shown = localWipeWarning();
    expect(shown?.account).toBe(UID);
    const mark = sent.length;
    expect(await removeLocalData(shown!)).toEqual({ kind: 'started' });
    // To its end: the mount ends by itself (nothing aborts it), as a sign-out's.
    for (let i = 0; i < 1200 && ended === null; i++) await wait(25);
    expect(ended).not.toBeNull();
    expect({ reason: ended!.reason }).toEqual({ reason: 'signed-out' });
    store.close();
    store = null;

    // 1. The Hub's kept settings are off the disk.
    expect(onDisk()).not.toContain('hub_theme_v1');
    expect(onDisk()).not.toContain('hub_hl_v1');
    const again = openHubStore(hubDir, { home, tryLock: () => true });
    try {
      expect(again.get('hub_theme_v1')).toBeNull();
      expect(again.get('hub_hl_v1')).toBeNull();
      // 5. The list `hoody logout` revokes from is still there, with that key in it (no DELETE was sent: 3 below).
      expect(readBootKeys(again)?.map((k) => k.id)).toContain(KEPT_KEY.id);
    } finally { again.close(); }

    // 2. The saved sign-in is what it was, byte for byte; so is everything else outside the Hub's own directory, and
    // the CLI was never asked to renew.
    expect(fs.readFileSync(saved).equals(savedBytes)).toBe(true);
    expect(outsideTheHub(home)).toEqual(before);
    expect(renewals).toBe(0);

    // 3. From the confirm on, nothing that changes server data was sent, and no session was ended on the server.
    const after = sent.slice(mark);
    expect(after.filter((s) => s.method !== 'GET' && s.method !== 'HEAD')).toEqual([]);
    expect(sent.filter((s) => /\/auth\/sessions|logout|sign-?out|revoke/i.test(new URL(s.url).pathname))).toEqual([]);
    expect(sent.filter((s) => s.method === 'DELETE')).toEqual([]);

    // 4. The saved sign-in still opens a session: the same account, the same session.
    const next = await openCliHub(http, PLACES);
    expect(next.ok && next.client.identity).toEqual({ kind: 'account', uid: UID, sid: SID, source: 'login' });
  } finally {
    ac.abort();
    await done;
  }
});
