// A folder's Pull requests and Issues views, in the Repository tab. The
// lists are GitHub's recent slice for the folder's repository (owner/repo from the identity read). Creating an issue or a
// pull request, checking one out and merging one are each sent once and never again (pulls.ts): a lost answer leaves a
// held band, "This issue may have been created", whose Check lists what has the title sent, and the person, never the Hub,
// says which is theirs (gh's own output shows on it when the answer carried one); a second submit of a form already sent from this page asks first. A checkout and a merge are
// confirmed in the Hub, naming what they do. Account failures use the shared typed words (Repository.tsx AccountFailure).
import { asUnknown, errorInfo, type HeldChange, type Outcome } from '@core';
import {
  ConfirmDialog, DataTable, Dialog, EmptyState, ErrorState, Facts, Link, OutcomeBanner, RadioGroup, Skeleton, Stack, Tag, TextField,
  createColumnHelper, useStrings, type RowActionEntry,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { useRepoIdentity, type FolderAt } from './data';
import { accountFailureOf } from './logic';
import {
  CHECKOUT_LOCK, ISSUE_LOCK, MERGE_LOCK, PULL_LOCK, forgetOutputIf, heldBy, heldOutput, markSent, noteOutput, prTable, repoKey, sameTitle, useCheckoutPull, useCreateIssue, useCreatePull, useFolderHeld,
  useIssues, useMergePull, usePulls, wasSent, type CreateVars, type Issue, type ListAt, type ListState, type Made, type MergeMethod, type Pull,
  type PullCreateVars, type PullVars,
} from './pulls';
import { AccountFailure, type FolderNames } from './Repository';
import strings from './pulls.strings.en.json';
import folderStrings from './strings.en.json';

type Kind = 'issue' | 'pull';
const STATES: readonly ListState[] = ['open', 'closed', 'all'];
const accountOf = (err: unknown) => (err ? accountFailureOf(errorInfo(err).code) : null);

/** The repository the lists read: owner/repo from the folder's identity read. */
function useListAt(at: FolderAt, state: ListState) {
  const identity = useRepoIdentity(at);
  const list = useMemo<ListAt | null>(() => {
    const full = identity.data?.fullName;
    if (!full) return null;
    const [owner = '', repo = ''] = full.split('/');
    return { ...at, owner, repo, state };
  }, [at, identity.data, state]);
  return { identity, list };
}

/** What stands in for a list while the repository is not known: the account words, a failure, or a skeleton. */
function NoList({ identity, at, names }: { identity: ReturnType<typeof useRepoIdentity>; at: FolderAt; names: FolderNames }) {
  const t = useStrings(strings);
  const account = accountOf(identity.error);
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void identity.refetch()} size="sm" />;
  if (identity.error) {
    return <ErrorState title={t('identity.failed.title')} body={t('identity.failed.body')} error={identity.error} onRetry={() => void identity.refetch()} retrying={identity.isFetching} />;
  }
  return <Skeleton variant="table" rows={3} columns={3} />;
}

/** A refusal's words: an account failure in its typed words; anything else the kit's words for its code (Details holds
 *  the facts). */
function Refused({ title, result }: { title: string; result: { outcome: Outcome; code?: string } }) {
  const f = useStrings(folderStrings);
  const account = accountFailureOf(result.code);
  if (account) return <OutcomeBanner kind="failed" title={title} body={f(`account.${account}` as const)} error={result} />;
  return <OutcomeBanner kind={result.outcome === 'not_sent' ? 'not_sent' : 'failed'} title={title} error={result} />;
}

const stateFilter = (t: ReturnType<typeof useStrings<typeof strings>>, state: ListState, set: (s: ListState) => void) => [{
  id: 'state', label: t('state'), display: 'segmented' as const, required: true, value: state,
  options: STATES.map((s) => ({ value: s, label: t(`state.${s}` as const) })),
  onChange: (v: string | undefined) => set(STATES.includes(v as ListState) ? (v as ListState) : 'open'),
}];

// ---- create (issue or pull request) ----

