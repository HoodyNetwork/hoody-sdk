// Profile: who this account is, as setting rows. The account id shows only its ends; the full value goes to
// the clipboard. The display name and the email change in their drawers; account deletion goes through support.
// A waiting email change shows its address and expiry with Cancel. A cancel whose outcome is unknown gets its own row
// with Check again (the profile read back with nothing waiting, an explicit null, proves it; nothing is resent, C9),
// shown whatever the profile now says, and after an inconclusive check a warned Start over. Change email stays off
// while the undo window is open, and turns back on when it ends (the profile is read again then). An address that is
// not verified yet offers its verification mail again (once: the row then says where to look, and a refusal says its
// wait), and Change email waits for it with its reason, since the server refuses a change until then.
import { Button, ErrorState, IdChip, Skeleton, StatusPill, formatDate, useStrings, SettingRow } from '@kit';
import { useEffect, useState } from 'react';
import { pressContext, useArmedHolds, useEmailCancel, useEmailStart, useProfile, useRename } from '../data';
import { DismissNote } from './DismissNote';
import strings from '../strings.en.json';
import { locks, releaseOp, stillOut, useOpLock } from './locks';
import { useMailAsk } from './mailAsk';
import m from './Mono.module.css';

export interface ProfileSectionProps {
  onRename: () => void;
  onEmail: () => void;
  /** A line for the page's notice (a cancel's outcome): done, or `failed` for a cancel the API refused. An unknown
   *  outcome is never said there: its own row says it, with Check again (C9). */
  onSay: (text: string, kind?: 'done' | 'failed') => void;
}

