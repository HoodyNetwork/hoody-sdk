// A folder's writes on its page: the commit box (Commit and push, Commit, Suggest a message) in
// the Repository tab's Changes, Sync with Pull and Push in the page head, and one band under the head with the last write's
// answer, step by step (commit.ts: positive evidence only).
//   - An unknown step offers the checks: Check again reads the folder's history and status (nothing is sent) and offers
//     the commit whose message matches as "Is this your commit?", never claimed; Open the branch on GitHub;
//     the local status, labelled "Local view, as of the last fetch".
//   - Nothing is ever sent again on its own. Pushing again is the person's choice, through Push: while an earlier write is
//     held, Push first asks to stop tracking it, and the push goes to the folder it was asked in or nowhere.
//   - An unknown outcome is released only by its own proof or by the person: core holds every one (writes.ts settles
//     and holds), so a remount or another page sees it too.
//   - Account failures use the agent's typed words (logic.ts accountFailureOf).
//   - A branch change (sent from Branches.tsx) is one of these writes: the same band, lock and rules. Its unknown
//     outcome's Check again reads the folder's branches and status and shows what is there now, never as proof.
//   - A worktree change (sent from Branches.tsx Worktrees) too: its Check again reads the folder's worktrees and
//     status. A plain remove git refused says where Remove anyway is (its own, second confirm).
import { FREE } from '../logic';
import { refusal, useChangesVersion, type SourceResult } from '@core';
import { ActionMenu, Band, Button, ConfirmDialog, Facts, OutcomeBanner, Row, Stack, TextButton, TextField, useStrings, type Fact } from '@kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchingCommit, wordsOf, type CommitPushAnswer, type CommitStep, type PushStep, type SyncDirection, type SyncStep } from './commit';
import { useRepoBranches, useRepoIdentity, useRepoLog, useRepoStatus, type FolderAt } from './data';
import type { AccountFailure, Branch, RepoStatus } from './logic';
import {
  anyUnknown, answerOf, freshBranches, freshWorktrees, isBranchAnswer, isBranchOp, isForcedPush, isWorktreeAnswer, isWorktreeOp, keepMessage, replyOf, sentMessage, useRepoWorktrees, useRepoWrites, useSuggest, useSuggestModel,
  type BranchAnswer, type BranchOp, type WorktreeOp, type Worktree, type WriteAnswer, type WriteNames, type WriteOp, type WriteVars,
} from './writes';
import strings from './strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The last write this page sent: its answer, the hold it left (when unknown) and the message, plus a commit the person
 *  confirmed in the history. */
interface Last {
  readonly vars: WriteNames & Pick<WriteVars, 'sentAt' | 'message'>;
  readonly answer: WriteAnswer | null;
  readonly hold?: string;
  readonly mine?: string;
  /** A send refused before it left (not sent, stale): the runner's refusal. */
  readonly refused?: ReturnType<typeof refusal>;
}

/** A commit the person confirmed ("Yes, it's mine") proves the commit step, never the push. */
export function withMine(a: WriteAnswer, mine: string | undefined): WriteAnswer {
  if (!mine) return a;
  if (a.op === 'commit') return a.commit.state === 'unknown' ? { op: 'commit', commit: { state: 'created' } } : a;
  if (a.op === 'commitPush' && a.answer.commit.state === 'unknown') {
    const answer: CommitPushAnswer = { ...a.answer, commit: { state: 'created' }, doNotCommitAgain: a.answer.push.state !== 'pushed', tag: a.answer.push.state === 'unknown' ? 'partly' : null };
    return { ...a, answer };
  }
  return a;
}

/** Did the answer prove a new commit? */
export const createdIn = (a: WriteAnswer): boolean =>
  (a.op === 'commit' ? a.commit.state : a.op === 'commitPush' ? a.answer.commit.state : null) === 'created';

/** What a held write shows when its answer is gone (a reload, another mount): every step unknown. */
const unknownAnswer = (v: WriteNames): WriteAnswer => answerOf(v, { kind: 'lost' });

