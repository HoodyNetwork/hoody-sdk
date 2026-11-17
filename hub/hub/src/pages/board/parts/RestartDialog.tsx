// Restart terminal: a live terminal tile's menu opens this dialog for its session.
//
// Contract, in plain words:
//   - On open it reads the computer's sessions (readSessionsChecked: a malformed answer is a failed read) to name the
//     shell it would restart (its incarnation). It is the confirmation: it says that everything running in terminal-N
//     ends, which shell starts there again (restartShell; else the computer's default), and that its start folder and
//     user go back to the computer's defaults (a reset rebuilds the session from the request alone). Restart is the
//     only send. Only a local shell is offered: an ssh session (a reset would drop the connection for a local shell),
//     a program's own terminal, terminal-N not listed, or no shell running say why and send nothing; a failed read says
//     so and offers Read again (a read only). Each opening reads afresh: a closed dialog forgets its read.
//   - The send names the shell of the read (shellChange restartSession). The terminal checks it before it resets, so
//     another shell there since the read, or none, answers "replaced": nothing was reset, and the dialog reads again.
//   - One record per computer and session, in this module (restarts below; memory only, this load): a press keeps it
//     before the send leaves, and the answer applies only while that record is still the kept one, also after the
//     dialog has closed. C9: the send goes once, never retried. An unknown outcome locks Restart ("may have gone
//     through"); only a refusal the terminal gives before it resets (PRE_RESET) is a definite "not restarted"; any
//     other refusal is unknown too (some come after the reset, e.g. SHELL_REPLACED). Check again reads back
//     (afterRestart) and only records what it finds, never sends: another shell there = it runs a new shell now (the
//     named shell is gone, so the restart can no longer reset anything), the same shell = still unknown (it may still
//     land), no shell running or terminal-N not listed = nothing left to restart (said as a fact, never as failed);
//     a read that fails, is malformed (readSessionsChecked) or lists terminal-N twice changes nothing. Each settle reads again, and closes the dialog when it still
//     shows that terminal. Closing while unknown moves the outcome to the kit's sticky notice (Dialog), with the same
//     Check again. A definite refusal or a send that never left shows why and gives Restart back.
//   - A restart that went through reloads the frames that still show terminal-N (onChanged, by computer and session).
import { outcomeOf } from '@core';
import { Button, Dialog, showToast, type OutcomeLike } from '@kit';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readSessionsChecked, type TermSession } from '../termSessions';
import { afterRestart, replaced, restartSession, restartShell, type ShellAt, type ShellTarget } from './shellChange';
import { useT } from './text';

// ── the kept restarts (compare-and-set: an answer or a check replaces only the record it saw) ─────────────────────
interface Kept { readonly phase: 'sending' | 'unknown'; readonly before: TermSession }
const kept = new Map<string, Kept>();
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
function put(k: string, from: Kept | undefined, to: Kept | null): boolean {
  if (kept.get(k) !== from) return false;
  if (to) kept.set(k, to); else kept.delete(k);
  for (const f of [...subs]) f();
  return true;
}
/** Tests: forget every kept restart. */
export function resetRestarts(): void { kept.clear(); for (const f of [...subs]) f(); }

export interface RestartDialogProps {
  target: ShellTarget | null;
  onClose: () => void;
  /** terminal-N on that computer was restarted: reload the frames that still show it. */
  onChanged: (at: ShellAt) => void;
}

const keyOf = (x: ShellTarget | null) => (x ? x.computer.id + '/' + x.session : '');
/** Refusals the terminal answers before it resets anything: only these prove nothing changed. */
const PRE_RESET: ReadonlySet<string> = new Set(['EXECUTE_QUEUE_BUSY', 'PERSISTENT_SESSION', 'VALIDATION_ERROR', 'DAEMON_TERMINAL']);
const codeOf = (e: unknown): string => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown; status?: unknown }) : null;
  return typeof c?.code === 'string' ? c.code : typeof c?.status === 'number' ? String(c.status) : '';
};

