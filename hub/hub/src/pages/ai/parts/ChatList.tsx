// The pane's chat list: one sorted view with group headers: "Needs you" first, then
// Today / Yesterday / Last 7 days / Older. Search, the folder filter and the sort live in the URL (useDataView: `q`,
// `folder`, `sort`). A row opens its conversation by its canonical link (computer handle, realm, sid). Its ⋯ menu has Rename
// and Close (RowChat.tsx: the agent is their only judge, so a row needs no source). Each row's requests go to ITS OWN computer, and a finished rename or close reloads the list for that identity only.
//
// The toolbar's This computer | All computers choice (the folder page has none: its folder is on one computer).
// All computers is one list grouped by computer (the top-bar computer first, AllReads.tsx): each row opens on its own
// computer; every followed computer keeps its group, empty ones included. With no row at all, the page's empty state
// carries the way back to This computer (and to All computers from This computer), since the kit draws it without the
// toolbar.
// The Hub never claims a definite "No chats". No row shows one neutral line ("No chats shown")
// and Refresh; with rows, one generic notice ("Some chats may not be shown") and Refresh whenever coverage.logic
// coverage() does not prove the list complete. Load more stays on the list.
import { Band, Button, DataTable, EmptyState, GroupNotes, SegmentedControl, Tag, TextButton, agentSignedOut, formatRelative, useDataView, useGo, useListPane, useStrings, type DataViewOptions, type GroupNote, type TableGroup, type Translate, type ViewFilter } from '@kit';
import { AgentSignIn, useAgentSignIn, type AgentSignInState, type SignInComp } from '@app/AgentSignIn';
// eslint-disable-next-line no-restricted-imports -- column definitions for the kit DataTable, as every list page does
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chatLink } from '../links';
import { useChatScope, type ChatScope } from './allChats';
import { useAllChats } from './AllReads';
import { ALL_MAX, type ComputerGap } from './allChats.logic';
import { GROUP_ORDER, type ChatRow } from './chats.logic';
import type { ChatId } from './closeAttempts';
import { coverage, settled } from './coverage.logic';
import type { ChatsAt, ChatsRead } from './data';
import { pageFaq } from '../faq';
import aiStrings from '../strings.en.json';
import strings from './Pane.strings.en.json';
import { listShows, useRowChat } from './RowChat';
import s from './Pane.module.css';

const col = createColumnHelper<ChatRow>();
/** The rows a signed-out list hands the table (none read, none loading: the table draws its empty slot, the sign-in). */
const NO_ROWS: ChatRow[] = [];

export interface ChatListProps {
  at: ChatsAt;
  /** The list's reads (the pane reads once: its foot counts the same chats). */
  chats: ChatsRead;
  /** The computer's handle (name.last4): the computer part of every chat link. */
  handle: string;
  computerName: string;
  /** The open chat's row key (`realm/sid`), drawn selected. */
  openKey?: string;
  /** One folder's chats only (the folder page): the folder filter is pinned and not offered. The agent cannot
   *  filter by folder, so the loaded pages are filtered here and no "of N" total is shown. */
  folder?: string;
  /** More notes for the list's one stack under its toolbar (the pane's unconfirmed forks). */
  note?: ReactNode;
}

type T = Translate<typeof strings>;

