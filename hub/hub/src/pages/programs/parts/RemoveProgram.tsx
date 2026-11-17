// Remove a program the person added: the page's one hook (the ask, the send, Check again, Dismiss), the confirm
// dialog and the note of a removal that is not settled. The rules of the send are remove.ts's.
import { useChangesVersion, type Target } from '@core';
import { ConfirmDialog, Outcome, OutcomeBanner, Spinner, showToast, useStrings } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Row } from '../logic';
import strings from '../strings.en.json';
import { opKey } from './ops';
import { lifecycleOut } from '../sandbox/busy';
import { checkRemove, dismissRemoveAttempt, removeBusy, removeHolds, removeStore, runRemove, useRemoveAttempts, type RemoveAttempt } from './remove';

/** The confirm, bound to what it was asked for: the partition (account, realm, computer), the computer itself and
 *  the program by id and name. Any of them changing closes it and refuses the confirm. */
export interface RemoveAsk {
  part: string;
  target: Target;
  key: string;
  id: string;
  name: string;
  running: boolean;
}

export interface RemoveApi {
  /** Remove is offered for this row at all: a program the person added, never a system or a temporary one. */
  offers: (row: Row) => boolean;
  /** The row's removal that is being sent, not known yet, refused or not sent. */
  attempt: (rowKey: string) => RemoveAttempt | undefined;
  /** A removal of the row is being sent or is not known yet: every action of the program waits. */
  busy: (rowKey: string) => boolean;
  ask: (row: Row) => void;
  asked: RemoveAsk | null;
  confirm: () => void;
  cancel: () => void;
  check: (rowKey: string, shown: RemoveAttempt) => void;
  dismiss: (rowKey: string, shown: RemoveAttempt) => Promise<boolean>;
}

export interface RemoveOptions {
  part: string;
  target: Target | null;
  /** The rows of the last overview read (undefined: none read yet). */
  rows: readonly Row[] | undefined;
  /** Reads the list again (after a removal that is known, and after a check). */
  refetch: () => void;
  /** Another change of the row is held or being sent (a start or stop, a sandbox save): no removal is asked or sent. */
  blocked: (row: Row) => boolean;
}

const sameComputer = (a: Target, b: Target) => a.container.id === b.container.id && a.project.id === b.project.id;
export const removable = (row: Row): boolean => row.scope === 'yours';

