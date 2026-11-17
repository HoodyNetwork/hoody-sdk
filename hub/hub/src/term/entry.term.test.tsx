// mountTerminalHub (entry.ts) with a fake host io and the fixtures client.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A mount draws on the host's cell writer and ends on q with a receipt naming the page shown | 'q ends the mount' |
// | 2 | The host's abort ends it without asking; the terminal is restored (alternate screen left) | 'abort' |
// | 3 | The fixture entry refuses a live client; the live entry with a client that answers nothing fails its boot: the receipt says ok false with a non-zero exit code and why, the user's terminal gets one sanitised line (its code left out when it is UNHANDLED: a code that names nothing is not shown), nothing is drawn, no session stays open | 'live client' |
// | 6 | Strict globals on (the live default): a trap while mounted (a page that reads `document`) fails the mount: receipt ok false, exit code 1, the trap named first in problems, one sanitised line in the user's terminal after it was restored | 'a trap fails the mount' |
// | 8 | diagnosticDetail: a development mount's problems keep the sanitised message (`detail`); the live entry refuses the option (TERM_DETAIL_DEV_ONLY) | 'detail is dev only' |
// | 10 | pageRoute: a served page's id gives its route (the host's "where you left off"); any other id null | 'page route' |
// | 9 | The receipt's lastView holds the Hub's vocabulary only: a served page's id and manifest path, no params, never the address shown or its search | 'receipt view' |
// | 7 | Strict globals on: the Hub itself (Schedules, the shell, the Ask dock) mounts and quits with no trap: ok, exit 0, no problems | 'strict mount is clean' |
// | 5 | A mount without styles is refused before anything starts (TERM_STYLES_REQUIRED) | 'styles required' |
// | 4 | One mount at a time: a second while one is open is refused (TERM_SESSION_ACTIVE) | 'one at a time' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import { fixtureClient, mountFixtureHub as mountTerminalHub } from './entry.fixture';
import { mountTerminalHub as mountLive } from './entry';
import { pageRoute, receiptView } from './entry.live';
import type { HoodyClient, HubTermOptions } from './host-types';
import { UNSTYLED_FOR_TESTS } from './app/styles';
import { activeStrictGlobals, expectTraps } from './env/strict-globals';
import type { PageManifest } from '@kit/page';
import { discoverPages, visiblePages } from '../app/pages';

setDefaultTimeout(60_000);

function fakeIo(cols = 100, rows = 30) {
  let out = '';
  let feed: ((s: string) => void) | null = null;
  const io: HubTermOptions['io'] = {
    cells: { write: (s) => { out += s; } },
    input: { onData: (cb) => { feed = cb; return () => { feed = null; }; } },
    size: () => ({ cols, rows }),
    colourTier: 'mono',
  };
  return { io, text: () => out, type: (s: string) => feed?.(s), until: async (re: RegExp, ms = 20_000) => {
    const end = performance.now() + ms;
    // The renderer writes escape sequences around the text: match on the text with them taken out.
    const plain = () => out.replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g, '');
    while (!re.test(plain()) && performance.now() < end) await new Promise((r) => setTimeout(r, 50));
    return re.test(plain());
  } };
}

const base = (io: HubTermOptions['io'], extra: Partial<HubTermOptions> = {}) => ({
  styles: UNSTYLED_FOR_TESTS,
  client: fixtureClient(),
  context: { profile: 'test', realmId: 'all' },
  route: { page: 'schedules', path: '/schedules' },
  io,
  onSetDefault: async () => {},
  ...extra,
});

test('q ends the mount', async () => {
  const f = fakeIo();
  const done = mountTerminalHub(base(f.io));
  expect(await f.until(/HOODY/)).toBe(true);
  expect(await f.until(/Schedules/)).toBe(true);
  await new Promise((r) => setTimeout(r, 300));
  f.type('q');
  const receipt = await done;
  expect(receipt.lastView.page).toBe('schedules');
  expect(receipt.actions).toEqual([]);
  expect(receipt.ok).toBe(true);
  expect(receipt.exitCode).toBe(0);
  expect(receipt.reason).toBe('quit');
  // The alternate screen was left (the renderer restored the terminal).
  expect(f.text()).toContain('\x1b[?1049l');
});