function useChatColumns(t: T) {
  return useMemo(
    () => [
      col.accessor('mark', {
        id: 'mark',
        header: t('col.state'),
        enableSorting: false,
        cell: (x) => {
          const m = x.getValue();
          if (m === 'needs') return <span className={s.markNeeds} role="img" aria-label={t('mark.needs')} />;
          if (m === 'running') return <span className={s.markRunning} role="img" aria-label={t('mark.running')} />;
          // A chat let go while its turn ran (core chat-attention notes), until it is opened.
          if (m === 'ended') return <Tag>{t('mark.ended')}</Tag>;
          if (m === 'closed') return <Tag>{t('mark.closed')}</Tag>;
          return <span className={s.markNone} aria-hidden="true" />;
        },
        meta: { list: 'lead' as const },
      }),
      col.accessor('title', {
        id: 'title',
        header: t('col.title'),
        cell: (x) => x.getValue() || t('row.untitled'),
        meta: { pinned: true, list: 'primary' as const },
      }),
      col.accessor('at', {
        id: 'when',
        header: t('col.when'),
        sortingFn: (a, b) => (a.original.at ?? 0) - (b.original.at ?? 0),
        cell: (x) => x.row.original.when ?? (x.getValue() === null ? '' : formatRelative(x.getValue() as number)),
        meta: { list: 'status' as const },
      }),
      col.display({
        id: 'tags',
        header: t('col.tags'),
        cell: (x) => {
          const r = x.row.original;
          if (!r.claude && r.bot === undefined) return null;
          return (
            <span className={s.tags}>
              {r.claude && <Tag>{t('tag.claude')}</Tag>}
              {/* A delegate whose Bot this list cannot name (not among the Bots read) is still marked as a Bot's. */}
              {r.bot !== undefined && <Tag>{r.bot ? t('tag.bot', { name: r.bot }) : t('tag.botUnnamed')}</Tag>}
            </span>
          );
        },
        meta: { list: 'meta' as const },
      }),
    ],
    [t],
  );
}

/** This computer | All computers, in the list toolbar. */
function ScopeControl({ t, scope, onChange }: { t: T; scope: ChatScope; onChange: (v: ChatScope) => void }) {
  return (
    <SegmentedControl<ChatScope>
      label={t('scope.label')}
      items={[{ id: 'here', label: t('scope.here') }, { id: 'all', label: t('scope.all') }]}
      value={scope}
      onChange={onChange}
      fullWidth
    />
  );
}

export function ChatList(props: ChatListProps) {
  const [scope, setScope] = useChatScope();
  const { at, chats, computerName } = props;
  // The signed-out place's sign-in lives here, above everything that can unmount it (C9): a re-read (Refresh, Check
  // again, the interval) clears the refusal while it runs and a scope switch drops This computer's list, so a hook
  // inside the place would forget a sign-in that may have gone through and offer a second one when the next refusal
  // draws the place again.
  const comp = useMemo<SignInComp>(() => ({ id: at.target.container.id, name: computerName, agent: { writer: false, writerWhy: 'login', signIn: 'offer' } }), [at.target.container.id, computerName]);
  const state = useAgentSignIn(comp, null, () => chats.reread());
  const signIn = { comp, state };
  // The folder page lists one folder of one computer: no scope.
  if (props.folder !== undefined) return <HereList {...props} signIn={signIn} />;
  return scope === 'all' ? <AllList {...props} scope={scope} setScope={setScope} /> : <HereList {...props} signIn={signIn} scope={scope} setScope={setScope} />;
}

interface Scoped { scope?: ChatScope; setScope?: (v: ChatScope) => void }
/** The computer's agent sign-in, kept by ChatList (C9). */
interface SignInHeld { signIn: { comp: SignInComp; state: AgentSignInState } }

/** The generic coverage notice: one line and Refresh (re-reads every source and takes the next waiting step), plus
 *  Show more chats where the table itself cannot offer the next page (the folder page claims no total). `needs` puts
 *  the Needs-you words first in the same one notice. */
function PartialNote({ t, refresh, more, needs, needsShow }: { t: T; refresh: () => void; more?: (() => void) | undefined; needs?: ReactNode; needsShow?: (() => void) | undefined }) {
  const { rail } = useListPane();
  if (rail) {
    return (
      <Band
        flush
        size="table"
        actions={<>{needsShow && <TextButton onPress={needsShow}>{t('group.needsMoreShow')}</TextButton>}{more && <TextButton onPress={more}>{t('all.showMore')}</TextButton>}<TextButton onPress={refresh}>{t('list.refresh')}</TextButton></>}
      >
        {needs}
        {t('list.partial')}
      </Band>
    );
  }
  return (
    <span className={s.more} role="status" /* reason: the list toolbar's one coverage line, Refresh beside it */>
      {needs}
      <span>{t('list.partial')}</span>
      {needsShow && <Button size="sm" variant="ghost" onPress={needsShow}>{t('group.needsMoreShow')}</Button>}
      {more && <Button size="sm" variant="ghost" onPress={more}>{t('all.showMore')}</Button>}
      <Button size="sm" variant="ghost" onPress={refresh}>{t('list.refresh')}</Button>
    </span>
  );
}

