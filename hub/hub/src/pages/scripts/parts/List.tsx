// The scripts table: one row per script across every ready computer. Search, filters, grouping by computer
// (only when more than one computer shows), a ⋯ menu per row, and the computers that could not be read
// listed above with the way to fix each.
import { Button, ComputerMark, DataTable, EmptyState, GroupNotes, Icon, IconButton, InlineActions, Link, StatusPill, Tag, createColumnHelper, useDataView, usePageLink, useStrings, type DataView, type GroupNote, type RowActionEntry, type TableGroup, type Tone } from '@kit';
import { useMemo, type ReactNode } from 'react';
import { TEMPLATES, writable } from '../logic';
import { cronOf, schedText } from './schedWords';
import strings from '../strings.en.json';
import type { CompScripts, ScriptItem } from '../types';
import { links as computersLinks } from '../../computers/links';
import s from './parts.module.css';

const col = createColumnHelper<ScriptItem>();
export const TONE: Record<NonNullable<ScriptItem['status']>, Tone> = { failing: 'danger', working: 'ok', off: 'neutral' };

export function StatusChip({ status }: { status: ScriptItem['status'] }) {
  const t = useStrings(strings);
  if (!status) return <span className={s.faint}>—</span>;
  return (
    <StatusPill tone={TONE[status]} dot>
      {t(`status.${status}`)}
    </StatusPill>
  );
}

export type RowVerb = 'open' | 'test' | 'delete' | 'toggle' | 'run' | 'ai';

/** The one data view of the table: search, the Status and Computer chips, sort and paging, all kept in the URL. */
export function useScriptsView(items: ScriptItem[] | undefined, computers: CompScripts[], loading: boolean, error: unknown) {
  const t = useStrings(strings);
  const ready = computers.filter((c) => c.state === 'on' && !c.err);
  // Read once for the computer cell, which is a kit Link written straight into the cell (a page-local wrapper there would
  // render a name the slot check cannot read), or the plain name when Computers does not resolve.
  const computersLink = usePageLink('computers');
  const multi = ready.length > 1;

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: t('col.name'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => (
          <span className={s.nameCell}>
            <span className={s.nameMain}>{c.getValue()}</span>
            {c.row.original.managed ? <Tag>{t('tag.idea')}</Tag> : null}
            {c.row.original.group === 'old' ? <Tag>{t('tag.readOnly')}</Tag> : null}
          </span>
        ),
      }),
      col.accessor((r) => r.status ?? 'none', { id: 'status', header: t('col.status'), meta: { width: '116px', priority: 1, list: 'status' }, cell: (c) => <StatusChip status={c.row.original.status} /> }),
      col.accessor('pattern', { header: t('col.address'), meta: { width: '200px', priority: 1 }, cell: (c) => (c.row.original.served ? <span className={s.mono} title={c.row.original.routeTip}>{c.getValue()}</span> : <span className={s.faint} title={c.row.original.routeTip}>{t('route.notServed')}</span>) }),
      col.accessor('calls', {
        header: t('col.calls'),
        meta: { align: 'end', width: '140px', priority: 2 },
        cell: (c) => {
          const v = c.getValue();
          if (v === null) return <span className={s.faint}>—</span>;
          const f = c.row.original.failed ?? 0;
          return (
            <span title={t('calls.title', { calls: v, failed: f })}>
              {v.toLocaleString('en')}
              {f > 0 ? <span className={s.failedN}> · {t('calls.failedN', { count: f })}</span> : null}
            </span>
          );
        },
      }),
      col.accessor((r) => (r.keyed ? 'key' : 'open'), { id: 'access', header: t('col.access'), meta: { width: '120px', priority: 3 }, cell: (c) => t(c.row.original.keyed ? 'access.key' : 'access.open') }),
      col.accessor((r) => r.schedule ?? '', {
        id: 'runs',
        header: t('col.runs'),
        meta: { width: '176px', priority: 4 },
        cell: (c) => {
          // In words on the shared preset model; any other expression as written.
          const cron = cronOf(c.row.original.schedule);
          return cron ? <span className={schedText(t, cron) ? undefined : s.mono}>{schedText(t, cron) ?? cron}</span> : <span className={s.faint}>—</span>;
        },
      }),
      ...(multi ? [] : [col.accessor('compName', { header: t('col.computer'), meta: { width: '120px', priority: 3 }, cell: (c) => {
            const href = computersLinks.item(c.row.original.compHandle);
            return computersLink ? <Link variant="nav" href={href}>{c.getValue()}</Link> : c.getValue();
          },
        }),
      ]),
    ],
    [t, multi, computersLink],
  );

  const view = useDataView<ScriptItem>({
    rows: items,
    columns,
    getRowId: (r) => r.id,
    search: ['name', 'route', 'pattern', 'compName'],
    filters: [
      {
        id: 'status',
        label: t('filter.status'),
        value: (r) => r.status ?? 'none',
        options: [
          { value: 'failing', label: t('status.failing') },
          { value: 'working', label: t('status.working') },
          { value: 'off', label: t('status.off') },
          { value: 'none', label: t('status.none') },
        ],
      },
      ...(computers.length > 1 ? [{ id: 'computer', label: t('filter.computer'), value: (r: ScriptItem) => r.compHandle, options: ready.map((c) => ({ value: c.handle, label: c.name, mark: <ComputerMark color={c.color} /> })) }] : []),
    ],
    sort: 'name',
    pageSize: 50,
    isLoading: loading,
    error,
  });
  return { view, columns };
}

