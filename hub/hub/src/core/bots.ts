// bots.ts: the Bots-waiting count the shell shows on its Bots badge, and the one rule for "this Bot waits".
//
// Contract, in plain words:
//   - botWaiting(raw) is the gate rule pages/bots uses for status 'waiting': the Bot has a pending gate with a
//     non-empty gate_id (a question or an approval waits for a person). Pages import it from core; never a copy.
//   - botsListRoute is the one route object for GET /bots on a computer (agent, realm kind 'list': the shown
//     realm, All realms included).
//   - botNeedsYou(raw) is what the count counts: botWaiting, or a chat app of the Bot holds a group that asks to be
//     approved (its channel summary's requested_chats above 0; agent capability bot_channel_waiting). The Bots
//     page's status stays botWaiting's: a waiting group is shown on the Bot's chat apps, not as a pending gate.
//   - useBotsWaiting(): how many Bots wait, over every running computer of the shown realm (the containers list,
//     the same read the shell keeps, then GET /bots on each running computer). undefined while not known: not
//     signed in (or signing out, or a token session that cannot read Bots), the list still loading, or a
//     computer's Bots still loading, or the list unreadable (its last rows are never counted). A computer whose Bots read
//     failed (its last count too) counts nothing (its count is unknown, never a guess); when every running computer
//     failed the count is undefined. A count above 0 stands as a lower bound; 0 is
//     given only for a list known to be whole with a count from every running computer, else undefined. Re-read every 30 s.
import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { computerState } from './computer';
import type { Target } from './ctx';
import { routingNode } from './hosts';
import { computersPage, type ComputerWire } from './power';
import { defineQuery, useCore } from './query';
import { coreSource } from './source';
import { defineRoute } from './routes';
import { useCan } from './token';

/** GET /bots on one computer (agent; realm kind 'list'). */
export const botsListRoute = defineRoute<unknown>({ method: 'GET', path: '/bots', scope: 'agent', realm: 'list', query: ['page', 'limit'] });

const rec = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** True when this Bot (a row of GET /bots) waits for a person: a pending gate with a gate id. */
export function botWaiting(raw: unknown): boolean {
  const g = rec(rec(raw)?.pending_gate);
  return !!g && typeof g.gate_id === 'string' && g.gate_id !== '';
}

/** True when this Bot (a row of GET /bots) needs a person: it waits (botWaiting), or a group asks one of its chat apps to be let
 * in. A paused app asks nothing (pages/bots chatsWaitingOf's rule). */
export function botNeedsYou(raw: unknown): boolean {
  if (botWaiting(raw)) return true;
  const chans = rec(raw)?.channels;
  return Array.isArray(chans) && chans.some((c) => {
    if (rec(c)?.state === 'paused') return false;
    const n = rec(c)?.requested_chats;
    return typeof n === 'number' && Number.isFinite(n) && n > 0;
  });
}

// The rows of a list answer: its top-level `items` (the agent's list envelope, as pages/bots reads it).
function botRows(raw: unknown): unknown[] {
  const list = rec(raw)?.items;
  return Array.isArray(list) ? list : [];
}

const STALE = 30_000;
type Wire = ComputerWire;
const waitingOnQ = defineQuery(botsListRoute, {
  input: (t: Target) => ({ query: { limit: 100 }, target: t }),
  select: (r): number => botRows(r).filter(botNeedsYou).length,
  staleTime: STALE,
});

// The running computers of a containers page with an address. A row that is not an object (null, a string, a list) is
// no computer: it is skipped, never read, so one bad row cannot throw from the shell, which runs this on every page.
export function runningTargets(rows: readonly unknown[] | undefined): Target[] {
  return runningComputers(rows).targets;
}
// The same, plus how many running computers (an id and a project) have no address (no flat server_name): they are never
// read, so a count over the targets alone may miss Bots waiting there.
function runningComputers(rows: readonly unknown[] | undefined): { targets: Target[]; unaddressed: number } {
  const targets: Target[] = [];
  let unaddressed = 0;
  for (const row of rows ?? []) {
    const c = rec(row) as Wire | undefined;
    if (!c) continue;
    if (computerState(c.status) !== 'running') continue;
    if (typeof c.id !== 'string' || !c.id || typeof c.project_id !== 'string' || !c.project_id) continue;
    // The routing node is the flat server_name only; the nested server.name is a subserver's display name (see routingNode).
    const sv = routingNode(c);
    if (!sv) { unaddressed++; continue; }
    targets.push({ project: { id: c.project_id }, container: { id: c.id, server_name: sv } });
  }
  return { targets, unaddressed };
}

/** How many Bots of the shown realm wait for a person (see the contract); undefined while not known. */
/** The Bots badge's read: the count, and whether it is only a lower bound (atLeast): a count above 0 from a list not
 *  known to be whole, or with a running computer whose Bots read failed, may miss Bots waiting there. undefined exactly
 *  when useBotsWaiting() is; useBotsWaiting() is its count. */
