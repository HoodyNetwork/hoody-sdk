// Add a program › Notes › New page: a page created in the computer's Notes, then added as its page
// tile. The create is the Notes page's own (createNote/checkNote, through notes/links): its id is held in the Notes
// page's store before the send (notes/holds.ts: a claim, so two tabs never both send for one computer), so an answer
// that may have gone through is offered Check again here and on the Notes page alike (a read only), and is never sent
// a second time. The store is the one source of what is held: this step never shows a create the store does not hold. The place is where Notes' New note puts
// a page (its recent list's create place). One kit Form: the field says where the page goes (or why it cannot), and
// the footer's primary is Create and add, Check again while a create is held (C9), or Try again when Notes gave no place.
import { Button, ConfirmDialog, Form, FormFooter, TextField, useHiddenNow, type OutcomeLike } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkNote, checkTitle, createNote, newId, useInFlight, useNotesApi, useNotesKept, type CreateResult, type NotesComputer, type NotesLoaded, type SentNote } from '../../notes/links';
import type { BoardComputer } from '../computers';
import { useT } from './text';

// The last thing this step did. `id`: the note it was about; shown only while the store holds that same note.
type Phase =
  | { k: 'idle' }
  | { k: 'sending' }
  | { k: 'checking'; id: string }
  | { k: 'unsure'; id: string }
  | { k: 'notClaimed' }
  | { k: 'result'; r: Exclude<CreateResult, { kind: 'created' } | { kind: 'unknown' }> };

/** A Board computer as the Notes page reads it (its Notes is asked only while it runs). */
const notesComputer = (c: BoardComputer): NotesComputer => ({ id: c.id, projectId: c.project_id, name: c.name, ...(c.server_name ? { serverName: c.server_name } : {}), state: 'running' });

export interface NotesNewProps {
  computer: BoardComputer;
  /** The page is there (created, or found by Check again): add its page tile. */
  onAdd: (userId: string, nodeId: string, title: string) => void;
  onBack: () => void;
  /** The picker's form focus rule (its field when the step opens). */
  formRef: (el: HTMLFormElement | null) => void;
}

