// Fake-API states of the notifications page for hub:dev, hub:shots, tests and specs: core-format rules over
// the page's routes (data.ts). The fake server remembers acknowledgements within one boot (an acknowledged
// notice moves to the Archive), as the real one does. Each state also carries the fixture browser ("browser",
// read by fixtureSource) for Get notified, and the abuse notices about the account's servers (the Notices view): every
// state answers them as `notices` (a normal list), and the notices-* states change only them.
import { answers, defineFixtures, fixtureSession, fixtureWorld, manyNames, notificationSummaryRoute, reply, type FixtureRule } from '@core';
import { abuseRoutes } from './abuse';
import { routes, type BrowserOverride, type Notice, type NoticeType, type Severity } from './data';

const NOW = Date.UTC(2026, 9, 23, 3, 0);
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

interface Template {
  title: (name: string) => string;
  message: (name: string, server: string) => string;
  severity: Severity;
  type?: NoticeType;
}

// Notices are built from the fixture world: its computers and servers, then generated names for the long tail.
const TEMPLATES: readonly Template[] = [
  {
    title: (n) => `Computer ${n} stopped`,
    message: (n, v) => `${n} stopped after running out of memory on ${v}. Start it again from Computers, or open the logs to see what happened.`,
    severity: 'ERROR',
    type: 'STATUS_UPDATE',
  },
  {
    title: (n) => `Payment received for ${n}`,
    message: (n) => `Your payment for ${n} was received. Your wallet balance is now $34.50.`,
    severity: 'SUCCESS',
    type: 'BILLING',
  },
  {
    title: (n) => `Server ${n} rental ends in 3 days`,
    message: (n) => `Your rental of ${n} ends on Oct 26. Extend it from Market to keep your computers running.`,
    severity: 'WARNING',
    type: 'BILLING',
  },
  {
    title: (n) => `Computer ${n} is running`,
    message: (n, v) => `${n} finished being created and is running on ${v}.`,
    severity: 'SUCCESS',
    type: 'STATUS_UPDATE',
  },
  {
    title: (n) => `Planned maintenance for ${n}`,
    message: (n) => `The server for ${n} restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.`,
    severity: 'INFO',
    type: 'MAINTENANCE',
  },
  {
    title: (n) => `Renewal coming up for ${n}`,
    message: (n) => `Your paid server for ${n} renews in 5 days for $12.00.`,
    severity: 'INFO',
    type: 'BILLING',
  },
  {
    title: (n) => `Storage share ${n} expires tomorrow`,
    message: (n) => `The share "${n}" expires tomorrow.`,
    severity: 'WARNING',
    type: 'STATUS_UPDATE',
  },
  {
    title: (n) => `Hoody news: ${n}`,
    // The one announcement carries both formatting marks (bold, a bare https link): the inbox renders them, the list does not.
    message: () => 'Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.',
    severity: 'INFO',
  },
];

const SERVERS = fixtureWorld.servers.map((v) => v.name);
const NAMES = [...fixtureWorld.computers.map((c) => c.name), ...manyNames(80, 7)];

function make(n: number, offset: number, read: boolean): Notice[] {
  // Wire-shaped below (wire()); Notice here is the row the page shows.
  return Array.from({ length: n }, (_, i) => {
    const k = i + offset;
    const t = TEMPLATES[k % TEMPLATES.length] as Template;
    const name = NAMES[k] as string;
    return {
      id: `${(0x4e0000 + k).toString(16).padStart(6, '0')}${'0'.repeat(18)}`,
      title: t.title(name),
      message: t.message(name, SERVERS[k % SERVERS.length] as string),
      severity: t.severity,
      type: t.type,
      at: ago(4 + k * 53),
      read,
    };
  });
}

const unread = make(26, 0, false);
const archive = make(40, 30, true);

