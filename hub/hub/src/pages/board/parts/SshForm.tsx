// Connect over SSH: the picker's form. A terminal session on one of your running computers that runs
// ssh to a host; the tile is that terminal, named user@host.
//
// Contract, in plain words:
//   - Fields: the computer ssh runs from (running computers only), host, user and port (22). The computer is the one
//     the person picks; else the prefill's (by handle, found once the list has it; a handle naming no running
//     computer selects none, and Connect asks for one); else the first. A picked computer that stops is not
//     replaced by another: the form says the chosen computer is gone, and Connect asks again. No password or key field: ssh asks inside the tile, and the Hub never sees either.
//   - One plain line says the host's key is not checked yet.
//   - Connect checks the fields as core would (sshConnect sshProblems) and names the wrong one; then connectSsh. A
//     started session becomes the pick (onPick: a terminal tile on that number with its ssh {host, user, port},
//     named user@host, cut to the name limit). ssh that ended at once is said so (Connect comes back). A refusal or a send that never left shows why and gives Connect back. An unknown outcome locks
//     Connect; Check again reads the session back (checkSsh): started → the pick; ended at once or someone else's
//     → said so, Connect comes back (the next try takes a new number); nothing listed → still unknown (the first
//     create may land), but Connect comes back to try the same number again. Nothing is ever resent on its own.
//     Leaving the form while it is unknown moves it to the kit's sticky notice (usePendingToast). Its Check again
//     finding the session started after the form went for good adds no tile (the place for it went with the form):
//     a notice says it started and that no tile was added, naming the computer and the terminal number.
//   - On a Board kept loaded (useKeepPage), hiding is leaving for the notice, but the form stays: a Connect or a Check
//     again that settles while hidden lands when it shows again, and only for the attempt the
//     form still holds (the same number to the same destination). The no-computer branch draws the outcome too.
//   - An unsettled attempt is kept per computer and destination (memory only, this load), outside the form: a
//     Connect to that destination, from this form or a later one, tries its number again (sshConnect retrySsh),
//     never a new number, so an earlier create landing late cannot leave two connections. A form keeps its own
//     unknown number too: after another form settled the shared attempt, its Connect still tries that number. A
//     result that settles it (started, ended at once, someone else's) drops that number: the next Connect takes a new one.
//   - A create still unanswered is shared per destination: a form opened meanwhile joins its answer and sends nothing,
//     and reads that answer with the create's own number.
//   - A second try that does not go through (refused, or never sent) settles nothing about the first: the outcome
//     stays unknown with Check again, says why the second try did not go through, and Connect comes back.
//   - With no running computer the form says so (Back stays): reading while the first read is out; the read failed,
//     with Try again, when the last read failed (what it holds may be old); none is running only from a read that answered,
//     and then a chosen computer (picked, or the link's) is named gone rather than left unsaid.
import { Band, Button, ComputerPicker, ErrorState, Notice, Outcome, PickerField, Row, TextField, showToast, useComputerChoice, useHiddenNow, usePendingToast, type OutcomeLike } from '@kit';
import { computerState } from '@core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { handleOf, type BoardComputer } from '../computers';
import { NAME_MAX, type Tile } from '../model/boards';
import { sshLabel, sshOf, sshProblems, type Ssh } from '../sshRules';
import { checkSsh, connectSsh, retrySsh, type SshResult } from './sshConnect';
import { useFormFocus } from './formFocus';
import { useT } from './text';
import s from './board.module.css';

/** A Connect over SSH link's values (links.ts parseConnectSsh): the computer by its handle. */
export interface SshPrefill { readonly computer?: string; readonly host?: string; readonly user?: string; readonly port?: string }

