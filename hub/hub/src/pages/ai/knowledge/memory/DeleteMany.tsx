// Delete selected: the records picked on the shown page of one store (memories, lessons or observations; a slot
// deletes one at a time, by name) go in one DELETE /memory/items with their ids, behind a question. It is sent once
// (C9): a lost or unknown answer (a 2xx without status ok and a deleted count, or any 5xx: the agent deletes in chunks
// of 500 ids, and a chunk that fails after an earlier one committed leaves some deleted and the rest unknown) is held,
// this store's only, until Check again reads every record back and all of them are gone from a realm the agent still
// serves (manyProved), or the person presses Stop tracking. A Check again that finds only some gone says how many and
// keeps the hold. Nothing is sent again and nothing settles without a press. The question, the answer shown and the
// Stop tracking question belong to the store (and the hold) they were opened for: a move to another store closes them.
// Every delete of the page shares one lock and one key per store (data.ts MEMORY_DELETE_LOCK), so core admission
// refuses a second delete of the store from any tab while one is out or held; the page also waits, and says why,
// while a delete of one record of the store is out or held (and while one an older build held under a key per record
// is, which admission does not see).
import { Band, Button, ConfirmDialog, Outcome, useStrings } from '@kit';
import { refusal } from '@core';
import { useState, type ReactNode } from 'react';
import { type MemoryAt, storeKey, useDeleteMany, useMemoryStatus, useRecordDeleteIn } from './data';
import { Held } from './Detail';
import { manyProved, type ItemRow, type Kind } from './logic';
import strings from './Memory.strings.en.json';

/** The list's Delete selected (its bulk action and question) and its toolbar notice (a held delete, or the answer).
 *  `on` false offers nothing; `onDone` runs once the agent answered the delete (the page clears the selection). */
export function useDeleteSelected(at: MemoryAt, project: string, kind: Kind, on: boolean, onDone: () => void): { bulkActions: ((rows: ItemRow[]) => ReactNode) | undefined; notice: ReactNode } {
  const t = useStrings(strings);
  const { runner, ids, records } = useDeleteMany(at, project, kind);
  const status = useMemoryStatus(at, project);
  const oneOut = useRecordDeleteIn(at, project, kind);
  const key = storeKey(at, project, kind);
  const pending = runner.outcome?.kind === 'pending';
  // The ids the question asks about and the store it was asked in, taken at the press: the selection, or the store
  // shown, may change behind the open question.
  const [asking, setAsking] = useState<{ key: string; ids: string[] } | null>(null);
  // A move to another store drops the question (a return does not reopen it).
  const [askedIn, setAskedIn] = useState(key);
  if (askedIn !== key) {
    setAskedIn(key);
    setAsking(null);
  }
  // Records a Check again found gone, for the hold it read (its token): a later hold never shows an earlier count.
  const [gone, setGone] = useState<{ hold: string; n: number } | null>(null);
  // The store whose delete was last answered here, and the store whose held delete Check again proved: an answer is
  // shown in its own store only.
  const [sentIn, setSentIn] = useState<string | null>(null);
  const [provedIn, setProvedIn] = useState<string | null>(null);
  // A hold seen in this store (this tab's lost answer, or another tab's delete) ends any earlier answer or proof shown
  // here: once it is proved or ended, an earlier "Deleted" never shows again as if it were this one's.
  if (pending && (sentIn !== null || provedIn !== null)) {
    setSentIn(null);
    setProvedIn(null);
  }
  const check = async (): Promise<boolean> => {
    const hold = runner.hold;
    let counted = 0;
    const ok = await runner.prove(async () => {
      const [reads, st] = await Promise.all([Promise.all(records.map((r) => r.refetch())), status.refetch()]);
      const r = manyProved(reads.map((x) => ({ ok: x.isSuccess, error: x.error ? { kind: x.error.kind, code: x.error.code } : null })), { ok: st.isSuccess });
      counted = r.gone;
      return r.all && reads.length === ids.length;
    });
    if (ok) setProvedIn(key);
    else if (hold) setGone({ hold, n: counted });
    return ok;
  };
  const send = async (picked: string[]) => {
    setProvedIn(null);
    setGone(null);
    setSentIn(key);
    const r = await runner.run({ ...at, project, kind, ids: picked });
    if (r.outcome === 'done') onDone();
  };
  const blocked = runner.busy || pending || oneOut;
  const bulkActions = on
    ? (rows: ItemRow[]) => (
      <Button size="sm" icon="trash" busy={runner.busy} isDisabled={blocked || rows.length === 0} onPress={() => setAsking({ key, ids: rows.map((r) => r.id) })}>
        {t('many.go')}
      </Button>
    )
    : undefined;
  const shownGone = gone !== null && gone.hold === runner.hold ? gone.n : null;
  const heldText = runner.elsewhere
    ? t('many.heldElsewhere')
    : shownGone !== null && shownGone > 0 ? t('many.heldPart', { gone: shownGone, count: ids.length }) : t('many.held', { count: ids.length });
  const question = asking !== null && asking.key === key ? asking : null;
  const notice = (
    <>
      {/* Keyed by the hold it shows: a Stop tracking question opened for one hold closes when another is shown. */}
      {pending && <Held key={runner.hold ?? key} text={heldText} readOnly={runner.elsewhere !== null} onCheck={check} onDismiss={runner.dismiss} dismissBody={t('many.dismissBody')} />}
      {runner.outcome && !pending && sentIn === key && provedIn !== key && <Outcome outcome={runner.outcome} doneText={t('del.done')} error={refusal(runner.outcome)} />}
      {on && oneOut && !pending && !runner.busy && <Band tone="neutral" size="table" /* noDetails: waiting for another delete, nothing refused */>{t('many.waits')}</Band>}
      {provedIn === key && !pending && <Outcome outcome={{ kind: 'done' }} doneText={t('del.done')} /* noDetails: a proved delete, not a rejection */ />}
      <ConfirmDialog
        overlayId="ai-memory-delete-many"
        isOpen={on && question !== null}
        onOpenChange={(o) => { if (!o) setAsking(null); }}
        title={t('many.title', { count: question?.ids.length ?? 0 })}
        body={t('del.body')}
        confirmLabel={t('del.go')}
        tone="danger"
        onConfirm={() => {
          const picked = asking;
          setAsking(null);
          // Confirmed only in the store it was asked in, and never while a delete of this store is held or answering.
          if (!on || !picked || picked.key !== key || picked.ids.length === 0 || blocked) return;
          void send(picked.ids);
        }}
      />
    </>
  );
  return { bulkActions, notice };
}
