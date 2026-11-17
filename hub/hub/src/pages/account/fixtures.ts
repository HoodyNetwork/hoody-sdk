// Fake-API states of the account page for hub:dev, hub:shots, tests and specs.
import { defineFixtures } from '@app/fixtures';
import { fixtureSession, fixtureWorld, type LocalWipeWarning, type ScriptAsk } from '@core';
import { qrMatrix, type IpDetails } from '@kit';
import type { ComputerKey, ComputerKeys, HistoryEntry, HistoryPage, Profile, Session, SessionsPage, SetupSecrets, TwoFactor } from './data';

const profile: Profile = {
  id: fixtureWorld.account.id,
  email: fixtureWorld.account.email,
  emailVerified: true,
  username: fixtureWorld.account.username,
  alias: fixtureWorld.account.name,
  since: '2025-03-14T09:30:00Z',
  pendingEmail: null,
  pendingUntil: null,
  undoUntil: null,
  hasPassword: true,
  supportMail: true,
};

const on: TwoFactor = { enabled: true, setupUnfinished: false, codesLeft: 8, gate: true };
const off: TwoFactor = { enabled: false, setupUnfinished: false, codesLeft: null, gate: false };

const NOW = Date.UTC(2026, 9, 23, 3, 0);
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

// What the server records: the client's own name (rare), how it signed in, and its user agent. The page names each
// device from these (logic deviceLabel), as it does for real rows.
const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
} as const;

// [client name, method, IP, country, keys made, client, user agent]
const DEVICES = [
  ['', 'password', '203.0.113.24', 'SG', 2, 'web', UA.chromeMac],
  ['', 'two_factor', '198.51.100.7', 'DE', 0, 'web', UA.firefoxLinux],
  ['', 'google', '192.0.2.88', 'US', 0, 'web', UA.safariIphone],
  ['build-server', 'device', '203.0.113.90', 'SG', 14, 'cli', 'hoody-cli/3.4.1'],
  ['', 'github', '198.51.100.130', 'GB', 1, 'web', UA.edgeWindows],
  ['', 'password', '192.0.2.12', 'IN', 0, 'web', UA.chromeAndroid],
] as const;

function session(i: number, over: Partial<Session> = {}): Session {
  const d = DEVICES[i % DEVICES.length] ?? DEVICES[0];
  return {
    id: `5e55c0ffee${String(i).padStart(14, '0')}`,
    current: false,
    active: true,
    method: d[1],
    client: d[5],
    clientName: d[0],
    userAgent: d[6],
    createdAt: ago(60 * 24 * (i + 2)),
    lastSeenAt: ago(i * 37 + 3),
    lastIp: d[2],
    lastCountry: d[3],
    endedAt: null,
    endReason: null,
    endedHere: false,
    keysMade: d[4],
    ...over,
  };
}

// Two rows a real account also has: a script on the SDK, and an old row the server knows nothing about.
const odd: Record<number, Partial<Session>> = {
  9: { client: 'sdk', clientName: '', userAgent: 'node', method: 'password', keysMade: 3 },
  11: { client: 'unknown', clientName: '', userAgent: '' },
};
const active: Session[] = [session(0, { current: true, lastSeenAt: ago(0) }), ...Array.from({ length: 11 }, (_, i) => session(i + 1, odd[i + 1]))];
const REASONS = ['user_revoked', 'expired', 'password_changed', 'others_revoked', 'two_factor_changed', 'session_cap'] as const;
const ended: Session[] = Array.from({ length: 6 }, (_, i) =>
  session(i + 20, { active: false, endedAt: ago(i * 400 + 90), endReason: REASONS[i % REASONS.length] ?? 'expired', endedHere: i === 0 }),
);

const page = (sessions: Session[], hasMore = false): SessionsPage => ({ sessions, hasMore });

// Security history: the devices' sign-ins, and with Everything the refused attempts and security events between them.
function entry(i: number, event: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  const d = DEVICES[i % DEVICES.length] ?? DEVICES[0];
  return { id: `5ec0ffee${String(i).padStart(16, '0')}`, event, failed: /_failed$/.test(event), ip: d[2], country: d[3], client: 'web', at: ago(i * 290 + 4), ...over };
}
const signins: HistoryEntry[] = Array.from({ length: 9 }, (_, i) => entry(i * 2, 'login', i === 4 ? { client: 'cli' } : {}));
const everything: HistoryEntry[] = [
  ...signins,
  entry(1, 'login_failed', { ip: '198.51.100.201', country: null }),
  entry(3, 'login_failed', { ip: '198.51.100.201', country: null }),
  entry(5, 'logout'),
  entry(7, 'otp_enabled'),
  entry(9, 'otp_verify_failed'),
  // A name this page has no words for: the row shows it as cleaned text.
  entry(11, 'backup code used', { client: null }),
  entry(13, 'password_changed'),
  entry(15, 'auth_token_created'),
  entry(17, 'session_revoked'),
  entry(19, 'oauth_linked'),
  entry(21, 'email_change_requested'),
].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
const hpage = (entries: HistoryEntry[]): HistoryPage => ({ entries, page: 1, pages: 1 });

