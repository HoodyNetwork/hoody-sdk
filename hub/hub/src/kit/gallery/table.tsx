// The table gallery (/_kit?tab=table, ?layout=list-side, ?layout=list-fill): DataTable in every
// presentation and state, and both ListDetailPage modes full size. Rows come from core's
// fixture world so names agree with the rest of the Hub. view.tsx mounts these.
import { fixtureWorld, type WorldComputer } from '@core/world';
import { createColumnHelper } from '@tanstack/react-table';
import { Fragment, useMemo, useState } from 'react';
import { Button } from '../controls/Button';
import { Icon } from '../icons';
import { Link } from '../controls/Link';
import { useSearchParam } from '../nav';
import { SegmentedControl } from '../controls/SegmentedControl';
import { DataTable, type RowActionEntry, type TableGroup } from '../data/DataTable';
import { FilterChips, type FilterChip } from '../data/FilterChips';
import { GroupNotes } from '../data/GroupNotes';
import { useDataView } from '../data/DataTableView';
import { Facts, StatusPill, Tag, type Tone } from '../data/Display';
import { ComputerMark } from '../data/ComputerMark';
import { SAMPLE_MARK } from './kit3';
import { Panel } from '../layouts/Layouts';
import { AnatomySection } from '../layouts/anatomy/Section';
import { DetailHeader, ListDetailPage, useSelection } from '../layouts/ListDetailPage';
import { Row, Stack } from '../layouts/Stack';
import { Band } from '../states/Band';
import { showToast } from '../states/Toast';
import { useStrings } from '../strings';
import strings from './table.strings.en.json';
import s from './table.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function useTableStrings(): T {
  return useStrings(strings);
}

const FLAGS: Record<string, string> = { SG: '🇸🇬', DE: '🇩🇪', US: '🇺🇸', JP: '🇯🇵' };
const STATES = ['running', 'stopped', 'paused', 'failed', 'creating'] as const;
type State = (typeof STATES)[number];
const TONE: Record<State, Tone> = { running: 'ok', stopped: 'neutral', paused: 'neutral', failed: 'danger', creating: 'neutral' };

interface Computer {
  id: string;
  name: string;
  project: string;
  state: State;
  server: string;
  flag: string;
  city: string;
  cpu: number;
  ram: number;
  created: string;
  current: boolean;
}

function toRow(c: WorldComputer): Computer {
  return {
    id: c.name,
    name: c.name,
    project: fixtureWorld.projects.find((p) => p.id === c.project_id)?.name ?? '',
    state: (STATES as readonly string[]).includes(c.status) ? (c.status as State) : 'stopped',
    server: c.server.name,
    flag: FLAGS[c.server.country] ?? '',
    city: c.server.city,
    cpu: c.size.cpu,
    ram: c.size.ram,
    created: c.created_at.slice(0, 10),
    current: c.id === fixtureWorld.current.id,
  };
}

const COMPUTERS: Computer[] = fixtureWorld.computers.map(toRow);
const col = createColumnHelper<Computer>();

/** `tip`: the Size column explains itself (meta.tip: a header InfoTip, and the list or card label as its term);
 * 'head': the header InfoTip only, the list field keeping its bare value. */
function useComputerColumns(t: T, tip: boolean | 'head' = false) {
  return useMemo(
    () => [
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true, minWidth: 200 },
        cell: (c) => (
          <span className={s.name}>
            <span className={s.nameText}>{c.getValue()}</span>
            {c.row.original.current && <Tag>{t('current')}</Tag>}
          </span>
        ),
      }),
      col.accessor('project', { header: t('col.project'), meta: { width: '160px', priority: 3, list: false } }),
      col.accessor('state', {
        header: t('col.state'),
        meta: { width: '120px', priority: 1, list: 'status' },
        cell: (c) => (
          <StatusPill tone={TONE[c.getValue()]} dot>
            {t(`state.${c.getValue()}`)}
          </StatusPill>
        ),
      }),
      col.accessor('server', {
        header: t('col.server'),
        meta: { width: '170px', priority: 2, list: 'meta' },
        cell: (c) => (
          <span>
            {c.row.original.flag} {c.getValue()} <span className={s.muted}>· {c.row.original.city}</span>
          </span>
        ),
      }),
      col.accessor((r) => r.cpu * 100 + r.ram, {
        id: 'size',
        header: t('col.size'),
        meta: { width: '130px', priority: 3, align: 'end', list: 'meta', ...(tip === 'head' ? { tip: t('col.sizeTip') } : tip ? { listLabel: true, tip: t('col.sizeTip') } : {}) },
        cell: (c) => t('size', { count: c.row.original.cpu, ram: c.row.original.ram }),
      }),
      col.accessor('created', { header: t('col.created'), meta: { width: '120px', priority: 4, mono: true, align: 'end', list: false } }),
    ],
    [t, tip],
  );
}

