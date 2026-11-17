// The computer's loops (Automations → Loops), read only, as a list with a light detail beside it. A loop repeats a prompt in one chat on a timer, so each row names its chat; the head counts
// active loops against the computer's limit, which covers every realm; a Why under the table says what pausing does to
// the chat. New loop and a loop's changes live in Edit.tsx. The host gives the computer's name and, when it has one, the
// link to a chat.
import {
  DataTable, DetailBody, EmptyState, ErrorState, FaqLink, ListDetailPage, Link, Stack, StatusPill, Tag, Why, createColumnHelper,
  When, formatRelative, useDataView, useStrings, type Tone,
} from '@kit';
import { useMemo } from 'react';
import { useLoops } from './data';
import { HeldLoopChange, LoopDetailFrame, NewLoop } from './Edit';
import { LOOP_CAP, everyOf, spentOf, type LoopRow, type LoopState } from './logic';
import strings from './List.strings.en.json';
import s from './List.module.css';
import { pageFaq } from '../../faq';
import aiStrings from '../../strings.en.json';

export interface LoopsListProps {
  /** The computer's name, as the top bar shows it. */
  computer: string;
  /** The link to a chat (the AI routes' conversation link); without it the chat shows as text. */
  chatHref?: (sid: string, realm: string) => string;
}

interface Row extends LoopRow {
  chat: string;
}

type T = ReturnType<typeof useStrings<typeof strings>>;
const col = createColumnHelper<Row>();
const TONE: Record<LoopState, Tone> = {
  running: 'ok', firing: 'ok', paused: 'neutral', error: 'warn', ended: 'neutral', expired: 'neutral', stopped: 'neutral', unknown: 'neutral',
};
const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const everyText = (t: T, ms: number) => {
  const e = everyOf(ms);
  return t(`every.${e.unit}`, { n: e.n });
};
const runsText = (t: T, r: LoopRow) => (r.runs.max > 0 ? t('runs.of', { n: r.runs.n, max: r.runs.max }) : String(r.runs.n));
const spentText = (t: T, r: LoopRow) => {
  const sp = spentOf(r);
  if (sp.k === 'usd') return usd.format(sp.v);
  return t(sp.k === 'small' ? 'spent.small' : sp.k === 'free' ? 'spent.free' : 'spent.none');
};
const pill = (t: T, st: LoopState) => (
  <StatusPill tone={TONE[st]} dot={st === 'running' || st === 'firing'}>
    {t(`st.${st}`)}
  </StatusPill>
);
const when = (iso: string) => (Number.isFinite(Date.parse(iso)) ? <When at={iso} /> : null);