test('abort', async () => {
  const f = fakeIo();
  const ac = new AbortController();
  const done = mountTerminalHub(base(f.io, { signal: ac.signal }));
  expect(await f.until(/HOODY/)).toBe(true);
  ac.abort();
  const receipt = await done;
  expect(receipt.lastView.page).toBe('schedules');
  expect(f.text()).toContain('\x1b[?1049l');
});

test('live client', async () => {
  const f = fakeIo();
  const live: HoodyClient = { identity: { kind: 'account', uid: 'u', sid: 's' }, apiOrigin: 'https://api.example.invalid', realmApiDomain: 'x.invalid', request: async () => ({}), fetch: async () => new Response('') };
  await expect(mountTerminalHub(base(f.io, { client: live }))).rejects.toThrow('TERM_FIXTURE_CLIENT_REQUIRED');
  const dead: HoodyClient = { ...live, request: () => Promise.reject({ status: 0, notSent: true }), fetch: () => Promise.reject({ status: 0, notSent: true }) };
  const failed = await mountLive({ ...base(f.io, { client: dead }), strictGlobals: false });
  expect(failed.ok).toBe(false);
  expect(failed.exitCode).toBe(1);
  expect(failed.reason).toBe('boot-failed');
  expect(failed.problems[0]).toMatchObject({ kind: 'boot' });
  expect(f.text()).not.toContain('HOODY');
  expect(f.text()).toContain('hoody hub: could not start');
  // The boot's rejection is no code of the Hub's (UNHANDLED): the person reads the words alone.
  expect(f.text()).not.toContain('UNHANDLED');
  // A next mount is possible: the failed one ended its session.
  const g = fakeIo();
  const ac = new AbortController();
  const next = mountTerminalHub(base(g.io, { signal: ac.signal }));
  expect(await g.until(/HOODY/)).toBe(true);
  ac.abort();
  await next;
});

// A live mount whose client names a bad API origin ends boot-failed with TERM_API_ORIGIN and
// sends nothing; the terminal gets the one failure line, no Hub frame.
test('live mount refuses a bad API origin', async () => {
  for (const apiOrigin of [undefined, 'http://api.example.invalid', 'https://api.example.invalid/path']) {
    const f = fakeIo();
    let sent = 0;
    const bad = { identity: { kind: 'account', uid: 'u', sid: 's' }, realmApiDomain: 'x.invalid', ...(apiOrigin === undefined ? {} : { apiOrigin }), request: async () => { sent++; return {}; }, fetch: async () => { sent++; return new Response(''); } } as HoodyClient;
    const r = await mountLive({ ...base(f.io, { client: bad }), strictGlobals: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('boot-failed');
    expect(r.problems[0]).toMatchObject({ kind: 'boot', code: 'TERM_API_ORIGIN' });
    expect(sent).toBe(0);
    expect(f.text()).toContain('hoody hub: could not start (TERM_API_ORIGIN)');
    expect(f.text()).not.toContain('HOODY');
  }
});

test('one at a time', async () => {
  const a = fakeIo();
  const ac = new AbortController();
  const first = mountTerminalHub(base(a.io, { signal: ac.signal }));
  expect(await a.until(/HOODY/)).toBe(true);
  await expect(mountTerminalHub(base(fakeIo().io))).rejects.toThrow('TERM_SESSION_ACTIVE');
  ac.abort();
  await first;
});

test('styles required', async () => {
  const f = fakeIo();
  const { styles: _gone, ...rest } = base(f.io);
  await expect(mountTerminalHub(rest as never)).rejects.toThrow('TERM_STYLES_REQUIRED');
  expect(f.text()).toBe('');
});

test('a trap fails the mount', async () => {
  const mine = activeStrictGlobals() === null;
  try {
    const f = fakeIo();
    // The Hub reads no browser global: the trap comes from a page made for it.
    const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
    const pages = all.map((p) => (p.id !== 'schedules' ? p : { ...p, load: async () => ({ default: function ReadsDocument(): null { void (globalThis as { document?: unknown }).document; return null; } }) } as unknown as PageManifest));
    expectTraps('document');
    const r = await mountTerminalHub({ ...base(f.io), pages, strictGlobals: true });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.problems[0]).toMatchObject({ kind: 'trap', code: 'TERM_GLOBAL' });
    // Where the read was: the page's own line, src-relative (no install path).
    expect(r.problems[0]!.where?.[0]).toMatch(/^term\/entry\.term\.test\.tsx:\d+$/);
    expect(r.reason).toBe('crashed');
    expect(f.text()).toContain('\x1b[?1049l');
    const after = f.text().slice(f.text().lastIndexOf('\x1b[?1049l'));
    expect(after).toContain('hoody hub: stopped: ');
    expect(after).toContain('(TERM_GLOBAL)');
  } finally {
    if (mine) activeStrictGlobals()?.restore();
  }
});

test('strict mount is clean', async () => {
  const mine = activeStrictGlobals() === null;
  try {
    const f = fakeIo();
    const done = mountTerminalHub({ ...base(f.io), strictGlobals: true });
    expect(await f.until(/Schedules/)).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    f.type('q');
    const r = await done;
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.reason).toBe('quit');
  } finally {
    if (mine) activeStrictGlobals()?.restore();
  }
});

