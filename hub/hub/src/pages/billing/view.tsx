// The Plans & billing page: three views under one header, switched by the layout's view bar
// (`views`, ?view=plans|servers|wallet). Plans and Wallet & usage share one DetailPage element (one FAQ root); Bare metal
// is a list and an inspector. The money notices sit once in the banner, under the view bar, in every view.
// Money moves only through the Checkout drawer (?checkout=...) and the Add funds drawer (?sheet=funds); a purchase
// whose outcome is unknown stays on the page as a band with Check again; so does a top-up whose answer is unknown.
import { DetailPage, type DetailPageProps, Drawer, type PageViews, useGo, useLocationHash, useSearch, useStrings } from '@kit';
import { useCore } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { takeBuyIntent, useIdentity, useSubs, useUnknownCheckouts } from './data';
import { links, viewOf } from './links';
import { subByWholeId, upgradeState } from './logic';
import { HeldServerBands, BannedBand, ReturnBand, UnknownBands } from './parts/Bands';
import { HeldTopUpSlot } from './parts/HeldTopUp';
import { pageFaq } from './faq';
import { CheckoutDrawer } from './parts/CheckoutDrawer';
import { useFunds } from './parts/Funds';
import { OpenNotice } from './parts/OpenNotice';
import { PlansSection } from './parts/PlansSection';
import { SubscriptionsSection } from './parts/SubscriptionsSection';
import { UsageSection } from './parts/UsageSection';
import { WalletBand } from './parts/WalletRail';
import s from './parts/parts.module.css';
import { type Finding, type Held, NOT_HELD, holdSuspension, suspendedState } from './servers/data';
import { ServersView } from './servers/View';
import strings from './strings.en.json';

