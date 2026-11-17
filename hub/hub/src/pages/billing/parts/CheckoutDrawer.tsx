// The Checkout drawer: the one place money leaves the wallet for a plan, a payment, an upgrade, a rental or a
// reservation. It is the only drawer that locks while a charge is in flight (x, Esc and the scrim do nothing), and
// an outcome that is unknown is "it may already have gone through": Check again only reads, and the kept request is
// sent again only through the separate, confirmed "Send the same request again" (never a new key). Review, consent
// and the shortfall step are all here; the state machine is
// checkout-logic.ts, the quotes and the send are hub-core's.
import { commerceRules, isStandalone, listingRules, servedHubUrl, useCore } from '@core';
import {
  Button,
  Checkbox,
  Facts,
  ConfirmDialog,
  Drawer,
  DrawerCancel,
  EmptyState,
  ErrorState,
  FaqLink,
  Icon,
  IdChip,
  Link,
  LinkButton,
  Notice,
  OutcomeBanner,
  RadioGroup,
  ReasonButton,
  Select,
  Skeleton,
  Stack,
  StatusLine,
  countryFlag,
  formatDate,
  formatDateTime,
  Ledger,
  Verdict,
  useFieldLock,
  useGo,
  usePathname,
  useSearch,
  useStringParts,
  useStrings,
} from '@kit';
import { type MutableRefObject, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CheckoutTarget,
  checkHeldAttempt,
  heldMissing,
  checkHeldPurchase,
  type HeldResult,
  heldAttemptShown,
  heldMarketShown,
  type ResendShown,
  resendHeldAttempt,
  resendHeldPurchase,
  hasHeldPurchase,
  markResume,
  useBalance,
  useCheckout,
  useListing,
  usePlanRegions,
  resumeRegion,
  forgetResumeRegion,
  usePlans,
  useServerKinds,
  useSubs,
  useUnknownCheckouts,
  useUsage,
} from '../data';
import { type CheckoutKind, type CheckoutQuote, type CheckoutState, type QuoteLine, canClose, confirmFooter, failedMayHaveGone, planInSubtitle, shortfall } from '../checkout-logic';
import type { Listing, ReserveNewShown } from '../data';
import { type SpecRow, cents, heldRef, pickHeld, refusedHere, subByWholeId, subHandleShared, subHandleShort, subPlaceName, freeName, hostLabel, planByHandle, planCard, planRows, subHandle, upgradeAi, upgradeCandidates, validPlan } from '../logic';
import { type PaidPlace, type PaidRegion, placeName } from '../plans-regions';
import { links, viewOf } from '../links';
import { usePlace } from '../pagelinks';
import type { RawPlan, RawSub, Word } from '../types';
import { pageFaq } from '../faq';
import { Band, Money, type T, say } from './Bits';
import { useFunds } from './Funds';
import { Resend, ResendHint, RetryIn } from './Resend';
import { ReserveNew } from './ReserveNew';
import { legalUrl } from './legal';
import { LOC_RADIO_MAX } from './locationPicker';
import { MoneyHandoff, moneyInWebHub } from './moneyHandoff';
import strings from '../strings.en.json';
import s from './parts.module.css';

const KINDS = new Set<string>(['buy', 'pay', 'upgrade', 'rent', 'reserve']);
/** The steps a suspended rent or reserve does not show: each could lead to a send, and nothing has gone through. An
 *  unknown or not-found outcome keeps its body (it may already have gone through, and Check again only reads) without
 *  its send controls; a done one keeps its done line. */
const SUSPENDED_STOPS = new Set<string>(['quoting', 'quote_error', 'review', 'failed']);
const isKind = (v: string | undefined): v is CheckoutKind => !!v && KINDS.has(v);

/** Mounts the drawer when the URL asks for one (?checkout=buy|pay|upgrade|rent|reserve). */
export function CheckoutDrawer({ t, banned }: { t: T; banned: boolean }) {
  const q = useSearch();
  const go = useGo();
  const kind = q.checkout;
  if (!isKind(kind)) return null;
  // Back to the link's own page, else to the view the drawer opened over (the link's view; none is Plans).
  const from = q.from && q.from.startsWith('/') && !q.from.startsWith('//') ? q.from : q.view ? links.view(viewOf(q.view, '')) : links.billing;
  const close = () => go(from, { replace: true });
  return (
    <Resolver
      key={`${kind}:${q.plan ?? ''}:${q.exact === 'true' ? 'exact' : ''}:${q.sub ?? ''}:${q.item ?? ''}:${q.days ?? ''}:${q.held ?? ''}`}
      t={t}
      kind={kind}
      plan={q.plan ?? null}
      exact={q.exact === 'true'}
      sub={q.sub ?? null}
      item={q.item ?? null}
      days={Number(q.days) || null}
      check={q.check === 'true'}
      heldRef={q.held || null}
      banned={banned}
      onClose={close}
    />
  );
}

interface ResolverProps {
  t: T;
  kind: CheckoutKind;
  plan: string | null;
  /** `plan` is a version id: that version or none, never an entry of a family of that name (a Plans column's link). */
  exact: boolean;
  sub: string | null;
  item: string | null;
  days: number | null;
  check: boolean;
  /** A kept request's fingerprint (heldRef), from a kept-request band: the drawer is about that request only. */
  heldRef: string | null;
  banned: boolean;
  onClose: () => void;
}

const TITLE_KEY = {
  buy: 'co.title.buy',
  pay: 'co.title.pay',
  upgrade: 'co.title.upgrade',
  rent: 'co.title.rent',
  reserve: 'co.title.reserve',
} as const;

/** What one step of the drawer shows. One Drawer renders every step, so moving between steps never swaps drawers. */
interface Frame {
  title: string;
  subtitle?: ReactNode;
  body: ReactNode;
  footer: ReactNode;
  phase?: string;
  locked?: boolean;
  /** What the review's top says after a send that changed nothing (kit Drawer `topNote`). */
  topNote?: string | null;
  onOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  backLabel?: string;
}

/**
 * Finds what is being bought (a plan that is gone or a server that left the account says so, with the way out), then
 * runs the checkout. Every hook runs on every render, with a null target until the purchase is known.
 */
