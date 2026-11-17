// Closed Boards: the realm's closed Boards, newest first, each with Restore and Remove.
//
// Contract, in plain words:
//   - The list is what core shows for the realm now (closed.ts entries): a Board closed in another tab appears here too.
//   - Restore makes the Board again as a new Board and opens it; the dialog then closes. While the realm holds nine
//     Boards it stays focusable with the reason (the model checks the cap again on the Boards as stored).
//   - Remove takes one entry out; its toast's Undo puts it back (closed.ts putBack: a fresh cid, closed now).
//   - Clear all asks first, and removes only the entries it listed when it asked: one closed meanwhile stays.
//   - One change of Closed Boards at a time, page-wide (useOneAtATime, shared by the dialog's rows, Clear all, Remove's
//     Undo and Close's Undo): while one is on its way every row action waits (focusable, with the reason) and a second
//     start does nothing (an Undo says to wait), so a Restore and an Undo of the same entry never make two Boards.
//   - Close's toast tells only what is confirmed: the entry is kept in Closed Boards (closed.ts close stores it before
//     the live delete; the live delete may still be page-only, which the page's unsaved notice tells).
//   - NOT_STORED can stay until a reload (closed.ts HISTORY RULE: a prefs page copy refuses every history write in this
//     tab until reload), so its words say to reload and check, never just "try again".
// Every refusal says what stayed; nothing is shown as done before the store said so, and an outcome that is not known
// is never told as a failure, nor an unconfirmed one as done or not done (closeText, restoreText: one place for both the
// menu's Close and the dialog). closed.ts answers NOT_STORED / BOARD_NOT_STORED / entryKept also when a write was only
// not confirmed (it may land later), so their words say "not confirmed", never "not saved".
import { ConfirmDialog, Dialog, ItemList, formatRelative, showToast } from '@kit';
import { useCallback, useRef, useState } from 'react';
import { BOARD_CHANGED, BOARD_NOT_STORED, HISTORY_FULL, NOT_STORED, type ClosedBoardsApi, type ClosedRefusal } from '../closed';
import { filledCount } from '../model/boards';
import type { ClosedBoard } from '../model/history';
import { useT, type T } from './text';

/** What a refused change of the history alone says (Remove, its Undo, Clear all): the entry or the list stayed. */
export function closedRefusalText(t: T, r: ClosedRefusal): string {
  if (r.refused === HISTORY_FULL.refused) return t('closed.tooBig');
  if (r.refused === 'NOT_FOUND') return t('closed.gone');
  return t('closed.notStored');
}

/** A toast: what it says and its tone. */
export interface Said { readonly title: string; readonly tone: 'info' | 'unknown' }

/** What Close's refusal says about Board `name` (closed.ts close): each answer by what it means for the live Board and
 *  the history, never another's words. */
export function closeText(t: T, name: string, r: ClosedRefusal): Said {
  switch (r.refused) {
    case BOARD_CHANGED.refused: return { title: t('closed.changed', { name }), tone: 'info' };
    case 'NOT_KNOWN': return { title: t('closed.closeUnknown', { name }), tone: 'unknown' };
    case 'NOT_FOUND': return { title: t('closed.boardGone', { name }), tone: 'info' };
    case NOT_STORED.refused: return { title: t('closed.notClosedUnconfirmed', { name }), tone: 'info' }; // may land later
    case HISTORY_FULL.refused: return { title: t('closed.notClosed', { name, why: t('closed.tooBig') }), tone: 'info' };
    default: return { title: t('closed.notDone', { name }), tone: 'info' }; // NOT_ADDED, UPDATING: the live write was not made
  }
}

/** What Restore (or Close's Undo) of entry `name` says: null when the Board opened and nothing more is to be said (it opens
 *  and the page names it). */
export function restoreText(t: T, name: string, fullText: string, r: { readonly entryKept: boolean } | ClosedRefusal): Said | null {
  if (!('refused' in r)) return r.entryKept ? { title: t('closed.restoredKept', { name }), tone: 'info' } : null;
  switch (r.refused) {
    case BOARD_NOT_STORED.refused: return { title: t('closed.restoreUnsaved', { name }), tone: 'info' };
    case 'NOT_KNOWN': return { title: t('closed.restoreUnknown', { name }), tone: 'unknown' };
    case 'BOARDS_FULL': return { title: fullText, tone: 'info' };
    case 'NOT_FOUND': return { title: t('closed.gone'), tone: 'info' };
    default: return { title: t('closed.notRestored', { name }), tone: 'info' };
  }
}