// The fake server's memory of acknowledgements for this session (tests reset it with resetFixtureServer).
const acked = new Set<string>();
/** Every mark-read the fixture server answered done, in order (tests count re-sends). */
const ackSends: string[] = [];
/** Tests only: the ids of the mark-reads answered done since the last reset. */
export const doneAckSends = (): readonly string[] => ackSends;
/** How many marks the lost states received (each one a send the page made). */
let lostSends = 0;
export const lostAckSends = (): number => lostSends;
let allAcked = false;
let listDown = false;
/** 'ack-first-pending': the first mark-read may have gone through, later ones are done. */
let firstAckSeen = false;
/** Test seam: the list (every read-back) answers 500 while down. */
export function setListDown(v: boolean): void {
  listDown = v;
}
/** While held, every list read waits (a read-back in flight); holdList() returns the release. */
let listHold: Promise<void> | null = null;
/** Test seam: hold every list read until the returned function is called. */
export function holdList(): () => void {
  let release = () => {};
  listHold = new Promise((r) => (release = r));
  return () => {
    listHold = null;
    release();
  };
}
/** Each fixture boot starts from the server's first state: no acknowledgement, and the notices with no reply received
 *  (a reply one boot stored showed as an earlier message in the next: the reply shot's wider frame had it twice). */
export function resetFixtureServer(): void {
  resetAbuseFixtures();
  listDown = false;
  listHold = null;
  firstAckSeen = false;
  ackSends.length = 0;
  lostSends = 0;
  acked.clear();
  allAcked = false;
}

const wire = (n: Notice, read = n.read) => ({ id: n.id, title: n.title, message: n.message, severity: n.severity, type: n.type, created_at: n.at, is_read: read });
const isAcked = (n: Notice) => allAcked || acked.has(n.id);

/** The list route over these boxes; `total` overrides the unread count (capped). */
function list(u: readonly Notice[], a: readonly Notice[], total?: number): FixtureRule[] {
  const unreadNow = () => u.filter((n) => !isAcked(n));
  const unreadCount = () => (total !== undefined ? total - (u.length - unreadNow().length) : unreadNow().length);
  return [
    reply(routes.list, async (req) => {
      // The answer is the server as it stood when the read was sent; a held read lands later with it.
      const down = listDown;
      const rows = req.query.unread_only === 'true' ? unreadNow().map((n) => wire(n)) : [...u.filter(isAcked).map((n) => wire(n, true)), ...a.map((n) => wire(n))];
      const all = req.query.unread_only === 'true' ? unreadCount() : rows.length;
      if (listHold) await listHold;
      if (down) return { status: 500, body: { error: 'SERVER_ERROR' } };
      return { status: 200, body: { data: rows, pagination: { total: all, totalPages: 1 } } };
    }),
    // The bell and the sidebar count read the same inbox, so every count on screen agrees.
    reply(notificationSummaryRoute, () => {
      const first = unreadNow()[0];
      const n = unreadCount();
      return {
        status: 200,
        body: { data: { unread_count: Math.min(n, 99), is_capped: n > 99, unread_cap: 99, latest_id: first?.id ?? null, latest_created_at: first?.at ?? null, poll_interval_seconds: 300 } },
      };
    }),
  ];
}

const ackedId = (path: string): string | undefined => {
  const id = /\/notifications\/([^/]+)\/read/.exec(path)?.[1];
  return id ? decodeURIComponent(id) : undefined;
};
/** The server applies each mark, then answers `answer` ('done': 200). A 5xx after applying is what "may have
 * gone through" means: a fresh list shows the effect and proves it (logic.ts markReadProves). */
const acks = (answer: 'done' | ReturnType<typeof answers.pending5xx>): FixtureRule[] => [
  reply(routes.markRead, (req) => {
    const id = ackedId(req.path);
    if (id) {
      acked.add(id);
      if (answer === 'done') ackSends.push(id);
    }
    return answer === 'done' ? { status: 200, body: { ok: true } } : answer;
  }),
  reply(routes.markAllRead, () => {
    allAcked = true;
    return answer === 'done' ? { status: 200, body: { ok: true } } : answer;
  }),
];
/** Each mark is lost on the way (nothing applied) yet answers 502: no fresh list can prove it. */
const lostAcks = (delayMs?: number): FixtureRule[] => [
  reply(routes.markRead, () => ((lostSends += 1), answers.pending5xx(502, delayMs))),
  reply(routes.markAllRead, () => ((lostSends += 1), answers.pending5xx(502, delayMs))),
];
/** The refusals: nothing applied. */
const refusedAcks = (status: number, code: string): FixtureRule[] => [reply(routes.markRead, answers.refused(status, code)), reply(routes.markAllRead, answers.refused(status, code))];

