// Details → Usage, the logic: one chat's usage rows read strictly, grouped into requests,
// the requests grouped under chat turns, the per-model table, and the daemon-wide rollup (`usageByModel`, PascalCase).
// Pure: no fetch, no translator, no React.
//
//   - A usage `turn_id` names ONE MODEL REQUEST (its failed attempts and the row that records its outcome), never a chat
//     turn. The agent's rows carry no chat-turn id, so the requests are placed under the chat's turns by the chat stream's
//     `stream_done` events: a turn lists the token counts of each foreground response it saw, in order, and a request is
//     that response's when its outcome row has the same four counts. Requests no response claims (background helpers,
//     auto-replies, compactions, side calls, failed requests outside a turn) go to `other`, never into a turn by guess.
//   - A page with any malformed row is unreadable (null), never a shorter list; a figure the agent did not give is not 0.
//   - The daemon-wide rollup is Go-field-named (Model, Provider, Calls, ...); snake_case is read too.

export type UsageKind = 'chat' | 'compaction' | 'side' | 'speech';
const KINDS: readonly string[] = ['chat', 'compaction', 'side', 'speech'];

/** One recorded call: attempt -1 is the call's outcome, 0 and up a failed attempt before it, -2 the spend of a failed
 *  fusion request (cost only, not a call). */
export interface UsageRow {
  id: number;
  ts: number;
  /** The request's id (the wire's `turn_id`). */
  request: string;
  attempt: number;
  model: string;
  provider: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  latencyMs: number;
  success: boolean;
  errorCode: string;
  kind: UsageKind;
  uncertain: boolean;
}

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  /** 0 to 100. */
  cachePct: number;
  /** The whole chat's speech calls and spend (by_kind.speech); null when the agent did not give it. Speech is NOT in `cost`. */
  speech: { calls: number; cost: number } | null;
}