export function NotesNew({ computer, onAdd, onBack, formRef }: NotesNewProps) {
  const t = useT();
  const api = useNotesApi();
  const { store, storeRef, release, settle, claim, move, answered } = useNotesKept();
  const c = notesComputer(computer);
  // undefined while Notes is read; null when that read was dropped or threw.
  const [loaded, setLoaded] = useState<NotesLoaded | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  // The held note Stop tracking was pressed for (the one the person saw), while its warning is open.
  const [warn, setWarn] = useState<string | null>(null);
  // Mounted: an answer that comes after the step is gone adds no tile and sets nothing here; the store alone settles.
  // A Board kept loaded on another page stops this step's effects while it is hidden (alive false) without the step
  // being gone: an answer that settles then lands when it shows again (as SshForm's), one whose step unloaded is dropped.
  const alive = useRef(true);
  const late = useRef<Array<() => void>>([]);
  const hiddenNow = useHiddenNow();
  useEffect(() => {
    alive.current = true;
    for (const land of late.current.splice(0)) land();
    return () => { alive.current = false; };
  }, []);
  const gone = () => !alive.current && !hiddenNow();
  // A shown step lands an answer at once, as it always has. A queued one is asked again when it lands, since the store
  // may have moved on while the Board was hidden: it lands only for the newest create or Check again (`mine`), and only
  // while the store holds no other note for the computer (`holds`). With another tab's hold there it adds no tile and
  // sets the step back to idle, so the step shows that hold with its own Check again and Stop tracking.
  const settled = (land: () => void, mine: () => boolean, holds: () => boolean = () => true) => {
    if (alive.current) land();
    else if (hiddenNow()) late.current.push(() => { if (mine()) { if (holds()) land(); else setPhase({ k: 'idle' }); } });
  };
  // Each create's and each Check again's number: only the newest may act on its answer.
  const creates = useRef(0);
  const checks = useRef(0);
  /** The store holds no other note for this computer than `id` (its own release included). */
  const holdsOnly = (id: string) => { const h = storeRef.current.holds[computer.id]; return !h || h.id === id; };

  // The Notes api and computer whose read has answered: a kept Board shown again does not read once more (its effect
  // runs again); a read the hide cut off (its answer dropped) does.
  const readOf = useRef<{ api: unknown; computer: string } | null>(null);
  // The read out now: a newer one (Try again, a show after a cut read, another computer) cuts it, so only the newest
  // answer is kept.
  const cutRead = useRef<(() => void) | null>(null);
  const read = useCallback(() => {
    cutRead.current?.();
    let live = true;
    cutRead.current = () => { live = false; };
    readOf.current = null;
    setLoaded(undefined);
    const done = (l: NotesLoaded | null) => { if (!live) return; readOf.current = { api, computer: computer.id }; setLoaded(l); };
    void api.load(c).then(done, () => done(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one read per computer (and per Try again)
  }, [api, computer.id]);
  useEffect(() => (readOf.current?.api === api && readOf.current.computer === computer.id ? undefined : read()), [read, api, computer.id]);
  // A hide or an unload cuts any read still out, Try again's included: one cut before it answered runs again on return.
  useEffect(() => () => cutRead.current?.(), []);
  // The field is off while Notes is read: once it opens, it takes the focus the step had (the row pressed, then gone).
  const form = useRef<HTMLFormElement | null>(null);
  const setForm = useCallback((el: HTMLFormElement | null) => { form.current = el; formRef(el); }, [formRef]);

  const ok = loaded?.state === 'ok' && loaded.recent.create ? { me: loaded.me, place: loaded.recent.create } : null;
  // Why there is no place, in the Notes page's words (null while reading, or when there is one).
  const why = loaded === undefined || ok ? null : loaded === null || loaded.state === 'loading' ? 'cantTell' : loaded.state === 'ok' ? 'noPlace' : loaded.state;
  // The create held for this computer, as the store holds it now (sent here, on the Notes page, or in another tab).
  const held = store.holds[computer.id] ?? null;
  const sending = phase.k === 'sending';
  const checking = phase.k === 'checking' && phase.id === held?.id;
  // Its send is out now (here, or in another picker or tab, by the shared record): nothing to check or stop yet.
  const out = useInFlight(held);
  const locked = sending || out;

  const create = async () => {
    if (!ok || held || phase.k === 'sending' || phase.k === 'checking') return;
    const v = checkTitle(title);
    if ('err' in v) return setErr(t('picker.notesNew.err.' + v.err));
    setErr(null);
    setPhase({ k: 'sending' });
    // The id is picked before the claim, so the store holds the very note that is sent (createNote's own pick).
    const first: SentNote = { id: newId(Date.now(), crypto.getRandomValues(new Uint8Array(5))), parentId: ok.place.parentId, name: v.value };
    const mine = ++creates.current;
    const newest = () => mine === creates.current;
    if (!(await claim(computer.id, first)) || gone()) {
      // Not won (another tab holds one, the prefs are not open, or the store did not keep it), or the step is gone:
      // nothing is sent. Only this note's claim is let go, never a hold another tab put there.
      settle(computer.id, first.id);
      settled(() => setPhase({ k: 'notClaimed' }), newest);
      return;
    }
    let cur = first.id, picked = 0, moveRefused = false;
    const env = { newId: () => (picked++ === 0 ? first.id : newId(Date.now(), crypto.getRandomValues(new Uint8Array(5)))) };
    // createNote holds each note before its send: the first is the claimed one; a second (the id was taken) is sent
    // only once the store holds it in place of the first, else not at all.
    const holdBeforeSend = async (sent: SentNote) => {
      if (sent.id === cur) return true;
      if (!(await move(computer.id, cur, sent))) {
        // Refused, or its write was kept but not confirmed in time: the new id is let go too, only while it is ours.
        settle(computer.id, sent.id);
        return !(moveRefused = true);
      }
      cur = sent.id;
      return true;
    };
    const r = await createNote(api, c, { nb: ok.me.notebookId, parentId: ok.place.parentId }, v.value, env, { hold: holdBeforeSend });
    // Settled through the store only, and only for the note this step sent: an answer after the step is gone still
    // lets go of a create that is there (Notes lists it) or that never applied; an unknown one stays held for Check
    // again, no longer marked sending.
    if (r.kind === 'unknown') answered(computer.id, cur);
    else settle(computer.id, cur);
    settled(() => {
      if (r.kind === 'created') return onAdd(ok.me.userId, r.sent.id, r.sent.name);
      setPhase(r.kind === 'unknown' ? { k: 'idle' } : moveRefused ? { k: 'notClaimed' } : { k: 'result', r });
    }, newest, () => holdsOnly(cur));
  };
  const check = async () => {
    if (!ok || !held || locked || checking) return;
    const sent = held;
    const n = ++checks.current;
    setPhase({ k: 'checking', id: sent.id });
    const found = await checkNote(api, c, ok.me.notebookId, sent);
    // A newer check started, or the store no longer holds this note (stopped or replaced elsewhere): drop the answer.
    if (n !== checks.current) return;
    if (storeRef.current.holds[computer.id]?.id !== sent.id) {
      settled(() => setPhase({ k: 'idle' }), () => n === checks.current);
      return;
    }
    if (found === 'matching') release(computer.id, sent.id);
    settled(() => {
      if (found === 'matching') return onAdd(ok.me.userId, sent.id, sent.name);
      setPhase({ k: 'unsure', id: sent.id });
    }, () => n === checks.current, () => holdsOnly(sent.id));
  };
  // The explicit way out of a hold whose create never applied: never free, the person says so. Only the note they
  // were warned about is let go; a hold another tab put there since stays.
  // A send that starts (here or elsewhere) while the warning is open closes it.
  useEffect(() => { if (locked) setWarn(null); }, [locked]);
  const dismiss = () => {
    const id = warn;
    setWarn(null);
    if (!id || held?.id !== id) return;
    // Conditional in the store itself (that note, its send not out), read again on every rebase.
    release(computer.id, id);
    setTitle(held.name);
    setPhase({ k: 'idle' });
  };

  const open = !!ok && !held && !locked;
  useEffect(() => {
    const on = document.activeElement;
    if (open && (on === null || on === document.body || form.current?.contains(on))) form.current?.querySelector('input')?.focus();
  }, [open]);

  let outcome: OutcomeLike | null = null;
  // While the send is out there is no outcome yet (pending would offer Check again before the send has answered).
  if (held && !sending) outcome = { kind: 'pending', message: t(out ? 'picker.notesNew.sendingElsewhere' : phase.k === 'unsure' && phase.id === held.id ? 'picker.notesNew.unsure' : 'picker.notesNew.pending') };
  else if (held || sending) outcome = null;
  else if (phase.k === 'notClaimed') outcome = { kind: 'not_sent', message: t('picker.notesNew.notClaimed') };
  else if (phase.k === 'result' && phase.r.kind === 'notSent') outcome = { kind: 'not_sent', message: t('picker.notesNew.notSent') };
  else if (phase.k === 'result' && phase.r.kind === 'final') outcome = { kind: 'failed', message: t('picker.notesNew.final.' + phase.r.outcome) };

  const where = ok
    ? ok.place.section ? t('picker.notesNew.body', { computer: computer.name, section: ok.place.section }) : t('picker.notesNew.bodyNoSection', { computer: computer.name })
    : why ? t('picker.notesNew.state.' + why) : t('picker.notesNew.reading');

  return (
    <>
      <Form ref={setForm} onSubmit={() => { if (ok) void create(); else if (why) read(); }} busy={sending} outcome={outcome} {...(held && !locked ? { onCheck: check } : {})}>
        <TextField
          label={t('picker.notesNew.field')}
          value={held ? held.name : title}
          onChange={setTitle}
          isDisabled={!ok || !!held || locked}
          description={where}
          {...(err ? { errorMessage: err } : {})}
        />
        {held && (
          <Button variant="secondary" isDisabled={locked || checking} onPress={() => setWarn(held.id)}>
            {t('picker.notesNew.dismiss')}
          </Button>
        )}
        <FormFooter
          dirty
          requireDirty={false}
          submitLabel={ok ? t('picker.notesNew.create') : t('picker.notesNew.tryAgain')}
          busyLabel={t('picker.notesNew.creating')}
          submitDisabled={loaded === undefined}
          onCancel={onBack}
          checking={checking}
          // The hold is in the Notes store: this step, the Notes page and a reopened picker offer Check again; no toast.
          toastOnLeave={false}
        />
      </Form>
      <ConfirmDialog overlayId="board-notes-new-dismiss" isOpen={warn !== null} onOpenChange={(o) => { if (!o) setWarn(null); }} title={t('picker.notesNew.dismissTitle')} body={t('picker.notesNew.dismissBody')} confirmLabel={t('picker.notesNew.dismissConfirm')} tone="danger" onConfirm={dismiss} />
    </>
  );
}
