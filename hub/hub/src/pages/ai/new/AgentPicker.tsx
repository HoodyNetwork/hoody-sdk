// New chat's agent picker: every agent this computer offers a new chat, in one table.
//
// - Rows come from the page's agents read and the tool catalogue (logic.ts pickRows): General and Just chat first
//   ("Start here"), then the shipped agents, the person's own and the folder's. Agents Hoody runs itself are never listed.
// - Search covers the name, the description and the model. One filter narrows by what an agent can do (it acts, it only
//   reads, it only chats) or to the person's own agents.
// - What an agent can do is said only from the whole tool catalogue: while that is being read the cell says so, and a
//   catalogue that cannot be read says "Not read" with Try again, never a guess.
// - A press on a row picks that agent for this chat; the page closes the panel and remembers the pick. Nothing is sent.
import { Band, DataTable, Drawer, LinkButton, Stack, Tag, TextButton, createColumnHelper, useDataView, useStrings, type ViewFilter } from '@kit';
import { useCallback, useMemo } from 'react';
import type { AgentsRead } from '../agents/data';
import type { CatalogTool } from '../agents/tools';
import toolsStrings from '../agents/Tools.strings.en.json';
import { links } from '../links';
import { PICK_GROUPS, agentName, pickFilterValues, pickRows, type AgentPick, type PickRow } from './logic';
import strings from './NewChat.strings.en.json';

export interface AgentPickerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  computer: string;
  agents: AgentsRead;
  /** The tool catalogue: undefined while it is read, null for an answer that is not the whole catalogue. */
  catalogue: readonly CatalogTool[] | null | undefined;
  /** The catalogue read failed, or answered with something that is not the whole catalogue. */
  catalogueFailed: boolean;
  /** Reads the agents and the tool catalogue again; absent when this computer and realm may not be read. */
  retryReads?: (() => void) | undefined;
  /** The agent the chat would start on now. */
  current: AgentPick;
  onPick: (a: AgentPick) => void;
}

const col = createColumnHelper<PickRow>();

export function AgentPicker(p: AgentPickerProps) {
  const t = useStrings(strings);
  return (
    <Drawer
      resizeKey="ai-new-agent-pick"
      overlayId="ai.new.agent"
      isOpen={p.isOpen}
      onOpenChange={p.onOpenChange}
      title={t('pick.title')}
      subtitle={t('pick.subtitle', { computer: p.computer })}
      size="lg"
      secondary={<LinkButton href={links.agents}>{t('pick.manage')}</LinkButton>}
    >
      {p.isOpen && <PickTable {...p} />}
    </Drawer>
  );
}

function PickTable({ computer, agents, catalogue, catalogueFailed, retryReads, current, onPick }: AgentPickerProps) {
  const t = useStrings(strings);
  const tt = useStrings(toolsStrings);
  const currentName = agentName(current);
  const reachRead = catalogueFailed ? 'unread' : catalogue ? 'ok' : 'loading';
  const rows = useMemo(() => (agents.rows ? pickRows(agents.rows, catalogueFailed ? null : catalogue) : undefined), [agents.rows, catalogue, catalogueFailed]);
  // General and Just chat go by what they are for; every other agent by its own name.
  const nameOf = useCallback((r: PickRow): string => (r.pick.kind === 'general' ? t('agent.general') : r.pick.kind === 'chat' ? t('agent.chat') : r.name), [t]);
  const columns = useMemo(
    () => [
      col.accessor(nameOf, {
        id: 'name',
        header: t('pick.col.name'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => {
          const r = c.row.original;
          return (
            <>
              {c.getValue()}
              {r.isDefault ? <> <Tag>{t('pick.default')}</Tag></> : null}
              {r.name === currentName ? <> <Tag tone="accent">{t('pick.current')}</Tag></> : null}
            </>
          );
        },
      }),
      col.display({
        id: 'can',
        header: t('pick.col.can'),
        meta: { width: '170px', priority: 1, list: 'status' },
        cell: (c) => {
          const r = c.row.original;
          if (r.reach === null) return t(reachRead === 'loading' ? 'pick.reach.loading' : 'pick.reach.unread');
          return (
            <>
              <Tag tip={tt(`reach.${r.reach}`, { computer })}>{t(`pick.reach.${r.reach}`)}</Tag>
              {r.changed ? <> <Tag tone="warn" tip={tt('chat.changed')}>{t('pick.changed')}</Tag></> : null}
            </>
          );
        },
      }),
      col.accessor('description', { header: t('pick.col.what'), enableSorting: false, meta: { priority: 2, list: 'meta' } }),
      col.accessor('model', {
        header: t('pick.col.model'),
        meta: { width: '190px', priority: 3, list: false },
        cell: (c) => c.getValue() || t('pick.sameModel'),
      }),
    ],
    [t, tt, nameOf, computer, currentName, reachRead],
  );
  const filters = useMemo<ViewFilter<PickRow>[]>(() => [
    {
      id: 'can',
      label: t('pick.filter'),
      display: 'segmented',
      value: pickFilterValues,
      options: [
        { value: 'acts', label: t('pick.reach.acts') },
        { value: 'read', label: t('pick.reach.read') },
        { value: 'none', label: t('pick.reach.none') },
        { value: 'yours', label: t('pick.yours') },
      ],
    },
  ], [t]);
  const view = useDataView<PickRow>({
    rows,
    columns,
    getRowId: (r) => r.name,
    search: (r) => [nameOf(r), r.name, r.description, r.model],
    filters,
    param: 'pick',
    isLoading: agents.pending,
    // An answer that is not an agent list is a failed read too (it carries no rejection).
    error: agents.failed ? (agents.error ?? true) : undefined,
  });
  const groups = useMemo(() => PICK_GROUPS.filter((g) => rows?.some((r) => r.group === g)).map((g) => ({ id: g, label: t(`pick.g.${g}`) })), [rows, t]);
  const again = retryReads ?? agents.retry;
  const table = (
    <DataTable
      label={t('pick.table')}
      view={view}
      columns={columns}
      search={t('pick.search')}
      groupBy={(r) => r.group}
      groups={groups}
      groupHeader="inline"
      activeId={currentName}
      onRowAction={(r) => onPick(r.pick)}
      onRetry={again}
      onRefresh={again}
      {...(agents.failed && !agents.error ? { errorBody: t('band.agentsMalformed', { computer }) } : {})}
      noViewMenu
      sortParam={false}
      countLabel={(n) => t('pick.count', { count: n })}
      noMatch={t('pick.noMatch')}
    />
  );
  if (reachRead !== 'unread') return table;
  return (
    <Stack gap={3}>
      <Band tone="warn" size="table" /* noDetails: a read the person can try again; each row says its line is not read */ {...(retryReads ? { actions: <TextButton onPress={retryReads}>{t('agent.retry')}</TextButton> } : {})}>
        {t('agent.unread')}
      </Band>
      {table}
    </Stack>
  );
}