export default function BillingPage() {
  const t = useStrings(strings);
  const q = useSearch();
  // The route's anchor as '#name' (what viewOf and the #plans landing read), from the router, not the browser location.
  const anchor = useLocationHash();
  const hash = anchor ? '#' + anchor : '';
  const go = useGo();
  const identity = useIdentity();
  const subs = useSubs();
  const unknown = useUnknownCheckouts();
  // One suspension for the page: the identity read, plus what the Bare metal view last found (its account read and
  // its reads refused 403 ACCOUNT_BANNED). That finding outlives the view, for the account, realm and generation it
  // was made in: Check again on an unknown rent or reserve from Plans or Wallet & usage opens the checkout without
  // view=servers, and the drawer must still know.
  const core = useCore();
  const ctx = `${core.account ?? ''}|${core.realm}|${core.gen}`;
  // A suspension found stays until a full recheck clears it (holdSuspension): the reservations walk forgets its refusal
  // as soon as it reads again, on Check status or a return visit, and that walk on its way proves nothing.
  const [found, setFound] = useState<Held>(NOT_HELD);
  const onSuspension = useCallback(
    (x: Finding) => {
      const now = Date.now();
      setFound((p) => holdSuspension(p, ctx, x, now));
    },
    [ctx],
  );
  const servers = found.ctx === ctx ? found : null;
  const { banned, rejection } = suspendedState([identity.data?.banned, servers?.banned], [identity.error, servers?.rejection]);
  const plansTitle = useRef<HTMLElement | null>(null);
  const { items } = pageFaq(t);
  const view = viewOf(q.view, hash);

  // A website "Get" link captured at boot opens the Checkout drawer on the plan it named (a review, never a charge).
  const intentTaken = useRef(false);
  useEffect(() => {
    if (intentTaken.current || q.checkout) return;
    intentTaken.current = true;
    const plan = takeBuyIntent();
    if (plan) go(links.checkout('buy', { plan }));
  }, [q.checkout, go]);

  // The hand-off: ?plan=<id> marks a plan "Suggested for you"; ?sub=<whole id> says which paid server the plans speak about.
  // Only a whole id names one (every link the hub makes carries it, links.plansOn): an old short link's ending may name
  // another server once the list changes, so it names none here.
  const want = !q.checkout && q.plan ? q.plan : null;
  const target = !q.checkout ? subByWholeId(subs.data?.subs, q.sub) : null;
  // A failed subscriptions read proves nothing about the server now, even with an earlier read still cached: no target,
  // so nothing is bought from the columns until a read succeeds.
  const upgradeTarget = target && !subs.isError && upgradeState(target) === 'ok' ? target : null;

  // Landing on #plans (a hand-off, "See plans", "Get more AI") moves focus to the plans heading. Nothing opens by itself.
  const wantsPlans = !q.checkout && (want !== null || hash.endsWith('#plans'));
  const landed = useRef(false);
  useEffect(() => {
    if (!wantsPlans || landed.current || !plansTitle.current) return;
    landed.current = true;
    plansTitle.current.scrollIntoView({ block: 'start' });
    plansTitle.current.focus({ preventScroll: true });
  });

  // The view bar (the layout draws it under the header, at the same y in every view), then the banner: the money
  // notices (one list of unknown purchases). servers/View.tsx passes the same for Bare metal.
  const views: PageViews = {
    label: t('view.label'),
    value: view,
    onChange: (v) => go(links.view(viewOf(v, ''))),
    items: [
      { id: 'plans', label: t('view.plans') },
      { id: 'servers', label: t('view.servers') },
      { id: 'wallet', label: t('view.wallet') },
    ],
  };
  const banner = (
    <>
      <OpenNotice t={t} />
      {banned && <BannedBand t={t} error={rejection} checking={identity.isFetching} onCheck={() => void identity.refetch()} />}
      <HeldServerBands t={t} banned={banned} />
      <ReturnBand t={t} />
      <HeldTopUpSlot t={t} banned={banned} />
      <UnknownBands t={t} items={unknown} />
    </>
  );

  // DetailPage's header (no `context`: its pane header has no context row); ServersView takes it as PageHeader props.
  const header: DetailPageProps['header'] = {
    title: t('title'),
    subtitle: t('subtitle'),
    primary: {
      label: t('addFunds'),
      icon: 'plus',
      // Add funds ends in a dollar sign, on Plans, Wallet & usage and Bare metal alike.
      glyph: 'dollar',
      onPress: () => go(links.funds(view === 'plans' ? undefined : links.view(view))),
      isDisabled: banned,
    },
  };

  return (
    <>
      {view === 'servers' ? (
        <ServersView header={header} views={views} onSuspension={onSuspension} held={servers} />
      ) : (
        <DetailPage header={header} views={views} banner={banner} faq={{ items }}>
          {/* One column at every width (no rail). Wallet & usage: the wallet is the view's summary card, then the sections. */}
          <div className={s.sections}>
            {view === 'wallet' ? (
              <>
                <WalletBand t={t} />
                <SubscriptionsSection t={t} banned={banned} />
                <UsageSection t={t} banned={banned} />
              </>
            ) : (
              <PlansSection
                t={t}
                banned={banned}
                want={want}
                target={upgradeTarget}
                asked={!q.checkout && q.sub ? q.sub : null}
                titleRef={(el) => {
                  plansTitle.current = el;
                }}
              />
            )}
          </div>
        </DetailPage>
      )}
      <FundsDrawer t={t} open={q.sheet === 'funds'} from={q.from} banned={banned} />
      <CheckoutDrawer t={t} banned={banned} />
    </>
  );
}

// `banned`: the page's one suspension (suspendedState). A ?sheet=funds URL still opens the drawer while Add funds is
// disabled, so the drawer itself offers nothing that sends.
function FundsDrawer({ t, open, from, banned }: { t: ReturnType<typeof useStrings<typeof strings>>; open: boolean; from: string | undefined; banned: boolean }) {
  const go = useGo();
  if (!open) return null;
  return <FundsOpen t={t} banned={banned} onClose={() => go(from && from.startsWith('/') && !from.startsWith('//') ? from : links.billing, { replace: true })} />;
}

function FundsOpen({ t, onClose, banned }: { t: ReturnType<typeof useStrings<typeof strings>>; onClose: () => void; banned: boolean }) {
  // The form's lede is this drawer's subtitle; its body ends with the one Why ("How adding funds works").
  const funds = useFunds(t, onClose, t('action.cancel'), null, banned, { subtitleShown: true });
  return (
    <Drawer overlayId="billing-topup-drawer" resizeKey="billing-view"
      isOpen
      onOpenChange={(o) => !o && !funds.busy && onClose()}
      title={t('top.title')}
      subtitle={t('top.lede')}
      size="sm"
      busy={funds.busy}
      dirty={funds.dirty}
      footer={funds.footer}
    >
      {funds.body}
    </Drawer>
  );
}