function computerActions(t: T, c: Computer): RowActionEntry[] {
  const say = (title: string) => () => showToast({ title, tone: 'info' });
  // State verbs: Start for Stopped, Resume for Paused, Restart for Failed (its menu Restart goes inline).
  const failed = c.state === 'failed';
  const start: RowActionEntry[] =
    c.state === 'stopped'
      ? [{ id: 'start', label: t('act.start'), icon: 'play', inline: true, key: 's', onAction: say(t('act.start')) }]
      : c.state === 'paused'
        ? [{ id: 'resume', label: t('act.resume'), icon: 'play', inline: true, key: 's', onAction: say(t('act.resume')) }]
        : [];
  return [
    ...start,
    { id: 'terminal', label: t('act.terminal'), icon: 'terminal', hover: true, key: 't', isDisabled: c.state !== 'running', onAction: say(t('act.terminal')) },
    { id: 'files', label: t('act.files'), icon: 'files', hover: true, isDisabled: c.state !== 'running', onAction: say(t('act.files')) },
    { id: 'restart', label: t('act.restart'), icon: 'reload', ...(failed ? { inline: true, key: 's' } : {}), onAction: say(t('act.restart')) },
    { id: 'copy', label: t('act.copy'), icon: 'copy', onAction: say(t('act.copy')) },
    '-',
    { id: 'rename', label: t('act.rename'), icon: 'pen', onAction: say(t('act.rename')) },
    { id: 'delete', label: t('act.delete'), icon: 'trash', tone: 'danger', onAction: say(t('act.delete')) },
  ];
}

const WIDTHS = { full: undefined, l: 1000, m: 760, s: 620, xs: 390 } as const;
type WidthKey = keyof typeof WIDTHS;

// ── The tab ─────────────────────────────────────────────────────────────────────────

/** Filter chips in each state they draw: no value, one value, a long value (cut short in the chip) and several values. */
function FilterChipStates({ t }: { t: T }) {
  const [values, setValues] = useState<Record<string, string | undefined>>({ state: 'active', owner: 'long', kind: 'api,ssh' });
  const mk = (id: string, label: string, options: FilterChip['options'], kind?: FilterChip['kind']): FilterChip => ({ id, label, options, kind, value: values[id], onChange: (v) => setValues((m) => ({ ...m, [id]: v })) });
  const filters = [
    mk('access', t('chips.access'), [{ value: 'full', label: t('chips.full') }, { value: 'read', label: t('chips.read') }]),
    mk('state', t('chips.state'), [{ value: 'active', label: t('chips.active') }, { value: 'paused', label: t('chips.paused') }]),
    mk('owner', t('chips.owner'), [{ value: 'long', label: t('chips.longValue') }, { value: 'me', label: t('chips.me') }]),
    mk('kind', t('chips.kind'), [{ value: 'api', label: t('chips.api') }, { value: 'ssh', label: t('chips.ssh') }, { value: 'bot', label: t('chips.bot') }], 'multi'),
  ];
  return (
    <AnatomySection id="table-filter-chips" title={t('sec.chips')} description={t('sec.chipsDesc')} state={{ kind: 'ready' }}>
      <FilterChips filters={filters} />
    </AnatomySection>
  );
}

export function TableGallery() {
  const t = useTableStrings();
  return (
    <Stack gap={5}>
      <FullTable t={t} />
      <ListPresentation t={t} />
      <IconsPresentation t={t} />
      <CellWraps t={t} />
      <GroupsAndPages t={t} />
      <FilterChipStates t={t} />
      <ComputerNotes t={t} />
      <StickyGroups t={t} />
      <NestedGroups t={t} />
      <States t={t} />
      <Panel title={t('sec.layouts')} description={t('sec.layoutsDesc')}>
        <Row gap={3}>
          <Link href="/_kit?layout=list-side">{t('open.side')}</Link>
          <Link href="/_kit?layout=list-fill">{t('open.fill')}</Link>
        </Row>
      </Panel>
    </Stack>
  );
}

