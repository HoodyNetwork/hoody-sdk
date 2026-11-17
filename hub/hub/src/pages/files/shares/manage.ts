// The write side of the Shared folders section: Share a folder, and on each share Turn off / Turn on, the
// access change, Try again and Stop sharing. Shown only to an account session, while the sharesUi flag is on.
//   This file is the logic (the runners, the gate, each share's menu entries, the open question); SharesSection.tsx
//   draws the bands, outcomes and the question from it.
//   - Every change is sent once (data.ts, changes.ts). An answer that did not come back is core's held change: the
//     section says "may have gone through" with Check again (a read of the lists) and Stop tracking, and offers no
//     other change of the list until it is settled. A hold another page sent is only checked here.
//   - A question (turn off, access, stop) is about the share it was opened for, as it read then: when that share
//     leaves the list or reads differently, the question closes and nothing is sent.
import { useRunner, type HeldChange } from '@core';
import { useStrings, type RowActionEntry } from '@kit';
import { useCallback, useEffect, useState } from 'react';
import { CHANGE_LOCK, CREATE_LOCK, STOP_LOCK, type CreateVars, type EnabledVars, type ModeVars, type RetryVars, type StopVars } from './changes';
import { shareHeldBy, useCreateShare, useRetryShare, useSetShareEnabled, useSetShareMode, useStopShare } from './data';
import type { ShareComputer } from './section';
import type { ShareHold, ShareState } from './state';
import strings from './strings.en.json';
import type { ShareMode, ShareRow } from './wire';

type Identity = Record<string, unknown>;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
export interface ShareAsk { readonly kind: 'off' | 'rw' | 'ro' | 'stop'; readonly row: ShareRow; readonly from: string; readonly to: string }
type Ask = ShareAsk;
type Runner<V> = ReturnType<typeof useRunner<V>>;

export interface ShareWrites {
  /** One runner per change; the section draws each one's held band or outcome, the dialog sends through `create`. */
  create: Runner<CreateVars>;
  enabled: Runner<EnabledVars>;
  mode: Runner<ModeVars>;
  retry: Runner<RetryVars>;
  stop: Runner<StopVars>;
  /** A send is out. */
  busy: boolean;
  /** Why no change can start now (an earlier one is out or unsettled), or null. */
  wait: string | null;
  /** What the Hub is doing with this share, for its state (state.ts ShareContext). */
  contextOf: (row: ShareRow) => { hold?: ShareHold; unsure?: boolean };
  /** The change entries of one share's menu. `listed`: its source computer is in the realm view's list. */
  actionsOf: (row: ShareRow, state: ShareState, names: { from: string; to: string }, listed: boolean) => RowActionEntry[];
  /** The open question (turn off, access, stop), the share it is about, and its two answers. */
  ask: ShareAsk | null;
  closeAsk: () => void;
  confirm: () => void;
  /** The folder a held change names, and the computer a held create shares with. */
  heldPath: (identity: Identity | null) => string;
  heldTo: (identity: Identity | null) => string;
}

/** `rows`: the shares on screen, which an open question is checked against. Held changes show whichever computer's
 *  list is open: they are this person's own shares in the realm view, each named by its folder. */
