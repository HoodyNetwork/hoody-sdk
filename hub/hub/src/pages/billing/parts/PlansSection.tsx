// Plans on sale: one row of plan columns, Free first, each plan once with its one
// price and its one action, and its facts as label | value rows in the same order in every column (comparison(), so the
// eye reads across). No second set of cards and no table: the columns are the comparison, on every width (the grid
// wraps to one column on a phone). "Plans for" says which server an Upgrade changes before anything is pressed: "A new
// server" (Get buys one and changes none) or one of the paid servers that can upgrade now (?sub=, view.tsx's target).
// A ?sub= that does not name such a server (still loading, unreadable, gone, or no longer able to upgrade) buys nothing:
// no column has an action until the person picks a server or "A new server". Free is drawn
// beside every state of the catalogue, loading, failed and empty included.
import { Button, CellLines, EmptyState, ErrorState, FaqLink, InfoTip, PlanCard, PlanGrid, type PlanCardProps, RadioGroup, ScaleBar, SettingGroup, SettingRow, Skeleton, Stack, StatusPill, countryFlag, useGo } from '@kit';
import { useMemo } from 'react';
import { useFreeServer, usePlans, usePlansRegions, useServerKinds, useSubs, useUsage } from '../data';
import { pageFaq } from '../faq';
import {
  cents,
  checkoutPlan,
  columnMode,
  comparison,
  freeName,
  day,
  hostLabel,
  isSuggested,
  ownCatalogue,
  plansForSubs,
  priceShort,
  serversOn,
  subByWholeId,
  subLabels,
  upgradeCandidates,
  upgradeDelta,
  refusedHere,
  type CompareCell,
  type PlanCard as Plan,
} from '../logic';
import { links } from '../links';
import { usePlace } from '../pagelinks';
import { aiMultiple, aiScale } from '../plans-compare-logic';
import { nextHint } from '../plans-next';
import { type PlanRegions, REGIONS_UNKNOWN, planRegions } from '../plans-regions';
import type { AiTier, RawSub } from '../types';
import { Section, say, type T } from './Bits';
import { PlansCompare } from './PlansCompare';
import { BareBand, type BareFactsCell, BareFactsRead, useBareFactsCell, useReadBareFacts } from './PlansExtras';
import { PlansMore } from './PlansMore';
import s from './parts.module.css';

export interface PlansSectionProps {
  t: T;
  banned: boolean;
  /** The plan the hand-off suggests (family or version id). */
  want: string | null;
  /** The paid server the plans speak about, when it can upgrade. */
  target: RawSub | null;
  /** The ?sub= the link carries, null without one. Present while `target` is null: nothing is bought from the columns. */
  asked: string | null;
  titleRef?: (el: HTMLElement | null) => void;
}

/** "Plans for": the value of "A new server". A choice's value is a subscription's whole id, never this. */
const NEW = 'new';

/** The catalogue facts a plan card shows: how many computers and the size of the server. Every other fact (disk speed,
 *  network, snapshots, addresses) is a row of the Compare plans table under the cards, so a card stays short. */
const CARD_FACTS: readonly string[] = ['computers', 'cores', 'ram', 'disk'];

/** The Bare metal band over the screen's one market read (the cell BareFactsRead files it in). */
function BandOverRead({ t, open, quiet, cell }: { t: T; open: () => void; quiet: boolean; cell: BareFactsCell }) {
  return <BareBand t={t} open={open} facts={useReadBareFacts(cell)} quiet={quiet} />;
}

/** The Compare plans table over the screen's one market read; without one its Bare metal column has no numbers. */
function CompareOverRead({ t, cell, regions }: { t: T; cell: BareFactsCell; regions: Readonly<Record<string, PlanRegions>> }) {
  return <PlansCompare t={t} bare={useReadBareFacts(cell)} regions={regions} />;
}