/** The folder's writes and the band's state, shared by the head, the band and the commit box. */
export function useFolderWrites(at: FolderAt) {
  const writes = useRepoWrites(at);
  const [last, setLast] = useState<Last | null>(null);
  const send = useCallback(async (v: Omit<WriteVars, keyof FolderAt | 'sentAt'>) => {
    const vars: WriteVars = { ...at, ...v, sentAt: Date.now() };
    const r = (await writes.runners[vars.op].run(vars)) as SourceResult<unknown>;
    const reply = replyOf(r);
    if (reply) keepMessage(r.hold, vars.message);
    const refused = reply ? undefined : refusal({ kind: r.outcome, ...(r.code ? { code: r.code } : {}) });
    // An earlier send's hold (READ_BACK_FIRST, HELD_BY_OTHER) is that send's: the band keeps showing it.
    if (!reply && !refused) return r;
    setLast({ vars, answer: reply ? answerOf(vars, reply) : null, ...(r.hold ? { hold: r.hold } : {}), ...(refused ? { refused } : {}) });
    return r;
  }, [at, writes.runners]);
  const held = writes.held;
  // What the band shows: the held write (this page's last answer when it is that send), else the last answer. A last
  // answer still unknown whose hold is gone was stopped elsewhere (another tab): nothing to show.
  const shown = useMemo((): Last | null => {
    if (held?.held) {
      if (last?.hold && last.hold === held.hold) return last;
      const i = held.held;
      const vars = {
        op: (i.op as WriteOp) ?? 'commit', ...(typeof i.direction === 'string' ? { direction: i.direction as SyncDirection } : {}),
        ...(typeof i.branch === 'string' ? { branch: i.branch } : {}), ...(typeof i.path === 'string' ? { path: i.path } : {}),
        ...(typeof i.startRef === 'string' ? { startRef: i.startRef } : {}),
        ...(typeof i.force === 'boolean' ? { force: i.force } : {}), sentAt: typeof i.sentAt === 'number' ? i.sentAt : 0, message: sentMessage(held.hold),
      };
      return { vars, answer: null, ...(held.hold ? { hold: held.hold } : {}) };
    }
    if (last?.hold && (!last.answer || anyUnknown(withMine(last.answer, last.mine)))) return null;
    return last;
  }, [held, last]);
  const answer = shown && !shown.refused ? withMine(shown.answer ?? unknownAnswer(shown.vars), shown.mine) : null;
  // A held write whose own answer, or the person's confirmed commit, proved every step is freed (never by a read alone).
  const settled = !!(held && shown?.hold && shown.hold === held.hold && answer && !anyUnknown(answer));
  useEffect(() => {
    if (settled && held) void held.prove(() => Promise.resolve(true));
  }, [settled, held]);
  const mine = useCallback((sha: string) => {
    setLast((l) => (shown ? { ...(l && l.hold && l.hold === shown.hold ? l : shown), mine: sha } : l));
  }, [shown]);
  const clear = useCallback(() => setLast(null), []);
  /** The person's Stop tracking: true when the held write was freed (core may refuse: a hold that moved meanwhile). */
  const stopTracking = useCallback(async (): Promise<boolean> => {
    const freed = held ? await held.dismiss() : true;
    if (freed) setLast(null);
    return freed;
  }, [held]);
  return { at, writes, send, shown, answer, mine, clear, stopTracking };
}
export type FolderWrites = ReturnType<typeof useFolderWrites>;

// ── head: Sync, ⋯ (Pull, Push) ─────────────────────────────────────────────────────────────

