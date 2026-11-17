// Fake-API states of the Support page for hub:dev, hub:shots, tests and specs.
// One account per render: the world starts again at the first list read of a render, and a write changes it, so a
// read after it shows what the server would. "lost" loses the answer of a write (it stays held: nothing proves it);
// "lostApplied" applies it and loses the answer. Every text here is the kind of thing a person writes; the hostile
// thread carries markup, a bidi override and a javascript: link, which the page must show as plain text.
import { answers, defineFixtures, fixtureSession, fixtureWorld, reply, type FixtureRequest, type FixtureRule } from '@core';
import { routes } from './routes';

const AT = Date.UTC(2026, 10, 2, 14, 0);
const iso = (minsAgo: number) => new Date(AT - minsAgo * 60_000).toISOString();
const hex = (n: number) => n.toString(16).padStart(24, '0');

type Row = Record<string, unknown>;
const ticket = (n: number, o: Partial<Row> = {}): Row => ({
  id: hex(0x6720a1b2 + n),
  subject: `Ticket ${n}`,
  category: 'computers',
  status: 'open',
  terminal: false,
  unread: false,
  created_at: iso(600 + n * 90),
  last_message_at: iso(30 + n * 60),
  closed_at: null,
  reopenable: false,
  ...o,
});
const msg = (seq: number, from: 'you' | 'support', body: string, minsAgo: number): Row => ({ id: hex(0x99000000 + seq), seq, from, body, created_at: iso(minsAgo) });

export const T_WAITING = ticket(1, { subject: 'Computer will not start after resize', status: 'waiting_user', unread: true });
export const T_OPEN = ticket(2, { subject: 'Invoice shows the wrong country', category: 'billing' });
export const T_CLOSED = ticket(3, { subject: 'How do I add a domain?', category: 'networking', status: 'closed', closed_at: iso(2000), reopenable: true });
export const T_CLOSED_UNREAD = ticket(4, { subject: 'Refund for the October charge', category: 'billing', status: 'closed', unread: true, closed_at: iso(240), reopenable: true });
export const T_GOOD = ticket(5, { subject: 'Old question about bots', category: 'bots', status: 'closed', terminal: true, closed_at: iso(90000), reopenable: false });
export const T_HOSTILE = ticket(6, { subject: '<b>bold</b> **subject**', category: 'bug' });
export const T_LONG = ticket(7, { subject: 'A ticket with many messages', category: 'ai' });
const BASE_TICKETS = [T_WAITING, T_OPEN, T_CLOSED_UNREAD, T_CLOSED, T_GOOD, T_HOSTILE, T_LONG];

const THREADS: Record<string, Row[]> = {
  [String(T_WAITING.id)]: [
    msg(1, 'you', 'Since resizing to 4 GB my computer stays in "starting".\nStarted 09:00 UTC.', 300),
    msg(2, 'support', 'Thanks. We restarted the host; please try starting it again.\nIf it still hangs, tell us the time you tried.', 40),
  ],
  [String(T_OPEN.id)]: [msg(1, 'you', 'The invoice for October lists Germany, but my billing address is in Austria.', 120)],
  [String(T_CLOSED.id)]: [msg(1, 'you', 'Where do I add my own domain?', 2100), msg(2, 'support', 'Open Domains in the left menu: https://docs.hoody.com/domains explains each step.', 2050)],
  [String(T_CLOSED_UNREAD.id)]: [msg(1, 'you', 'I was charged twice in October.', 600), msg(2, 'support', 'We refunded the second charge. It shows on your card in a few days.', 240)],
  [String(T_GOOD.id)]: [msg(1, 'you', 'Can a bot have two keys?', 90100), msg(2, 'support', 'Yes, each bot can have several keys.', 90050)],
  [String(T_HOSTILE.id)]: [
    msg(1, 'you', '<b>not bold</b> **not bold** <script>alert(1)</script>\nA reversed ‮txt.exe‬ name\n[click](javascript:alert(1)) javascript:alert(2)\nA real link: https://hoody.com/help', 50),
  ],
  [String(T_LONG.id)]: Array.from({ length: 60 }, (_, i) => msg(i + 1, i % 2 ? 'support' : 'you', `Message number ${i + 1} of the long thread.`, 3000 - i * 40)),
};