// ---- abuse notices (wire-shaped: the owner answer of the API, nothing more) ----
interface WireMessage {
  /** Its place in the notice's thread, from 1. */
  seq: number;
  author_kind: 'admin' | 'owner';
  body: string;
  created_at: string;
}
interface WireNotice {
  id: string;
  title: string;
  server_label: string | null;
  status: 'open' | 'resolved';
  restriction: 'active' | 'lifted' | null;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  message: string;
  messages: WireMessage[];
}
const abuseId = (k: number) => `${(0xab0000 + k).toString(16).padStart(6, '0')}${'0'.repeat(18)}`;
/** The open notice whose suspension is still active (the first row, newest update). */
export const NOTICE_OPEN = abuseId(0);
/** An open notice with no suspension linked. */
export const NOTICE_PLAIN = abuseId(1);
/** A resolved notice (it takes no reply). */
export const NOTICE_RESOLVED = abuseId(2);
/** An open notice whose server name the API no longer has (`server_label: null`). */
export const NOTICE_UNNAMED = abuseId(7);
/** In 'notices-many' only: the oldest of 130 notices, still open, past the API's first page of 100. */
export const NOTICE_OLDEST = abuseId(129);
export const NOTICE_OLDEST_TITLE = 'Cryptocurrency mining reported from your server';
const ABUSE_TITLES = [
  'Outgoing spam reported from your server',
  'Port scanning reported from your server',
  'Copyright complaint about content on your server',
  'Phishing page reported on your server',
];
function abuseNotices(n: number): WireNotice[] {
  return Array.from({ length: n }, (_, k) => {
    const server = SERVERS[k % SERVERS.length] as string;
    const resolved = k === 2 || (k > 3 && k % 5 === 0);
    const created = ago(60 * 24 * (k + 1));
    const updated = ago(30 + k * 97);
    return {
      id: abuseId(k),
      title: ABUSE_TITLES[k % ABUSE_TITLES.length] as string,
      // One row whose server name the API no longer has.
      server_label: k === 7 ? null : server,
      status: resolved ? 'resolved' : 'open',
      restriction: k === 0 ? 'active' : k === 2 ? 'lifted' : null,
      // The unnamed row also has no recorded send time (the API declares both nullable).
      created_at: k === 7 ? null : created,
      updated_at: updated,
      resolved_at: resolved ? updated : null,
      message: `We received a report about ${server}. Please check what runs on it and reply here with what you found and what you changed.`,
      messages:
        k === 0
          ? [
              { seq: 1, author_kind: 'owner', body: 'Thanks, I am looking into it now.', created_at: ago(200) },
              { seq: 2, author_kind: 'admin', body: 'Thank you. Tell us when the mail queue is clean.', created_at: ago(60) },
            ]
          : [],
    };
  });
}
/** Every reply the fixture server received, in order (tests count sends; a send is never repeated). */
export const abuseReplies: { id: string; body: string }[] = [];
/** The fake server's notices for this boot (a stored reply shows on the next read). */
let abuseStore: WireNotice[] = abuseNotices(40);
/** 'notices-many' only: 90 older notices after the 40, the oldest open with its own title. */
const olderNotices = (): WireNotice[] => abuseNotices(130).slice(40).map((n) => (n.id === NOTICE_OLDEST ? { ...n, title: NOTICE_OLDEST_TITLE, status: 'open', resolved_at: null } : n));
let abuseOlder: WireNotice[] = olderNotices();
const noticeOf = (path: string): WireNotice | undefined => {
  const id = /\/abuse-notices\/([^/]+)/.exec(path)?.[1];
  return id ? [...abuseStore, ...abuseOlder].find((x) => x.id === decodeURIComponent(id)) : undefined;
};
/** Test seam: the notice's owner replies brought up to `count` (earlier ones, already stored), so a test can reach
 *  the reply limit without sending them all. resetAbuseFixtures undoes it. */
