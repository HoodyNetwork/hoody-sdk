// Script saves core holds (a write whose answer was lost, its outcome not known), each with its Check: shown on the Scripts
// page whatever brought the person here (Home's Needs you, or /scripts on their own), so no hold is left without a way to
// clear it (a Discarded draft's included: its own Check went with it). Check asks the computer what became of the save's op
// and never sends the save again; only its answer frees the hold (data.ts checkHeldWrite). When nothing can answer (the
// computer no longer records the op, the save names none, or the computer does not answer), the person's warned Stop
// tracking (core's dismissHeld) is the way out, as for an unnamed save.
import { OutcomeBanner, showToast, useStrings } from '@kit';
import { useState } from 'react';
import type { HeldWrite, HeldWriteCheck, useHeldWrites } from '../data';
import strings from '../strings.en.json';

// The path inside its folder, as the list names a script (`default/1/a/b.ts` → `a/b.ts`).
type KeptCode = Extract<HeldWriteCheck, { outcome: 'kept' }>['code'];
// After a Check that kept it with nothing left to ask, Stop tracking is offered (in progress and a refused free can still clear).
const STOPPABLE: readonly KeptCode[] = ['NOT_KNOWN', 'NOT_RECORDED', 'NO_OP'];
const shownPath = (path: string): string => path.replace(/^default\/[1-9][0-9]{0,3}\//, '') || path;

export function HeldWrites({ held, computers }: { held: ReturnType<typeof useHeldWrites>; computers: readonly { id: string; name: string }[] }) {
  const t = useStrings(strings);
  const { rows, unnamed, check, dismiss } = held;
  const [checking, setChecking] = useState<string | null>(null);
  // The last Check that kept a hold, by its token: the line says why it is still held.
  const [kept, setKept] = useState<Record<string, KeptCode>>({});
  if (rows.length + unnamed.length === 0) return null;
  const onCheck = (h: HeldWrite) => {
    const id = h.row.hold;
    setChecking(id);
    void check(h).then((r) => {
      setChecking(null);
      const path = shownPath(h.path);
      if (r.outcome === 'kept') { setKept((k) => ({ ...k, [id]: r.code })); return; }
      setKept((k) => { const next = { ...k }; delete next[id]; return next; });
      // The op's own answer says what became of this save. Fenced and refused changed nothing: warn, never an error, nothing
      // to fix here.
      if (r.outcome === 'saved') showToast({ title: t('heldWrite.saved', { path }), body: t('heldWrite.savedBody'), tone: 'ok' });
      else if (r.outcome === 'not_sent') showToast({ title: t('heldWrite.notSent', { path }), body: t('heldWrite.notSentBody'), tone: 'warn' /* noDetails: the computer proved the save never ran; nothing was sent, so there is no rejection */ });
      else showToast({ title: t('heldWrite.refused', { path }), body: t('heldWrite.refusedBody', { code: r.code }), tone: 'warn' /* noDetails: the settle answer is a decided refusal that carries only its code, which the body names (core's Details keep declared codes only) */ });
    });
  };
  return (
    <>
      {rows.map((h) => {
        const path = shownPath(h.path);
        // The computer by the name this page lists it under, never its id; one the list does not hold is left unnamed.
        const name = computers.find((c) => c.id === h.target.container.id)?.name;
        const why = kept[h.row.hold];
        const stoppable = !!why && STOPPABLE.includes(why);
        return (
          <OutcomeBanner
            key={h.row.hold}
            kind="pending"
            title={name ? t('heldWrite.title', { path, computer: name }) : t('heldWrite.titleAny', { path })}
            known={why ? t(`heldWrite.kept.${why}`) : t('heldWrite.known')}
            checkLine={t('heldWrite.checkLine')}
            onCheck={() => onCheck(h)}
            checking={checking === h.row.hold}
            {...(stoppable ? { stopLine: t('heldWrite.stop'), onDismiss: () => void dismiss(h.row) } : {})}
            /* noDetails: an unknown outcome, not a rejection; the line says why the save is still held */
          />
        );
      })}
      {unnamed.map((row) => (
        <OutcomeBanner
          key={row.hold}
          kind="pending"
          title={t('heldWrite.unnamedTitle')}
          known={t('heldWrite.unnamedKnown')}
          stopLine={t('heldWrite.stop')}
          onDismiss={() => void dismiss(row)}
          /* noDetails: an unknown outcome, not a rejection; it names no script, so only Stop tracking (asked first) frees it */
        />
      ))}
    </>
  );
}