function Resolver({ t, kind, plan, exact, sub, item, days, check, heldRef: ref, banned: pageBanned, onClose }: ResolverProps) {
  const marketPlace = usePlace('market');
  const computers = usePlace('computers');
  // This checkout's own Hub route (path and query): the served Hub's link to it on the standalone Hub.
  const pathname = usePathname();
  const search = useSearch();
  const here = `${pathname}?${new URLSearchParams(search).toString()}`;
  // The account or realm changed under the open drawer: it closes (an unknown outcome stays in the page's band).
  const core = useCore();
  const opened = useRef({ account: core.account, realm: core.realm });
  useEffect(() => {
    if (core.account !== opened.current.account || core.realm !== opened.current.realm) onClose();
  }, [core.account, core.realm, onClose]);
  const plans = usePlans();
  const subs = useSubs();
  const listing = useListing(kind === 'rent' || kind === 'reserve' ? kind : null, item);
  const market = kind === 'rent' || kind === 'reserve';
  const needPlans = kind === 'buy' || kind === 'upgrade';
  const needSub = kind === 'pay' || kind === 'upgrade';
  const loading = (needPlans && plans.isPending) || (needSub && subs.isPending) || (market && listing.isPending);
  const failed = (needPlans && plans.isError) || (needSub && subs.isError) || (market && listing.isError);

  // An exact link: that version or none; any other: the first entry whose id or family is the handle.
  const planRec = needPlans ? planByHandle(plans.data, plan, exact) : null;
  // The subscription by the link's whole id only: a later read never retargets this drawer, and a subscription that
  // leaves the list is gone.
  const subRec = needSub ? subByWholeId(subs.data?.subs, sub) : null;
  const lst = market ? (listing.data ?? null) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const [sel, setSel] = useState<string | undefined>(undefined);
  const [funds, setFunds] = useState(false);
  // What the purchase was short by when Add funds was pressed: the top-up amount starts there.
  const [fundsNeed, setFundsNeed] = useState<number | null>(null);
  // What Check again found for a held purchase of a listing that left the market (recovery needs no catalogue).
  const [heldRes, setHeldRes] = useState<HeldResult | null>(null);
  const held = heldRes?.check ?? null;
  const [heldBusy, setHeldBusy] = useState(false);
  const unknowns = useUnknownCheckouts();
  // Named by fingerprint: only a plan or pay checkout's kept request; a market one is found by its listing.
  const byRef = ref && kind !== 'rent' && kind !== 'reserve' ? ref : null;
  const keysSig = unknowns.map((u) => u.key).join('\n');
  // `failed`: the digests could not be made here, so no fingerprint can be told apart.
  const [refs, setRefs] = useState<{ sig: string; map: ReadonlyMap<string, string>; failed?: true } | null>(null);
  useEffect(() => {
    if (!byRef) return;
    let live = true;
    const keys = keysSig ? keysSig.split('\n') : [];
    void Promise.all(keys.map(async (k) => [k, await heldRef(k)] as const)).then(
      (xs) => live && setRefs({ sig: keysSig, map: new Map(xs) }),
      () => live && setRefs({ sig: keysSig, map: new Map(), failed: true }),
    );
    return () => {
      live = false;
    };
  }, [byRef, keysSig]);
  const refsReady = !byRef || refs?.sig === keysSig;
  const named = byRef && refs ? pickHeld(unknowns, refs.map, kind, byRef) : null;
  // A pay or upgrade fingerprint names a kept request only together with that request's whole id in the link (the band
  // makes both from one record): another id, or an old short link, names none, like a shared fingerprint:
  // no recovery, no automatic Check again, no resend, the plain "can't tell" refusal.
  const namedOther = byRef !== null && needSub && !!named?.entry && named.entry.target.subId !== sub;
  const namedNone = !!named?.shared || namedOther;
  const balanceRead = useBalance();

  const title = t(TITLE_KEY[kind]);
  const resolvedPlan = !loading && !failed && needPlans && !validPlan(planRec) && !(kind === 'upgrade' && !plan) ? 'gone' : null;
  const missingSub = !loading && !failed && needSub && !subRec;
  const missingListing = !loading && !failed && market && !lst;
  const choosing = !loading && !failed && !resolvedPlan && !missingSub && kind === 'upgrade' && !!subRec && !planRec && !picked;
  const ready = !loading && !failed && !resolvedPlan && !missingSub && !missingListing && !choosing;

  const chosen = planRec ?? (picked ? (plans.data?.find((p) => p.id === picked) ?? null) : null);
  const subject = lst ? lst.name : chosen ? (chosen.text?.title ?? '') : subRec ? (subRec.plan?.title ?? hostLabel(subRec)) : '';
  // Buy a plan: where the new server goes. null is Automatic (the default); a choice is one location of the plan's own
  // list, kept with its name for the words about it. The list is read for the plan version this drawer buys.
  const [loc, setLoc] = useState<{ code: string; name: string } | null>(null);
  // Why the field is back on Automatic without the person choosing it: the choice left the list ('dropped'), or the one
  // made before Add funds has no room any more ('reset'). The field says so.
  const [locNote, setLocNote] = useState<'dropped' | 'reset' | null>(null);
  // A page that sends no payment (the one-file Hub, the terminal) has no Confirm: the purchase is made in the web Hub,
  // and so is its location. No choice is offered here (it could not be carried there), and no list is read for one.
  const handsOff = isStandalone() || moneyInWebHub();
  const regionsRead = usePlanRegions(kind === 'buy' && ready && chosen && !handsOff ? chosen.id : null);
  const target: CheckoutTarget | null = ready
    ? {
        ...(kind === 'buy' && loc ? { region: loc.code, regionName: loc.name } : {}),
        kind,
        item: market ? (lst?.id ?? item) : (chosen?.id ?? plan),
        sub: subRec ? subHandle(subRec.id) : null,
        subId: subRec?.id,
        familyId: chosen?.family_id,
        server: subRec ? hostLabel(subRec) : undefined,
        days: market ? (days ?? lst?.terms[0] ?? null) : null,
      }
    : null;

  const co = useCheckout(kind, target, subject || title);
  // A buy that adopted its family's kept request names that request's own plan (it may be another version or title
  // than the one opened), never the plan just clicked. A label only: what is held and sent is the adopted request.
  const heldTitle = kind === 'buy' ? co.heldTitle : null;
  const shownSubject = heldTitle ?? subject;
  const usage = useUsage();
  const kinds = useServerKinds();
  const freeServer = freeName(usage.data, kinds.data ?? {});
  const { state } = co;
  // Suspended: the page's one suspension, or one this drawer met itself (a read refused 403 ACCOUNT_BANNED). Either
  // stays for the drawer's life (the page's is latched here: its full clean recheck lifts the page, not this drawer),
  // so a later clean read never brings a send control back.
  const [pageSeen, setPageSeen] = useState(false);
  useEffect(() => {
    if (pageBanned) setPageSeen(true);
  }, [pageBanned]);
  const banned = pageBanned || pageSeen || state.suspended;
  const consented = state.consent;
  // A refused location (no room there now, or it left the list), at the purchase or at its quote: what has room has
  // changed, so the list is read again. The purchase was not made and its key is spent: the next Confirm is a new request.
  const locRefusal =
    state.notice && LOC_REFUSALS.has(state.notice.k)
      ? state.notice
      : state.phase === 'quote_error' && state.quoteError?.code === 'PAID_REGION_UNKNOWN'
        ? state.quoteError
        : null;
  const rereadRegions = regionsRead.refetch;
  // The refusal closed Confirm (the focus was on it): the focus goes to the Location choice (the refused place), so the
  // next key is on the control that answers it. A page with no choice (hand-off, a kept request) has none.
  const locFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!locRefusal) return;
    void rereadRegions();
    locFocus.current?.();
  }, [locRefusal, rereadRegions]);
  // A choice the list (as read now) does not hold is not offered any more: back to Automatic, said in the field. Only a
  // whole, fresh list decides: a failed or running read drops nothing. And only while the choice can still be made: a
  // request on its way, or one whose outcome is unknown, keeps the location it was sent with.
  const choosingLoc = state.phase === 'review' || state.phase === 'quoting' || state.phase === 'quote_error';
  useEffect(() => {
    if (!loc || !choosingLoc || regionsRead.isFetching || regionsRead.isError || !regionsRead.data) return;
    if (!regionsRead.data.some((r) => r.region === loc.code)) {
      setLoc(null);
      setLocNote('dropped');
    }
  }, [loc, choosingLoc, regionsRead.isFetching, regionsRead.isError, regionsRead.data]);
  // Back from Add funds: the location chosen before leaving is offered again only when the plan's fresh list has room
  // there; else the field stays on Automatic and says the choice was reset. Asked once (the record forgets it).
  const resumeFamily = kind === 'buy' && !handsOff && !heldTitle ? (chosen?.family_id ?? null) : null;
  useEffect(() => {
    if (!resumeFamily || !choosingLoc || regionsRead.isFetching || regionsRead.isError || !regionsRead.data) return;
    const code = resumeRegion(resumeFamily);
    if (!code) return;
    forgetResumeRegion();
    if (loc) return;
    const r = regionsRead.data.find((x) => x.region === code && x.available);
    if (r) setLoc({ code, name: placeName(r) });
    else setLocNote('reset');
  }, [resumeFamily, choosingLoc, loc, regionsRead.isFetching, regionsRead.isError, regionsRead.data]);
  // A kept request's location in words (the list's name for its code; the code itself when the list no longer has it).
  const placeOfCode = (code: string | null | undefined): string | null =>
    code ? placeName(regionsRead.data?.find((r) => r.region === code) ?? { region: code, country: '', city: '' }) : null;
  const fundsUi = useFunds(t, () => setFunds(false), t('co.backToCheckout'), fundsNeed, banned, { subject: subject || undefined, subtitleShown: true });

  // A held purchase of something that left the lists: Check again works from core's held record alone. A handle two
  // subscriptions share names neither, so no kept request is picked by it (its resend would go to whichever came first).
  // An old short link names no server either: every link the hub makes carries the whole id.
  const sharedSub = needSub && (subHandleShared(subs.data?.subs, sub) || subHandleShort(sub));
  // With a fingerprint the pick is by it alone: never the handle, never the server it resolves to.
  const heldEntry = byRef
    ? namedOther
      ? undefined
      : named?.entry
    : market || sharedSub
    ? undefined
    : unknowns.find(
        (u) =>
          u.target.kind === kind &&
          (kind === 'buy'
            ? u.target.item === plan || (!exact && u.target.familyId === plan)
            : // By the link's whole id only, listed or not: never a kept request whose ending matches.
              u.target.subId === sub &&
              (kind !== 'upgrade' || !plan || u.target.item === plan)),
      );
  // Named by fingerprint, the drawer never falls to another server's checkout: when the named kept request is gone
  // (settled since: Check again says so) or the handle resolves to a server other than the request's own, it stays on
  // that request. A request of the server the handle names keeps the ordinary drawer, which restores it by its key.
  // Only once the fingerprints are known: the band's automatic Check again must not run on no entry.
  // A plan in the link that is not the named request's own (a buy or upgrade) is a mismatch too, so the ordinary
  // drawer never opens another plan's checkout under the fingerprint.
  const refMismatch =
    byRef !== null &&
    refsReady &&
    !namedNone &&
    (!heldEntry ||
      (needSub && !!subRec && subRec.id !== heldEntry.target.subId) ||
      (needPlans && !!plan && heldEntry.target.item !== plan && (exact || heldEntry.target.familyId !== plan)));
  // A fingerprint that names no kept request of this kind, the digests made: core drops a kept request only on a
  // definite answer (or the account purge), so it was settled. 'none' is the band's link when its digest could not be
  // made, and a digest failure here leaves every fingerprint untold: no request can be told. Either way
  // nothing is read or offered: no Check again, no resend.
  const lostRef: 'settled' | 'unnamed' | null =
    byRef !== null && refsReady && !named?.entry && !named?.shared ? (byRef === 'none' || refs?.failed ? 'unnamed' : 'settled') : null;
  const heldView =
    held !== null ||
    refMismatch ||
    (missingListing && hasHeldPurchase(kind, item)) ||
    ((resolvedPlan !== null || missingSub) && heldEntry !== undefined);
  // Check again reads only; the confirmed resend is the one path that sends the kept request again.
  // `shown`: the kept request the resend dialog was opened for (undefined for Check again).
  const runHeld = (send: boolean, shown?: ResendShown | null) => {
    setHeldBusy(true);
    const run = market
      ? send
        ? resendHeldPurchase(kind, item, shown)
        : checkHeldPurchase(kind, item)
      : heldEntry
        ? send
          ? resendHeldAttempt(heldEntry, shown)
          : checkHeldAttempt(heldEntry)
        : Promise.resolve<HeldResult>(heldMissing());
    void run
      .then((r) => {
        // The browser explanation stays with this attempt while it is unknown, even once the held list no longer has it,
        // across Check again (a read). A confirmed resend's own answer replaces it: that answer may be a real send whose
        // outcome is unknown, or a refusal for another reason.
        // A kept buy, pay or upgrade can replay without Web Locks, so even then a plain unknown may have gone out
        // (no carry on a resend).
        setHeldRes((prev) => (!send && r.check === 'unknown' && !r.noLocks && prev?.check === 'unknown' && prev.noLocks ? { ...r, noLocks: true } : r));
        if (r.check === 'gone') void listing.refetch();
        if (r.check === 'done') {
          void balanceRead.refetch();
          void subs.refetch();
        }
      })
      .finally(() => setHeldBusy(false));
  };
  const runHeldCheck = () => runHeld(false);

  // A band's "Check again" lands here with ?check=true: one read (never a send), only when the outcome is unknown.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!check || autoChecked.current) return;
    // Named by fingerprint, the handle's own server is never read in its place: not before the fingerprints are known,
    // nor when the named request is another server's, shared or gone.
    if (state.phase === 'unknown' && !(byRef !== null && (!refsReady || refMismatch || namedNone))) {
      autoChecked.current = true;
      co.checkAgain();
    } else if (heldView && held === null && !heldBusy && !lostRef) {
      autoChecked.current = true;
      runHeldCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, state.phase, co, heldView, held, heldBusy, lostRef, byRef, refsReady, refMismatch, namedNone]);

  const plansPlace = lst?.place ?? null;
  const heading = useMemo(() => {
    const per = chosen ? t('buy.perMonth', { price: cents(chosen.price_cents_per_month) }) : null;
    switch (kind) {
      case 'buy':
        // The adopted request's plan, without the opened plan's price (not the held request's).
        return heldTitle ? { lead: heldTitle, tail: null } : { lead: chosen?.text?.title ?? subject, tail: per };
      case 'pay':
        return {
          lead: subRec ? (subRec.plan?.title ?? '') : subject,
          tail: subRec ? hostLabel(subRec) : null,
        };
      case 'upgrade':
        return {
          lead: t('up.toPlan', {
            server: subRec ? hostLabel(subRec) : '',
            plan: chosen?.text?.title ?? '',
          }),
          tail: per,
        };
      default:
        return { lead: lst?.name ?? subject, tail: plansPlace };
    }
  }, [kind, chosen, subRec, lst, subject, plansPlace, heldTitle, t]);

  const frame = ((): Frame => {
    const plain = (body: ReactNode): Frame => ({
      title,
      body,
      footer: <Button onPress={onClose}>{t('action.close')}</Button>,
    });
    if (loading || !refsReady) return plain(<Skeleton variant="rows" rows={5} />);
    if (failed) {
      return plain(
        <ErrorState
          size="sm"
          title={t('buy.loadErr')}
          // The first failed read's facts: its sentence and the Details fold.
          error={(needPlans && plans.isError ? plans.error : null) ?? (needSub && subs.isError ? subs.error : null) ?? listing.error}
          onRetry={() => {
            void plans.refetch();
            void subs.refetch();
            void listing.refetch();
          }}
        />,
      );
    }
    const heldGone = (
      <HeldGone
        t={t}
        kind={kind}
        result={heldRes}
        lost={lostRef}
        busy={heldBusy}
        computers={computers}
        market={marketPlace}
        onCheck={runHeldCheck}
        shownNow={market ? () => heldMarketShown(item) : () => (heldEntry ? heldAttemptShown(heldEntry) : null)}
        place={!market && kind === 'buy' ? placeOfCode(heldEntry?.target.region) : null}
        // Suspended: no resend (it is a send); Check again stays, it only reads. A reservation without
        // Web Locks has no resend either (it cannot send: every write of its kept request needs a granted lock), so no
        // "charges up to" words are shown for it, as the page's canResend.
        onResend={
          banned || lostRef || kind === 'rent' || (!market && !heldEntry) || (kind === 'reserve' && !commerceRules.buy.hasWebLocks())
            ? null
            : (shown) => runHeld(true, shown)
        }
      />
    );
    // A held purchase that was found done stays on its receipt: the refetch it caused may make the plan or sub reappear.
    // Named by fingerprint, the drawer stays on that kept request whatever the plan or the server's handle resolve to.
    if (heldView && (refMismatch || held === 'done' || resolvedPlan !== null || missingSub || missingListing)) return plain(heldGone);
    // A shared handle names no server: its refusal comes before anything about the plan. Two kept requests
    // with one fingerprint name neither: the same refusal, never the first.
    const ambiguous = sharedSub || namedNone;
    if (resolvedPlan && !ambiguous) {
      return plain(
        <EmptyState
          size="sm"
          icon="market"
          title={t('co.planGone')}
          body={t('buy.goneBody')}
          action={
            <Link href={links.plans} variant="nav">
              {t('seePlans')}
            </Link>
          }
        />,
      );
    }
    // A partial list (more rows than one read holds, or rows the page refused) does not prove the server is gone: a
    // whole id it did not deliver may still be the account's, so the drawer says it can't tell, in its
    // own words: the list was not read whole, nothing for support to untangle.
    const unlisted = missingSub && !!subs.data?.partial;
    if (missingSub || namedNone)
      return plain(
        <EmptyState
          size="sm"
          icon="server"
          title={t(ambiguous ? 'payAmbiguous' : unlisted ? 'payUnlisted' : 'payMissing')}
          action={
            <Link href={links.subscriptions} variant="nav">
              {t('subs.heading')}
            </Link>
          }
        />,
      );
    if (missingListing)
      return plain(
        <EmptyState
          size="sm"
          icon="market"
          title={t('mkt.listingGone')}
          action={
            marketPlace && (
              <Button size="sm" onPress={marketPlace.open}>
                {t('servers.browseMarket')}
              </Button>
            )
          }
        />,
      );
    // Upgrade asks which plan first (a plan card in the table already says it).
    if (choosing && subRec)
      return choosePlanFrame({
        t,
        sub: subRec,
        plans: plans.data ?? [],
        sel,
        onSel: setSel,
        onPick: setPicked,
        onClose,
        market: marketPlace,
      });
    if (funds) {
      return {
        title: t('top.title'),
        subtitle: fundsUi.subtitle,
        body: fundsUi.body,
        footer: fundsUi.footer,
        // A top-up in flight keeps the step: leaving would lose its recovery and could redirect late.
        locked: fundsUi.busy,
        onOpenChange: (o) => !o && !fundsUi.busy && setFunds(false),
        onBack: () => !fundsUi.busy && setFunds(false),
        backLabel: t('co.backToCheckout'),
      };
    }
    // A suspended account's rent or reserve stops at the banned body before anything went through: nothing that could
    // send is offered (Confirm, Try again). A read in flight (Check again) and a send already out keep their own step;
    // so does a known end. An unknown or not-found outcome, of any kind, keeps its body
    // and its read-only Check again with the suspended line, without Start over, Rent again or the resend;
    // the held frame (HeldGone) offers no resend while suspended.
    const shown = banned && market && SUSPENDED_STOPS.has(state.phase) ? { ...state, phase: 'banned' as const } : state;
    // Confirm's disabled state and its reason come from one helper, so neither gains a condition alone. `shown` differs
    // from `state` only on a suspension, and Confirm is off then either way. Every kind's closed Confirm is the reasoned
    // one (`why`); only Buy a plan also shows the footer reason line, which leaves out a reason the body already says.
    const cf = confirmFooter(shown, banned, kind);
    // The standalone Hub sends no payment (shared.js refuses it unsent): this checkout is finished in the served Hub.
    const handoff = isStandalone() ? servedHubUrl(here) : null;
    const confirmLabel =
      kind === 'upgrade' ? t('up.confirm') : kind === 'pay' ? t('subs.payConfirm') : kind === 'buy' ? t('buy.confirm') : t('mkt.confirmCta');
    const step = state.phase === 'review' || state.phase === 'quoting' || state.phase === 'quote_error' || state.phase === 'posting' ? 1 : 2;
    const stepNames =
      kind === 'upgrade' ? [t('co.steps.choose'), t('co.steps.review'), t('co.steps.confirm')] : [t('co.steps.review'), t('co.steps.confirm')];
    const stepIdx = kind === 'upgrade' ? step + 1 : step;
    return {
      title,
      // Buy a plan has one interactive step (the next one is the receipt), so no step list: the plan and its price
      // in the subtitle. The other checkouts keep their step list.
      subtitle: planInSubtitle(kind, shown.phase)
        ? heading.tail
          ? `${heading.lead} · ${heading.tail}`
          : heading.lead
        : shown.phase === 'review' || shown.phase === 'quoting' || shown.phase === 'posting'
          ? <Steps names={stepNames} current={stepIdx} />
          : shownSubject,
      body: renderBody({
        t,
        co,
        state: shown,
        kind,
        heading,
        subject: shownSubject,
        days: target?.days ?? null,
        onFunds: () => {
          markResume(kind, target, subject || title);
          setFundsNeed(shortfall(state.quote));
          setFunds(true);
        },
        banned,
        freeServer,
        listing: lst,
        specs: (kind === 'buy' || kind === 'upgrade') && chosen ? planRows(chosen) : null,
        handoff,
        keptPlace: placeOfCode(co.keptRegion),
        location:
          kind !== 'buy' || heldTitle ? null : handsOff ? (
            <Notice key="location" icon={null}>
              {t('loc.atCheckout')}
            </Notice>
          ) : (
            <LocationField
              key="location"
              value={loc}
              onChange={(next) => {
                setLoc(next);
                setLocNote(null);
                // The person chose: a location kept from before Add funds is never put back over it (Automatic included)
                // when the list read settles later.
                forgetResumeRegion();
                // What stood on the earlier location (consent, why a send came back) goes with it.
                co.clearPlan();
              }}
              read={regionsRead}
              place={state.quote?.place ?? null}
              note={locNote}
              refused={!!locRefusal}
              focusRef={locFocus}
              disabled={banned || (shown.phase !== 'review' && shown.phase !== 'quoting' && shown.phase !== 'quote_error')}
            />
          ),
        // An upgrade changes the plan, never the place: the server's location is a fact of the review.
        stays: kind === 'upgrade' && subRec && subPlaceName(subRec) ? t('loc.stays', { server: hostLabel(subRec), place: subPlaceName(subRec) as string }) : null,
      }),
      footer: renderFooter({
        t,
        co,
        state: shown,
        kind,
        disabled: cf.disabled,
        reason: kind === 'buy' ? cf.reason : null,
        why: cf.why,
        confirmLabel,
        onClose,
        banned,
        computers,
        handoff,
      }),
      phase: shown.phase,
      locked: co.locked,
      // The review's top holds the notice of a send that changed nothing (the price moved, it did not go through).
      // Confirm is pressed at the body's end: the drawer goes back to its top when one appears.
      topNote: shown.phase !== 'review' ? null : shown.requote !== null ? `requote ${shown.requote}` : shown.notice ? `notice ${shown.notice.k}` : null,
      // A plan picked in this drawer's Choose plan step goes back to it before anything is sent; a plan named by the
      // link (a plan card) has no such step. Consent is for the plan shown, so it goes with it.
      ...(kind === 'upgrade' && !planRec && picked && (shown.phase === 'review' || shown.phase === 'quoting' || shown.phase === 'quote_error')
        ? {
            onBack: () => {
              // The price-changed band and why a send came back belonged to the plan put back, never to the next one.
              co.clearPlan();
              setPicked(null);
            },
            backLabel: t('up.back'),
          }
        : {}),
      // Locked while the charge is in flight: nothing closes it.
      onOpenChange: (open) => {
        if (open || !canClose(state)) return;
        onClose();
      },
    };
  })();

  return (
    <Drawer overlayId="billing-checkout-drawer" resizeKey="billing-checkout-drawer"
      isOpen
      onOpenChange={frame.onOpenChange ?? ((o) => !o && onClose())}
      title={frame.title}
      subtitle={frame.subtitle}
      size="md"
      footer={frame.footer}
      topNote={frame.topNote}
      busy={frame.locked}
      dirty={frame.phase === 'review' && consented}
      onBack={frame.onBack}
      backLabel={frame.backLabel}
    >
      <div
        className={s.drawerBody}
        data-phase={frame.phase}
        data-outcome={frame.phase === 'unknown' || frame.phase === 'checking' ? 'pending' : undefined}
        aria-busy={frame.locked || undefined}
      >
        {frame.body}
      </div>
    </Drawer>
  );
}