export function fillOwnerRepliesForTests(id: string, count: number): void {
  const n = abuseStore.find((x) => x.id === id);
  if (!n) throw new Error(`no fixture notice ${id}`);
  while (n.messages.filter((m) => m.author_kind === 'owner').length < count) {
    n.messages.push({ seq: n.messages.length + 1, author_kind: 'owner', body: 'An earlier reply.', created_at: ago(300) });
  }
}
const listRow = ({ message: _u, messages: _m, ...row }: WireNotice) => row;
/** Reads per notice id since boot (a state can answer later reads of one notice otherwise). */
const abuseGets = new Map<string, number>();
interface ReadOpts {
  /** From this read of a notice on (1-based), the get answers another notice: a wrong answer Check again must not trust. */
  readonly wrongFrom?: number;
  /** From this read of a notice on, the get answers that late (ms). */
  readonly slowFrom?: number;
  /** Every read of a notice fails this way: a 500, no answer, or a 200 of the wrong shape. */
  readonly getFails?: '500' | 'lost' | 'malformed';
  /** The list page this way: a 500, or a 200 of the wrong shape. */
  readonly pageFails?: { readonly page: number; readonly how: '500' | 'malformed' };
}
const abuseReads = (rows: () => WireNotice[], o: ReadOpts = {}): FixtureRule[] => [
  // Paged as the API pages (page, limit ≤ 100, has_more).
  reply(abuseRoutes.list, (req) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    if (o.pageFails?.page === page) {
      if (o.pageFails.how === '500') return answers.refused(500, 'SERVER_ERROR');
      return { status: 200, body: { statusCode: 200, data: [{ id: 'not-a-notice' }], pagination: { page, limit, total: 1, has_more: false } } };
    }
    const all = [...rows()].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    const data = all.slice((page - 1) * limit, page * limit).map(listRow);
    return { status: 200, body: { statusCode: 200, message: 'Abuse notices', data, pagination: { page, limit, total: all.length, has_more: page * limit < all.length } } };
  }),
  reply(abuseRoutes.get, (req) => {
    if (o.getFails === '500') return answers.refused(500, 'SERVER_ERROR');
    if (o.getFails === 'lost') return answers.lost();
    if (o.getFails === 'malformed') return { status: 200, body: { statusCode: 200, data: { id: 'not-a-notice' } } };
    const n = noticeOf(req.path);
    if (!n) return answers.refused(404, 'ABUSE_NOTICE_NOT_FOUND');
    const k = (abuseGets.get(n.id) ?? 0) + 1;
    abuseGets.set(n.id, k);
    const shown = o.wrongFrom !== undefined && k >= o.wrongFrom ? (abuseStore.find((x) => x.id !== n.id) ?? n) : n;
    const delayMs = o.slowFrom !== undefined && k >= o.slowFrom ? 1500 : undefined;
    return { status: 200, body: { statusCode: 200, message: 'Abuse notice', data: shown }, delayMs };
  }),
];
type ReplyAnswer = 'done' | 'lost' | 'slow' | 'badOk' | 'adminOk' | 'okNot201' | ReturnType<typeof answers.pending5xx>;
/** The server stores the reply, then answers `answer`: 'done' 201; 'slow' the 201 after 1.5 s; 'badOk' a 201 without the
 *  message; 'adminOk' a 201 naming another author; 'okNot201' a 200 with a well-shaped message; 'lost' no answer (nothing stored); a 5xx after storing. */
const abuseReply = (answer: ReplyAnswer): FixtureRule =>
  reply(abuseRoutes.reply, (req) => {
    const n = noticeOf(req.path);
    const body = String((req.body as { body?: unknown } | null)?.body ?? '');
    abuseReplies.push({ id: n?.id ?? '', body });
    if (!n) return answers.refused(404, 'ABUSE_NOTICE_NOT_FOUND');
    if (n.status === 'resolved') return answers.refused(409, 'ABUSE_NOTICE_RESOLVED');
    const message: WireMessage = { seq: n.messages.length + 1, author_kind: 'owner', body, created_at: ago(0) };
    if (answer === 'lost') return answers.lost();
    n.messages.push(message);
    const ok = (m: unknown, delayMs?: number) => ({ status: 201, body: { statusCode: 201, message: 'Reply sent', data: m }, delayMs });
    if (answer === 'done') return ok({ message });
    if (answer === 'slow') return ok({ message }, 1500);
    if (answer === 'badOk') return ok({});
    if (answer === 'adminOk') return ok({ message: { ...message, author_kind: 'admin' } });
    if (answer === 'okNot201') return { status: 200, body: { statusCode: 200, message: 'Reply sent', data: { message } } };
    return answer;
  });
