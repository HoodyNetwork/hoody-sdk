// Transfers' rows: each thing on its way or held becomes one row of the Transfers
// table: Computer, What, Item → folder, Progress, State. The reads and the per-row state (a Cancel being asked, a Check
// again's answer, the warned Stop tracking) live in small components that draw nothing but their dialogs and put their
// row into one RowStore; the table draws the store. Rows keep the band's rules exactly (link/LinkBand.tsx): a download
// whose answer was lost is "Outcome unknown" with Check again (which reads by id; resends only from the tab that has
// the link), never failed; Stop tracking is warned and frees only the hold shown; a Cancel whose answer is lost still
// follows the download by its id.
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { formatBytes as fmt, useStrings, type RowAction, type RowActionEntry, type Tone } from '@kit';
import { useCanChange, type FilesComputer } from '../data';
import { displayName, parentOf, partsOf } from '../logic';
import { cancel, check, followRunning, forget, type HeldLink, type LinkEntry } from '../link/data';
import { CHECK_WORDS, StopLink, folderName, setNote, useNote } from '../link/LinkBand';
import { unsentWords } from '../link/LinkDialog';
import type { LinkRecord } from '../link/logic';
import linkStrings from '../link/link.strings.en.json';
import strings from './transfers.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
type LT = ReturnType<typeof useStrings<typeof linkStrings>>;

export type RowState = 'sending' | 'waiting' | 'running' | 'elsewhere' | 'unknown' | 'done' | 'missing' | 'unchecked' | 'failed' | 'cancelled' | 'notSent';
export type RowWhat = 'download' | 'copy' | 'move' | 'rename' | 'delete' | 'mkdir' | 'change';
/** Which "At a glance" count a state adds to: an unknown outcome is never counted as one that did not finish. */
export const GLANCE_OF: Readonly<Record<RowState, 'moving' | 'unknown' | 'failed' | null>> = {
  sending: 'moving', waiting: 'moving', running: 'moving', elsewhere: 'moving',
  unknown: 'unknown',
  failed: 'failed', missing: 'failed', notSent: 'failed',
  done: null, unchecked: null, cancelled: null,
};
export const STATE_TONE: Readonly<Record<RowState, Tone>> = {
  sending: 'info', waiting: 'warn', running: 'info', elsewhere: 'info', unknown: 'warn',
  done: 'ok', missing: 'danger', unchecked: 'warn', failed: 'danger', cancelled: 'neutral', notSent: 'danger',
};

export interface TransferRow {
  readonly key: string;
  /** Sort key: the computer's place in the list, then the row's place on that computer. */
  readonly order: string;
  readonly computer: string;
  readonly what: RowWhat;
  readonly item: string;
  /** Where it goes (the folder, or a rename's new name); null when it goes nowhere (a delete, a new folder). */
  readonly to: string | null;
  /** Bytes moved: a percent when the size is known, and the words ("38 MB of 50 MB"). */
  readonly progress: { readonly pct: number | null; readonly words: string } | null;
  readonly state: RowState;
  /** What the state alone does not say (what a Check again found, what waits for the download). */
  readonly detail: string;
  /** From an answer the last read could not renew (its computer's read failed): it may have finished since, so it is
   *  shown but never counted as moving. */
  readonly stale?: boolean;
  readonly actions: readonly RowActionEntry[];
}

/** What the row components put, keyed, read in `order`: the rows of every computer, and each computer's read state.
 *  A value's handlers are read at the press (`latest`), so a new handler never needs a new draw: what is drawn changes
 *  only when what it shows changes (functions and errors are left out of the comparison). */