export interface SshFormProps {
  computers: readonly BoardComputer[] | null;
  /** The last read of the list failed: with none running in what it holds, that is not known (Try again). */
  failed: boolean;
  /** The rows are the whole list. False: none running in them is not known (a later page may hold one). Default true. */
  complete?: boolean;
  onRetry: () => void;
  prefill?: SshPrefill;
  /** Session numbers the Boards and recents already hold on a computer (its terminal tiles). */
  taken: (computerId: string) => readonly number[];
  onPick: (t: Tile) => void;
  onBack: () => void;
  /** When the form may take the focus as it mounts (the Picker's opening()). Absent: always. */
  mayFocus?: () => boolean;
}

const nameOf = (label: string) => (label.length <= NAME_MAX ? label : label.slice(0, NAME_MAX - 1) + '…');

/** This form's unknown attempt: the computer, the session number its create took, and the destination. */
type Attempt = { computer: BoardComputer; n: number; ssh: Ssh };
/** What a read back found (checkSsh, answered). */
type Read = NonNullable<Awaited<ReturnType<typeof checkSsh>>>;

// Unsettled attempts by computer and destination: the number the first create took.
const attempts = new Map<string, number>();
// Creates still unanswered, by the same key: a later Connect joins the answer instead of sending another.
const inflight = new Map<string, { readonly run: Promise<SshResult>; readonly n: number | undefined }>();
const attemptKey = (c: BoardComputer, ssh: Ssh) => c.id + '\n' + ssh.host + '\n' + ssh.user + '\n' + ssh.port;
/** Tests: forget every kept attempt. */
export function resetSshAttempts(): void { attempts.clear(); inflight.clear(); }

