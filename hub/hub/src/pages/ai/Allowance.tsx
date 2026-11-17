// Models & keys → Hoody AI allowance: each of the account's servers with its five AI lanes, read by core's lane rules
// (the ones Billing's usage table and the Servers cards use), so a lane says the same thing on every page. What was not
// read is never a 0: a server whose reading is unavailable, and a lane with no reading, say so in words. Wallet & usage
// keeps the full table with tiers and upgrades; the toolbar links there.
// Add AI credit is not on sale yet: the row says it is planned and its button stays disabled with the reason; no click
// is counted.
import { LANES, laneLevel, laneWords, usageRefusal, type Lane } from '@core';
import {
  Button,
  CellLines,
  createColumnHelper,
  DataTable,
  EmptyState,
  RowNote,
  SettingGroup,
  SettingRow,
  SubSection,
  Tag,
  followPageLink,
  useDataView,
  useGo,
  usePageLink,
  useStrings,
  type SectionState,
} from '@kit';
import { useMemo } from 'react';
import { links as billing } from '../billing/links';
import { useAllowance, type AllowanceServer } from './data';
import { LaneReading } from './LaneReading';
import strings from './Allowance.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<AllowanceServer>();
// The table and the credit row draw their own states (the table its loading, error and empty).
const READY: SectionState = { kind: 'ready' };

/** One lane of one server: its percent and bar, or its words when there is nothing to draw. */
function laneCell(t: T, r: AllowanceServer, lane: Lane) {
  // An unreadable server says why once, under its name (serverCell); each lane only says there is no reading.
  if (!r.ok) return t('aiu.unknown');
  const l = r.lanes.find((x) => x.lane === lane);
  // A lane the answer left out has no reading (never a 0).
  if (!l) return t('aiu.unknown');
  const w = laneWords(l);
  const words = t(w.k, w.v);
  if (l.off || l.pct === null) return words;
  const level = laneLevel(l.pct);
  return (
    <LaneReading
      pct={l.pct}
      label={t('aiu.laneTitle', { name: t(`aiu.lane.${lane}`), words })}
      tone={level === 'full' ? 'danger' : level === 'high' ? 'warn' : 'neutral'}
    />
  );
}

/** The server's name; an unreadable server carries the reason under it, where a sentence has room to wrap. */
function serverCell(t: T, r: AllowanceServer) {
  if (r.ok) return r.name;
  return (
    <CellLines>
      {r.name}
      <RowNote>{t('aiu.unavailable')}</RowNote>
    </CellLines>
  );
}

export function AllowanceSection() {
  const t = useStrings(strings);
  const read = useAllowance();
  const go = useGo();
  const wallet = usePageLink('billing');
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('col.server'), meta: { pinned: true }, cell: (c) => serverCell(t, c.row.original) }),
      ...LANES.map((lane) =>
        col.display({
          id: lane,
          header: t(`aiu.lane.${lane}`),
          cell: (c) => laneCell(t, c.row.original, lane),
        }),
      ),
    ],
    [t],
  );
  const view = useDataView({
    rows: read.data?.servers,
    columns,
    getRowId: (r: AllowanceServer) => r.id,
    param: 'allowance',
    isLoading: read.isPending,
    error: read.error ?? undefined,
  });
  return (
    <>
      <SubSection title={t('servers')} state={READY}>
        <DataTable
          label={t('label')}
          columns={columns}
          view={view}
          onRowAction={false}
          onRefresh={() => void read.refetch()}
          onRetry={() => void read.refetch()}
          // The usage read's refusals in core's words (a sign-in that may not see usage, read too often, failed).
          errorBody={read.error ? t(usageRefusal((read.error as { kind?: string } | null)?.kind)) : undefined}
          countLabel={(n) => t('count', { count: n })}
          // No server: the way to one (the plans) beside the words; the empty table draws no toolbar.
          empty={
            <EmptyState
              size="sm"
              icon="ai"
              title={t('empty.title')}
              body={t('empty.body')}
              action={wallet ? <Button onPress={() => (wallet.kind === 'hub' ? go(billing.plans) : followPageLink(wallet, go))}>{t('empty.plans')}</Button> : undefined}
            />
          }
          noViewMenu
          presentation="auto"
          toolbarActions={
            wallet
              ? [
                  {
                    id: 'wallet',
                    label: t('wallet'),
                    icon: 'arrow-right',
                    onPress: () => (wallet.kind === 'hub' ? go(billing.usage) : followPageLink(wallet, go)),
                  },
                ]
              : undefined
          }
          toolbarNote={read.data?.truncated ? t('truncated') : undefined}
        />
      </SubSection>
      <SubSection title={t('credit.title')} state={READY}>
        <SettingGroup label={t('credit.label')}>
          <SettingRow
            label={t('credit.label')}
            help={t('credit.help')}
            actions={
              <Button size="sm" isDisabled disabledReason={t('credit.why')}>
                {t('credit.button')}
              </Button>
            }
          >
            <Tag>{t('credit.soon')}</Tag>
          </SettingRow>
        </SettingGroup>
      </SubSection>
    </>
  );
}