/** A followed computer's group note: its gap in words without its name, and Refresh where a
 *  re-read can help (a refused feed, a read not whole or still out). A read still out shows only once `late`. */
/** A computer's gap in words (no name: its group header says it). */
function gapText(t: T, gap: ComputerGap): string {
  return gap.kind === 'notRead' ? (gap.why === 'cap' ? t('group.notRead.cap', { max: ALL_MAX }) : t(`group.notRead.${gap.why}`)) : gap.kind === 'refused' ? t('group.refused') : t('group.partial');
}

/** A computer's gap as its group's note, with a Refresh for that computer where a re-read can help. */
function groupNote(t: T, name: string, gap: ComputerGap | undefined, refresh: () => void): ReactNode {
  if (!gap) return null;
  const action = gap.kind === 'notRead' ? undefined : { label: t('list.refresh'), onPress: refresh };
  return <GroupNotes name={name} notes={[{ id: gap.kind, text: gapText(t, gap), ...(action ? { action } : {}) }]} />;
}

/** useGapShown for each computer of a list: which computers' notes show, each
 *  with the gap it shows. A known gap shows at once; a read in flight shows once that computer's own read has lasted
 *  PENDING_NOTE_MS. A shown note stays, with the words it had, while its gap does (its Refresh reads again: the note and
 *  its button stay put). `scope` names what the list reads (the realm): a new one starts every computer again. */
export function useGroupGapsShown(gaps: ReadonlyArray<{ id: string; gap: ComputerGap | null }>, scope: string): ReadonlyMap<string, ComputerGap> {
  const [st, setSt] = useState<{ scope: string; shown: ReadonlyMap<string, ComputerGap> }>(() => ({ scope, shown: new Map() }));
  if (st.scope !== scope) setSt({ scope, shown: new Map() });
  const prior = st.scope === scope ? st.shown : new Map<string, ComputerGap>();
  const now = new Map<string, ComputerGap>();
  for (const { id, gap } of gaps) {
    if (!gap) continue;
    const was = prior.get(id);
    if (gap.kind !== 'reading') now.set(id, gap);
    else if (was) now.set(id, was);
  }
  const sig = [...now].map(([id, g]) => `${id}:${g.kind}:${g.kind === 'notRead' ? g.why : ''}`).join('|');
  const waiting = gaps.filter((x) => x.gap?.kind === 'reading' && !now.has(x.id)).map((x) => x.id).join('|');
  // Keep what shows now (a known gap's words; nothing for a gap that closed).
  useEffect(() => {
    setSt((s) => (s.scope !== scope ? s : [...s.shown].map(([id, g]) => `${id}:${g.kind}:${g.kind === 'notRead' ? g.why : ''}`).join('|') === sig ? s : { scope, shown: now }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is what `sig` names
  }, [scope, sig]);
  // Each read in flight has its own timer, started when it began: the first to pass the grace shows, the others keep
  // their own time.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const ids = new Set(waiting ? waiting.split('|').map((id) => `${scope}|${id}`) : []);
    for (const [k, id] of timers.current) if (!ids.has(k)) { clearTimeout(id); timers.current.delete(k); }
    for (const k of ids) {
      if (timers.current.has(k)) continue;
      const id = k.slice(scope.length + 1);
      timers.current.set(k, setTimeout(() => {
        timers.current.delete(k);
        setSt((s) => (s.scope !== scope || s.shown.has(id) ? s : { scope, shown: new Map([...s.shown, [id, { kind: 'reading' } as ComputerGap]]) }));
      }, PENDING_NOTE_MS));
    }
  }, [scope, waiting]);
  useEffect(() => () => { for (const id of timers.current.values()) clearTimeout(id); timers.current.clear(); }, []);
  return now;
}

/** How long a gap that is only a read in flight waits before the list says so. */
export const PENDING_NOTE_MS = 1500;

