// Turn on two-step sign-in, in two drawer steps: 1 the password; 2 a flat track of three things to do in order: scan
// the QR or type the key (SecretField), keep the backup codes (SecretField, hidden until Show) and tick that they are
// saved, then confirm a code. The secrets live only in this drawer's state and leave with it. A step whose outcome is
// unknown locks the drawer (Check again reads the status back): nothing is sent again from a locked drawer, and a fresh
// status read is what frees it. An account that has no password cannot answer step 1: the drawer then says so, offers
// the mail that sets one, and keeps the field and Next off.
import { hostEnv, type HeldSecret } from '@core';
import { Button, Drawer, OtpField, OutcomeBanner, ReasonButton, SecretInput, Track, TrackStep, useStrings, useWipeOn } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { pressContext, provenBy, readOk, useArmedHolds, useProfile, useSetupParts, useStartSetup, useTwoFactor, useVerifySetup } from '../data';
import { cleanCode, errorWords, plainBadRequest, possiblePassword, refusal, isAppCode, setupGate } from '../logic';
import strings from '../strings.en.json';
import { DismissNote } from './DismissNote';
import { LockedFooter } from './Footers';
import { locks, releaseOp, stillOut, useOpLock } from './locks';
import { BackupCodes, KeyQr, ManualKey } from './Secrets';
import r from './Rules.module.css';
import { BannerSlot } from './BannerSlot';
import { NoPasswordBanner } from './NoPasswordBanner';

const FORM = 'account-setup-form';

export interface SetupSheetProps {
  open: boolean;
  onClose: () => void;
  /** Two-step sign-in is now on. */
  onOn: () => void;
}

