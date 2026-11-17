// Change shell: a live terminal tile's menu opens this dialog for its session.
//
// Contract, in plain words:
//   - On open it reads the computer's sessions, to say what terminal-N runs now (shell or ssh), to name the shell the
//     ending may end (its incarnation), and to tell a read back after an unknown outcome "the same shell" from "a new
//     one". It reads again whenever the kept change of terminal-N settles on a shell that is gone (shellChanges'
//     read generation), in every dialog showing it. The read failing hides nothing: the change is still offered,
//     and the change reads again.
//   - A program's own terminal (the read lists it as one) has no shell to change: the dialog says so, no action.
//   - The change ends terminal-N (everything running in it stops, its screen starts empty), then starts it on the
//     chosen shell (one of BOARD_SHELLS; the current one is not offered), then reloads the tile's frame and closes.
//   - The ending names the shell of the last read (shellChange endSession: DELETE ?incarnation=). With no shell
//     known it reads again first: terminal-N not listed → only the start; listed without a running shell, or already
//     running the chosen shell → nothing is sent; the read failing → nothing is sent. A terminal-N started again
//     since the read answers "replaced": nothing ended, it keeps what it runs, and every dialog on it reads again so
//     the next change names the shell there now, never the old one.
//   - One record per change, per computer and session, in shellChanges (its commit is the only writer; a render
//     only reads it). A press keeps it before the first read or send leaves; it holds the chosen shell and the shell
//     the ending names, and is owned by the opening that made it, from that opening's mount effect to its cleanup.
//     Only the owner sends, and only the two sends below (endStep, startStep). After every wait the answer applies
//     only while its own record is still the kept one, and is recorded even when the opening has gone. A record
//     still reading (nothing sent) is dropped by its owner's cleanup, never by another opening; a record that has
//     sent stays until an answer, a read back or a warned Dismiss settles it. Another opening shows it (busy while
//     it reads, unknown once sent) and is told when it settles; to send, it keeps a new record of its own.
//   - C9: each send goes once. An ending or a start whose outcome is unknown locks the action ("may have gone
//     through"); Check again reads the sessions back (shellChange afterEnd / afterStart) and only records what it
//     finds: it never sends, in the dialog or from the sticky notice after a close. A definite refusal or a send
//     that never left shows why and gives the action back: after the ending went through, the action only starts
//     the shell (it never ends terminal-N twice). A Start again refused, or one that could not leave, keeps the
//     first start unknown.
//   - A read back proves enough: terminal-N gone or another shell there after an ending (the ending names the old
//     shell, so landing late it ends nothing: the start may go ahead, on a press), the chosen shell running (or
//     ended) after a start, someone else's terminal-N. A read showing the same shell after an unknown ending proves
//     nothing (the ending may still land): it stays locked. After an unknown start, a read showing nothing there
//     keeps the outcome unknown (the first start may still land) and offers Start again beside Check again: a
//     second start is safe because every create is exclusive (shellChange createSession): whichever lands second
//     is refused, changes nothing, and is read back.
//   - A start the terminal answers "already there" is read back under its record: the chosen shell running counts
//     as done (an earlier start of ours went through), another session is someone else's terminal-N, kept as it is.
//     That read failing, or finding nothing listed, proves nothing: the start stays unknown (nothing listed also
//     offers Start again), never failed.
//   - An unknown outcome is freed only by a read that proves it, or by the person's warned Dismiss (the terminal
//     may already be running the new shell, or have ended).
//   - Closing while an outcome is unknown moves it to the kit's sticky notice (Dialog), with the same Check again.
import { BOARD_SHELLS, outcomeOf } from '@core';
import { Button, ConfirmDialog, Dialog, RadioGroup, Row, showToast, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { readSessions, type TermSession } from '../termSessions';
import { afterEnd, afterStart, endSession, replaced, startShell, started, type ShellAt, type ShellTarget } from './shellChange';
import { commit, current, disown, generation, own, owns, reserve, useShellChange, type Held, type Phase } from './shellChanges';
import { useT } from './text';

export { resetShellChanges } from './shellChanges';

export interface ShellDialogProps {
  target: ShellTarget | null;
  onClose: () => void;
  /** terminal-N on that computer changed (the new shell runs, or someone else's is there): reload the frames that
   *  still show it. Named by computer and session, never by slot: a check after a close may come long after. */
  onChanged: (at: ShellAt) => void;
}

const keyOf = (x: ShellTarget | null) => (x ? x.computer.id + '/' + x.session : '');
const codeOf = (e: unknown): string | undefined => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown; status?: unknown }) : null;
  return typeof c?.code === 'string' ? c.code : typeof c?.status === 'number' ? String(c.status) : undefined;
};
// A send this opening did not make (another dialog, or an earlier opening) shows as unknown here.
const shown = (p: Phase): Phase => (p === 'ending' ? 'endUnknown' : p === 'starting' ? 'startUnknown' : p);
const inFlight = (p: Phase) => p === 'reading' || p === 'ending' || p === 'starting';

