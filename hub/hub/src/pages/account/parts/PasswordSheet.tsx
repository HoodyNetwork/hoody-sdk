// Change password, in a drawer: current, new with a live rules checklist, again. Passwords live only in the
// fields: cleared after every send, never kept or logged. A wrong current password is said under that field;
// a change whose outcome is unknown locks the drawer (Check again reads it back, nothing is resent). An account that
// has no password has none to change: the drawer then says so, offers the mail that sets one, and keeps its fields off.
import { Button, Drawer, DrawerCancel, OutcomeBanner, RuleChecklist, SecretInput, useStrings, useWipeOn } from '@kit';
import { useState } from 'react';
import { pressContext, useChangePassword, useProfile } from '../data';
import { errorKey, limitWords, refusal, passwordChecks, passwordErrors, weakPasswordRefusal, type PasswordErrors, type PasswordProblem } from '../logic';
import strings from '../strings.en.json';
import { LockedFooter } from './Footers';
import { locks, releaseOp, stillOut, useOpLock } from './locks';
import { NoPasswordBanner } from './NoPasswordBanner';
import s from './Rules.module.css';

const FORM = 'account-password-form';

const FIELD_ERROR: Record<PasswordProblem, 'pw.eCurrent' | 'pw.eWeak' | 'pw.eLong' | 'pw.eSame' | 'pw.eAgain'> = {
  required: 'pw.eCurrent',
  weak: 'pw.eWeak',
  long: 'pw.eLong',
  same: 'pw.eSame',
  mismatch: 'pw.eAgain',
};

export interface PasswordSheetProps {
  open: boolean;
  onClose: () => void;
  /** The change went through: every session of the account is now ended. */
  onChanged: () => void;
  /** Sign in again after an outcome nobody could confirm: the password may or may not have changed. */
  onUnsure: () => void;
}

