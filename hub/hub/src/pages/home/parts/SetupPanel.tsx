// The account has no computer yet: one wide panel says why and offers the one action that helps.
// Retry and redeem are sends whose outcome can be unknown: a pending answer says "may have gone
// through" and offers a read-back, never a blind resend.
import { Band, Button, ConfirmDialog, LinkButton, Meter, OutcomeBanner, Row, SecretInput, Stack, TextButton, Widget, followPageLink, useGo, usePageLink, useStrings } from '@kit';
import { reinstalledOffers, type SetupRoom } from '@core';
import { useCallback, useState } from 'react';
import strings from '../strings.en.json';
import { useRedeemInvite, useRetrySetup, type SetupKind } from '../data';
import { links as computers } from '../../computers/links';
import { links as market } from '../../market/links';
import { POLL_MS } from '../logic';
import { usePageTarget } from './usePageTarget';
import s from './parts.module.css';

interface Props {
  kind: SetupKind;
  /** 'reinstalled' only: the server list's room (core reinstalledOffers: Get a computer and/or Rent). */
  room?: SetupRoom | null;
  /** Seconds in setup when the page loaded. */
  ageSec: number;
  polls: number;
  onReread: () => Promise<boolean>;
  /** An action succeeded: bounded polling starts again. */
  onRestart: () => void;
}

