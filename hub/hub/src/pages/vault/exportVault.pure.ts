// The vault export, the pure part (split out of exportVault.ts so the terminal build shares it; the contract is at the
// top of exportVault.ts). exportVault.ts re-exports every name here and keeps saveExport, which saves through a DOM link.
import { alive, api, capture, type HubError } from '@core';
import { encryptMany, isValidEnvelope, VaultCryptoError, type VaultCryptoErrorKind } from './crypto';
import { freshList, problemOf, takeValue, type Problem } from './data';
import { partitionQuery, type Partition } from './logic';
import { routes } from './routes';

export type ExportMode = 'encrypted' | 'readable';

export interface ExportEntry {
  readonly key: string;
  readonly value: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

/**
 * The file's text: the TUI import shape, keys sorted, metadata only when the entry has some. Written pair by pair,
 * never through an object keyed by entry name: an object would swallow '__proto__' and put integer-like names first.
 * The layout is JSON.stringify's two-space indent. Throws (RangeError) on metadata too deep to write.
 */
export function exportText(entries: readonly ExportEntry[]): string {
  const pairs = [...entries]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((e) => {
      const rec = e.metadata && Object.keys(e.metadata).length > 0 ? { value: e.value, metadata: e.metadata } : { value: e.value };
      return `  ${JSON.stringify(e.key)}: ${JSON.stringify(rec, null, 2).replace(/\n/g, '\n  ')}`; // reason: the export file's own bytes, saved by saveExport, never shown
    });
  return pairs.length === 0 ? '{}' : `{\n${pairs.join(',\n')}\n}`;
}

/** Encrypted mode: every value that is not a valid envelope is locked (one derivation); valid envelopes stay as they are. */
export async function lockValues(entries: readonly ExportEntry[], password: string): Promise<ExportEntry[]> {
  const plainAt = entries.flatMap((e, i) => (isValidEnvelope(e.value) ? [] : [i]));
  const sealed = await encryptMany(
    plainAt.map((i) => (entries[i] as ExportEntry).value),
    password,
  );
  const out = [...entries];
  plainAt.forEach((i, n) => {
    const e = entries[i] as ExportEntry;
    out[i] = { key: e.key, value: sealed[n] as string, metadata: { ...(e.metadata ?? {}), encrypted: true } };
  });
  return out;
}

/** vault-<partition name>-<YYYY-MM-DD>.json, with only [a-z0-9._-] in the name part (never empty, never a leading dot). */
export function exportFileName(partitionName: string, now: Date): string {
  const slug = partitionName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/g, '');
  const d = now.toISOString().slice(0, 10);
  return `vault-${slug || 'export'}-${d}.json`;
}

export interface ExportProgress {
  readonly done: number;
  readonly total: number;
  /** Seconds left of a Retry-After the read loop is waiting out, else 0. */
  readonly waiting: number;
}

export type ExportRun =
  | {
      ok: true;
      text: string;
      /** Entries in the file. */
      count: number;
      /** Entries that could not be read (not in the file). */
      failed: readonly string[];
      /** Entries removed while the export ran (not in the file). */
      gone: number;
    }
  | { ok: false; why: 'cancelled' | 'stale' | 'list' | 'empty' | 'serialize' }
  | { ok: false; why: 'refused'; problem: Problem }
  | { ok: false; why: 'crypto'; kind: VaultCryptoErrorKind };

export interface ExportOptions {
  readonly mode: ExportMode;
  /** Encrypted mode only; read once, never kept. */
  readonly password: string;
  readonly signal: AbortSignal;
  readonly onProgress?: (p: ExportProgress) => void;
  /** Tests: how a Retry-After is waited out. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const id = setTimeout(done, ms);
    function done() {
      clearTimeout(id);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

const RATE_TRIES = 5;

/**
 * Reads every entry of the partition (a fresh list, then one read per entry) and builds the file's text. A Retry-After
 * is waited out (at most RATE_TRIES times per entry); a refusal (403, an access key) stops the export with nothing
 * built; an entry removed meanwhile is left out and counted; any other failed read is left out and named.
 */
export async function runExport(p: Partition, o: ExportOptions): Promise<ExportRun> {
  const ctx = capture();
  const sleep = o.sleep ?? abortableSleep;
  const rows = await freshList(p);
  if (o.signal.aborted) return { ok: false, why: 'cancelled' };
  if (!alive(ctx)) return { ok: false, why: 'stale' };
  if (rows === null) return { ok: false, why: 'list' };
  if (rows.length === 0) return { ok: false, why: 'empty' };
  const entries: ExportEntry[] = [];
  const failed: string[] = [];
  let gone = 0;
  const total = rows.length;
  o.onProgress?.({ done: 0, total, waiting: 0 });
  for (const [i, row] of rows.entries()) {
    for (let tries = 0; ; tries++) {
      if (o.signal.aborted) return { ok: false, why: 'cancelled' };
      let value: string | null = null;
      let problem: Problem | null = null;
      try {
        await api(routes.read, {
          params: { key: row.key },
          query: partitionQuery(p),
          ctx,
          scrub: (r: unknown) => {
            value = takeValue(r);
          },
        });
      } catch (e) {
        value = null;
        problem = problemOf(e as HubError);
      }
      if (o.signal.aborted) return { ok: false, why: 'cancelled' };
      if (!alive(ctx)) return { ok: false, why: 'stale' };
      // A 200 without a value string is a read that proved nothing: named as failed, never exported as empty.
      if (problem === null && value) {
        entries.push({ key: row.key, value, metadata: row.metadata });
      } else if (problem?.kind === 'rate' && tries < RATE_TRIES) {
        o.onProgress?.({ done: i, total, waiting: problem.retryAfter });
        await sleep(problem.retryAfter * 1000, o.signal);
        if (o.signal.aborted) return { ok: false, why: 'cancelled' };
        o.onProgress?.({ done: i, total, waiting: 0 });
        continue;
      } else if (problem?.kind === 'forbidden' || problem?.kind === 'token') {
        return { ok: false, why: 'refused', problem };
      } else if (problem?.kind === 'gone') {
        gone++;
      } else {
        failed.push(row.key);
      }
      break;
    }
    o.onProgress?.({ done: i + 1, total, waiting: 0 });
  }
  let out: ExportEntry[] = entries;
  if (o.mode === 'encrypted') {
    try {
      out = await lockValues(entries, o.password);
    } catch (e) {
      return { ok: false, why: 'crypto', kind: e instanceof VaultCryptoError ? e.kind : 'unavailable' };
    }
    if (o.signal.aborted) return { ok: false, why: 'cancelled' };
    if (!alive(ctx)) return { ok: false, why: 'stale' };
  }
  let text: string;
  try {
    text = exportText(out);
  } catch {
    // Metadata too deep for this browser to write: a fixed result, no value or error text.
    return { ok: false, why: 'serialize' };
  }
  return { ok: true, text, count: out.length, failed, gone };
}