export function RestartDialog({ target, onClose, onChanged }: RestartDialogProps) {
  const t = useT();
  const key = keyOf(target);
  const rec = useSyncExternalStore(subscribe, () => kept.get(key));
  const [again, setAgain] = useState(0);
  const readKey = `${key}|${again}`;
  // What a read found for this opening: undefined while reading, null when it failed.
  const [read, setRead] = useState<{ k: string; rows: readonly TermSession[] | null } | null>(null);
  const [note, setNote] = useState<{ k: string; on: Kept | undefined; o: OutcomeLike } | null>(null);
  // The terminal this dialog shows now ('' while closed): a settle from the sticky notice closes nothing.
  const shown = useRef('');
  shown.current = key;
  useEffect(() => {
    if (!target) { setRead(null); return; }
    const ac = new AbortController();
    readSessionsChecked(target.computer, ac.signal).then(
      (got) => { if (!ac.signal.aborted) setRead({ k: readKey, rows: got.rows }); },
      () => { if (!ac.signal.aborted) setRead({ k: readKey, rows: null }); },
    );
    return () => ac.abort();
    // readKey names the terminal and the read; the target object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey]);

  if (!target) return <Dialog isOpen={false} onOpenChange={() => undefined} title="" />;
  const n = target.session;
  const name = target.name;
  const who: ShellAt = { computer: target.computer.id, session: n };
  const rows = read && read.k === readKey ? read.rows : undefined;
  const now = rows ? rows.find((r) => r.n === n) ?? null : undefined;
  const say = (k: string, on: Kept | undefined, kind: OutcomeLike['kind'], msg: string, code = '') =>
    setNote({ k, on, o: { kind, message: t(msg, { name, code }) } });
  // A restart that went through (its own answer), or a read back finding a new shell there (maybe someone else's).
  const done = (readBack: boolean) => {
    onChanged(who);
    showToast({ title: t(readBack ? 'restart.newShell' : 'restart.done', { name }) });
  };

  // Why nothing can be sent (null: Restart is offered).
  const why = rec
    ? null
    : rows === undefined
      ? 'restart.reading'
      : rows === null
        ? 'restart.readFailed'
        : !now
          ? 'restart.notListed'
          : !now.offered
            ? 'restart.program'
            : now.ssh
              ? 'restart.ssh'
              : !now.incarnation || !now.running
                ? 'restart.noShell'
                : null;

  const restart = async () => {
    const k = key;
    if (!now || why || kept.has(k)) return;
    const h: Kept = { phase: 'sending', before: now };
    if (!put(k, undefined, h)) return;
    setNote(null);
    try {
      await restartSession(target.computer, n, now.incarnation as string, restartShell(now));
    } catch (e) {
      if (kept.get(k) !== h) return;
      // Another shell there than the one named: nothing was reset. Read again so a new press names the shell there now.
      if (replaced(e)) { if (put(k, h, null)) { say(k, undefined, 'failed', 'restart.replaced'); setAgain((x) => x + 1); } return; }
      const kind = outcomeOf(e, true);
      const code = codeOf(e);
      if (kind === 'not_sent') { if (put(k, h, null)) say(k, undefined, kind, 'restart.notSent'); return; }
      if (kind === 'failed' && PRE_RESET.has(code)) { if (put(k, h, null)) say(k, undefined, kind, 'restart.refused', code); return; }
      // Anything else may have come after the reset: unknown, read back.
      put(k, h, { phase: 'unknown', before: now });
      return;
    }
    if (put(k, h, null)) { done(false); onClose(); }
  };
  // Check again: a read back that only records what it finds, never a send (also from the sticky notice).
  const check = async () => {
    const k = key;
    const h = kept.get(k);
    if (!h || h.phase !== 'unknown') return true;
    const back = await readSessionsChecked(target.computer).catch(() => null);
    if (kept.get(k) !== h) return false;
    if (!back) { say(k, h, 'pending', 'restart.checkFailed'); return false; }
    // terminal-N listed twice: the read cannot tell which shell is there.
    if (back.multi.has(n)) { say(k, h, 'pending', 'restart.checkTwice'); return false; }
    const r = afterRestart(n, h.before, back.rows);
    if (r === 'same') { say(k, h, 'pending', 'restart.mayLand'); return false; }
    if (!put(k, h, null)) return false;
    if (r === 'restarted') done(true);
    else showToast({ title: t(r === 'gone' ? 'restart.gone' : 'restart.stopped', { name }), tone: 'info' });
    // Read again for this opening; the dialog has nothing left to send for this restart.
    setAgain((x) => x + 1);
    if (r === 'restarted' && shown.current === k) onClose();
    return true;
  };

  const unknown = rec?.phase === 'unknown';
  const outcome: OutcomeLike | undefined =
    note && note.k === key && note.on === rec ? note.o : unknown ? { kind: 'pending', message: t('restart.unknown', { name }) } : undefined;
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('restart.title', { name })}
      body={why ? t(why, { name, to: now?.ssh ?? '' }) : now && restartShell(now) ? t('restart.body', { name, shell: restartShell(now) ?? '' }) : t('restart.bodyDefault', { name })}
      tone="danger"
      role="alertdialog"
      busy={rec?.phase === 'sending'}
      outcome={outcome}
      onCheck={unknown ? check : undefined}
      {...(why && why !== 'restart.reading' ? {} : { primaryLabel: t('restart.go'), onPrimary: () => { void restart(); }, primaryDisabled: !!why })}
    >
      {why === 'restart.readFailed' && <Button variant="secondary" onPress={() => setAgain((x) => x + 1)}>{t('restart.readAgain')}</Button>}
    </Dialog>
  );
}
