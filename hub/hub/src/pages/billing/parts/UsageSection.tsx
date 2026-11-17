// AI usage and limits: each server has its own free allowance. The page shows tier, multiple and five lanes
// (bar plus percent in steps of 10, "drops back about …" in the tooltip). "More AI" is always a bigger server plan
// or a bare-metal machine: AI is sold only with a server. The kit DataTable draws it as a table while every column
// fits at its least width, else as cards that keep every lane (named, one per line): no lane is ever dropped.
import {
  Button,
  createColumnHelper,
  cx,
  DataTable,
  EDGE_PAD,
  EmptyState,
  ErrorState,
  FaqLink,
  Meter,
  Skeleton,
  StatusPill,
  useContainerNarrow,
  useDataView,
  useGo,
} from '@kit';
import { useMemo, useRef } from 'react';
import { useServerKinds, usePlans, useSubs, useUsage, usageError } from '../data';
import { aiUsage, LANES, laneLevel, laneWords, type LaneReading, type UsageRow } from '../logic';
import { links } from '../links';
import { usePlace } from '../pagelinks';
import type { RawUsage } from '../types';
import { pageFaq } from '../faq';
import { Section, type T, say } from './Bits';
import s from './parts.module.css';

const col = createColumnHelper<UsageRow>();

/** The least width (px) of each table column: the tier wraps its multiplier and holds its "BARE-METAL" tag whole, a lane
 * is the 60 px bar, a gap and "100%" inside the 12 px cell padding, 120 in all (its words, "Not on this server", wrap).
 * The action holds the widest row button fit.spec.ts draws whole inside the last cell's padding (12 + 16): "Get more AI"
 * with its arrow is 143 px (the 13 px mono capitals 89, padding 2 x 14, gap 8, arrow 16, frame 2), so 180 leaves 9 to
 * spare ("Upgrade" is narrower). No more than that: at 1350 the shell keeps a classic scrollbar's room (15 to 17 px on
 * Windows and Linux), and the table still draws there beside a 17 px bar (fit.spec.ts).
 * Each also covers its own caps header, which the kit table never clips ("QUICK DECISIONS" needs 134): a smaller value
 * here would let the table drop its rightmost column (the action) above USAGE_TABLE_MIN. fit.spec.ts proves that at
 * exactly USAGE_TABLE_MIN every column is drawn. */
const USAGE_MIN = {
  server: 140,
  tier: 106,
  lane: { chat: 120, decisions: 134, search: 120, speech: 120, transcription: 120 },
  action: 180,
} as const;
/** Px a 'fit' column needs beside the words it measures (kit fitWidth measures plain body text): the server name is
 * drawn bold; the tier's pill has its own padding. */
const USAGE_FIT_PAD = { server: 12, tier: 24 } as const;
// The server column is 'fit' and first, so the kit adds the row's start padding (EDGE_PAD) to its floor; its least width
// is set that much lower so the floor stays USAGE_MIN.server and the table's least width stays USAGE_TABLE_MIN
// (at 1350 the section stays wider than that even beside a 17 px scrollbar, so the table draws whole there, the action
// column included).
/** Below this the table would drop a column, so the cards draw instead (+2: the frame's borders). */
const USAGE_TABLE_MIN =
  USAGE_MIN.server + USAGE_MIN.tier + LANES.reduce((n, l) => n + USAGE_MIN.lane[l], 0) + USAGE_MIN.action + 2;

function Lane({ t, l }: { t: T; l: LaneReading }) {
  const words = say(t, laneWords(l));
  const name = t(`aiu.lane.${l.lane}`);
  if (l.off) {
    return (
      <span className={cx(s.lane, s.laneOff)} title={t('aiu.laneTitle', { name, words })}>
        {words}
      </span>
    );
  }
  if (l.pct === null) {
    return (
      <span className={cx(s.lane, s.muted)} title={t('aiu.laneTitle', { name, words })}>
        {words}
      </span>
    );
  }
  const level = laneLevel(l.pct);
  return (
    <span className={s.lane} title={t('aiu.laneTitle', { name, words })}>
      <Meter value={l.pct} label={name} tone={level === 'full' ? 'danger' : level === 'high' ? 'warn' : 'neutral'} />
      <span className={s.mono}>{t('aiu.pct', { pct: l.pct })}</span>
    </span>
  );
}

