// The one delete planner's dialog: every delete in pages/files opens this, and only this
// sends a delete (changes.test.tsx conformance). It reads, fresh, where each item resolves and the computer's open
// storages, asks plan.ts planDelete, then shows the refusal, a plain confirm, or a typed one. Items go one at a time
// through core's C9 lock; the first that does not end done stops the rest.
//
// One confirmed plan sends once. The press freezes what the person approved (title, lines, the typed words): from
// then on the dialog shows only that frozen plan and its outcome, never a later read, and Delete stays off for good.
// A run that stops says so: the item it stopped at keeps its own outcome (a lost answer stays "may have gone through",
// never "not sent"); only the items after it are counted as not sent. What is left is chosen again from a fresh
// listing in a new dialog, after checking that outcome, never sent from this one.
// A delete still held (it may have gone through) on these items shows its outcome and Check again, never a plan.
import { ConfirmDialog, Dialog, ErrorDetails, TextField, useStrings, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState } from 'react';
export { useDeleteCheck } from './DeletePlanner.pure';
import { readBackShown, useCanChange, useFilesChange, useHeldOn, usePlanReads, useRealPaths, type FilesComputer } from './data';
import { displayName } from './logic';
import { planDelete, type DeleteItem } from './plan';
import { shownOutcome } from './changes';
import { useShares } from './shares/data';
import { sharesUiOn } from './shares/flag';
import strings from './strings.en.json';
import s from './files.module.css';

type Result = { kind: OutcomeLike['kind']; code?: string } | null;
interface Sent { readonly lines: readonly string[]; readonly typed: string | null; readonly done: number; readonly running: boolean; readonly result: Result }

interface PlannerProps { c: FilesComputer; items: readonly DeleteItem[]; onClose: () => void }
/** What the plan knows of the folders this computer shares: their paths (and where each resolves), still being read, or
 *  a read that failed or came back with rows it could not read (`unresolved`: where a shared folder leads could not be
 *  read, so a link to it cannot be told apart). */
type SharesKnown = { readonly paths: readonly string[] } | 'reading' | { readonly failed: true; readonly unresolved?: true; readonly error: unknown; readonly retry: () => void };
const NOT_SHARED: SharesKnown = { paths: [] };

/** The folders this computer shares are read only while the Shared folders switch is on (decided once per
 *  opening, so a dialog is never remounted under a delete): deleting one, or anything in it, takes it from the other
 *  computer too, so the plan says so. With the switch off no share is read at all and the plan says nothing of it. */
export function DeletePlanner(p: PlannerProps) {
  const [shares] = useState(() => sharesUiOn());
  return shares ? <SharedPlanner c={p.c} items={p.items} onClose={p.onClose} /> : <Planner c={p.c} items={p.items} onClose={p.onClose} shares={NOT_SHARED} sharesUi={false} />;
}

/** No plan until a whole list of what this computer shares was read since the dialog opened (a cached one may miss a
 *  share made since), and until each shared folder's own path was resolved where it can be. */
function SharedPlanner(p: PlannerProps) {
  const q = useShares('given', 'this', p.c.id, false);
  const { refetch } = q;
  useEffect(() => { void refetch(); }, [refetch]);
  const fresh = q.isFetchedAfterMount;
  const whole = fresh && !q.isError && q.data && q.data.dropped === 0 ? q.data : undefined;
  const sources = whole ? whole.rows.map((r) => r.sourcePath) : [];
  const resolved = useRealPaths(p.c, sources, !!whole);
  const shares: SharesKnown = fresh && (q.isError || (q.data !== undefined && q.data.dropped > 0))
    ? { failed: true, error: q.isError ? q.error : undefined, retry: () => void refetch() }
    : !whole || resolved === undefined ? 'reading'
    : 'failed' in resolved ? { failed: true, unresolved: true, error: resolved.error, retry: resolved.retry }
    : { paths: [...new Set([...sources, ...resolved.real.values()])] };
  return <Planner c={p.c} items={p.items} onClose={p.onClose} shares={shares} sharesUi />;
}

/** `sharesUi`: the Shared folders switch. Folders shared with this computer can be mounted under /hoody/shares with it
 *  off too (made outside the Hub), so the received-share rules always apply; only the words differ: with it off they
 *  name no sharing control, since the Hub shows none. */