/** Whether the list says some chats may not be shown. A gap whose reads all answered (a failure, a further
 *  page, a computer not read), or one while offline, shows at once. A gap that is only a read in flight (a scope switch,
 *  a refresh) shows once it has lasted PENDING_NOTE_MS, so a quick read never flashes the words and a stuck one still
 *  says so (nothing implies the list is whole while a read is out). Once shown it stays while the gap
 *  does, so a Refresh pressed in it never takes the line (and its button) away mid-read. `read` names what the list
 *  reads (computer, realm, folder): a new one starts its own grace even while the earlier read is still out, so a realm
 *  change never inherits the earlier read's timer or shown line. */
export function useGapShown(gap: boolean, known: boolean, read: string): boolean {
  const [late, setLate] = useState<{ read: string; at: boolean }>({ read, at: false });
  // A new read: forget the earlier one's grace during this render (React's adjust-state-on-prop-change form).
  if (late.read !== read) setLate({ read, at: false });
  const shownLate = late.read === read && late.at;
  const now = gap && (known || shownLate);
  useEffect(() => {
    if (!gap) { setLate({ read, at: false }); return undefined; }
    if (known) { setLate({ read, at: true }); return undefined; }
    if (shownLate) return undefined;
    const id = setTimeout(() => setLate({ read, at: true }), PENDING_NOTE_MS);
    return () => clearTimeout(id);
  }, [gap, known, shownLate, read]);
  return now;
}

/** No row: one neutral line and Refresh (nothing claims there are no chats), plus Show more chats while a next page
 *  exists (the kit draws no Load more without rows). */
function NoneShown({ t, refresh, more, secondary }: { t: T; refresh: () => void; more?: (() => void) | undefined; secondary?: ReactNode }) {
  const action = (
    <>
      {more && <Button onPress={more}>{t('all.showMore')}</Button>}
      <Button onPress={refresh}>{t('list.refresh')}</Button>
    </>
  );
  return <EmptyState icon="hoody-ai" title={t('empty.none')} action={action} {...(secondary ? { secondary } : {})} />;
}

/** The list's place when the agent refused it because its platform login is gone (kit agentSignedOut): the shared sign-in
 *  with its own button (the Bots and Schedules way), proven by this list's own read; never "This didn't load", which reads
 *  like an outage that Try again could end. `secondary`: the way to All computers, as NoneShown carries it. Draws only: the
 *  sign-in's state is ChatList's (C9). */
function SignedOut({ comp, state, secondary }: { comp: SignInComp; state: AgentSignInState; secondary?: ReactNode }) {
  return (
    <>
      <AgentSignIn comp={comp} state={state} place="own" />
      {secondary}
    </>
  );
}

