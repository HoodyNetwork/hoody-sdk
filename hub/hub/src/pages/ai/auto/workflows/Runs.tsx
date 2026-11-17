// Workflow runs on screen: the runs of one workflow in its detail, and "All runs"
// beside the workflow list. The listing is the page's one read (Workflows' useRuns, shared down). A run row names its chat
// and the step it is on; a running run keeps its chat open while this page is open (runsData.ts), up to 8 chats, and the
// page says so and says when it does not.
// A run's detail reads its steps (getWorkflowRun) and offers Cancel (running) and Resume (failed or
// cancelled, not yet resumed, in its own chat), each behind a confirm and sent once (runActions.ts). Once its own chat
// refused the Resume for its state, Resume in a new chat makes a chat in the run's place and resumes there (newChat.ts):
// the Resume leaves only after the create's own answer proved that chat. A detail's actions
// belong to the place it opened on (account, project, computer and the run's realm, plus the realm the page showed): once
// the page shows another, nothing is sent or read from it. An action's store is kept per place and run for the page's
// life, so a lost answer stays unsure when the detail is closed and opened again, and is never sent again from here.
import {
  ActionBar, Band, ConfirmDialog, DataTable, DetailBody, DetailHeader, Facts, FaqLink, Link, ListDetailPage, Outcome,
  SegmentedControl, Stack, StatusPill, Tag, TextButton, Widget, When, createColumnHelper, leases,
  useDataView, useGo, useStrings, type LeaseHandle, type LeaseManager, type LeaseRef, type Tone,
} from '@kit';
import { capture, useCore, useCurrentComputer, type Ctx } from '@core';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { pageFaq } from '../../faq';
import { links } from '../../links';
import aiStrings from '../../strings.en.json';
import { scopeOf } from './createAttempts';
import { createActionStore, runActionApi, storeOffers, type ActionApi, type ActionKind, type ActionStore, type ActionView } from './runActions';
import { RUNS_FAST_MS, resumable, runsOf, type Pins, type Run, type RunDetail as Detail, type RunState, type RunStep } from './runs';
import { adoptResumeHold, dropResumeHold, refOf, type RunsRead } from './runsData';
import { createNewChatStore, liveNewChatIo, newChatFits, type NewChatIo, type NewChatStore, type NewChatView } from './newChat';
import strings from './Runs.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
export type ChatHref = (sid: string, realm: string) => string;

const TONE: Record<RunState, Tone> = { running: 'ok', completed: 'neutral', failed: 'danger', cancelled: 'neutral' };
const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** How many of a workflow's runs its detail lists. */
export const SECTION_RUNS = 10;

function stateWord(t: T, st: RunState): string {
  switch (st) {
    case 'running':
      return t('st.running');
    case 'completed':
      return t('st.completed');
    case 'failed':
      return t('st.failed');
    case 'cancelled':
      return t('st.cancelled');
  }
}
const pill = (t: T, st: RunState) => (
  <StatusPill tone={TONE[st]} dot={st === 'running'}>
    {stateWord(t, st)}
  </StatusPill>
);
const when = (ms: number) => <When at={ms} />;
const costText = (t: T, r: Run) => (r.cost === null ? t('cost.none') : r.cost < 0.01 ? t('cost.small') : usd.format(r.cost));

/** The chat as a link, or its short id when the page has no link to a chat. */
function ChatLink({ run, chatHref, t }: { run: Run; chatHref?: ChatHref; t: T }) {
  return chatHref ? (
    <Link variant="plain" href={chatHref(run.sid, run.realm)}>
      {t('chat')}
    </Link>
  ) : (
    <Tag>{t('chat.none', { id: run.sid.slice(0, 8) })}</Tag>
  );
}

/** The Workflows | All runs switch beside the page title (the URL's `view`). */
export function RunsViewSwitch() {
  const t = useStrings(strings);
  return (
    <SegmentedControl
      label={t('view.label')}
      param="view"
      items={[
        { id: 'list', label: t('view.list') },
        { id: 'runs', label: t('view.runs') },
      ]}
    />
  );
}

const col = createColumnHelper<Run>();