/** Long enough for a test to look around while a write is out, a second tab or a remount included. */
const SLOW_WRITE_MS = 6000;
/** A write held open: a test asserts while it is out and, if it needs the answer, moves page.clock past this. Under the
 *  write timeout (data.ts), so what arrives is the answer. */
const HELD_WRITE_MS = 50000;
/** A write no answer ever comes for, past any test: only the write timeout ends it. */
const HUNG_WRITE_MS = 2_000_000_000;
type Mode = 'ok' | 'slow' | 'held' | 'hung' | 'lost' | 'lostSlow' | 'lostApplied' | readonly [number, string, Row?] | { readonly slow: readonly [number, string, Row?] };
interface WorldOpts {
  tickets?: Row[];
  create?: Mode;
  reply?: Mode;
  close?: Mode;
  limits?: Row | 'error';
  /** The list read: an error status, or a later page failing. cursorExpired: three a page, and the first cursor
   *  sent is refused INVALID_CURSOR (a page one read again sends a fresh one); cursorDead: every cursor is. */
  list?: 'error' | 'slow' | 'page2error' | 'paged' | 'cursorExpired' | 'cursorDead';
  /** Show older's read: fails every time, or only the first time. */
  older?: 'error' | 'errorOnce';
  /** Count reads (limit 50) keep sending a cursor: the nav count cannot complete. */
  countEndless?: boolean;
}
export const LIMITS_OK: Row = {
  tier: 'free', open: { used: 1, max: 5 }, tickets_day: { used: 1, max: 10 }, tickets_30d: { used: 3, max: 60 }, messages_day: { used: 4, max: 200 }, retained: { used: 7, max: 1000 },
};
export const LIMITS_NEAR: Row = {
  tier: 'free', open: { used: 4, max: 5 }, tickets_day: { used: 9, max: 10 }, tickets_30d: { used: 59, max: 60 }, messages_day: { used: 199, max: 200 }, retained: { used: 999, max: 1000 },
};

const refuse = (status: number, code: string, data?: Row) => ({ status, body: { statusCode: status, error: code, message: 'refused', ...(data ? { data } : {}) } });

/** Every support request the page made under these fixtures, in order (route name, query, body: fixture text
 *  only). Tests read it to prove what was and was not sent: Check again sends no write. */
export const requestLog: Array<{ route: 'list' | 'get' | 'create' | 'reply' | 'close'; path: string; query: Readonly<Record<string, string>>; body?: unknown }> = [];
const log = (route: (typeof requestLog)[number]['route'], r: FixtureRequest): void => {
  requestLog.push({ route, path: r.path, query: { ...(r.query as Record<string, string>) }, ...(r.body !== undefined ? { body: r.body } : {}) });
};