export function SetupSheet({ open, onClose, onOn }: SetupSheetProps) {
  const t = useStrings(strings);
  const start = useStartSetup();
  const verify = useVerifySetup();
  const twofa = useTwoFactor();
  const startHeld = useOpLock('setup') === 'pending';
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // Only the HeldSecret is kept in state; the text is read at render and is gone the moment it is dropped.
  const [held, setHeld] = useState<HeldSecret | null>(null);
  const secrets = useSetupParts(held);
  const heldRef = useRef<HeldSecret | null>(null);
  heldRef.current = held;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      heldRef.current?.drop();
    };
  }, []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [verifyOwn, setVerifyHeld] = useState(false);
  // The change's own core lock survives a closed drawer; this flag only covers the fixture transport.
  const verifyHeld = verifyOwn || verify.pending;
  const [unsure, setUnsure] = useState(false);
  // The last Start over found its holds already replaced or freed: nothing was dismissed.
  const [nothing, setNothing] = useState(false);
  // The verify holds the warning was shown over: a press frees those, not what core holds by then.
  const armedVerify = useArmedHolds(unsure, verify.heldNow);
  const [checking, setChecking] = useState(false);
  const locked = startHeld || verifyHeld;
  // No password is set on the account: the profile says so, or (an API that does not report it) the server refused
  // step 1 for that reason. Step 1 then has nothing to ask for.
  const profile = useProfile();
  const [refusedNone, setRefusedNone] = useState(false);
  const noPassword = !locked && !held && (profile.data?.hasPassword === false || refusedNone);

  // The context ended (account or realm switch, sign-out, page hide): everything typed or shown goes with the drawer.
  const wipeAll = () => close();
  useWipeOn(wipeAll);

  const close = () => {
    setPassword('');
    setCode('');
    held?.drop();
    setHeld(null);
    setSaved(false);
    setError(null);
    setFieldError(null);
    setVerifyHeld(false);
    setUnsure(false);
    setRefusedNone(false);
    onClose();
  };

  // A kit wipe of any one secret drops them all, QR included, and returns to step 1.
  const wipe = () => {
    held?.drop();
    setHeld(null);
    setSaved(false);
  };

  const next = async () => {
    if (start.running || locked || noPassword) return;
    setError(null);
    if (!password) {
      setFieldError(t('pw.eCurrent'));
      return;
    }
    setFieldError(null);
    const ep = locks.sent('setup');
    const possible = possiblePassword(password);
    const res = await start.run({ password });
    setPassword('');
    locks.settle('setup', stillOut(res), ep);
    // The drawer went while the answer was out: the secret it carries is dropped at once, never held.
    if (!aliveRef.current) {
      if (res.data) res.data.drop();
      return;
    }
    if (res.outcome === 'done' && res.data) setHeld(res.data);
    else if (!stillOut(res) && (res.outcome === 'failed' || res.outcome === 'not_sent')) {
      // The server says the account has no password: the drawer turns into the way to set the first one.
      if (res.code === 'PASSWORD_NOT_SET') {
        setRefusedNone(true);
        return;
      }
      if (plainBadRequest(res)) {
        // A 400 that names nothing, on this step: what was typed cannot be a password, 2FA was turned on meanwhile
        // (another tab), another set-up won the race, or the account has no password to ask for. The status is read
        // again: on = nothing left to do; off = the sentence names the no-password case as a possibility, never as a
        // fact about the account; unreadable = the general sentence.
        if (!possible) {
          setFieldError(t('err.password'));
          return;
        }
        const now = await twofa.refetch();
        if (!aliveRef.current) return;
        // Already on: the page under the drawer shows it, and there is nothing left to set up.
        if (readOk(now) && now.data?.enabled) close();
        else setError(t(readOk(now) ? 'err.noPassword' : 'err.generic'));
        return;
      }
      const w = errorWords(refusal(res), 'password');
      if (w.key === 'err.password') setFieldError(t(w.key));
      else setError(w.key === 'err.tooManyWait' ? t(w.key, w.vars) : t(w.key));
    }
  };

  const confirm = async () => {
    if (verify.running || locked || !saved) return;
    setError(null);
    if (!isAppCode(code)) {
      setFieldError(t('2fa.eFormat'));
      return;
    }
    setFieldError(null);
    const res = await verify.run({ code: cleanCode(code) });
    setCode('');
    if (res.outcome === 'done') {
      onOn();
      close();
    } else if (stillOut(res)) setVerifyHeld(true);
    else if (res.outcome === 'failed' || res.outcome === 'not_sent') {
      if (plainBadRequest(res)) {
        // A 400 that names nothing, on this step: the set-up shown here is not the server's any more (it was started
        // again or finished elsewhere, or the account's credentials changed). The status is read again: already on
        // closes the drawer over it; otherwise what is shown is dropped and the set-up starts again.
        const now = await twofa.refetch();
        if (!aliveRef.current) return;
        if (readOk(now) && now.data?.enabled) {
          close();
          return;
        }
        wipe();
        setError(t('err.setupStale'));
        return;
      }
      const w = errorWords(refusal(res), 'code');
      if (w.key === 'err.code') setFieldError(t(w.key));
      else setError(w.key === 'err.tooManyWait' ? t(w.key, w.vars) : t(w.key));
    }
  };

  const check = async () => {
    setChecking(true);
    const v = locks.version('setup');
    const own = await Promise.all([start.readBack(), verify.readBack()]);
    const r = await twofa.refetch();
    setChecking(false);
    // A failed or empty read proves nothing: the lock stays until the status was read back fresh.
    if (!provenBy(own.every(Boolean), r)) {
      // An inconclusive Check again is the person's refresh: the warning is shown over the rows on screen now, and an earlier "not dismissed" note is stale.
      armedVerify.retake();
      setNothing(false);
      setUnsure(true);
      return;
    }
    setUnsure(false);
    releaseOp('setup', v);
    setVerifyHeld(false);
    if (readOk(r) && r.data?.enabled) {
      onOn();
      close();
    }
  };

  // Why Turn on is off, in the gate's order: the saved tick first, then the code.
  const gate = setupGate(saved, code);

  return (
    <Drawer overlayId="account-setup-sheet" resizeKey="account-setup"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t('2fa.setupTitle')}
      subtitle={t(secrets ? '2fa.step2of2' : '2fa.step1of2')}
      size="md"
      dirty={!locked && Boolean(held || password || code)}
      busy={start.running || verify.running}
      // Locked: Close and Check again only (the drawer's own Cancel and primary are gone with the form's send).
      footer={locked ? <LockedFooter onClose={close} onCheck={() => void check()} checking={checking} /> : undefined}
      reason={locked ? undefined : secrets ? (gate ? t(`2fa.reason.${gate}`) : undefined) : noPassword ? t('e.noPasswordTitle') : t('2fa.nextSay')}
      primary={
        locked ? undefined : secrets ? (
          gate ? (
            <ReasonButton variant="primary" reason={t(`2fa.reason.${gate}`)}>{t('2fa.confirm')}</ReasonButton>
          ) : (
            <Button variant="primary" type="submit" form={FORM} busy={verify.running}>
              {t('2fa.confirm')}
            </Button>
          )
        ) : noPassword ? (
          <ReasonButton variant="primary" reason={t('e.noPasswordTitle')}>{t('2fa.next')}</ReasonButton>
        ) : (
          <Button variant="primary" type="submit" form={FORM} busy={start.running}>
            {t('2fa.next')}
          </Button>
        )
      }
    >
      {locked && (
        <BannerSlot>
          <OutcomeBanner
            kind="pending"
            known={unsure ? t('check.unknown') : undefined}
            checkLine={unsure ? t(startHeld && !verifyHeld ? 'check.checkLineNoProof' : 'check.checkLine') : undefined}
            stopLine={unsure ? t('check.stopLine') : undefined}
            actions={
              unsure ? (
                <Button
                  size="sm"
                  onPress={() => {
                    // The verify holds shown when the warning armed (an earlier mount's too): frees exactly those; one already freed or replaced answers false and the band stays.
                    // The start step acts on the live scope and the live holds, so it runs only while the press still
                    // holds: the same context and no newer set-up send since (the lock version pressed over). After the
                    // answers nothing on the page moves outside that press either.
                    const at = pressContext(), v = locks.version('setup');
                    const still = (): boolean => at.still() && locks.version('setup') === v;
                    void verify.dismissRows(armedVerify.shown()).then((freed) => (freed && still() ? start.dismissShown() : false)).then((freed) => {
                      if (!still()) return;
                      if (!freed) {
                        setNothing(true);
                        return;
                      }
                      releaseOp('setup', v);
                      setVerifyHeld(false);
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
      <DismissNote show={nothing} />
      {noPassword && <NoPasswordBanner asks="setup" />}
      {error && (
        <BannerSlot>
          <OutcomeBanner kind="failed" title={t('sheet.failedTitle')} body={error} />
        </BannerSlot>
      )}
      {secrets ? (
        // The form holds the three steps in the order they are done. While Turn on is off the form has no submit
        // button, and a browser then submits a one-field form on Enter: the kit code field wipes itself on every submit,
        // so Enter is swallowed until the gate opens (a typed code is never lost to a press that could not send it).
        // The code field is told so itself (submitOnEnter; the terminal's field reads only that, its keys never reach
        // this form); the form's rule below covers the browser's other inputs (Enter on the tick submits there too).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the form only swallows Enter while its submit is off; it handles no other key
        <form
          id={FORM}
          className={r.form}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && gate !== null && hostEnv().browserPage === true && e.target instanceof HTMLInputElement) e.preventDefault();
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <Track label={t('2fa.steps')} flat open={null}>
            <TrackStep id="scan" state="now" name={t('2fa.step.scan')} why={t('2fa.step.scanWhy')}>
              <KeyQr src={secrets.qr} alt={t('2fa.qrAlt')} />
              <ManualKey value={secrets.manualKey} onWipe={wipe} />
            </TrackStep>
            <TrackStep id="codes" state={saved ? 'done' : 'now'} name={t('2fa.step.codes')}>
              <BackupCodes codes={secrets.codes} saved={saved} onSaved={setSaved} onWipe={wipe} />
            </TrackStep>
            <TrackStep id="code" state="now" name={t('2fa.step.code')}>
              <OtpField
                label={t('2fa.code')}
                isDisabled={locked}
                submitOnEnter={gate === null}
                value={code}
                onChange={setCode}
                errorMessage={fieldError ?? undefined}
              />
            </TrackStep>
          </Track>
        </form>
      ) : (
        <form
          id={FORM}
          className={r.form}
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <SecretInput
            kind="current-password"
            label={t('pw.current')}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            reveal={false}
            isDisabled={locked || noPassword}
            value={password}
            onChange={setPassword}
            errorMessage={fieldError ?? undefined}
            // A refused password: the focus moves into the field, which reads its error out.
            focusOnError
          />
        </form>
      )}
    </Drawer>
  );
}