/** One change of Closed Boards at a time, for the page (see the contract). */
export interface OneAtATime {
  readonly busy: boolean;
  /** Runs `op` unless one is on its way (then null, nothing run); `busy` shows meanwhile. */
  run<R>(op: () => Promise<R>): Promise<R | null>;
}
export function useOneAtATime(): OneAtATime {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = useCallback(async <R,>(op: () => Promise<R>): Promise<R | null> => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    try { return await op(); } finally { pending.current = false; setBusy(false); }
  }, []);
  return { busy, run };
}

export function ClosedBoardsDialog(p: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly closed: ClosedBoardsApi;
  /** The realm holds MAX_BOARDS: Restore says why it cannot. */
  readonly fullReason: string | null;
  /** The name an entry shows (a Board with no name of its own reads as the page names it). */
  readonly nameOf: (e: ClosedBoard) => string;
  /** The page's one-at-a-time gate (Close's Undo shares it). */
  readonly one: OneAtATime;
  /** What the page says after a restore (restoreText; the nine-Board text is the page's). */
  readonly sayRestore: (name: string, r: { readonly entryKept: boolean } | ClosedRefusal) => void;
}) {
  const { closed } = p;
  const t = useT();
  // Clear all: the cids listed when it asked (never one closed after).
  const [clearing, setClearing] = useState<readonly string[] | null>(null);
  const { busy, run } = p.one;
  const entries = closed.entries;

  const restore = async (e: ClosedBoard) => {
    const r = await run(() => closed.restore(e.cid));
    if (r === null) return;
    p.sayRestore(p.nameOf(e), r);
    if (!('refused' in r)) p.onClose();
  };
  const remove = async (e: ClosedBoard) => {
    const r = await run(() => closed.remove(e.cid));
    if (r === null) return;
    if ('refused' in r) { showToast({ title: closedRefusalText(t, r), tone: 'info' }); return; }
    showToast({
      title: t('closed.removed', { name: p.nameOf(r) }),
      action: { label: t('undo.label'), onAction: () => {
        void run(() => closed.putBack(r)).then((b) => {
          if (b === null) showToast({ title: t('closed.busy'), tone: 'info' });
          else if ('refused' in b) showToast({ title: closedRefusalText(t, b), tone: 'info' });
        });
      } },
    });
  };
  const clear = async (cids: readonly string[]) => {
    setClearing(null);
    const r = await run(async () => ({ r: await closed.clear(cids) }));
    if (r?.r) showToast({ title: closedRefusalText(t, r.r), tone: 'info' });
  };
  // While a change is on its way: every row action waits, with the reason (kit ReasonButton: focusable, does nothing).
  const wait = busy ? t('closed.busy') : null;

  return (
    <>
      <Dialog
        overlayId="board-closed"
        isOpen={p.isOpen && clearing === null}
        onOpenChange={(o) => { if (!o) p.onClose(); }}
        size="lg"
        title={t('closed.title')}
        body={entries.length === 0 ? t('closed.empty') : t('closed.body')}
        primaryLabel={entries.length > 0 ? t('closed.clearAll') : undefined}
        primaryTone="danger"
        primaryDisabled={busy}
        onPrimary={() => setClearing(entries.map((e) => e.cid))}
        cancelLabel={t('closed.done')}
        busy={busy}
      >
        {entries.length > 0 && (
          <ItemList
            label={t('closed.title')}
            items={entries.map((e) => {
              const name = p.nameOf(e);
              return {
                id: e.cid,
                title: name,
                meta: [t('board.tileCount', { count: filledCount(e.board) }), t('closed.when', { when: formatRelative(e.closedAt) })] as const,
                actions: {
                  inline: [
                    { id: 'restore', label: t('closed.restore'), name: t('closed.restoreName', { name }), onPress: () => { void restore(e); }, ...(wait ?? p.fullReason ? { disabledReason: (wait ?? p.fullReason) as string } : {}) },
                    { id: 'remove', label: t('closed.remove'), name: t('closed.removeName', { name }), icon: 'trash', tone: 'danger', onPress: () => { void remove(e); }, ...(wait ? { disabledReason: wait } : {}) },
                  ] as const,
                },
              };
            })}
          />
        )}
      </Dialog>
      <ConfirmDialog
        overlayId="board-closed-clear"
        isOpen={clearing !== null}
        onOpenChange={(o) => { if (!o) setClearing(null); }}
        title={t('closed.clearTitle', { count: clearing?.length ?? 0 })}
        body={t('closed.clearBody')}
        confirmLabel={t('closed.clearConfirm')}
        tone="danger"
        onConfirm={() => { if (clearing) void clear(clearing); }}
      />
    </>
  );
}
