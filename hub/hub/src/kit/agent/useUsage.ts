// The Usage tab's data: one chat's usage rows, read page by page and kept. Rows are read from the first one, then
// again from the first row on `refresh` (a row can be updated in place, so an id cursor would miss it). A page that cannot be read as the contract says is not "fewer rows":
// the first read fails, a later one leaves what was read and says it is out of date. Answers after reset() change nothing.
import { useSyncExternalStore } from 'react';
import type { agent } from '@core';
import { mergeRows, requestsOf, usagePageOf, type UsageRequest, type UsageRow, type UsageTotals } from './usage';

/** Rows asked per page, and the pages read in one go (the rest is `more`; refresh continues from the last row). */
export const USAGE_PAGE = 1000;
export const USAGE_MAX_PAGES = 30;

export interface UsageView {
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  /** The first read failed: its code and status; 'unreadable' when the answer was not the contract's. */
  error: { code: string; status: number } | null;
  rows: readonly UsageRow[];
  requests: readonly UsageRequest[];
  /** The agent's totals for the whole chat, as of the last page read. */
  totals: UsageTotals | null;
  /** There are rows after the last one read (the page limit was reached): the table is not the whole chat yet. */
  more: boolean;
  /** Rows past the pages the last refresh could re-read were kept from an earlier read: they may be out of date. */
  heldPast: boolean;
  /** A later read failed or was unreadable: what shows may be out of date. */
  stale: boolean;
  /** A read is out. */
  reading: boolean;
}

export interface UsageStore {
  view(): UsageView;
  subscribe(fn: () => void): () => void;
  /** The first read (from the first row). Does nothing once rows were read, or while a read is out. */
  load(): Promise<void>;
  /** Reads the window again from the first row, replacing the rows held when the whole read succeeds. Does nothing while a read is out, or before the first read. */
  refresh(): Promise<void>;
  reset(): void;
}

const EMPTY: UsageView = { phase: 'idle', error: null, rows: [], requests: [], totals: null, more: false, heldPast: false, stale: false, reading: false };

export function createUsageStore(deps: { api: Pick<agent.UsageApi, 'session'>; id: string; realm?: string }): UsageStore {
  const subs = new Set<() => void>();
  let v: UsageView = EMPTY;
  let gen = 0, out = false;
  const put = (p: Partial<UsageView>): void => {
    v = { ...v, ...p };
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };

  /** Reads pages from the cursor until the last one or the page cap. Returns false on a failure (nothing is half-applied). */
  async function pull(first: boolean): Promise<void> {
    const mine = gen;
    out = true;
    put({ reading: true, ...(first ? { phase: 'loading' as const } : {}) });
    // Every read starts at the first row: the agent updates a request's row in place (same id), which an id cursor would never see again.
    // The rows held are replaced only when the whole read succeeds.
    let rows: readonly UsageRow[] = [];
    let totals: UsageTotals | null = null;
    let at = 0;
    let more = false;
    let heldPast = false;
    // A refresh re-reads up to the page cap (so in-place updates show), then goes on forward past it: rows beyond the re-read
    // window that an earlier read held stay (marked heldPast) and the read continues after them, so progress is never lost.
    const budget = first ? USAGE_MAX_PAGES : 2 * USAGE_MAX_PAGES;
    for (let i = 0; i < budget; i++) {
      if (i === USAGE_MAX_PAGES && !first) {
        const tail = v.rows.filter((x) => x.id > at);
        if (tail.length) { rows = mergeRows(rows, tail); at = tail[tail.length - 1]!.id; heldPast = true; }
      }
      const r = await deps.api.session(deps.id, { after: at, limit: USAGE_PAGE, ...(deps.realm ? { realm: deps.realm } : {}) });
      if (mine !== gen) return;
      if (!r.ok) {
        out = false;
        // A stale answer (the context moved on under it) is not an answer: the first read becomes a failed state with a retry, never an endless skeleton.
        if (r.err.kind === 'stale') {
          if (first) put({ reading: false, phase: 'failed', error: { code: 'stale', status: 0 } });
          else put({ reading: false, stale: true });
          return;
        }
        if (first) put({ reading: false, phase: 'failed', error: { code: r.err.code, status: r.err.status } });
        else put({ reading: false, stale: true });
        return;
      }
      const page = usagePageOf(r.body, at);
      if (!page) {
        out = false;
        if (first) put({ reading: false, phase: 'failed', error: { code: 'unreadable', status: 0 } });
        else put({ reading: false, stale: true });
        return;
      }
      rows = mergeRows(rows, page.rows);
      totals = page.totals;
      more = page.more;
      // A page that claims more rows but moved nowhere would loop for ever: stop and say there is more.
      const moved = page.next > at;
      at = page.next;
      if (!more || !moved) break;
    }
    out = false;
    put({ reading: false, phase: 'ready', error: null, rows, requests: requestsOf(rows), totals, more, heldPast, stale: false });
  }

  return {
    view: () => v,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    async load() { if (out || v.phase === 'ready') return; await pull(true); },
    async refresh() { if (out || v.phase !== 'ready') return; await pull(false); },
    reset() { gen++; out = false; v = EMPTY; for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } } },
  };
}

export function useUsageView(store: UsageStore): UsageView {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}