export function SyncActions({ flow }: { flow: FolderWrites }) {
  const t = useStrings(strings);
  const { writes } = flow;
  // The folder the page shows (its computer, realm and path): a Push again asked in one folder is sent there or nowhere.
  const here = `${flow.at.target.container.id}\u0000${flow.at.realm}\u0000${flow.at.cwd}`;
  const [asking, setAsking] = useState<{ readonly here: string; readonly hold: string | undefined } | null>(null);
  // Push again: sent once the held write is freed and the page has seen it (the runners refuse while it shows).
  const [pushAfter, setPushAfter] = useState<string | null>(null);
  // Push anyway: the folder it was asked in (sent there or nowhere), only while git's refusal is the answer shown.
  const [forcing, setForcing] = useState<string | null>(null);
  const isHeld = !!writes.held;
  // The refusal offered (its send's time) and core's change version when it was first shown. Every send on a shared lock
  // is held while it is out, in this mount, another page of the folder or another tab, and holding or freeing one moves
  // the version: once it moved the refusal shown here may no longer be the folder's last word, so it is not offered
  // again (any other held change moves it too: the offer goes, nothing is sent).
  const version = useChangesVersion();
  const refusedAt = refusedPush(flow.answer) ? (flow.shown?.vars.sentAt ?? null) : null;
  const [offer, setOffer] = useState<{ readonly at: number; readonly version: number } | null>(null);
  // The baseline is taken once the folder has no send out (this refusal's own send freed), so only a later send moves it.
  const idle = !writes.held && !writes.busy;
  useEffect(() => { setOffer((o) => (refusedAt === null ? null : o && o.at === refusedAt ? o : idle ? { at: refusedAt, version } : null)); }, [refusedAt, version, idle]);
  const canForce = refusedAt !== null && offer?.at === refusedAt && offer.version === version && idle;
  useEffect(() => { setAsking(null); setPushAfter(null); setForcing(null); }, [here]);
  useEffect(() => {
    if (pushAfter !== here || writes.blocked) return;
    setPushAfter(null);
    void flow.send({ op: 'sync', direction: 'push' });
  }, [pushAfter, here, writes.blocked, flow]);
  const push = async () => {
    // Pushing again while a write is held: the person stops tracking it first (the confirm says so).
    if (isHeld) { setAsking({ here, hold: writes.held?.hold }); return; }
    await flow.send({ op: 'sync', direction: 'push' });
  };
  const waiting = pushAfter === here;
  const disabled = writes.blocked || !writes.ok;
  return (
    <>
      <Button size="sm" variant="secondary" icon="reload" onPress={() => void flow.send({ op: 'sync', direction: 'full' })} isDisabled={disabled} busy={writes.runners.sync.busy}>{t('write.sync')}</Button>
      <ActionMenu
        label={t('write.more')}
        size="sm"
        items={[
          { id: 'pull', label: t('write.pull'), description: t('write.pullHelp'), isDisabled: disabled, ...(disabled ? { disabledReason: t(isHeld ? 'write.heldReason' : 'write.busyReason') } : {}), onAction: () => void flow.send({ op: 'sync', direction: 'pull' }) },
          { id: 'push', label: t('write.push'), description: t('write.pushHelp'), isDisabled: writes.busy || !writes.ok || waiting, ...(writes.busy || waiting ? { disabledReason: t('write.busyReason') } : {}), opens: isHeld, onAction: () => void push() },
          ...(canForce
            ? [{ id: 'pushAnyway', label: t('write.pushAnyway'), description: t('write.pushAnywayHelp'), tone: 'danger' as const, opens: true, isDisabled: disabled, ...(disabled ? { disabledReason: t(isHeld ? 'write.heldReason' : 'write.busyReason') } : {}), onAction: () => setForcing(here) }]
            : []),
        ]}
      />
      <ConfirmDialog
        overlayId="ai-folders-push-force"
        isOpen={forcing === here && canForce}
        onOpenChange={(open) => { if (!open) setForcing(null); }}
        title={t('write.pushForce.title')}
        body={t('write.pushForce.body')}
        confirmLabel={t('write.pushForce.confirm')}
        tone="danger"
        confirmDisabled={disabled}
        onConfirm={() => {
          const asked = forcing;
          setForcing(null);
          if (asked !== here || !canForce || disabled) return;
          void flow.send({ op: 'sync', direction: 'push', force: true });
        }}
      />
      <ConfirmDialog
        overlayId="ai-folders-push-again"
        isOpen={!!asking && asking.here === here}
        onOpenChange={(open) => { if (!open) setAsking(null); }}
        title={t('write.pushAgain.title')}
        body={t('write.pushAgain.body')}
        confirmLabel={t('write.pushAgain.confirm')}
        onConfirm={() => {
          const asked = asking;
          setAsking(null);
          // Only the write it was asked about, in the folder it was asked in.
          if (!asked || asked.here !== here || asked.hold !== writes.held?.hold) return;
          void (async () => {
            if (await flow.stopTracking()) setPushAfter(asked.here);
          })();
        }}
      />
    </>
  );
}

// ── the band ─────────────────────────────────────────────────────────────────────────────

const timeOf = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const opName = (t: T, v: WriteNames) =>
  isBranchOp(v.op) ? t(`write.op.${v.op}` as const, { branch: v.branch ?? '' })
  : v.op === 'worktreeAdd' ? t('write.op.worktreeAdd', { path: v.path ?? '' })
  : v.op === 'worktreeRemove' ? t(v.force ? 'write.op.worktreeRemoveForced' : 'write.op.worktreeRemove', { path: v.path ?? '' })
  : isForcedPush(v) ? t('write.op.pushForced')
  : v.op === 'sync' ? t(`write.op.${v.direction ?? 'full'}` as const) : t(`write.op.${v.op}` as const);