function HereList({ at, chats, handle, openKey, folder, note: extra, scope, setScope, signIn }: ChatListProps & Scoped & SignInHeld) {
  const t = useStrings(strings);
  const go = useGo();
  const columns = useChatColumns(t);

  const group = useMemo<NonNullable<DataViewOptions<ChatRow>['group']>>(
    () => ({ key: (r) => r.group, order: GROUP_ORDER, label: (k) => t(`group.${k}` as 'group.needs') }),
    [t],
  );
  const folders = chats.folders;
  const filters = useMemo<ViewFilter<ChatRow>[]>(
    () => (folder !== undefined ? [] : [{ id: 'folder', label: t('list.folder'), value: (r) => r.cwd, options: folders.map((f) => ({ value: f, label: f })) }]),
    [t, folders, folder],
  );
  const rows = useMemo(() => (folder === undefined ? chats.rows : chats.rows?.filter((r) => r.cwd === folder)), [chats.rows, folder]);
  const total = folder === undefined ? chats.shown : null;
  // The agent's platform login is gone (restriction_unknown on GET /sessions) and no earlier rows are kept:
  // the sign-in takes the failure's place. Rows kept from an earlier read keep the table's warning band.
  const signedOut = agentSignedOut(chats.error) && !(rows && rows.length > 0);
  // Rename, Close and Delete: this computer's chats go to this computer; a finished one reloads this list, for that identity only.
  // The AI FAQ's settle answer: a row's Rename, Close and Delete link it while their change waits.
  const tp = useStrings(aiStrings);
  const { byId } = pageFaq(tp);
  const rowChat = useRowChat({
    faqItem: byId.settle,
    faqLabel: tp('settle.link'),
    // No handle yet (the computer's name is not known): no actions, since a chat link and its identity need one.
    where: () => (handle ? { target: at.target, handle, scope: at.realm } : null),
    onRenamed: (_name, chat) => { if (listShows(at.realm, at.target.container.id, chat)) chats.refetch(); },
    onClosed: (chat) => { if (listShows(at.realm, at.target.container.id, chat)) chats.refetch(); },
    onDeleted: (chat) => { if (listShows(at.realm, at.target.container.id, chat)) chats.refetch(); },
  });
  const view = useDataView<ChatRow>({
    rows: signedOut ? NO_ROWS : rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.title, r.bot],
    filters,
    sort: '-when',
    group,
    isLoading: chats.isPending,
    error: signedOut ? undefined : (chats.error ?? undefined),
    context: `${at.target.container.id}|${at.realm}`,
  });

  // The Needs-you words: a failed gates or waiting-chat read (Refresh reads it again), or waiting chats beyond those
  // read (Show more waiting, beside Refresh, reads them). They join the one generic notice, never replace it, so the folder
  // page keeps its Show more chats (the table cannot offer it without a total).
  const needs = chats.gatesError ? (
    <span>{t('group.needsUnknown')}</span>
  ) : chats.gatesMore ? (
    <span title={t('group.needsCover')}>{t('group.needsMore')}</span>
  ) : undefined;
  // Show more waiting stands with the line's other actions, after the words (the words run on into the coverage line).
  const needsShow = !chats.gatesError && chats.gatesMore ? chats.moreGates : undefined;
  // The generic notice whenever coverage is not proven complete (and the folder page's next page, which the
  // table cannot offer without a total). Needs-you words imply it: a failed or unfinished gates read is a source.
  const folderMore = folder !== undefined ? chats.loadMore : undefined;
  // The coverage words wait until every read has answered (a scope switch or a refresh never flashes them),
  // and stand under the list; the folder page's Show more chats needs no wait.
  const partial = useGapShown(!coverage(chats.sources), settled(chats.sources), `${at.target.container.id}|${at.realm}|${folder ?? ''}`);
  const note = partial || folderMore ? <PartialNote t={t} refresh={chats.refetch} more={folderMore} needs={needs} needsShow={needsShow} /> : undefined;
  const toAll = setScope ? <TextButton onPress={() => setScope('all')}>{t('scope.toAll')}</TextButton> : undefined;

  return (
    <>
    <DataTable<ChatRow>
      label={t('list.label')}
      columns={columns}
      view={view}
      presentation="list"
      actions={rowChat.actions}
      filters={view.chips}
      noViewMenu
      noMatch={t('list.noMatch')}
      countLabel={(n) => t('list.count', { count: n })}
      onRowAction={(r) => {
        const href = chatLink({ computer: handle, realm: r.realm, sid: r.sid });
        if (href) go(href);
      }}
      activeId={openKey}
      onRetry={chats.refetch}
      onRefresh={chats.refetch}
      {...(extra ? { toolbarNote: extra } : {})}
      {...(scope && setScope ? { toolbarEnd: <ScopeControl t={t} scope={scope} onChange={setScope} /> } : {})}
      empty={signedOut ? <SignedOut comp={signIn.comp} state={signIn.state} secondary={toAll} /> : rows && rows.length === 0 ? <NoneShown t={t} refresh={chats.refetch} more={chats.loadMore} secondary={toAll} /> : undefined}
      {...(total !== null ? { total } : {})}
      {...(chats.loadMore ? { onLoadMore: chats.loadMore } : {})}
      loadingMore={chats.loadingMore}
    />
    {/* Under the rows only: an empty list says it itself (NoneShown, with its own Refresh). */}
    {rows && rows.length > 0 ? note : null}
    {rowChat.dialogs}
    </>
  );
}

