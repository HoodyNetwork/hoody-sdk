// A folder's Repository tab: the checkout's status (labelled as this computer's own
// view, read at a time, never a check with GitHub), the changed files with each file's diff, the history and the branches.
// An account failure, from any of its reads, shows the agent's typed kind in words, never its text. The changed files
// show only once both diffs answered: half a list never reads as the whole change. Read again reads the status and the
// view shown. Pull requests and Issues are PRs.tsx; the commit box (Commit.tsx) heads Changes when the
// page passes its writes; the Branches view and its changes are Branches.tsx, as is the Worktrees view.
import { Band, Button, CodeBlock, DataTable, EmptyState, ErrorState, LinkButton, SegmentedControl, Skeleton, Tag, createColumnHelper, cx, isApplePlatform, useGo, useStrings } from '@kit';
import { errorInfo, useRealms } from '@core';
import { useMemo, useState } from 'react';
import { Branches, Worktrees } from './Branches';
import CommitBox, { type FolderWrites } from './Commit';
import { useRepoBranches, useRepoDiff, useRepoLog, useRepoStatus, type FolderAt } from './data';
import { pickAccountsPlace } from '../settings/connections/data';
import { accountFailureOf, type AccountFailure as AccountKind, type Commit, type FileDiff, type RepoStatus } from './logic';
import s from './Repository.module.css';
import { Issues, PullRequests } from './PRs';
import { refreshLists } from './pulls';
import prStrings from './pulls.strings.en.json';
import strings from './strings.en.json';
import { useRepoWorktrees } from './writes';

type View = 'changes' | 'history' | 'branches' | 'worktrees' | 'prs' | 'issues';
/** Settings → Connections: where a GitHub account is linked or switched. */
export const CONNECTIONS_HREF = '/ai/connections';
const RE24 = /^[0-9a-f]{24}$/;
const GLOBAL = 'global';
/** Connections for the folder's realm: the shell switches to it (?open_realm=, shell/realmParam.tsx). The computer has no
 *  such switch, so the words name it and ask for it in the top bar. A Global folder has no LINK: Global is no realm the
 *  shell selects (core realm.ts: 'all' or an id) and Connections picks it in memory only (connections/data.ts
 *  pickAccountsPlace keeps the place out of the address), so a link copied or opened in a new tab would land
 *  on the realm place. Its control is a button (openGlobal in AccountFailure) with no href: ''. */
export const connectionsHref = (at: FolderAt): string =>
  (RE24.test(at.realm) ? `${CONNECTIONS_HREF}?${new URLSearchParams({ open_realm: at.realm }).toString()}` : '');
/** Where a Global folder's button goes: Connections on All realms (?open_realm=all), where Global shows. */
export const GLOBAL_CONNECTIONS_TO = `${CONNECTIONS_HREF}?${new URLSearchParams({ open_realm: 'all' }).toString()}`;

const timeOf = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const accountOf = (err: unknown): AccountKind | null => (err ? accountFailureOf(errorInfo(err).code) : null);

/** Names for the words: the folder's computer (always: the recovery asks for it in the top bar) and realm as the person
 *  knows them. */
export interface FolderNames { readonly computer: string; readonly realm?: string }

/** The status line's tag and its label; null until the status is read. */
export function RepoTag({ status }: { status: RepoStatus | undefined }) {
  const t = useStrings(strings);
  if (!status || status.kind !== 'repo') return null;
  const v = { branch: status.branch, ahead: String(status.ahead), behind: String(status.behind) };
  return <Tag>{status.detached ? t('repo.detachedTag', v) : t('repo.branchTag', v)}</Tag>;
}