export function useShareWrites({ rows, computers, onChanged }: { rows: readonly ShareRow[]; computers: readonly ShareComputer[]; onChanged: () => void }): ShareWrites {
  const t = useStrings(strings);
  const pickEnabled = useCallback((i: Identity) => typeof i.enabled === 'boolean', []);
  const pickMode = useCallback((i: Identity) => i.mode === 'readonly' || i.mode === 'readwrite', []);
  const pickRetry = useCallback((i: Identity) => i.retry === true, []);
  const byCreate = useCallback((h: HeldChange) => shareHeldBy('create', h), []);
  const byEnabled = useCallback((h: HeldChange) => shareHeldBy('setEnabled', h), []);
  const byMode = useCallback((h: HeldChange) => shareHeldBy('setMode', h), []);
  const byRetry = useCallback((h: HeldChange) => shareHeldBy('retry', h), []);
  const byStop = useCallback((h: HeldChange) => shareHeldBy('stop', h), []);
  const base = (i: Identity) => ({ source: text(i.source), share: text(i.share), path: text(i.path) });

  const create = useRunner(useCreateShare(), {
    lock: CREATE_LOCK, heldBy: byCreate,
    vars: (i): CreateVars => ({ source: text(i.source), path: text(i.path), target: text(i.target), mode: i.mode === 'readwrite' ? 'readwrite' : 'readonly', before: Array.isArray(i.before) ? i.before.filter((x): x is string => typeof x === 'string') : [] }),
  });
  const enabled = useRunner(useSetShareEnabled(), { lock: CHANGE_LOCK, pick: pickEnabled, heldBy: byEnabled, vars: (i): EnabledVars => ({ ...base(i), enabled: i.enabled === true }) });
  const mode = useRunner(useSetShareMode(), { lock: CHANGE_LOCK, pick: pickMode, heldBy: byMode, vars: (i): ModeVars => ({ ...base(i), mode: i.mode === 'readwrite' ? 'readwrite' : 'readonly' }) });
  const retry = useRunner(useRetryShare(), { lock: CHANGE_LOCK, pick: pickRetry, heldBy: byRetry, vars: (i): RetryVars => base(i) });
  const stop = useRunner(useStopShare(), { lock: STOP_LOCK, heldBy: byStop, vars: (i): StopVars => ({ ...base(i), target: text(i.target) }) });

  // The share a send is out for, and what it does, until its answer: the row says "Working…".
  const [acting, setActing] = useState<{ share: string; hold: ShareHold } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  // The question is about the share as it read when it opened: gone or changed, it closes unsent.
  const asked = ask ? rows.find((r) => r.id === ask.row.id) : undefined;
  const askStale = ask !== null && acting === null && (!asked || asked.enabled !== ask.row.enabled || asked.mode !== ask.row.mode);
  useEffect(() => { if (askStale) setAsk(null); }, [askStale]);

  const runners = [create, enabled, mode, retry, stop] as const;
  const busy = runners.some((r) => r.busy);
  const heldAny = runners.some((r) => r.held !== null);
  const wait = busy || heldAny ? t('act.wait') : null;
  const heldShares = [enabled, mode, retry, stop].map((r) => text(r.held?.share)).filter((x) => x !== '');

  const contextOf = (row: ShareRow) => (acting?.share === row.id ? { hold: acting.hold } : heldShares.includes(row.id) ? { unsure: true } : {});

  const act = async <V,>(r: ReturnType<typeof useRunner<V>>, vars: V, share: string, hold: ShareHold) => {
    if (wait !== null) return;
    setActing({ share, hold });
    try { await r.run(vars); } finally { setActing(null); setAsk(null); onChanged(); }
  };
  const varsOf = (row: ShareRow) => ({ source: row.sourceComputerId, share: row.id, path: row.sourcePath });
  const setEnabled = (row: ShareRow, on: boolean) => act(enabled, { ...varsOf(row), enabled: on }, row.id, on ? 'turningOn' : 'turningOff');
  const setMode = (row: ShareRow, m: ShareMode) => act(mode, { ...varsOf(row), mode: m }, row.id, 'changing');
  const confirm = () => {
    // Only the share the question was opened for, and only while it still reads the way it did.
    if (!ask || askStale) return;
    const row = ask.row;
    if (ask.kind === 'off') void setEnabled(row, false);
    else if (ask.kind === 'rw') void setMode(row, 'readwrite');
    else if (ask.kind === 'ro') void setMode(row, 'readonly');
    else void act(stop, { ...varsOf(row), target: row.targetComputerId ?? '' }, row.id, 'stopping');
  };

  const actionsOf = (row: ShareRow, state: ShareState, names: { from: string; to: string }, listed: boolean): RowActionEntry[] => {
    const off = wait ?? (listed ? null : t('act.notHere'));
    const gate = off === null ? {} : { isDisabled: true, disabledReason: off };
    const open = (kind: Ask['kind']) => () => setAsk({ kind, row, ...names });
    const live = state.kind !== 'expired' && state.kind !== 'legacy' && state.kind !== 'unreadable';
    const one = row.targetType === 'computer';
    return [
      ...(live && (state.action === 'tryAgain' || state.kind === 'failed') ? [{ id: 'tryAgain', label: t('act.tryAgain'), icon: 'reload' as const, ...gate, onAction: () => void act(retry, varsOf(row), row.id, 'turningOn') }] : []),
      ...(live && row.enabled && row.status !== 'failed' ? [{ id: 'turnOff', label: t('act.turnOff'), ...gate, onAction: open('off') }] : []),
      ...(live && one && !row.enabled ? [{ id: 'turnOn', label: t('act.turnOn'), ...gate, onAction: () => void setEnabled(row, true) }] : []),
      ...(live && one && row.mode === 'readonly' ? [{ id: 'readWrite', label: t('act.readWrite'), ...gate, onAction: open('rw') }] : []),
      ...(live && row.mode === 'readwrite' ? [{ id: 'readOnly', label: t('act.readOnly'), ...gate, onAction: open('ro') }] : []),
      '-' as const,
      { id: 'stop', label: t('act.stop'), tone: 'danger' as const, ...gate, onAction: open('stop') },
    ];
  };

  const heldPath = (i: Identity | null) => text(i?.path) || t('held.unnamed');
  const heldTo = (i: Identity | null) => computers.find((c) => c.id === i?.target)?.name ?? t('computer.unknown');
  return { create, enabled, mode, retry, stop, busy, wait, contextOf, actionsOf, ask, closeAsk: () => { if (!busy) setAsk(null); }, confirm, heldPath, heldTo };
}

/** Whether the last answered off/on change turned the share on (the API answers the share as it now reads). */
export function lastOn(o: { data?: unknown } | undefined): boolean {
  const d = (o?.data && typeof o.data === 'object' ? (o.data as { data?: { enabled?: unknown } }).data : undefined);
  return d?.enabled === true || d?.enabled === 1;
}