function Planner({ c, items, onClose, shares, sharesUi }: PlannerProps & { shares: SharesKnown; sharesUi: boolean }) {
  const t = useStrings(strings);
  const del = useFilesChange('delete');
  const paths = items.map((i) => i.path);
  const reads = usePlanReads(c, paths, true);
  const [sent, setSent] = useState<Sent | null>(null);
  const once = useRef(false);
  const [typedText, setTypedText] = useState('');
  // Read live: a token's capabilities can drop while the dialog is open (the send checks again).
  const canChange = useCanChange();
  const held = useHeldOn(c.id);
  const heldHere = held.filter((h) => h.identity.kind === 'delete' && paths.includes(h.identity.path));
  const allDone = sent?.result?.kind === 'done' && sent.done === items.length;
  useEffect(() => { if (allDone) onClose(); }, [allDone, onClose]);
  // This dialog's own Check again, while it reads: what it answers decides (onCheck). State, not a ref: when the read
  // ends without a proof of its own and the holds went meanwhile, the effect runs again and closes as settled elsewhere.
  const [checking, setChecking] = useState(false);
  // Settled, here or elsewhere: the dialog draws once with no outcome, then closes. Closing unmounts it, and the kit's
  // leave watch moves the last outcome it saw to a "may have gone through" toast: never one already settled.
  const [over, setOver] = useState(false);
  useEffect(() => { if (over) onClose(); }, [over, onClose]);
  // A pending delete settled elsewhere (the held band's Check again): nothing left to say here.
  const settled = sent?.result?.kind === 'pending' && heldHere.length === 0;
  useEffect(() => { if (settled && !checking) setOver(true); }, [settled, checking]);
  // Opened on items whose earlier delete may have gone through (below). When those holds go (proved, proved not made,
  // settled elsewhere) that view draws once more with no outcome before the plan takes its place, for the same reason.
  const heldNow = !sent && heldHere.length > 0;
  const [heldShown, setHeldShown] = useState(false);
  useEffect(() => { setHeldShown(heldNow); }, [heldNow]);

  const title = items.length === 1 ? t('delete.titleOne', { name: displayName(items[0]!.name) }) : t('delete.titleMany', { count: items.length });
  const close = (open: boolean) => { if (!open) onClose(); };
  // Proved deleted, it closes; proved NOT deleted by this read (core's stored release of every shown hold, never the
  // holds merely gone), the frozen plan stays and says it did not go through. It is never
  // sent again from here.
  const onCheck = async () => {
    const proof = { notApplied: false };
    setChecking(true);
    let ok = false;
    try { ok = await readBackShown(del.readBack, heldHere.map((h) => h.hold), proof); } finally { setChecking(false); }
    if (ok) setOver(true);
    else if (proof.notApplied) setSent((x) => (x && x.result?.kind === 'pending' ? { ...x, result: { kind: 'failed' } } : x));
    return ok;
  };

  // Opened on items whose earlier delete may have gone through: that outcome first; no plan, no send. Kept while its own
  // Check again reads (a hold it frees must not swap the view under the read) and until it closes. The outcome shows
  // only while a hold is here: one settled during that read (by the read or elsewhere) leaves nothing unknown to say.
  if (!sent && (heldNow || heldShown || checking || over)) {
    const pending = heldNow && !over;
    return <Dialog isOpen onOpenChange={close} title={title} role="alertdialog" body={t('delete.heldBody')} outcome={pending ? { kind: 'pending' } : undefined} onCheck={onCheck} cancelLabel={t('action.close')} />;
  }

  let view: { lines: readonly string[]; typed: string | null };
  if (sent) view = sent;
  else {
    // Still reading, or a read failed (the shared folders not read whole included): nothing can be judged yet, so
    // nothing can be sent. Check again only reads.
    const sharesFailed = shares !== 'reading' && 'failed' in shares ? shares : null;
    if (reads.failed || sharesFailed || reads.mounts === undefined || !reads.real || shares === 'reading') {
      const retry = reads.failed ? reads.retry : sharesFailed?.retry;
      return (
        <Dialog isOpen onOpenChange={close} title={title} role="alertdialog"
          body={reads.failed ? t('delete.checkFailed') : sharesFailed ? t(sharesFailed.unresolved ? 'delete.sharesUnresolved' : 'delete.sharesFailed') : t('delete.checking')}
          {...(retry ? { primaryLabel: t('action.checkAgain'), onPrimary: retry } : {})}>
          {/* noDetails: a list holding rows it could not read is no rejection; a failed read shows its own details. */}
          {!reads.failed && sharesFailed?.error ? <ErrorDetails error={sharesFailed.error} /> : null}
        </Dialog>
      );
    }
    const real = reads.real;
    const plan = planDelete(items, (p) => real.get(p) ?? p, reads.mounts, 'paths' in shares ? shares.paths : []);
    if (plan.refused) {
      const why = plan.refused === 'root' ? t('delete.root') : plan.refused === 'shareRoot' ? t(sharesUi ? 'delete.shareRoot' : 'delete.shareRootNoUi') : plan.refused === 'mountsUnknown' ? t('delete.mountsUnknown') : t('delete.holdsMount', { name: plan.refused.mount || t('delete.aStorage') });
      return <Dialog isOpen onOpenChange={close} title={title} role="alertdialog" body={why} cancelLabel={t('action.close')} />;
    }
    view = {
      typed: plan.typed,
      lines: [
        plan.received ? t('delete.received') : plan.foreign !== null ? (plan.foreign ? t('delete.inStorage', { name: plan.foreign }) : t('delete.otherDisk')) : t('delete.onComputer', { name: c.name }),
        ...(plan.shared ? [t('delete.shared')] : []),
        ...(plan.protected ? [t('delete.protected')] : []),
        ...(plan.unknownCount ? [t('delete.countUnknown')] : []),
        t('delete.noTrash'),
      ],
    };
  }

  const armed = !sent && canChange && (view.typed === null || typedText === view.typed);
  const run = async () => {
    // Single use: a second press, a retry after a partial run or a re-render never sends this plan again.
    if (once.current || !armed) return;
    once.current = true;
    const frozen = { lines: view.lines, typed: view.typed };
    setSent({ ...frozen, done: 0, running: true, result: null });
    let done = 0;
    let last: Result = null;
    for (const it of items) {
      const r = await del.run({ c, path: it.path, dir: it.dir, size: it.size, modified: it.modified });
      last = { kind: r.outcome, ...(r.code ? { code: r.code } : {}) };
      if (r.outcome !== 'done') break;
      done += 1;
    }
    setSent({ ...frozen, done, running: false, result: last });
  };
  // A run that stopped: the item it stopped at was sent, and its outcome (failed, or may have gone through) is shown
  // below, so it is never counted as not sent; only the items after it never left.
  const stopped = !!sent && !sent.running && sent.done < items.length;
  const unsent = stopped ? items.length - sent.done - 1 : 0;
  const body = (
    <div className={s.planLines}>
      {view.lines.map((l) => <p key={l}>{l}</p>)}
      {stopped && sent.done > 0 ? <p>{t('delete.partial', { done: sent.done, count: items.length })}</p> : null}
      {unsent > 0 ? <p>{t('delete.unsent', { count: unsent })}</p> : null}
      {!sent && !canChange ? <p>{t('changes.off')}</p> : null}
    </div>
  );
  return (
    <ConfirmDialog
      isOpen
      onOpenChange={close}
      title={title}
      tone="danger"
      body={body}
      confirmLabel={t('action.delete')}
      onConfirm={() => void run()}
      confirmDisabled={!armed}
      busy={!!sent?.running}
      outcome={sent?.result && !over ? shownOutcome(sent.result.kind, sent.result.code, t) : undefined}
      onCheck={onCheck}
      {...(sent && !sent.running ? { cancelLabel: t('action.close') } : {})}
      {...(view.typed !== null ? { typed: true } : {})}
    >
      {view.typed !== null ? (
        // Compared exactly: no trimming, so a name with spaces is typed as it is and nothing else arms Delete.
        <TextField label={t('delete.typeToConfirm', { text: view.typed })} value={typedText} onChange={setTypedText} isDisabled={!!sent} mono autoComplete="off" />
      ) : null}
    </ConfirmDialog>
  );
}