export function AccountFailure({ kind, at, names, onRetry, size }: { kind: AccountKind; at: FolderAt; names: FolderNames; onRetry: () => void; size?: 'sm' }) {
  const t = useStrings(strings);
  const href = connectionsHref(at);
  const go = useGo();
  // A shared-access session pinned to one realm: its agent calls carry that realm whatever they name (core kit.ts
  // agentRealm), so Connections does not offer Global there (useAccountsPlace) and the button would promise what the session
  // cannot do. One pinned to every realm sends the realm each call names, as an account session does: Global is reachable.
  const pin = useRealms().pinned;
  const pinned = pin !== null && pin !== 'all';
  const global = at.realm === GLOBAL;
  const reachable = global && !pinned;
  // The press picks the Global place, then goes to All realms: both in this tab, with no address to copy (see connectionsHref).
  const openGlobal = () => { pickAccountsPlace('global'); go(GLOBAL_CONNECTIONS_TO); };
  // A realm folder's link picks the realm place too: Connections keeps a Global pick across realms,
  // and a token linked there would serve Global, not this folder's realm. A modified click
  // opens another tab or window, which starts on the realm place anyway (the pick is this tab's memory): this tab keeps its
  // pick. Only the platform's own new-tab and new-window gestures count (Shift, and Cmd on Apple or Ctrl elsewhere): a Meta
  // click elsewhere is a same-tab click that must pick. Enter picks on press start: React Aria clicks the anchor on keydown
  // and the hash route changes before keyup, so a pick on press (keyup) would come after the view had left.
  const openRealm = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (!(e.shiftKey || (isApplePlatform() ? e.metaKey : e.ctrlKey))) pickAccountsPlace('realm');
  };
  const where = kind === 'store_unavailable' || !(href || global) ? null
    : global ? (pinned ? t('account.where.pinned') : t('account.where.global', { computer: names.computer }))
    : t('account.where', { computer: names.computer, realm: names.realm ?? at.realm });
  // A Global folder's cause says only the cause (the Connections section is named by account.where.global, and the button).
  // The body is the cause; where it is fixed (the computer to choose, or why a shared-access session cannot) is a band
  // after it: always in sight, since Open Connections picks the place but never the computer, and a notice of its own so
  // the state stays one short line (layout.explain).
  const cause = kind === 'store_unavailable' ? t('account.store_unavailable') : global ? t(`account.global.${kind}` as const) : t(`account.${kind}` as const);
  return (
    <>
      <EmptyState
        icon="key"
        size={size}
        title={t('account.title')}
        body={cause}
        action={kind === 'store_unavailable'
          ? <Button size="sm" variant="secondary" onPress={onRetry}>{t('repo.refresh')}</Button>
          : href ? <LinkButton size="sm" variant="primary" href={href} onPress={openRealm} onPressStart={(e) => { if (e.pointerType === 'keyboard') openRealm(e); }}>{t('account.open')}</LinkButton>
          : reachable ? <Button size="sm" variant="primary" onPress={openGlobal}>{t('account.open')}</Button> : undefined}
      />
      {where ? <Band tone="neutral">{where}</Band> : null}
    </>
  );
}

interface Row extends FileDiff { readonly id: string; readonly staged: boolean }
const fileCol = createColumnHelper<Row>();
const commitCol = createColumnHelper<Commit>();
type DiffQuery = ReturnType<typeof useRepoDiff>;