export function PasswordSheet({ open, onClose, onChanged, onUnsure }: PasswordSheetProps) {
  const t = useStrings(strings);
  const change = useChangePassword();
  const profile = useProfile();
  const lock = useOpLock('password');
  const held = lock === 'pending';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<PasswordErrors & { server?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  // The read-back could not tell: the change may have gone through (never worded as a failure).
  const [unsure, setUnsure] = useState(false);
  const [checking, setChecking] = useState(false);
  // No password is set on the account: the profile says so, or (an API that does not report it) the server refused
  // the change for that reason. There is no current password to type, so the form is off.
  const [refusedNone, setRefusedNone] = useState(false);
  const noPassword = !held && (profile.data?.hasPassword === false || refusedNone);

  // Signing in again is the one sure way to learn which password works: the account's sessions end with a change.
  const signInAgain = () => {
    onUnsure();
    close();
  };

  const close = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setErrors({});
    setBanner(null);
    setUnsure(false);
    setRefusedNone(false);
    onClose();
  };

  const submit = async () => {
    // A 'sent' lock is a send still out (this sheet remounted, a different new password): nothing goes twice.
    if (change.running || lock || noPassword) return;
    setBanner(null);
    const found = passwordErrors(current, next, again);
    setErrors(found ?? {});
    if (found) return;
    // What the refusal below is judged against: the fields as sent (they are emptied right after), and what the profile
    // said about the account's password.
    const sent = { current, next, hasPassword: profile.data?.hasPassword };
    const ep = locks.sent('password');
    const r = await change.run({ current, password: next });
    setCurrent('');
    setNext('');
    setAgain('');
    locks.settle('password', stillOut(r), ep);
    if (r.outcome === 'done') {
      onChanged();
      close();
    } else if (!stillOut(r) && (r.outcome === 'failed' || r.outcome === 'not_sent')) {
      const key = errorKey(refusal(r), 'password');
      // The account has no password to check: the drawer turns into the way to set the first one.
      if (r.code === 'PASSWORD_NOT_SET') setRefusedNone(true);
      // The server's own password rule, when nothing else can be behind a plain 400 (logic weakPasswordRefusal).
      else if (weakPasswordRefusal(r, sent)) setErrors({ password: 'weak' });
      else if (key === 'err.password') setErrors({ server: t(key) });
      else if (key === 'err.tooMany') {
        const wait = limitWords(refusal(r));
        setBanner(wait.key === 'err.tooManyWait' ? t(wait.key, wait.vars) : t(wait.key));
      } else setBanner(t(key));
    }
  };

  // A password change has no operation-specific read-back (a profile read answers the same either way, and a 401
  // can come from a session ended elsewhere), so a check never settles it: the drawer says so and offers the way out.
  const check = async () => {
    setChecking(true);
    // The change has no proves, so core's read-back frees nothing: the verdict stays unknown and only the warned Start over releases it.
    await Promise.all([change.readBack(), profile.refetch()]);
    setChecking(false);
    setUnsure(true);
  };

  // The context ended (account or realm switch, sign-out, page hide): typed passwords go with the drawer.
  useWipeOn(close);

  const checks = passwordChecks(current, next, again);

  return (
    <Drawer overlayId="account-password-sheet" resizeKey="account-password"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t('pw.title')}
      subtitle={t('pw.signsOut')}
      size="sm"
      dirty={!held && !noPassword && Boolean(current || next || again)}
      busy={change.running}
      footer={
        held ? (
          <LockedFooter onClose={close} onCheck={() => void check()} checking={checking} />
        ) : (
          <>
            <DrawerCancel />
            <Button variant="primary" type="submit" form={FORM} busy={change.running} isDisabled={noPassword} disabledReason={noPassword ? t('e.noPasswordTitle') : undefined}>
              {t('pw.save')}
            </Button>
          </>
        )
      }
    >
      {held && (
        <div className={s.banner}>
          <OutcomeBanner
            kind="pending"
            known={unsure ? t('check.unknownPw') : undefined}
            checkLine={unsure ? t('check.checkLinePw') : undefined}
            stopLine={unsure ? t('check.stopLine') : undefined}
            // The two ways out that are neither Close nor Check again sit on the banner that explains them, so the foot
            // keeps Close and Check again only.
            actions={
              <>
                <Button size="sm" onPress={signInAgain}>{t('pw.signInAgain')}</Button>
                {unsure === true && (
                  <Button
                    size="sm"
                    onPress={() => {
                      // useChangePassword.dismiss: core's useLockedChange, on the live scope (no render-snapshot guarantee).
                      // The page lock settles only once core stored the free, in the context it was pressed in, and only
                      // the lock version it was pressed over: a newer send's lock stays.
                      const at = pressContext(), v = locks.version('password');
                      void change.dismiss().then((freed) => {
                        if (!freed || !at.still()) return;
                        if (releaseOp('password', v)) setUnsure(false);
                      });
                    }}
                  >
                    {t('check.startOver')}
                  </Button>
                )}
              </>
            }
          />
        </div>
      )}
      {noPassword && <NoPasswordBanner asks="change" />}
      {banner && <div className={s.banner}><OutcomeBanner kind="failed" title={t('pw.failedTitle')} body={banner} /></div>}
      <form
        id={FORM}
        className={s.form}
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
          isDisabled={held || noPassword}
          value={current}
          onChange={setCurrent}
          errorMessage={errors.server ?? (errors.current ? t(FIELD_ERROR[errors.current]) : undefined)}
        />
        <SecretInput
          kind="new-password"
          label={t('pw.new')}
          reveal={false}
          isDisabled={held || noPassword}
          value={next}
          onChange={setNext}
          errorMessage={errors.password ? t(FIELD_ERROR[errors.password]) : undefined}
        />
        <RuleChecklist
          label={t('pw.rulesLabel')}
          rules={[
            { id: 'length', label: t('pw.ruleLength'), met: checks.length },
            { id: 'classes', label: t('pw.ruleClasses'), met: checks.classes },
            { id: 'differs', label: t('pw.ruleDiffers'), met: checks.differs },
          ]}
        />
        <SecretInput
          kind="new-password"
          label={t('pw.again')}
          reveal={false}
          isDisabled={held || noPassword}
          value={again}
          onChange={setAgain}
          errorMessage={errors.again ? t(FIELD_ERROR[errors.again]) : undefined}
        />
      </form>
    </Drawer>
  );
}