export function ProfileSection({ onRename, onEmail, onSay }: ProfileSectionProps) {
  const t = useStrings(strings);
  const profile = useProfile();
  const rename = useRename();
  const start = useEmailStart();
  const cancel = useEmailCancel();
  const [checking, setChecking] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [nothing, setNothing] = useState(false);
  const armed = useArmedHolds(unsure, cancel.heldNow);
  const verify = useMailAsk('verify');
  // The undo window, judged against the clock at each render (a profile can arrive after its own deadline); one timer
  // renders again and re-reads the profile when a future deadline passes.
  const undoUntil = profile.data?.undoUntil;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const end = typeof undoUntil === 'string' ? Date.parse(undoUntil) : NaN;
    if (!Number.isFinite(end) || end <= Date.now()) return;
    // setTimeout holds at most 2^31-1 ms; a later end re-arms when this fires.
    const id = setTimeout(() => {
      setNow(Date.now());
      void profile.refetch();
    }, Math.min(end - Date.now() + 1000, 2 ** 31 - 1));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoUntil, now]);
  // As the drawer: core's hold survives a reload, the page's lock does not.
  const held = useOpLock('name') === 'pending' || rename.pending;
  const emailHeld = useOpLock('email') === 'pending' || start.pending;
  const cancelLock = useOpLock('emailCancel');
  const cancelHeld = cancelLock === 'pending' || cancel.pending;
  if (profile.isPending) return <Skeleton variant="rows" rows={4} />;
  if (profile.error || !profile.data) return <ErrorState size="sm" title={t('loadFailed')} onRetry={() => void profile.refetch()} />;
  const me = profile.data;
  const none = t('p.none');
  const undoOpen = typeof me.undoUntil === 'string' && Date.parse(me.undoUntil) > Date.now();
  // Not verified as the profile reads it (a failed read never gets here): the verification mail can be asked again.
  const unverified = me.email !== '' && !me.emailVerified;

  const runCancel = async () => {
    if (cancel.running || cancelLock || cancelHeld) return;
    const ep = locks.sent('emailCancel');
    const r = await cancel.run();
    locks.settle('emailCancel', stillOut(r), ep);
    if (r.outcome === 'done') {
      void profile.refetch();
      onSay(t('e.cancelled'));
    } else if (!stillOut(r)) {
      onSay(t('e.cancelFailed'), 'failed');
    }
  };
  // Nothing waiting any more proves the cancel; anything else stays unknown.
  const checkCancel = async () => {
    const v = locks.version('emailCancel');
    const own = locks.snapshot().get('emailCancel') !== undefined;
    setChecking(true);
    const proven = await cancel.readBack();
    const r = await profile.refetch();
    setChecking(false);
    if (proven && !r.isError && r.data && r.data.pendingEmail === null && (own ? releaseOp('emailCancel', v) : locks.snapshot().get('emailCancel') === undefined)) {
      setUnsure(false);
      onSay(t('e.cancelled'));
    } else {
      armed.retake();
      setNothing(false);
      setUnsure(true);
    }
  };
  // The warned Start over: frees the shown hold and the page lock it was pressed over; Cancel can then be pressed again.
  const startOver = () => {
    const at = pressContext(), v = locks.version('emailCancel');
    void cancel.dismissRows(armed.shown()).then((freed) => {
      if (!at.still()) return;
      if (!freed) {
        setNothing(true);
        return;
      }
      if (releaseOp('emailCancel', v) || locks.snapshot().get('emailCancel') === undefined) setUnsure(false);
    });
  };
  return (
    <>
      <SettingRow
        label={t('p.alias')}
        actions={
          held ? (
            <Button onPress={onRename}>
              {t('check.again')}
            </Button>
          ) : (
            <Button onPress={onRename}>{t('p.rename')}</Button>
          )
        }
      >
        {me.alias ? <bdi>{me.alias}</bdi> : none}
      </SettingRow>
      <SettingRow label={t('p.username')}>{me.username ? <bdi>{me.username}</bdi> : none}</SettingRow>
      <SettingRow
        label={t('p.email')}
        // The row's one sentence while the address is not verified: what to do, then (once asked) where to look.
        help={!unverified ? undefined : verify.sentTo !== null ? t('mail.sentVerify', { email: verify.sentTo }) : verify.unsure ? t('mail.unsure') : t('p.unverifiedHelp')}
        outcome={unverified && verify.refused ? { kind: 'failed' } : undefined}
        // noDetails: the ask answers with a typed outcome only (too many asks, a fault); there is no rejection to show.
        detail={unverified ? (verify.refused ?? undefined) : undefined}
        actions={
          emailHeld ? (
            <Button onPress={onEmail}>
              {t('check.again')}
            </Button>
          ) : (
            // One action at a time (two do not fit a phone's row): the verification mail while it can be asked for,
            // else Change email, which waits with its reason until the address is verified.
            unverified && verify.canSend ? (
              <Button busy={verify.busy} onPress={() => verify.send(me.email)}>
                {t('p.resend')}
              </Button>
            ) : (
              <Button onPress={onEmail} isDisabled={undoOpen || unverified} disabledReason={unverified ? t('e.verifyFirst') : undefined}>
                {t('e.change')}
              </Button>
            )
          )
        }
      >
        {me.email ? (
          <span className={m.line}>
            <bdi>{me.email}</bdi>
            <StatusPill tone={me.emailVerified ? 'ok' : 'warn'}>{t(me.emailVerified ? 'p.verified' : 'p.unverified')}</StatusPill>
          </span>
        ) : (
          none
        )}
      </SettingRow>
      {cancelHeld ? (
        <SettingRow
          label={t('e.title')}
          actions={
            <>
              <Button busy={checking} onPress={() => void checkCancel()}>
                {t('check.again')}
              </Button>
              {unsure && <Button onPress={startOver}>{t('check.startOver')}</Button>}
            </>
          }
        >
          {unsure ? `${t('e.cancelUnknown')} ${t('check.dismissWarn')}` : t('e.cancelUnknown')}
          <DismissNote show={nothing} />
        </SettingRow>
      ) : (
        typeof me.pendingEmail === 'string' && (
          <SettingRow
            label={t('e.title')}
            actions={
              <Button chip={false} busy={cancel.running} onPress={() => void runCancel()}>
                {t('e.cancel')}
              </Button>
            }
          >
            {me.pendingUntil ? (
              t('e.waiting', { email: me.pendingEmail, date: formatDate(me.pendingUntil) })
            ) : (
              <bdi>{me.pendingEmail}</bdi>
            )}
          </SettingRow>
        )
      )}
      {undoOpen && <p className={m.help}>{t('e.undoOpen', { date: formatDate(me.undoUntil as string) })}</p>}
      <SettingRow label={t('p.since')}>{me.since ? formatDate(me.since) : none}</SettingRow>
      <SettingRow label={t('p.id')}>
        <IdChip id={me.id} />
      </SettingRow>
      <p className={m.help}>{t('p.supportNote')}</p>
    </>
  );
}