/** The columns of a runs table: the section lists one workflow (no workflow, no cost), All runs lists every run. */
function runColumns(t: T, chatHref: ChatHref | undefined, all: boolean) {
  return [
    ...(all ? [col.accessor('workflow', { header: t('col.workflow'), meta: { pinned: true, list: 'primary' } })] : []),
    col.accessor('state', { header: t('col.state'), meta: { width: '140px', priority: 1, ...(all ? {} : { pinned: true, list: 'primary' as const }) }, cell: (c) => pill(t, c.getValue()) }),
    col.accessor('step', { header: t('col.step'), meta: { minWidth: 140, priority: 3 }, cell: (c) => c.getValue() ?? '' }),
    col.accessor('startedAt', { header: t('col.started'), meta: { width: '140px', priority: 2 }, cell: (c) => when(c.getValue()) }),
    ...(all ? [col.accessor((r) => r.cost ?? 0, { id: 'cost', header: t('col.cost'), meta: { width: '110px', priority: 4 }, cell: (c) => costText(t, c.row.original) })] : []),
    col.display({ id: 'chat', header: t('col.chat'), meta: { width: '120px', priority: 2 }, cell: (c) => <ChatLink run={c.row.original} chatHref={chatHref} t={t} /> }),
  ];
}

export interface RunsSectionProps {
  workflow: string;
  /** The realm the workflow was listed in; null when the listing did not say. */
  realm: string | null;
  runs: RunsRead;
  chatHref?: ChatHref;
}

/** The newest runs of one workflow, in its detail. */
export function RunsSection({ workflow, realm, runs, chatHref }: RunsSectionProps) {
  const t = useStrings(strings);
  const mine = useMemo(() => (runs.list ? runsOf(runs.list.runs, workflow, realm) : undefined), [runs.list, workflow, realm]);
  const rows = useMemo(() => mine?.slice(0, SECTION_RUNS), [mine]);
  const columns = useMemo(() => runColumns(t, chatHref, false), [t, chatHref]);
  const go = useGo();
  return (
    <Widget title={t('head')}>
      <DataTable
        bare
        fill={false}
        density="compact"
        label={t('head')}
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={runs.isPending}
        error={runs.error}
        onRetry={runs.refetch}
        onRowAction={(r) => go(`${links.workflows}?view=runs&runsel=${encodeURIComponent(r.id)}`)}
        noViewMenu
      />
      {mine && mine.length > SECTION_RUNS && <Tag>{t('newest', { n: SECTION_RUNS, total: mine.length })}</Tag>}
      {runs.list && runs.list.skipped > 0 && <Tag tone="warn">{t('skipped', { count: runs.list.skipped })}</Tag>}
    </Widget>
  );
}

export interface AllRunsProps {
  runs: RunsRead;
  pins: Pins;
  chatHref?: ChatHref;
}

/** Every run on the computer in the realm shown, with the run's facts beside it. */
export function AllRuns({ runs, pins, chatHref }: AllRunsProps) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const rows = runs.list?.runs;
  const columns = useMemo(() => runColumns(t, chatHref, true), [t, chatHref]);
  const view = useDataView<Run>({
    rows: rows as Run[] | undefined,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.workflow, r.step ?? ''],
    filters: [{ id: 'state', label: t('filter.state'), value: (r) => r.state, options: (['running', 'completed', 'failed', 'cancelled'] as const).map((v) => ({ value: v, label: stateWord(t, v) })) }],
    sort: '-startedAt',
    pageSize: 50,
    isLoading: runs.isPending,
    error: runs.error,
    param: 'run',
  });
  const current = rows?.find((r) => r.id === view.activeId);
  // A row menu's Cancel run or Resume opens the run's detail and its confirm there (one place sends). The menu offers
  // what the detail would: the listing may be older than the run's store (an accepted or unsure action).
  const [ask, setAsk] = useState<{ id: string; kind: ActionKind } | null>(null);
  useCore();
  useSyncExternalStore(subscribeActionStores, storesVersion, storesVersion);
  const place = capture();
  const rowMenu = (r: Run) => rowMenuKinds(r, rows ?? [], scopeOf(place, r.realm)).map((kind) => (kind === 'cancel'
    ? { id: 'run-cancel', label: t('act.cancel'), opens: true, tone: 'danger' as const, onAction: () => { setAsk({ id: r.id, kind: 'cancel' }); view.open(r.id); } }
    : { id: 'run-resume', label: t('act.resume'), opens: true, onAction: () => { setAsk({ id: r.id, kind: 'resume' }); view.open(r.id); } }));
  const kept = pins.pinned.length;
  const header = {
    title: t('title'),
    actions: <RunsViewSwitch />,
    meta: kept > 0 ? <Tag>{t('kept', { count: kept })}</Tag> : undefined,
  };
  return (
    <ListDetailPage
      mode="side"
      storageKey="ai-workflow-runs"
      selectionParam="runsel"
      header={header}
      toolbar={
        <>
          {pins.beyond > 0 && (
            <Band size="table" actions={<FaqLink item={byId.workflowRuns}>{t('more')}</FaqLink>}>
              {t('beyond', { count: pins.beyond })}
            </Band>
          )}
          {runs.list && runs.list.skipped > 0 && <Band size="table">{t('skipped', { count: runs.list.skipped })}</Band>}
        </>
      }
      list={
        <DataTable
          label={t('title')}
          view={view}
          columns={columns}
          search={t('search')}
          onRetry={runs.refetch}
          onRefresh={runs.refetch}
          onRowAction={(r) => view.open(r.id)}
          actions={rowMenu}
          noViewMenu
          countLabel={(n) => t('count', { count: n })}
          noMatch={t('noMatch')}
        />
      }
      detail={
        view.activeId === undefined ? null : current ? (
          <RunDetail key={current.id} run={current} runs={rows ?? []} chatHref={chatHref} onChanged={runs.refetch} ask={ask?.id === current.id ? ask.kind : null} onAsked={() => setAsk(null)} />
        ) : rows ? (
          <Band size="table">{t('d.notFound')}</Band>
        ) : null
      }
    />
  );
}

