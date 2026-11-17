// Change the account email, in a drawer. The new address and the current password go to the server, which
// mails a confirm link to the new address; nothing changes until it is opened. With 2FA on, core's prompt asks for
// the code (OTP_REQUIRED), as for every 2FA-gated change. The address is judged before it is sent (empty, not an
// address, unchanged). The password field is emptied as the send starts and whenever the drawer is locked: it never
// waits in the drawer for a prompt, a recovery or another tab's send. A send whose outcome is unknown locks the
// drawer: Check again reads the profile back, and only the asked address waiting proves it; nothing is resent (C9).
import { keepsChanges, onBump } from '@core';
import { Button, Drawer, DrawerCancel, Facts, OutcomeBanner, SecretInput, StatusLine, TextField, Why, formatDate, useStrings, useWipeOn } from '@kit';
import { useEffect, useState } from 'react';
import { emailKey, pressContext, useArmedHolds, useEmailStart, useProfile } from '../data';
import { pageFaq } from '../faq';
import { emailErrorKey, emailProblem, limitWords, refusal } from '../logic';
import strings from '../strings.en.json';
import { LockedFooter } from './Footers';
import { locks, releaseOp, stillOut, useOpLock } from './locks';
import { useMailAsk } from './mailAsk';
import { NoPasswordBanner } from './NoPasswordBanner';
import s from './Rules.module.css';

const FORM = 'account-email-form';
const FIELD_ERROR = { empty: 'e.eEmpty', invalid: 'e.eInvalid', same: 'e.eSame' } as const;

// The address of the last send (never a secret), kept across the drawer's remounts so Check again compares the profile
// with what this send asked, not with whatever is waiting now. Dropped with the page's locks (account change, sign-out).
let lastAsked: string | null = null;
onBump((reason) => {
  if (!keepsChanges(reason)) lastAsked = null;
});

/** The address core's current hold of the change names; null when it names none. */
function holdEmailOf(rows: readonly { identity: unknown }[]): string | null {
  for (const r of rows) {
    const e = (r.identity as { email?: unknown } | null)?.email;
    if (typeof e === 'string' && e) return e;
  }
  return null;
}

/** Which request Check again reads, and whether it is this tab's. A tab announces only its own request: the address it
 *  asked, the address core holds and the address the profile waits on are one. A hold another tab put in place of this
 *  tab's send (`own`: this tab's lock is still out) leaves this send's outcome unknown; Check again then reads the other
 *  tab's request (`other`), and a proof says that one is waiting, never that this tab sent it. Without a send of its
 *  own (recovering after a reload) the tab reads core's hold. */
export function checkTarget(own: boolean, asked: string | null, rows: readonly { identity: unknown }[]): { email: string | null; other: boolean } {
  const hold = holdEmailOf(rows);
  if (!own) return { email: hold, other: false };
  if (hold !== null && hold !== asked) return { email: hold, other: true };
  return { email: asked, other: false };
}

export interface EmailSheetProps {
  open: boolean;
  onClose: () => void;
  /** A confirm link was sent to this address: by this tab, or (`other`) by the tab whose send replaced this one's. */
  onSent: (email: string, other: boolean) => void;
}