export function PlansSection({ t, banned, want, target, asked, titleRef }: PlansSectionProps) {
  const plans = usePlans();
  const subs = useSubs();
  const free = useFreeServer();
  // The free server's name: freeName over the usage read, the checkout's own (one display helper for the nested name).
  const usage = useUsage();
  const kinds = useServerKinds();
  const go = useGo();
  const market = usePlace('market');
  const bare = useBareFactsCell();
  const cmp = useMemo(() => (plans.data ? comparison(plans.data) : null), [plans.data]);
  // The catalogue's columns, for the column modes (the server's own plan is judged against the plans on sale).
  const cols = cmp?.plans ?? [];
  // The whole catalogue read, entries no column shows included: the server's own entry is judged against it.
  const raw = plans.data ?? [];
  const ups = useMemo(
    () => (target && plans.data ? new Set(upgradeCandidates(target, plans.data).map((p) => p.id)) : new Set<string>()),
    [target, plans.data],
  );
  // Where each plan on sale can run now: the API's list, read for the plan version the column's checkout would buy
  // (a column the checkout cannot buy reads nothing). The cards and the Compare table show the locations with room;
  // while a list is being read, or cannot be, they say so and name no location.
  const sold = useMemo(
    () => (cmp && !plans.isError ? cmp.plans : []).map((c) => ({ column: c.id, plan: checkoutPlan(c, plans.data ?? []) })).filter((x): x is { column: string; plan: string } => x.plan !== null),
    [cmp, plans.isError, plans.data],
  );
  const regionReads = usePlansRegions(useMemo(() => sold.map((x) => x.plan), [sold]));
  const regionsNow = sold.map((x, i) => [x.column, planRegions(regionReads[i], refusedHere(regionReads[i]?.error))] as const);
  // One object per content: the table below is memoised on it.
  const regionsSig = JSON.stringify(regionsNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const regionsBy = useMemo<Readonly<Record<string, PlanRegions>>>(() => Object.fromEntries(regionsNow), [regionsSig]);
  const choices = useMemo(() => plansForSubs(subs.data?.subs), [subs.data]);
  // A ?sub= that names no server able to upgrade now: no column buys anything, and the line says why.
  const blocked = asked !== null && !target;
  const freeData = free.data ?? null;
  const freeServer = freeData ? freeName(usage.data, kinds.data ?? {}) : null;
  const serverName = target ? hostLabel(target) : '';
  // The one column the page points at: the hand-off's plan, else the first plan the picked server can move to.
  const accent = blocked ? undefined : cmp?.plans.find((c) => isSuggested(c, want) && columnMode(c, target, ups, cols, raw) !== 'current' && columnMode(c, target, ups, cols, raw) !== 'notUp')?.id
    ?? (target ? cmp?.plans.find((c) => columnMode(c, target, ups, cols, raw) === 'upgrade')?.id : undefined);
  // The framed column: the one the page points at, else, for a new server, the biggest plan on sale (the catalogue's
  // last column, whatever it is called). Only the frame: "Suggested for you" stays the hand-off's.
  const framed = accent ?? (!target && !blocked && cmp && !plans.isError ? cmp.plans[cmp.plans.length - 1]?.id : undefined);

  // A dash says which it is to a screen reader: a count of 0 is not included, a field left out is not listed.
  const dash = (why: 'notIncluded' | 'notListed') => (
    <span className={s.faint} role="img" aria-label={t(why === 'notIncluded' ? 'plans.notIncluded' : 'plans.notListed')}>
      —
    </span>
  );

  // The AI scale ends at the largest multiple on sale (Free counts 1), the Compare plans table's scale too.
  const scale = aiScale([{ kind: 'ai', tier: 'free', mult: null } as const, ...(cmp?.groups ?? []).flatMap((g) => g.rows).filter((r) => r.id === 'ai').flatMap((r) => r.cells)]);
  // Free AI: the tier and its multiple in words ("Plus 2×") over the multiple as bars; the tier alone when the
  // catalogue gives no multiple. Never a limit. The words explain Free AI where they are read (hover, focus or a tap):
  // the models it uses and that it comes without guarantees, as the website says it.
  const ai = (tier: AiTier | null, mult: number | null) => {
    const tierName = tier ? t(`aiu.tier.${tier}`) : null;
    const n = aiMultiple(tier, mult);
    const line = tierName && n !== null ? t('plans.aiTierMult', { tier: tierName, n }) : tierName ?? (n !== null ? t('plans.aiMult', { n }) : '');
    if (!line) return line;
    const words = (
      <InfoTip text={t('plans.aiTip')} subject={t('plans.aiLabel')}>
        {line}
      </InfoTip>
    );
    if (n === null) return words;
    return (
      <CellLines>
        {words}
        <ScaleBar value={n} max={scale} label={t(n === 1 ? 'plans.aiScaleBase' : 'plans.aiScale', { n })} />
      </CellLines>
    );
  };

  const cell = (c: CompareCell | undefined) => {
    if (!c) return dash('notListed');
    if (c.kind === 'none') return dash(c.why);
    if (c.kind === 'value') return typeof c.value === 'string' ? c.value : say(t, c.value);
    return ai(c.tier, c.mult);
  };

  // The plan's facts: the comparison's rows, the same in every column: computers first, then the rest of the server and
  // its network, the AI allowance last.
  const factRows = useMemo(() => {
    const all = (cmp?.groups ?? []).flatMap((g) => g.rows);
    return [...all.filter((r) => r.id === 'computers'), ...all.filter((r) => r.id !== 'computers' && r.id !== 'ai'), ...all.filter((r) => r.id === 'ai')];
  }, [cmp]);
  type Row = NonNullable<PlanCardProps['rows']>[number];
  // What the catalogue does not carry (the website's words): the kind of hardware, with its explanation, as a row; where
  // the server can run, as the card's regions part under the rows. A shared paid plan lists the locations that have
  // room for it now as tags (the API's list for that plan); Free has no choice of location.
  const hardwareRow: Row = {
    id: 'hardware',
    label: t('plans.hardware'),
    value: (
      <InfoTip text={t('plans.sharedTip')} subject={t('plans.shared')}>
        {t('plans.shared')}
      </InfoTip>
    ),
  };
  // The computers count explains itself where it is read (hover, focus or a tap): how many computers the server holds
  // (its limit, not what is left), one server's resources between them. Only a whole number gets the explanation; a dash keeps its own name.
  const computersValue = (shown: string) => {
    const count = /^\d+$/.test(shown) ? Number(shown) : 0;
    if (count < 1) return shown;
    return (
      <InfoTip text={t('plans.computersTip', { count })} subject={t('buy.resComputers')}>
        {shown}
      </InfoTip>
    );
  };
  const regionsOf = (c: Plan | null): PlanCardProps['regions'] => {
    if (!c) return { label: t('plans.regions'), note: t('plans.regionsNone') };
    const r = regionsBy[c.id] ?? REGIONS_UNKNOWN;
    if (r.state === 'loading') return { label: t('plans.regions'), note: t('plans.regionsLoading') };
    if (r.state === 'refused') return { label: t('plans.regions'), note: t('plans.regionsRefused') };
    if (r.state === 'unknown') return { label: t('plans.regions'), note: t('plans.regionsUnknown') };
    if (r.regions.length === 0) return { label: t('plans.regions'), note: t('plans.regionsFull') };
    return { label: t('plans.regions'), items: r.regions.map((x) => ({ id: x.id, flag: countryFlag(x.country), name: x.name })) };
  };
  // The AI allowance stays the last row of every column; the hardware row sits before it.
  const rowsOf = (pi: number): Row[] => {
    const fact = (r: (typeof factRows)[number]): Row => {
      const c = r.cells[pi];
      const value = r.id === 'computers' && c?.kind === 'value' && typeof c.value === 'string' ? computersValue(c.value) : cell(c);
      return { id: r.id, label: r.id === 'ai' ? t('plans.aiLabel') : t(r.label), value };
    };
    return [...factRows.filter((r) => CARD_FACTS.includes(r.id)).map(fact), hardwareRow, ...factRows.filter((r) => r.id === 'ai').map(fact)];
  };

  const price = (c: number | null) => ({ amount: c === null ? '—' : priceShort(c), per: t('plans.perMonth') });

  const marksOf = (c: Plan) => {
    const n = serversOn(c, subs.data?.subs);
    const own = columnMode(c, target, ups, cols, raw) === 'current';
    const sugg = isSuggested(c, want) && !own;
    if (!n && !sugg && !own) return undefined;
    // One pill per card: a suggested plan that also holds the person's servers says both in one, so its marks line never
    // wraps to two pills and pushes the price below its neighbours'.
    if (sugg && n > 0) return <StatusPill tone="neutral">{t('plans.suggestedYours', { count: n })}</StatusPill>;
    return (
      <>
        {/* The picked server's own plan: "Your plan", and the column offers nothing (actionOf). Otherwise the count. */}
        {own ? <StatusPill tone="ok">{t('yourPlan')}</StatusPill> : n > 0 && <StatusPill tone="ok">{t('plans.yours', { count: n })}</StatusPill>}
        {sugg && <StatusPill tone="neutral">{t('suggested')}</StatusPill>}
      </>
    );
  };

  // The line above a column's action when a server is picked: what the column means for that server.
  const noteOf = (c: Plan): string | undefined => {
    if (!target) return undefined;
    const mode = columnMode(c, target, ups, cols, raw);
    if (mode === 'current') {
      const until = day(target.paid_through);
      return until ? t('plans.onThisUntil', { server: serverName, date: until }) : t('plans.onThis', { server: serverName });
    }
    if (mode === 'notUp') return t('plans.notUp', { server: serverName });
    // The difference of the two catalogue prices only: what the checkout charges now is its quote's.
    const delta = upgradeDelta(target, c, cmp?.plans ?? [], raw);
    const from = ownCatalogue(target, cmp?.plans ?? [], raw)?.title;
    const up = t('plans.upgradeNote', { server: serverName });
    return delta !== null && from ? `${up} ${t('plans.upgradeDelta', { amount: cents(delta), plan: from })}` : up;
  };

  const actionOf = (c: Plan) => {
    const title = c.title || t('buy.kicker');
    const mode = columnMode(c, target, ups, cols, raw);
    // The plan the checkout opens is this column's version, never another of its family: no handle that
    // the checkout resolves to it, no action.
    const plan = checkoutPlan(c, plans.data ?? []);
    if (blocked || plan === null || mode === 'current' || mode === 'notUp') return undefined;
    // One accent per screen: the framed column's action is the grid's one primary; the others are secondary.
    const variant = framed === c.id ? 'primary' : 'secondary';
    if (mode === 'upgrade' && target)
      // The server's name is the user's, any length: the button says Upgrade to {plan}; its accessible name and the note
      // above it name the server.
      return (
        <Button
          variant={variant}
          isDisabled={banned}
          disabledReason={t('mkt.suspended')}
          aria-label={t('up.toPlanNamed', { server: serverName, plan: title })}
          // The whole id the person picked (subByWholeId resolves only that): an 8-character ending could name another server,
          // or, when the picked one leaves the list, the one that shares its ending.
          onPress={() => go(links.checkout('upgrade', { sub: target.id, plan, exact: true }))}
        >
          {t('up.toPlanShort', { plan: title })}
        </Button>
      );
    return (
      <Button variant={variant} isDisabled={banned} disabledReason={t('mkt.suspended')} onPress={() => go(links.checkout('buy', { plan, exact: true }))}>
        {t('getNamed', { plan: title })}
      </Button>
    );
  };

  // Whole ids (subByWholeId resolves only those); a label that two servers share says which is which.
  const labels = subLabels(choices);
  const forItems = [
    // "A new server" first: it is the default without ?sub=, so it is seen first however many servers follow (a
    // terminal of 24 rows shows about eight of them).
    { value: NEW, label: t('plans.forNew') },
    ...choices.map((x, i) => {
      const own = ownCatalogue(x, cmp?.plans ?? [], raw);
      const name = labels[i] as string;
      return { value: x.id, label: own?.title ? t('plans.forSub', { server: name, plan: own.title }) : name };
    }),
  ];
  // By whole id only, as the target: a short link names no server, so the line never says one it may not mean can't upgrade.
  const askedSub = blocked ? subByWholeId(subs.data?.subs, asked) : null;
  const forLine = blocked
    ? subs.isPending
      ? t('plans.forPending')
      : subs.isError
        ? t('plans.forErr')
        : askedSub
          ? t('plans.forCant', { server: hostLabel(askedSub) })
          : t('plans.forGone')
    : !target
      ? t('plans.forNewLine')
      : ups.size === 0
        ? t('up.top', { server: serverName })
        : t('plans.forSubLine', { server: serverName });
  // A failed read shows no plan, even one an earlier read had (as before): its state is the cell after Free.
  const onSale = cmp && !plans.isError ? cmp.plans : [];
  // The column's "Next" hint, the last sentence of its note (the line above its action). Only while the
  // plans are for a new server (with a server picked, or asked for, the note says what each column means for it), only
  // over a catalogue that answered (Free would point to bare metal while the plans are still on their way), and to bare
  // metal only when the band below is drawn. (`mode` stays a guard: a column smaller than a picked plan never hints.)
  const hintOf = (i: number, mode: string | null): string | undefined => {
    if (target || blocked || !cmp || plans.isPending || plans.isError || mode === 'notUp') return undefined;
    const h = nextHint(onSale, i, freeData?.max ?? null, !!market);
    if (!h) return undefined;
    if (h.kind === 'bare') return t('plans.nextBare');
    const head = t('plans.next', { plan: h.plan });
    const when =
      i === 0
        ? h.computers !== null
          ? t('plans.nextFree', { count: h.computers })
          : ''
        : h.ram && h.computers !== null
          ? t('plans.nextWhen', { ram: h.ram, count: h.computers })
          : h.ram
            ? t('plans.nextWhenRam', { ram: h.ram })
            : h.computers !== null
              ? t('plans.nextWhenComputers', { count: h.computers })
              : '';
    return when ? `${head} ${when}` : head;
  };

  // The second sentence is fixed wording.
  const lede = `${t('plansLede')} ${t('plans.several')}`;

  const body = (
    <>
      {/* The plans, and under them in the same grid the Bare metal band when there is a way to the market. */}
      <Section id="plans" title={t('plans')} description={lede} titleRef={titleRef}>
        <Stack gap={4}>
          {onSale.length > 0 && (choices.length > 0 || target || blocked) && (
            // One setting row: its label names the choices and its help line describes them; a long server name wraps
            // inside its radio.
            <SettingGroup variant="field">
              <SettingRow label={t('plans.for')} help={forLine}>
                {(ids) => (
                  <RadioGroup<string>
                    aria-labelledby={ids.nameId}
                    aria-describedby={ids.helpId}
                    options={forItems}
                    value={target ? target.id : blocked ? undefined : NEW}
                    onChange={(v) => go(v === NEW ? links.view('plans') : links.plansOn(v), { replace: true })}
                  />
                )}
              </SettingRow>
            </SettingGroup>
          )}
          <PlanGrid data-plans={onSale.length + 1} wide={!!market}>
            {/* Free: not a catalogue plan (validPlan drops a price of 0), so only what the Hub knows: $0, the account's
                free server, its computers, the Free AI tier. Its other limits are the FAQ's answer. One map draws Free and the
                plans, so the page's explanation measure reads the columns as one list of unknown size. Free never waits for
                the catalogue: a loading, failed or empty catalogue shows in the cell after it. */}
            {[null, ...onSale].map((c, i) => {
              const freeHint = c === null ? hintOf(0, null) : undefined;
              if (c === null)
                return (
                  <PlanCard
                    key="free"
                    name={t('plans.free')}
                    price={{ amount: priceShort(0), per: t('plans.perMonth') }}
                    lead={freeServer ? t('plans.freeYours', { server: freeServer }) : undefined}
                    marks={freeData && !target && !blocked ? <StatusPill tone="ok">{t('yourPlan')}</StatusPill> : undefined}
                    rows={[
                      ...(freeData?.max ? [{ id: 'computers', label: t('buy.resComputers'), value: computersValue(String(freeData.max)) }] : []),
                      hardwareRow,
                      { id: 'ai', label: t('plans.aiLabel'), value: ai('free', null) },
                    ]}
                    regions={regionsOf(null)}
                    fill="calm"
                    note={
                      <>
                        {freeData && `${t('plans.freeStays')} `}
                        {freeHint && `${freeHint} `}
                        <FaqLink item={pageFaq(t).byId.freeServer}>{t('plans.freeDetails')}</FaqLink>
                      </>
                    }
                  />
                );
              const pi = i - 1;
              const mode = columnMode(c, target, ups, cols, raw);
              return (
                <PlanCard
                  key={c.id}
                  name={c.title || t('buy.kicker')}
                  tone={framed === c.id ? 'accent' : mode === 'current' ? 'current' : 'default'}
                  // The entry plans calm, the biggest plan on sale the plan fill.
                  fill={pi === onSale.length - 1 ? 'plan' : 'calm'}
                  price={price(c.priceCents)}
                  // The price is said once, above (whole dollars lose only their ".00"); this line adds where it is paid from.
                  lead={c.priceCents === null ? undefined : t('plans.fromWallet')}
                  marks={marksOf(c)}
                  rows={rowsOf(pi)}
                  regions={regionsOf(c)}
                  note={[noteOf(c), hintOf(i, mode)].filter(Boolean).join(' ') || undefined}
                  action={actionOf(c)}
                />
              );
            })}
            {plans.isPending ? (
              <Skeleton variant="table" rows={5} columns={1} />
            ) : plans.isError || !cmp ? (
              // A refusal sent nowhere (an access-key session) offers no retry: the error's words say why.
              <ErrorState size="sm" title={t('buy.loadErr')} error={plans.error} onRetry={refusedHere(plans.error) ? undefined : () => void plans.refetch()} />
            ) : onSale.length === 0 ? (
              <EmptyState size="sm" icon="market" title={t('buy.noneOnSale')} />
            ) : null}
            {/* The Bare metal band, the grid's wide last card. */}
            {market && <BandOverRead t={t} open={market.open} cell={bare} quiet={onSale.some((c) => framed === c.id && actionOf(c) !== undefined)} />}
          </PlanGrid>
        </Stack>
      </Section>
      {/* The band above and this table share the one market read. */}
      <CompareOverRead t={t} cell={bare} regions={regionsBy} />
      {/* The lower sections, whether or not the band is drawn: what every plan includes first. */}
      <PlansMore t={t} />
    </>
  );
  // The market is the Bare metal view of this page (usePlace: every page link is a Hub page), never another site: the
  // band's one button is the tab's way to it. Only with a way to it is the market read, once for the band and the
  // table; without one no band is drawn and the table still draws, its Bare metal column without numbers.
  return (
    <>
      {market && <BareFactsRead cell={bare} />}
      {body}
    </>
  );
}