export interface BotsWaitingRead { count: number; atLeast: boolean }
export function useBotsWaiting(): number | undefined {
  return useBotsWaitingRead()?.count;
}
export function useBotsWaitingRead(): BotsWaitingRead | undefined {
  const core = useCore();
  const readable = useCan('computers.read');
  const on = core.account !== null && !core.loggingOut && readable;
  const rows = computersPage.use(undefined, { enabled: on });
  const { targets, unaddressed } = on ? runningComputers(rows.data?.rows) : { targets: [], unaddressed: 0 };
  const qs = useQueries({ queries: targets.map((t) => ({ ...waitingOnQ.options(t, core), enabled: on, refetchInterval: STALE })) });
  // A read that failed keeps its last rows or count in the query (a throwing select, or a failed refetch, restores the previous data), so the
  // error is checked, never only that data exists.
  if (!on || !rows.data || rows.isError) return undefined;
  if (qs.some((q) => q.data === undefined && !q.isError)) return undefined;
  const answered = qs.filter((q) => !q.isError && typeof q.data === 'number');
  if (targets.length > 0 && answered.length === 0) return undefined;
  const total = answered.reduce((n, q) => n + (q.data as number), 0);
  // A count above 0 stands (that many wait: a lower bound). Zero needs a whole list AND an answer from every running computer: a computer
  // past the first page, one whose Bots read failed, or one with no address (never read), may have Bots waiting.
  const whole = rows.data.complete && unaddressed === 0 && answered.length === targets.length;
  if (total === 0 && !whole) return undefined;
  return { count: total, atLeast: !whole };
}

// One computer's Bots: the Bots page's per-computer list read and the Board's Bot tiles (the Board >
// Add a program "Bots" section) are ONE read, so a refresh, failure or invalidation on either is the other's.
//   - botKeyOf(computerId, realm, botId) is a Bot's key, `<computerId>~<realm>~<botId>`: the form the Bots page and
//     its tile view read (pages/bots logic botKey), so a page that only knows the parts never spells it.
//   - parseBotList(raw) is the one parser of a GET /bots answer: null when it is not a list (unknown, never "no Bots");
//     `items` keeps every row object as the server sent it (the Bots page builds its rows from them); `bots` keeps a
//     row only with an id and a realm a key can carry (botIdOk, botRealmOk), its name a non-empty string or else the
//     id, and drops both rows of two with one key (a contradiction). parseComputerBots(raw) is its `bots`.
//   - computerBotsRead is that read's coreSource definition ('bots' page, read 'computerBots', params = computer id):
//     the Bots page's source table and this module's botsSource declare the same object, so both use one query key.
//     Its target comes from noteBotTarget (the Bots page notes every computer of its list, the Board the one it reads).
//   - useComputerBots(target): that computer's Bots (undefined while not read), `failed` when the read failed or its
//     answer did not parse (the Bots it showed before are not kept as current), and `retry`. null target: no read.
export const botKeyOf = (computerId: string, realm: string, botId: string): string => `${computerId}~${realm}~${botId}`;
export const botRealmOk = (v: unknown): v is string => typeof v === 'string' && /^(?:global|[0-9a-f]{24})$/.test(v);
export const botIdOk = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 1 && v.length <= 64 && !/[~\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v);

export interface ComputerBot { readonly id: string; readonly realm: string; readonly name: string }
export interface BotList {
  readonly items: readonly Record<string, unknown>[];
  readonly bots: readonly ComputerBot[];
  readonly suspended: number;
  readonly hasMore: boolean;
  /** The answer carried both counts (its total and its suspended count, whole numbers from 0) and only row objects.
   *  False: `suspended` and `hasMore` may be defaults, so they prove nothing. */
  readonly counted: boolean;
  /** The computer the list was read from (set by computerBotsRead, the per-computer read; absent from a bare parse). */
  readonly computerId?: string;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parseBotList(raw: unknown): BotList | null {
  const top = rec(raw);
  const list = top?.items;
  if (!top || !Array.isArray(list)) return null;
  const items: Record<string, unknown>[] = [];
  const rows: ComputerBot[] = [];
  for (const item of list) {
    const r = rec(item);
    if (!r) continue;
    items.push(r);
    if (!botIdOk(r.id) || !botRealmOk(r.realm)) continue;
    const name = typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : r.id;
    rows.push({ id: r.id, realm: r.realm, name });
  }
  const seen = new Map<string, number>();
  for (const b of rows) seen.set(b.realm + '~' + b.id, (seen.get(b.realm + '~' + b.id) ?? 0) + 1);
  return { items, bots: rows.filter((b) => seen.get(b.realm + '~' + b.id) === 1), suspended: count(top.suspended_count), hasMore: count(rec(top.meta)?.total) > list.length, counted: isCount(top.suspended_count) && isCount(rec(top.meta)?.total) && items.length === list.length };
}

export const parseComputerBots = (raw: unknown): ComputerBot[] | null => {
  const l = parseBotList(raw);
  return l ? [...l.bots] : null;
};

const botTargets = new Map<string, Target>();
/** Remembers the address of a computer whose Bots are read (the read's target, by computer id). */
export function noteBotTarget(t: Target): void {
  const was = botTargets.get(t.container.id);
  if (!was || was.project.id !== t.project.id || was.container.server_name !== t.container.server_name) botTargets.set(t.container.id, t);
}
export const botTargetOf = (computerId: string): Target => botTargets.get(computerId) ?? { project: { id: '' }, container: { id: computerId } };

export const computerBotsRead = {
  route: botsListRoute,
  input: (computerId: string) => ({ query: { limit: 100 }, target: botTargetOf(computerId) }),
  select: (raw: unknown, computerId: string): BotList => {
    const l = parseBotList(raw);
    if (!l) throw new Error('bots: not a list');
    return { ...l, computerId };
  },
  refetchMs: 15000,
};
const botsSource = coreSource('bots', { reads: { computerBots: computerBotsRead } });

export function useComputerBots(target: Target | null): { bots: ComputerBot[] | undefined; failed: boolean; retry: () => void } {
  if (target) noteBotTarget(target);
  const q = botsSource.useQuery<BotList, string>('computerBots', target?.container.id ?? '', { enabled: target !== null });
  const { refetch } = q;
  const retry = useCallback(() => void refetch(), [refetch]);
  const bots = useMemo(() => (q.isError || !q.data ? undefined : [...q.data.bots]), [q.isError, q.data]);
  return { bots, failed: q.isError, retry };
}
