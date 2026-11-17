// Set, change or remove the passcode lock, in a drawer. The sheet collects the current
// passcode and the new values first; Save makes ONE engine call (setPasscode / changeLock / removePasscode), which
// verifies and writes in one lock hold, so no authorisation outlives it. Passcodes live only in the fields: cleared
// after every answer, never kept or logged. A wrong current passcode spends a try and keeps the sheet open; a change
// that carried a new passcode then asks for it again (or an explicit Keep), so a retry never saves without it.
import {
  changeLock,
  IDLE_CHOICES,
  lockSettings,
  MAX_TRIES,
  passcodeProblem,
  removePasscode,
  setPasscode,
  type ChangeResult,
  type IdleMin,
  type PasscodeProblem,
  type RemoveResult,
  type SetResult,
} from '@core';
import { Button, Checkbox, Drawer, DrawerCancel, OutcomeBanner, SecretInput, SegmentedControl, SubSection, Switch, Why, useNow, useStrings, useWipeOn, type Translate } from '@kit';
import { useRef, useState } from 'react';
import { pageFaq } from '../faq';
import type { LockSheetMode } from '../logic';
import strings from '../strings.en.json';
import { IDLE_LABEL } from './LockSection';
import s from './Rules.module.css';

const FORM = 'account-lock-form';

type T = Translate<typeof strings>;

const PROBLEM: Record<PasscodeProblem, 'lock.err.short' | 'lock.err.long' | 'lock.err.weak'> = {
  short: 'lock.err.short',
  long: 'lock.err.long',
  weak: 'lock.err.weak',
};

