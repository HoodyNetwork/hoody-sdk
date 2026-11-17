// An account with no computer: what it can do next depends on why (a create of this browser still under way,
// nothing here yet, unknown, invite needed, free servers full, free tier already used, or its server expired).
// "Being prepared" shows only with positive evidence (useZeroState).
import { Button, ConfirmDialog, EmptyState, NotifyHint, OutcomeBanner, SecretInput, Skeleton, useGo, useStrings } from '@kit';
import { reinstalledOffers, useRealms } from '@core';
import { useState } from 'react';
import { useCreate, useRedeem, useZeroState } from '../data';
import { links } from '../links';
import { useOut } from './useOut';
import strings from '../strings.en.json';
import { Held } from './Held';
import { useRunner } from './runner';
import s from './parts.module.css';

/** onCreate: opens the Create drawer (absent when this session may not create). onImport: opens the picker of a
 *  computer from another realm (absent when this session may not change a computer's realms). realmCount: the realms
 *  this login sees (the import offer needs several). */
export function ZeroState({ onDone, onCreate, onImport, realmCount }: { onDone: () => void; onCreate?: () => void; onImport?: () => void; realmCount: number }) {
  const t = useStrings(strings);
  const zero = useZeroState();
  const pinned = useRealms().pinned;
  const redeem = useRunner(useRedeem(), { lock: 'invite.redeem', change: 'redeem', vars: () => ({ code: '' }) });
  const create = useCreate();
  const [code, setCode] = useState('');
  // The unclaimed holds the person was asked about (null: no question open). Only those are freed.
  const [asked, setAsked] = useState<typeof zero.unclaimed | null>(null);
  const out = useOut();
  const go = useGo();
  const kind = zero.kind;
  const offers = reinstalledOffers(zero.room);

  // The first setup read is still out: a loading placeholder, nothing to say yet (never "being prepared").
  if (!kind) return <Skeleton variant="rows" rows={2} />;
  if (kind === 'provisioning') {
    return (
      <div className={s.stack}>
        {/* A held create (outcome unknown) never updates by itself: its check and Dismiss live in the Create drawer's
            Held band. Never shown as failed. */}
        <EmptyState
          icon="computer"
          title={t('zero.provisioning.title')}
          /* A login that may not create cannot open the drawer that checks it: say who can, and where. */
          body={t(!zero.held ? 'zero.provisioning.body' : onCreate ? 'zero.provisioning.heldBody' : 'zero.provisioning.heldNoCreate')}
          action={zero.held && onCreate ? <Button variant="secondary" onPress={onCreate}>{t('zero.provisioning.check')}</Button> : undefined}
        />
        <NotifyHint kind="computer" />
      </div>
    );
  }
  if (kind === 'unknown') {
    // A held create that records no sender (an older build's, converted on load) can be neither checked nor shown
    // in the Create drawer: its one way out is the person's warned Dismiss, which frees only the holds
    // shown when it was asked (core dismissHeld refuses a hold that moved or another account's). Never "failed".
    const old = zero.unclaimed;
    return (
      <div className={s.stack}>
        <EmptyState
          icon="computer"
          title={t('zero.unknown.title')}
          body={t(old.length > 0 ? 'zero.unknown.oldBody' : 'zero.unknown.body')}
          action={
            <>
              <Button variant="secondary" busy={zero.isFetching} onPress={() => { void zero.refetch(); onDone(); }}>{t('zero.retry')}</Button>
              {old.length > 0 ? <Button variant="ghost" onPress={() => setAsked(old)}>{t('zero.unknown.dismiss')}</Button> : null}
            </>
          }
        />
        <ConfirmDialog overlayId="computers-zero-state-held-dismiss"
          isOpen={asked !== null}
          onOpenChange={(open) => !open && setAsked(null)}
          title={t('held.dismissTitle')}
          body={<p>{t('held.dismissBody')}</p>}
          confirmLabel={t('held.dismissGo')}
          tone="danger"
          onConfirm={() => {
            const shown = asked ?? [];
            setAsked(null);
            void Promise.all(shown.map((row) => create.dismissHeld(row))).finally(onDone);
          }}
        />
      </div>
    );
  }
  if (kind === 'empty') {
    // Only as a fact (the account has a computer this realm does not hold, this login sees a realm and is not pinned
    // to one): the words point at the realm menu, and the import action adds one of those computers to this realm.
    // One realm is enough: a computer in no realm (a new account's first one) is outside it too.
    // A page never switches the realm.
    const elsewhere = zero.accountComputers === true && realmCount >= 1 && pinned === null;
    return (
      <div className={s.stack}>
        <EmptyState
          icon="computer"
          title={t('zero.empty.title')}
          body={elsewhere ? t('zero.empty.bodyElsewhere') : onCreate ? t('zero.empty.body') : t('zero.empty.bodyNoCreate')}
          action={onCreate ? <Button icon="plus" onPress={onCreate}>{t('zero.empty.create')}</Button> : undefined}
          secondary={elsewhere && onImport ? <Button variant="secondary" onPress={onImport}>{t('zero.empty.import')}</Button> : undefined}
        />
      </div>
    );
  }

  return (
    <div className={s.stack}>
      <EmptyState
        icon="computer"
        title={t(`zero.${kind}.title`)}
        body={t(`zero.${kind}.body`)}
        // The invite card below is the one card: the empty state above it is the plain small look, never a second card
        // stacked over it.
        {...(kind === 'invite' ? { size: 'sm' as const } : {})}
        action={
          // Where a computer can come from instead: a rented server when the free ones are full, a renewal when access ended.
          kind === 'capacity' && out.has.market ? (
            <span className={s.row}>
              <Button onPress={() => out.market()}>{t('zero.capacity.rent')}</Button>
              {out.has.buy ? <Button variant="ghost" onPress={() => out.plans()}>{t('zero.plans')}</Button> : null}
            </span>
          ) : kind === 'expired' && out.has.buy ? (
            <Button onPress={() => out.billing()}>{t('zero.expired.renew')}</Button>
          ) : kind === 'reinstalled' ? (
            // The server its computers ran on was reinstalled: nothing to renew. They are deleted in Projects (each
            // project's Computers tab).
            <Button onPress={() => go(links.projects)}>{t('zero.reinstalled.projects')}</Button>
          ) : undefined
        }
        // ...and beside it a new computer: Create when there is a server or slice to create on, Rent unless one is known
        // to have room (core reinstalledOffers), so an account with no server is never stuck.
        secondary={kind === 'reinstalled' && (offers.create && onCreate || offers.rent && out.has.market) ? (
          <>
            {offers.create && onCreate ? <Button variant="secondary" icon="plus" onPress={onCreate}>{t('zero.empty.create')}</Button> : null}
            {offers.rent && out.has.market ? <Button variant="secondary" onPress={() => out.market()}>{t('zero.capacity.rent')}</Button> : null}
          </>
        ) : undefined}
      />
      {kind === 'invite' ? (
        <div className={s.card}>
          <h4>{t('zero.invite.card')}</h4>
          {redeem.held ? (
            <Held kind="redeem" name="" elsewhere={redeem.elsewhere} onCheck={async () => { if (await redeem.check()) onDone(); }} onDismiss={redeem.dismiss} />
          ) : (
          <>
          <SecretInput label={t('zero.invite.label')} value={code} onChange={(v) => setCode(v.toUpperCase())} reveal />
          <div className={s.row}>
            <Button
              variant="primary"
              busy={redeem.busy}
              isDisabled={!code.trim()}
              onPress={() => void redeem.run({ code: code.trim() }).then((r) => { setCode(''); if (r.outcome === 'done') onDone(); })}
            >
              {t('zero.invite.go')}
            </Button>
          </div>
          {redeem.outcome && redeem.outcome.kind !== 'done' ? <OutcomeBanner kind={redeem.outcome.kind} onCheck={() => void redeem.check().then((ok) => ok && onDone())} /> : null}
          </>
          )}
        </div>
      ) : null}
    </div>
  );
}
