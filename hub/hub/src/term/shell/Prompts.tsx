// The shell's own prompts in a terminal:
// - QuitPrompt: leaving the Hub (q, Ctrl-C) while work runs from it or a page holds unsaved work. The same question the
//   web's LeaveConfirm asks before a context switch (shell/LeaveConfirm.tsx): its title and body, the running count
//   (core leave holds) and each unsaved sentence (core switch guards), re-read every second; Stay (n, Esc, a click
//   outside) keeps everything, Leave anyway (y, Enter on it) quits. A second Ctrl-C while it is open leaves at once.
//   It closes and leaves by itself once nothing runs and nothing is unsaved (askLeave's answer then).
//   The button and the running-work line are this file's own words ("Leave anyway", "If you leave"): the web's are
//   for a switch that goes on ("Go on anyway", "If you go on"), which LeaveConfirm still asks here.
// - TermLock: the passcode lock (core applock) as a full-screen layer over the app while locked: a masked field,
//   Enter checks it, the web lock screen's messages (shell/LockScreen.tsx). Forget this browser is the web's.
// The web's SignOutConfirm and LeaveConfirm (switch questions) draw as they are, on the kit's ConfirmDialog sibling.
import { useEffect, useRef, useState } from 'react';
import { leaveCount, noteLossesConfirmed, switchLosses, useLeaveCount } from '@core';
import { checkPasscode, forgetHere, lockView, MAX_TRIES, useLocked, useLockVersion, type CheckResult } from '@core/shell';
import { useStrings } from '@kit/strings';
import shellStrings from '../../shell/strings.en.json';
import { Box, Mark, markSizeFor, Text, useTerminalSize } from '../prim';
import { Layer } from '../prim/Overlay';
import { hubKey } from './hubKey';
import { LineView, Modal, useLineEdit } from './layer';
import strings from './strings.en.json';

/** How often an open question re-reads the unsaved sentences (the web's REREAD_MS). */
export const REREAD_MS = 1000;

/** Whether leaving now loses something: work running from here, or a page's unsaved work. */
export const somethingAtStake = (): boolean => leaveCount() > 0 || switchLosses().length > 0;

export function QuitPrompt({ open, onStay, onLeave }: { open: boolean; onStay: () => void; onLeave: () => void }) {
  const t = useStrings(shellStrings);
  const tt = useStrings(strings);
  const running = useLeaveCount();
  const [losses, setLosses] = useState<readonly string[]>([]);
  const [choice, setChoice] = useState<'stay' | 'leave'>('stay');
  useEffect(() => {
    if (!open) { setLosses([]); setChoice('stay'); return; }
    const read = () => {
      const now = switchLosses();
      setLosses((was) => (was.length === now.length && was.every((l, i) => l === now[i]) ? was : now));
    };
    read();
    const id = setInterval(read, REREAD_MS);
    (id as { unref?: () => void }).unref?.();
    return () => clearInterval(id);
  }, [open]);
  // Nothing at stake any more: the question has its answer.
  useEffect(() => { if (open && running === 0 && losses.length === 0 && !somethingAtStake()) onLeave(); }, [open, running, losses, onLeave]);
  if (!open) return null;
  const leave = () => {
    // Only what was shown is confirmed (LeaveConfirm's rule): a sentence named since shows first.
    const now = switchLosses();
    if (now.some((l) => !losses.includes(l))) { setLosses(now); return; }
    noteLossesConfirmed(losses);
    onLeave();
  };
  return (
    <Modal
      title={running > 0 ? t('leave.title') : t('leave.unsavedTitle')}
      width={64}
      top="fifth"
      tone="danger"
      onClose={onStay}
      footer={tt('leave.keys')}
      onKey={(k) => {
        if (k.key === 'Escape' || k.key === 'n') onStay();
        else if (k.key === 'y') leave();
        else if (k.key === 'Enter') (choice === 'leave' ? leave : onStay)();
        else if (k.key === 'ArrowLeft' || k.key === 'ArrowRight' || k.key === 'Tab') setChoice((c) => (c === 'stay' ? 'leave' : 'stay'));
      }}
    >
      <Text>{tt('leave.intro')}</Text>
      {running > 0 && <Text colour="muted">{'• ' + tt('leave.body', { count: running })}</Text>}
      {losses.map((l, i) => <Text key={i} colour="muted">{'• ' + l}</Text>)}
      <Box dir="row" gap={2} pad={{ top: 1 }}>
        <Box onPress={onStay}><Text bold={choice === 'stay'} inverse={choice === 'stay'}>{`[ ${t('leave.stay')} (n) ]`}</Text></Box>
        <Box onPress={leave}><Text colour="danger" bold={choice === 'leave'} inverse={choice === 'leave'}>{`[ ${tt('leave.confirm')} (y) ]`}</Text></Box>
      </Box>
    </Modal>
  );
}

type Line = { k: 'wrong' | 'wait' | 'check' | 'again' | 'forgetFailed' } | null;

function waitText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

/** Rows the lock screen's frame and own lines take at most (every message showing, the forget question open); the
 *  large mark is drawn only in what is left above that. */