export class KeyedStore<V extends { readonly key: string; readonly order: string }> {
  private readonly values = new Map<string, V>();
  private readonly sigs = new Map<string, string>();
  private readonly subs = new Set<() => void>();
  private snap: readonly V[] = [];
  readonly subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  readonly snapshot = () => this.snap;
  readonly latest = (key: string): V | undefined => this.values.get(key);
  readonly put = (key: string, v: V | null) => {
    if (!v) {
      if (!this.values.delete(key)) return;
      this.sigs.delete(key);
      this.emit();
      return;
    }
    this.values.set(key, v);
    // An error object is not compared (it may not serialize): the flags beside it say when it shows.
    const sig = JSON.stringify(v, (k, x: unknown) => (k === 'error' ? undefined : x));
    if (this.sigs.get(key) === sig) return;
    this.sigs.set(key, sig);
    this.emit();
  };
  private emit() {
    this.snap = [...this.values.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    for (const f of this.subs) f();
  }
}

export class RowStore extends KeyedStore<TransferRow> {
  /** The row's actions as last put; each press runs the handler put last, never a disabled one. */
  readonly actionsOf = (r: TransferRow): RowActionEntry[] => r.actions.map((a) => (a === '-' ? a : { ...a, onAction: () => {
    const now = this.latest(r.key)?.actions.find((x): x is RowAction => x !== '-' && x.id === a.id);
    if (now && !now.isDisabled) now.onAction?.();
  } }));
}

export const useStore = <V extends { readonly key: string; readonly order: string }>(store: KeyedStore<V>) => useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

/** Puts this component's row (null: none) on every draw, and takes it away when the component goes. */
export function usePut<V extends { readonly key: string; readonly order: string }>(put: KeyedStore<V>['put'], key: string, row: V | null) {
  useLayoutEffect(() => { put(key, row); });
  useLayoutEffect(() => () => put(key, null), [put, key]);
}

export const orderOf = (computer: number, group: number, i: number) => `${String(computer).padStart(4, '0')}:${group}:${String(i).padStart(6, '0')}`;
const leafOf = (c: FilesComputer, path: string) => (partsOf(path).length === 0 ? c.name : displayName(partsOf(path).at(-1) ?? path));
const off = (why: boolean) => (why ? { isDisabled: true } : {});

/** Bytes moved, from a download's record (the same numbers the band says in words). */
export function progressOf(lt: LT, r: LinkRecord | undefined): TransferRow['progress'] {
  if (!r || r.current === null) return { pct: null, words: lt('progress.start') };
  if (r.expected !== null && r.expected > 0) {
    const pct = Math.floor(r.percent ?? Math.min(100, (100 * r.current) / r.expected));
    return { pct, words: `${pct}% · ${lt('progress.bytes', { done: fmt(r.current), total: fmt(r.expected) })}` };
  }
  return { pct: null, words: lt('progress.some', { done: fmt(r.current) }) };
}

/** A Files change on its way (core sendingChanges, any tab): no action, it is out. */
export function sendingRow(t: T, c: FilesComputer, id: Record<string, unknown>, key: string, order: string): TransferRow {
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  const kind = text(id.kind);
  const what: RowWhat = kind === 'copy' || kind === 'move' || kind === 'rename' || kind === 'delete' || kind === 'mkdir' ? kind : 'change';
  const to = what === 'copy' || what === 'move' ? leafOf(c, parentOf(text(id.dest))) : what === 'rename' ? displayName(text(id.to)) : null;
  return { key, order, computer: c.name, what, item: leafOf(c, text(id.path)), to, progress: null, state: 'sending', detail: '', actions: [] };
}

/** One of this tab's link downloads (LinkBand's entryLine as a row). 'unknown' has no row: its hold's row says it. */
export function LinkEntryRow({ c, e, rec, retry, put, order }: { c: FilesComputer; e: LinkEntry; rec: LinkRecord | undefined; retry: (() => void) | null; put: RowStore['put']; order: string }) {
  const t = useStrings(strings);
  const lt = useStrings(linkStrings);
  const [stopping, setStopping] = useState(false);
  const [failed, setFailed] = useState(false);
  const canChange = useCanChange();
  const name = displayName(e.state === 'done' || e.state === 'missing' || e.state === 'unchecked' ? (e.savedAs ?? e.filename) : e.filename);
  const base = { key: `link:${e.id}`, order, computer: c.name, what: 'download' as const, item: name, to: folderName(c, e.folder), progress: null, detail: '' };
  const clear: RowActionEntry = { id: 'clear', label: t('act.clear', { name }), onAction: () => forget(e.id) };
  let row: TransferRow | null;
  switch (e.state) {
    case 'sending': row = { ...base, state: 'sending', actions: [] }; break;
    case 'waiting': row = { ...base, state: 'waiting', detail: t('detail.waiting', { computer: c.name }), actions: [] }; break;
    case 'accepted': {
      const cancelIt = () => { setStopping(true); void cancel(c, e.id).then((ok) => { setStopping(false); setFailed(!ok); }); };
      row = {
        ...base,
        progress: progressOf(lt, rec),
        state: 'running',
        detail: failed ? lt('cancelFailed') : retry ? lt('line.unread') : lt('line.runningBusy', { folder: base.to }),
        // Its record could not be read: it may have finished, so it is not counted as moving (the glance qualifies).
        stale: retry !== null,
        actions: [
          { id: 'cancel', label: t('act.cancel', { name }), short: lt('cancel'), inline: true, onAction: cancelIt, ...off(stopping || !canChange) },
          ...(retry ? [{ id: 'reread', label: t('act.check', { name }), onAction: retry }] : []),
        ],
      };
      break;
    }
    case 'done': row = { ...base, state: 'done', actions: [clear] }; break;
    case 'missing': row = { ...base, state: 'missing', detail: t('detail.missing'), actions: [clear] }; break;
    case 'unchecked': row = { ...base, state: 'unchecked', detail: t('detail.unchecked'), actions: [clear] }; break;
    case 'failed': row = { ...base, state: 'failed', actions: [clear] }; break;
    case 'cancelled': row = { ...base, state: 'cancelled', actions: [clear] }; break;
    case 'refused': case 'busy': case 'notSent':
      row = { ...base, state: 'notSent', detail: unsentWords(lt, { id: e.id, state: e.state, ...(e.code ? { code: e.code } : {}) }, c.name), actions: [clear] };
      break;
    default: row = null;
  }
  usePut(put, base.key, row);
  return null;
}

/** A held link download this tab is not sending now (LinkBand's HeldLinkLine as a row): "Outcome unknown" with Check
 *  again inline and the warned Stop tracking in the menu; one being sent from another tab, or one a 429 kept from ever
 *  starting, as the band says them. */
export function HeldLinkRow({ c, held, put, order }: { c: FilesComputer; held: HeldLink; put: RowStore['put']; order: string }) {
  const t = useStrings(strings);
  const lt = useStrings(linkStrings);
  const note = useNote(held.hold.id);
  const [stopping, setStopping] = useState(false);
  const [checking, setChecking] = useState(false);
  const m = held.meta;
  const key = `held:${held.hold.id}`;
  const name = m ? displayName(m.filename) : t('item.unreadable');
  const stop: RowActionEntry = { id: 'stop', label: lt('stop'), opens: true, onAction: () => setStopping(true) };
  const base = { key, order, computer: c.name, what: 'download' as const, item: name, to: m ? folderName(c, m.folder) : null, progress: null };
  const p = { name, folder: base.to ?? c.name, computer: c.name };
  let row: TransferRow;
  if (!m) row = { ...base, state: 'unknown', detail: lt('line.unreadable', { computer: c.name }), actions: [stop] };
  else if (held.hold.inFlight) row = { ...base, state: 'elsewhere', detail: '', actions: [] };
  // Its last answer was a 429 and no answer was lost before it: it never started. Clearing it frees the hold.
  else if (m.phase === 'waiting' && !m.lost) row = { ...base, state: 'notSent', detail: lt('line.notSentBusy', p), actions: [{ id: 'clear', label: t('act.clear', { name }), onAction: () => void check(c, held) }] };
  else {
    const found = note && CHECK_WORDS[note] ? lt(CHECK_WORDS[note]!, p) : '';
    const doCheck = () => { setChecking(true); void check(c, held).then((r) => setNote(held.hold.id, r)).finally(() => setChecking(false)); };
    row = {
      ...base,
      state: 'unknown',
      detail: [found, lt('line.tracking', p)].filter(Boolean).join(' '),
      actions: [{ id: 'check', label: t('act.check', { name }), short: lt('kit.retry'), inline: true, onAction: doCheck, ...off(checking) }, stop],
    };
  }
  usePut(put, key, row);
  return stopping ? <StopLink c={c} held={held} onClose={() => setStopping(false)} /> : null;
}

/** A download running on a shown computer that this tab does not follow. Cancel asks the computer to stop it; once
 *  asked (answered or not), this tab follows it by its id, so its record says how it ended. */
export function RunningRow({ c, r, put, order, stale }: { c: FilesComputer; r: LinkRecord; put: RowStore['put']; order: string; stale: boolean }) {
  const t = useStrings(strings);
  const lt = useStrings(linkStrings);
  const [stopping, setStopping] = useState(false);
  const canChange = useCanChange();
  const name = displayName(r.filename || 'download');
  const folder = r.directory === '/' || !r.directory ? c.name : displayName(partsOf(r.directory).at(-1) ?? r.directory);
  // Whatever Cancel's answer (an accepted one can be lost), the record then decides: this tab follows the download by id.
  const stop = () => { setStopping(true); void cancel(c, r.id).finally(() => followRunning(c, r)); };
  const key = `run:${c.id}:${r.id}`;
  usePut(put, key, {
    key, order, computer: c.name, what: 'download', item: name, to: folder, progress: progressOf(lt, r), state: 'running', detail: stale ? t('detail.stale') : '', stale,
    actions: [{ id: 'cancel', label: t('act.cancel', { name }), short: lt('cancel'), inline: true, onAction: stop, ...off(stopping || !canChange) }],
  });
  return null;
}