/** Test seam: the fixture server's notices as at boot, no replies received. */
export function resetAbuseFixtures(): void {
  abuseStore = abuseNotices(40);
  abuseOlder = olderNotices();
  abuseReplies.length = 0;
  abuseGets.clear();
}
const abuse = (): FixtureRule[] => [...abuseReads(() => abuseStore), abuseReply('done')];

const ENV_OK = {
  hasNotification: true,
  secure: true,
  ua: 'Mozilla/5.0 (Macintosh) Chrome/130',
  platform: 'MacIntel',
  touch: 0,
  standalone: false,
};
const browser = (o: Partial<BrowserOverride['env']>, alerts: BrowserOverride['alerts'] = null, broken = false): { data: BrowserOverride } => ({
  data: { env: { ...ENV_OK, permission: 'default', ...o }, alerts, broken },
});

/** A state: its rules, plus the fixture browser for fixtureSource (keyed on the same array). */
const state = (rules: FixtureRule[], b: { data: BrowserOverride } = browser({}), notices: FixtureRule[] = abuse()): FixtureRule[] =>
  Object.assign([...rules, ...notices], { browser: b });
const normal = () => [...list(unread, archive), ...acks('done')];

export default defineFixtures({
  default: 'many',
  states: {
    many: state(normal()),
    empty: state([...list([], []), ...acks('done')]),
    'caught-up': state([...list([], archive), ...acks('done')]),
    capped: state([...list(unread, archive, 312), ...acks('done')]),
    loading: state([reply(routes.list, answers.slow({ data: [] }, 600_000)), ...acks('done')]),
    error: state([reply(routes.list, answers.refused(500, 'SERVER_ERROR')), ...acks('done')]),
    // A shared-access (token) session: core refuses the list unsent (TOKEN_SESSION_REFUSED).
    'access-key': state([fixtureSession({ kind: 'token', caps: [] }), ...normal()]),
    'ack-pending': state([...list(unread, archive), ...acks(answers.pending5xx())]),
    // The acks may have gone through, and the next list read fails until a test calls setListDown(false).
    'ack-pending-unreadable': state([
      ...list(unread, archive),
      reply(routes.markRead, (req) => {
        const id = ackedId(req.path);
        if (id) acked.add(id);
        listDown = true;
        return answers.pending5xx();
      }),
      reply(routes.markAllRead, () => ((allAcked = true), (listDown = true), answers.pending5xx())),
    ]),
    // The first notice's mark-read is lost yet answers 502 (its row stays, locked); every later one is done.
    'ack-first-pending': state([
      ...list(unread, archive),
      reply(routes.markRead, (req) => {
        if (!firstAckSeen) {
          firstAckSeen = true;
          return answers.pending5xx();
        }
        const id = ackedId(req.path);
        if (id) acked.add(id);
        return { status: 200, body: { ok: true } };
      }),
      ...acks('done').slice(1),
    ]),
    // Each mark-read answers after 400 ms (a second press lands while the first is in flight).
    'ack-slow': state([
      ...list(unread, archive),
      reply(routes.markRead, (req) => {
        const id = ackedId(req.path);
        if (id) acked.add(id);
        return answers.slow({ ok: true }, 400);
      }),
      ...acks('done').slice(1),
    ]),
    // The first mark-read may have gone through; every later one is refused (a newer failure beside an older pending).
    'ack-pending-then-failed': state([
      ...list(unread, archive),
      reply(routes.markRead, (req) => {
        if (!firstAckSeen) {
          firstAckSeen = true;
          const id = ackedId(req.path);
          if (id) acked.add(id);
          return answers.pending5xx();
        }
        return answers.refused(409, 'ACK_FAILED');
      }),
      ...acks('done').slice(1),
    ]),
    // Each mark-read is lost yet answers 502 after 400 ms (the page can be left while it is in flight).
    'ack-slow-pending': state([...list(unread, archive), ...lostAcks(400)]),
    // Each mark-read is lost on the way yet answers 502: no read can prove it, so it stays held (never resent).
    'ack-lost': state([...list(unread, archive), ...lostAcks()]),
    'ack-failed': state([...list(unread, archive), ...refusedAcks(409, 'ACK_FAILED')]),
    // The browser states of "Get notified".
    'browser-ask': state(normal()),
    'browser-off': state(normal(), browser({ permission: 'granted' }, 'off')),
    'browser-on': state(normal(), browser({ permission: 'granted' }, 'on')),
    'browser-blocked': state(normal(), browser({ permission: 'denied' })),
    'browser-broken': state(normal(), browser({ permission: 'granted', ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' }, 'on', true)),
    'browser-ios': state(
      normal(),
      browser({
        hasNotification: false,
        permission: undefined,
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604',
        platform: 'iPhone',
        touch: 5,
      }),
    ),
    'browser-insecure': state(normal(), browser({ secure: false, permission: undefined })),
    // The Notices view: no notice, a list that cannot be read, and a reply whose outcome is unknown (stored, then a
    // 502; or lost on the way), or refused (the notice is resolved meanwhile: every reply answers 409).
    'notices-empty': state(normal(), browser({}), [...abuseReads(() => []), abuseReply('done')]),
    'notices-error': state(normal(), browser({}), [reply(abuseRoutes.list, answers.refused(500, 'SERVER_ERROR')), reply(abuseRoutes.get, answers.refused(500, 'SERVER_ERROR'))]),
    'notices-loading': state(normal(), browser({}), [reply(abuseRoutes.list, answers.slow({ data: [] }, 600_000))]),
    'notice-reply-unknown': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply(answers.pending5xx())]),
    'notice-reply-lost': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply('lost')]),
    'notice-reply-slow': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply('slow')]),
    'notice-reply-bad-ok': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply('badOk')]),
    'notice-reply-not-201': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply('okNot201')]),
    'notice-reply-admin-ok': state(normal(), browser({}), [...abuseReads(() => abuseStore), abuseReply('adminOk')]),
    'notice-check-wrong': state(normal(), browser({}), [...abuseReads(() => abuseStore, { wrongFrom: 1 }), abuseReply(answers.pending5xx())]),
    'notice-check-slow': state(normal(), browser({}), [...abuseReads(() => abuseStore, { slowFrom: 3 }), abuseReply(answers.pending5xx())]),
    // More than one page (130 notices): every page is read; or page 2 fails (500) or is malformed: the list failed.
    'notices-many': state(normal(), browser({}), [...abuseReads(() => [...abuseStore, ...abuseOlder]), abuseReply('done')]),
    'notices-page2-error': state(normal(), browser({}), [...abuseReads(() => [...abuseStore, ...abuseOlder], { pageFails: { page: 2, how: '500' } }), abuseReply('done')]),
    'notices-page2-bad': state(normal(), browser({}), [...abuseReads(() => [...abuseStore, ...abuseOlder], { pageFails: { page: 2, how: 'malformed' } }), abuseReply('done')]),
    // Every read of a notice fails (500, no answer, a malformed 200); the list reads fine.
    'notice-get-500': state(normal(), browser({}), [...abuseReads(() => abuseStore, { getFails: '500' }), abuseReply(answers.pending5xx())]),
    'notice-get-lost': state(normal(), browser({}), [...abuseReads(() => abuseStore, { getFails: 'lost' }), abuseReply(answers.pending5xx())]),
    'notice-get-bad': state(normal(), browser({}), [...abuseReads(() => abuseStore, { getFails: 'malformed' }), abuseReply(answers.pending5xx())]),
    'notice-reply-refused': state(normal(), browser({}), [...abuseReads(() => abuseStore), reply(abuseRoutes.reply, (req) => (abuseReplies.push({ id: noticeOf(req.path)?.id ?? '', body: '' }), answers.refused(409, 'ABUSE_NOTICE_RESOLVED')))]),
  },
});