function FullTable({ t }: { t: T }) {
  // The Size header carries its tip; on the phone this table is a list, whose line 2 stays as it was.
  const columns = useComputerColumns(t, 'head');
  const [refreshing] = useSearchParam('gfetch');
  const [w, setW] = useState<WidthKey>('full');
  const view = useDataView({
    rows: COMPUTERS,
    columns,
    getRowId: (r) => r.id,
    search: ['name', 'project', 'server'],
    filters: [
      { id: 'state', label: t('filter.state'), value: (r) => r.state, options: STATES.map((v) => ({ value: v, label: t(`state.${v}`) })) },
      { id: 'server', label: t('filter.server'), kind: 'multi', value: (r) => r.server },
      { id: 'ram', label: t('filter.ram'), kind: 'range', value: (r) => r.ram, range: { min: 1, max: 64, format: (n) => t('gb', { n }) } },
    ],
    sort: 'name',
    param: 'g',
    // ?gfetch=1 holds the kept rows under a refresh (the 2 px bar along the panel's top edge).
    isLoading: refreshing === '1',
  });
  return (
    <Panel
      title={t('sec.full')}
      description={t('sec.fullDesc')}
      actions={
        <SegmentedControl
          label={t('width.label')}
          fullWidth
          value={w}
          onChange={setW}
          items={(Object.keys(WIDTHS) as WidthKey[]).map((k) => ({ id: k, label: t(`width.${k}`) }))}
        />
      }
      flush
    >
      <div className={s.box} style={{ maxWidth: WIDTHS[w] }} data-gallery="full-table">
        <DataTable
          label={t('sec.full')}
          columns={columns}
          view={view}
          search={t('search')}
          countLabel={(count) => t('count', { count })}
          selectable
          bulkActions={() => (
            <>
              <Button size="sm" icon="stop">
                {t('bulk.stop')}
              </Button>
              <Button size="sm" icon="reload">
                {t('bulk.restart')}
              </Button>
            </>
          )}
          actions={(r) => computerActions(t, r)}
        />
      </div>
    </Panel>
  );
}