function accountWords(t: T, a: AccountFailure | undefined): string | null {
  return a ? t(`account.${a}` as const) : null;
}

function commitWords(t: T, c: CommitStep, mine?: string): string {
  if (c.account) return accountWords(t, c.account)!;
  switch (c.state) {
    case 'created': return mine ? t('write.commit.mine', { sha: mine.slice(0, 7) }) : t('write.commit.created');
    case 'nothing': return t('write.commit.nothing');
    case 'refused': return c.code === 'unresolved_conflicts' ? t('write.commit.conflicts') : t('write.commit.refused');
    case 'unknown': return t('write.commit.unknown');
    default: return c.code ? t('write.notRunCode', { code: c.code }) : t('write.notRun');
  }
}

/** `brief`: the banner's words, without the failure reason (git's output); the facts keep the reason. */
function pushWords(t: T, p: PushStep, brief = false): string {
  if (p.account) return p.state === 'failed' ? `${t('write.push.failed')}: ${accountWords(t, p.account)}` : `${t('write.notRun')}: ${accountWords(t, p.account)}`;
  switch (p.state) {
    case 'pushed': return t('write.push.pushed');
    case 'failed': return p.reason && !brief ? t('write.push.failedReason', { reason: p.reason }) : t('write.push.failed');
    case 'unknown': return t('write.push.unknown');
    default: return p.code ? t('write.notRunCode', { code: p.code }) : t('write.notRun');
  }
}

function stepWords(t: T, s: SyncStep, brief = false): string {
  if (s.account) return `${t('write.step.failed')}: ${accountWords(t, s.account)}`;
  switch (s.state) {
    case 'done': return t('write.step.done');
    case 'failed': return s.code ? t('write.step.failedCode', { code: s.code }) : s.reason && !brief ? t('write.step.failedReason', { reason: s.reason }) : t('write.step.failed');
    case 'unknown': return t('write.step.unknown');
    default: return t('write.notRun');
  }
}

/** `forced`: a forced remove git stopped may have deleted part of the folder before it failed: never "Not changed". */
function branchWords(t: T, op: BranchOp | WorktreeOp, b: BranchAnswer, forced = false): string {
  switch (b.state) {
    case 'done': return isWorktreeOp(op) ? t(`write.worktree.done.${op}` as const) : t(`write.branch.done.${op}` as const);
    case 'refused': return forced ? t('write.worktree.forceRefused') : t('write.branch.refused');
    case 'unknown': return t('write.branch.unknown');
    default: return b.account ? `${t('write.notRun')}: ${accountWords(t, b.account)}` : b.code ? t('write.notRunCode', { code: b.code }) : t('write.notRun');
  }
}

/** A plain worktree remove git refused (changes in it, or locked): Remove anyway is offered on its row. */
export const refusedRemove = (a: WriteAnswer | null): string | null =>
  a && a.op === 'worktreeRemove' && !a.force && a.answer.state === 'refused' ? a.path : null;

/** A push git refused (a commit's push, or Push's push step, answered with the push's own refusal code; no account
 *  failure, no repository-state code, not forced): Push anyway is offered in the head's menu. Never after Sync or Pull. */
export function refusedPush(a: WriteAnswer | null): boolean {
  const plain = (s: PushStep | SyncStep) => s.state === 'failed' && !s.account && !s.code;
  if (!a || (a.op !== 'commitPush' && a.op !== 'sync') || !a.pushRefused) return false;
  if (a.op === 'commitPush') return plain(a.answer.push);
  return a.op === 'sync' && a.direction === 'push' && !a.force && a.answer.steps.some((s) => s.step === 'push' && plain(s));
}