/** Makes a run's calls in its realm (each call is given its context). */
export type MakeActionApi = (realm: string) => ActionApi;
const actionStores = new Map<string, ActionStore>();
// Every store's changes, for the Runs list's row menus (one count, moved by any store).
let storesAt = 0;
const storeSubs = new Set<() => void>();
const storesMoved = () => { storesAt++; for (const f of [...storeSubs]) f(); };
const subscribeActionStores = (fn: () => void) => { storeSubs.add(fn); return () => { storeSubs.delete(fn); }; };
const storesVersion = () => storesAt;
/** The action store of run `run` in `scope` (createAttempts.ts scopeOf: account, project, computer and the run's realm),
 *  made once for the page's life. `makeApi`: tests. */
export function actionStoreFor(scope: string, run: Run, makeApi: MakeActionApi = runActionApi): ActionStore {
  const key = `${scope}|${run.id}`;
  let s = actionStores.get(key);
  if (!s) { s = createActionStore(makeApi(run.realm)); s.subscribe(storesMoved); actionStores.set(key, s); }
  return s;
}
const chatStores = new Map<string, NewChatStore>();
/** The new-chat store of run `run` in `scope`, kept beside its action store for the page's life. `io`: tests. */
export function newChatStoreFor(scope: string, run: Run, io: NewChatIo = liveNewChatIo): NewChatStore {
  const key = `${scope}|${run.id}`;
  let s = chatStores.get(key);
  if (!s) { s = createNewChatStore(io); s.subscribe(storesMoved); chatStores.set(key, s); }
  return s;
}
/** Tests: forgets every action and new-chat store. */
export function resetActionStores(): void { actionStores.clear(); chatStores.clear(); storesMoved(); }

/** The actions a run's row menu offers in `scope` (null: no computer shown, so none): Cancel run while it runs, Resume
 *  while it is resumable (runs.ts), and neither once that run's store here has it out, unsure, settled or fenced. Reads
 *  the store only when one exists; it never makes one. */
export function rowMenuKinds(run: Run, runs: readonly Run[], scope: string | null): ActionKind[] {
  if (scope === null) return [];
  const store = actionStores.get(`${scope}|${run.id}`);
  const chat = chatStores.get(`${scope}|${run.id}`);
  const kind: ActionKind | null = run.state === 'running' ? 'cancel' : resumable(run, runs) && (!chat || chat.offers()) ? 'resume' : null;
  return kind && storeOffers(store, kind) ? [kind] : [];
}