// What a read found for a key at a read generation: undefined while reading, null when it failed or lists none.
interface Read { readonly k: string; readonly g: number; readonly before: TermSession | null }
// A line said about one kept record of one key (none: about no record); it goes when the record changes.
interface Note { readonly k: string; readonly on: Held | undefined; readonly o: OutcomeLike }

export function ShellDialog({ target, onClose, onChanged }: ShellDialogProps) {
  const t = useT();
  const key = keyOf(target);
  const { rec, gen } = useShellChange(key);
  const [read, setRead] = useState<Read | null>(null);
  const readNow = useRef<Read | null>(null);
  const put = (r: Read) => { readNow.current = r; setRead(r); };
  const [pick, setPick] = useState<{ k: string; s: string } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [asked, setAsked] = useState<{ k: string; h: Held } | null>(null);
  // The opening shown now: minted by the mount effect (a new key is a new opening), ended by its cleanup.
  const opening = useRef<{ tok: object; k: string } | null>(null);
  const [tok, setTok] = useState<object | null>(null);
  useEffect(() => {
    const me = { tok: {}, k: key };
    own(me.tok);
    opening.current = me;
    setTok(me.tok);
    return () => {
      if (opening.current === me) opening.current = null;
      disown(me.tok);
    };
  }, [key]);

  useEffect(() => {
    if (!target) return;
    const ac = new AbortController();
    const at = { k: key, g: gen };
    readSessions(target.computer, ac.signal).then(
      (rows) => { if (!ac.signal.aborted) put({ ...at, before: rows.find((s) => s.n === target.session) ?? null }); },
      () => { if (!ac.signal.aborted) put({ ...at, before: null }); },
    );
    return () => ac.abort();
    // The key names the target; the object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gen]);

  if (!target) return <Dialog isOpen={false} onOpenChange={() => undefined} title="" />;
  const n = target.session;
  const who: ShellAt = { computer: target.computer.id, session: n };
  const mine = !!rec?.owner && rec.owner === tok;
  const phase: Phase = !rec ? 'choose' : rec.phase === 'reading' || mine ? rec.phase : shown(rec.phase);
  const retry = !!rec?.retry;
  // A kept change keeps the facts read before it began; otherwise the read of this key at its generation.
  const before = rec ? rec.before : read && read.k === key && read.g === gen ? read.before : undefined;
  const shell = rec ? rec.shell : pick?.k === key ? pick.s : undefined;
  const programs = before?.offered === false;
  const now = before ? (before.ssh ? t('shell.nowSsh', { to: before.ssh }) : before.shell) : null;
  const choices = BOARD_SHELLS.filter((s) => !before || before.ssh || s !== before.shell);
  const chosen = shell && choices.includes(shell) ? shell : undefined;
  const unknownLine = (h: Held): OutcomeLike =>
    ({ kind: 'pending', message: t(h.retry ? 'shell.startDidNot' : shown(h.phase) === 'endUnknown' ? 'shell.endUnknown' : 'shell.startUnknown', { name: target.name }) });
  const unknown = phase === 'endUnknown' || phase === 'startUnknown';
  const outcome = note && note.k === key && note.on === rec ? note.o : rec && unknown ? unknownLine(rec) : undefined;

  // The opening still showing k (what a check may close), and the line it says about a record of k.
  const here = (k: string) => opening.current?.k === k;
  const say = (k: string, on: Held | undefined, kind: OutcomeLike['kind'], msg: string, vars: Record<string, string> = {}) =>
    setNote({ k, on, o: { kind, message: t(msg, { name: target.name, code: '', ...vars }) } });
  const finish = (sh: string, close: boolean) => {
    onChanged(who);
    showToast({ title: t('shell.done', { name: target.name, shell: sh }) });
    if (close) onClose();
  };
  // Someone else's terminal-N (a start answered "already there", an ending answered "replaced", or a read back): it
  // keeps what it runs, and the shell read before is gone, so every dialog on it reads again.
  const reopened = (k: string, h: Held, msg = 'shell.reopened') => {
    if (!commit(k, h, null, true)) return;
    say(k, undefined, 'failed', msg);
    onChanged(who);
  };
  // The two sends: only for a record whose opening is still mounted (undefined: nothing left).
  const endStep = (h: Held, inc: string) => (owns(h) ? endSession(target.computer, n, inc) : undefined);
  const startStep = (h: Held, sh: string) => (owns(h) ? startShell(target.computer, n, sh) : undefined);

  const start = async (k: string, me: object, sh: string, b: TermSession | null, over: boolean) => {
    const h: Held = { phase: 'starting', before: b, shell: sh, owner: me, ...(over ? { over } : {}) };
    const prev = reserve(k, h);
    if (prev === null) return;
    setNote(null);
    const p = startStep(h, sh);
    // It could not leave: what it was kept over stays as it was (an unknown start stays unknown).
    if (!p) { commit(k, h, prev ?? null); return; }
    let answer: unknown;
    // The answer replaces only this send's own record, and is recorded even when the opening has gone.
    try { answer = await p; } catch (e) {
      const kind = outcomeOf(e, true);
      if (kind === 'pending') { commit(k, h, { phase: 'startUnknown', before: b, shell: sh }); return; }
      if (over) {
        // A Start again that did not go through: the first start may still land, so it stays unknown.
        const next: Held = { phase: 'startUnknown', before: b, shell: sh, retry: true };
        if (commit(k, h, next)) say(k, next, 'pending', 'shell.startAgainNot', { code: codeOf(e) ?? '' });
        return;
      }
      const next: Held = { phase: 'start', before: b, shell: sh };
      if (commit(k, h, next)) say(k, next, kind, kind === 'failed' ? 'shell.startRefused' : 'shell.startNotSent', { code: codeOf(e) ?? '' });
      return;
    }
    if (current(k) !== h) return;
    if (started(answer)) { if (commit(k, h, null, true) && owns(h)) finish(sh, true); return; }
    // "Already there": read back under the same record, so nothing else can be sent meanwhile.
    const rows = await readSessions(target.computer).catch(() => null);
    if (current(k) !== h) return;
    const r = rows ? afterStart(n, sh, rows) : null;
    if (r === 'started') { if (commit(k, h, null, true) && owns(h)) finish(sh, true); return; }
    if (r === 'other') { reopened(k, h); return; }
    if (r === 'ended') { if (commit(k, h, null, true)) say(k, undefined, 'failed', 'shell.startEnded', { shell: sh }); return; }
    // Unread, or nothing listed: whose start it was is not known, so it stays unknown (nothing listed: Start again).
    commit(k, h, { phase: 'startUnknown', before: b, shell: sh, ...(r === 'absent' ? { retry: true } : {}) });
  };
  const change = async () => {
    const k = key;
    const me = opening.current;
    if (!me || me.k !== k || !chosen) return;
    const sh = chosen;
    const h = current(k);
    // After an ending that went through (or a start a read found nothing for), the action only starts the shell.
    if (h && (h.phase === 'start' || (h.phase === 'startUnknown' && h.retry))) { await start(k, me.tok, h.shell ?? sh, h.before, h.phase === 'startUnknown'); return; }
    // Any other kept change refuses in reserve below: it is settled by its own answer, a check or a Dismiss.
    // The facts of the last read, only while no settle has moved the generation since.
    const r = readNow.current;
    let b = r && r.k === k && r.g === generation(k) ? r.before : null;
    if (!b?.incarnation) {
      // No shell named yet (the read failed, or listed none): read again before anything is sent.
      const look: Held = { phase: 'reading', before: null, shell: sh, owner: me.tok };
      if (reserve(k, look) === null) return;
      setNote(null);
      const rows = await readSessions(target.computer).catch(() => null);
      if (!commit(k, look, null) || !owns(look)) return;
      if (!rows) { say(k, undefined, 'not_sent', 'shell.readFailed'); return; }
      b = rows.find((s) => s.n === n) ?? null;
      put({ k, g: generation(k), before: b });
      // Nothing to end: only the start.
      if (!b) { await start(k, me.tok, sh, null, false); return; }
      if (b.offered === false) return;
      if (!b.incarnation) { say(k, undefined, 'not_sent', 'shell.noShell'); return; }
      if (!b.ssh && b.shell === sh) { say(k, undefined, 'not_sent', 'shell.already', { shell: sh }); return; }
    }
    const end: Held = { phase: 'ending', before: b, shell: sh, owner: me.tok };
    const prev = reserve(k, end);
    if (prev === null) return;
    setNote(null);
    const p = endStep(end, b.incarnation as string);
    if (!p) { commit(k, end, prev ?? null); return; }
    try { await p; } catch (e) {
      if (current(k) !== end) return;
      // terminal-N runs another shell than the one named: nothing ended, it keeps it.
      if (replaced(e)) { reopened(k, end, 'shell.replaced'); return; }
      // Nothing to end (404): terminal-N is not there, so the start can go ahead.
      if (!(e && typeof e === 'object' && (e as { status?: unknown }).status === 404)) {
        const kind = outcomeOf(e, true);
        if (kind === 'pending') { commit(k, end, { phase: 'endUnknown', before: b, shell: sh }); return; }
        if (commit(k, end, null)) say(k, undefined, kind, kind === 'failed' ? 'shell.endRefused' : 'shell.endNotSent', { code: codeOf(e) ?? '' });
        return;
      }
    }
    // Ended: from here the action only starts the shell, even when the opening has gone.
    const next: Held = { phase: 'start', before: b, shell: sh };
    if (!commit(k, end, next)) return;
    if (owns(end)) await start(k, me.tok, sh, b, false);
  };
  // Check again: a read back that only records what it finds, never a send. It settles the kept change of this
  // computer and session, whether a dialog still shows it or not (the sticky notice's Check again after a close).
  const check = async () => {
    const k = key;
    const h = current(k);
    const ph = h ? shown(h.phase) : 'choose';
    if (!h || (ph !== 'endUnknown' && ph !== 'startUnknown')) return true;
    const rows = await readSessions(target.computer).catch(() => null);
    if (!rows) return false;
    // The kept change moved on meanwhile (its own answer came): the dialog shows where it stands now.
    if (current(k) !== h) return false;
    if (ph === 'endUnknown') {
      const r = afterEnd(n, h.before, rows);
      // The ending names the old shell: landing late, it can no longer end the new one. The start waits for a press.
      if (r === 'gone') { commit(k, h, { phase: 'start', before: h.before, shell: h.shell }); return true; }
      if (r === 'reopened') { reopened(k, h); return true; }
      // The same shell (or unread): the ending may still land, so it stays locked.
      say(k, h, 'pending', 'shell.endMayLand');
      return false;
    }
    const sh = h.shell;
    if (!sh) return false;
    const r = afterStart(n, sh, rows);
    if (r === 'started') { if (commit(k, h, null, true)) finish(sh, here(k)); return true; }
    if (r === 'ended') { if (commit(k, h, null, true)) say(k, undefined, 'failed', 'shell.startEnded', { shell: sh }); return true; }
    if (r === 'other') { reopened(k, h); return true; }
    // Nothing there yet: still unknown (the first start may land), but Start again is safe (see the contract).
    commit(k, h, { phase: 'startUnknown', before: h.before, shell: sh, retry: true });
    return false;
  };
  // The warned Dismiss frees the record it was asked for, never a later one that took its place meanwhile.
  const dismiss = (k: string, h: Held) => {
    if (commit(k, h, null, true)) onChanged(who);
  };

  const busy = inFlight(phase);
  const settled = !!rec && (rec.phase === 'endUnknown' || rec.phase === 'startUnknown');
  const body = programs
    ? t('shell.program', { name: target.name })
    : t(phase === 'start' ? 'shell.bodyStart' : 'shell.body', { name: target.name }) + (now && phase !== 'start' ? ' ' + t('shell.now', { name: target.name, now }) : '');
  return (
    <>
      <Dialog
        isOpen
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={t('shell.title', { name: target.name })}
        body={body}
        tone={phase === 'start' ? 'default' : 'danger'}
        size="lg"
        busy={busy}
        outcome={outcome}
        onCheck={unknown ? check : undefined}
        {...(programs || before === undefined ? {} : { primaryLabel: phase === 'start' ? t('shell.start', { shell: chosen ?? '' }) : t('shell.change'), onPrimary: () => { void change(); }, primaryDisabled: !chosen })}
      >
        {!programs && before !== undefined && (
          <RadioGroup
            label={t('shell.pick')}
            options={choices.map((s) => ({ value: s, label: s }))}
            value={chosen}
            onChange={(s) => setPick({ k: key, s })}
            isDisabled={busy || phase === 'start' || unknown}
          />
        )}
        {((retry && phase === 'startUnknown' && chosen) || (settled && rec)) && (
          <Row gap={2} wrap>
            {retry && phase === 'startUnknown' && chosen && (
              <Button onPress={() => { void change(); }}>{t('shell.startAgain')}</Button>
            )}
            {settled && rec && (
              <Button variant="ghost" onPress={() => setAsked({ k: key, h: rec })}>{t('shell.dismiss')}</Button>
            )}
          </Row>
        )}
      </Dialog>
      <ConfirmDialog
        isOpen={!!asked && asked.k === key && asked.h === rec}
        onOpenChange={(o) => { if (!o) setAsked(null); }}
        title={t('shell.dismissTitle')}
        body={t('shell.dismissBody', { name: target.name })}
        confirmLabel={t('shell.dismissGo')}
        onConfirm={() => {
          const a = asked;
          setAsked(null);
          if (a) dismiss(a.k, a.h);
        }}
      />
    </>
  );
}
