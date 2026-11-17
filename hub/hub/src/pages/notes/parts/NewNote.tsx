// The New note dialog: a title, Create, and the C9 answer inside the dialog where the action was. A note proven to
// exist (created, or found by Check again) ends the dialog: the page opens that note (onCreated); there is no
// "created" screen. Closing and opening belong to THIS dialog while it is on screen: an answer that comes after it
// went (a Check again pressed on its toast, a create answered after the page was left) only has the notes read again,
// so it never closes a newer New note or moves the page. The dialog first draws itself settled (phase done), then
// goes: its pending outcome never moves to a "may have gone through" toast once the note is proven.
// "Check again" only reads (flows.checkNote); a note that may have been added is never sent a second time.
// The hold is the Notes store's (holds.ts), shared with the Board's New page and other tabs: a create is sent only once
// the store confirms this dialog's claim on the computer, never over a hold put there since the dialog opened.
export { notesUrl } from './NewNote.pure';
import { Button, ConfirmDialog, Dialog, IconButton, TextField, formatDateTime, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import type { Api } from '../api';
import { checkNote, createNote, type CreateResult } from '../flows';
import { checkTitle } from '../logic';
import strings from '../strings.en.json';
import type { HeldNote } from '../holds';
import type { Computer, Me, SentNote } from '../types';
import s from './parts.module.css';

export interface NewNoteProps {
  api: Api;
  computer: Computer;
  me: Me;
  place: { parentId: string; section: string };
  /** The create held for this computer, as the store holds it now (an unknown answer from here, the Board or another
   *  tab): check it again, or stop tracking it. It is never sent a second time from here. */
  held?: HeldNote | null;
  /** The held create's send is out right now (its shared record says sending): no Check again, no Stop tracking. */
  sendingOut?: boolean;
  onClose: () => void;
  /** `note` is proven to exist (the create answered created, or Check again read it back) and this dialog is still
   *  the one on screen: the page reads the computer's notes again, closes this dialog and opens the note. Never called
   *  for an unknown outcome, and never once this dialog has gone. */
  onCreated: (note: SentNote) => void;
  /** A note was proven to exist after this dialog had gone: read the computer's notes again, nothing else. */
  onAdded: () => void;
  /** Takes the computer's hold for a new note before its send (true once the store keeps it); false: not sent. The
   *  hold is written before the send, so no way of leaving loses it. */
  onClaim: (sent: SentNote) => Promise<boolean>;
  /** Moves this create's hold from `from` to a new id (the first was taken): true once the store keeps it; false: the
   *  new id is not sent. */
  onMove: (from: string, sent: SentNote) => Promise<boolean>;
  /** This dialog's send of `note` answered unknown: its record stops saying sending; it stays held. */
  onAnswered: (note: string) => void;
  /** This dialog's own create of `note` answered (created, definitely not sent, refused): its hold goes, only while it
   *  is still that note's. */
  onSettle: (note: string) => void;
  /** Check again found `note`, or the person allowed creating again: its hold goes only while it is still that note's
   *  and its send is not out (the store decides, on every rebase). */
  onRelease: (note: string) => void;
}

type Phase =
  | { k: 'idle' }
  | { k: 'sending' }
  | { k: 'checking'; sent: SentNote }
  | { k: 'result'; r: Exclude<CreateResult, { kind: 'created' }> }
  | { k: 'done'; sent: SentNote }
  | { k: 'unsure'; sent: SentNote }
  | { k: 'notClaimed' };

export function NewNote({ api, computer, me, place, held = null, sendingOut = false, onClose, onCreated, onAdded, onClaim, onMove, onAnswered, onSettle, onRelease }: NewNoteProps) {
  const t = useStrings(strings);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(held ? { k: 'unsure', sent: held } : { k: 'idle' });
  // The held record now, for answers that come after a render (Check again's).
  const heldRef = useRef(held);
  heldRef.current = held;
  // On screen: false once this dialog has gone (closed, the page left). Answers that come later check it.
  const here = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => { here.current = false; };
  }, []);
  // A proven note: on screen, the dialog draws itself settled first (done), then hands over to the page, once.
  const proven = (sent: SentNote) => {
    if (here.current) setPhase({ k: 'done', sent });
    else onAdded();
  };
  const created = useRef(onCreated);
  created.current = onCreated;
  const handed = useRef(false);
  useEffect(() => {
    if (phase.k !== 'done' || handed.current) return;
    handed.current = true;
    created.current(phase.sent);
  }, [phase]);

  const create = async () => {
    if (phase.k === 'sending' || phase.k === 'checking') return;
    const c = checkTitle(title);
    if ('err' in c) return setErr(t(`err.${c.err}`));
    setErr(null);
    setPhase({ k: 'sending' });
    // The note this create holds (the one its answer is about; a 409 sends a second), once the store kept it.
    let cur: string | undefined;
    let refused = false;
    // Each note is sent only once the store holds it for this create: the first by a claim (a new create), a second
    // (the id was taken) by moving the hold to it.
    const holdBeforeSend = async (sent: SentNote): Promise<boolean> => {
      if (sent.id === cur) return true;
      const kept = cur !== undefined ? await onMove(cur, sent) : await onClaim(sent);
      if (kept) { cur = sent.id; return true; }
      refused = true;
      // A new id is let go, only while it is this create's (a write kept but not confirmed in time), never a hold
      // another tab put there.
      onSettle(sent.id);
      return false;
    };
    const r = await createNote(api, computer, { nb: me.notebookId, parentId: place.parentId }, c.value, undefined, { hold: holdBeforeSend });
    if (cur !== undefined) {
      if (r.kind === 'unknown') onAnswered(cur);
      else onSettle(cur);
    }
    if (r.kind === 'created') return proven(r.sent);
    setPhase(r.kind === 'notSent' && refused ? { k: 'notClaimed' } : { k: 'result', r });
  };
  const check = async (sent: SentNote): Promise<boolean> => {
    if (phase.k === 'sending' || phase.k === 'checking') return false;
    setPhase({ k: 'checking', sent });
    const m = await checkNote(api, computer, me.notebookId, sent);
    // The store no longer holds this note (stopped or replaced elsewhere): the answer is dropped.
    const h = heldRef.current;
    if (h && h.id !== sent.id) {
      setPhase({ k: 'idle' });
      return false;
    }
    if (m === 'matching') {
      onRelease(sent.id);
      proven(sent);
      return true;
    }
    setPhase({ k: 'unsure', sent });
    return false;
  };
  // The hold was written before the send, so closing (or Back, or a reload) at any moment keeps it.
  const close = (open: boolean) => {
    if (!open) onClose();
  };
  // The explicit way out of a hold whose create never applied: never free, the person says so.
  // The note the warning was opened for: confirming lets go of that note only (never one held in its place since).
  const [warn, setWarn] = useState<string | null>(null);
  // A send that starts elsewhere while the warning is open closes it: there is nothing to stop tracking yet.
  useEffect(() => { if (sendingOut) setWarn(null); }, [sendingOut]);
  const allowAgain = () => {
    const note = warn;
    setWarn(null);
    // Only the note the warning was opened for, while the store still holds it (a hold put in its place since stays).
    if (note === null || sendingOut || (held && held.id !== note)) return;
    onRelease(note);
    setTitle(sentOf?.name ?? held?.name ?? title);
    setPhase({ k: 'idle' });
  };

  // The create shown held: the store's record now (sent here, on the Board or in another tab); an unknown answer the
  // store did not keep is still shown (C9). While this dialog sends, none.
  const unknownSent = phase.k === 'result' && phase.r.kind === 'unknown' ? phase.r.sent : null;
  const sentOf = phase.k === 'sending' || phase.k === 'done' ? null : held ?? unknownSent;
  // The title can be typed while nothing is out: before a send, after one that definitely did not apply, or not kept.
  const editable = phase.k === 'idle' || phase.k === 'notClaimed' || (phase.k === 'result' && phase.r.kind !== 'unknown');

  let outcome: { kind: 'pending' | 'failed' | 'not_sent'; message: string } | undefined;
  if (sentOf) outcome = { kind: 'pending', message: t(sendingOut ? 'new.sendingOut' : phase.k === 'unsure' && phase.sent.id === sentOf.id ? 'new.unsure' : 'new.pending') };
  else if (phase.k === 'notClaimed') outcome = { kind: 'not_sent', message: t('new.notClaimed') };
  else if (phase.k === 'result') {
    const r = phase.r;
    if (r.kind === 'notSent') outcome = { kind: 'not_sent', message: t('new.notSent') };
    else if (r.kind === 'final') outcome = { kind: 'failed', message: t(`new.${r.outcome}`) };
  }

  const body = place.section ? t('new.body', { computer: computer.name, section: place.section }) : t('new.bodyNoSection', { computer: computer.name });

  return (
    <>
    <Dialog
      isOpen
      onOpenChange={close}
      title={t('new.title')}
      body={body}
      // A held create has no primary: its outcome is unknown, so the one thing to do is Check again (in the outcome
      // block); a button that could never be pressed is not drawn.
      {...(sentOf ? {} : { primaryLabel: t('new.create'), onPrimary: () => void create() })}
      primaryDisabled={phase.k === 'sending' || phase.k === 'checking' || phase.k === 'done'}
      busy={phase.k === 'sending' || phase.k === 'done'}
      {...(outcome ? { outcome } : {})}
      {...(sentOf && !sendingOut ? { onCheck: () => check(sentOf), checking: phase.k === 'checking' && phase.sent.id === sentOf.id } : {})}
    >
      {sentOf ? (
        <div className={s.stack}>
          {/* The held create stays where it was typed: the Title field, off, holding the name that is out. */}
          <TextField label={t('new.field')} value={sentOf.name} onChange={() => undefined} isDisabled />
          {/* Short words: the whole one fits no phone dialog as a chip button; its dialog says allow creating again. */}
          <Button variant="secondary" isDisabled={phase.k === 'checking' || sendingOut} onPress={() => setWarn(sentOf.id)}>
            {t('new.allowAgainShort')}
          </Button>
        </div>
      ) : (
        <TextField
          label={t('new.field')}
          value={title}
          onChange={setTitle}
          isDisabled={!editable}
          {...(err ? { errorMessage: err } : {})}
          reserveError
          // A quick note needs no name of its own: the clock inside the field's end names it from the date and time
          // (as New Bot's re-roll). It replaces what is there; only while the title can be typed.
          {...(editable ? { suffix: <IconButton icon="clock" size="sm" label={t('new.quickTitleName')} onPress={() => { setTitle(t('new.quickTitle', { when: formatDateTime(Date.now()) })); setErr(null); }} /> } : {})}
        />
      )}
    </Dialog>
    <ConfirmDialog isOpen={warn !== null} onOpenChange={(o) => { if (!o) setWarn(null); }} title={t('new.allowAgain')} body={t('new.allowAgainBody')} confirmLabel={t('new.allowAgainConfirm')} tone="danger" onConfirm={allowAgain} />
    </>
  );
}