function AllList({ at, openKey, note: extra, scope, setScope }: ChatListProps & Required<Scoped>) {
  const t = useStrings(strings);
  const go = useGo();
  const columns = useChatColumns(t);
  const all = useAllChats(at);
  // One group per followed computer, the top-bar one first, every one shown, empty ones included.
  // Why a computer's chats may be missing is its own group's
  // first row (the kit's GroupNotes), with a Refresh for that computer where one can help. A read still out says so
  // only once that computer's own grace has run; a shown note stays while its Refresh reads again.
  const followed = all.followed ?? [];
  const shown = useGroupGapsShown(followed.map((c) => ({ id: c.id, gap: all.gapOf(c.id) })), at.realm);
  const groups: TableGroup[] = followed.map((c) => {
    const note = groupNote(t, c.name, shown.get(c.id), () => all.refreshOf(c.id));
    return { id: c.id, label: c.name, showEmpty: true, ...(note ? { note } : {}) };
  });
  // No row at all: the table draws its empty state, no group, so each computer's note names it above the list.
  // Each names its computer; none carries a Refresh: the empty state's own Refresh re-reads every computer.
  const emptyNotes: GroupNote[] = all.rows !== undefined && all.rows.length === 0
    ? followed.flatMap((c) => { const g = shown.get(c.id); return g ? [{ id: c.id, of: c.name, text: gapText(t, g) }] : []; })
    : [];
  // Rename, Close and Delete: each row goes to ITS OWN computer (its group's), never the top bar's; a finished one reloads for that identity.
  // The AI FAQ's settle answer: a row's Rename, Close and Delete link it while their change waits.
  const tp = useStrings(aiStrings);
  const { byId } = pageFaq(tp);
  const rowChat = useRowChat({
    faqItem: byId.settle,
    faqLabel: tp('settle.link'),
    where: (r) => {
      const target = r.computer ? all.targetOf(r.computer) : null;
      return target && r.handle ? { target, handle: r.handle, scope: at.realm } : null;
    },
    // Only the originating computer's read is refreshed, and only when this list shows that chat's realm.
    onRenamed: (_name, chat: ChatId) => { if (listShows(at.realm, chat.target, chat)) all.refetchOf(chat.target); },
    onClosed: (chat: ChatId) => { if (listShows(at.realm, chat.target, chat)) all.refetchOf(chat.target); },
    onDeleted: (chat: ChatId) => { if (listShows(at.realm, chat.target, chat)) all.refetchOf(chat.target); },
  });
  const view = useDataView<ChatRow>({
    rows: all.rows,
    columns,
    getRowId: (r) => r.key,
    search: (r) => [r.title, r.bot],
    sort: '-when',
    isLoading: all.isPending,
    error: all.error ?? undefined,
    context: `all|${at.realm}`,
  });
  const current = at.target.container.id;
  // The list's own line: only what names no computer (the computer list itself); each computer's gap is in its group.
  const gap = useGapShown(!all.listComplete, all.listSettled, `all|${at.realm}`);
  const here = <TextButton onPress={() => setScope('here')}>{t('scope.toHere')}</TextButton>;
  return (
    <>
      {all.readers}
      {emptyNotes.length > 0 ? <div data-group-notes-empty=""><GroupNotes notes={emptyNotes} /></div> : null}
      <DataTable<ChatRow>
        label={t('list.label')}
        columns={columns}
        view={view}
        presentation="list"
        actions={rowChat.actions}
        noViewMenu
        noMatch={t('list.noMatch')}
        countLabel={(n) => t('list.count', { count: n })}
        groupBy={(r) => r.computer}
        groups={groups}
        onRowAction={(r) => {
          const href = r.handle ? chatLink({ computer: r.handle, realm: r.realm, sid: r.sid }) : '';
          if (href) go(href);
        }}
        activeId={openKey ? `${current}|${openKey}` : undefined}
        onRetry={all.refetch}
        onRefresh={all.refetch}
        {...(extra ? { toolbarNote: extra } : {})}
        toolbarEnd={<ScopeControl t={t} scope={scope} onChange={setScope} />}
        empty={all.rows && all.rows.length === 0 ? <NoneShown t={t} refresh={all.refetch} more={all.loadMore} secondary={here} /> : undefined}
        {...(all.total !== null ? { total: all.total } : {})}
        {...(all.loadMore ? { onLoadMore: all.loadMore } : {})}
        loadingMore={all.loadingMore}
      />
      {/* Under the list, once every read has answered. */}
      {gap && all.rows && all.rows.length > 0 ? <PartialNote t={t} refresh={all.refetch} /> : null}
      {rowChat.dialogs}
    </>
  );
}
