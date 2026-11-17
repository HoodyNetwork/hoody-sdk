// Two-step sign-in as setting rows: the state, the backup codes left and the actions, then the "ask for a code
// when API keys change" switch. An unreadable status says so; it never guesses "off". A change whose outcome
// is unknown replaces the actions with "May have gone through · Check again" until the status is read back.
import { Button, OutcomeBanner, Row, SettingRow, Skeleton, Stack, StatusPill, Switch, Why, useStrings } from '@kit';
import { useState } from 'react';
import { pressContext, provenBy, useNewCodes, useSetGate, useStartSetup, useTurnOff, useTwoFactor, useVerifySetup } from '../data';
import { pageFaq } from '../faq';
import { errorKey, limitWords, refusal } from '../logic';
import strings from '../strings.en.json';
import { type OpName, locks, releaseOp, useAnyPending, useOpLock } from './locks';

export interface TwoFactorSectionProps {
  onOpen: (sheet: 'setup' | 'codes' | 'off' | 'gate-off') => void;
}

export function TwoFactorSection({ onOpen }: TwoFactorSectionProps) {
  const t = useStrings(strings);
  const status = useTwoFactor();
  const gate = useSetGate();
  const anyLock = useAnyPending();
  const start = useStartSetup();
  const verify = useVerifySetup();
  const turnOff = useTurnOff();
  const newCodes = useNewCodes();
  const held: Record<'setup' | 'codes' | 'off' | 'gate', boolean> = {
    // Step 2 of the setup is held by core's own lock for it, which no drawer need be open to show.
    setup: useOpLock('setup') === 'pending' || verify.pending,
    codes: useOpLock('codes') === 'pending',
    off: useOpLock('off') === 'pending',
    gate: useOpLock('gate') === 'pending',
  };
  const startOnly = held.setup && !verify.pending;
  const [checking, setChecking] = useState(false);
  // A check that could not tell: the person may then forget a change no read can prove (new codes, a set-up start).
  const [unsure, setUnsure] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  if (status.isPending) return <Skeleton variant="rows" rows={3} />;
  const f = status.error ? null : status.data;

  const pending = anyLock || held.setup;
  // Each waiting change reads back through its own core lock; the status is read once after them.
  const readers: Record<OpName, () => Promise<boolean>> = {
    setup: async () => (await Promise.all([start.readBack(), verify.readBack()])).every(Boolean),
    codes: newCodes.readBack,
    off: turnOff.readBack,
    gate: gate.readBack,
    password: async () => false,
    name: async () => false,
    email: async () => false,
    emailCancel: async () => false,
  };
  const readBack = async () => {
    setChecking(true);
    const waiting = (['setup', 'codes', 'off', 'gate'] as const).filter((op) => held[op]);
    // The versions are read before the read-backs: a send made meanwhile is not freed by this answer.
    const versions = waiting.map((op) => locks.version(op));
    // One after another: they all read the same status, and a read another one cancelled proves nothing.
    const owns: boolean[] = [];
    for (const op of waiting) owns.push(await readers[op]());
    const r = await status.refetch();
    setChecking(false);
    let left = false;
    waiting.forEach((op, i) => {
      if (provenBy(owns[i] ?? false, r)) {
        releaseOp(op, versions[i] ?? -1);
        if (op === 'gate') setGateError(null);
      } else left = true;
    });
    setUnsure(left);
  };
  // Only a change with no proves can be stuck for good with the drawer closed: this is its way out (a warned Start over).
  const forgettable = held.codes || startOnly;
  const banner = (
    <OutcomeBanner
      kind="pending"
      known={unsure && forgettable ? t('check.unknown') : undefined}
      checkLine={unsure && forgettable ? t('check.checkLineNoProof') : undefined}
      stopLine={unsure && forgettable ? t('check.stopLine') : undefined}
      onCheck={() => void readBack()}
      checking={checking}
      actions={
        unsure && forgettable ? (
          <Button
            size="sm"
            onPress={() => {
              // Each page lock settles only once core stored its free, in the context it was pressed in, and only
              // the lock version it was pressed over; a refused one keeps its hold and the warning.
              const codes = held.codes, setup = startOnly;
              const at = pressContext(), vc = locks.version('codes'), vs = locks.version('setup');
              void Promise.all([codes ? newCodes.dismissShown() : true, setup ? start.dismissShown() : true]).then(([c, s]) => {
                if (!at.still()) return;
                const rc = codes && c ? releaseOp('codes', vc) : !codes;
                const rs = setup && s ? releaseOp('setup', vs) : !setup;
                if (rc && rs) setUnsure(false);
              });
            }}
          >
            {t('check.startOver')}
          </Button>
        ) : undefined
      }
    />
  );

  // A pending change shows its banner whether or not the status can be read (the status row follows it).
  if (f === null || f === undefined) {
    return (
      <>
        {pending && banner}
        <SettingRow
          label={t('2fa.title')}
          help={t('2fa.unreadHelp')}
          actions={
            <Button size="sm" onPress={() => void status.refetch()}>
              {t('sum.tryAgain')}
            </Button>
          }
        >
          {t('2fa.unreadLine')}
        </SettingRow>
      </>
    );
  }

  const label = f.enabled ? t('2fa.on') : f.setupUnfinished ? t('2fa.unfinished') : t('2fa.off');
  return (
    <>
      <SettingRow
        label={t('2fa.title')}
        help={t(f.enabled ? '2fa.leadOn' : '2fa.leadOff')}
        // While a change may have gone through its banner takes the actions' place: nothing is offered twice.
        actions={
          pending ? undefined : f.enabled ? (
            <>
              <Button onPress={() => onOpen('codes')}>{t('2fa.newCodes')}</Button>
              <Button tone="danger" onPress={() => onOpen('off')}>
                {t('2fa.turnOff')}
              </Button>
            </>
          ) : (
            <Button variant="primary" onPress={() => onOpen('setup')}>
              {t(f.setupUnfinished ? '2fa.restart' : '2fa.turnOn')}
            </Button>
          )
        }
      >
        <Stack gap={3} align="start">
          <Row gap={2} wrap>
            <StatusPill tone={f.enabled ? 'ok' : f.setupUnfinished ? 'warn' : 'neutral'} dot={f.enabled}>
              {label}
            </StatusPill>
            {f.enabled && f.codesLeft !== null && (
              <StatusPill tone={f.codesLeft <= 2 ? 'warn' : 'neutral'}>{t('2fa.codesLeft', { n: f.codesLeft })}</StatusPill>
            )}
          </Row>
          {pending && banner}
        </Stack>
      </SettingRow>
      {f.enabled && (
        <SettingRow label={t('2fa.gate')} help={t('2fa.gateHelp')}>
          <Switch
            label={t('2fa.gateSwitch')}
            isSelected={f.gate}
            isDisabled={gate.running || pending || locks.get('gate') !== undefined}
            onChange={(on) => {
              setGateError(null);
              if (!on) {
                onOpen('gate-off');
                return;
              }
              // One send at a time, here or from a page this one replaced: nothing goes while one is out.
              if (gate.running || locks.get('gate') !== undefined) return;
              const ep = locks.sent('gate');
              void gate.run({ enabled: true }).then((r) => {
                // BUSY: the send that is still out is this mount's own, and settles its own lock. READ_BACK_FIRST: an earlier send of
                // the change (an earlier mount, another tab) is still out and has no lock here: it is pending here too (the banner above
                // offers Check again), never a failure and never a press that silently does nothing.
                if (r.outcome === 'not_sent' && r.code === 'BUSY') return;
                if (r.outcome === 'not_sent' && r.code === 'READ_BACK_FIRST') {
                  locks.settle('gate', true, ep);
                  return;
                }
                // An unknown outcome locks the switch (the banner above offers Check again); it is never shown as failed.
                locks.settle('gate', r.outcome === 'pending', ep);
                if (r.outcome === 'done') void status.refetch();
                else if (r.outcome === 'failed' || r.outcome === 'not_sent') {
                  const key = errorKey(refusal(r), 'none');
                  // Too many tries says the wait when the answer named one.
                  const wait = limitWords(refusal(r));
                  setGateError(key !== 'err.tooMany' ? t(key) : wait.key === 'err.tooManyWait' ? t(wait.key, wait.vars) : t(wait.key));
                }
              });
            }}
          />
          {gateError && <OutcomeBanner kind="failed" body={gateError} onDismiss={() => setGateError(null)} />}
        </SettingRow>
      )}
      <Why question={t('2fa.why.q')} faq={{ item: pageFaq(t).byId.twoStep, label: t('2fa.more') }}>
        {t('2fa.why.a')}
      </Why>
    </>
  );
}