export function UsageSection({ t, banned }: { t: T; banned: boolean }) {
  const usage = useUsage();
  const subs = useSubs();
  const plans = usePlans();
  const kinds = useServerKinds();
  const go = useGo();
  const market = usePlace('market');
  // The section body's own box (drawn in every state, so it is there when the effect first measures).
  const frame = useRef<HTMLDivElement | null>(null);
  const narrow = useContainerNarrow(USAGE_TABLE_MIN, frame);
  const view = useMemo(
    () => (usage.data ? aiUsage(usage.data as RawUsage, subs.data?.subs ?? null, plans.data ?? null, kinds.data ?? {}) : null),
    [usage.data, subs.data, plans.data, kinds.data],
  );

  const more = (r: UsageRow) => {
    if (r.sub && r.upPlan) {
      return (
        <Button
          size="sm"
          isDisabled={banned}
          disabledReason={t('mkt.suspended')}
          onPress={() =>
            go(
              links.checkout('upgrade', {
                sub: r.sub,
                plan: r.upPlan,
                view: 'wallet',
              }),
            )
          }
          // 'Upgrade' as in the Subscriptions row, named for its server: the chip button with the longer
          // 'Upgrade this server' would not fit the action column at 1350.
          aria-label={t('up.buttonNamed', { server: r.name })}
        >
          {t('up.button')}
        </Button>
      );
    }
    if (r.suggest) {
      const fam = r.suggest;
      return (
        <Button size="sm" variant="ghost" iconEnd="arrow-right" onPress={() => go(links.plansFor(fam))}>
          {t('aiu.more')}
        </Button>
      );
    }
    if (r.bareNext && market) {
      return (
        // Reads 'Get more AI' like the plan suggestion, so it fits the action column; the name says where it leads
        // (label in name: the drawn words open it).
        <Button size="sm" variant="ghost" iconEnd="arrow-right" onPress={market.open} aria-label={t('aiu.bare')}>
          {t('aiu.more')}
        </Button>
      );
    }
    return null;
  };

  const head = (r: UsageRow) => (
    <span className={s.usageName}>
      <strong dir="auto">{r.name}</strong>
      {r.plan && (
        <span className={cx(s.muted, s.small)}>
          <bdi>{r.plan}</bdi>
        </span>
      )}
      {!r.ok && <span className={s.usageUnavailable}>{t('aiu.unavailable')}</span>}
    </span>
  );
  const tier = (r: UsageRow) =>
    r.tier ? (
      <span className={s.usageTier}>
        <StatusPill tone={r.tier === 'free' ? 'neutral' : 'accent'}>{t(`aiu.tier.${r.tier}`)}</StatusPill>
        {r.mult && !r.bare ? <span className={cx(s.muted, s.small)}>{t('aiu.mult', { n: r.mult })}</span> : null}
      </span>
    ) : null;

  const lanesOf = (r: UsageRow, l: (typeof LANES)[number]) => r.lanes.find((x) => x.lane === l);
  // Meter table columns: the server and tier columns take their own words (kit 'fit', measured
  // from these texts), the action keeps its own width (its least, which holds its buttons whole: the design
  // leaves the last column as it is too), and the five meter columns share the rest equally ('fill': the same spare on
  // top of each one's least width). USAGE_MIN stays each column's least width, so the table-to-cards switch
  // (USAGE_TABLE_MIN) is unchanged.
  // The tier fits its pill (the Bare-metal tag whole); the multiplier keeps wrapping under it, never cut: on one line
  // too it would push the action column out at 1350.
  const tierText = (r: UsageRow) => (r.tier ? t(`aiu.tier.${r.tier}`) : '');

  const columns = [
    col.accessor('name', {
      id: 'server',
      header: t('col.server'),
      meta: { pinned: true, list: 'primary', size: 'fit', fitText: (r: UsageRow) => r.name, fitPad: USAGE_FIT_PAD.server, minWidth: USAGE_MIN.server - EDGE_PAD, label: t('col.server') },
      cell: (c) => head(c.row.original),
    }),
    col.display({
      id: 'tier',
      header: t('col.tier'),
      meta: { priority: 1, size: 'fit', fitText: tierText, fitPad: USAGE_FIT_PAD.tier, minWidth: USAGE_MIN.tier, label: t('col.tier') },
      cell: (c) => tier(c.row.original),
    }),
    ...LANES.map((l) =>
      col.display({
        id: l,
        header: t(`aiu.lane.${l}`),
        meta: { priority: 1, size: 'fill', minWidth: USAGE_MIN.lane[l], label: t(`aiu.lane.${l}`), card: false },
        cell: (c) => {
          const r = c.row.original;
          const lane = r.ok ? lanesOf(r, l) : undefined;
          return lane ? <Lane t={t} l={lane} /> : <span className={s.faint}>—</span>;
        },
      }),
    ),
    // Cards only: every lane with its name, one per line (a server that could not be read says so under its name).
    col.display({
      id: 'lanes',
      header: t('aiu.title'),
      meta: { table: false, list: false, card: 'foot', label: t('aiu.title') },
      cell: (c) => {
        const r = c.row.original;
        if (!r.ok) return null;
        return (
          <div className={s.usageLanes}>
            {LANES.map((l) => {
              const lane = lanesOf(r, l);
              return (
                <div key={l} className={s.usageLane}>
                  <span className={s.muted}>{t(`aiu.lane.${l}`)}</span>
                  {lane ? <Lane t={t} l={lane} /> : <span className={s.faint}>—</span>}
                </div>
              );
            })}
          </div>
        );
      },
    }),
    col.display({
      id: 'action',
      header: () => <span className={s.srOnly}>{t('col.action')}</span>,
      meta: { priority: 1, size: 'fixed', width: `${USAGE_MIN.action}px`, minWidth: USAGE_MIN.action, label: t('col.action'), list: false, card: 'foot' },
      cell: (c) => more(c.row.original),
    }),
  ];
  // Its own view under the 'ai' URL prefix: Server subscriptions above own the page's ?q and ?sort. No search box.
  const rowsView = useDataView<UsageRow>({ rows: view?.servers, columns, getRowId: (r) => r.id, search: false, param: 'ai' });

  return (
    <Section
      id="usage"
      title={t('aiu.title')}
      description={
        <>
          {t('aiu.lede')} <FaqLink item={pageFaq(t).byId.aiAllowance}>{t('aiu.allowanceMore')}</FaqLink>
        </>
      }
    >
      {/* data-least: the width below which the cards draw (fit.spec.ts reads it). */}
      <div ref={frame} className={s.usageBody} data-least={USAGE_TABLE_MIN}>
        {usage.isPending ? (
          <Skeleton variant="table" rows={3} columns={6} />
        ) : usage.isError || !view ? (
          // A sign-in that may not see the usage is told so; reading again cannot change it, so no Try again is offered.
          <ErrorState size="sm" title={t(usageError(usage.error?.kind))} error={usage.error} onRetry={usage.error?.kind === 'forbidden' ? undefined : () => void usage.refetch()} />
        ) : view.servers.length === 0 ? (
          <EmptyState
            size="sm"
            icon="ai"
            title={t('aiu.noServersTitle')}
            body={t('aiu.noServers')}
            action={
              view.more ? (
                <Button variant="secondary" onPress={() => go(links.plansFor(view.more as string))}>
                  {t('aiu.more')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div data-usage={narrow ? 'cards' : 'table'}>
              <DataTable<UsageRow>
                label={t('aiu.title')}
                view={rowsView}
                getRowId={(r) => r.id}
                onRowAction={false}
                fill={false}
                presentation={narrow ? 'cards' : 'table'}
                onRefresh={() => void usage.refetch()}
                countLabel={(n) => t('subs.count', { count: n })}
                columns={columns}
              />
            </div>
            {view.truncated && (
              <p className={s.partial} role="status" /* reason: one-line inline hint that the read was cut, not a state */>
                {t('aiu.truncated')}
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