function ListPresentation({ t }: { t: T }) {
  // ?tipwrap=1: the Size tip on the phone list, where its field wraps out of sight on line 2; off by default so the
  // layout shots stay.
  const [tipwrap] = useSearchParam('tipwrap');
  // ?listwraps=1: a Note field with column meta listWraps and a long listLabel (kit/data/listwraps.spec.ts): a Tag and a
  // long nav Link on one row, a run with no break point on the next, a run of Tags on the third, which wrap inside their
  // field on the phone list, and a Kept field whose long label is an InfoTip term; off by default so the layout shots stay.
  const [listwraps] = useSearchParam('listwraps');
  const base = useComputerColumns(t, tipwrap === '1');
  const columns = useMemo(
    () =>
      listwraps === '1'
        ? [
            // A list shows at most three line-2 fields: Size leaves the list to make room for Kept (it stays in the table).
            // The name wraps whole too (column meta listWraps on the list primary): plain text here, so
            // kit/data/listwraps.spec.ts can give one row a name with no break point.
            ...base.map((c) =>
              c.id === 'size' ? { ...c, meta: { ...c.meta, list: false as const } } : (c as { accessorKey?: string }).accessorKey === 'name' ? { ...c, meta: { ...c.meta, listWraps: true }, cell: (x: { getValue: () => unknown }) => String(x.getValue()) } : c,
            ),
            col.display({
              id: 'note',
              header: t('col.note'),
              meta: { list: 'meta', listWraps: true, listLabel: t('note.label') },
              cell: (c) =>
                c.row.index % 3 === 2 ? (
                  <>
                    {(['a', 'b', 'c', 'd', 'e', 'f'] as const).map((k) => (
                      <Fragment key={k}>
                        <Tag>{t(`note.tags.${k}`)}</Tag>{' '}
                      </Fragment>
                    ))}
                  </>
                ) : c.row.index % 3 === 0 ? (
                  <>
                    <Tag>{t('note.tag')}</Tag>{' '}
                    <Link href={`/_kit?tab=table&listwraps=1&note=${c.row.original.id}`} variant="nav">
                      {t('note.link')}
                    </Link>
                  </>
                ) : (
                  t('note.token')
                ),
            }),
            // A wrapping field whose label is an InfoTip term (meta tip): the long term wraps within its half of the
            // field, never cut.
            col.display({
              id: 'kept',
              header: t('col.kept'),
              meta: { list: 'meta', listWraps: true, listLabel: t('kept.label'), tip: t('kept.tip') },
              cell: () => t('kept.value'),
            }),
          ]
        : base,
    [base, listwraps, t],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  return (
    <Panel title={t('sec.list')} description={t('sec.listDesc')}>
      <div className={s.listPair}>
        <div className={s.phone}>
          <DataTable
            label={t('sec.list')}
            data={COMPUTERS}
            columns={columns}
            getRowId={(r) => r.id}
            search={t('search')}
            searchParam="lq"
            sortParam={false}
            presentation="list"
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={() => (
              <Button size="sm" icon="stop">
                {t('bulk.stop')}
              </Button>
            )}
            onRowAction={false}
            actions={(r) => computerActions(t, r)}
          />
        </div>
        <div className={s.pane}>
          <DataTable
            label={t('sec.list')}
            data={COMPUTERS}
            columns={columns}
            getRowId={(r) => r.id}
            sortParam={false}
            presentation="list"
            activeId="atlas"
            onRowAction={false}
            actions={(r) => computerActions(t, r)}
            noViewMenu
          />
        </div>
      </div>
      <PickAndOpen t={t} />
    </Panel>
  );
}

// Column meta wraps: a table cell that takes the lines its text needs. The Note column wraps a sentence on one row, a
// run with no break point on the next and stays one line on the third (that row keeps the table's row height); the
// other columns keep one line. The box is narrow so the wrapping shows at every screen width.
function CellWraps({ t }: { t: T }) {
  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('col.name'), meta: { pinned: true, minWidth: 140 } }),
      col.display({
        id: 'note',
        header: t('col.note'),
        meta: { wraps: true, priority: 1, minWidth: 200 },
        cell: (c) => (c.row.index % 3 === 0 ? t('note.link') : c.row.index % 3 === 1 ? t('note.token') : t('note.tag')),
      }),
      col.accessor('project', { header: t('col.project'), meta: { width: '140px', priority: 2 } }),
    ],
    [t],
  );
  return (
    <AnatomySection id="table-cell-wraps" title={t('sec.wraps')} description={t('sec.wrapsDesc')} state={{ kind: 'ready' }}>
      <div className={s.wrapsBox} data-shot="cell-wraps">
        <DataTable label={t('sec.wraps')} data={COMPUTERS.slice(0, 3)} columns={columns} getRowId={(r) => r.id} presentation="table" fill={false} sortParam={false} onRowAction={false} noViewMenu />
      </div>
    </AnatomySection>
  );
}