const NOT_SENT = { ok: false, err: { kind: 'not_sent', code: '', status: 0 } } as const;
/** The store of a detail opened where no computer is shown: it never sends (no action is offered then). */
const NONE = createActionStore({ cancel: async () => NOT_SENT, resume: async () => NOT_SENT, list: async () => null, get: async () => null });
const NO_CHAT = createNewChatStore({ status: async () => null, version: async () => null, create: async () => null });
/** The own-chat refusals that a new chat answers: the chat is busy, gone, asks before every tool, or could not be held. */
const CHAT_STATE: ReadonlySet<string> = new Set(['busy', 'gone', 'policy', 'unheld']);

const stepCol = createColumnHelper<RunStep>();
/** A Resume attempt's hold on its run's chat (RunDetail). */
interface Hold { readonly h: LeaseHandle; readonly ref: LeaseRef; known: readonly string[]; sent: boolean; handed: boolean }
const secs = (ms: number) => (ms / 1000).toFixed(ms < 10_000 ? 1 : 0);
function stepPill(t: T, st: RunStep) {
  return st.ok ? <StatusPill tone="ok">{t('step.ok')}</StatusPill>
    : st.timedOut ? <StatusPill tone="warn">{t('step.timedOut')}</StatusPill>
    : <StatusPill tone="danger">{t('step.failed')}</StatusPill>;
}
function stepColumns(t: T) {
  return [
    stepCol.accessor('id', { header: t('step.col.id'), meta: { pinned: true, list: 'primary' }, cell: (c) => c.getValue() }),
    stepCol.accessor('ok', { header: t('step.col.result'), meta: { width: '120px', priority: 1 }, cell: (c) => stepPill(t, c.row.original) }),
    stepCol.accessor((st) => st.ms ?? 0, { id: 'ms', header: t('step.col.time'), meta: { width: '90px', priority: 2 }, cell: (c) => (c.row.original.ms === null ? '' : t('step.secs', { n: secs(c.row.original.ms) })) }),
    stepCol.display({ id: 'tokens', header: t('step.col.tokens'), meta: { width: '150px', priority: 3 }, cell: (c) => (c.row.original.inTok === null && c.row.original.outTok === null ? '' : t('step.tokens', { in: c.row.original.inTok ?? 0, out: c.row.original.outTok ?? 0 })) }),
    stepCol.accessor((st) => st.error ?? '', { id: 'error', header: t('step.col.error'), meta: { minWidth: 160, priority: 4 }, cell: (c) => c.getValue() }),
  ];
}

export interface RunDetailProps {
  run: Run;
  /** The listing the run is in: Resume is offered only while no run resumed from it is running or completed. */
  runs: readonly Run[];
  chatHref?: ChatHref;
  /** Tests: the calls and the lease manager. */
  /** An action may have changed the listing: read it again. */
  onChanged?: () => void;
  /** A row menu asked for this action: its confirm opens (when the action is offered). */
  ask?: ActionKind | null;
  onAsked?: () => void;
  makeApi?: MakeActionApi;
  manager?: LeaseManager;
  /** Tests: where a Resume's hold is handed (default the page's, runsData.ts adoptResumeHold). */
  adopt?: typeof adoptResumeHold;
  /** Tests: the calls that make a new chat. */
  newChatIo?: NewChatIo;
}

