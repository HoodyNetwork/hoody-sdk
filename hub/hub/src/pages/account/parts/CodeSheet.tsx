// One password + code drawer for the changes that need both: turn two-step sign-in off, make new backup
// codes, and stop asking for a code when API keys change. The change is locked from the moment it is sent; an
// answer the Hub could not confirm locks the drawer (Check again reads the status back, nothing is resent).
// A wrong password or code is said under its own field.
import { Button, Checkbox, Drawer, DrawerCancel, OtpField, OutcomeBanner, TextField, SecretInput, useStrings, useWipeOn } from '@kit';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pressContext, useArmedHolds, type Change } from '../data';
import type { HeldRow } from '@core';
import { cleanCode, errorWords, refusal, isAppCode, isCodeOrBackup } from '../logic';
import strings from '../strings.en.json';
import { DismissNote } from './DismissNote';
import { LockedFooter } from './Footers';
import { releaseOp, locks, stillOut, type OpName, useOpLock, useOpMaybe } from './locks';
import r from './Rules.module.css';
import { BannerSlot } from './BannerSlot';

const FORM = 'account-code-form';

export interface CodeSheetProps<T> {
  /** Names this sheet's remembered width (kit Drawer `resizeKey`): each account change keeps its own. */
  resizeKey: string;
  open: boolean;
  onClose: () => void;
  title: string;
  lead: string;
  confirm: string;
  danger?: boolean;
  /** The code field also takes a backup code. */
  backupOk?: boolean;
  op: OpName;
  /** A repeat of an unconfirmed send changes things again (new backup codes): ask for a tick before it. */
  repeatRisk?: boolean;
  send: (password: string, code: string) => Promise<Change<T>>;
  /** Read the 2FA status back; true only when it answered fresh AND the answer proves the change (only then is the lock released). */
  readBack: () => Promise<boolean>;
  /** After a proven read-back: true when the status it read already shows what this change asks for (the sheet then closes as done). */
  landed?: () => boolean;
  /** The change's held rows, read live (a source hook's heldNow): the warned Dismiss frees the ones shown when its warning armed. */
  holds?: () => readonly HeldRow[];
  /** A change no read can prove (new codes): after a Check again that could not tell, the person may forget it and start over.
   *  Gets the rows that were shown; false when any was already settled or replaced (the page says nothing was dismissed). */
  dismiss?: (shown: readonly HeldRow[]) => boolean | void | Promise<boolean>;
  /** Drop what the answer carried (a held secret) when the drawer closes or unmounts. */
  release?: (data: T) => void;
  /** The change went through. The drawer closes unless `after` shows something once. */
  onDone: (data: T | undefined) => void;
  /** Shown instead of the form once the change went through (the new backup codes); `saved` gates Done. */
  after?: (data: T | undefined, saved: boolean, setSaved: (v: boolean) => void) => ReactNode;
}

type Errors = { password?: string; code?: string };

