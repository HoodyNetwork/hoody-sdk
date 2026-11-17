// The computers table: search, filter chips, sort, hover actions, one row per computer. With a
// computer selected the kit narrows this to the list presentation (the columns with a lower priority drop).
import { AskAgentDrawer, Meter, Button, DataTable, useDataView, StatusPill, createColumnHelper, useStrings, useListPane, type FilterChip, type RowActionEntry, type ToolbarAction } from '@kit';
import { useCan } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { useMachinesView } from './machinesView';
import { type Caps, type Op, access as accessOf, handleOf, serverKey, serverLabel, stateGroup, allowedOps, allows, bucket, projectName, sizeParts, sizeText, usageReadings } from '../logic';
import strings from '../strings.en.json';
import { programUrl } from '../urls';
import type { Computer, Project, Realm, Server, Usage } from '../types';
import { AccessDrawer, useExplainAll } from './AccessDrawer';
import { AccessLock, ComputerDot, RealmChips, ServerLabel, StatePill } from './Bits';
import { ComputerCard } from './ComputerCard';
import { type ComputerAction, computerMenu, notRunningReason } from './menu';
import { useOut } from './useOut';
import type { OpState } from './ops';
import { SnapshotsCell } from '../snapshots';
import s from './parts.module.css';

const col = createColumnHelper<Computer>();
// State sorts running first, then starting, stopped, and the ones that need attention.
const STATE_RANK = { running: 0, starting: 1, stopped: 2, problems: 3 } as const;

export interface ComputersListProps {
  computers: Computer[] | undefined;
  projects: Project[] | undefined;
  realms: Realm[] | undefined;
  caps: Caps;
  currentId: string | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  ops: Readonly<Record<string, OpState>>;
  usage: Record<string, Usage | null> | undefined;
  servers: { key: string; name: string }[];
  /** Free or paid server; undefined while the servers list has not loaded (no Plan filter then). */
  planOf?: (c: Computer) => 'free' | 'paid' | undefined;
  /** The computer's server in the servers list, for the card's near/full upgrade. */
  serverFor?: (c: Computer) => Server | undefined;
  onAction: (c: Computer, a: ComputerAction) => void;
  /** A bulk change on the selected rows; `clear` empties the selection (the page calls it once the change is sent). */
  onBulk: (op: 'start' | 'stop' | 'restart', rows: Computer[], clear: () => void) => void;
  /** The list's switches and actions (kit toolbarActions: they fold into the view menu when the toolbar is tight). */
  toolbarActions?: readonly ToolbarAction[];
  /** What a toolbar action said, on its own line under the toolbar. */
  toolbarNote?: React.ReactNode;
  /** Adds "Ask the Agent" about access to the toolbar actions: it opens the kit Ask the Agent drawer. */
  explainAll?: boolean;
  /** Phone: the Usage switch lives in Filters. */
  usageFilter?: { on: boolean; onChange: (on: boolean) => void };
  empty: React.ReactNode;
}

function UsageCell({ usage }: { usage: Usage | null | undefined }) {
  const t = useStrings(strings);
  if (!usage) return <span className={s.faint}>—</span>;
  const parts = usageReadings(usage);
  // Stacked, one reading a line: three ten-block meters side by side (3 x 60 px plus gaps) do not fit the 140 px column.
  return (
    <span className={s.usageStack}>
      {parts.map((p) =>
        p.v === null || p.text === null ? (
          <span key={p.id} className={s.faint}>
            —
          </span>
        ) : (
          <Meter key={p.id} value={p.v} label={t(`usage.${p.id}`, { pct: p.text })} />
        ),
      )}
    </span>
  );
}