/** One run: its facts, its steps, and Cancel or Resume. */
export function RunDetail({ run: r, runs, chatHref, onChanged, ask, onAsked, makeApi, manager, adopt = adoptResumeHold, newChatIo }: RunDetailProps) {
  const t = useStrings(strings);
  // The place the detail opened on: its actions belong to it. Calls go only while the page still shows it.
  const [opened] = useState(() => { const c = capture(); return { scope: scopeOf(c, r.realm), page: c.realm }; });
  useCore();
  const here = (): Ctx | null => { const c = capture(); return opened.scope !== null && c.realm === opened.page && scopeOf(c, r.realm) === opened.scope ? c : null; };
  const moved = here() === null;
  // An action reads the place right before it sends (after the hold's wait): a closed detail sends nothing.
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const place = () => (live.current ? here() : null);
  const make = makeApi ?? runActionApi;
  const api = useMemo(() => make(r.realm), [make, r.realm]);
  const store = useMemo(() => (opened.scope === null ? NONE : actionStoreFor(opened.scope, r, make)), [opened.scope, r, make]);
  const v = useSyncExternalStore(store.subscribe, store.view, store.view);
  const chats = useMemo(() => (opened.scope === null ? NO_CHAT : newChatStoreFor(opened.scope, r, newChatIo)), [opened.scope, r, newChatIo]);
  const cv = useSyncExternalStore(chats.subscribe, chats.view, chats.view);
  // The run's own chat refused for its state: the new chat stays offered for this run from here on.
  const chatRefused = v.phase === 'refused' && v.kind === 'resume' && CHAT_STATE.has(v.why);
  useEffect(() => { if (chatRefused) chats.want(); }, [chatRefused, chats]);
  const [steps, setSteps] = useState<Detail | 'gone' | null | undefined>(undefined);
  // Read again whenever the listing shows the run changed (a running run's row changes with its step).
  useEffect(() => {
    const ctx = here();
    if (!ctx) return;
    let on = true;
    // Reads may overlap (a slow one past the next tick): only the newest one sent is shown.
    let seq = 0;
    const load = () => { const mine = ++seq; void api.get(r.id, ctx).then((d) => { if (on && mine === seq) setSteps(d); }); };
    load();
    // A running run's steps change between listing reads: read them every RUNS_FAST_MS while it runs.
    const timer = r.state === 'running' ? setInterval(load, RUNS_FAST_MS) : null;
    return () => { on = false; if (timer) clearInterval(timer); };
    // `here` reads the place now; the listing's fields of the run stand for "changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, r.id, r.state, r.step, r.finishedAt, moved]);

  // Resume first holds the run's own chat open (the lease manager's `pinned` hold, as the listing's pins). A hold that
  // did not take, or whose Resume was refused, ends at once. One whose Resume went out (or may have) is handed to the
  // page (runsData.ts adoptResumeHold), which keeps it until the listing holds the chat itself or the resumed run ends.
  const target = useCurrentComputer();
  const mgr = manager ?? leases();
  // One hold per Resume attempt. `sent`: its Resume is going out (or went, or may have). A hold whose Resume did not go is
  // closed when that is known, or at once when the detail closes (a send after that is refused: the detail's place
  // reader is null by then). `handed`: given to the page while the answer was still out, so a refusal that comes later
  // takes back this attempt's hold only (an earlier attempt's stays with the page). `known`: the runs resumed from this
  // one that the listing showed before this attempt (an earlier Resume's), which never stand for it.
  const holds = useRef<Hold[]>([]);
  const give = (x: Hold) => { if (x.sent) { adopt(x.ref, r.id, x.h, x.known); x.handed = true; } else x.h.close(); };
  const take = (x: Hold) => { const i = holds.current.indexOf(x); if (i >= 0) holds.current.splice(i, 1); };
  const release = (x: Hold) => { const mine = holds.current.includes(x); take(x); if (x.handed) dropResumeHold(x.h); else if (mine) x.h.close(); };
  const handOff = (x: Hold) => { if (holds.current.includes(x)) { take(x); give(x); } };
  useEffect(() => {
    const mine = holds.current;
    return () => {
      // Unsent: closed now. Sent and not yet answered: the page keeps it (the Resume may have gone out).
      for (const x of mine.splice(0)) give(x);
    };
    // Mount-only: the detail is keyed by its run, so `r.id` and `adopt` are fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // `sid`: the new chat a Resume goes to (absent: the run's own).
  const ready = (x: { hold: Hold | null }, sid?: string) => async (): Promise<'held' | 'gone' | 'failed'> => {
    if (!target) return 'failed';
    const ref = sid ? { ...refOf(r, target), sid } : refOf(r, target);
    const known = (runs ?? []).filter((c) => c.resumedFrom === r.id).map((c) => c.id);
    const hold: Hold = { h: mgr.track(ref, { pinned: true }), ref, known, sent: false, handed: false };
    x.hold = hold;
    holds.current.push(hold);
    await mgr.ensure(ref);
    const phase = mgr.state(ref).phase;
    if (phase !== 'held') release(hold);
    // Held while the detail is open: the Resume goes out next, so from here the hold is kept for the handoff (a refusal
    // still releases it). Closed meanwhile: the cleanup already closed it and nothing is sent.
    else if (live.current) hold.sent = true;
    return phase === 'held' ? 'held' : phase === 'gone' ? 'gone' : 'failed';
  };

  const [asking, setAsking] = useState<ActionKind | null>(null);
  const [newAsk, setNewAsk] = useState(false);
  // `v` is the store's view this render was made for; storeOffers reads the same store.
  const canCancel = !moved && r.state === 'running' && storeOffers(store, 'cancel');
  // No Resume while a new chat is being made or may have been made: one chain at a time.
  const canResume = !moved && resumable(r, runs) && storeOffers(store, 'resume') && chats.offers();
  const canNewChat = canResume && (chatRefused || chats.wanted()) && newChatFits(r, target);
  // A row menu's ask opens the confirm here, once, when the action is offered.
  useEffect(() => {
    if (!ask) return;
    if (ask === 'cancel' ? canCancel : canResume) setAsking(ask);
    onAsked?.();
  }, [ask, canCancel, canResume, onAsked]);
  // This attempt's hold only (none for Cancel): released on a refusal, else handed to the page.
  const settleHold = (att: { hold: Hold | null }) => () => {
    const now = store.view();
    if (now.phase === 'refused') { if (att.hold) release(att.hold); }
    else { if (att.hold) handOff(att.hold); onChanged?.(); }
  };
  // `known` also takes the store's own read right before the send (fresher than the listing the detail showed), as this
  // attempt's snapshot: a later Stop tracking or Resume never adds this attempt's own run to it.
  const resumeIn = (att: { hold: Hold | null }, sid?: string) => store.resume(r, place, {
    ready: ready(att, sid),
    sending: (k) => { if (att.hold) att.hold.known = [...new Set([...att.hold.known, ...k])]; },
    ...(sid ? { chat: sid } : {}),
  });
  const send = (k: ActionKind) => {
    setAsking(null);
    store.clear();
    const att: { hold: Hold | null } = { hold: null };
    if (k === 'cancel') void store.cancel(r, place).then(settleHold(att));
    else void resumeIn(att).then(settleHold(att));
  };
  // Resume in a new chat: the create, then (only with the session id its own answer proved) the Resume into that chat.
  // The own chat's refusal stays shown until the Resume starts, so the offer survives a create that was refused.
  const sendNew = () => {
    setAsking(null);
    chats.clear();
    const att: { hold: Hold | null } = { hold: null };
    void chats.make(r, place).then((sid) => (sid === null ? undefined : resumeIn(att, sid).then(settleHold(att))));
  };
  const facts = [
    { label: t('d.chat'), value: <ChatLink run={r} chatHref={chatHref} t={t} /> },
    ...(r.step ? [{ label: t('d.step'), value: <bdi>{r.step}</bdi> }] : []),
    { label: t('d.started'), value: when(r.startedAt) },
    ...(r.finishedAt !== null ? [{ label: t('d.finished'), value: when(r.finishedAt) }] : []),
    { label: t('d.cost'), value: costText(t, r) },
    ...(r.resumedFrom ? [{ label: t('d.resumed'), value: t('d.resumedId', { id: r.resumedFrom.slice(0, 8) }) }] : []),
    ...(r.cwd ? [{ label: t('d.folder'), value: <bdi>{r.cwd}</bdi>, wide: true }] : []),
    ...(r.lastStep && r.state !== 'running' ? [{ label: t('d.last'), value: <bdi>{r.lastStep}</bdi> }] : []),
    ...(r.error ? [{ label: t('d.error'), value: <bdi>{r.error}</bdi>, wide: true }] : []),
  ];
  const cancel = { id: 'run-cancel', label: t('act.cancel'), opens: 'dialog' as const, tone: 'danger' as const, onPress: () => setAsking('cancel') };
  const resume = { id: 'run-resume', label: t('act.resume'), opens: 'dialog' as const, onPress: () => setAsking('resume') };
  const newChat = { id: 'run-resume-new-chat', label: t('act.newChat'), opens: 'dialog' as const, onPress: () => setNewAsk(true) };
  // The one action is the bar's primary, so it never folds into ⋯ on a phone.
  const actions = canCancel ? <ActionBar label={t('act.label')} primary={cancel} />
    : canNewChat ? <ActionBar label={t('act.label')} primary={newChat} secondary={[resume]} />
    : canResume ? <ActionBar label={t('act.label')} primary={resume} />
    : undefined;
  const stepCols = useMemo(() => stepColumns(t), [t]);
  return (
    <div>
      <DetailHeader title={r.workflow} status={pill(t, r.state)} actions={actions} />
      <DetailBody>
        <Stack gap={4}>
          {moved ? <Band tone="warn" size="table" /* noDetails: nothing was sent; the words say what changed */>{t('moved')}</Band> : null}
          <NewChatOutcome t={t} v={cv} store={chats} />
          <ActionOutcome t={t} v={v} store={store} here={here} chat={<ChatLink run={r} chatHref={chatHref} t={t} />} chatOf={chatHref ? (sid) => chatHref(sid, r.realm) : undefined} />
          <Facts items={facts} columns={1} />
          <Widget title={t('d.steps')}>
            {steps === 'gone' ? <Band size="table">{t('steps.gone')}</Band>
              : steps === null ? <Band tone="warn" size="table" /* noDetails: the read failed; nothing came back */>{t('steps.failed')}</Band>
              : steps !== undefined && steps.steps.length === 0 ? <Band size="table">{t('steps.none')}</Band>
              : (
                <DataTable
                  bare
                  fill={false}
                  density="compact"
                  label={t('d.steps')}
                  data={steps?.steps as RunStep[] | undefined}
                  columns={stepCols}
                  getRowId={(st) => st.id}
                  isLoading={steps === undefined && !moved}
                  noViewMenu
                />
              )}
          </Widget>
        </Stack>
      </DetailBody>
      <ConfirmDialog
        isOpen={asking === 'cancel'}
        onOpenChange={(o) => !o && setAsking(null)}
        overlayId="ai-workflow-run-cancel"
        title={t('cancel.title', { name: r.workflow })}
        body={t('cancel.body')}
        confirmLabel={t('cancel.confirm')}
        tone="danger"
        onConfirm={() => send('cancel')}
      />
      <ConfirmDialog
        isOpen={asking === 'resume'}
        onOpenChange={(o) => !o && setAsking(null)}
        overlayId="ai-workflow-run-resume"
        title={t('resume.title', { name: r.workflow })}
        body={t('resume.body')}
        confirmLabel={t('resume.confirm')}
        onConfirm={() => send('resume')}
      />
      <ConfirmDialog
        isOpen={newAsk && canNewChat}
        onOpenChange={(o) => !o && setNewAsk(false)}
        overlayId="ai-workflow-run-resume-new-chat"
        title={t('newChat.title', { name: r.workflow })}
        body={t('newChat.body')}
        confirmLabel={t('newChat.confirm')}
        onConfirm={() => { setNewAsk(false); sendNew(); }}
      />
    </div>
  );
}

function refusedWords(t: T, kind: ActionKind, why: Extract<ActionView, { phase: 'refused' }>['why']): string {
  switch (why) {
    case 'busy':
      return t('out.busy');
    case 'gone':
      return kind === 'cancel' ? t('out.cancel.gone') : t('out.resume.gone');
    case 'spendCap':
      return t('out.spendCap');
    case 'policy':
      return t('out.policy');
    case 'notSent':
      return t('out.notSent');
    case 'unheld':
      return t('out.unheld');
    case 'unread':
      return t('out.unread');
    case 'resumed':
      return t('out.resumed');
    case 'dropped':
      return t('out.dropped');
    case 'superseded':
      return t('out.superseded');
    case 'lineage':
      return t('out.lineage');
    case 'refused':
      return kind === 'cancel' ? t('out.refused.cancel') : t('out.refused.resume');
  }
}

function newChatWords(t: T, why: Extract<NewChatView, { phase: 'refused' }>['why']): string {
  switch (why) {
    case 'notReady':
      return t('out.newChat.notReady');
    case 'notSent':
      return t('out.notSent');
    case 'binding':
      return t('out.newChat.binding');
    case 'refused':
      return t('out.newChat.refused');
  }
}

/** Stop tracking of an unsure send, asked first: a send that did go through and is tried again may happen twice. */
function StopTracking({ t, overlayId, onStop }: { t: T; overlayId: string; onStop: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TextButton onPress={() => setOpen(true)}>{t('forget')}</TextButton>
      <ConfirmDialog
        overlayId={overlayId}
        isOpen={open}
        onOpenChange={setOpen}
        title={t('forgetTitle')}
        body={t('forgetBody')}
        confirmLabel={t('forgetGo')}
        onConfirm={() => { setOpen(false); onStop(); }}
      />
    </>
  );
}

/** The new chat's create: being made, refused, or may have been made. A made chat says nothing here: the Resume into it
 *  is the action store's. An unsure create has no Check again: nothing here can read it back (newChat.ts). */
function NewChatOutcome({ t, v, store }: { t: T; v: NewChatView; store: NewChatStore }) {
  if (v.phase === 'making') return <Outcome outcome="pending" title={t('out.newChat.making')} /* noDetails: still out, nothing came back */ />;
  if (v.phase === 'refused') return <Outcome outcome="failed" title={newChatWords(t, v.why)} onDismiss={() => store.clear()} /* noDetails: only the outcome is kept; the words say what it means */ />;
  if (v.phase !== 'unsure') return null;
  return (
    <Stack gap={2}>
      <Outcome variant="block" outcome="pending" title={t('out.newChat.unsure')} detail={t('out.newChat.unsure.detail')} /* noDetails: the answer was lost, so nothing came back to show */ />
      <StopTracking t={t} overlayId="ai-workflow-run-new-chat-stop" onStop={() => store.forget()} />
    </Stack>
  );
}

/** What an action did: sending, done, ended another way, refused, or unsure with Check again and Stop tracking. */
function ActionOutcome({ t, v, store, here, chat, chatOf }: { t: T; v: ActionView; store: ActionStore; here: () => Ctx | null; chat: ReactNode; chatOf?: (sid: string) => string }) {
  if (v.phase === 'idle') return null;
  if (v.phase === 'running') return <Outcome outcome="pending" title={v.kind === 'cancel' ? t('out.cancel.running') : t('out.resume.running')} /* noDetails: still out, nothing came back */ />;
  if (v.phase === 'done' && v.chat) {
    const done = <Outcome outcome="done" title={t('out.newChat.done')} onDismiss={() => store.clear()} />;
    return chatOf ? <Stack gap={2}>{done}<Link variant="plain" href={chatOf(v.chat)}>{t('newChat.open')}</Link></Stack> : done;
  }
  if (v.phase === 'done') return <Outcome outcome="done" title={v.kind === 'cancel' ? t('out.cancel.done') : t('out.resume.done')} onDismiss={() => store.clear()} />;
  if (v.phase === 'ended') {
    return <Outcome outcome="failed" title={v.state === 'completed' ? t('out.ended.completed') : t('out.ended.failed')} onDismiss={() => store.clear()} /* noDetails: the run's own state says it */ />;
  }
  if (v.phase === 'refused') {
    const failed = <Outcome outcome="failed" title={refusedWords(t, v.kind, v.why)} onDismiss={() => store.clear()} /* noDetails: only the agent's code is kept; the words say what it means */ />;
    // The agent named the run to resume instead: offer it.
    if (v.why === 'superseded' && v.instead) {
      return <Stack gap={2}>{failed}<Link variant="plain" href={`${links.workflows}?view=runs&runsel=${encodeURIComponent(v.instead)}`}>{t('out.superseded.open')}</Link></Stack>;
    }
    // The chat's state is the reason: offer it, to look or to free it.
    return v.kind === 'resume' && (v.why === 'busy' || v.why === 'gone' || v.why === 'policy') ? <Stack gap={2}>{failed}{chat}</Stack> : failed;
  }
  const seen = v.observed === 'unchecked' || v.observed === 'checking' ? t('seen.unchecked')
    : v.observed === 'failed' ? t('seen.failed')
    : v.observed === 'running' ? t('seen.running')
    : v.observed === 'unclear' ? t('seen.unclear')
    : v.observed === 'starting' ? t('seen.starting')
    : v.observed === 'cut' ? t('seen.cut')
    : v.observed === 'missing' ? t('seen.missing')
    : v.kind === 'cancel' ? t('seen.none.cancel') : t('seen.none.resume');
  return (
    <Stack gap={2}>
      <Outcome
        variant="block"
        outcome="pending"
        title={v.kind === 'resume' ? (v.accepted ? t('out.resume.accepted') : t('out.resume.unsure')) : v.accepted ? t('out.cancel.accepted') : t('out.cancel.unsure')}
        detail={seen}
        onCheck={() => void store.check(here())}
        checking={v.observed === 'checking'}
        /* noDetails: the answer was lost, so nothing came back to show */
      />
      <StopTracking t={t} overlayId="ai-workflow-run-action-stop" onStop={() => store.forget()} />
    </Stack>
  );
}
