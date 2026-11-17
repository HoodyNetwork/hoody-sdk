// Under the plan columns, the Bare metal band: a card of the plans' grid that takes its whole last row, never a plan
// column, framed and laid out as the plan cards (name, what it is, the price, label | value rows, its button inside),
// with real ranges and a "from" over
// the market's 30-day rentals (the read the Bare metal view uses) and its one way to the market. The band never shows a
// guessed price: while the market is read (a refetch included), unread, read in part or read again one rail alone it
// says only what bare metal is: dedicated hardware, the region picked with the listing (no read needed). Its one
// primary, "Browse machines", only goes to the Bare metal view. (The line of what every plan includes is the All plans
// section's, parts/PlansMore.tsx.)
import { Button, formatStorage, InfoTip, PlanCard, type PlanCardProps } from '@kit';
import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { bareFacts, type BareFacts, type Span } from '../plans-next';
import { usePairedListings } from '../servers/data';
import { money } from '../servers/logic';
import type { T } from './Bits';

const spanText = ([a, b]: Span, f: (n: number) => string) => (a === b ? f(a) : `${f(a)}–${f(b)}`);

/**
 * The Bare metal facts of one whole market read, or null. Only one whole read counts: both rails answered clean in the
 * same read cycle and are not reading again; a rail read again alone never joins the other's older answer. The hook
 * asks for the other rail once per read cycle, so one screen calls it once and hands the facts to every piece that
 * shows them (the band, the Compare plans table).
 */
export function useBareFacts(): BareFacts | null {
  const list = usePairedListings();
  const clean = list.paired;
  return useMemo(() => (clean ? bareFacts(list.data) : null), [clean, list.data]);
}

/** Where one screen keeps the Bare metal facts of its one market read: null until a whole read, and without a read. */
export interface BareFactsCell {
  get: () => BareFacts | null;
  set: (f: BareFacts | null) => void;
  subscribe: (fn: () => void) => () => void;
}

/** One cell per mounted screen. */
export function useBareFactsCell(): BareFactsCell {
  return useState((): BareFactsCell => {
    let facts: BareFacts | null = null;
    const subs = new Set<() => void>();
    return {
      get: () => facts,
      set: (f) => {
        if (f === facts) return;
        facts = f;
        for (const fn of subs) fn();
      },
      subscribe: (fn) => {
        subs.add(fn);
        return () => void subs.delete(fn);
      },
    };
  })[0];
}

/**
 * The screen's ONE market read for the Bare metal facts: useBareFacts is called once here, and only where this is
 * mounted (a screen with no way to the market mounts none and reads nothing). It draws nothing; it files the read in
 * the screen's cell before the browser paints, and empties the cell when it leaves. The pieces that show the facts (the
 * band, the Compare plans table) read the cell (useReadBareFacts), so both show the same read.
 */
export function BareFactsRead({ cell }: { cell: BareFactsCell }) {
  const facts = useBareFacts();
  useLayoutEffect(() => cell.set(facts), [cell, facts]);
  useLayoutEffect(() => () => cell.set(null), [cell]);
  return null;
}

/** The Bare metal facts filed in the screen's cell; null without a read, or while it has no whole read. */
export function useReadBareFacts(cell: BareFactsCell): BareFacts | null {
  return useSyncExternalStore(cell.subscribe, cell.get);
}

/** The Bare metal band, the wide last card of the plans' grid (PlanGrid `wide`), over facts its caller read
 *  (useBareFacts): `open` goes to the Bare metal view (usePlace('market')). `quiet`: a plan card of the grid holds the
 *  screen's accent button, so this card's button is the standard one (one accent per screen). */
export function BareBand({ t, open, facts, quiet }: { t: T; open: () => void; facts: BareFacts | null; quiet?: boolean }) {
  // First the website's words, true of every machine whatever the market read says: the kind of hardware, with its
  // explanation (as "Shared hardware" on the plan cards), and where it runs (the listing says). They keep their places
  // when the market's facts arrive after them, so an open explanation stays open.
  const rows: NonNullable<PlanCardProps['rows']>[number][] = [
    {
      id: 'hardware',
      label: t('plans.hardware'),
      value: (
        <InfoTip text={t('plans.dedicatedTip')} subject={t('plans.dedicated')}>
          {t('plans.dedicated')}
        </InfoTip>
      ),
    },
    { id: 'regions', label: t('plans.regions'), value: t('plans.regionsBare') },
  ];
  // The "from" is the card's price line (never a row of the list), only over a whole market read.
  if (facts) rows.push({ id: 'from', label: t('plans.bareFromLabel'), value: t('plans.bareFrom', { amount: money(facts.fromCents) }), price: true });
  if (facts?.cores) rows.push({ id: 'cores', label: t('plans.bareCores'), value: spanText(facts.cores, String) });
  if (facts?.ramGb) rows.push({ id: 'ram', label: t('plans.bareRam'), value: spanText(facts.ramGb, formatStorage) });
  if (facts?.diskGb) rows.push({ id: 'disk', label: t('plans.bareDisk'), value: spanText(facts.diskGb, formatStorage) });
  if (facts && facts.countries > 0) rows.push({ id: 'countries', label: t('plans.bareCountries'), value: String(facts.countries) });
  return (
    <PlanCard
      wide
      name={t('plans.bareMetal')}
      subTitle={t('plans.bareMetalBody')}
      tone="accent"
      fill="lift"
      rows={rows}
      action={
        <Button variant={quiet ? 'secondary' : 'primary'} iconEnd="arrow-right" onPress={open}>
          {t('plans.browseMachines')}
        </Button>
      }
    />
  );
}