// Computer SSH keys: the world's computers, some with a key (a fixture key, never a real one) and some without.
const ck = (id: string, name: string, key: string | null): ComputerKey => ({ id, name, handle: `${name}.${id.slice(-4)}`, key });
const computerKeys: ComputerKeys = {
  rows: [
    ck('c0a7150000000000000000a1', 'atlas', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000AcctKey1 ada@laptop'),
    ck('c0a7150000000000000000b2', 'borealis', null),
    ck('c0a7150000000000000000c3', 'cedar', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQFakeFixtureRsaKeyOnlyCedar9'),
    ck('c0a7150000000000000000f6', 'fjord', null),
    ck('c0a715000000000000000107', 'granite', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000Granite7 ci-deploy@build-runner-07.acme.example (rotated 2026-11-01, owner platform team, read-only)'),
  ],
  whole: true,
};

/** A real, scannable QR (of a fixture address) so the shots show the layout a live one has. */
function fakeQr(): string {
  const m = qrMatrix('https://example.com/2fa-fixture');
  if (!m) return '';
  let d = '';
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.size} ${m.size}" shape-rendering="crispEdges"><path fill="#000" d="${d}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const secrets: SetupSecrets = {
  manualKey: 'JBSW Y3DP EHPK 3PXP',
  qr: fakeQr(),
  codes: ['4k7p-9xqa', 'h2mz-83tw', 'c6vb-0ndr', 'q1ey-7sjf', 'u5ao-2lgk', 'w9ti-6bxm', 'r3hd-1cpz', 'n8yl-4vue'],
};

// Remove all local data: nothing tracked (the plain confirm), a browser with changes and a question that may already
// have gone through (the confirm names them and asks for the tick), and one with a payment not settled (refused).
const WIPE_ACCOUNT = fixtureWorld.account.id;
const wipeNone: LocalWipeWarning = { account: WIPE_ACCOUNT, holds: [], asks: [], payments: 'settled' };
const wipeAsk: ScriptAsk = {
  askId: 'ask-fixture-1', compId: 'comp-1', path: 'scripts/backup.ts', realm: null, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1, createKey: 'hub-ck-fixture-1', turnKey: 'hub-tk-fixture-1',
};
const wipeItems: LocalWipeWarning = {
  account: WIPE_ACCOUNT,
  holds: [
    { ref: { id: `${WIPE_ACCOUNT}\u0001computers:start:c1`, token: '1#a' }, page: 'computers' },
    { ref: { id: `${WIPE_ACCOUNT}\u0001computers:rename:c2`, token: '1#b', sending: true }, page: 'computers' },
    { ref: { id: `attempt\u0002${WIPE_ACCOUNT}\u0001keys:create`, token: 'inc-1' }, page: null },
  ],
  asks: [wipeAsk],
  payments: 'settled',
};
// GET /ip as the page selects it (kit ipDetailsFrom): an address with its place.
const myIp: IpDetails = { ip: '203.0.113.7', version: 4, city: 'Lisbon', region: 'Lisbon', country: 'PT', timezone: 'Europe/Lisbon' };
const done = { outcome: 'done' as const };
const base = {
  identity: { data: { banned: false } },
  profile: { data: profile },
  twofa: { data: on },
  'sessions-active': { data: page(active) },
  'sessions-ended': { data: page(ended) },
  changePassword: done,
  setup: { outcome: 'done' as const, data: secrets },
  verifySetup: done,
  turnOff: done,
  newCodes: { outcome: 'done' as const, data: { codes: secrets.codes } },
  setGate: done,
  endSession: { outcome: 'done' as const, data: { alreadyEnded: false } },
  endOthers: { outcome: 'done' as const, data: { ended: 11 } },
  rename: done,
  emailStart: done,
  emailCancel: done,
  supportMail: done,
  mailReset: done,
  mailVerify: done,
  'history-signins': { data: hpage(signins) },
  'history-all': { data: hpage(everything) },
  'computer-keys': { data: computerKeys },
  'my-ip': { data: myIp },
  'wipe-warning': { data: wipeNone },
  wipeLocal: done,
};

const noPassword = { twofa: { data: off }, changePassword: { outcome: 'failed' as const, code: 'PASSWORD_NOT_SET', status: 400 }, setup: { outcome: 'failed' as const, code: 'PASSWORD_NOT_SET', status: 400 } };

export default defineFixtures({
  default: 'many',
  states: {
    many: base,
    'twofa-off': { ...base, twofa: { data: off } },
    'twofa-unfinished': { ...base, twofa: { data: { ...off, setupUnfinished: true } } },
    'twofa-low': { ...base, twofa: { data: { ...on, codesLeft: 2 } } },
    'twofa-unreadable': { ...base, twofa: { data: null } },
    'twofa-pending-unreadable': { ...base, twofa: { data: null }, turnOff: { outcome: 'pending' as const } },
    'end-pending': { ...base, endOthers: { outcome: 'pending' as const } },
    // End all other sessions refused: the dialog stays open with the refusal under its sentence.
    'end-rate': { ...base, endOthers: { outcome: 'failed' as const, code: 'RATE_LIMITED' } },
    'codes-pending': { ...base, newCodes: { outcome: 'pending' as const } },
    'codes-nosecret': { ...base, newCodes: { outcome: 'done' as const, data: {} } },
    'twofa-gate-off': { ...base, twofa: { data: { ...on, gate: false } } },
    'twofa-pending': { ...base, turnOff: { outcome: 'pending' as const } },
    unverified: { ...base, profile: { data: { ...profile, emailVerified: false, alias: '' } } },
    'pw-wrong': { ...base, changePassword: { outcome: 'failed' as const, code: 'CURRENT_PASSWORD_INCORRECT' } },
    'pw-pending': { ...base, changePassword: { outcome: 'pending' as const } },
    'pw-rate': { ...base, changePassword: { outcome: 'failed' as const, code: 'RATE_LIMITED' } },
    // Two-step off, so Set up opens (it opens only while two-step is off); Turn off still opens by its link (?sheet=off).
    'code-wrong': {
      ...base,
      twofa: { data: off },
      verifySetup: { outcome: 'failed' as const, code: 'INVALID_OTP_CODE' },
      turnOff: { outcome: 'failed' as const, code: 'INVALID_OTP_CODE' },
    },
    'sessions-empty': {
      ...base,
      'sessions-active': { data: page([session(0, { current: true, lastSeenAt: ago(0) })]) },
      'sessions-ended': { data: page([]) },
    },
    suspended: { ...base, identity: { data: { banned: true } } },
    // More active sessions than the first page (50) holds: the summary's count is a floor.
    'sessions-more': { ...base, 'sessions-active': { data: page(active, true) } },
    // A shared-access (token) session: core refuses the account's own reads unsent.
    'access-key': { ...base, rules: [fixtureSession({ kind: 'token', caps: [] })] },
    // The page's own identity read failed (the core's boot identity still says who is shown, and whether suspended).
    'identity-error': { ...base, identity: { error: 'server' } },
    'rename-pending': { ...base, rename: { outcome: 'pending' as const } },
    'email-waiting': { ...base, profile: { data: { ...profile, pendingEmail: 'ada.new@example.com', pendingUntil: '2026-10-24T03:00:00Z' } } },
    'email-undo': { ...base, profile: { data: { ...profile, undoUntil: '2026-10-30T03:00:00Z' } } },
    'email-pending': { ...base, emailStart: { outcome: 'pending' as const } },
    'email-wrong': { ...base, emailStart: { outcome: 'failed' as const, code: 'CURRENT_PASSWORD_INCORRECT', status: 401 } },
    'email-locked': { ...base, emailStart: { outcome: 'failed' as const, code: 'EMAIL_CHANGE_LOCKED', status: 409 } },
    'email-domain': { ...base, emailStart: { outcome: 'failed' as const, code: 'EMAIL_DOMAIN_NOT_ACCEPTED', status: 400 } },
    // A sign-in that cannot answer a two-step prompt (core passes the refusal on).
    'email-code-needed': { ...base, twofa: { data: off }, emailStart: { outcome: 'failed' as const, code: 'OTP_REQUIRED', status: 400 } },
    // Unknown outcome, then Check again reads the profile: waiting on the asked address, or on another device's.
    'email-pending-mine': { ...base, emailStart: { outcome: 'pending' as const }, profile: { data: { ...profile, pendingEmail: 'ada.new@example.com', pendingUntil: '2026-10-24T03:00:00Z' } } },
    'email-pending-other': { ...base, emailStart: { outcome: 'pending' as const }, profile: { data: { ...profile, pendingEmail: 'someone.else@example.com', pendingUntil: '2026-10-24T03:00:00Z' } } },
    'email-cancel-pending': {
      ...base,
      profile: { data: { ...profile, pendingEmail: 'ada.new@example.com', pendingUntil: '2026-10-24T03:00:00Z' } },
      emailCancel: { outcome: 'pending' as const },
    },
    // An account made with GitHub or Google: no password yet, so the password row offers the reset mail. Such an
    // account has no two-step sign-in either (turning it on asks for the password), and the API refuses both the
    // password change and the set-up by name.
    'no-password': { ...base, ...noPassword, profile: { data: { ...profile, hasPassword: false } } },
    'no-password-rate': { ...base, ...noPassword, profile: { data: { ...profile, hasPassword: false } }, mailReset: { outcome: 'failed' as const, code: 'RATE_LIMITED', data: { retryAfter: 1800 } } },
    'no-password-unsure': { ...base, ...noPassword, profile: { data: { ...profile, hasPassword: false } }, mailReset: { outcome: 'pending' as const } },
    // The same account behind an API that does not report has_password: only the server's refusal tells.
    'setup-no-password': { ...base, ...noPassword, profile: { data: { ...profile, hasPassword: undefined } } },
    // The address is not verified yet: the email row and the checklist offer the verification mail again.
    'email-unverified': { ...base, profile: { data: { ...profile, emailVerified: false } } },
    'email-unverified-rate': { ...base, profile: { data: { ...profile, emailVerified: false } }, mailVerify: { outcome: 'failed' as const, code: 'RATE_LIMITED', data: { retryAfter: 2400 } } },
    // An API that reports neither field: the page is as it was before them.
    'profile-older': { ...base, profile: { data: { ...profile, hasPassword: undefined, supportMail: undefined } } },
    'support-mail-off': { ...base, profile: { data: { ...profile, supportMail: false } } },
    'support-mail-pending': { ...base, supportMail: { outcome: 'pending' as const } },
    'support-mail-failed': { ...base, supportMail: { outcome: 'failed' as const, code: 'SERVER', status: 500 } },
    'rename-failed': { ...base, rename: { outcome: 'failed' as const, code: 'SERVER' } },
    'history-empty': { ...base, 'history-signins': { data: hpage([]) }, 'history-all': { data: hpage([]) } },
    'history-error': { ...base, 'history-signins': { error: 'server' }, 'history-all': { error: 'server' } },
    // A full page (HISTORY_LIMIT, 100 rows) whose answer gave no page count: more may follow (every page answers it).
    'history-uncounted': { ...base, 'history-signins': { data: { entries: Array.from({ length: 100 }, (_, i) => entry(i, 'login')), page: 1, pages: null } } },
    'wipe-items': { ...base, 'wipe-warning': { data: wipeItems } },
    'wipe-changed': { ...base, 'wipe-warning': { data: wipeItems }, wipeLocal: { outcome: 'failed' as const, code: 'CHANGED' } },
    'wipe-tabs': { ...base, wipeLocal: { outcome: 'failed' as const, code: 'TABS' } },
    'wipe-unchecked': { ...base, wipeLocal: { outcome: 'failed' as const, code: 'UNCHECKED', data: { what: ['databases', 'payments'] } } },
    'wipe-payments': { ...base, 'wipe-warning': { data: { ...wipeNone, payments: 'held' as const } } },
    'wipe-failed': { ...base, wipeLocal: { outcome: 'failed' as const, code: 'UNREADABLE' } },
    'keys-empty': { ...base, 'computer-keys': { data: { rows: [], whole: true } } },
    'keys-error': { ...base, 'computer-keys': { error: 'server' } },
    'keys-partial': { ...base, 'computer-keys': { data: { ...computerKeys, whole: false } } },
    'ip-loading': { ...base, 'my-ip': { pending: true } },
    'ip-error': { ...base, 'my-ip': { error: 'server' } },
    // An answer naming no address (ipDetailsFrom gives null): not known, never a blank row.
    'ip-none': { ...base, 'my-ip': { data: null } },
    loading: {
      ...base,
      profile: { pending: true },
      twofa: { pending: true },
      'sessions-active': { pending: true },
      'sessions-ended': { pending: true },
      'history-signins': { pending: true },
      'history-all': { pending: true },
      'computer-keys': { pending: true },
      'my-ip': { pending: true },
    },
    error: { ...base, profile: { error: 'server' }, twofa: { error: 'server' }, 'sessions-active': { error: 'server' } },
  },
});