export function SetupPanel({ kind, room = null, ageSec, polls, onReread, onRestart }: Props) {
  const t = useStrings(strings);
  const go = useGo();
  const marketLink = usePageLink('market');
  // Get a computer opens the create form when this load serves Computers; usePageTarget gives nothing otherwise.
  const get = usePageTarget('computers', computers.create);
  const offers = reinstalledOffers(room);
  const toMarket = () => marketLink && (marketLink.kind === 'hub' ? go(market.list) : followPageLink(marketLink, go));
  const afterAction = useCallback(() => {
    void onReread();
    onRestart();
  }, [onReread, onRestart]);
  const retry = useRetrySetup(afterAction);
  const redeem = useRedeemInvite(afterAction);
  const [code, setCode] = useState('');
  // The Stop tracking question names the send the banner showed when it opened (its change and hold token).
  const [confirmDismiss, setConfirmDismiss] = useState<{ which: 'retry' | 'redeem'; hold: string } | null>(null);
  // Pending is the lock itself, so it ends the moment a read-back releases it.
  const own = retry.heldBy === 'self' ? retry : redeem.heldBy === 'self' ? redeem : undefined;
  // That send settled or replaced meanwhile (another tab proved it, dismissed it or sent again): the question closes
  // unanswered, so its Stop tracking never frees a later send it did not show.
  const asked = confirmDismiss ? (confirmDismiss.which === 'retry' ? retry : redeem) : undefined;
  if (confirmDismiss && (asked !== own || own?.hold !== confirmDismiss.hold)) setConfirmDismiss(null);
  const elsewhere = !own && (retry.heldBy === 'other' || redeem.heldBy === 'other');
  const computersLink = usePageLink('computers');
  const pending = retry.locked || redeem.locked;
  // A pending answer is the whole story: an earlier refusal does not stay as the headline over it. Only a refused
  // code is "that code did not work"; a refusal that is not about the code (429, 5xx that did answer) says so
  // and keeps the title neutral. A 5xx that may have gone through is pending, shown by the lock.
  const refused = redeem.data?.outcome === 'failed' && [400, 404, 409, 422].includes(redeem.data.status ?? 0);
  const serverTrouble = !pending && redeem.data?.outcome === 'failed' && !refused;
  const failedCode = !pending && !serverTrouble && (kind === 'inviteFailed' || refused);

  const head = failedCode ? 'inviteFailed' : kind === 'inviteFailed' ? 'invite' : kind;
  const seconds = ageSec + Math.round((polls * POLL_MS) / 1000);
  const time = seconds < 60 ? t('setup.time.seconds', { count: seconds }) : t('setup.time.minutes', { count: Math.floor(seconds / 60) });
  const progress = kind === 'provisioning' || kind === 'stalled';
  return (
    <Widget size="l" title={t(`setup.${head}.title`)} tone={kind === 'stalled' ? 'warn' : undefined} className={s.setupPanel}>
      {kind === 'provisioning' && <Meter indeterminate size="fill" label={t(`setup.${head}.title`)} />}
      <div className={s.setup} data-setup={kind}>
        <p className={s.setupBody}>{t(`setup.${head}.body`)}</p>
        {progress && (
          <>
            <ol className={s.stepper}>
              {/* What setup does, in order. No stage's progress is read, so none is marked done, in progress or next. */}
              {(['reserve', 'create', 'start'] as const).map((id) => (
                <li key={id} className={s.stepperItem}>
                  {/* The stage's number is drawn by the style sheet (a list counter). */}
                  <span className={s.stepperMark} aria-hidden="true" />
                  <span>{t(`setup.step.${id}`)}</span>
                </li>
              ))}
            </ol>
            {kind === 'provisioning' && <p className={s.hint}>{seconds < 10 ? t('setup.provisioning.justNow') : t('setup.provisioning.elapsed', { time })}</p>}
          </>
        )}
        {(kind === 'invite' || kind === 'inviteFailed') && (
          <Stack gap={2}>
            <SecretInput label={t('setup.invite.field')} value={code} onChange={setCode} reveal />
            <div>
              <Button
                variant="primary"
                busy={redeem.isPending}
                isDisabled={code.trim() === '' || redeem.locked}
                // An empty field is why it cannot act, and it says so; a held send has its own banner.
                disabledReason={code.trim() === '' && !redeem.locked ? t('setup.invite.typeFirst') : undefined}
                onPress={() => {
                  redeem.mutate({ code: code.trim() });
                  setCode('');
                }}>
                {t('setup.invite.redeem')}
              </Button>
            </div>
          </Stack>
        )}
        {kind === 'stalled' && (
          <div>
            <Button variant="primary" busy={retry.isPending} isDisabled={retry.locked} onPress={() => retry.mutate()}>
              {t('setup.retry')}
            </Button>
          </div>
        )}
        {kind === 'capacity' && (
          <div>
            <Button onPress={() => void onReread()}>{t('setup.capacity.again')}</Button>
          </div>
        )}
        {(kind === 'mailbox' || kind === 'expired') && marketLink && (
          <div>
            <Button variant="primary" onPress={toMarket}>
              {kind === 'expired' ? t('setup.rent') : t('setup.rentFirst')}
            </Button>
          </div>
        )}
        {/* A reinstalled server's computers are deleted in Computers' Projects view (nothing renews them). Beside it: Get a
            computer when there is a server or slice to create on, Rent unless one is known to have room (core
            reinstalledOffers), so an account with no server is never stuck. */}
        {kind === 'reinstalled' && (computersLink || (offers.create && get) || (offers.rent && marketLink)) && (
          <Row gap={2} wrap>
            {computersLink && (
              <Button variant="primary" onPress={() => (computersLink.kind === 'hub' ? go(computers.projects) : followPageLink(computersLink, go))}>
                {t('setup.reinstalled.go')}
              </Button>
            )}
            {offers.create && get && <LinkButton variant="secondary" icon="plus" href={get.href}>{t('action.getComputer')}</LinkButton>}
            {offers.rent && marketLink && <Button variant="secondary" onPress={toMarket}>{t('setup.rentFirst')}</Button>}
          </Row>
        )}
        {retry.data?.code === 'COOLDOWN' && !pending && <OutcomeBanner kind="not_sent" title={t('setup.retryWait')} body={null} />}
        {serverTrouble && <OutcomeBanner kind="failed" title={t('setup.redeem.trouble')} body={null} />}
        {(retry.blocked === 'support' || redeem.blocked === 'code') && (
          <OutcomeBanner kind="failed" title={t(retry.blocked === 'support' ? 'setup.blocked.support' : 'setup.blocked.code')} body={null} />
        )}
        {pending && own && (
          <OutcomeBanner
            kind="pending"
            onCheck={() => void own.recheck()}
            onDismiss={() => {
              if (own.hold) setConfirmDismiss({ which: own === retry ? 'retry' : 'redeem', hold: own.hold });
            }}
            dismissWarned
          />
        )}
        {/* A pending lock with no recorded sender: still say so (Check again only; there is no change of ours to dismiss). */}
        {pending && !own && !elsewhere && <OutcomeBanner kind="pending" onCheck={() => void (retry.locked ? retry.recheck() : redeem.locked ? redeem.recheck() : onReread())} />}
        {pending && elsewhere && (
          <Band tone="warn" actions={computersLink && <TextButton onPress={() => (computersLink.kind === 'hub' ? go(computers.list) : followPageLink(computersLink, go))}>{t('setup.elsewhere.open')}</TextButton>}>
            {t('setup.elsewhere')}
          </Band>
        )}
        <ConfirmDialog
          overlayId="home-setup-dismiss"
          isOpen={confirmDismiss !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmDismiss(null);
          }}
          title={t('setup.dismiss.title')}
          body={t('setup.dismiss.body')}
          confirmLabel={t('setup.dismiss.confirm')}
          tone="danger"
          onConfirm={() => {
            const shown = confirmDismiss;
            setConfirmDismiss(null);
            // Core frees it only while it is still that send (dismissOne bound to its hold).
            if (shown && asked) void asked.dismiss(shown.hold);
          }}
        />
      </div>
    </Widget>
  );
}