test('detail is dev only', async () => {
  const f = fakeIo();
  await expect(mountLive({ ...base(f.io), diagnosticDetail: true })).rejects.toThrow('TERM_DETAIL_DEV_ONLY');
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  const pages = all.map((p) => (p.id !== 'schedules' ? p : { ...p, load: async () => ({ default: function Throws(): never { throw new TypeError('on purpose for detail'); } }) } as unknown as PageManifest));
  const g = fakeIo();
  const done = mountTerminalHub({ ...base(g.io), pages, diagnosticDetail: true });
  expect(await g.until(/HOODY/)).toBe(true);
  await new Promise((r) => setTimeout(r, 500));
  g.type('q');
  const r = await done;
  const page = r.problems.find((p) => p.kind === 'page') as (typeof r.problems)[number] & { detail?: string } | undefined;
  expect(page?.detail).toContain('on purpose for detail');
  // Without the option the same mount's records carry no message.
  const h = fakeIo();
  const plain = mountTerminalHub({ ...base(h.io), pages });
  expect(await h.until(/HOODY/)).toBe(true);
  await new Promise((r) => setTimeout(r, 500));
  h.type('q');
  expect((await plain).problems.some((p) => 'detail' in p)).toBe(false);
});

test('receipt view', () => {
  const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  const v = receiptView({ page: 'computers', path: '/computers/c0a7150000000000000000a1', search: { sel: 'TOKEN_CANARY_ABC123', q: 'hdy_secret' } }, pages);
  expect(v).toEqual({ page: 'computers', screen: pages.find((p) => p.id === 'computers')!.path, params: {} });
  expect(receiptView({ page: 'TOKEN_CANARY_ABC123', path: '/x', search: {} }, pages)).toEqual({ page: 'home', screen: pages.find((p) => p.id === 'home')!.path, params: {} });
});

test('page route', () => {
  // Where the host's last run ended (the receipt's page id) opens again only while this build serves that page.
  const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  for (const id of ['keys', 'computers', 'realms']) expect(pageRoute(id)).toEqual({ page: id, path: pages.find((p) => p.id === id)!.path });
  for (const id of ['gone-page', '', 'TOKEN_CANARY_ABC123']) expect(pageRoute(id)).toBeNull();
});