export function LoopsList({ computer, chatHref }: LoopsListProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const q = useLoops();
  const { titles } = q;
  const rows = useMemo<Row[] | undefined>(
    () =>
      q.rows?.map((r) => {
        const title = titles.get(`${r.realm}/${r.sid}`);
        return { ...r, chat: title === undefined ? t('chat.unread', { id: r.sid.slice(0, 8) }) : (title ?? t('chat.untitled')) };
      }),
    [q.rows, titles, t],
  );
  const chatOf = (r: Row) => {
    const name = <bdi className={s.one}>{r.chat}</bdi>;
    return chatHref ? (
      <Link variant="plain" href={chatHref(r.sid, r.realm)}>
        {name}
      </Link>
    ) : (
      name
    );
  };

  const columns = useMemo(
    () => [
      col.accessor('prompt', {
        header: t('col.loop'),
        meta: { pinned: true, list: 'primary' },
        cell: (c) => <bdi className={s.one}>{c.getValue()}</bdi>,
      }),
      col.accessor('chat', { header: t('col.chat'), meta: { minWidth: 160, priority: 1 }, cell: (c) => chatOf(c.row.original) }),
      col.accessor('intervalMs', { header: t('col.every'), meta: { width: '96px', priority: 2 }, cell: (c) => everyText(t, c.getValue()) }),
      col.accessor((r) => r.runs.n, { id: 'runs', header: t('col.runs'), meta: { width: '96px', priority: 3 }, cell: (c) => runsText(t, c.row.original) }),
      col.accessor('spentUsd', { id: 'spent', header: t('col.spent'), meta: { width: '104px', priority: 4 }, cell: (c) => spentText(t, c.row.original) }),
      col.accessor('state', { header: t('col.state'), meta: { width: '170px', priority: 1 }, cell: (c) => pill(t, c.getValue()) }),
    ],
    // chatOf reads only chatHref and t.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, chatHref],
  );

  const view = useDataView<Row>({
    rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.prompt, r.chat],
    filters: [
      {
        id: 'state',
        label: t('filter.state'),
        value: (r) => r.group,
        options: [
          { value: 'active', label: t('f.active') },
          { value: 'paused', label: t('f.paused') },
          { value: 'over', label: t('f.over') },
        ],
      },
    ],
    pageSize: 50,
    isLoading: q.isPending,
    error: q.error,
  });

  // The count only from a listing that answered: never a guess while it cannot be read.
  const cap = q.active === null ? undefined : <Tag>{t(q.scope === 'all' ? 'cap' : 'capHere', { n: q.active, max: LOOP_CAP, computer })}</Tag>;
  const header = { title: t('title'), meta: cap, subtitle: t('desc'), actions: <NewLoop computer={computer} /> };
  const current = rows?.find((r) => r.key === view.activeId);

  if (q.error && !q.rows) {
    return (
      <ListDetailPage
        mode="side"
        header={header}
        list={
          <ErrorState
            title={t('error.title')}
            body={t('error.body', { computer })}
            error={q.error}
            onRetry={q.refetch}
            secondary={<FaqLink item={byId.autoKinds}>{t('more')}</FaqLink>}
          />
        }
        detail={null}
      />
    );
  }
  return (
    <ListDetailPage
      mode="side"
      storageKey="ai-loops"
      header={header}
      list={
        <>
          <DataTable
            label={t('title')}
            view={view}
            columns={columns}
            search={t('search')}
            onRetry={q.refetch}
            onRefresh={q.refetch}
            onRowAction={(r) => view.open(r.key)}
            noViewMenu
            countLabel={(n) => t('count', { count: n })}
            noMatch={t('noMatch')}
            empty={<EmptyState icon="hoody-cron" size="sm" title={t('empty.title', { computer })} body={t('empty.body')} />}
          />
          <Why question={t('noteQ')} faq={{ item: byId.autoKinds, label: t('more') }}>
            {t('note')} {t('noteCap', { max: LOOP_CAP, computer })}
          </Why>
        </>
      }
      detail={
        view.activeId === undefined ? null : current ? (
          <LoopDetail row={current} chat={chatOf(current)} computer={computer} />
        ) : rows ? (
          <DetailBody>
            <Stack gap={3}>
              <EmptyState icon="warn" size="sm" title={t('d.notFound')} />
              <HeldLoopChange loopKey={view.activeId} computer={computer} />
            </Stack>
          </DetailBody>
        ) : null
      }
    />
  );
}

function LoopDetail({ row, chat, computer }: { row: Row; chat: React.ReactNode; computer: string }) {
  const t = useStrings(strings);
  const facts = [
    { label: t('col.chat'), value: chat },
    { label: t('col.every'), value: everyText(t, row.intervalMs) },
    { label: t('col.runs'), value: runsText(t, row) },
    { label: t('col.spent'), value: spentText(t, row) },
    { label: t('d.started'), value: when(row.createdAt) },
    // "Not yet" only before the first run; a run whose time the agent did not give is left out.
    { label: t('d.lastRun'), value: when(row.lastRunAt) ?? (row.runs.n === 0 ? t('d.notYet') : null) },
    ...(row.nextInMs > 0 ? [{ label: t('d.next'), value: formatRelative(Date.now() + row.nextInMs) }] : []),
    ...(row.expiresAt && row.group !== 'over' ? [{ label: t('d.ends'), value: when(row.expiresAt) }] : []),
    ...(row.stopReason && row.group === 'over' ? [{ label: t('d.stopped'), value: t(`stop.${row.stopReason}`) }] : []),
    ...(row.lastError ? [{ label: t('d.problem'), value: <bdi>{row.lastError}</bdi>, wide: true }] : []),
    { label: t('d.prompt'), value: <bdi className={s.prompt}>{row.promptFull}</bdi>, wide: true },
    { label: t('d.kept'), value: t('d.memory', { computer }), wide: true },
  ].filter((f) => f.value !== null);
  return <LoopDetailFrame row={row} computer={computer} status={pill(t, row.state)} facts={facts} />;
}