/** The answer's rows: one fact per step, git's own words on a refused commit, branch or worktree change. */
export function stepFacts(t: T, a: WriteAnswer, mine?: string): Fact[] {
  if (isBranchAnswer(a) || isWorktreeAnswer(a)) {
    const b = a.answer;
    return [
      { label: t(isWorktreeAnswer(a) ? 'write.step.worktree' : 'write.step.branch'), value: branchWords(t, a.op, b, isWorktreeAnswer(a) && a.force) },
      ...(b.state === 'refused' && b.output ? [{ label: t('write.output'), value: b.output, mono: true, wide: true }] : []),
      ...(refusedRemove(a) ? [{ label: t('write.worktree.nextLabel'), value: t('write.worktree.forceHint') }] : []),
    ];
  }
  if (a.op === 'commit') {
    return [{ label: t('write.step.commit'), value: commitWords(t, a.commit, mine) }, ...(a.commit.output ? [{ label: t('write.output'), value: a.commit.output, mono: true, wide: true }] : [])];
  }
  if (a.op === 'commitPush') {
    const c = a.answer.commit;
    return [
      { label: t('write.step.commit'), value: commitWords(t, c, mine) },
      { label: t('write.step.push'), value: pushWords(t, a.answer.push) },
      ...(c.output ? [{ label: t('write.output'), value: c.output, mono: true, wide: true }] : []),
      ...(refusedPush(a) ? [{ label: t('write.worktree.nextLabel'), value: t('write.push.forceHint') }] : []),
    ];
  }
  return [
    ...a.answer.steps.map((s) => ({ label: t(`write.step.${s.step}` as const), value: stepWords(t, s) })),
    ...(refusedPush(a) ? [{ label: t('write.worktree.nextLabel'), value: t('write.push.forceHint') }] : []),
  ];
}

/** The banner's sentence: the lost-answer line (when the answer is gone), then each step's result, without git's
 *  output (no output row, no failure reason); the facts below keep both. */
export function summaryOf(t: T, a: WriteAnswer, mine?: string, lost?: string): string {
  const line = (label: string, value: string) => t('write.stepLine', { label, value });
  const lines =
    isBranchAnswer(a) ? [line(t('write.step.branch'), branchWords(t, a.op, a.answer))]
    : isWorktreeAnswer(a) ? [line(t('write.step.worktree'), branchWords(t, a.op, a.answer, a.force))]
    : a.op === 'commit' ? [line(t('write.step.commit'), commitWords(t, a.commit, mine))]
    : a.op === 'commitPush' ? [line(t('write.step.commit'), commitWords(t, a.answer.commit, mine)), line(t('write.step.push'), pushWords(t, a.answer.push, true))]
    : a.answer.steps.map((st) => line(t(`write.step.${st.step}` as const), stepWords(t, st, true)));
  return [lost, ...lines].filter(Boolean).join(' ');
}

type Kind = 'done' | 'failed' | 'pending';
export function kindOf(a: WriteAnswer): Kind {
  if (anyUnknown(a)) return 'pending';
  if (a.op === 'commit') return a.commit.state === 'created' || a.commit.state === 'nothing' ? 'done' : 'failed';
  if (a.op === 'commitPush') return a.answer.push.state === 'pushed' ? 'done' : 'failed';
  if (a.op === 'sync') return a.answer.steps.every((s) => s.state === 'done') ? 'done' : 'failed';
  return a.answer.state === 'done' ? 'done' : 'failed';
}

function titleOf(t: T, v: WriteNames, a: WriteAnswer): string {
  const op = opName(t, v);
  const kind = kindOf(a);
  if (kind === 'done') return t('write.title.done', { op });
  if (kind === 'failed') return t('write.title.failed', { op });
  if (a.op === 'commitPush' && a.answer.tag === 'partly') return t('write.title.partly');
  if (a.op === 'sync' && a.answer.steps.some((s) => s.state !== 'unknown')) return t('write.title.someUnknown', { op });
  return t('write.title.unknown', { op });
}

/** Which checks an unknown answer offers: the history for an unknown commit, the branch for an unknown push, the branch
 *  list for an unknown branch change, the worktree list for an unknown worktree change (and the branch list for an add
 *  that makes a branch). */
export function checksOf(a: WriteAnswer): { history: boolean; branch: boolean; branches: boolean; worktrees: boolean } {
  const none = { history: false, branch: false, branches: false, worktrees: false };
  if (a.op === 'commit') return { ...none, history: a.commit.state === 'unknown' };
  if (a.op === 'commitPush') return { ...none, history: a.answer.commit.state === 'unknown', branch: a.answer.push.state === 'unknown' };
  if (a.op === 'sync') return { ...none, branch: a.answer.steps.some((s) => s.step === 'push' && s.state === 'unknown') };
  if (isWorktreeAnswer(a)) return { ...none, worktrees: a.answer.state === 'unknown', branches: a.answer.state === 'unknown' && !!a.branch };
  return { ...none, branches: a.answer.state === 'unknown' };
}