export function CodeSheet<T>({ resizeKey, open, onClose, title, lead, confirm, danger, backupOk, op, repeatRisk, send, readBack, landed, holds, dismiss, release, onDone, after }: CodeSheetProps<T>) {
  const t = useStrings(strings);
  const lock = useOpLock(op);
  const held = lock === 'pending';
  const maybe = useOpMaybe(op) && repeatRisk === true;
  const [ticked, setTicked] = useState(false);
  const [tickMissing, setTickMissing] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const shownErrors = useRef(errors);
  shownErrors.current = errors;
  // The one refused field that takes the focus (its error is read out there); null when the focus must stay put.
  const [focusField, setFocusField] = useState<'password' | 'code' | null>(null);
  // What the person typed in since the last send went out. A refusal does not move the focus out of a field they typed
  // in meanwhile, and does not empty it: the next keys would land in the wrong field. (The six-digit field still takes
  // the focus on a new error of its own: the kit's rule.)
  const typedSince = useRef({ password: false, code: false });
  const typePassword = (v: string) => { typedSince.current.password = true; setPassword(v); };
  // Emptying is not typing: the six-digit field empties itself one task after every submit, while the answer is out.
  const typeCode = (v: string) => { if (v) typedSince.current.code = true; setCode(v); };
  // A kit field takes the focus when an error appears, not when the error it shows changes its words. A field that
  // must take the focus again shows no error for one render first; these are the errors to show after it.
  const [again, setAgain] = useState<Errors | null>(null);
  useLayoutEffect(() => {
    if (!again) return;
    setErrors(again);
    setAgain(null);
  }, [again]);
  const refuse = (next: Errors, focus: 'password' | 'code' | null) => {
    setFocusField(focus);
    if (focus !== null && next[focus] !== undefined && shownErrors.current[focus] !== undefined) {
      setErrors({ ...next, [focus]: undefined });
      setAgain(next);
    } else setErrors(next);
  };
  const [banner, setBanner] = useState<string | null>(null);
  // The read-back could not tell: the change may have gone through (never worded as a failure).
  const [unsure, setUnsure] = useState(false);
  // The last Start over found its holds already replaced or freed: nothing was dismissed.
  const [nothing, setNothing] = useState(false);
  // The holds the warning was shown over: a press frees those, not what core holds by then.
  const armedHolds = useArmedHolds(unsure && dismiss !== undefined, () => holds?.() ?? []);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ data: T | undefined } | null>(null);
  const [saved, setSaved] = useState(false);
  // The answer's secret leaves with the drawer, however it closes (Discard, Done, the URL, a context change).
  const resultRef = useRef(result);
  resultRef.current = result;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const r = resultRef.current;
      if (r && r.data !== undefined) releaseRef.current?.(r.data);
    };
  }, []);

  // The context ended (account or realm switch, sign-out, page hide): everything typed or shown goes with the drawer.
  const wipeAll = () => close();
  useWipeOn(wipeAll);

  const close = () => {
    if (result && result.data !== undefined) release?.(result.data);
    setPassword('');
    setCode('');
    setErrors({});
    setBanner(null);
    setUnsure(false);
    setTicked(false);
    setTickMissing(false);
    setResult(null);
    setSaved(false);
    onClose();
  };

  const submit = async () => {
    // 'sent' is a send still out (a second drawer, a remount): nothing goes twice.
    if (running || lock) return;
    setBanner(null);
    setTickMissing(false);
    const e: Errors = {};
    if (!password) e.password = t('pw.eCurrent');
    if (!(backupOk ? isCodeOrBackup(code) : isAppCode(code))) e.code = backupOk ? t('2fa.eCode') : t('2fa.eFormat');
    // Nothing sent: the focus goes to the first field to fill, even from the other field and even when that field
    // already showed an error. While the password is refused the code field shows no error of its own (see
    // codeError), so a code still missing after the password is filled is a new error there and takes the focus then.
    refuse(e, e.password ? 'password' : e.code ? 'code' : null);
    if (e.password || e.code) return;
    if (maybe && !ticked) {
      setTickMissing(true);
      return;
    }
    setRunning(true);
    typedSince.current = { password: false, code: false };
    const ep = locks.sent(op);
    // Spaces and hyphens typed or pasted between a code's groups are not part of it.
    const res = await send(password, cleanCode(code));
    setRunning(false);
    // What was sent is emptied; a field typed in while the answer was out keeps what the person typed.
    const typed = typedSince.current;
    if (!typed.password) setPassword('');
    if (!typed.code) setCode('');
    // Sent and maybe applied, or applied: the drawer locks or leaves the form, so nothing typed meanwhile is kept.
    if (res.outcome === 'pending' || res.outcome === 'done') {
      setPassword('');
      setCode('');
    }
    locks.settle(op, stillOut(res), ep);
    setTicked(false);
    if (repeatRisk) {
      // A read-back cannot show whether a repeat is safe, so an unconfirmed send is remembered until a sure answer.
      if (res.outcome === 'pending') locks.markMaybe(op);
      else if (res.outcome !== 'not_sent') locks.clearMaybe(op);
    }
    // The drawer went while the answer was out: the secret it carries is dropped at once, never held or shown.
    if (!aliveRef.current) {
      if (res.data !== undefined) releaseRef.current?.(res.data);
      return;
    }
    if (res.outcome === 'done') {
      onDone(res.data);
      if (after) setResult({ data: res.data });
      else close();
    } else if (!stillOut(res) && (res.outcome === 'failed' || res.outcome === 'not_sent')) {
      // A wrong code is refused by name, so a 401 that names nothing can only be the password.
      const w = errorWords(refusal(res), 'password');
      if (w.key === 'err.password') refuse({ password: t(w.key) }, typed.code ? null : 'password');
      else if (w.key === 'err.code') refuse({ code: t(w.key) }, typed.password ? null : 'code');
      else setBanner(w.key === 'err.tooManyWait' ? t(w.key, w.vars) : t(w.key));
    }
  };

  const check = async () => {
    setChecking(true);
    // The version is read before the read-back: a send made meanwhile is not freed by this answer.
    const v = locks.version(op);
    const ok = await readBack();
    setChecking(false);
    setUnsure(!ok);
    if (!ok) {
      // An inconclusive Check again is the person's refresh: the warning is shown over the rows on screen now, and an earlier "not dismissed" note is stale.
      armedHolds.retake();
      setNothing(false);
      return;
    }
    releaseOp(op, v);
    // The status already shows the change: it is done, so the form is not offered again (a repeat would burn another code).
    if (landed?.()) {
      onDone(undefined);
      close();
    }
  };

  // One refused field at a time: the six-digit field takes the focus on any new error, and a field whose error merely
  // stays never takes it again. So the code's error waits until the password passes.
  const codeError = errors.password ? undefined : errors.code;
  const shownResult = result !== null && after !== undefined;
  return (
    <Drawer overlayId="account-code-sheet" resizeKey={resizeKey}
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={title}
      subtitle={shownResult ? undefined : lead}
      size="sm"
      dirty={shownResult ? !saved : !held && Boolean(password || code)}
      busy={running}
      footer={
        shownResult ? (
          <Button variant="primary" isDisabled={!saved} onPress={close}>
            {t('2fa.done')}
          </Button>
        ) : held ? (
          <LockedFooter onClose={close} onCheck={() => void check()} checking={checking} />
        ) : (
          <>
            <DrawerCancel />
            <Button variant={danger ? 'secondary' : 'primary'} tone={danger ? 'danger' : 'default'} type="submit" form={FORM} busy={running}>
              {confirm}
            </Button>
          </>
        )
      }
    >
      {shownResult ? (
        after(result.data, saved, setSaved)
      ) : (
        <>
          <DismissNote show={nothing} />
          {held && (
            <BannerSlot>
              <OutcomeBanner
                kind="pending"
                known={unsure ? t('check.unknown') : undefined}
                checkLine={unsure ? t(op === 'codes' ? 'check.checkLineNoProof' : 'check.checkLine') : undefined}
                stopLine={unsure && dismiss ? t('check.stopLine') : undefined}
                actions={
                  dismiss && unsure ? (
                    <Button
                      size="sm"
                      onPress={() => {
                        // As the password and name drawers: the answer commits only in the context it was pressed in, and
                        // settles only the lock version it was pressed over (a newer send's lock stays).
                        const at = pressContext(), v = locks.version(op);
                        // False: the holds shown were already replaced or freed, so nothing was dismissed and the band stays.
                        void Promise.resolve(dismiss(armedHolds.shown())).then((freed) => {
                          if (!at.still()) return;
                          if (freed === false) {
                            setNothing(true);
                            return;
                          }
                          if (!releaseOp(op, v)) return;
                          setUnsure(false);
                          setNothing(false);
                        });
                      }}
                    >
                      {t('check.startOver')}
                    </Button>
                  ) : undefined
                }
              />
            </BannerSlot>
          )}
          {banner && (
            <BannerSlot>
              <OutcomeBanner kind="failed" title={t('sheet.failedTitle')} body={banner} />
            </BannerSlot>
          )}
          <form
            id={FORM}
            className={r.form}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <SecretInput
              kind="current-password"
              label={t('pw.current')}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              reveal={false}
              isDisabled={held}
              value={password}
              onChange={typePassword}
              errorMessage={errors.password}
              // A refused password: the focus moves into the field, which reads its error out (see focusField).
              focusOnError={focusField === 'password'}
            />
            {backupOk ? (
              <TextField
                label={t('2fa.codeOrBackup')}
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={32}
                mono
                isDisabled={held}
                value={code}
                onChange={typeCode}
                errorMessage={codeError}
                focusOnError={focusField === 'code'}
              />
            ) : (
              <OtpField label={t('2fa.code')} isDisabled={held} value={code} onChange={typeCode} errorMessage={codeError} />
            )}
            {maybe && !held && (
              <>
                <Checkbox label={t('codes.again')} isSelected={ticked} onChange={setTicked} />
                {tickMissing && <OutcomeBanner kind="failed" body={t('codes.againNeeded')} />}
              </>
            )}
          </form>
        </>
      )}
    </Drawer>
  );
}