// Under the list presentation: selectable="pickOne" (a radio per row, one id at most) beside a table
// whose row click runs its rowOpen action; the inline verb carries a `short` label and ⋯ repeats nothing drawn in the row.
// Exported for its test (table.test.tsx): each inline verb's accessible name holds its visible short text.
export function PickAndOpen({ t }: { t: T }) {
  const columns = useComputerColumns(t, true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const rows = COMPUTERS.slice(0, 5);
  const actions = (c: Computer): RowActionEntry[] => [
    { id: 'open', label: t('act.open'), rowOpen: true, onAction: () => showToast({ title: t('act.open'), tone: 'info' }) },
    ...computerActions(t, c).map((a) => (a !== '-' && a.inline ? { ...a, short: a.label, label: t('act.verbOf', { verb: a.label, name: c.name }) } : a)),
  ];
  return (
    <div className={s.twoBoxes} data-gallery="pick-open">
      <div className={s.short}>
        <DataTable
          label={t('sec.pickLabel')}
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          sortParam={false}
          presentation="list"
          selectable="pickOne"
          selectedIds={picked}
          onSelectionChange={setPicked}
          noViewMenu
        />
      </div>
      <div className={s.short}>
        <DataTable label={t('sec.pick')} data={rows} columns={columns} getRowId={(r) => r.id} sortParam={false} actions={actions} noViewMenu />
      </div>
    </div>
  );
}

// presentation="icons", the folder grid (Files' Show › Icons). The row's `list: 'lead'` cell is drawn large,
// its primary cell under it; a click picks, a double click or Enter opens, a right click opens the row menu.
function IconsPresentation({ t }: { t: T }) {
  const base = useComputerColumns(t);
  const columns = useMemo(
    () => [col.display({ id: 'art', header: t('col.name'), cell: () => <Icon name="computer" />, meta: { list: 'lead' as const, table: false } }), ...base],
    [base, t],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  return (
    <Panel title={t('sec.icons')} description={t('sec.iconsDesc')} flush>
      <div className={s.box} data-gallery="icons">
        <DataTable
          label={t('sec.icons')}
          data={COMPUTERS}
          columns={columns}
          getRowId={(r) => r.id}
          sortParam={false}
          presentation="icons"
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowAction={(r) => showToast({ title: r.name, tone: 'info' })}
          actions={(r) => computerActions(t, r)}
        />
      </div>
    </Panel>
  );
}

interface Program {
  id: string;
  name: string;
  program: string;
  computer: string;
  port?: number;
  group: 'apps' | 'system';
}

const PROGRAMS: Program[] = fixtureWorld.programs.map((p, i) => ({
  id: `${p.computer}/${p.name}`,
  name: p.name,
  program: p.program,
  computer: p.computer,
  port: p.port,
  group: i % 3 === 0 ? 'system' : 'apps',
}));
const pcol = createColumnHelper<Program>();

function GroupsAndPages({ t }: { t: T }) {
  const columns = useMemo(
    () => [
      pcol.accessor('name', { header: t('col.name'), meta: { pinned: true } }),
      pcol.accessor('program', { header: t('col.program'), meta: { width: '140px', priority: 2 } }),
      pcol.accessor('computer', { header: t('col.computer'), meta: { width: '140px', priority: 2, list: 'status' } }),
      pcol.accessor('port', { header: t('col.port'), meta: { width: '80px', priority: 3, align: 'end', mono: true } }),
    ],
    [t],
  );
  const groups: TableGroup[] = [
    { id: 'apps', label: t('group.apps') },
    // extraEnd: the note sits at the row's end, its end edge in line with the ⋯ buttons below; stacked ignores it.
    { id: 'system', label: t('group.system'), extra: <StatusPill tone="warn">{t('group.problem')}</StatusPill>, extraEnd: true, defaultCollapsed: false },
  ];
  return (
    <Panel title={t('sec.groups')} description={t('sec.groupsDesc')} flush>
      <div className={s.twoBoxes}>
        <div className={s.short}>
          <DataTable
            label={t('sec.groups')}
            data={PROGRAMS}
            columns={columns}
            getRowId={(r) => r.id}
            sortParam={false}
            groupBy={(r) => r.group}
            groups={groups}
            renderExpanded={(r) => (
              <DataTable
                label={t('parts.title')}
                data={[r]}
                columns={columns.slice(1)}
                getRowId={(x) => x.id}
                bare
                fill={false}
                density="compact"
              />
            )}
            canExpand={(r) => r.port !== undefined || r.program === 'terminal'}
            actions={() => [{ id: 'restart', label: t('act.restart'), icon: 'reload', hover: true, onAction: () => undefined }]}
            noViewMenu
          />
        </div>
        <div className={s.short}>
          <DataTable
            label={t('sec.groups')}
            data={COMPUTERS}
            columns={useComputerColumns(t)}
            getRowId={(r) => r.id}
            sortParam={false}
            pageSize={3}
            pageParam="gpage"
            noViewMenu
          />
        </div>
        <div className={s.short}>
          {/* groupHeader="stacked" (used by Notes as a list): the extra takes the header's second line and the
              rows indent under it; here as a table with checkboxes and an expanded part, which keep their own inset
              (DataTable.stacked.spec.ts measures them). */}
          <DataTable
            label={t('sec.groupsStacked')}
            data={PROGRAMS}
            columns={columns}
            getRowId={(r) => r.id}
            sortParam={false}
            groupBy={(r) => r.group}
            groups={groups}
            groupHeader="stacked"
            presentation="table"
            selectable
            renderExpanded={(r) => (
              <DataTable label={t('parts.title')} data={[r]} columns={columns.slice(1)} getRowId={(x) => x.id} bare fill={false} density="compact" />
            )}
            canExpand={(r) => r.port !== undefined || r.program === 'terminal'}
            actions={() => [{ id: 'restart', label: t('act.restart'), icon: 'reload', onAction: () => undefined }]}
            noViewMenu
          />
        </div>
      </div>
    </Panel>
  );
}

/**
 * GroupNotes: what a list grouped by computer says about one computer, as the group's first row
 * (TableGroup.note), the header naming the computer so the words do not. Each action's name still says the computer.
 * Above an ungrouped list (`named`) each note names its computer.
 */
function ComputerNotes({ t }: { t: T }) {
  const [busy, setBusy] = useState(false);
  const columns = useMemo(
    () => [
      pcol.accessor('name', { header: t('col.name'), meta: { pinned: true } }),
      pcol.accessor('program', { header: t('col.program'), meta: { width: '140px', priority: 2 } }),
    ],
    [t],
  );
  const groups: TableGroup[] = [
    {
      id: 'apps',
      label: 'atlas',
      note: <GroupNotes name="atlas" notes={[{ id: 'more', text: t('notes.more') }, { id: 'failed', text: t('notes.failed'), tone: 'warn', action: { label: t('notes.tryAgain'), onPress: () => undefined } }]} />,
    },
    {
      id: 'system',
      label: 'cinder',
      note: <GroupNotes name="cinder" notes={[{ id: 'paused', text: t('notes.paused'), icon: 'pause', action: { label: t('notes.resume'), kind: 'button', busy, onPress: () => setBusy((x) => !x) } }]} />,
    },
  ];
  return (
    <AnatomySection id="table-group-notes" title={t('sec.notes')} description={t('sec.notesDesc')} state={{ kind: 'ready' }}>
      <div className={s.twoBoxes}>
        <div className={s.short}>
          <DataTable label={t('sec.notes')} data={PROGRAMS} columns={columns} getRowId={(r) => r.id} sortParam={false} groupBy={(r) => r.group} groups={groups} noViewMenu />
        </div>
        <div className={s.short}>
          <Stack gap={0}>
            <GroupNotes name="borealis" named notes={[{ id: 'off', text: t('notes.off') }, { id: 'failed', text: t('notes.failed'), tone: 'warn', action: { label: t('notes.tryAgain'), onPress: () => undefined } }]} />
          </Stack>
        </div>
      </div>
    </AnatomySection>
  );
}

interface LogRow {
  id: string;
  when: string;
  level: string;
  computer: string;
  message: string;
}

const LOGS: LogRow[] = fixtureWorld.logs.map((l, i) => ({ id: String(i), when: l.at.slice(11, 16), level: l.level, computer: l.computer, message: l.text }));
const lcol = createColumnHelper<LogRow>();

interface Endpoint {
  id: string;
  method: string;
  path: string;
  group: string;
}

/** 300 rows in four groups: past 200, so the rows are virtual, the case stickyGroups keeps its header drawn for. */
const ENDPOINTS: Endpoint[] = Array.from({ length: 300 }, (_, i) => {
  const group = ['files', 'notes', 'terminal', 'browser'][Math.floor(i / 75)]!;
  return { id: `e${i}`, method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4]!, path: `/api/v1/${group}/item-${i % 75}`, group };
});
const ecol = createColumnHelper<Endpoint>();

/** stickyGroups: the header of the group in sight sticks under the column header, the next one taking
 *  its place; with virtual rows too. */
function StickyGroups({ t }: { t: T }) {
  const columns = useMemo(
    () => [
      ecol.accessor('method', { header: t('col.method'), meta: { width: '96px' }, cell: (c) => <Tag>{c.getValue()}</Tag> }),
      // A header tip: on a coarse pointer the header grows to the tip's 44 press, and the group rows stick under it.
      ecol.accessor('path', { header: t('col.path'), meta: { pinned: true, mono: true, tip: t('col.pathTip') } }),
    ],
    [t],
  );
  const groups: TableGroup[] = (['files', 'notes', 'terminal', 'browser'] as const).map((id) => ({ id, label: t(`group.${id}`) }));
  return (
    <AnatomySection id="table-sticky-groups" title={t('sec.sticky')} description={t('sec.stickyDesc')} state={{ kind: 'ready' }}>
      <div className={s.short} data-specimen="sticky-groups">
        <DataTable
          label={t('sec.sticky')}
          data={ENDPOINTS}
          columns={columns}
          getRowId={(r) => r.id}
          sortParam={false}
          groupBy={(r) => r.group}
          groups={groups}
          stickyGroups
          presentation="table"
          noViewMenu
        />
      </div>
    </AnatomySection>
  );
}

/** Nested groups: 240 rows (virtual) in two parents of two children each, sticky: the parent in sight
 *  and its child in sight both stay under the column header. */
const NESTED: Endpoint[] = Array.from({ length: 240 }, (_, i) => {
  const group = ['sessions', 'tools', 'read', 'write'][Math.floor(i / 60)]!;
  const base = group === 'read' || group === 'write' ? 'files' : 'agent';
  return { id: `n${i}`, method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4]!, path: `/api/v1/${base}/${group}/item-${i % 60}`, group };
});