/** github.com/<owner>/<name>/tree/<branch>, or '' when the repository or the branch is not known. */
export function branchHref(fullName: string | undefined, status: RepoStatus | undefined): string {
  if (!fullName || !status || status.kind !== 'repo' || status.detached || !status.branch) return '';
  return `https://github.com/${fullName}/tree/${status.branch.split('/').map(encodeURIComponent).join('/')}`;
}

/** The checks an unknown answer offers, as facts: the local status (labelled), the newest commits once Check again read
 *  them, and the branch on GitHub; plus the commit whose message matches, offered (never claimed). */
/** The branch (or worktree) list one Check again press read itself (null: that read failed; absent: not read yet). */
type FreshBranches = { readonly press: number; readonly list?: readonly Branch[] | null; readonly worktrees?: readonly Worktree[] | null };

function useChecks(at: FolderAt, answer: WriteAnswer | null, message: string | undefined, checkedAt: number, fresh: FreshBranches | null) {
  const checked = checkedAt > 0;
  const t = useStrings(strings);
  const want = answer && kindOf(answer) === 'pending' ? checksOf(answer) : { history: false, branch: false, branches: false, worktrees: false };
  const status = useRepoStatus(at);
  const log = useRepoLog(at, checked && want.history);
  const identity = useRepoIdentity(at, want.branch);
  if (!answer || kindOf(answer) !== 'pending') return { items: [] as Fact[], match: null };
  const href = want.branch ? branchHref(identity.data?.fullName, status.data) : '';
  const st = status.data;
  const match = want.history && checked && log.data && message ? matchingCommit(log.data, message) : null;
  const items: Fact[] = [];
  if (st?.kind === 'repo') items.push({ label: t('write.localLabel'), value: t('write.localLine', { time: timeOf(st.readAt) }) });
  if (checked && want.history && log.data && !match) {
    items.push({ label: t('write.history'), value: t(message ? 'write.historyNone' : 'write.historyNoMessage') });
    for (const c of log.data.slice(0, 3)) items.push({ label: c.sha.slice(0, 7), value: `${c.subject} · ${c.age}`, mono: true });
  }
  if (href) items.push({ label: t('write.branchLabel'), value: t('write.branchLink'), href });
  // A branch change: what the folder's branches read now (after Check again), never claimed as the change's result: the
  // list shows the end state, not who made it. Only the list the latest press's own request read is "now" (freshBranches:
  // a request sent after the press, never a read already out or the cache); until it answers nothing is shown.
  if (checked && want.branches && isBranchAnswer(answer) && fresh && fresh.press === checkedAt && fresh.list !== undefined) {
    const name = answer.branch;
    const list = fresh.list;
    if (list) {
      const current = list.find((b) => b.current);
      items.push({ label: t('write.branchNowLabel'), value: current ? t('write.branchNow', { branch: current.name }) : t('write.branchNowNone') });
      items.push({ label: t('write.branchListLabel'), value: t(list.some((b) => b.name === name) ? 'write.branchListed' : 'write.branchNotListed', { branch: name }) });
    } else {
      items.push({ label: t('write.branchNowLabel'), value: t('write.branchReadFailed') });
    }
  }
  // An add that makes a branch: whether the branch list read now names it (the new worktree has it checked out, not this
  // folder, so only the list is shown), never claimed.
  if (checked && want.branches && isWorktreeAnswer(answer) && answer.branch && fresh && fresh.press === checkedAt && fresh.list !== undefined) {
    const name = answer.branch;
    items.push({
      label: t('write.branchListLabel'),
      value: fresh.list ? t(fresh.list.some((b) => b.name === name) ? 'write.branchListed' : 'write.branchNotListed', { branch: name }) : t('write.branchReadFailed'),
    });
  }
  // A worktree change: whether the folder's worktrees read now (the latest press's own read) list its path, never claimed.
  if (checked && want.worktrees && isWorktreeAnswer(answer) && fresh && fresh.press === checkedAt && fresh.worktrees !== undefined) {
    const list = fresh.worktrees;
    const path = answer.path;
    items.push({
      label: t('write.worktreeListLabel'),
      value: list ? t(list.some((w) => w.path === path) ? 'write.worktreeListed' : 'write.worktreeNotListed', { path }) : t('write.worktreeReadFailed'),
    });
  }
  return { items, match };
}