export interface UsagePage {
  rows: UsageRow[];
  totals: UsageTotals;
  /** The id to pass back as `after_id`. */
  next: number;
  more: boolean;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function rowOf(x: unknown): UsageRow | null {
  if (!obj(x)) return null;
  const { id, ts, turn_id, attempt, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, success } = x;
  if (!nat(id) || !nat(ts) || typeof turn_id !== 'string' || !Number.isSafeInteger(attempt) || (attempt as number) < -2) return null;
  if (typeof model !== 'string' || typeof provider !== 'string') return null;
  if (!nat(input_tokens) || !nat(output_tokens) || !nat(cache_read_tokens) || !nat(cache_write_tokens) || !money(cost_usd) || !nat(latency_ms)) return null;
  if (typeof success !== 'boolean') return null;
  // `kind` is absent on an older agent's rows: those are chat rows. A kind this reading does not know is unreadable.
  const kind = x.kind === undefined || x.kind === '' ? 'chat' : x.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null;
  const err = x.error_code;
  if (err !== undefined && typeof err !== 'string') return null;
  return {
    id, ts, request: turn_id, attempt: attempt as number, model, provider,
    input: input_tokens, output: output_tokens, cacheRead: cache_read_tokens, cacheWrite: cache_write_tokens, cost: cost_usd,
    latencyMs: latency_ms, success, errorCode: err ?? '', kind: kind as UsageKind, uncertain: x.cost_uncertain === true,
  };
}

function totalsOf(x: unknown): UsageTotals | null {
  if (!obj(x)) return null;
  const { calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, cache_read_pct } = x;
  if (!nat(calls) || !nat(input_tokens) || !nat(output_tokens) || !nat(cache_read_tokens) || !nat(cache_write_tokens) || !money(cost_usd)) return null;
  if (typeof cache_read_pct !== 'number' || !Number.isFinite(cache_read_pct) || cache_read_pct < 0 || cache_read_pct > 100.0001) return null;
  let speech: UsageTotals['speech'] = null;
  const kinds = x.by_kind;
  if (obj(kinds) && kinds.speech !== undefined) {
    const sp = kinds.speech;
    if (!obj(sp) || !nat(sp.calls) || !money(sp.cost_usd)) return null;
    speech = { calls: sp.calls, cost: sp.cost_usd };
  }
  return { calls, input: input_tokens, output: output_tokens, cacheRead: cache_read_tokens, cacheWrite: cache_write_tokens, cost: cost_usd, cachePct: cache_read_pct, speech };
}

/**
 * getSessionUsage's body {items, totals, next_after_id, has_more}; null when not that shape (a malformed row included).
 * A page is a consistent slice or nothing: ids strictly grow, the first is past `after` (exclusive cursor), and
 * next_after_id is the last id (the cursor asked when the page is empty). Anything else would skip rows or double spend.
 */
export function usagePageOf(body: unknown, after?: number): UsagePage | null {
  if (!obj(body) || !Array.isArray(body.items)) return null;
  const rows: UsageRow[] = [];
  for (const it of body.items) {
    const r = rowOf(it);
    if (!r) return null;
    const prev = rows.length ? rows[rows.length - 1]!.id : after !== undefined ? after : -1;
    if (r.id <= prev) return null;
    rows.push(r);
  }
  const totals = totalsOf(body.totals);
  if (!totals || !nat(body.next_after_id) || typeof body.has_more !== 'boolean') return null;
  if (rows.length ? body.next_after_id !== rows[rows.length - 1]!.id : after !== undefined && body.next_after_id !== after) return null;
  return { rows, totals, next: body.next_after_id, more: body.has_more };
}

/** One model request: the rows that share its id. Its token counts are its outcome row's. */
export interface UsageRequest {
  id: string;
  kind: UsageKind;
  model: string;
  provider: string;
  /** 'ok' / 'failed': the outcome row says so. 'open': no outcome row (yet): the request has not ended, or its outcome was not read. */
  state: 'ok' | 'failed' | 'open';
  /** Failed attempts before the outcome. */
  retries: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Every row of the request, a failed fusion's spend included. */
  cost: number;
  /** Every token the agent billed for this request, failed attempts and a failed fusion's spend included (the counts above are the outcome's, for matching). */
  billed: { input: number; output: number; cacheRead: number; cacheWrite: number };
  latencyMs: number;
  errorCode: string;
  uncertain: boolean;
  /** Unix seconds of the outcome row (else the last row). */
  at: number;
  /** First and last row id, for a cursor. */
  firstRow: number;
  lastRow: number;
}

/** Requests in the order of their first row. Speech rows are not model requests and are left out (see speechOf). */
export function requestsOf(rows: readonly UsageRow[]): UsageRequest[] {
  const by = new Map<string, UsageRequest>();
  const order: UsageRequest[] = [];
  for (const r of rows) {
    if (r.kind === 'speech') continue;
    let q = by.get(r.request);
    if (!q) {
      q = {
        id: r.request, kind: r.kind, model: r.model, provider: r.provider, state: 'open', retries: 0, input: 0, output: 0, cacheRead: 0,
        cacheWrite: 0, cost: 0, billed: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, latencyMs: 0, errorCode: '', uncertain: false, at: r.ts, firstRow: r.id, lastRow: r.id,
      };
      by.set(r.request, q);
      order.push(q);
    }
    q.cost += r.cost;
    q.billed.input += r.input;
    q.billed.output += r.output;
    q.billed.cacheRead += r.cacheRead;
    q.billed.cacheWrite += r.cacheWrite;
    q.lastRow = r.id;
    if (r.uncertain) q.uncertain = true;
    if (r.attempt >= 0) {
      q.retries++;
      if (q.state === 'open') { q.errorCode = r.errorCode; q.model = r.model; q.provider = r.provider; q.at = r.ts; }
    } else if (r.attempt === -1) {
      q.state = r.success ? 'ok' : 'failed';
      q.model = r.model;
      q.provider = r.provider;
      q.input = r.input;
      q.output = r.output;
      q.cacheRead = r.cacheRead;
      q.cacheWrite = r.cacheWrite;
      q.latencyMs = r.latencyMs;
      q.errorCode = r.success ? '' : r.errorCode;
      q.at = r.ts;
    }
  }
  return order;
}

/** What the chat stream's `stream_done` said of one foreground response (the billed counts of that response). */
export interface Response {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
/** One chat turn: its key and the foreground responses it saw, in order. */
export interface TurnResponses {
  key: string;
  responses: readonly Response[];
}
export interface TurnUsage {
  key: string;
  /** The turn's requests in order: the ones a response claimed (`claimed`) and the ones between them. */
  requests: { request: UsageRequest; claimed: boolean; ambiguous: boolean }[];
  /** Claimed requests another unclaimed request with the very same counts could equally have been. */
  ambiguous: number;
  /** Responses of this turn no request matched (the rows were not read, or the counts differ). */
  unmatched: number;
  cost: number;
}
export interface GroupedUsage {
  turns: TurnUsage[];
  /** Requests no response claimed and that lie outside every turn's span. */
  other: UsageRequest[];
}

const same = (q: UsageRequest, r: Response) => q.input === r.input && q.output === r.output && q.cacheRead === r.cacheRead && q.cacheWrite === r.cacheWrite;

/**
 * Places requests under turns. Walks the turns' responses from the last to the first and gives each the latest unclaimed
 * request before the next claim whose kind is chat, whose outcome is ok and whose four counts equal the response's. The
 * responses are the ones a viewer saw stream, so they are the newest requests there are: anything older (the requests of
 * a chat opened from history) precedes them and stays `other`, even when its counts happen to equal a response's. A request between
 * a turn's first and last claim that no response claimed (a retry, a helper, a compaction inside the turn) shows in that
 * turn as not claimed; everything else is `other`. A response nothing matches is counted in `unmatched`, never invented.
 */
export function groupTurns(requests: readonly UsageRequest[], turns: readonly TurnResponses[], opts: { partial?: boolean } = {}): GroupedUsage {
  const owner: number[] = new Array(requests.length).fill(-1);
  const claimed = new Set<number>();
  const span: Array<[number, number] | null> = turns.map(() => null);
  const unmatched: number[] = turns.map(() => 0);
  let end = requests.length - 1;
  for (let ti = turns.length - 1; ti >= 0; ti--) {
    const rs = turns[ti]!.responses;
    for (let ri = rs.length - 1; ri >= 0; ri--) {
      const resp = rs[ri]!;
      let k = end;
      while (k >= 0 && !(requests[k]!.kind === 'chat' && requests[k]!.state === 'ok' && same(requests[k]!, resp))) k--;
      if (k < 0) { unmatched[ti]!++; continue; }
      claimed.add(k);
      owner[k] = ti;
      const s = span[ti];
      span[ti] = s ? [k, s[1]] : [k, k];
      end = k - 1;
    }
  }
  span.forEach((s, ti) => {
    if (s) for (let k = s[0]; k <= s[1]; k++) if (owner[k] === -1) owner[k] = ti;
  });
  // Equal counts are all the link there is: a claimed request is "ambiguous" when an unclaimed request has the same four counts.
  const countsKey = (q: UsageRequest) => (q.kind === 'chat' && q.state === 'ok' ? `${q.input}/${q.output}/${q.cacheRead}/${q.cacheWrite}` : null);
  const free = new Map<string, number>();
  requests.forEach((q, k) => { const c = countsKey(q); if (c !== null && !claimed.has(k)) free.set(c, (free.get(c) ?? 0) + 1); });
  const out: GroupedUsage = { turns: turns.map((t, ti) => ({ key: t.key, requests: [], unmatched: unmatched[ti]!, cost: 0, ambiguous: 0 })), other: [] };
  requests.forEach((q, k) => {
    const ti = owner[k]!;
    if (ti < 0) { out.other.push(q); return; }
    const t = out.turns[ti]!;
    const c = countsKey(q);
    // With rows still unread the identical competitor may be among them: every placement is provisional.
    const ambiguous = claimed.has(k) && (opts.partial === true || (c !== null && (free.get(c) ?? 0) > 0));
    t.requests.push({ request: q, claimed: claimed.has(k), ambiguous });
    if (ambiguous) t.ambiguous++;
    t.cost += q.cost;
  });
  return out;
}

export interface ModelUsage {
  model: string;
  provider: string;
  /** Requests (a request with retries counts once). */
  requests: number;
  failed: number;
  open: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

/** Requests by model, largest spend first, then most requests, then name. */
export function byModel(requests: readonly UsageRequest[]): ModelUsage[] {
  const by = new Map<string, ModelUsage>();
  for (const q of requests) {
    const key = `${q.provider}\u0000${q.model}`;
    let m = by.get(key);
    if (!m) {
      m = { model: q.model, provider: q.provider, requests: 0, failed: 0, open: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      by.set(key, m);
    }
    m.requests++;
    if (q.state === 'failed') m.failed++;
    else if (q.state === 'open') m.open++;
    m.input += q.billed.input;
    m.output += q.billed.output;
    m.cacheRead += q.billed.cacheRead;
    m.cacheWrite += q.billed.cacheWrite;
    m.cost += q.cost;
  }
  return [...by.values()].sort((a, b) => b.cost - a.cost || b.requests - a.requests || a.model.localeCompare(b.model));
}

/** Speech calls of the rows read: the count and their cost (their tokens are not model tokens). */
export function speechOf(rows: readonly UsageRow[]): { calls: number; cost: number } {
  let calls = 0, cost = 0;
  for (const r of rows) if (r.kind === 'speech') { if (r.attempt !== -2) calls++; cost += r.cost; }
  return { calls, cost };
}

/** Side-question calls of the rows read and their spend (the agent's totals leave side rows out); a -2 row is spend, not a call. */
export function sideOf(rows: readonly UsageRow[]): { calls: number; cost: number } {
  let calls = 0, cost = 0;
  for (const r of rows) if (r.kind === 'side') { if (r.attempt !== -2) calls++; cost += r.cost; }
  return { calls, cost };
}

/** Share of prompt tokens served from the cache, 0 to 100; null when there are no prompt tokens at all. */
export function cachePct(input: number, cacheRead: number, cacheWrite: number): number | null {
  const all = input + cacheRead + cacheWrite;
  return all > 0 ? (cacheRead / all) * 100 : null;
}

/** Appends a page's rows to those read, by id: rows already held (a page re-read) are not doubled; ids must grow. */
export function mergeRows(held: readonly UsageRow[], page: readonly UsageRow[]): UsageRow[] {
  let last = held.length ? held[held.length - 1]!.id : -1;
  const out = [...held];
  for (const r of page) if (r.id > last) { out.push(r); last = r.id; }
  return out;
}

// ---- the daemon-wide rollup (usageByModel / usageByAccount) ----

/** One row of the rollup. The agent writes the Go field names (Model, Provider, Calls, Successes, SuccessRate,
 *  TotalCostUSD, AvgLatencyMs, CostPerSuccessUSD); snake_case is read too. */
export interface Rollup {
  model: string;
  provider: string;
  /** usageByAccount only: the durable account key ("" for an API key). */
  account: string;
  calls: number;
  successes: number;
  /** 0 to 1. */
  successRate: number;
  cost: number;
  avgLatencyMs: number;
  costPerSuccess: number;
}

const pick = (r: Record<string, unknown>, ...names: string[]): unknown => {
  for (const n of names) if (r[n] !== undefined) return r[n];
  return undefined;
};
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** {rollup: [...]} as rows; null when the body is not that or any row is malformed (never a shorter table). */
export function rollupOf(body: unknown): Rollup[] | null {
  if (!obj(body) || !Array.isArray(body.rollup)) return null;
  const out: Rollup[] = [];
  for (const x of body.rollup) {
    if (!obj(x)) return null;
    const model = pick(x, 'Model', 'model');
    const account = pick(x, 'Account', 'account');
    const provider = pick(x, 'Provider', 'provider');
    const calls = pick(x, 'Calls', 'calls'), successes = pick(x, 'Successes', 'successes');
    const rate = pick(x, 'SuccessRate', 'success_rate'), cost = pick(x, 'TotalCostUSD', 'total_cost_usd');
    const lat = pick(x, 'AvgLatencyMs', 'avg_latency_ms'), cps = pick(x, 'CostPerSuccessUSD', 'cost_per_success_usd');
    if (typeof provider !== 'string' || (model === undefined && account === undefined)) return null;
    if ((model !== undefined && typeof model !== 'string') || (account !== undefined && typeof account !== 'string')) return null;
    if (!nat(calls) || !nat(successes) || !fin(rate) || rate > 1 || !fin(cost) || !fin(lat) || !fin(cps)) return null;
    out.push({ model: (model as string | undefined) ?? '', provider, account: (account as string | undefined) ?? '', calls, successes, successRate: rate, cost, avgLatencyMs: lat, costPerSuccess: cps });
  }
  return out;
}