export function EmailSheet({ open, onClose, onSent }: EmailSheetProps) {
  const t = useStrings(strings);
  const profile = useProfile();
  const start = useEmailStart();
  const lock = useOpLock('email');
  // Core's own hold of the change survives a reload (the page's lock does not): either one locks the drawer.
  const held = lock === 'pending' || start.pending;
  const current = profile.data?.email ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<{ text: string; noPassword: boolean; error: { outcome: string; code?: string; status?: number } } | null>(null);
  // An account without a password (a GitHub or Google sign-up, for one) cannot give the one this change asks for: the drawer says
  // so before anything is typed, and offers the mail whose link sets one (the password row's own action and state).
  // Only a profile that says so counts; otherwise the server's refusal (PASSWORD_NOT_SET) brings the same action.
  const reset = useMailAsk('reset');
  const noPassword = !held && profile.data?.hasPassword === false;
  const setFirst =
    current !== '' && reset.canSend ? (
      <Button size="sm" busy={reset.busy} onPress={() => reset.send(current)}>
        {t('pw.set')}
      </Button>
    ) : undefined;
  const [checking, setChecking] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [nothing, setNothing] = useState(false);
  const armed = useArmedHolds(unsure, start.heldNow);

  const forgetSecrets = () => setPassword('');
  // A locked drawer (this send, a send from another mount or tab, a recovery) keeps no password typed before it.
  useEffect(() => {
    if (held) setPassword('');
  }, [held]);
  const close = () => {
    setEmail('');
    forgetSecrets();
    setErrors({});
    setBanner(null);
    setUnsure(false);
    setNothing(false);
    onClose();
  };
  // The context ended (account or realm switch, sign-out, page hide): everything typed goes with the drawer.
  useWipeOn(close);

  // Another tab's send replaced this tab's: the banner says this one's outcome is unknown and that Check again reads theirs.
  const replaced = held ? checkTarget(!!lock, lastAsked, start.heldNow()) : null;
  const otherEmail = replaced?.other ? replaced.email : null;

  const lockedText = (): string => {
    const until = profile.data?.undoUntil;
    return until ? t('e.locked', { date: formatDate(until) }) : t('e.lockedNoDate');
  };

  const submit = async () => {
    // A 'sent' lock is a send still out (this drawer remounted): nothing goes twice.
    if (start.running || lock || held || noPassword) return;
    setBanner(null);
    const problem = emailProblem(email, current);
    const next: typeof errors = {};
    if (problem) next.email = t(FIELD_ERROR[problem]);
    if (!password) next.password = t('e.ePassword');
    setErrors(next);
    if (Object.keys(next).length) return;
    const asked = email.trim();
    const sentPassword = password;
    // The password leaves the drawer as the send starts (a 2FA prompt can keep the send open for minutes).
    forgetSecrets();
    lastAsked = emailKey(asked);
    const ep = locks.sent('email');
    const r = await start.run({ email: asked, password: sentPassword });
    locks.settle('email', stillOut(r), ep);
    if (r.outcome === 'done') {
      onSent(emailKey(asked), false);
      close();
    } else if (r.cancelled) {
      // Cancel on the two-step code prompt: nothing was sent and nothing is said; the address stays as typed.
    } else if (!stillOut(r) && (r.outcome === 'failed' || r.outcome === 'not_sent')) {
      const key = emailErrorKey(refusal(r), profile.data?.emailVerified);
      if (key === 'e.locked') void profile.refetch();
      // Too many tries: a lockout after wrong codes lasts 15 minutes, and the answer names it.
      const wait = limitWords(refusal(r));
      const text = key === 'e.locked' ? lockedText() : key !== 'err.tooMany' ? t(key) : wait.key === 'err.tooManyWait' ? t(wait.key, wait.vars) : t(wait.key);
      setBanner({ text, noPassword: key === 'e.noPassword', error: { outcome: r.outcome, ...refusal(r) } });
    }
  };

  // Only the profile waiting on the address this send asked proves it, in the read taken after core's read-back: a
  // read-back that is true because no hold is left, or an address another device asked, proves nothing.
  const check = async () => {
    const v = locks.version('email');
    const own = locks.snapshot().get('email') !== undefined;
    const target = checkTarget(own, lastAsked, start.heldNow());
    setChecking(true);
    const proven = await start.readBack();
    const r = await profile.refetch();
    setChecking(false);
    const waiting = r.data?.pendingEmail;
    const proves = target.email !== null && typeof waiting === 'string' && emailKey(waiting) === target.email;
    if (proven && !r.isError && proves && (own ? releaseOp('email', v) : locks.snapshot().get('email') === undefined)) {
      lastAsked = null;
      onSent(target.email!, target.other);
      close();
    } else {
      armed.retake();
      setNothing(false);
      setUnsure(true);
    }
  };

  return (
    <Drawer
      overlayId="account-email-sheet"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      resizeKey="account-email"
      title={t('e.title')}
      subtitle={t('e.leadShort')}
      size="sm"
      dirty={!held && (email !== '' || password !== '')}
      busy={start.running}
      footer={
        held ? (
          <LockedFooter onClose={close} onCheck={() => void check()} checking={checking} />
        ) : (
          <>
            <DrawerCancel />
            <Button variant="primary" type="submit" form={FORM} busy={start.running} isDisabled={noPassword} disabledReason={noPassword ? t('e.noPassword') : undefined}>
              {t('e.send')}
            </Button>
          </>
        )
      }
    >
      {/* The outcome first, then the current address, the form, and the Why below it. */}
      {held && (
        <div className={s.banner}>
          <OutcomeBanner
            kind="pending"
            // noDetails: a send whose answer never came has no rejection to show; the banner offers the read-back. The
            // "nothing stopped" note answers the banner's warned Stop tracking, so it is the banner's last sentence (the
            // banner is an alert: the note is announced as it appears).
            body={[
              otherEmail ? t('e.replaced', { email: otherEmail }) : unsure ? t('check.unknown') : t('err.pending'),
              unsure ? t('check.dismissWarn') : '',
              nothing ? t('check.nothing') : '',
            ]
              .filter(Boolean)
              .join(' ')}
            actions={
              unsure ? (
                <Button
                  size="sm"
                  onPress={() => {
                    // The warned Stop tracking: frees the shown hold in the context it was pressed in, and only the lock
                    // version it was pressed over.
                    const at = pressContext(), v = locks.version('email');
                    forgetSecrets();
                    void start.dismissRows(armed.shown()).then((freed) => {
                      if (!at.still()) return;
                      if (!freed) {
                        setNothing(true);
                        return;
                      }
                      if (releaseOp('email', v)) {
                        lastAsked = null;
                        setUnsure(false);
                      }
                    });
                  }}
                >
                  {t('check.startOver')}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {/* A hold that went away while Start over ran (another tab settled it) unlocks the drawer and takes the banner with
          it: the "nothing stopped" answer then stays here, in a polite line that is always mounted. */}
      <StatusLine>{!held && nothing ? t('check.nothing') : null}</StatusLine>
      {banner && (
        <div className={s.banner}>
          <OutcomeBanner
            kind="failed"
            title={t('sheet.failedTitle')}
            body={banner.noPassword ? [banner.text, reset.said ?? reset.refused ?? ''].filter(Boolean).join(' ') : banner.text}
            error={banner.error}
            actions={banner.noPassword ? setFirst : undefined}
          />
        </div>
      )}
      {noPassword && !banner && <NoPasswordBanner asks="email" />}
      {current !== '' && <Facts layout="spec" columns={1} items={[{ label: t('e.current'), value: current }]} />}
      <form
        id={FORM}
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={t('e.new')}
          type="email"
          autoComplete="email"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          isDisabled={held || noPassword}
          value={email}
          onChange={(v) => {
            setEmail(v);
            setErrors((x) => ({ ...x, email: undefined }));
          }}
          errorMessage={errors.email}
        />
        <SecretInput
          kind="current-password"
          label={t('e.password')}
          reveal={false}
          isDisabled={held || noPassword}
          value={password}
          onChange={(v) => {
            setPassword(v);
            setErrors((x) => ({ ...x, password: undefined }));
          }}
          errorMessage={errors.password}
        />
      </form>
      <Why question={t('e.why.q')} faq={{ item: pageFaq(t).byId.emailChange, label: t('e.more') }}>
        {t('e.why.a')}
      </Why>
    </Drawer>
  );
}