export function useRemoveProgram({ part, target, rows, refetch, blocked: blockedHere }: RemoveOptions): RemoveApi {
  const t = useStrings(strings);
  const all = useRemoveAttempts();
  const changes = useChangesVersion();
  const [asked, setAsked] = useState<RemoveAsk | null>(null);

  const said = useCallback(
    (end: 'removed' | 'already' | 'leftover', name: string) => {
      const v = { name: name || t('unnamed') };
      if (end === 'leftover') showToast({ tone: 'warn' /* noDetails: the program was removed; remove.ts keeps only that the cleanup did not finish, never the rejection */, title: t('rm.leftoverT', v), body: t('rm.leftover') }, 12000);
      else if (end === 'removed') showToast({ tone: 'ok', title: t('rm.done', v) });
      else showToast({ tone: 'info', title: t('rm.already', v) });
    },
    [t],
  );

  // What holds a removal back: the page's own reasons (`blockedHere`) and a start, stop, restart or boot change of the
  // program out or held in any tab (core's lists; `changes` re-renders). A removal of it held elsewhere is core's own
  // refusal at the send, shown as not known yet (remove.ts runRemove).
  const blocked = useCallback(
    (row: Row) => blockedHere(row) || lifecycleOut(target, row.key, row.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `changes` is the change signal for core's lists read inside
    [blockedHere, target, changes],
  );
  // The confirm belongs to the program it was asked for: another computer, realm or account, the program leaving the
  // list, another name under its id, or another change of it starting closes it.
  const askedRow = asked ? rows?.find((r) => r.key === asked.key) : undefined;
  const askedOk = !!asked && asked.part === part && !!target && sameComputer(asked.target, target) && !!askedRow && removable(askedRow) && askedRow.name === asked.name && !blocked(askedRow) && !removeBusy(all.get(opKey(part, asked.key)));
  useEffect(() => {
    if (asked && !askedOk) setAsked(null);
  }, [asked, askedOk]);

  // Core's holds of this page's removals on this computer, with no attempt here (a reload, a realm switch, another
  // tab): shown held with their token, so Check again and the warned Dismiss stay reachable. An unknown attempt whose
  // hold core let go elsewhere is over: the list says where it stands.
  useEffect(() => {
    void changes;
    if (!target) return;
    const holds = removeHolds(target).filter((h) => h.own);
    for (const h of holds) {
      const k = opKey(part, `prog:${h.id}`);
      if (!removeBusy(removeStore.get(k))) removeStore.set(k, { id: h.id, name: h.name, target, status: 'unknown', ...(h.hold ? { hold: h.hold } : {}) });
    }
    const pre = `${part}|`;
    for (const [k, a] of removeStore.snapshot()) {
      if (k.startsWith(pre) && a.status === 'unknown' && a.hold !== undefined && !a.checking && !holds.some((h) => h.id === a.id && h.hold === a.hold)) {
        removeStore.clear(k);
        refetch();
      }
    }
  }, [changes, all, part, target, refetch]);

  const check = useCallback(
    (rowKey: string, shown: RemoveAttempt) => {
      void checkRemove(opKey(part, rowKey), shown).then((gone) => {
        if (gone) said('removed', shown.name);
        refetch();
      });
    },
    [part, said, refetch],
  );

  // A removal that is not known yet whose program a later read no longer lists: a read-back of its own proves it
  // (the row is gone, so nobody could press Check again on it). One per list read: a read-back that proves nothing
  // (it could not be made, or still listed the program) is tried again when the list is next read, and reads the list
  // again itself only once the program is proven gone, so a read that keeps failing never turns into polling.
  const autoChecked = useRef(new Map<string, readonly Row[]>());
  useEffect(() => {
    if (!rows) return;
    const pre = `${part}|`;
    for (const [k, a] of all) {
      if (!k.startsWith(pre) || a.status !== 'unknown') { autoChecked.current.delete(k); continue; }
      const rowKey = k.slice(pre.length);
      if (rows.some((r) => r.key === rowKey)) { autoChecked.current.delete(k); continue; }
      if (a.checking || autoChecked.current.get(k) === rows) continue;
      autoChecked.current.set(k, rows);
      void checkRemove(k, a).then((gone) => {
        if (!gone) return;
        said('removed', a.name);
        refetch();
      });
    }
  }, [rows, all, part, said, refetch]);

  return useMemo<RemoveApi>(() => {
    const attempt = (rowKey: string) => all.get(opKey(part, rowKey));
    return {
      offers: removable,
      attempt,
      busy: (rowKey) => removeBusy(attempt(rowKey)),
      ask: (row) => {
        if (!target || !removable(row) || blocked(row) || removeBusy(attempt(row.key))) return;
        // A definite earlier outcome on the row (refused, not sent) gives way to the new ask.
        removeStore.clear(opKey(part, row.key));
        setAsked({ part, target, key: row.key, id: row.id, name: row.name, running: row.state === 'running' || row.state === 'starting' || row.partsUp > 0 });
      },
      asked: askedOk ? asked : null,
      cancel: () => setAsked(null),
      confirm: () => {
        const a = asked;
        setAsked(null);
        // The captured target, checked again at the press: nothing is sent for a confirm that no longer fits.
        if (!a || !askedOk) return;
        void runRemove(opKey(a.part, a.key), { id: a.id, name: a.name, target: a.target }).then((end) => {
          if (end) said(end, a.name);
          refetch();
        });
      },
      check,
      dismiss: (rowKey, shown) => dismissRemoveAttempt(opKey(part, rowKey), shown),
    };
  }, [all, part, target, blocked, asked, askedOk, check, said, refetch]);
}

/** The confirm (a plain danger confirm: a program is not a computer, so no name is typed). */
export function RemoveDialog({ api, computer }: { api: RemoveApi; computer: string }) {
  const t = useStrings(strings);
  // The words stay those of the last ask while the dialog closes (it is never drawn without its title).
  const last = useRef(api.asked);
  if (api.asked) last.current = api.asked;
  const a = last.current;
  const v = { name: a?.name || t('unnamed'), computer };
  return (
    <ConfirmDialog
      overlayId="programs-remove"
      isOpen={api.asked !== null}
      onOpenChange={(open) => !open && api.cancel()}
      title={a ? t('rm.title', v) : ''}
      body={a ? (computer ? t('rm.body', v) : t('rm.bodyHere', v)) : ''}
      {...(a ? { consequences: [...(a.running ? [t('rm.running')] : []), t('rm.forGood')] } : {})}
      confirmLabel={t('rm.go')}
      tone="danger"
      onConfirm={api.confirm}
    />
  );
}

export interface RemoveNoteProps {
  attempt: RemoveAttempt;
  compact?: boolean;
  /** Each control names the attempt it showed: a Check or Dismiss acts on exactly that send. */
  onCheck: (shown: RemoveAttempt) => void;
  onDismiss: (shown: RemoveAttempt) => Promise<boolean>;
}

/** A removal that is not settled: working, "may have gone through" with Check again (reads only), refused, not sent. */
export function RemoveNote({ attempt: a, compact, onCheck, onDismiss }: RemoveNoteProps) {
  const t = useStrings(strings);
  // Dismissing a held removal frees it, so the next confirm sends again: asked first, for the attempt it was raised on.
  const [askedFor, setAskedFor] = useState<RemoveAttempt | null>(null);
  const [moved, setMoved] = useState(false);
  const v = { name: a.name || t('unnamed') };

  if (a.status === 'working') {
    // The kit Spinner is the status announcement (role status, labelled).
    return <Spinner label={t('rm.working', v)} />;
  }
  if (compact) {
    if (a.status === 'unknown') return <Outcome outcome="pending" title={t('op.pendingRow')} onCheck={() => onCheck(a)} checking={a.checking} /* noDetails: nothing failed; the outcome is not known yet and Check again reads the list */ />;
    if (a.status === 'notSent') return <Outcome outcome="not_sent" title={t('op.refusedShort')} onDismiss={() => void onDismiss(a)} /* noDetails: nothing was sent, so there is no rejection */ />;
    return <Outcome outcome="failed" title={t('rm.refusedShort')} onDismiss={() => void onDismiss(a)} /* noDetails: the row's short line; the panel's banner for this attempt carries the rejection (error=) */ />;
  }
  if (a.status === 'unknown') {
    return (
      <>
        <OutcomeBanner
          kind="pending"
          known={a.accepted ? t('rm.accepted', v) : t('rm.unk', v)}
          checkLine={a.stuck ? t('rm.stuck') : t('rm.checkLine')}
          stopLine={moved ? t('op.moved') : undefined}
          onCheck={() => onCheck(a)}
          checking={a.checking}
          onDismiss={() => {
            setMoved(false);
            // Asked first for every removal that is not known, held by core or not: it may have gone through.
            setAskedFor(a);
          }}
          dismissWarned
          /* noDetails: nothing failed; the outcome is not known yet and Check again reads the list */
        />
        <ConfirmDialog
          overlayId="programs-remove-dismiss"
          isOpen={askedFor === a}
          onOpenChange={(o) => !o && setAskedFor(null)}
          title={t('op.dismissTitle')}
          body={t('rm.dismissBody')}
          confirmLabel={t('op.dismissGo')}
          onConfirm={() => {
            const shown = askedFor;
            setAskedFor(null);
            if (shown) void onDismiss(shown).then((freed) => !freed && setMoved(true));
          }}
        />
      </>
    );
  }
  const close = () => void onDismiss(a);
  if (a.status === 'notSent') return <OutcomeBanner kind="not_sent" body={t('op.refused')} onDismiss={close} /* noDetails: nothing was sent, so there is no rejection */ />;
  // The kit maps the rejection to its words and keeps the facts under Details; the daemon's text is never page text.
  if (a.error) return <OutcomeBanner kind="failed" title={t('rm.refused', v)} error={a.error} onDismiss={close} />;
  return <OutcomeBanner kind="failed" title={t('rm.refused', v)} body={t('rm.nothing')} onDismiss={close} /* noDetails: remove.ts kept no rejection for this refusal */ />;
}