/** The band under the folder's head: the last write's answer, or the write held since it was sent. The banner says what
 *  happened; the steps and the checks follow it as facts; "Do not commit again" and a matching commit are bands. */
export function WriteBand({ flow, at }: { flow: FolderWrites; at: FolderAt }) {
  const t = useStrings(strings);
  const { shown, answer } = flow;
  // When Check again was last pressed (0: not since this answer): the checks show only what was read after it.
  const [checkedAt, setCheckedAt] = useState(0);
  const checked = checkedAt > 0;
  const [checking, setChecking] = useState(false);
  const status = useRepoStatus(at);
  const log = useRepoLog(at, checked);
  // Held open while an unknown branch (worktree) change shows, so the press's fresh read has the folder's read to send.
  useRepoBranches(at, !!answer && kindOf(answer) === 'pending' && checksOf(answer).branches);
  useRepoWorktrees(at, !!answer && kindOf(answer) === 'pending' && checksOf(answer).worktrees);
  const [fresh, setFresh] = useState<FreshBranches | null>(null);
  const lastPress = useRef(0);
  const checks = useChecks(at, shown && !shown.refused ? answer : null, shown?.vars.message, checkedAt, fresh);
  useEffect(() => { setCheckedAt(0); setFresh(null); lastPress.current = 0; }, [shown?.hold, shown?.vars.sentAt]);
  if (!shown) return null;
  if (shown.refused) return <OutcomeBanner kind={shown.refused.outcome === 'stale' ? 'stale' : 'not_sent'} error={shown.refused} onDismiss={flow.clear} />;
  if (!answer) return null;
  const kind = kindOf(answer);
  const steps = stepFacts(t, answer, shown.mine);
  // The banner is the live region (role alert/status): it carries what happened as one sentence, so a screen reader
  // hears the step results too; the facts below repeat them as rows, with git's output (the output row and a failure
  // reason), which the banner leaves out.
  const known = summaryOf(t, answer, shown.mine, shown.answer ? undefined : t('write.lost', { time: timeOf(shown.vars.sentAt) }));
  const items = [...steps, ...checks.items];
  const doNotCommitAgain = answer.op === 'commitPush' && answer.answer.doNotCommitAgain;
  const match = checks.match;
  const check = async () => {
    setChecking(true);
    try {
      const press = Date.now();
      lastPress.current = press;
      setCheckedAt(press);
      const want = checksOf(answer);
      const keep = (f: Omit<FreshBranches, 'press'>) => { if (lastPress.current === press) setFresh((o) => ({ ...(o && o.press === press ? o : {}), press, ...f })); };
      const readBranches = async () => keep({ list: await freshBranches(at) });
      const readWorktrees = async () => keep({ worktrees: await freshWorktrees(at) });
      await Promise.all([
        status.refetch(), want.history ? log.refetch() : Promise.resolve(), want.branches ? readBranches() : Promise.resolve(),
        want.worktrees ? readWorktrees() : Promise.resolve(),
      ]);
    } finally { setChecking(false); }
  };
  return (
    <>
      {kind === 'pending' ? (
        <OutcomeBanner
          // noDetails: the agent's answer is shown step by step (its details mapped by commit.ts); a lost answer has none.
          kind="pending"
          title={titleOf(t, shown.vars, answer)}
          known={known}
          checkLine={t(checksOf(answer).branches ? 'write.checkLineBranch' : checksOf(answer).worktrees ? 'write.checkLineWorktree' : 'write.checkLine')}
          stopLine={t('write.stopLine')}
          onCheck={() => void check()}
          checking={checking}
          onDismiss={() => void flow.stopTracking()}
        />
      ) : (
        <OutcomeBanner
          // noDetails: the agent's answer is shown step by step (its details mapped by commit.ts, git's words included).
          kind={kind}
          title={titleOf(t, shown.vars, answer)}
          known={known}
          onDismiss={flow.clear}
        />
      )}
      <Facts label={t('write.steps')} columns={1} items={items} />
      {doNotCommitAgain ? <Band tone="warn" /* noDetails: a caution the answer sets (the commit is recorded, no push is proven), not a rejection; the steps above carry the details */>{t('write.doNotCommitAgain')}</Band> : null}
      {match ? (
        <Band actions={<Button size="sm" variant="secondary" onPress={() => flow.mine(match.sha)}>{t('write.itIsMine')}</Button>}>
          {t('write.isThisYours', { sha: match.sha.slice(0, 7), subject: match.subject })}
        </Band>
      ) : null}
    </>
  );
}