export function ComputersList(p: ComputersListProps) {
  const t = useStrings(strings);
  const out = useOut();
  // The padlock's popover opens one access drawer for its row (only when this session may see access rules). The drawer
  // holds the row's id and reads the row from the current list, so a rename or a new scope shows at once; a row that
  // leaves the list closes it.
  const canAccess = useCan('resources.proxy_aliases');
  const [accessId, setAccessId] = useState<string | null>(null);
  const accessFor = accessId === null ? undefined : p.computers?.find((c) => c.id === accessId);
  useEffect(() => {
    if (accessId !== null && !accessFor) setAccessId(null);
  }, [accessId, accessFor]);

  // Cards or List, shared with Servers and Projects (useMachinesView).
  const [present, setPresent] = useMachinesView();
  // On a card the name is the card's title: never cut (it wraps), and the project takes its own line under it
  // (its row menu holds the rest). A list or table row keeps one line. A ListDetailPage with a detail open draws the list as rows
  // whatever the choice (useListPane), so this follows the kit's own rule for when a card is drawn.
  const pane = useListPane();
  const rail = Boolean(pane.rail);
  const asCard = present === 'cards' && pane.presentation !== 'list';
  const columns = useMemo(
    () => [
      col.display({
        id: 'lead',
        header: t('col.name'),
        enableSorting: false,
        meta: { list: 'lead', table: false, card: false },
        cell: (c) => <ComputerDot computer={c.row.original} />,
      }),
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true, label: t('col.name') },
        cell: (c) => {
          const row = c.row.original;
          const proj = projectName(p.projects, row.project_id);
          const dotted = `· ${proj}`;
          const current = row.id === p.currentId ? (
            <span title={t('current.tip')}>
              <StatusPill tone="neutral">{t('current.chip')}</StatusPill>
            </span>
          ) : null;
          if (asCard) {
            return (
              <span className={s.nameCell}>
                <span className={s.nameLine}>
                  <ComputerDot computer={row} />
                  <strong className={s.nameCard}>{row.name}</strong>
                </span>
                {proj || current ? (
                  <span className={s.nameSub}>
                    {proj ? <span className={s.nameText}>{proj}</span> : null}
                    {current}
                  </span>
                ) : null}
              </span>
            );
          }
          return (
            <span className={s.nameCell}>
              <span className={s.nameLine}>
                <span data-lead-dup="">
                  <ComputerDot computer={row} />
                </span>
                <strong className={s.nameStrong}>{row.name}</strong>
                {proj ? <span className={`${s.faint} ${s.nameText}`}>{dotted}</span> : null}
                {current}
              </span>
            </span>
          );
        },
      }),
      col.display({
        id: 'realms',
        header: t('col.realms'),
        // Room for a usual realm name on one line (the kit Tag's dot gap included); a longer one ends in an ellipsis.
        meta: { width: '140px', priority: 2, label: t('col.realms') },
        cell: (c) => <RealmChips ids={c.row.original.realm_ids ?? []} realms={p.realms} max={1} />,
      }),
      // Server, State, Size and Access sort too, each by one plain value of the row (Realms and Backups stay unsorted).
      col.accessor((r) => serverLabel(r).name.toLowerCase(), {
        id: 'server',
        header: t('col.server'),
        meta: { width: '150px', priority: 2, label: t('col.server') },
        // In a rail the row is `state · realm · flag name`: the city and the size stay on the table and the detail.
        cell: (c) => <ServerLabel computer={c.row.original} place={!rail} />,
      }),
      col.accessor((r) => STATE_RANK[stateGroup(r.status)], {
        id: 'state',
        header: t('col.state'),
        meta: { width: '110px', priority: 1, list: 'status', label: t('col.state') },
        cell: (c) => {
          const row = c.row.original;
          const op = p.ops[row.id];
          if (op?.kind === 'busy') return <StatusPill tone="info" dot>{t(`op.busy.${op.op}`)}</StatusPill>;
          if (op?.kind === 'pending') return <StatusPill tone="warn" dot>{t('op.pill.pending')}</StatusPill>;
          if (op?.kind === 'failed' || op?.kind === 'not_sent') return <StatusPill tone="danger" dot>{t('op.pill.failed')}</StatusPill>;
          return <StatePill status={row.status} />;
        },
      }),
      col.accessor((r) => { const z = sizeParts(r); return (z.cores ?? 0) * 1e6 + (z.ramGb ?? 0); }, {
        id: 'size',
        header: t('col.size'),
        meta: { width: '150px', priority: 2, label: t('col.size') },
        cell: (c) => {
          if (rail) return null;
          const sz = sizeParts(c.row.original);
          return sz.cores === null && sz.ramGb === null ? (
            <span className={s.faint}>—</span>
          ) : (
            <span>{sizeText(sz, t)}</span>
          );
        },
      }),
      col.accessor((r) => accessOf(r).state, {
        id: 'access',
        header: t('col.access'),
        meta: { width: '160px', priority: 2, label: t('col.access') },
        cell: (c) => (
          <span className={s.nowrapRow}>
            <AccessLock computer={c.row.original} {...(canAccess ? { onView: () => setAccessId(c.row.original.id) } : {})} />
            <span className={s.faint}>{t(`access.short.${accessOf(c.row.original).state}`)}</span>
          </span>
        ),
      }),
      col.display({
        id: 'snapshots',
        header: t('col.backups'),
        meta: { width: '90px', priority: 3, label: t('col.backups') },
        cell: (c) => <SnapshotsCell computer={c.row.original} />,
      }),
      col.display({
        id: 'actions',
        header: t('col.actions'),
        // Fits the widest action (Restart, Resume) as a small chip button: 112 px, 122 on a coarse pointer, and the cell's
        // padding. Nothing is cut.
        meta: { width: '152px', priority: 1, list: false, label: t('col.actions') },
        cell: (c) => {
          const row = c.row.original;
          if (p.ops[row.id]?.kind === 'busy' || p.ops[row.id]?.kind === 'pending') return null; // a held press is never offered again here
          const b = bucket(row.status);
          // A running card's band starts with what its row menu leads with, Open terminal (every card's band has
          // its start button, on one line). Cards only: a table or list row keeps its hover terminal icon.
          if (asCard && b === 'running') {
            return (
              <Button size="sm" variant="secondary" icon="terminal" iconEnd="external" isDisabled={!programUrl(row, 'terminal')} disabledReason={t('menu.noTerminal')} onPress={() => p.onAction(row, 'openTerminal')}>
                {t('menu.openTerminal')}
              </Button>
            );
          }
          const op = allowedOps(row, p.caps).find((o) => o === 'start' || o === 'resume' || (b === 'failed' && o === 'restart'));
          // A failed computer this sign-in may not restart: the cell says so in words, never blank (a card shows Restart off
          // with the full reason).
          if (!op && b === 'failed' && row.server_expired !== true && !allows(p.caps, 'restart')) return t('row.restart.noRightShort');
          if (!op || !(b === 'stopped' || b === 'paused' || b === 'failed')) return b === 'starting' ? <span className={s.faint}>{t('state.starting.note')}</span> : null;
          return (
            <Button size="sm" variant="secondary" icon={op === 'restart' ? 'reload' : 'play'} onPress={() => p.onAction(row, op)}>
              {t(`menu.${op}`)}
            </Button>
          );
        },
      }),
      ...(p.usage
        ? [
            col.display({
              id: 'usage',
              header: t('col.usage'),
              meta: { width: '140px', priority: 4, label: t('col.usage') },
              cell: (c) => <UsageCell usage={p.usage?.[c.row.original.id]} />,
            }),
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, p.projects, p.realms, p.currentId, p.ops, p.caps, p.usage !== undefined, p.usage, canAccess, asCard, rail],
  );

  const view = useDataView<Computer>({
    rows: p.computers,
    columns,
    getRowId: handleOf,
    pageSize: 50,
    isLoading: p.loading,
    error: p.error,
    search: (c) => [c.name, projectName(p.projects, c.project_id), c.server?.name ?? c.server_name, c.server?.city],
    filters: [
      {
        id: 'state',
        label: t('filter.state'),
        value: (c) => stateGroup(c.status),
        options: (['running', 'starting', 'stopped', 'problems'] as const).map((v) => ({ value: v, label: t(`filter.state.${v}`) })),
      },
      { id: 'server', label: t('filter.server'), value: serverKey, options: p.servers.map((x) => ({ value: x.key, label: x.name })) },
      // By the project's handle (never its id in the URL): the Projects view's "N computers" link lands here.
      ...(p.projects && p.projects.length > 1
        ? [{ id: 'project', label: t('filter.project'), value: (c: Computer) => { const pr = p.projects?.find((x) => x.id === c.project_id); return pr ? handleOf(pr) : undefined; }, options: p.projects.map((x) => ({ value: handleOf(x), label: x.name })) }]
        : []),
      // A computer can be in several realms: any of the picked ones matches.
      ...(p.realms && p.realms.length > 1
        ? [{ id: 'realm', label: t('filter.realm'), kind: 'multi' as const, value: (c: Computer) => c.realm_ids ?? [], options: p.realms.map((r) => ({ value: r.id, label: r.name })) }]
        : []),
      ...(p.planOf
        ? [{ id: 'plan', label: t('filter.plan'), value: (c: Computer) => p.planOf?.(c), options: (['free', 'paid'] as const).map((v) => ({ value: v, label: t(`filter.plan.${v}`) })) }]
        : []),
      {
        id: 'access',
        label: t('filter.access'),
        value: (c) => accessOf(c).state,
        options: (['set', 'open'] as const).map((v) => ({ value: v, label: t(`filter.access.${v}`) })),
      },
    ],
  });
  const clearSelection = () => view.setSelected(new Set());
  // A bulk button none of the selected rows allows (state or rights) is off and says why, instead of doing nothing.
  const noneCan = (rows: readonly Computer[], ops: readonly Op[]) =>
    rows.some((c) => allowedOps(c, p.caps).some((o) => ops.includes(o))) ? {} : { isDisabled: true, disabledReason: t('bulk.noneCan') };

  const usageChip: FilterChip[] = [
    ...(p.usageFilter
      ? [
          {
            id: 'usage',
            label: t('usage.show'),
            value: p.usageFilter.on ? 'on' : undefined,
            onChange: (v: string | undefined) => p.usageFilter?.onChange(v === 'on'),
            options: [{ value: 'on', label: t('usage.show') }],
          } satisfies FilterChip,
        ]
      : []),
  ];
  const explainAll = useExplainAll(p.computers ?? []);
  const shownView = usageChip.length ? { ...view, chips: [...view.chips, ...usageChip] } : view;

  return (
    <>
    <DataTable
      countLabel={(n) => t('count.computers', { count: n })}
      label={t('title')}
      view={shownView}
      columns={columns}
      onRetry={p.onRetry}
      onRefresh={p.onRetry}
      search={t('search')}
      selectable
      bulkActions={(rows) => (
        <>
          {/* Only what this sign-in may do: a missing right offers nothing (the page runs each on the rows that allow it). */}
          {allows(p.caps, 'start') ? (
            <Button size="sm" icon="play" {...noneCan(rows, ['start', 'resume'])} onPress={() => p.onBulk('start', rows, clearSelection)}>
              {t('bulk.start')}
            </Button>
          ) : null}
          {allows(p.caps, 'stop') ? (
            <Button size="sm" icon="stop" {...noneCan(rows, ['stop'])} onPress={() => p.onBulk('stop', rows, clearSelection)}>
              {t('bulk.stop')}
            </Button>
          ) : null}
          {allows(p.caps, 'restart') ? (
            <Button size="sm" icon="reload" {...noneCan(rows, ['restart'])} onPress={() => p.onBulk('restart', rows, clearSelection)}>
              {t('bulk.restart')}
            </Button>
          ) : null}
        </>
      )}
      actions={(c): RowActionEntry[] => {
        // The two hover icons (terminal, copy its link) are entries of the same list as the row menu.
        const base = computerMenu(c, p.caps, c.id === p.currentId, t, p.onAction, { terminal: true, logs: out.has.logs });
        const running = bucket(c.status) === 'running';
        const open: RowActionEntry = { id: 'openTerminal', label: t('menu.openTerminal'), icon: 'terminal', hover: true, key: 't', isDisabled: !running, ...(running ? {} : { disabledReason: notRunningReason(c.status, t) }), onAction: () => p.onAction(c, 'openTerminal') };
        const rest = base.filter((e) => e === '-' || e.id !== 'openTerminal').map((e) => (e !== '-' && e.id === 'copyTerminal' ? { ...e, hover: true, ...(!running ? { isDisabled: true, disabledReason: notRunningReason(c.status, t) } : !programUrl(c, 'terminal') ? { isDisabled: true, disabledReason: t('menu.noTerminal') } : { isDisabled: false }) } : e));
        return [open, ...rest];
      }}
      presentation={present === 'cards' ? 'cards' : 'auto'}
      // Cards: the computer card in the kit's row; the columns above still drive search, sort, filters
      // and the List and table presentations.
      cardRender={(c, slots) => (
        <ComputerCard
          computer={c}
          projects={p.projects}
          realms={p.realms}
          caps={p.caps}
          current={c.id === p.currentId}
          op={p.ops[c.id]}
          usage={p.usage?.[c.id]}
          showUsage={p.usage !== undefined}
          server={p.serverFor?.(c)}
          {...(canAccess ? { onAccess: () => setAccessId(c.id) } : {})}
          onAction={p.onAction}
          check={slots.check}
          menu={slots.menu}
        />
      )}
      presentChoice={{ value: present, onChange: setPresent }}
      toolbarActions={p.explainAll ? [...(p.toolbarActions ?? []), { id: 'explainAll', label: explainAll.action.label, icon: 'sparkle', onPress: explainAll.open }] : p.toolbarActions}
      toolbarNote={p.toolbarNote}
      noMatch={t('empty.title')}
      empty={p.empty}
    />
    {p.explainAll ? <AskAgentDrawer ask={explainAll} /> : null}
    {canAccess && accessFor ? <AccessDrawer c={accessFor} isOpen onClose={() => setAccessId(null)} /> : null}
    </>
  );
}

