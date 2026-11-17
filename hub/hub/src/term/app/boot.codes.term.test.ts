// A live boot that does not reach `ready` ends the mount with its TERM_BOOT_* code (boot-code.ts), and that code is in
// the diagnostic vocabulary, so the failure record and the one line left in the terminal name it
// (docs/troubleshooting.md "TERM_BOOT_<STATE>").
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A refused first account read (500) ends the mount as boot-failed; its record carries TERM_BOOT_FAILED and the line reads "could not start (TERM_BOOT_FAILED)" | 'refused account read' |
// | 2 | An account banned at launch ends as suspended; its record carries TERM_BOOT_BANNED | 'banned at launch' |
// | 3 | Every TERM_BOOT_* code the troubleshooting page names (one per boot state short of ready) is in the vocabulary | 'documented boot codes' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { currentTermSession } from '../env/session';
import type { HoodyClient } from '../host-types';
import { failureText } from '../entry.live';
import { liveBoot } from './boot.live';
import { DIAGNOSTIC_CODES } from './diagnostic-codes.gen';
import { startTermHub } from './lifecycle';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(120_000);
afterEach(() => { currentTermSession()?.end(); });

const pages: readonly PageManifest[] = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
const UID = '64f0ada00000000000000001';

function streams() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & PassThrough;
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  const w = new Writable({ write(_c, _e, done) { done(); } });
  Object.defineProperties(w, { isTTY: { value: true }, columns: { get: () => 100 }, rows: { get: () => 30 } });
  return { stdin, stdout: w as unknown as NodeJS.WriteStream };
}

/** A client whose account read answers `me` (a rejection when it is an Error-shaped refusal). */
function client(me: { data: Record<string, unknown> } | { status: number; code: string }): HoodyClient {
  const answers: Record<string, unknown> = {
    'GET /users/auth/me': me,
    'GET /realms': { data: { realm_ids: [] } },
    'GET /vault/keys/hoody.realm-aliases': { data: { value: '{}' } },
  };
  return {
    identity: { kind: 'account', uid: UID, sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: (method, p, _b, o) => {
      const a = answers[`${method} ${p.split('?')[0]}`];
      if (a === undefined || !o.beforeWire()) return Promise.reject({ status: 0, notSent: true });
      if ('status' in (a as object)) return Promise.reject(structuredClone(a));
      return Promise.resolve(structuredClone(a));
    },
    fetch: () => Promise.reject({ status: 0, notSent: true }),
  } as HoodyClient;
}

async function mountWith(c: HoodyClient) {
  const s = streams();
  const hub = await startTermHub({ pages, path: '/schedules', boot: liveBoot(c, { profile: 'test', realmId: 'all' }, () => '/'), queryClient, styles: UNSTYLED_FOR_TESTS, stdin: s.stdin, stdout: s.stdout, width: 100, height: 30 });
  return hub.closed;
}

test('refused account read', async () => {
  const end = await mountWith(client({ status: 500, code: 'INTERNAL_ERROR' }));
  expect(end.exit.reason).toBe('boot-failed');
  expect(end.reason).toBe('boot-failed');
  expect(end.problems[0]).toMatchObject({ kind: 'boot', code: 'TERM_BOOT_FAILED' });
  expect(failureText(end)).toBe('hoody hub: could not start (TERM_BOOT_FAILED)');
});

test('banned at launch', async () => {
  const end = await mountWith(client({ data: { id: UID, username: 'ada', is_banned: true } }));
  expect(end.reason).toBe('suspended');
  expect(end.problems[0]).toMatchObject({ kind: 'boot', code: 'TERM_BOOT_BANNED' });
  expect(failureText(end)).toBe('hoody hub: this account is suspended');
});

test('documented boot codes', () => {
  const doc = fs.readFileSync(path.join(import.meta.dir, '../docs/troubleshooting.md'), 'utf8');
  const named = [...new Set([...doc.matchAll(/\bTERM_BOOT_[A-Z][A-Z_]*\b/g)].map((m) => m[0]))].sort();
  // The page's TERM_BOOT_<STATE> row names one code per state core's bootLive can end in short of `ready`.
  expect(named).toEqual(['TERM_BOOT_BANNED', 'TERM_BOOT_FAILED', 'TERM_BOOT_LEAVING', 'TERM_BOOT_OFFLINE', 'TERM_BOOT_PURGE_FAILED']);
  expect(named.filter((c) => !DIAGNOSTIC_CODES.has(c))).toEqual([]);
});