export interface ListProps {
  view: DataView<ScriptItem>;
  columns: ReturnType<typeof useScriptsView>['columns'];
  computers: CompScripts[];
  items: ScriptItem[] | undefined;
  onRetry: () => void;
  onAction: (i: ScriptItem, a: RowVerb) => void;
  onNew: () => void;
  onDeleted: () => void;
  canCreate: boolean;
  deletedCount: number;
  /** The Exec folder shown: the idea links keep it. */
  exec: number;
  /** Below the table: the Advanced section (folder switch). */
  foot?: ReactNode;
  /** A line above the list about the page itself (an address naming a folder it cannot open), or null. */
  notice?: string | null;
  /** At the top, while no script is open: this browser's New script builds (parts/Building). */
  building?: ReactNode;
}

export function ScriptsList(p: ListProps) {
  const t = useStrings(strings);
  // Grouped by computer once the page lists more than one: a computer that could not be read (off, private, no answer)
  // gets its group, with what it says as the group's first row (a note lives in
  // its computer's category); one that reads lists its scripts there. As on Bots, a computer with no note and no
  // script shown has no group (a search that leaves it nothing hides it).
  const multi = p.computers.length > 1;

  const actions = (i: ScriptItem): readonly RowActionEntry[] => {
    const w = writable(i, p.computers.find((c) => c.id === i.compId)?.caps ?? null);
    return [
      { id: 'open', label: t('menu.open'), icon: 'arrow-right', onAction: () => p.onAction(i, 'open') },
      { id: 'test', label: t('menu.test'), icon: 'play', hover: true, key: 't', onAction: () => p.onAction(i, 'test') },
      ...(i.served ? [{ id: 'copy', label: t(i.dynamic ? 'menu.copyPattern' : 'menu.copy'), icon: 'copy' as const, copy: `${p.computers.find((c) => c.id === i.compId)?.origin ?? ''}${i.pattern}`, onAction: () => undefined }] : []),
      ...(w === 'ok'
        ? ([
            { id: 'toggle', label: t(i.status === 'off' ? 'menu.on' : 'menu.off'), icon: i.status === 'off' ? 'play' : 'pause', onAction: () => p.onAction(i, 'toggle') },
            // A run sends no caller key and no force (parts/runScript.ts): a script with a key is refused there, so its Run is off
            // with the Overview's reason, never sent to be refused.
            ...(i.schedule ? [{ id: 'run', label: t('menu.run'), icon: 'reload', ...(i.keyed ? { isDisabled: true, disabledReason: t('overview.runWhy.keyed') } : {}), onAction: () => p.onAction(i, 'run') }] : []),
            { id: 'ai', label: t('ai.primary'), icon: 'sparkle', onAction: () => p.onAction(i, 'ai') },
          ] as RowActionEntry[])
        : []),
      '-',
      { id: 'delete', label: t('menu.delete'), icon: 'trash', tone: 'danger', isDisabled: w === 'old', ...(w === 'old' ? { disabledReason: t('group.problem.old') } : {}), onAction: () => p.onAction(i, 'delete') },
    ];
  };

  const anyReady = p.computers.some((c) => c.state === 'on' && !c.err);
  const problemOf = (c: CompScripts): string | null => (c.state !== 'on' ? c.state : c.err ? c.err : !c.caps?.revisions ? 'old' : null);
  const notesOf = (c: CompScripts, named = false) => {
    const why = problemOf(c);
    return why ? <GroupNotes name={c.name} named={named} notes={[{ id: why, text: t(`group.problem.${why}` as never) }]} /> : null;
  };
  const groups: TableGroup[] | undefined = multi
    ? p.computers.map((c) => {
        const note = p.items ? notesOf(c) : null;
        return { id: c.handle, label: c.name, ...(note ? { note } : {}) };
      })
    : undefined;
  // No script at all: the table draws its empty state, no group, so each computer's note names it above the list
  // instead. One computer: no group to hold its note, so it names the computer above the table.
  const none = p.items !== undefined && p.items.length === 0;
  const above: GroupNote[] = none && !p.view.activeId ? p.computers.flatMap((c) => { const why = problemOf(c); return why ? [{ id: c.id, of: c.name, text: t(`group.problem.${why}` as never) }] : []; }) : [];
  const lone = !none && !multi && p.computers[0] && p.items && !p.view.activeId ? notesOf(p.computers[0], true) : null;

  return (
    <div className={s.listWrap}>
      {p.view.activeId ? null : p.building}
      {p.notice && !p.view.activeId ? (
        <ul className={s.problems} aria-label={t('folder.noticeLabel')}>
          <li>
            <Icon name="info" size="sm" />
            <span>{p.notice}</span>
          </li>
        </ul>
      ) : null}
      {above.length > 0 ? <div data-group-notes-empty=""><GroupNotes notes={above} /></div> : null}
      <DataTable
        label={t('title')}
        columns={p.columns}
        view={p.view}
        onRetry={p.onRetry}
        onRefresh={p.onRetry}
        storageKey="scripts"
        groupBy={multi ? (r) => r.compHandle : undefined}
        groups={groups}
        {...(lone ? { toolbarNote: lone } : {})}
        actions={actions}
        countLabel={(n) => t('count', { count: n })}
        toolbarEnd={
          p.deletedCount > 0 ? (
            <IconButton size="sm" icon="clock" label={t('action.deleted', { count: p.deletedCount })} onPress={p.onDeleted} />
          ) : undefined
        }
        empty={
          anyReady ? (
            <EmptyState
              icon="scripts"
              title={t('empty.title')}
              body={t('empty.body')}
              action={
                p.canCreate ? (
                  <Button variant="primary" icon="plus" onPress={p.onNew}>
                    {t('action.new')}
                  </Button>
                ) : undefined
              }
              secondary={
                <InlineActions
                  label={t('new.ideas')}
                  actions={TEMPLATES.slice(0, 3).map((x) => ({ id: `idea-${x.name}`, label: t(`idea.${x.name}` as never), href: `/scripts/new?idea=${x.name}${p.exec === 1 ? '' : `&exec=${p.exec}`}` }))}
                />
              }
            />
          ) : undefined
        }
      />
      {p.foot}
    </div>
  );
}