// The device, not the frame: the primary pointer and the standalone app.
function coarse(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
function standalone(): boolean {
  try {
    if ((navigator as { standalone?: boolean }).standalone === true) return true;
    return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Numbers only: the passcode as the engine hashes it (NFKC, so full-width digits count) holds only 0-9. */
export function digitsOnly(pass: string): boolean {
  return /^[0-9]*$/.test(pass.normalize('NFKC'));
}

/** m:ss from `now` until `until` (wall clock), at least 0:01. */
function countdown(until: number, now: number): string {
  const sec = Math.max(1, Math.ceil((until - now) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export interface Words {
  readonly title: string;
  readonly body?: string;
}
const said = (title: string): Words => ({ title });

/** The words for an engine answer that did not save, as they read at `now`: null when nothing is said (cancelled; the
 *  engine's own exit; a wait that has ended). The sheet reads them again every second while a wait runs. */
export function refusedWords(t: T, r: ChangeResult | RemoveResult, op: 'change' | 'remove', now = Date.now()): Words | null {
  switch (r.k) {
    case 'wrong': {
      // From the 5th wrong try on, a wait follows every one: it is said under the try count, never instead of it.
      const left = MAX_TRIES - r.n;
      const title = left <= 3 ? t('lock.err.wrongLeft', { count: left }) : t('lock.err.wrong');
      return r.until > now ? { title, body: t('lock.err.wait', { time: countdown(r.until, now) }) } : said(title);
    }
    case 'wait':
      return r.until > now ? said(t('lock.err.wait', { time: countdown(r.until, now) })) : null;
    case 'removed':
      return said(t('lock.err.removedElsewhere'));
    case 'noVerifier':
      return said(t('lock.err.noVerifier'));
    case 'check':
      return said(t('lock.err.check'));
    case 'notSaved':
      // Change: the write did not land. Remove: the record could not be seen gone, so say only that much.
      return said(t(op === 'change' ? 'lock.err.notSavedChange' : 'lock.err.notSavedRemove'));
    case 'unsupported':
    case 'noWebLocks':
      return said(t('lock.err.noWebLocksSet'));
    case 'problem':
      return said(t(PROBLEM[r.problem]));
    case 'needsNumeric':
      // Numbers only over a kept passcode with letters (another window may have set it after this sheet opened).
      return said(t('lock.err.digitsCurrent'));
    default:
      // cancelled (this tab locked or hid while checking: nothing was learned), terminal (the engine signs this browser
      // out), noSession (the page leaves for sign-in), and the saved answers, said by the caller.
      return null;
  }
}

/** The words for a set that did not save: null for cancelled (nothing was learned) and noSession (the page leaves). */
export function setWords(t: T, r: SetResult): Words | null {
  switch (r) {
    case 'changed':
      return said(t('lock.err.changed'));
    case 'notSaved':
      return said(t('lock.err.notSaved'));
    case 'unsupported':
      return said(t('lock.err.noWebLocksSet'));
    case 'check':
      return said(t('lock.err.check'));
    case 'short':
    case 'long':
    case 'weak':
      return said(t(PROBLEM[r]));
    default:
      return null;
  }
}

// The banner: a set's words, or an engine refusal kept with its operation, so the words of a wait are read again as it
// runs down (the answer carries a kind and a deadline, never a passcode).
type Banner = { k: 'words'; w: Words } | { k: 'refused'; r: ChangeResult | RemoveResult; op: 'change' | 'remove' };

export interface LockSheetProps {
  mode: LockSheetMode;
  onClose: () => void;
  /** Saved: the section's note. */
  onDone: (text: string) => void;
}

export function LockSheet({ mode, onClose, onDone }: LockSheetProps) {
  const t = useStrings(strings);
  // The record as the sheet opened (change prefills from it); a set sheet starts from the device's defaults.
  const [start] = useState(() => lockSettings());
  const [current, setCurrent] = useState('');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [digits, setDigits] = useState(() => start?.digits ?? coarse());
  const [idleMin, setIdleMin] = useState<IdleMin>(() => start?.idleMin ?? 5);
  const [onLeave, setOnLeave] = useState(() => start?.onLeave ?? (standalone() || coarse()));
  const [errors, setErrors] = useState<{ current?: string; pass?: string; again?: string }>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [running, setRunning] = useState(false);
  // Not a secret: this change asked for a new passcode. The fields are wiped after every answer, so a refused change
  // (wrong current passcode) must not let a retry with only the current passcode save the old one as if replaced.
  const [replacing, setReplacing] = useState(false);
  const open = useRef(true);

  const wipe = () => {
    setCurrent('');
    setPass('');
    setAgain('');
  };
  const close = () => {
    open.current = false;
    wipe();
    setErrors({});
    setBanner(null);
    onClose();
  };
  // The context ended (account or realm switch, sign-out, page hide): typed passcodes go with the drawer.
  useWipeOn(close);

  // A wait counts down once a second while it runs, as on the lock screen (shell/LockScreen.tsx). The clock only redraws:
  // it runs on the deadline and the render time, and the time shown is read at each render, never from its tick (a new
  // refusal can arrive long after the last tick, and a tick can be ahead after the system clock goes back).
  const waitUntil = banner?.k === 'refused' && (banner.r.k === 'wrong' || banner.r.k === 'wait') ? banner.r.until : 0;
  useNow(waitUntil > Date.now());
  const at = Date.now();
  const shown = banner === null ? null : banner.k === 'words' ? banner.w : refusedWords(t, banner.r, banner.op, at);

  const needsNew = mode === 'lock-set' || pass !== '' || replacing;
  const localErrors = (): typeof errors => {
    const e: typeof errors = {};
    if (mode !== 'lock-set' && current === '') e.current = t('lock.err.current');
    if (mode !== 'lock-remove' && needsNew) {
      const p = passcodeProblem(pass);
      if (replacing && pass === '') e.pass = t('lock.err.newAgain');
      else if (p) e.pass = t(PROBLEM[p]);
      else if (digits && !digitsOnly(pass)) e.pass = t('lock.err.digits');
      else if (again !== pass) e.again = t('lock.err.match');
    } else if (mode === 'lock-change' && digits && !start?.digits && current !== '' && !digitsOnly(current)) {
      // Numbers only turned on over the kept passcode: it must hold only digits too, or a new one is needed. (A record
      // already numbers-only got there through this check, so a typed current with letters is just a wrong try.)
      e.pass = t('lock.err.digitsCurrent');
    }
    return e;
  };
  const keepCurrent = () => {
    setReplacing(false);
    setPass('');
    setAgain('');
    setErrors((e) => ({ ...e, pass: undefined, again: undefined }));
  };

  const submit = async () => {
    if (running) return;
    setBanner(null);
    const found = localErrors();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const values = { digits, idleMin, onLeave };
    setRunning(true);
    try {
      if (mode === 'lock-set') {
        const r = await setPasscode(pass, values);
        wipe();
        if (!open.current) return;
        if (r === 'set') {
          onDone(t('lock.done.set'));
          close();
        } else if (r === 'noSession') close();
        else {
          const w = setWords(t, r);
          setBanner(w && { k: 'words', w });
        }
      } else if (mode === 'lock-change') {
        if (pass !== '') setReplacing(true);
        const r = await changeLock(current, pass === '' ? values : { ...values, passcode: pass });
        wipe();
        if (!open.current) return;
        if (r.k === 'saved') {
          onDone(t('lock.done.changed'));
          close();
        } else if (r.k === 'terminal' || r.k === 'noSession') close();
        else setBanner({ k: 'refused', r, op: 'change' });
      } else {
        const r = await removePasscode(current);
        wipe();
        if (!open.current) return;
        if (r.k === 'deleted') {
          onDone(t('lock.done.removed'));
          close();
        } else if (r.k === 'terminal' || r.k === 'noSession') close();
        else setBanner({ k: 'refused', r, op: 'remove' });
      }
    } finally {
      setRunning(false);
    }
  };

  const currentField = (
    <SecretInput
      label={t('lock.current')}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      reveal={false}
      inputMode={start?.digits ? 'numeric' : undefined}
      isDisabled={running}
      value={current}
      onChange={(v) => {
        setCurrent(v);
        setErrors((e) => ({ ...e, current: undefined }));
      }}
      errorMessage={errors.current}
    />
  );
  const title = t(mode === 'lock-set' ? 'lock.setTitle' : mode === 'lock-change' ? 'lock.changeTitle' : 'lock.removeTitle');

  return (
    <Drawer
      overlayId="account-lock-sheet"
      resizeKey="account-lock"
      isOpen
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={title}
      // What removing does is the drawer's subtitle, not a body paragraph.
      subtitle={mode === 'lock-remove' ? t('lock.removeBody') : undefined}
      size="sm"
      dirty={Boolean(current || pass || again)}
      busy={running}
      footer={
        <>
          <DrawerCancel />
          <Button variant={mode === 'lock-remove' ? 'secondary' : 'primary'} tone={mode === 'lock-remove' ? 'danger' : 'default'} type="submit" form={FORM} busy={running}>
            {mode === 'lock-set' ? t('lock.setSave') : mode === 'lock-change' ? t('lock.changeSave') : t('lock.removeSave')}
          </Button>
        </>
      }
    >
      {shown && <div className={s.banner}><OutcomeBanner kind="failed" title={shown.title} body={shown.body} /* noDetails: the engine answers with a kind, never an error */ /></div>}
      <form
        id={FORM}
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'lock-remove' ? (
          currentField
        ) : (
          <>
            {/* Two groups, the passcode and when it locks; the scope answer is a Why below them. The "don't reuse"
                line is the Passcode group's own description (the kit's small help text). */}
            <SubSection title={t('lock.group.passcode')} description={t('lock.reuse')}>
              <div className={s.form}>
                {mode === 'lock-change' && currentField}
                <SecretInput
                  label={t(mode === 'lock-set' ? 'lock.field' : replacing ? 'lock.newFieldAgain' : 'lock.newField')}
                  description={mode === 'lock-change' ? t(replacing ? 'lock.newAgainHelp' : 'lock.newHelp') : undefined}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={mode === 'lock-set'}
                  reveal={false}
                  inputMode={digits ? 'numeric' : undefined}
                  isDisabled={running}
                  value={pass}
                  onChange={(v) => {
                    setPass(v);
                    setErrors((e) => ({ ...e, pass: undefined, again: undefined }));
                  }}
                  errorMessage={errors.pass}
                />
                {replacing && (
                  <Button variant="secondary" size="sm" isDisabled={running} onPress={keepCurrent}>
                    {t('lock.keepCurrent')}
                  </Button>
                )}
                {needsNew && (
                  <SecretInput
                    label={t('lock.again')}
                    reveal={false}
                    inputMode={digits ? 'numeric' : undefined}
                    isDisabled={running}
                    value={again}
                    onChange={(v) => {
                      setAgain(v);
                      setErrors((e) => ({ ...e, again: undefined }));
                    }}
                    errorMessage={errors.again}
                  />
                )}
                <Checkbox
                  isSelected={digits}
                  isDisabled={running}
                  onChange={(v) => {
                    setDigits(v);
                    setErrors((e) => ({ ...e, pass: undefined }));
                  }}
                  label={t('lock.digits')}
                />
              </div>
            </SubSection>
            <SubSection title={t('lock.group.auto')}>
              <div className={s.form}>
                <SegmentedControl<string>
                  label={t('lock.after')}
                  showLabel
                  isDisabled={running}
                  items={IDLE_CHOICES.map((m) => ({ id: String(m), label: t(IDLE_LABEL[m]) }))}
                  value={String(idleMin)}
                  onChange={(v) => setIdleMin(Number(v) as IdleMin)}
                />
                <Switch label={t('lock.leave')} isSelected={onLeave} isDisabled={running} onChange={setOnLeave} />
              </div>
            </SubSection>
            <Why question={t('lock.why.q')} faq={{ item: pageFaq(t).byId.lockScope, label: t('lock.more') }}>
              {t('lock.why.a')}
            </Why>
          </>
        )}
      </form>
    </Drawer>
  );
}