function world(o: WorldOpts = {}): FixtureRule[] {
  let tickets: Row[] = [];
  let threads: Record<string, Row[]> = {};
  let firstReads = 0;
  let cursorRefused = false;
  let olderReads = 0;
  const reset = () => {
    tickets = (o.tickets ?? BASE_TICKETS).map((t) => ({ ...t }));
    threads = Object.fromEntries(Object.entries(THREADS).map(([k, v]) => [k, v.map((m) => ({ ...m }))]));
    firstReads = 0;
    cursorRefused = false;
    olderReads = 0;
  };
  reset();
  const write = (mode: Mode | undefined, apply: () => Row, status = 201) => {
    const m = mode ?? 'ok';
    if (m === 'lost') return answers.pending5xx();
    // A lost answer after SLOW_WRITE_MS (nothing applied): a test leaves the drawer while it is out.
    if (m === 'lostSlow') return answers.pending5xx(502, SLOW_WRITE_MS);
    if (m === 'lostApplied') {
      apply();
      return answers.pending5xx();
    }
    if (m === 'slow' || m === 'held' || m === 'hung') {
      // Counted in the page for the specs: the write reached the server here, so its call's timeout is already armed.
      const seen = globalThis as { supportWritesSeen?: number };
      seen.supportWritesSeen = (seen.supportWritesSeen ?? 0) + 1;
      const delayMs = m === 'slow' ? SLOW_WRITE_MS : m === 'held' ? HELD_WRITE_MS : HUNG_WRITE_MS;
      return { status, delayMs, body: { statusCode: status, data: apply() } };
    }
    // A refusal answered after SLOW_WRITE_MS: a test leaves the box or the drawer while it is out.
    if (typeof m === 'object' && 'slow' in m) return { ...refuse(m.slow[0], m.slow[1], m.slow[2]), delayMs: SLOW_WRITE_MS };
    if (m !== 'ok') return refuse(m[0], m[1], m[2]);
    return { status, body: { statusCode: status, data: apply() } };
  };
  const idOf = (r: FixtureRequest) => decodeURIComponent(r.path.split('/')[3] ?? '');
  return [
    reply(routes.list, (r) => {
      log('list', r);
      const limit = Number(r.query.limit ?? 20);
      if (r.n === 1 && limit !== 50) reset();
      if (o.list === 'error') return refuse(500, 'SUPPORT_UNAVAILABLE');
      if (o.list === 'slow') return answers.slow({ data: { tickets: [], next_cursor: null } }, 60000);
      if (limit === 50 && o.countEndless) return answers.ok({ data: { tickets: tickets.slice(0, 2), next_cursor: 'more-' + (r.query.cursor ?? '0') } });
      const st = r.query.status;
      const rows = tickets.filter((t) => !st || t.status === st);
      if (o.list === 'page2error' && r.query.cursor) return refuse(500, 'SUPPORT_UNAVAILABLE');
      if ((o.list === 'cursorExpired' || o.list === 'cursorDead') && limit !== 50) {
        if (!r.query.cursor) firstReads += 1;
        const cur = r.query.cursor ? String(r.query.cursor) : null;
        if (cur && (o.list === 'cursorDead' || !cursorRefused)) {
          cursorRefused = true;
          return refuse(422, 'INVALID_CURSOR');
        }
        const from = cur ? Number(cur.split('-')[1]) : 0;
        const page = rows.slice(from, from + 3);
        return answers.ok({ data: { tickets: page, next_cursor: from + 3 < rows.length ? `g${firstReads}-${from + 3}` : null } });
      }
      if (o.list === 'page2error' || o.list === 'paged') {
        const from = r.query.cursor ? Number(String(r.query.cursor).replace('p', '')) : 0;
        const page = rows.slice(from, from + 3);
        return answers.ok({ data: { tickets: page, next_cursor: from + 3 < rows.length ? 'p' + (from + 3) : null } });
      }
      return answers.ok({ data: { tickets: rows.slice(0, limit), next_cursor: null } });
    }),
    reply(routes.get, (r) => {
      log('get', r);
      const id = idOf(r);
      const t = tickets.find((x) => x.id === id);
      if (!t) return refuse(404, 'SUPPORT_TICKET_NOT_FOUND');
      const all = threads[id] ?? [];
      const before = r.query.before_seq ? Number(r.query.before_seq) : Infinity;
      if (before !== Infinity && o.older && (o.older === 'error' || ++olderReads === 1)) return refuse(500, 'SUPPORT_UNAVAILABLE');
      const limit = Number(r.query.limit ?? 50);
      const older = all.filter((m) => Number(m.seq) < before).sort((a, b) => Number(b.seq) - Number(a.seq));
      const page = older.slice(0, limit);
      if (before === Infinity) t.unread = false;
      return answers.ok({ data: { ticket: t, messages: page, has_older: older.length > limit } });
    }),
    reply(routes.create, (r) => {
      log('create', r);
      const b = (r.body ?? {}) as Row;
      return write(o.create, () => {
        const t = ticket(100 + tickets.length, { subject: String(b.subject ?? ''), category: String(b.category ?? 'other'), created_at: new Date().toISOString(), last_message_at: new Date().toISOString() });
        const m = msg(1, 'you', String(b.body ?? ''), 0);
        m.created_at = new Date().toISOString();
        tickets = [t, ...tickets];
        threads[String(t.id)] = [m];
        return { ticket: t, message: m, cleaned: {} };
      });
    }),
    reply(routes.reply, (r) => {
      log('reply', r);
      const id = idOf(r);
      const t = tickets.find((x) => x.id === id);
      if (!t) return refuse(404, 'SUPPORT_TICKET_NOT_FOUND');
      const b = (r.body ?? {}) as Row;
      return write(o.reply, () => {
        const list = threads[id] ?? (threads[id] = []);
        const m = msg(list.length + 1, 'you', String(b.body ?? ''), 0);
        m.created_at = new Date().toISOString();
        list.push(m);
        t.status = 'open';
        t.last_message_at = m.created_at;
        return { message: m, ticket: t, cleaned: {} };
      });
    }),
    reply(routes.close, (r) => {
      log('close', r);
      const id = idOf(r);
      const t = tickets.find((x) => x.id === id);
      if (!t) return refuse(404, 'SUPPORT_TICKET_NOT_FOUND');
      return write(o.close, () => {
        t.status = 'closed';
        t.closed_at = new Date().toISOString();
        t.reopenable = true;
        return t;
      }, 200);
    }),
    reply(routes.limits, () => (o.limits === 'error' ? refuse(500, 'SUPPORT_UNAVAILABLE') : answers.ok({ data: o.limits ?? LIMITS_OK }))),
  ];
}