function NestedGroups({ t }: { t: T }) {
  const columns = useMemo(
    () => [
      ecol.accessor('method', { header: t('col.method'), meta: { width: '120px' }, cell: (c) => <Tag>{c.getValue()}</Tag> }),
      ecol.accessor('path', { header: t('col.path'), meta: { pinned: true, mono: true } }),
    ],
    [t],
  );
  const groups: TableGroup[] = [
    { id: 'agent', label: t('group.agent'), text: t('group.agentText') },
    { id: 'sessions', label: t('group.sessions'), parent: 'agent' },
    { id: 'tools', label: t('group.tools'), parent: 'agent' },
    { id: 'files', label: t('group.files'), text: t('group.filesText') },
    { id: 'read', label: t('group.read'), parent: 'files' },
    { id: 'write', label: t('group.write'), parent: 'files' },
  ];
  return (
    <AnatomySection id="table-nested-groups" title={t('sec.nested')} description={t('sec.nestedDesc')} state={{ kind: 'ready' }}>
      <div className={s.short} data-specimen="nested-groups">
        <DataTable
          label={t('sec.nested')}
          data={NESTED}
          columns={columns}
          getRowId={(r) => r.id}
          sortParam={false}
          groupBy={(r) => r.group}
          groups={groups}
          stickyGroups
          presentation="table"
          noViewMenu
        />
      </div>
    </AnatomySection>
  );
}