function Changes({ at, names, status, unstaged, staged, writes }: { at: FolderAt; names: FolderNames; status: Extract<RepoStatus, { kind: 'repo' }>; unstaged: DiffQuery; staged: DiffQuery; writes?: FolderWrites }) {
  const t = useStrings(strings);
  const [active, setActive] = useState<string | null>(null);
  const err = unstaged.error ?? staged.error;
  // Both answers or nothing: one diff alone is half the change. While either reads again (Read again) its cached answer
  // is the old one, and new plus old is no change list either: withheld until both settle.
  const complete = !err && unstaged.data !== undefined && staged.data !== undefined && !unstaged.isFetching && !staged.isFetching;
  const rows = useMemo<Row[] | undefined>(() => (complete ? [
    ...unstaged.data!.files.map((f, i) => ({ ...f, staged: false, id: `u:${i}:${f.path}` })),
    ...staged.data!.files.map((f, i) => ({ ...f, staged: true, id: `s:${i}:${f.path}` })),
  ] : undefined), [complete, unstaged.data, staged.data]);
  const columns = useMemo(() => [
    fileCol.accessor('kind', { header: t('changes.kind'), cell: (c) => <span title={t(`changes.kind.${c.getValue()}` as const)} aria-label={t(`changes.kind.${c.getValue()}` as const)}>{c.getValue()}</span>, meta: { list: 'meta' } }),
    fileCol.accessor('path', {
      header: t('changes.file'),
      cell: (c) => <span className={s.path}>{c.getValue()}{c.row.original.from ? <span className={s.from}> {t('changes.renamed', { from: c.row.original.from })}</span> : null}</span>,
      meta: { pinned: true, list: 'primary' },
    }),
    fileCol.display({
      id: 'lines', header: t('changes.lines'),
      cell: (c) => (c.row.original.binary ? t('changes.binary') : <span className={s.lines}>{t('changes.lineCount', { added: String(c.row.original.added), removed: String(c.row.original.removed) })}</span>),
    }),
  ], [t]);
  const retry = () => { void unstaged.refetch(); void staged.refetch(); };
  const account = accountOf(unstaged.error) ?? accountOf(staged.error);
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={retry} size="sm" />;
  const shown = rows?.find((r) => r.id === active) ?? null;
  const notes = [
    status.untracked > 0 ? t('changes.untracked', { count: status.untracked }) : null,
    status.conflicts > 0 ? t('changes.conflicts', { count: status.conflicts }) : null,
    complete && (unstaged.data!.truncated || staged.data!.truncated) ? t('changes.truncated') : null,
  ].filter((x): x is string => !!x);
  return (
    <div className={s.changes}>
      {writes ? <CommitBox flow={writes} at={at} /> : null}
      {notes.length ? <ul className={s.notes}>{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      <DataTable<Row>
        label={t('changes.table')}
        countLabel={(n) => t('changes.count', { count: n })}
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={!err && !complete}
        error={err ?? undefined}
        onRetry={retry}
        empty={<EmptyState size="compact" icon="check" title={t('changes.empty')} />}
        groupBy={(r) => (r.staged ? 'staged' : 'unstaged')}
        groups={[{ id: 'unstaged', label: t('changes.group.unstaged') }, { id: 'staged', label: t('changes.group.staged') }]}
        onRowAction={(r) => setActive(r.id)}
        activeId={active ?? undefined}
        noViewMenu
        sortParam={false}
      />
      {shown
        ? <CodeBlock label={t('changes.diffOf', { path: shown.path })} code={shown.text} lang="diff" />
        : rows?.length ? <p className={s.pick}>{t('changes.pick')}</p> : null}
    </div>
  );
}

function History({ at, names, q }: { at: FolderAt; names: FolderNames; q: ReturnType<typeof useRepoLog> }) {
  const t = useStrings(strings);
  const columns = useMemo(() => [
    commitCol.accessor('sha', { header: t('history.sha'), cell: (c) => <code className={s.sha}>{c.getValue().slice(0, 7)}</code> }),
    commitCol.accessor('subject', { header: t('history.subject'), meta: { pinned: true, list: 'primary' } }),
    commitCol.accessor('author', { header: t('history.author'), meta: { list: 'meta' } }),
    commitCol.accessor('age', { header: t('history.age') }),
  ], [t]);
  const account = accountOf(q.error);
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void q.refetch()} size="sm" />;
  return (
    <>
      <p className={s.note}>{t('history.note')}</p>
      <DataTable<Commit> label={t('history.table')} countLabel={(n) => t('history.count', { count: n })} data={q.data} columns={columns} getRowId={(c) => c.sha} isLoading={q.isLoading} error={q.error ?? undefined} onRetry={() => void q.refetch()}
        empty={<EmptyState size="compact" icon="clock" title={t('history.empty')} />} noViewMenu sortParam={false} />
    </>
  );
}

/** The Repository tab of the folder `at`; `names` words the account recovery (which computer and realm to choose). */
export default function Repository({ at, names, writes, className }: { at: FolderAt; names: FolderNames; writes?: FolderWrites; className?: string }) {
  const t = useStrings(strings);
  const tp = useStrings(prStrings);
  const status = useRepoStatus(at);
  const [view, setView] = useState<View>('changes');
  const st = status.data;
  const isRepo = st?.kind === 'repo';
  // The view's reads live here, so Read again reaches them; a view not shown reads nothing until it is.
  const unstaged = useRepoDiff(at, false, isRepo && view === 'changes');
  const staged = useRepoDiff(at, true, isRepo && view === 'changes');
  const log = useRepoLog(at, isRepo && view === 'history');
  const branches = useRepoBranches(at, isRepo && view === 'branches');
  const worktrees = useRepoWorktrees(at, isRepo && view === 'worktrees');
  const refresh = () => {
    void status.refetch();
    if (view === 'changes') { void unstaged.refetch(); void staged.refetch(); }
    else if (view === 'history') void log.refetch();
    else if (view === 'branches') void branches.refetch();
    else if (view === 'worktrees') void worktrees.refetch();
    else void refreshLists();
  };
  const account = accountOf(status.error);
  let body;
  if (account) body = <AccountFailure kind={account} at={at} names={names} onRetry={() => void status.refetch()} />;
  else if (status.error) body = <ErrorState title={t('repo.failed.title')} body={t('repo.failed.body')} error={status.error} onRetry={() => void status.refetch()} retrying={status.isFetching} />;
  else if (!st) body = <Skeleton variant="table" rows={4} columns={3} />;
  else if (st.kind === 'none') body = <EmptyState icon="files" title={t('repo.none.title')} body={t('repo.none.body')} />;
  else {
    const changes = st.changed + st.untracked + st.conflicts;
    const busy = status.isFetching || unstaged.isFetching || staged.isFetching || log.isFetching || branches.isFetching || worktrees.isFetching;
    body = (
      <>
        <div className={s.head}>
          <RepoTag status={st} />
          <span className={s.local} title={t('repo.localHelp')}>{t('repo.local', { time: timeOf(st.readAt) })}</span>
          <Button size="sm" variant="secondary" icon="reload" onPress={refresh} isDisabled={busy}>{t('repo.refresh')}</Button>
        </div>
        <SegmentedControl<View>
          label={t('repo.views')}
          value={view}
          onChange={setView}
          items={[{ id: 'changes', label: t('repo.changes'), count: changes }, { id: 'history', label: t('repo.history') }, { id: 'branches', label: t('repo.branches') }, { id: 'worktrees', label: t('repo.worktrees') }, { id: 'prs', label: tp('repo.pulls') }, { id: 'issues', label: tp('repo.issues') }]}
        />
        {view === 'changes'
          ? <Changes at={at} names={names} status={st} unstaged={unstaged} staged={staged} writes={writes} />
          : view === 'history' ? <History at={at} names={names} q={log} />
          : view === 'branches' ? <Branches at={at} names={names} q={branches} {...(writes ? { flow: writes } : {})} />
          : view === 'worktrees' ? <Worktrees at={at} names={names} q={worktrees} {...(writes ? { flow: writes } : {})} />
          : view === 'prs' ? <PullRequests at={at} names={names} onRepoChanged={() => void status.refetch()} />
          : <Issues at={at} names={names} />}
      </>
    );
  }
  return <section className={cx(s.repo, className)} aria-label={t('repo.views')}>{body}</section>;
}