const deny = (status: number, code: string): FixtureRule[] => [
  reply(routes.list, () => refuse(status, code)),
  reply(routes.limits, () => refuse(status, code)),
];

export default defineFixtures({
  default: 'default',
  states: {
    /** Seven tickets: waiting for you (unread), waiting for support, closed with an unread reply, closed, closed for
     *  good, a hostile one and a long thread. Writes work. */
    default: world(),
    empty: world({ tickets: [] }),
    error: world({ list: 'error' }),
    loading: world({ list: 'slow' }),
    /** Three tickets a page; the second page fails (rows kept, a band with Try again). */
    partial: world({ list: 'page2error' }),
    /** Three tickets a page, Load more works. */
    paged: world({ list: 'paged' }),
    /** The tickets in an order no column sorts them by (the API's own): the list keeps it, page after page. */
    apiOrder: world({ list: 'paged', tickets: [T_LONG, T_CLOSED, T_WAITING, T_HOSTILE, T_OPEN, T_GOOD, T_CLOSED_UNREAD] }),
    /** Load more's first cursor is refused INVALID_CURSOR: the list starts again from page one once. */
    cursorExpired: world({ list: 'cursorExpired' }),
    /** Every Load more cursor is refused: one restart, then the partial band. */
    cursorDead: world({ list: 'cursorDead' }),
    /** Show older fails once, then works (Try again reads it again). */
    olderErrorOnce: world({ older: 'errorOnce' }),
    /** The nav count's reads never end within the bound: no badge, and the list says so. */
    badgePartial: world({ countEndless: true }),
    /** One ticket row the page cannot read (its terminal flag is no boolean): it is left out, and the list says so. */
    dropped: world({ tickets: [...BASE_TICKETS, ticket(8, { subject: 'Unreadable row', terminal: 'no' })] }),
    nearLimit: world({ limits: LIMITS_NEAR }),
    quotaReached: world({ create: [409, 'SUPPORT_QUOTA_REACHED', { limit: 'tickets_day', tier: 'free', retry_after_s: 5400 }] }),
    /** The duplicate as core passes it on when it calls the answer pending: the code, no data. */
    'duplicate-pending': world({
      create: [503, 'SUPPORT_DUPLICATE', {}],
      reply: [503, 'SUPPORT_DUPLICATE', {}],
    }),
    /** The same text again within the minute, under a new key: refused, the earlier copy is saved. */
    duplicate: world({
      create: [409, 'SUPPORT_DUPLICATE', { ticket_id: String(T_OPEN.id), message_id: 'm-earlier', retry_after_s: 42 }],
      reply: [409, 'SUPPORT_DUPLICATE', { ticket_id: String(T_OPEN.id), message_id: 'm-earlier', retry_after_s: 42 }],
    }),
    textInvalid: world({ create: [400, 'SUPPORT_TEXT_INVALID', { field: 'body', rule: 'bidi_control', at: 'input', index: 12 }] }),
    /** A create and a reply refused after SLOW_WRITE_MS (a quota each): the box or the drawer is left meanwhile. */
    refusedSlow: world({
      create: { slow: [409, 'SUPPORT_QUOTA_REACHED', { limit: 'tickets_day', tier: 'free' }] },
      reply: { slow: [409, 'SUPPORT_QUOTA_REACHED', { limit: 'messages_day', tier: 'free' }] },
    }),
    /** A create refused busy after SLOW_WRITE_MS (a definite answer even when its context has ended meanwhile). */
    busySlow: world({ create: { slow: [503, 'SUPPORT_BUSY'] } }),
    /** A create whose answer is lost after SLOW_WRITE_MS (nothing applied): the drawer is left meanwhile. */
    lostSlow: world({ create: 'lostSlow' }),
    /** A create, a reply and a close answered after SLOW_WRITE_MS; reads stay instant. */
    sendSlow: world({ create: 'slow', reply: 'slow', close: 'slow' }),
    /** The same writes held open for HELD_WRITE_MS (50 s), or until a test moves page.clock past that. */
    sendHeld: world({ create: 'held', reply: 'held', close: 'held' }),
    /** The same writes never answered. */
    sendHung: world({ create: 'hung', reply: 'hung', close: 'hung' }),
    /** A create and a reply whose answers are lost (nothing applied). */
    sendUnknown: world({ create: 'lost', reply: 'lost' }),
    /** The same, but the server stored them: Check again finds a possible match and still settles nothing. */
    sendUnknownApplied: world({ create: 'lostApplied', reply: 'lostApplied' }),
    busy: world({ create: [503, 'SUPPORT_BUSY'], reply: [503, 'SUPPORT_BUSY'] }),
    messageCap: world({ reply: [409, 'SUPPORT_TICKET_LIMIT'] }),
    closeLost: world({ close: 'lostApplied' }),
    /** A close whose answer is lost and that did not land: the ticket stays open. */
    closeLostOpen: world({ close: 'lost' }),
    closeBusy: world({ close: [503, 'SUPPORT_BUSY'] }),
    banned: world({ limits: { ...LIMITS_OK, tier: 'banned', open: { used: 1, max: 1 } }, create: [409, 'SUPPORT_QUOTA_REACHED', { limit: 'open', tier: 'banned' }] }),
    /** A staff account: support tickets are for member accounts. */
    member: deny(403, 'SUPPORT_NOT_FOR_ACCOUNT'),
    /** A token without resources.support. */
    noPermission: deny(403, 'INSUFFICIENT_PERMISSIONS'),
    /** A shared-access (token) session: every /support call is refused unsent. */
    token: [fixtureSession({ kind: 'token', caps: ['resources.support'], realm: fixtureWorld.realms[0]?.id ?? '' }), ...world()],
  },
});

/** A new terminal session starts (term/app/boot.ts, through app/fixtures.ts resetFixtureServers): this fake server
 *  forgets the last one. Every fixture module with memory exports this name (pages/fixture-memory.term.test.ts). */
export function resetFixtureServer(): void {
  requestLog.length = 0;
}