const candCol = createColumnHelper<Issue | Pull>();
const candidateColumns = (t: ReturnType<typeof useStrings<typeof strings>>) => [
  candCol.accessor('number', { header: t('col.number'), cell: (x) => t('number', { number: x.getValue() }), meta: { list: 'meta' } }),
  candCol.accessor('title', { header: t('col.title'), cell: (x) => (x.row.original.url ? <Link href={x.row.original.url} variant="plain">{x.getValue()}</Link> : x.getValue()), meta: { pinned: true, list: 'primary' } }),
  candCol.accessor('author', { header: t('col.author'), meta: { list: 'meta' } }),
];

type CreateResult = { outcome: Outcome; code?: string; data?: unknown; hold?: string; details?: Record<string, unknown> };
interface CreateFlow {
  readonly kind: Kind;
  readonly lock: string;
  run(v: PullCreateVars): Promise<CreateResult>;
  complete(v: PullCreateVars, hold: string): Promise<boolean>;
  dismiss(v: PullCreateVars, hold: string): Promise<boolean>;
}
function useCreateFlow(kind: Kind): CreateFlow {
  const issue = useCreateIssue();
  const pull = useCreatePull();
  return useMemo<CreateFlow>(() => ({
    kind,
    lock: kind === 'issue' ? ISSUE_LOCK : PULL_LOCK,
    run: (v) => (kind === 'issue' ? issue.mutateAsync(v) : pull.mutateAsync(v)),
    complete: (v, hold) => (kind === 'issue' ? issue.complete(v, hold) : pull.complete(v, hold)).then(forgetOutputIf(hold)),
    dismiss: (v, hold) => (kind === 'issue' ? issue.dismiss(v, hold) : pull.dismiss(v, hold)).then(forgetOutputIf(hold)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [kind, issue.mutateAsync, pull.mutateAsync, issue.complete, pull.complete, issue.dismiss, pull.dismiss]);
}
const varsOfHeld = (at: FolderAt, h: HeldChange): PullCreateVars => ({ ...at, title: String((h.identity as { title?: unknown } | undefined)?.title ?? ''), body: '', base: '' });

/** The create form: one send per press, never a retry. A title this page already sent asks first; a title held as
 *  unknown sends nothing (its band says to check it first). A refusal keeps the text. */
function CreateDialog({ flow, at, held, isOpen, onClose, onSent }: {
  flow: CreateFlow; at: FolderAt; held: readonly HeldChange[]; isOpen: boolean; onClose: () => void; onSent: (r: CreateResult, v: PullCreateVars) => void;
}) {
  const t = useStrings(strings);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [base, setBase] = useState('');
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const [refused, setRefused] = useState<CreateResult | null>(null);
  const vars: PullCreateVars = { ...at, title, body, base };
  const heldHere = held.some((h) => sameTitle(String((h.identity as { title?: unknown } | undefined)?.title ?? ''), title));
  const send = async () => {
    setAgain(false);
    if (busy || heldHere || !title.trim()) return;
    setBusy(true);
    setRefused(null);
    const r = asUnknown(await flow.run(vars).catch((): CreateResult => ({ outcome: 'pending' })));
    setBusy(false);
    noteOutput(r);
    if (r.outcome === 'done' || r.outcome === 'pending') {
      markSent(flow.kind, vars);
      setTitle(''); setBody(''); setBase('');
      onSent(r, vars);
      onClose();
      return;
    }
    setRefused(r);
  };
  const press = () => {
    if (!title.trim() || heldHere) return;
    if (wasSent(flow.kind, vars)) setAgain(true);
    else void send();
  };
  const k = flow.kind;
  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={(o) => { if (!o && !busy) { setRefused(null); onClose(); } }}
        title={t(k === 'issue' ? 'issue.new' : 'pull.new')}
        primaryLabel={t(k === 'issue' ? 'issue.create' : 'pull.create')}
        onPrimary={press}
        primaryDisabled={!title.trim() || heldHere}
        busy={busy}
        size="lg"
        body={k === 'pull' ? t('pull.form.help') : undefined}
      >
        <TextField label={t('form.title')} value={title} onChange={setTitle} isRequired />
        <TextField label={t('form.body')} value={body} onChange={setBody} multiline rows={6} />
        {k === 'pull' ? <TextField label={t('form.base')} description={t('form.base.help')} value={base} onChange={setBase} /> : null}
        {heldHere ? (
          <OutcomeBanner
            // noDetails: an earlier send's answer was lost, so nothing came back to show
            kind="pending"
            title={t(k === 'issue' ? 'issue.heldHere' : 'pull.heldHere')}
            body={null}
          />
        ) : null}
        {refused ? <Refused title={t(k === 'issue' ? 'issue.refused' : 'pull.refused')} result={refused} /> : null}
      </Dialog>
      <ConfirmDialog
        isOpen={again}
        onOpenChange={(o) => { if (!o) setAgain(false); }}
        title={t(k === 'issue' ? 'issue.again.title' : 'pull.again.title')}
        body={t(k === 'issue' ? 'issue.again.body' : 'pull.again.body', { title: title.trim() })}
        confirmLabel={t('again.confirm')}
        onConfirm={() => void send()}
      />
    </>
  );
}

/** One held create: "may have been created", Check (lists what has its title; the person picks), Dismiss (warned). */
/** A held band's "what we know" line, with gh's own output under it when the send's answer carried one (this page life). */
function Known({ line, hold }: { line: string; hold: HeldChange }) {
  const t = useStrings(strings);
  const output = heldOutput(hold.hold);
  if (!output) return <>{line}</>;
  return (
    <Stack gap={2}>
      <span>{line}</span>
      <Facts label={t('output')} columns={1} items={[{ label: t('output'), value: output, mono: true, wide: true }]} />
    </Stack>
  );
}

function HeldCreate({ flow, at, hold, list }: { flow: CreateFlow; at: FolderAt; hold: HeldChange; list: ListAt }) {
  const t = useStrings(strings);
  const k = flow.kind;
  const [checked, setChecked] = useState(false);
  const [asked, setAsked] = useState(false);
  const vars = varsOfHeld(at, hold);
  const all = useMemo<ListAt>(() => ({ ...list, state: 'all' }), [list]);
  const issues = useIssues(all, checked && k === 'issue');
  const pulls = usePulls(all, checked && k === 'pull');
  const q = k === 'issue' ? issues : pulls;
  const rows = (q.data as readonly (Issue | Pull)[] | undefined)?.filter((r) => sameTitle(r.title, vars.title));
  const check = () => { if (checked) void q.refetch(); else setChecked(true); };
  const token = hold.hold;
  return (
    <>
      <OutcomeBanner
        // noDetails: gh's own output, when the answer carried one, is shown in known; nothing else came back for the person
        kind="pending"
        title={t(k === 'issue' ? 'issue.unknown.title' : 'pull.unknown.title')}
        known={<Known line={t('unknown.known', { title: vars.title })} hold={hold} />}
        checkLine={t(k === 'issue' ? 'issue.unknown.check' : 'pull.unknown.check')}
        stopLine={t('unknown.stop')}
        onCheck={check}
        checking={q.isFetching}
        onDismiss={() => setAsked(true)}
        dismissWarned
      />
      {checked && q.error ? <ErrorState title={t('candidates.failed')} error={q.error} onRetry={check} /> : null}
      {checked && rows ? (
        <DataTable<Issue | Pull>
          label={t('candidates')}
          countLabel={(n) => t('candidates.count', { count: n })}
          data={rows}
          columns={candidateColumns(t)}
          getRowId={(r) => String(r.number)}
          empty={<EmptyState size="compact" icon="search" title={t('candidates.none')} />}
          actions={() => [{ id: 'mine', label: t('mine'), inline: true, isDisabled: !token, onAction: () => { if (token) void flow.complete(vars, token); } }]}
          noViewMenu
          sortParam={false}
        />
      ) : null}
      <ConfirmDialog
        isOpen={asked}
        onOpenChange={(o) => { if (!o) setAsked(false); }}
        title={t('dismiss.title')}
        body={t('dismiss.body')}
        confirmLabel={t('dismiss')}
        onConfirm={() => { setAsked(false); if (token) void flow.dismiss(vars, token); }}
      />
    </>
  );
}

/** The last create's answer on this page: made, with its link when gh printed one (core settles a create only on a 200
 *  saying gh succeeded; any other answer is a held create, HeldCreate). */
function MadeBanner({ kind, made, onClear }: { kind: Kind; made: Made; onClear: () => void }) {
  const t = useStrings(strings);
  if (made.kind !== 'made') return null;
  return (
    <OutcomeBanner
      kind="done"
      title={t(kind === 'issue' ? 'issue.made' : 'pull.made')}
      body={made.url ? <Link href={made.url}>{made.number ? t('number', { number: made.number }) : t('made.open')}</Link> : t('made.noLink')}
      onDismiss={onClear}
    />
  );
}

function useCreateState(kind: Kind, at: FolderAt) {
  const flow = useCreateFlow(kind);
  const held = useFolderHeld(flow.lock, at);
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<{ made: Made; title: string } | null>(null);
  const onSent = (r: CreateResult, v: CreateVars) => {
    if (r.outcome === 'done') setLast({ made: (r.data as Made | undefined) ?? { kind: 'unknown' }, title: v.title.trim() });
    else setLast(null);
  };
  return { flow, held, open, setOpen, last, setLast, onSent };
}

function CreateBands({ c, at, list }: { c: ReturnType<typeof useCreateState>; at: FolderAt; list: ListAt }) {
  const mine = c.held.filter((h) => heldBy(c.flow.kind === 'issue' ? 'createIssue' : 'createPull', h) !== 'other');
  return (
    <>
      {c.last?.made.kind === 'made' ? <MadeBanner kind={c.flow.kind} made={c.last.made} onClear={() => c.setLast(null)} /> : null}
      {mine.map((h) => <HeldCreate key={h.hold ?? String(h.at)} flow={c.flow} at={at} hold={h} list={list} />)}
      <CreateDialog flow={c.flow} at={at} held={c.held} isOpen={c.open} onClose={() => c.setOpen(false)} onSent={c.onSent} />
    </>
  );
}

// ---- Issues ----

const issueCol = createColumnHelper<Issue>();

/** The folder's issues, and New issue. */
export function Issues({ at, names }: { at: FolderAt; names: FolderNames }) {
  const t = useStrings(strings);
  const [state, setState] = useState<ListState>('open');
  const { identity, list } = useListAt(at, state);
  const q = useIssues(list);
  const c = useCreateState('issue', at);
  const columns = useMemo(() => [
    issueCol.accessor('number', { header: t('col.number'), cell: (x) => t('number', { number: x.getValue() }), meta: { list: 'meta' } }),
    issueCol.accessor('title', { header: t('col.title'), cell: (x) => (x.row.original.url ? <Link href={x.row.original.url} variant="plain">{x.getValue()}</Link> : x.getValue()), meta: { pinned: true, list: 'primary' } }),
    issueCol.accessor('state', { header: t('col.state'), cell: (x) => <Tag>{t(`state.${x.getValue()}` as const)}</Tag> }),
    issueCol.accessor('author', { header: t('col.author'), meta: { list: 'meta' } }),
  ], [t]);
  if (!list) return <NoList identity={identity} at={at} names={names} />;
  const account = accountOf(q.error);
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void q.refetch()} size="sm" />;
  return (
    <>
      <CreateBands c={c} at={at} list={list} />
      <DataTable<Issue>
        label={t('issues.table')}
        countLabel={(n) => t('issues.count', { count: n })}
        data={q.data}
        columns={columns}
        getRowId={(i) => String(i.number)}
        isLoading={q.isLoading}
        error={q.error ?? undefined}
        onRetry={() => void q.refetch()}
        empty={<EmptyState size="compact" icon="check" title={t('issues.empty')} />}
        filters={stateFilter(t, state, setState)}
        toolbarActions={[{ id: 'new', label: t('issue.new'), icon: 'plus', onPress: () => c.setOpen(true) }]}
        toolbarNote={t('slice')}
        noViewMenu
        sortParam={false}
      />
    </>
  );
}

// ---- Pull requests ----

const pullCol = createColumnHelper<Pull>();
const METHODS: readonly MergeMethod[] = ['merge', 'squash', 'rebase'];

/** A held checkout or merge: may have happened; Check reads (status, or GitHub's list), never sends again. */
function HeldPullChange({ what, at, hold, list, onRepoChanged }: { what: 'checkout' | 'merge'; at: FolderAt; hold: HeldChange; list: ListAt; onRepoChanged: () => void }) {
  const t = useStrings(strings);
  const checkout = useCheckoutPull();
  const merge = useMergePull();
  const [asked, setAsked] = useState(false);
  const [checked, setChecked] = useState(false);
  const number = Number((hold.identity as { number?: unknown } | undefined)?.number ?? 0);
  // The repository the merge went to (the hold's own identity), never the one the folder reads now: a folder repointed
  // to another repository since must not settle it with that repository's #N.
  const heldRepo = String((hold.identity as { repo?: unknown } | undefined)?.repo ?? '');
  const otherRepo = what === 'merge' && heldRepo !== repoKey(`${list.owner}/${list.repo}`);
  const all = useMemo<ListAt>(() => ({ ...list, state: 'all' }), [list]);
  const pulls = usePulls(all, checked && what === 'merge');
  const token = hold.hold;
  const vars: PullVars = { ...at, number };
  const check = () => {
    if (what === 'checkout') { onRepoChanged(); return; }
    if (checked) void pulls.refetch(); else setChecked(true);
  };
  // The list as GitHub answered it for this Check (state all is read only once Check is pressed, and read again on each
  // press). A list that reads it merged proves it whenever it was read: merged cannot be undone. The proof is core's own
  // rule (prTable mergePull.proves: the held repository, number and merged state), so this band and core's read-back
  // free a merge on the same evidence only.
  const fresh = checked && !pulls.isFetching && pulls.data !== undefined;
  const merged = fresh && prTable.changes.mergePull.proves(hold.identity, [[pulls.data!]]) === 'applied';
  // GitHub's list reads it merged: proven, so the hold is freed (the person is not asked).
  useEffect(() => {
    if (merged && token) void merge.complete({ ...vars, method: 'merge', repo: heldRepo }, token).then(forgetOutputIf(token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, token]);
  return (
    <>
      <OutcomeBanner
        // noDetails: gh's own output, when the answer carried one, is shown in known; nothing else came back for the person
        kind="pending"
        title={t(what === 'checkout' ? 'checkout.unknown.title' : 'merge.unknown.title')}
        known={<Known line={t(what === 'checkout' ? 'checkout.unknown.known' : 'merge.unknown.known', { number })} hold={hold} />}
        checkLine={t(what === 'checkout' ? 'checkout.unknown.check' : 'merge.unknown.check')}
        stopLine={t('unknown.stop')}
        onCheck={check}
        checking={pulls.isFetching}
        onDismiss={() => setAsked(true)}
        dismissWarned
      />
      {fresh && !merged ? <EmptyState size="compact" icon="clock" title={t(otherRepo ? 'merge.otherRepo' : 'merge.notYet', { number })} /> : null}
      <ConfirmDialog
        isOpen={asked}
        onOpenChange={(o) => { if (!o) setAsked(false); }}
        title={t('dismiss.title')}
        body={t('dismiss.body')}
        confirmLabel={t('dismiss')}
        onConfirm={() => { setAsked(false); if (token) void (what === 'checkout' ? checkout.dismiss(vars, token) : merge.dismiss({ ...vars, method: 'merge', repo: heldRepo }, token)).then(forgetOutputIf(token)); }}
      />
    </>
  );
}

/** The folder's pull requests: Open a pull request; per row Check out (confirmed) and, while open, Merge (confirmed). */
export function PullRequests({ at, names, onRepoChanged }: { at: FolderAt; names: FolderNames; onRepoChanged: () => void }) {
  const t = useStrings(strings);
  const [state, setState] = useState<ListState>('open');
  const { identity, list } = useListAt(at, state);
  const q = usePulls(list);
  const c = useCreateState('pull', at);
  const checkout = useCheckoutPull();
  const merge = useMergePull();
  const heldCheckouts = useFolderHeld(CHECKOUT_LOCK, at).filter((h) => heldBy('checkoutPull', h) !== 'other');
  const heldMerges = useFolderHeld(MERGE_LOCK, at).filter((h) => heldBy('mergePull', h) !== 'other');
  const [asking, setAsking] = useState<{ what: 'checkout' | 'merge'; pull: Pull } | null>(null);
  const [method, setMethod] = useState<MergeMethod>('merge');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ what: 'checkout' | 'merge'; number: number; r: CreateResult } | null>(null);
  const columns = useMemo(() => [
    pullCol.accessor('number', { header: t('col.number'), cell: (x) => t('number', { number: x.getValue() }), meta: { list: 'meta' } }),
    pullCol.accessor('title', { header: t('col.title'), cell: (x) => (x.row.original.url ? <Link href={x.row.original.url} variant="plain">{x.getValue()}</Link> : x.getValue()), meta: { pinned: true, list: 'primary' } }),
    pullCol.accessor('state', { header: t('col.state'), cell: (x) => <Tag>{t(`pull.state.${x.getValue()}` as const)}</Tag> }),
    pullCol.accessor('head', { header: t('col.head'), meta: { list: 'meta' } }),
    pullCol.accessor('author', { header: t('col.author'), meta: { list: 'meta' } }),
  ], [t]);
  if (!list) return <NoList identity={identity} at={at} names={names} />;
  const account = accountOf(q.error);
  if (account) return <AccountFailure kind={account} at={at} names={names} onRetry={() => void q.refetch()} size="sm" />;
  const confirm = async () => {
    if (!asking || busy) return;
    const { what, pull } = asking;
    setBusy(true);
    setResult(null);
    const vars: PullVars = { ...at, number: pull.number };
    const raw = await (what === 'checkout' ? checkout.mutateAsync(vars) : merge.mutateAsync({ ...vars, method, repo: `${list.owner}/${list.repo}` })).catch((): CreateResult => ({ outcome: 'pending' }));
    const r = asUnknown(raw);
    noteOutput(r);
    setBusy(false);
    setAsking(null);
    if (what === 'checkout' && (r.outcome === 'done' || r.outcome === 'pending')) onRepoChanged();
    setResult(r.outcome === 'pending' ? null : { what, number: pull.number, r });
  };
  const actions = (p: Pull): readonly RowActionEntry[] => [
    { id: 'checkout', label: t('checkout'), opens: true, inline: true, isDisabled: heldCheckouts.length > 0, onAction: () => setAsking({ what: 'checkout', pull: p }) },
    ...(p.state === 'open' ? [{ id: 'merge', label: t('merge'), opens: true, tone: 'danger' as const, isDisabled: heldMerges.length > 0, onAction: () => { setMethod('merge'); setAsking({ what: 'merge', pull: p }); } }] : []),
  ];
  return (
    <>
      <CreateBands c={c} at={at} list={list} />
      {heldCheckouts.map((h) => <HeldPullChange key={h.hold ?? String(h.at)} what="checkout" at={at} hold={h} list={list} onRepoChanged={onRepoChanged} />)}
      {heldMerges.map((h) => <HeldPullChange key={h.hold ?? String(h.at)} what="merge" at={at} hold={h} list={list} onRepoChanged={onRepoChanged} />)}
      {result ? (
        result.r.outcome === 'done'
          ? <OutcomeBanner kind="done" title={t(result.what === 'checkout' ? 'checkout.done' : 'merge.done', { number: result.number })} onDismiss={() => setResult(null)} />
          : <Refused title={t(result.what === 'checkout' ? 'checkout.refused' : 'merge.refused')} result={result.r} />
      ) : null}
      <DataTable<Pull>
        label={t('pulls.table')}
        countLabel={(n) => t('pulls.count', { count: n })}
        data={q.data}
        columns={columns}
        getRowId={(p) => String(p.number)}
        isLoading={q.isLoading}
        error={q.error ?? undefined}
        onRetry={() => void q.refetch()}
        empty={<EmptyState size="compact" icon="github" title={t('pulls.empty')} />}
        filters={stateFilter(t, state, setState)}
        toolbarActions={[{ id: 'new', label: t('pull.new'), icon: 'plus', onPress: () => c.setOpen(true) }]}
        toolbarNote={t('slice')}
        actions={actions}
        noViewMenu
        sortParam={false}
      />
      <ConfirmDialog
        isOpen={asking !== null}
        onOpenChange={(o) => { if (!o && !busy) setAsking(null); }}
        title={asking ? t(asking.what === 'checkout' ? 'checkout.title' : 'merge.title', { number: asking.pull.number }) : ''}
        body={asking?.what === 'merge' ? t('merge.body') : t('checkout.body')}
        confirmLabel={asking?.what === 'merge' ? t('merge.confirm') : t('checkout')}
        tone={asking?.what === 'merge' ? 'danger' : 'default'}
        busy={busy}
        onConfirm={() => void confirm()}
      >
        {asking?.what === 'merge'
          ? <RadioGroup<MergeMethod> label={t('merge.method')} value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`merge.method.${m}` as const) }))} />
          : null}
      </ConfirmDialog>
    </>
  );
}