export function SshForm({ computers, failed, complete = true, onRetry, prefill, taken, onPick, onBack, mayFocus }: SshFormProps) {
  const t = useT();
  // The first control takes the focus when the form opens (as `mayFocus` allows), and again when the control holding it
  // goes away (formFocus.ts).
  const focus = useFormFocus(mayFocus);
  const running = (computers ?? []).filter((c) => computerState(c.status) === 'running');
  const choice = useComputerChoice();
  const [computerId, setComputerId] = useState<string | undefined>(undefined);
  const [host, setHost] = useState(prefill?.host ?? '');
  const [user, setUser] = useState(prefill?.user ?? '');
  const [port, setPort] = useState(prefill?.port ?? '22');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeLike | undefined>(undefined);
  // Nothing was listed after an unknown create: still unknown, but Connect may try that number again.
  const [retry, setRetry] = useState(false);
  const pending = useRef<Attempt | null>(null);
  const live = useRef(true);
  // A Connect or a read back that settles while the effects are stopped (a Board kept loaded, hidden) lands when it
  // shows again; one whose form unloaded is dropped with it, as before.
  const late = useRef<Array<() => void>>([]);
  const hiddenNow = useHiddenNow();
  // usePendingToast's settled (set below, where the hook runs after check is defined).
  const settledToast = useRef<() => void>(() => {});
  useEffect(() => {
    live.current = true;
    for (const land of late.current.splice(0)) land();
    return () => { live.current = false; };
  }, []);
  const fromLink = prefill?.computer !== undefined;
  const chosenId = computerId ?? (fromLink ? running.find((c) => handleOf(c) === prefill?.computer)?.id : running[0]?.id);
  const computer = running.find((c) => c.id === chosenId) ?? null;
  // The computer picked in the form, or the one it was opened for (a link's, or the one chosen at the picker's step), is
  // not among the running ones: say it is gone, and select none rather than another (Connect asks for a choice).
  const gone = computer === null && (computerId !== undefined || fromLink);
  const problems = sshProblems({ host, user, port });
  const unknown = outcome?.kind === 'pending';
  const locked = unknown && !retry;

  // A started session becomes the pick, which may close the form at once: its unknown outcome is settled first, so no
  // sticky notice opens as it goes (usePendingToast's settled, read before any effect could run).
  const done = (c: BoardComputer, n: number, ssh: Ssh) => {
    settledToast.current();
    onPick({ project: c.project_id, computer: c.id, program: 'terminal', session: n, ssh, name: nameOf(sshLabel(ssh.user, ssh.host, ssh.port)) });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const ssh = sshOf({ host, user, port });
    if (!ssh || !computer || busy || locked) return;
    setBusy(true);
    setRetry(false);
    setOutcome(undefined);
    const ak = attemptKey(computer, ssh);
    const own = pending.current && attemptKey(pending.current.computer, pending.current.ssh) === ak ? pending.current.n : undefined;
    let op = inflight.get(ak);
    if (!op) {
      const again = attempts.get(ak) ?? own;
      // The bookkeeping runs once per create, kept even when the form has gone: a second try that did not go
      // through settles nothing about the first.
      const run = (again === undefined ? connectSsh(computer, taken(computer.id), ssh) : retrySsh(computer, again, ssh)).then((x) => {
        if ('pending' in x) attempts.set(ak, x.pending);
        else if (!('error' in x)) attempts.delete(ak);
        return x;
      });
      const entry = { run, n: again };
      const drop = () => { if (inflight.get(ak) === entry) inflight.delete(ak); };
      run.then(drop, drop);
      inflight.set(ak, entry);
      op = entry;
    }
    const again = op.n;
    const r: SshResult = await op.run;
    if (live.current) settle(r, computer, ssh, again);
    else if (hiddenNow()) late.current.push(() => settle(r, computer, ssh, again));
  };
  const settle = (r: SshResult, computer: BoardComputer, ssh: Ssh, again: number | undefined) => {
    // Settled (started, ended at once, someone else's): this form no longer holds that number.
    if ('session' in r || 'ended' in r || 'taken' in r) pending.current = null;
    setBusy(false);
    const name = sshLabel(ssh.user, ssh.host, ssh.port);
    if ('session' in r) { done(computer, r.session, ssh); return; }
    if ('pending' in r) {
      pending.current = { computer, n: r.pending, ssh };
      setOutcome({ kind: 'pending', message: t('ssh.unknown', { name }) });
      return;
    }
    if ('error' in r && again !== undefined) {
      pending.current = { computer, n: again, ssh };
      setRetry(true);
      setOutcome({ kind: 'pending', message: t('ssh.retryNot', { name, why: t('ssh.err.' + r.error, { code: r.code ?? '' }) }) });
      return;
    }
    if ('ended' in r || 'taken' in r) { setOutcome({ kind: 'failed', message: t('ended' in r ? 'ssh.ended' : 'ssh.taken', { name }) }); return; }
    const kind = r.error === 'not_sent' || r.error === 'stale' || r.error === 'read' ? 'not_sent' : 'failed';
    setOutcome({ kind, message: t('ssh.err.' + r.error, { code: r.code ?? '' }) });
  };
  // Check again: a read back, never a resend.
  const check = async () => {
    const p = pending.current;
    if (!p) return false;
    const r = await checkSsh(p.computer, p.n, p.ssh);
    if (r === null) return false;
    // Whether this attempt is still unsettled (kept under its number): a retry from another form that started it, or an
    // earlier read that settled it, has removed it, and then that path said what happened. The key may since hold
    // another form's later attempt (a new number after this one was settled): this read settles only its own.
    const held = attempts.get(attemptKey(p.computer, p.ssh)) === p.n;
    // Nothing listed: still unknown (the attempt stays kept). Anything else settles the attempt.
    if (r !== 'absent' && held) attempts.delete(attemptKey(p.computer, p.ssh));
    // Read back while a kept Board is hidden (the sticky notice's Check again, or a read that was out): what it shows
    // lands on return. After the form went away for good: settled, nothing to show here.
    if (live.current) checked(p, r);
    else if (hiddenNow()) late.current.push(() => checked(p, r));
    else if (r === 'started' && held) showToast({ title: t('ssh.startedNotAdded', { name: sshLabel(p.ssh.user, p.ssh.host, p.ssh.port), computer: p.computer.name, n: p.n }), tone: 'info' });
    return r !== 'absent';
  };
  const checked = (p: Attempt, r: Read) => {
    // A read of an attempt this form no longer holds (settled meanwhile, or another destination) shows nothing. A
    // retry of the same number is the same attempt.
    const now = pending.current;
    if (!now || now.n !== p.n || attemptKey(now.computer, now.ssh) !== attemptKey(p.computer, p.ssh)) return;
    const name = sshLabel(p.ssh.user, p.ssh.host, p.ssh.port);
    // Nothing listed: Connect may try the same number again.
    if (r === 'absent') { setRetry(true); setOutcome({ kind: 'pending', message: t('ssh.didNot', { name }) }); return; }
    pending.current = null;
    if (r === 'started') { done(p.computer, p.n, p.ssh); return; }
    setOutcome({ kind: 'failed', message: t(r === 'ended' ? 'ssh.ended' : 'ssh.taken', { name }) });
  };

  // Leaving the form while the outcome is unknown moves it to the kit's sticky notice, with the same Check again.
  const settledPending = usePendingToast(outcome ?? null, check);
  settledToast.current = settledPending;
  // Both branches draw the outcome: an unknown one is never left without its line (a kept Board shown again after the
  // running computers went, or a computer stopping while the form is open).
  const outcomeLine = outcome && <Outcome outcome={outcome} variant="block" {...(unknown ? { onCheck: check } : {})} />;

  if (!running.length) {
    return (
      <div className={s.pickerForm}>
        {failed ? (
          <ErrorState title={t('picker.failed')} onRetry={onRetry} size="sm" />
        ) : (
          <Notice>{computers === null ? t('ssh.reading') : !complete ? t('ssh.partial') : gone ? t('ssh.goneNone') : t('ssh.noComputer')}</Notice>
        )}
        {outcomeLine}
        <div className={s.pickerFormActions}>
          <Button variant="ghost" onPress={onBack}>{t('picker.backStep')}</Button>
        </div>
      </div>
    );
  }
  const err = (field: 'host' | 'user' | 'port') => (tried && problems[field] ? t('ssh.' + field + '.' + problems[field]) : undefined);
  const lock = busy || unknown;
  return (
    <form className={s.pickerForm} onSubmit={(e) => { void submit(e); }} noValidate ref={focus.ref} onFocus={focus.onFocus} onBlur={focus.onBlur}>
      {/* The kit's computer picker: running computers only, as before. */}
      <PickerField label={t('ssh.from')} description={gone ? t('ssh.fromGone') : undefined} errorMessage={tried && !computer ? t('ssh.fromPick') : undefined}>
        <ComputerPicker label={t('ssh.from')} computers={running.map((c) => choice(c))} value={computer?.id} onChange={setComputerId} placeholder={t('ssh.fromPick')} isDisabled={lock} />
      </PickerField>
      {/* The host key caveat is about the Host field: an attached Band under it, which the field takes as its description. */}
      <Band tone="warn" /* noDetails: a standing caveat about the host key, no rejection to show */ attach={<TextField label={t('ssh.host')} placeholder={t('ssh.hostPlaceholder')} value={host} onChange={setHost} mono errorMessage={err('host')} isDisabled={lock} />}>
        {t('ssh.hostKey')}
      </Band>
      <Row gap={2} align="start" wrap>
        <TextField label={t('ssh.user')} value={user} onChange={setUser} mono errorMessage={err('user')} isDisabled={lock} />
        <TextField label={t('ssh.port')} value={port} onChange={setPort} inputMode="numeric" mono errorMessage={err('port')} isDisabled={lock} />
      </Row>
      {outcomeLine}
      <div className={s.pickerFormActions}>
        <Button variant="ghost" onPress={onBack} isDisabled={busy}>{t('picker.backStep')}</Button>
        <Button variant="primary" type="submit" busy={busy} isDisabled={locked}>{t('ssh.connect')}</Button>
      </div>
    </form>
  );
}