interface ChooseProps {
  t: T;
  sub: RawSub;
  plans: readonly RawPlan[];
  sel: string | undefined;
  onSel: (id: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
  market: ReturnType<typeof usePlace>;
}

/** A held purchase of something no longer listed: Check again from the held record, and what it found. */
function HeldGone({
  t,
  kind,
  result,
  lost = null,
  busy,
  computers,
  market,
  onCheck,
  shownNow,
  place = null,
  onResend,
}: {
  t: T;
  kind: CheckoutKind;
  result: HeldResult | null;
  /** The URL's fingerprint names no kept request: 'settled' (core dropped it on its answer), 'unnamed' (no fingerprint). */
  lost?: 'settled' | 'unnamed' | null;
  busy: boolean;
  computers: ReturnType<typeof usePlace>;
  market: ReturnType<typeof usePlace>;
  onCheck: () => void;
  /** The kept request now (key and ceiling): what the resend dialog is opened for. */
  shownNow: () => ResendShown | null;
  /** A kept plan purchase's own location in words; null when it names none (Automatic) or is no plan purchase. */
  place?: string | null;
  /** The confirmed resend of the kept request the dialog was opened for; null when there is none (a rent, or no kept record). */
  onResend: ((shown: ResendShown | null | undefined) => void) | null;
}) {
  const listed = kind === 'rent' || kind === 'reserve';
  // Why nothing was sent or nothing more can be tried here: a check or resend that could not be sent for want of a
  // granted lock (its own answer), else a kept reservation in a browser without Web Locks (core neither resends nor
  // abandons it there, so only Check again is drawn: the live view's mkt.reserveNoLocks).
  const why = lost
    ? null
    : result?.check === 'unknown' && result.noLocks
      ? 'noLocks'
      : kind === 'reserve' && !commerceRules.buy.hasWebLocks()
        ? 'mkt.reserveNoLocks'
        : null;
  if (result?.check === 'done' && result.setupFailed)
    return (
      <EmptyState
        size="sm"
        icon="warn"
        title={t(kind === 'upgrade' ? 'up.failedTitle' : kind === 'pay' ? 'subs.payFailedTitle' : 'buy.failedTitle')}
        body={
          <>
            <p>{result.ref ? t('co.setupFailedNoAmount') : t('co.setupFailedNoAmountNoRef', { time: t('co.timeUnknown') })}</p>
            {result.ref && <IdChip id={result.ref} />}
          </>
        }
      />
    );
  if (result?.check === 'done')
    return (
      <EmptyState
        size="sm"
        icon="check-circle"
        title={t(listed ? (kind === 'rent' ? 'mkt.rentedTitle' : 'mkt.reservedTitle') : 'held.doneTitle')}
        body={t(
          listed ? (kind === 'rent' ? 'mkt.rentedMsgNoDate' : 'mkt.reservedMsg') : result.replayed === false ? 'held.doneNowBody' : 'held.doneBody',
        )}
        action={
          kind === 'rent' && computers ? (
            <Button size="sm" variant="primary" onPress={computers.open}>
              {t('buy.viewServers')}
            </Button>
          ) : undefined
        }
      />
    );
  if (result?.check === 'gone')
    return (
      <EmptyState
        size="sm"
        icon="market"
        title={t(listed ? 'mkt.goneNoneTitle' : 'held.goneTitle')}
        body={t(listed ? 'mkt.goneNoneBody' : 'held.goneBody')}
        action={
          listed ? (
            market ? (
              <Button size="sm" onPress={market.open}>
                {t('servers.browseMarket')}
              </Button>
            ) : undefined
          ) : (
            <Link href={links.plans} variant="nav">
              {t('seePlans')}
            </Link>
          )
        }
      />
    );
  // A fingerprint that names no request takes this frame with its own words, and nothing to read or send.
  return (
    <>
    <EmptyState
      size="sm"
      icon="server"
      // One translate call per slot, as before the lost words (anatomy layout.explainGap counts each call of a passed-in t).
      title={t(lost === 'settled' ? 'held.settledTitle' : lost === 'unnamed' ? 'held.unnamedTitle' : listed ? 'mkt.goneHeldTitle' : 'held.unknownTitle')}
      body={
        why ? (
          <>
            <span>{t(result?.check === 'unknown' ? 'mkt.goneStillBody' : 'mkt.goneHeldBody')}</span>
            <br />
            <span>{t(why)}</span>
          </>
        ) : (
          t(
            lost === 'settled'
              ? 'held.settledBody'
              : lost === 'unnamed'
                ? 'held.unnamedBody'
                : result?.check === 'unknown'
                  ? 'mkt.goneStillBody'
                  : listed
                    ? 'mkt.goneHeldBody'
                    : 'held.unknownBody',
          )
        )
      }
      action={
        lost ? undefined : (
          <>
            <Button size="sm" icon="reload" isDisabled={busy} onPress={onCheck}>
              {t('buy.checkAgain')}
            </Button>
            {onResend && (
              <Resend overlayId="billing-resend-held" busy={busy} prepare={shownNow} chargeOf={(sh) => ({ maxCents: sh?.maxCents ?? null, place })} onSend={onResend} />
            )}
          </>
        )
      }
      hint={!lost && onResend ? <ResendHint what={{ maxCents: shownNow()?.maxCents ?? null, place }} /> : undefined}
    />
    {/* What the last Check again found: one status line, mounted empty before the first answer so that one is read
        aloud too, and empty while a check runs. */}
    {!lost && <StatusLine>{result?.word && !busy ? say(t, result.word) : null}</StatusLine>}
    </>
  );
}

/** The upgrade's first step: which plan to move to. */
function choosePlanFrame({ t, sub, plans, sel, onSel, onPick, market }: ChooseProps): Frame {
  const options = upgradeCandidates(sub, plans);
  const chosen = sel && options.some((p) => p.id === sel) ? sel : options[0]?.id;
  const server = hostLabel(sub);
  return {
    title: t('up.titleNamed', { server }),
    subtitle: t('co.steps.choose'),
    body:
      options.length === 0 ? (
        <EmptyState
          size="sm"
          icon="arrow-up"
          title={t('up.topTitle')}
          body={t('up.top', { server })}
          action={
            market && (
              <Button size="sm" onPress={market.open}>
                {t('servers.browseMarket')}
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className={s.hint}>{t('up.lede', { server, plan: sub.plan?.title ?? '' })}</p>
          <RadioGroup
            label={t('up.to')}
            value={chosen}
            onChange={onSel}
            options={options.map((p) => {
              const c = planCard(p);
              const ai = upgradeAi(sub, p);
              return {
                value: p.id,
                label: `${c.title} · ${t('buy.perMonth', { price: cents(c.priceCents) })}`,
                description: ai ? say(t, ai) : undefined,
              };
            })}
          />
          <p className={s.hint}>
            {t('up.oneWay', { server })} <FaqLink item={pageFaq(t).byId.upgrade}>{t('up.more')}</FaqLink>
          </p>
        </>
      ),
    footer: (
      <>
        <DrawerCancel label={t('action.cancel')} />
        <Button variant="primary" isDisabled={!chosen} onPress={() => chosen && onPick(chosen)}>
          {t('co.next')}
        </Button>
      </>
    ),
  };
}

function Steps({ names, current }: { names: string[]; current: number }) {
  // Inside the drawer's subtitle paragraph: spans only.
  return (
    <span className={s.steps}>
      {names.map((n, i) => (
        <span key={n} aria-current={i + 1 === current ? 'step' : undefined}>
          {i + 1} {n}
        </span>
      ))}
    </span>
  );
}

interface BodyProps {
  t: T;
  co: ReturnType<typeof useCheckout>;
  state: CheckoutState;
  kind: CheckoutKind;
  heading: { lead: string; tail: string | null };
  subject: string;
  days: number | null;
  onFunds: () => void;
  banned: boolean;
  /** The person's free server: a purchase adds a server and never removes it. */
  freeServer: string | null;
  /** The market listing being rented or reserved (its facts show before paying); null for plan checkouts. */
  listing: Listing | null;
  /** The plan being bought or upgraded to: its spec rows show before paying. Null when paying for a server you have. */
  specs: SpecRow[] | null;
  /**
   * The standalone Hub: the served Hub's address of this same checkout ('' while no Hoody is chosen); null in the
   * served Hub. When set, the review, quoting and quote-error steps open with a band that says payments are made there
   * and links to it, and the footer has no Confirm: nothing here can send a payment.
   */
  handoff: string | null;
  /** Buy a plan: the Location choice (one keyed element, so it stays mounted while a new price is read); else null. */
  location: ReactNode;
  /** An upgrade: where the server is and stays, as a sentence; null when the subscription names no place. */
  stays: string | null;
  /** Buy a plan, outcome unknown: the kept request's location in words (what a resend asks for); null: none named. */
  keptPlace: string | null;
}

/** A purchase refused for its location (no room there, or anywhere for Automatic; or the location left the list). */
const LOC_REFUSALS: ReadonlySet<string> = new Set(['loc.refusedFull', 'loc.refusedFullIn', 'loc.refusedAuto', 'loc.refusedUnknown']);

/** "Location" values: Automatic, or a location of the list by its code (prefixed, so no code can read as Automatic). */
const LOC_AUTO = 'auto';
const locValue = (code: string): string => `r:${code}`;

/**
 * Buy a plan's Location choice: "Automatic (best available)" (the default) and the plan's own locations, each as its
 * flag, city and country; one with no room for the plan now is listed, off, as "Full". Up to LOC_RADIO_MAX places every
 * one is in view (a radio list: Automatic first, with where it would place the server right now under it); more places,
 * and the terminal, use a Select. Under the field: where the server will be (the choice), or why it is back on Automatic.
 * After a refusal the field adds no line of its own (the refusal's Band says it). A list that cannot be read says so and
 * leaves Automatic (and a choice already made) with a Retry: it never blocks the purchase.
 */
function LocationField({
  value,
  onChange,
  read,
  place,
  note,
  refused,
  focusRef,
  disabled,
}: {
  value: { code: string; name: string } | null;
  onChange: (next: { code: string; name: string } | null) => void;
  read: { data?: PaidRegion[]; isPending: boolean; isFetching: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  /** The quote's place: with Automatic, where the server would be placed right now. */
  place: PaidPlace | null;
  note: 'dropped' | 'reset' | null;
  /** The purchase (or its price read) was just refused for the location shown: the Band says it, the field adds nothing. */
  refused: boolean;
  /** Set to "move the focus to the choice shown" (the picked radio, or the Select's button). */
  focusRef: MutableRefObject<(() => void) | null>;
  disabled: boolean;
}) {
  const t = useStrings(strings);
  // A failed read offers no location (an earlier answer may be stale); the choice already made stays selectable.
  const list = read.isError ? [] : (read.data ?? []);
  const picked = value ? (list.find((r) => r.region === value.code) ?? null) : null;
  const autoNow = !value && !refused && place ? t('loc.autoNow', { place: placeName(place) }) : null;
  const places = [
    ...(value && !picked ? [{ value: locValue(value.code), label: value.name }] : []),
    ...list.map((r) => ({
      value: locValue(r.region),
      label: `${countryFlag(r.country)} ${placeName(r)}`.trim(),
      ...(r.available ? {} : { isDisabled: true, description: t('loc.full') }),
    })),
  ];
  const radios = places.length <= LOC_RADIO_MAX;
  const allFull = !read.isError && list.length > 0 && !list.some((r) => r.available);
  // Every place full: Automatic promises no room under its name (the field's line says none has room).
  const options = [{ value: LOC_AUTO, label: t('loc.auto'), ...(radios && !allFull ? { description: autoNow ?? t('loc.autoHelp') } : {}) }, ...places];
  const names = new Map(list.map((r) => [locValue(r.region), placeName(r)] as const));
  // What the price read answered for, when it is another place than the one chosen: the line says what the answer
  // says, never "will be in" the chosen one.
  const elsewhere = value && place && place.region !== value.code ? place : null;
  const description = value
    ? refused
      ? undefined
      : picked && !picked.available
        ? t('loc.fullNow')
        : elsewhere
          ? t('loc.answerSays', { place: placeName(elsewhere) })
          : t('loc.chosen', { place: value.name })
    : read.isPending && !read.isError
      ? t('loc.loading')
      : note
        ? t(note === 'reset' ? 'loc.reset' : 'loc.dropped')
        : allFull
          ? t('plans.regionsFull')
          : radios || refused
            ? undefined
            : (autoNow ?? t('loc.autoHelp'));
  const choose = (v: string) => {
    if (v === LOC_AUTO) return onChange(null);
    // A location with no room is listed, never taken: whatever hands its value over, the choice stays as it was.
    if (list.some((r) => locValue(r.region) === v && !r.available)) return;
    onChange({ code: v.slice(2), name: names.get(v) ?? value?.name ?? v.slice(2) });
  };
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // A focus asked for while the field is still off (the refusal lands while the send still locks the form) waits until
  // it is on.
  const off = useFieldLock(disabled);
  const wantFocus = useRef(false);
  const focusNow = () => {
    // The picked radio (the refused place); one the re-read turned Full is off, so the first radio that is on.
    const on = Array.from(box.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? []).filter((r) => !r.disabled);
    const el = radios ? (on.find((r) => r.checked) ?? on[0]) : trigger.current;
    el?.focus();
    wantFocus.current = !el || el.ownerDocument.activeElement !== el;
  };
  useEffect(() => {
    focusRef.current = focusNow;
    if (wantFocus.current && !off) focusNow();
  });
  useEffect(
    () => () => {
      focusRef.current = null;
    },
    [focusRef],
  );
  const selected = value ? locValue(value.code) : LOC_AUTO;
  return (
    <Stack gap={2}>
      {radios ? (
        <div ref={box}>
          <RadioGroup label={t('loc.label')} value={selected} onChange={choose} options={options} description={description} isDisabled={disabled} />
        </div>
      ) : (
        <Select label={t('loc.label')} value={selected} onChange={choose} options={options} description={description} isDisabled={disabled} triggerRef={trigger} />
      )}
      {read.isError && (
        <Band
          tone="warn"
          dataAttr="locations-unread"
          error={read.error}
          actions={
            refusedHere(read.error) ? undefined : (
              <Button variant="secondary" size="sm" busy={read.isFetching} onPress={() => void read.refetch()}>
                {t('action.tryAgain')}
              </Button>
            )
          }
        >
          {t('loc.listErr')}
        </Band>
      )}
    </Stack>
  );
}

/**
 * Everything a market listing says, before paying: core's listing facts, the very list the Market's inspector shows
 * (several disk groups one per line; a fact the row left out reads "Not listed"). An instant listing explains its
 * asterisk with the promise footnote; a pre-order never carries it.
 */
function WhatYouGet({ t, listing }: { t: T; listing: Listing }) {
  return (
    <section className={s.whatYouGet} aria-label={t('co.whatYouGet')}>
      <h4 className={s.whatYouGetTitle}>{t('co.whatYouGet')}</h4>
      <Facts
        columns={1}
        items={listing.facts.map((f) => ({
          label: f.label,
          value:
            typeof f.value === 'string' ? (
              listingRules.factText(f.value)
            ) : (
              <ul className={s.factLines}>
                {f.value.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ),
        }))}
      />
      {listing.instant && <p className={`${s.muted} ${s.small}`}>{listingRules.instantPromise.footnote}</p>}
    </section>
  );
}

/** What a plan gives, before paying: the Plans comparison's own rows and labels for the chosen plan. */
function PlanSpecs({ t, rows }: { t: T; rows: SpecRow[] }) {
  return (
    <section className={s.whatYouGet} aria-label={t('co.whatYouGet')}>
      <h4 className={s.whatYouGetTitle}>{t('co.whatYouGet')}</h4>
      <Facts columns={1} items={rows.map((r) => ({ label: t(r.label), value: typeof r.value === 'string' ? r.value : say(t, r.value) }))} />
    </section>
  );
}

/**
 * Buy a plan's top plate: a calm Verdict whose sentence is what the purchase does, the
 * quote's own co.newServer note (here, not in the notes list, so it is said once) and, when there is one, that the
 * free server stays; its facts are the same plan rows PlanSpecs shows, as a spec sheet.
 */
function BuyPlate({ t, adds, rows, freeServer }: { t: T; adds: Word; rows: SpecRow[]; freeServer: string | null }) {
  return (
    <Verdict
      label={t('co.whatYouGet')}
      facts={
        rows.length > 0 ? (
          <Facts layout="spec" items={rows.map((r) => ({ label: t(r.label), value: typeof r.value === 'string' ? r.value : say(t, r.value) }))} />
        ) : undefined
      }
    >
      {say(t, adds)}
      {freeServer && <> {t('keepsFree', { server: freeServer })}</>}
    </Verdict>
  );
}

/**
 * Buy a plan's money. The order: the lines before the quote's strong line, then that line
 * as the total ("Charged now"). The wallet, in its own list: the lines after it (Wallet balance, Referral credit) and,
 * when the purchase is short, a "Short by" warn row with the gate's own number (shortfall()) and the strip under it:
 * the existing short sentence and Add funds (left out while suspended, off while the drawer is locked). Two lists, not
 * one: the kit's total closes its list, and wallet rows under "Charged now" would read as adding up to it.
 */
function BuyMoney({ t, q, short, onFunds, lock }: { t: T; q: CheckoutQuote; short: number; onFunds: (() => void) | null; lock: boolean }) {
  const at = q.lines.findIndex((l) => l.strong);
  const order = at < 0 ? q.lines : q.lines.slice(0, at);
  const total = at < 0 ? null : q.lines[at]!;
  const wallet = at < 0 ? [] : q.lines.slice(at + 1);
  const row = (l: QuoteLine, i: number) => ({ id: `${l.label}-${i}`, label: t(l.label, l.vars), amount: <Money cents={l.cents} /> });
  return (
    <>
      <Ledger
        label={t('co.summary')}
        rows={order.map(row)}
        {...(total ? { total: { label: t(total.label, total.vars), amount: <Money cents={total.cents} /> } } : {})}
      />
      {(wallet.length > 0 || short > 0) && (
        <Ledger
          label={t('wallet')}
          rows={[
            ...wallet.map(row),
            ...(short > 0 ? [{ id: 'short', label: t('buy.shortBy'), amount: <Money cents={short} />, tone: 'warn' as const }] : []),
          ]}
          {...(short > 0
            ? {
                attach: {
                  text: t('buy.short', { amount: cents(short) }),
                  ...(onFunds
                    ? {
                        action: (
                          <Button variant="secondary" size="sm" isDisabled={lock} onPress={onFunds}>
                            {t('addFunds')}
                          </Button>
                        ),
                      }
                    : {}),
                },
              }
            : {})}
        />
      )}
    </>
  );
}

/**
 * The consent box. Terms of Service and Privacy Policy are said once, in the sentence itself: a link when the page knows
 * the address, else the words. A press on a link follows it and leaves the box as it was (kit Checkbox).
 */
function Consent({ t, on, onChange, disabled }: { t: T; on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  const tp = useStringParts(strings);
  const termsUrl = legalUrl('terms');
  const privacyUrl = legalUrl('privacy');
  const terms = termsUrl ? <Link href={termsUrl}>{t('market.legalTerms')}</Link> : t('market.legalTerms');
  const privacy = privacyUrl ? <Link href={privacyUrl}>{t('market.legalPrivacy')}</Link> : t('market.legalPrivacy');
  return (
    <div className={s.consent}>
      <Checkbox isSelected={on} isDisabled={disabled} onChange={onChange} label={tp('co.agree', { terms, privacy })} />
    </div>
  );
}

function renderBody({ t, co, state, kind, heading, subject, days, onFunds, banned, freeServer, listing, specs, handoff, location, stays, keptPlace }: BodyProps): ReactNode {
  const q = state.quote;
  // The standalone hand-off does not wait on the price: the footer has no Confirm while quoting or after a failed quote
  // either, so the band and its link are drawn on those steps too.
  // The live terminal sends no payment either (moneyHandoff.term.tsx): the steps with no Confirm (review, quoting, quote
  // error) say so and give the web Hub's address. Never beside a send in flight (posting, reconciling): its "nothing was
  // sent" would contradict it.
  const noSendStep = state.phase === 'review' || state.phase === 'quoting' || state.phase === 'quote_error';
  const handoffBand = handoff === null && moneyInWebHub() ? noSendStep && <MoneyHandoff /> : handoff !== null && (
    <Band
      tone="info"
      dataAttr="handoff"
      actions={
        handoff ? (
          <LinkButton variant="primary" size="sm" href={handoff}>
            {t('co.standaloneOpen')}
          </LinkButton>
        ) : undefined
      }
    >
      {t('co.standalone')}
    </Band>
  );
  switch (state.phase) {
    case 'quoting':
      return (
        <>
          {handoffBand}
          {location}
          <Skeleton variant="rows" rows={5} />
        </>
      );
    case 'quote_error':
      return (
        <>
          {handoffBand}
          {location}
          <ErrorState size="sm" title={t('buy.quoteErr')} error={state.quoteError} onRetry={co.reload} retrying={co.quoteRetrying} />
        </>
      );
    case 'banned':
      return <EmptyState size="sm" icon="lock" title={t('mkt.suspended')} body={t('band.suspendedBody')} />;
    case 'review':
    case 'posting':
    case 'reconciling': {
      if (!q) return null;
      const short = shortfall(q);
      const lock = state.phase !== 'review';
      // Buy a plan says what it adds in its plate, not in the notes; without that note the old layout stays (no new fact).
      const adds = kind === 'buy' ? (q.notes.find((w) => w.k === 'co.newServer') ?? null) : null;
      const notes = adds ? q.notes.filter((w) => w !== adds) : q.notes;
      // One line of the warnings or the notes.
      const item = (key: string, line: ReactNode) => <li key={key}>{line}</li>;
      // A refused location is said once, by the refusal's own Band at the top: the price read that then also finds no
      // room there is the same fact (Confirm stays shut on it), not a second Band.
      const refusedLoc = !!state.notice && LOC_REFUSALS.has(state.notice.k);
      const blocked = q.blocked && !(refusedLoc && q.blocked.k === 'loc.noRoomIn') && (
        <Band
          tone="warn"
          dataAttr="blocked" /* noDetails: the quote's own refusal to sell (a word), no rejection */
          actions={
            q.blocked.k === 'loc.mismatch' || q.blocked.k === 'loc.unread' ? (
              <Button variant="secondary" size="sm" onPress={co.reload}>
                {t('buy.checkAgain')}
              </Button>
            ) : undefined
          }
        >
          {say(t, q.blocked)}
        </Band>
      );
      return (
        <>
          {handoffBand}
          {state.requote !== null && (
            <Band tone="warn" dataAttr="requote" /* noDetails: the price moved (a new quote), no rejection */>
              {t('co.requoted', { total: cents(state.requote) })}
            </Band>
          )}
          {state.notice && (
            <Band tone={refusedLoc ? 'warn' : 'info'} dataAttr="notice" /* noDetails: location refusal notice: NO_PAID_CAPACITY_IN_REGION is mapped to a fixed sentence naming the place; no error details to show */>
              {say(t, state.notice)}
            </Band>
          )}
          {kind !== 'buy' && (
            <h3 className={s.reviewTitle}>
              <span dir="auto">{heading.lead}</span>
              {heading.tail && <span className={`${s.muted} ${s.small}`}>{heading.tail}</span>}
            </h3>
          )}
          {/* Buy a plan says blocked before what you would get; the other checkouts keep their order. */}
          {kind === 'buy' && blocked}
          {listing && listing.facts.length > 0 && <WhatYouGet t={t} listing={listing} />}
          {adds ? (
            <BuyPlate t={t} adds={adds} rows={specs ?? []} freeServer={freeServer} />
          ) : (
            specs && specs.length > 0 && <PlanSpecs t={t} rows={specs} />
          )}
          {location}
          {kind !== 'buy' && blocked}
          {kind === 'buy' ? (
            <BuyMoney t={t} q={q} short={short} onFunds={banned ? null : onFunds} lock={lock} />
          ) : (
            <dl className={s.lines} aria-label={t('co.summary')}>
              {q.lines.map((l, i) => (
                <div key={`${l.label}-${i}`} className={`${s.line} ${l.strong ? s.lineStrong : ''}`}>
                  <dt>{t(l.label, l.vars)}</dt>
                  <dd>
                    <Money cents={l.cents} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {q.warnings.length > 0 && (
            <ul className={s.warnings}>
              {q.warnings.map((w) => item(w.k, say(t, w)))}
            </ul>
          )}
          {(notes.length > 0 || stays) && (
            <ul className={s.notes}>
              {notes.map((w) => item(w.k, say(t, w)))}
              {stays && item('loc.stays', stays)}
            </ul>
          )}
          {freeServer && kind !== 'pay' && kind !== 'upgrade' && !adds && (
            <p className={s.hint}>
              {t(kind === 'buy' ? 'keepsFree' : 'mkt.keepsFree', kind === 'buy' ? { server: freeServer } : { name: freeServer })}
            </p>
          )}
          {q.balanceCents === null && (
            <Band tone="warn" dataAttr="balance" /* noDetails: the quote holds no balance (null), not the read's rejection */>
              {t('mkt.balanceUnavailable')}
            </Band>
          )}
          {short > 0 && kind !== 'buy' && (
            <div className={s.short} data-short="">
              <span>{t(kind === 'pay' ? 'subs.payShort' : kind === 'upgrade' ? 'up.short' : 'buy.short', { amount: cents(short) })}</span>
              {!banned && (
                <Button variant="secondary" size="sm" isDisabled={lock} onPress={onFunds}>
                  {t('addFunds')}
                </Button>
              )}
            </div>
          )}
          <Consent t={t} on={state.consent} onChange={co.setConsent} disabled={lock} />
        </>
      );
    }
    case 'checking':
    case 'unknown':
      return (
        <>
          <UnknownBody t={t} co={co} state={state} kind={kind} subject={subject} days={days} banned={banned} place={keptPlace} />
          {banned && <SuspendedLine t={t} />}
        </>
      );
    case 'done':
    case 'already':
      return (
        <>
          <DoneBody t={t} state={state} kind={kind} subject={subject} />
          {banned && <SuspendedLine t={t} />}
        </>
      );
    case 'not_found':
      return (
        <>
          <OutcomeBanner
            kind="pending"
            title={t('mkt.notFoundTitle')}
            body={t('mkt.notFoundMsg')}
            onCheck={co.checkAgain}
            /* noDetails: a read-back that found nothing yet, no rejection */
          />
          <RentAgain t={t} co={co} banned={banned} />
          {banned && <SuspendedLine t={t} />}
        </>
      );
    case 'failed':
      // The kit outcome banner: the machine's sentence, and the rejection's facts in its Details fold. Facts that say the
      // purchase may have gone through turn the whole banner pending (kit C9 rule); the footer then offers no Try again
      // (failedMayHaveGone).
      return (
        <>
          <OutcomeBanner
            kind="failed"
            title={t(kind === 'upgrade' ? 'up.notDoneTitle' : kind === 'pay' ? 'subs.payNotDoneTitle' : 'co.failedTitle')}
            body={state.failure ? say(t, state.failure.word) : undefined}
            error={state.failure?.info}
          />
          {state.failure?.ref && (
            <span className={s.ref}>
              <span className={s.muted}>{t('co.reference')}</span> <IdChip id={state.failure.ref} />
            </span>
          )}
        </>
      );
    default:
      return null;
  }
}

/** The suspended line beside an outcome the drawer keeps while suspended (unknown, not found, done; any kind). */
function SuspendedLine({ t }: { t: T }) {
  return (
    <Band tone="warn" dataAttr="suspended" /* noDetails: account suspension, no rejection to show */>
      {t('mkt.suspended')}
    </Band>
  );
}

/** A rent whose earlier attempt may still exist: another one only after the person says plainly they accept two. */
function RentAgain({ t, co, banned }: { t: T; co: ReturnType<typeof useCheckout>; banned: boolean }) {
  const [open, setOpen] = useState(false);
  if (banned || !co.canRentAgain) return null;
  return (
    <div className={s.cardActions}>
      <Button variant="secondary" isDisabled={co.locked} onPress={() => setOpen(true)}>
        {t('mkt.rentAgain')}
      </Button>
      <ConfirmDialog
        overlayId="billing-checkout-rent-again"
        isOpen={open}
        onOpenChange={setOpen}
        title={t('mkt.rentAgainTitle')}
        body={<p>{t('mkt.rentAgainBody')}</p>}
        // The most this rent may charge: the price the drawer shows, on screen at the moment of consent.
        consequences={co.state.quote ? [t('mkt.rentAgainAmount', { amount: cents(co.state.quote.chargeCents) })] : undefined}
        confirmLabel={t('mkt.rentAgainConfirm')}
        onConfirm={() => {
          setOpen(false);
          co.rentAgain();
        }}
      />
    </div>
  );
}

function UnknownBody({
  t,
  co,
  state,
  kind,
  subject,
  days,
  banned,
  place,
}: {
  t: T;
  co: ReturnType<typeof useCheckout>;
  state: CheckoutState;
  kind: CheckoutKind;
  subject: string;
  days: number | null;
  banned: boolean;
  place: string | null;
}) {
  const checking = state.phase === 'checking';
  // A buy that adopted a kept request of its family: the earlier request, named in the subtitle by its own plan.
  const title = kind === 'reserve'
    ? t('mkt.indeterminateTitle')
    : kind === 'buy' && co.heldTitle
      ? t('held.unknownTitle')
      : t('co.unknownTitle', { subject: subject || t('buy.kicker') });
  // A remembered reservation of another term than this drawer's (core holds the offer on any term's hold) is named by its
  // term, here and in the Start a new purchase confirm that would stop tracking it: never just "the earlier reservation".
  const otherTerm = (s: ReserveNewShown | null): string | null =>
    s && 'held' in s && s.held.days !== (days === null ? null : String(days)) ? s.held.days : null;
  const heldTerm = kind === 'reserve' ? otherTerm(co.reserveNewShown()) : null;
  const body =
    kind === 'reserve'
      ? heldTerm
        ? t('mkt.indeterminateReserveTerm', { days: heldTerm })
        : t('mkt.indeterminateReserve')
      : kind === 'rent'
        ? t('mkt.indeterminateRent')
        : t('co.unknownBody');
  // Only a request this drawer can send again (co.canResend), and never while suspended: a control that cannot send
  // would only say a charge may follow. A reserve whose kept key may be gone (no resend) may still start a new purchase,
  // in the same danger dialog. Both are the banner's recovery actions.
  const resend = kind !== 'rent' && !banned && co.canResend;
  const reserveNew = kind === 'reserve' || resend ? !banned && co.canReserveNew : false;
  // Resend's label never ticks inside the banner's role="alert" (read again each second): while Retry-After runs, the
  // line under the banner counts down (RetryIn); once Resend can send, it says what it may charge (its dialog says it too).
  const resendButton = resend ? (
    <Resend
      overlayId="billing-resend-checkout"
      size="sm"
      chargeOf={(sh) => ({ maxCents: sh?.maxCents ?? null, place })}
      busy={checking}
      countdown={state.retryIn}
      countdownInLabel={false}
      prepare={co.resendShown}
      onSend={co.resend}
    />
  ) : null;
  const reserveNewButton = reserveNew ? <ReserveNew
      size="sm"
      prepare={co.reserveNewShown}
      onStart={co.reserveNew}
      busy={checking || co.locked}
      termOf={otherTerm}
    /> : null;
  const recover = resend || reserveNew ? (
    <>
      {resendButton}
      {reserveNewButton}
    </>
  ) : undefined;
  // What the last Check again found, as one line of words.
  const found =
    [
      state.stillUnknown ? t('co.stillUnknown') : '',
      co.match ? t(kind === 'rent' ? 'co.checkRented' : 'mkt.reserveMatch', { summary: kind === 'rent' ? '' : t('mkt.matchSummary', { name: subject, days: days ?? '' }) }) : '',
    ]
      .filter(Boolean)
      .join(' ') || null;
  return (
    <>
      <OutcomeBanner
        kind="pending"
        title={title}
        body={body}
        onCheck={co.checkAgain}
        checking={checking}
        actions={recover}
        // What the last Check again found: the banner's status region, so it is read aloud; empty while a check runs.
        result={checking ? null : found}
      />
      {/* What the resend may charge, right under the banner whose action it is. */}
      {resend && (
        <span className={s.hint} data-resend="">
          {state.retryIn > 0 ? <RetryIn s={state.retryIn} /> : <ResendHint what={{ maxCents: co.resendMax, place }} />}
        </span>
      )}
      {/* The no-Web-Locks Band below says the same as a noLocks notice, and more: one fact, one Band. */}
      {/* A rent whose Check again saw an active rental: the found line above already says co.checkRented. */}
      {state.notice && !checking && !(co.reserveNoLocks && state.notice.k === 'noLocks') && !(co.match && kind === 'rent' && state.notice.k === 'co.checkRented') && (
        <Band tone="info" dataAttr="notice">
          {say(t, state.notice)}
        </Band>
      )}
      {!checking && <RentAgain t={t} co={co} banned={banned} />}
      {/* No Web Locks: this browser can neither send the kept reservation again nor start a new one. */}
      {co.reserveNoLocks && !checking && (
        <Band tone="info" dataAttr="nolocks">
          {t('mkt.reserveNoLocks')}
        </Band>
      )}
    </>
  );
}

function DoneBody({ t, state, kind, subject }: { t: T; state: CheckoutState; kind: CheckoutKind; subject: string }) {
  const r = state.result;
  const already = state.phase === 'already';
  const when = r?.at ? new Date(r.at) : null;
  const date = when && !Number.isNaN(when.getTime()) ? formatDate(when) : null;
  const until = r?.until ? new Date(r.until) : null;
  const untilText = until && !Number.isNaN(until.getTime()) ? formatDate(until) : null;
  const readyBy = r?.readyBy ? new Date(r.readyBy) : null;
  const readyText = readyBy && !Number.isNaN(readyBy.getTime()) ? formatDate(readyBy) : null;
  // A failed setup and a finished purchase share one outcome box: its mark, its title, then its lines.
  const failed = !!r?.setupFailed;
  const ref = r?.ref || state.failure?.ref;
  const title = failed
    ? t(kind === 'upgrade' ? 'up.failedTitle' : kind === 'pay' ? 'subs.payFailedTitle' : 'buy.failedTitle')
    : already
      ? t('buy.alreadyTitle')
      : kind === 'buy'
        ? t('co.done.buy', { plan: subject })
        : kind === 'pay'
          ? t('subs.payDoneTitle')
          : kind === 'upgrade'
            ? t('up.doneTitle')
            : kind === 'rent'
              ? t('mkt.rentedTitle')
              : t('mkt.reservedTitle');
  return (
    <div className={s.outcomeBody} data-outcome={failed ? 'failed' : already ? 'already' : 'done'}>
      <span className={`${s.outcomeIcon} ${failed ? s.outcomeIcon_warn : s.outcomeIcon_ok}`}>
        <Icon name={failed ? 'warn' : 'check-circle'} />
      </span>
      <h3 className={s.outcomeTitle}>{title}</h3>
      {failed ? (
        <>
          <p className={s.outcomeText}>
            {ref
              ? r?.chargedCents == null
                ? t('co.setupFailedNoAmount')
                : t('co.setupFailed', { amount: cents(r.chargedCents) })
              : r?.chargedCents == null
                ? t('co.setupFailedNoAmountNoRef', { time: when && !Number.isNaN(when.getTime()) ? formatDateTime(when) : t('co.timeUnknown') })
                : t('co.setupFailedNoRef', {
                    amount: cents(r.chargedCents),
                    time: when && !Number.isNaN(when.getTime()) ? formatDateTime(when) : t('co.timeUnknown'),
                  })}
          </p>
          {ref && <IdChip id={ref} />}
        </>
      ) : (
        <>
          <p className={s.outcomeText}>
            {r?.chargedCents == null
              ? already
                ? t('buy.alreadyBodyNoAmount')
                : date
                  ? t('co.chargedUnknown', { date })
                  : t('co.chargedUnknownNoDate')
              : already
                ? date
                  ? t('buy.alreadyBody', { date, amount: cents(r.chargedCents) })
                  : t('buy.alreadyBodyNoDate', { amount: cents(r.chargedCents) })
                : date
                  ? t('co.charged', { amount: cents(r.chargedCents), date })
                  : t('co.chargedNoDate', { amount: cents(r.chargedCents) })}
          </p>
          {!already && kind === 'rent' && untilText && <p className={s.outcomeText}>{t('mkt.rentedMsg', { date: untilText })}</p>}
          {!already && kind === 'reserve' && <p className={s.outcomeText}>{readyText ? t('mkt.readyBy', { date: readyText }) : t('mkt.reservedMsg')}</p>}
          {(kind === 'buy' || kind === 'upgrade' || kind === 'pay') && ((!already && untilText) || (kind === 'buy' && r?.place)) && (
            <p className={s.outcomeText}>
              {t(kind === 'buy' && r?.place ? (!already && untilText ? 'co.paidUntilIn' : 'loc.in') : 'co.paidUntil', {
                date: untilText ?? '',
                place: r?.place ? placeName(r.place) : '',
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The footer reason line's id: one checkout drawer is open at a time. */
const REASON_ID = 'billing-checkout-reason';

interface FooterProps {
  t: T;
  co: ReturnType<typeof useCheckout>;
  state: CheckoutState;
  kind: CheckoutKind;
  /** Confirm is off (confirmFooter: a suspension or a closed gate). */
  disabled: boolean;
  /**
   * Why Confirm is off, shown in the footer; null when it can act, while quoting, or when the review
   * body says it (a Band, the shortfall line).
   */
  reason: Word | null;
  /**
   * Why Confirm cannot act (confirmFooter's `why`), said by the reasoned Confirm whether the footer line or the review
   * body shows it; null when it can act or has nothing to name (the quote is coming).
   */
  why: Word | null;
  confirmLabel: string;
  onClose: () => void;
  banned: boolean;
  computers: ReturnType<typeof usePlace>;
  /** See BodyProps.handoff: when set, the footer has no Confirm. */
  handoff: string | null;
}

function renderFooter({ t, co, state, kind, disabled, reason, why, confirmLabel, onClose, banned, computers, handoff }: FooterProps): ReactNode {
  // The standalone Hub: no Confirm at all; the body's hand-off band (review, quoting, quote error) says why and links
  // to the served Hub.
  // The live terminal likewise (moneyHandoff.term.tsx).
  if ((handoff !== null || moneyInWebHub()) && (state.phase === 'review' || state.phase === 'quoting' || state.phase === 'quote_error')) return <DrawerCancel label={t('action.cancel')} />;
  switch (state.phase) {
    case 'posting':
    case 'reconciling':
      return (
        <span className={s.footerLock} role="status" /* reason: footer line while a send is in flight, the drawer is locked */>
          <span className={s.pulse}>
            <Icon name="lock" size="sm" />
          </span>
          {t('mkt.posting')}
        </span>
      );
    case 'review':
    case 'quoting':
    case 'quote_error':
      return (
        <>
          {reason && (
            <span id={REASON_ID} className={s.footReason}>
              {say(t, reason)}
            </span>
          )}
          <DrawerCancel label={t('action.cancel')} />
          {/* A Confirm that cannot act for a reason it can name stays reachable and says it (the kit ReasonButton has no
              action: only the Button below sends). With nothing to name (the quote is coming) it is plainly disabled. */}
          {why ? (
            <ReasonButton variant="primary" actionId="billing-checkout-confirm" reason={say(t, why)}>
              {confirmLabel}
            </ReasonButton>
          ) : (
            <Button
              variant="primary"
              isDisabled={disabled}
              aria-describedby={reason ? REASON_ID : undefined}
              onPress={co.confirm}
            >
              {confirmLabel}
            </Button>
          )}
        </>
      );
    case 'done':
    case 'already':
      return (
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('action.done')}
          </Button>
          {kind !== 'reserve' && computers && (
            <Button variant="primary" onPress={computers.open}>
              {t('buy.viewServers')}
            </Button>
          )}
        </>
      );
    case 'failed':
      return (
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('action.close')}
          </Button>
          {/* A fresh review only after a definite failure: beside a banner that says it may have gone through, a new
              purchase could charge twice (C9). */}
          {!failedMayHaveGone(state) && (
            <Button variant="primary" isDisabled={banned} onPress={co.again}>
              {t('action.tryAgain')}
            </Button>
          )}
        </>
      );
    case 'not_found':
      return (
        <>
          <Button variant="secondary" onPress={onClose}>
            {t('action.close')}
          </Button>
          {!co.rentHeld && !banned && (
            <Button variant="secondary" onPress={co.startOver}>
              {t('mkt.recoverNew')}
            </Button>
          )}
        </>
      );
    default:
      return (
        <Button variant="secondary" onPress={onClose}>
          {t('action.close')}
        </Button>
      );
  }
}