const LOCK_ROWS = 23;

/** The lock screen, full screen over the app while core is locked. Nothing behind it gets a key. */
export function TermLock() {
  const locked = useLocked();
  useLockVersion();
  const term = useTerminalSize();
  const t = useStrings(shellStrings);
  const edit = useLineEdit();
  const [line, setLine] = useState<Line>(null);
  const [busy, setBusy] = useState(false);
  const [forgetAsk, setForgetAsk] = useState(false);
  const [, tick] = useState(0);
  const episode = useRef(0);
  useEffect(() => { if (!locked) { edit.set(''); setLine(null); setForgetAsk(false); episode.current++; } }, [locked]);
  const view = lockView();
  const tries = view.tries;
  const waitMs = tries?.until ? tries.until - Date.now() : 0;
  const waiting = waitMs > 0;
  useEffect(() => {
    if (!locked || !waiting) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    (id as { unref?: () => void }).unref?.();
    return () => clearInterval(id);
  }, [locked, waiting]);
  if (!locked) return null;
  const mark = markSizeFor('lg', { cols: term.width - 8, rows: term.height - LOCK_ROWS });
  const forgetOnly = view.noWebLocks || view.record === 'malformed';
  const apply = (r: CheckResult) => {
    switch (r.k) {
      case 'unlocked': setLine(null); return;
      case 'wrong': setLine({ k: 'wrong' }); return;
      case 'wait': setLine({ k: 'wait' }); return;
      case 'again': setLine({ k: 'again' }); return;
      case 'terminal': setLine({ k: 'forgetFailed' }); return;
      case 'cancelled': return;
      default: setLine(r.k === 'check' || r.k === 'noSession' ? { k: 'check' } : null);
    }
  };
  const submit = async () => {
    if (busy || waiting || !edit.value || forgetOnly) return;
    const ep = episode.current;
    const typed = edit.value;
    edit.set('');
    setBusy(true);
    let r: CheckResult;
    try { r = await checkPasscode(typed); } catch { r = { k: 'check' }; }
    if (ep !== episode.current) return;
    setBusy(false);
    apply(r);
  };
  const forget = () => { setForgetAsk(false); if (forgetHere({}) === 'failed') setLine({ k: 'forgetFailed' }); };
  const left = tries && !tries.out ? MAX_TRIES - tries.n : null;
  let message: string | null = null;
  if (line?.k === 'forgetFailed') message = t('notice.purgeBody');
  else if (view.removed) message = t('lock.removedElsewhere');
  else if (view.noWebLocks) message = t('lock.noWebLocks');
  else if (view.record === 'malformed') message = t('lock.screen.noVerifier');
  else if (line?.k === 'check') message = t('lock.screen.check');
  else if (line?.k === 'again') message = t('lock.screen.again');
  else if (left !== null && left <= 3) message = t('lock.screen.wrongLeft', { count: left });
  else if (line?.k === 'wrong') message = t('lock.screen.wrong');
  return (
    <Layer
      open
      kind="modal"
      place={{ at: 'full' }}
      frameTitle={t('lock.screen.title')}
      padX={2}
      onKeyFirst={(raw) => {
        if (raw.eventType === 'release') return true;
        const k = hubKey(raw);
        if (forgetAsk) {
          if (k.key === 'y') forget();
          else if (k.key === 'n' || k.key === 'Escape') setForgetAsk(false);
          return true;
        }
        if (k.key === 'Enter') void submit();
        else if (k.ctrlKey && k.name === 'f') setForgetAsk(true);
        else if (!forgetOnly && !waiting && !busy) edit.onKey(k);
        return true;
      }}
    >
      <Box dir="column" gap={1} pad={{ top: 1 }}>
        {/* The Hoody logo, as the web lock screen's: the large mark over the title where the terminal has the rows for
            it, else the small one beside it. */}
        <Box dir={mark === 'lg' ? 'column' : 'row'} gap={1} shrink={0}>
          <Mark size={mark} />
          <Text bold>{t('lock.screen.title')}</Text>
        </Box>
        <Text colour="muted">{t('lock.screen.body')}</Text>
        {!forgetOnly && (
          <Box dir="column" width={40}>
            <Text colour="muted">{t('lock.field')}</Text>
            <LineView edit={edit} mask />
          </Box>
        )}
        {waiting && <Text colour="warn">{'! ' + t('lock.screen.wait', { time: waitText(waitMs) })}</Text>}
        {busy && <Text colour="muted">{'…'}</Text>}
        {message && <Text colour="danger">{'✗ ' + message}</Text>}
        {forgetAsk ? (
          <Box dir="column">
            <Text bold>{t('lock.forgot.title')}</Text>
            <Text colour="muted">{t('lock.forgot.body')}</Text>
            <Text colour="faint">{'y ' + t('lock.screen.forget') + ' · n ' + t('leave.stay')}</Text>
          </Box>
        ) : (
          <Text colour="faint">{`Enter ${t('lock.screen.unlock')} · Ctrl+F ${t('lock.screen.forgotAsk')}`}</Text>
        )}
      </Box>
    </Layer>
  );
}