function States({ t }: { t: T }) {
  // The last row's message holds web addresses: the default text cell links them, and the address with a 24-hex run in
  // its host shows masked.
  const logs = useMemo<LogRow[]>(() => [...LOGS, { id: 'links', when: '09:41', level: 'info', computer: COMPUTERS[0]?.name ?? '', message: t('log.links') }], [t]);
  const [which, setWhich] = useState<'loading' | 'error' | 'stale' | 'nomatch' | 'capped'>('capped');
  const columns = useMemo(
    () => [
      lcol.accessor('when', { header: t('col.when'), meta: { width: '80px', mono: true, priority: 1, list: 'status' } }),
      lcol.accessor('level', { header: t('col.level'), meta: { width: '80px', priority: 2 } }),
      lcol.accessor('computer', { header: t('col.computer'), meta: { width: '120px', priority: 2 } }),
      lcol.accessor('message', { header: t('col.message'), meta: { pinned: true, list: 'primary' } }),
    ],
    [t],
  );
  return (
    <Panel
      title={t('sec.states')}
      description={t('sec.statesDesc')}
      actions={
        <SegmentedControl
          label={t('sec.states')}
          fullWidth
          value={which}
          onChange={setWhich}
          items={(['loading', 'error', 'stale', 'nomatch', 'capped'] as const).map((k) => ({ id: k, label: t(`state.${k}`) }))}
        />
      }
      flush
    >
      <div className={s.short}>
        <DataTable
          key={which}
          label={t('sec.states')}
          data={which === 'loading' || which === 'error' ? undefined : logs}
          isLoading={which === 'loading'}
          error={which === 'error' || which === 'stale' ? new Error('read failed') : undefined}
          onRetry={() => undefined}
          columns={columns}
          getRowId={(r) => r.id}
          search
          searchParam={which === 'nomatch' ? 'snomatch' : 'sq'}
          searchText={(r) => (which === 'nomatch' ? `${r.message}` : r.message) + (which === 'nomatch' ? ' ' : '')}
          filters={
            which === 'nomatch'
              ? [{ id: 'level', label: t('col.level'), value: 'debug', onChange: () => undefined, options: [{ value: 'debug', label: 'debug' }] }]
              : undefined
          }
          sortParam={false}
          total={which === 'capped' ? 312 : undefined}
          totalOrder="newest"
          onLoadMore={which === 'capped' ? () => undefined : undefined}
        />
      </div>
    </Panel>
  );
}

