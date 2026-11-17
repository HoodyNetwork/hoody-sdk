// Compare plans: the one table of the Plans view, under the plan cards and the Bare metal band. Columns: each plan on
// sale, then Bare metal (Free is not compared: its card above says what it has); rows: the price, the catalogue's
// facts in the plan cards' words, and the rows only the website words (hardware, regions, virtual machines). Every
// price and limit is the page's own read (the catalogue, one whole market read); a value no read gives is a dash
// named "Not listed", never a number. The table buys nothing: the cards above hold each plan's one action.
// While every column fits it is a table; in less room the kit draws one card per row, each plan's value on its own
// named line, so no plan is ever dropped and nothing scrolls sideways.
import { CellLines, createColumnHelper, DataTable, Icon, RowNote, ScaleBar, countryFlag, useContainerNarrow } from '@kit';
import { useMemo } from 'react';
import { usePlans } from '../data';
import { comparison } from '../logic';
import { CMP_COLUMN_MIN, CMP_LABEL_MIN, aiMultiple, aiScale, compareMinWidth, compareTable, type CmpCell, type CmpColumn, type CmpRow } from '../plans-compare-logic';
import type { BareFacts } from '../plans-next';
import type { PlanRegion, PlanRegions } from '../plans-regions';
import { Section, say, type T } from './Bits';

export interface PlansCompareProps {
  t: T;
  /** The Bare metal facts of one whole market read (useBareFacts); null without one, and no number shows in that column. */
  bare: BareFacts | null;
  /** Where each plan on sale can run now, by plan column id (the API's list per plan); a plan without an entry reads
   *  "not readable", never a location. */
  regions: Readonly<Record<string, PlanRegions>>;
}

const col = createColumnHelper<CmpRow>();

/** A location as one string: its flag, then its name. */
export const regionText = (r: PlanRegion): string => `${countryFlag(r.country)} ${r.name}`.trim();

/** The table's regions line: each flag and name held together (no break inside a pair, a long one still breaks
 *  anywhere in a wrapping cell rather than being cut), and a line breaks only after a separator, never before it. */
export const regionsLine = (regions: readonly PlanRegion[]): string =>
  regions.map((r) => regionText(r).replace(/ /g, '\u00a0')).join('\u00a0· ');

export function PlansCompare({ t, bare, regions }: PlansCompareProps) {
  const plans = usePlans();
  // A failed read shows no plan, even one an earlier read had (as the cards above).
  const failed = plans.isError || (!plans.isPending && !plans.data);
  const table = useMemo(
    () => compareTable({ cmp: plans.data && !failed ? comparison(plans.data) : null, bare, regions }),
    [plans.data, failed, bare, regions],
  );
  const narrow = useContainerNarrow(compareMinWidth(table.columns.length));
  // The AI scale ends at the largest multiple in the table, the plan cards' scale too (both read one catalogue).
  const scale = aiScale(table.rows.find((r) => r.id === 'ai')?.cells ?? []);

  // No value: one faint dash, named for a screen reader ("Not included": the plan has none; "Not listed": no read gives
  // a value), never the words repeated down a column.
  const dash = (why: 'notIncluded' | 'notListed') => <Icon name="minus" size="sm" tone="faint" label={t(why === 'notIncluded' ? 'plans.notIncluded' : 'plans.notListed')} />;
  const cell = (c: CmpCell | undefined) => {
    if (!c) return dash('notListed');
    switch (c.kind) {
      case 'text':
        return c.text;
      case 'word':
        return say(t, c.word);
      case 'none':
        return dash(c.why);
      case 'regions':
        // The places by name (each flag and name kept together); no count line above them. A note wraps in a narrow
        // column (the terminal clips a bare line with no "…").
        return <RowNote>{regionsLine(c.regions)}</RowNote>;
      case 'ai': {
        // The tier and its multiple in words ("Plus 2×"), over the multiple as bars on the table's one scale. Never a
        // limit: the multiple of Free's allowance and the tier are the only AI facts a plan shows. The note on what Free AI
        // is sits on the plan cards' words above (a table cell holds no button).
        const tierName = c.tier ? t(`aiu.tier.${c.tier}`) : null;
        const n = aiMultiple(c.tier, c.mult);
        const line = tierName && n !== null ? t('plans.aiTierMult', { tier: tierName, n }) : tierName ?? (n !== null ? t('plans.aiMult', { n }) : '');
        if (!line) return dash('notListed');
        if (n === null) return line;
        return (
          <CellLines>
            {line}
            <ScaleBar value={n} max={scale} label={t(n === 1 ? 'plans.aiScaleBase' : 'plans.aiScale', { n })} />
          </CellLines>
        );
      }
    }
  };
  const titleOf = (c: CmpColumn): string => (c.kind === 'bare' ? t('plans.bareMetal') : c.title || t('buy.kicker'));

  const columns = [
    col.display({
      id: 'what',
      header: t('plans.cmp.what'),
      meta: { pinned: true, list: 'primary', minWidth: CMP_LABEL_MIN, label: t('plans.cmp.what'), wraps: true },
      cell: (c) => t(c.row.original.label),
    }),
    ...table.columns.map((column, i) =>
      col.display({
        id: column.id,
        header: titleOf(column),
        // wraps: a value (hardware, IO rates, regions, the AI allowance) takes the lines it needs in the table, never cut
        // with an ellipsis (fit.spec 'no text on the Plans view is cut' at 1350: plan cells 162 wide, the AI line 237).
        meta: { priority: 1, minWidth: CMP_COLUMN_MIN, label: titleOf(column), listLabel: true, listWraps: true, wraps: true },
        cell: (c) => cell(c.row.original.cells[i]),
      }),
    ),
  ];

  return (
    <Section id="compare" title={t('plans.cmp.title')}>
      <DataTable<CmpRow>
        bare
        fill={false}
        label={t('plans.cmp.title')}
        data={plans.isPending || failed ? undefined : table.rows}
        isLoading={plans.isPending}
        error={failed ? (plans.error ?? true) : undefined}
        onRetry={() => void plans.refetch()}
        columns={columns}
        getRowId={(r) => r.id}
        presentation={narrow ? 'cards' : 'table'}
        onRowAction={false}
        sortParam={false}
        noViewMenu
      />
    </Section>
  );
}

