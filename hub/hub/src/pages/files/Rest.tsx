// Copy the rest of a held folder copy found part made.
//
// Opened from the held band (changes.tsx HeldTransfer) while the compare of both trees finds items missing. Opening
// reads again (the copy's Check again: reads only, never sends), since the first copy may have gone on: whole by now,
// it is proved made and nothing is sent. Otherwise the plan is taken once from that compare (several.ts planRest,
// capRest): the missing items, each to its own place in the copy (a missing folder once, as a folder copy walked
// first), and the different ones, listed and never touched (Merge is not here). The several-items dialog then runs it
// (Several.tsx `rest`): the press lets only this held copy go, then sends each item create-only, one at a time.
// After the run the copy is read again; only a compare that finds it whole closes the dialog. Items still missing
// (more than one press takes, or made missing since) get the next press here: the hold is gone by then, so the band no
// longer offers it. That press reads again and takes a new plan from that read (a new round of the dialog).
import { useStrings } from '@kit';
import { useEffect, useState } from 'react';
import { readBackShown, rereadCopy, useCopyCheck, useFilesChange, useFolder, useHeldOn, type ChangeIdentity, type FilesComputer } from './data';
import { displayName, parentOf, partsOf } from './logic';
import { capRest, planRest } from './several';
import { SeveralDialog, type RestPlan } from './Several';
import strings from './Transfer.strings.en.json';

export function RestDialog({ c, id, onClose }: { c: FilesComputer; id: ChangeIdentity; onClose: () => void }) {
  const t = useStrings(strings);
  const copy = useFilesChange('copy');
  const dest = id.dest ?? '';
  const from = useFolder(c, parentOf(id.path), true);
  const to = useFolder(c, parentOf(dest), true);
  const listed = (l: typeof from, path: string) => !!l.data && !l.isError && l.data.entries.some((e) => e.name === (partsOf(path).at(-1) ?? '') && e.dir);
  const both = listed(from, id.path) && listed(to, dest);
  // Either end read and not a folder there (gone, or replaced): nothing can be compared.
  const gone = (!!from.data && !from.isError && !listed(from, id.path)) || (!!to.data && !to.isError && !listed(to, dest)) || from.isError || to.isError;
  const { walk, compare } = useCopyCheck(c, id.path, dest, both);

  // Read again once, on opening (reads only); a later round reads the copy again (nothing of it is held by then).
  // The first read judges only the held copy this dialog was opened on (its own send), never another copy held here.
  const held = useHeldOn(c.id);
  const shownHold = held.find((h) => h.identity.kind === 'copy' && (id.op ? h.identity.op === id.op : h.identity.path === id.path && h.identity.dest === id.dest));
  const [round, setRound] = useState(0);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let live = true;
    void (round === 0 ? readBackShown(copy.readBack, shownHold ? [shownHold.hold] : []) : rereadCopy()).finally(() => { if (live) setFresh(true); });
    return () => { live = false; };
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  // The plan is taken once, from the first compare read after opening; later reads change only the words after the run.
  const [plan, setPlan] = useState<Pick<RestPlan, 'held' | 'rows' | 'more' | 'different'> | null>(null);
  const dirs = walk.state === 'done' ? walk.dirs : null;
  useEffect(() => {
    if (plan || !fresh || !dirs || compare?.state !== 'differs') return;
    const cut = capRest(planRest(id.path, dest, compare.missing, new Set(dirs)));
    setPlan({ held: id, rows: cut.rows, more: cut.more, different: compare.different });
  }, [plan, fresh, dirs, compare, id, dest]);

  // After the run: the copy read again (reads only; nothing may be held by then), then what the compare finds says
  // whether it is whole now.
  const [afterRead, setAfterRead] = useState<'none' | 'reading' | 'done'>('none');
  const runEnded = () => { setAfterRead('reading'); void rereadCopy().finally(() => setAfterRead('done')); };
  const again = () => { setPlan(null); setAfterRead('none'); setFresh(false); setRound((r) => r + 1); };

  const destWords = displayName(dest);
  // After the run: what the read since finds. Still reading: says so. Neither whole nor a count: says it can't tell.
  const afterDone = !!plan && afterRead === 'done';
  const afterFailed = gone || compare?.state === 'failed' || walk.state === 'failed' || walk.state === 'refused';
  const after = !plan || afterRead === 'none' ? null
    : !afterDone ? t('rest.checking', { dest: destWords })
    : compare?.state === 'equal' ? t('rest.afterWhole', { dest: destWords })
    : compare?.state === 'differs' ? t('rest.afterPart', { count: compare.count, dest: destWords })
    : compare?.state === 'unchecked' ? t('rest.afterUnchecked')
    : afterFailed ? t('rest.afterFailed', { dest: destWords })
    : t('rest.checking', { dest: destWords });
  const whole = afterDone && compare?.state === 'equal';
  // The next press: only from a read since that still finds items missing.
  const more = afterDone && compare?.state === 'differs' && compare.missing.length > 0;
  // Before the plan: what the check found so far. Whole, or nothing it can tell: final (Close only).
  const final = !plan && (compare?.state === 'equal' || compare?.state === 'unchecked' || gone || compare?.state === 'failed' || walk.state === 'failed' || walk.state === 'refused');
  const note = plan ? null : compare?.state === 'equal' ? t('rest.whole', { dest: destWords })
    : compare?.state === 'unchecked' ? t('rest.unchecked')
    : final ? t('rest.failed', { dest: destWords })
    : t('rest.checking', { dest: destWords });
  const rest: RestPlan = plan ? { ...plan, after, whole, ...(more ? { again } : {}), note: null, final: false } : { held: id, rows: null, more: 0, different: [], after: null, whole: false, note, final };
  // One dialog throughout a round (the several-items one), so focus and the person's place stay while the check ends;
  // the next press starts a new round, its own run.
  return <SeveralDialog key={round} kind="copy" c={c} items={plan?.rows?.map((r) => r.item) ?? []} destFolder={dest} rest={rest} onRunEnd={runEnded} onClose={onClose} />;
}