// ── Full-size ListDetailPage modes ──────────────────────────────────────────────────

function ComputerDetail({ t, c, side }: { t: T; c: Computer; side: boolean }) {
  return (
    <>
      <DetailHeader
        title={c.name}
        /* The computer's colour mark sits WITH the name (DetailHeader leading), not as a stray square in the meta. */
        leading={<ComputerMark color={SAMPLE_MARK} size="md" />}
        status={
          <StatusPill tone={TONE[c.state]} dot>
            {t(`state.${c.state}`)}
          </StatusPill>
        }
        meta={
          <span>
            {c.flag} {c.server} · {c.project}
          </span>
        }
        actions={
          side ? undefined : (
            <Button variant="primary" icon="terminal">
              {t('act.terminal')}
            </Button>
          )
        }
        menu={computerActions(t, c).filter((a) => a !== '-' && !a.inline)}
      />
      <div className={s.detailBody}>
        <Facts
          label={t('detail.facts')}
          columns={side ? 1 : 2}
          items={[
            { label: t('detail.server'), value: `${c.flag} ${c.server} · ${c.city}` },
            { label: t('detail.project'), value: c.project },
            { label: t('detail.size'), value: t('size', { count: c.cpu, ram: c.ram }) },
            { label: t('detail.image'), value: 'ubuntu-24.04', mono: true },
          ]}
        />
        {!side && <p className={s.muted}>{t('detail.body')}</p>}
      </div>
    </>
  );
}

export function GalleryListDetail({ mode }: { mode: 'side' | 'fill' }) {
  const t = useTableStrings();
  const columns = useComputerColumns(t);
  const [sel, setSel] = useSelection();
  const current = COMPUTERS.find((c) => c.id === sel);
  // ?banner=1: the page banner, kept above both panes in one-pane mode; off by default so the layout shots stay.
  const [banner] = useSearchParam('banner');
  // ?lstate=here: the list pane's kit state, the All realms "Pick a realm" case.
  const [lstate] = useSearchParam('lstate');
  return (
    <ListDetailPage
      mode={mode}
      banner={banner === '1' ? <Band>{t('detail.banner')}</Band> : undefined}
      state={lstate === 'here' ? { kind: 'notHere', icon: 'realm', title: t('detail.pickTitle'), body: t('detail.pickBody') } : undefined}
      header={{ title: t('detail.title'), subtitle: t(mode === 'side' ? 'open.side' : 'open.fill'), primary: { label: t('act.start'), icon: 'plus', onPress: () => undefined } }}
      storageKey={`kit-gallery-${mode}`}
      list={
        <DataTable
          label={t('detail.title')}
          data={COMPUTERS}
          columns={columns}
          getRowId={(r) => r.id}
          search={t('search')}
          countLabel={(count) => t('count', { count })}
          activeId={sel}
          onRowAction={(r) => setSel(r.id)}
          actions={(r) => computerActions(t, r)}
        />
      }
      detail={current ? <ComputerDetail t={t} c={current} side={mode === 'side'} /> : null}
      detailFooter={
        current && mode === 'side' ? (
          <>
            <span className={s.outcome}>{t('detail.outcome')}</span>
            <Button chip={false} onPress={() => setSel(undefined, { replace: true })}>{t('detail.cancel')}</Button>
            <Button variant="primary">{t('detail.save')}</Button>
          </>
        ) : undefined
      }
    />
  );
}