// ── the commit box ───────────────────────────────────────────────────────────────────────

type Suggested =
  | { readonly kind: 'ok'; readonly model: string; readonly cost: string }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'failed' };

/** What the suggestion cost: its price when the agent reported one; "included" only for Hoody Free at 0 (the agent also
 *  answers 0 when the provider does not price the call); otherwise that the price was not reported. */
export function costWords(t: T, v: unknown, model: string): string {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return t('write.cost.unknown');
  if (v > 0) return t('write.cost.usd', { usd: v < 0.01 ? v.toFixed(4) : v.toFixed(2) });
  return model === FREE ? t('write.cost.free') : t('write.cost.unknown');
}

/** The model Suggest a message sends to: the configured default agent's; Hoody Free when none is configured, the list is
 *  unreadable, the default is a fusion composite (the agent refuses a composite for a one-shot call) or an Anthropic
 *  model (never a default); never another agent's model. Undefined while the list is read. */
export function suggestSpec(configured: string | undefined, unreadable: boolean): string | undefined {
  if (configured !== undefined) return !configured || configured.startsWith('fusion/') || configured.startsWith('anthropic/') ? FREE : configured;
  return unreadable ? FREE : undefined;
}

/** The commit box of the Repository tab's Changes: the message, Commit and push, Commit, Suggest a message. */
export default function CommitBox({ flow, at }: { flow: FolderWrites; at: FolderAt }) {
  const t = useStrings(strings);
  const [message, setMessage] = useState('');
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const model = useSuggestModel(at);
  const suggest = useSuggest();
  const [suggesting, setSuggesting] = useState(false);
  const { writes } = flow;
  const spec = suggestSpec(model.data, !!model.error);
  const blocked = writes.blocked || !writes.ok;
  const send = async (op: 'commit' | 'commitPush') => {
    const r = await flow.send({ op, message });
    // The message stays in the box until the agent confirmed the commit: a lost answer may need it again (never sent
    // again on its own, and the lock keeps a second commit from being sent while the first is held).
    const reply = replyOf(r);
    const created = !!reply && createdIn(answerOf({ op }, reply));
    if (created) { setMessage(''); setSuggested(null); }
  };
  const ask = async () => {
    if (!spec) return;
    setSuggesting(true);
    setSuggested(null);
    try {
      const r = await suggest.mutateAsync({ ...at, model: spec }).catch(() => null);
      const data = r?.outcome === 'done' && r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : null;
      const text = data ? wordsOf(data.message) : undefined;
      if (text) { setMessage(text); setSuggested({ kind: 'ok', model: spec, cost: costWords(t, data!.cost_usd, spec) }); }
      else setSuggested(r?.outcome === 'failed' && r.code === 'nothing_to_commit' ? { kind: 'nothing' } : { kind: 'failed' });
    } finally { setSuggesting(false); }
  };
  const description = suggested?.kind === 'ok' ? t('write.suggested', { model: suggested.model, cost: suggested.cost })
    : suggested?.kind === 'nothing' ? t('write.suggestNothing')
    : suggested?.kind === 'failed' ? t('write.suggestFailed')
    : writes.held ? t('write.blocked')
    : spec ? `${t('write.messageHelp')} ${t('write.suggestHelp', { model: spec })}` : t('write.messageHelp');
  const empty = !message.trim();
  // The box heads the Changes view of the Repository tab: the field's label names it, the actions follow it.
  return (
    <Stack gap={2}>
      <TextField label={t('write.message')} multiline rows={3} value={message} onChange={setMessage} description={description} isDisabled={writes.busy} />
      <Row gap={2} wrap>
        <Button size="sm" variant="primary" onPress={() => void send('commitPush')} isDisabled={blocked || empty} busy={writes.runners.commitPush.busy}>{t('write.commitPush')}</Button>
        <Button size="sm" variant="secondary" onPress={() => void send('commit')} isDisabled={blocked || empty} busy={writes.runners.commit.busy}>{t('write.commit')}</Button>
        <TextButton icon="sparkle" onPress={() => void ask()} isDisabled={!spec || suggesting || blocked}>{t('write.suggest')}</TextButton>
      </Row>
    </Stack>
  );
}
