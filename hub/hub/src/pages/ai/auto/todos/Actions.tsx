// A TODO's actions (C9 outcomes): Run (unattended, confirmed) or, while a worker holds it, Cancel run
// in its header; under it the runs waiting for approval, each once with its prompt (Approve, confirmed, starts
// the run; Deny). A TODO a worker holds reads "Claimed by a worker", read only: the Hub does not claim TODOs (actions.ts).
// One action at a time per TODO; a lost answer is "This may have gone through" until Check again reads the TODO and sees
// it, and is never sent again.
// Cancel run's outcome is the run_end of the run it was sent for (actions.ts), read back after the answer. The attempt is
// kept per TODO outside this render (kept.ts), so it outlives a selection change and the row (HeldTodoAction). A confirm
// is bound to what it was opened for (confirm.ts): its open reads the TODO (the run's worker session, the proposal, the
// content revision), the send reads it again and sends nothing if that moved, and a selection, capability or expiry
// change discards it in an effect, so it never comes back. The lines stay short; each links to its answer in the tab's
// questions (faq.ts): the confirms through the kit Dialog faq, the rest through a FaqLink.
import { coreSource } from '@core';
import { Band, ConfirmDialog, FaqLink, ItemList, Outcome, Row, Stack, StatusLine, TextButton, formatDateTime, useStrings, type ItemProps, type Translate } from '@kit';
import { useEffect } from 'react';
import { pageFaq } from '../../faq';
import { Bidi } from '../../parts/raw';
import aiStrings from '../../strings.en.json';
import { useBoundConfirm, useDeadlines } from '../confirm';
import { useHeld, useKept, useView } from '../kept';
import { createActionStore, past, todoApi, type Action, type ActionStore, type ActionView } from './actions';
import { todoRoutes, useTodo } from './data';
import type { Proposal, TodoRow } from './logic';
import strings from './Actions.strings.en.json';
import listStrings from './List.strings.en.json';
import s from './Actions.module.css';

type T = Translate<typeof strings>;

// The list's reads (data.ts) are invalidated by page + key, so an action's done reads the list and the TODO again.
const source = coreSource('ai', { reads: { 'auto.todoActions': { route: todoRoutes.todo } } });
const refreshTodos = () => void source.invalidate(['auto.todos', 'auto.todo']);

const ENDS = ['cancelled', 'done', 'blocked', 'failed'] as const;
const endKey = (outcome: string) => `end.${(ENDS as readonly string[]).includes(outcome) ? outcome : 'other'}` as 'end.other';

/** How a cancel's run ended; an end that names no session is never told as this run's. */
const endText = (t: T, e: NonNullable<ActionView['ended']>): string => (e.named ? t(endKey(e.outcome)) : t('o.cancel.unnamed'));

function outcomeOf(t: T, v: ActionView): { kind: 'done' | 'pending' | 'failed'; title: string; detail?: string } | null {
  const a = v.action;
  if (!a) return null;
  if (v.phase === 'done') return { kind: 'done', title: t(`${v.fromRead ? 'o.seen' : 'o.done'}.${a}` as 'o.done.run') };
  if (v.phase === 'refused') {
    if (v.notSent) return { kind: 'failed', title: t(v.notSent === 'noRun' ? 'o.notSent.noRun' : v.notSent === 'changed' ? 'o.notSent.changed' : 'o.notSent.read') };
    if (v.ruledOut) return { kind: 'failed', title: t('o.ruledOut') };
    // A 404 never says the TODO is gone: the agent answers it for a TODO this realm cannot see too, and for approve
    // or deny when only the proposal is missing (the same not-found answer there).
    if (v.refusal?.status === 404) return { kind: 'failed', title: t(a === 'approve' || a === 'deny' ? 'o.refused.notFoundProposal' : 'o.refused.notFound') };
    if (a === 'run') return { kind: 'failed', title: t('o.refused.run') };
    if (a === 'cancelRun') return { kind: 'failed', title: t('o.refused.cancelRun'), detail: v.ended ? endText(t, v.ended) : undefined };
    return { kind: 'failed', title: t('o.refused') };
  }
  if (v.phase === 'unsure') {
    const parts: string[] = [];
    if (v.observed === 'failed') parts.push(t('o.readFailed'));
    // A cancel whose run ended another way says how (below), not that its end is missing.
    else if (v.observed === 'same' && !(a === 'cancelRun' && v.ended)) parts.push(t(a === 'run' ? 'o.run.never' : a === 'cancelRun' ? 'o.cancel.notYet' : 'o.same'));
    else if (v.observed !== 'same') parts.push(t(a === 'cancelRun' ? 'o.cancel.detail' : a === 'run' || a === 'approve' ? 'o.unsure.start' : 'o.unsure.detail'));
    if (v.ended) parts.push(endText(t, v.ended));
    if (v.proposalNow === 'approved') parts.push(t('o.now.approved'));
    if (v.runSeen) {
      const ms = Date.parse(v.runSeen.ts);
      parts.push(t('o.runSeen', { when: Number.isFinite(ms) ? formatDateTime(ms) : v.runSeen.ts }));
    }
    return { kind: 'pending', title: t(a === 'cancelRun' && v.answered ? 'o.cancel.answered' : 'o.unsure'), detail: parts.join(' ') };
  }
  return null;
}

function ActionOutcome({ store }: { store: ActionStore }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const v = useView(store);
  const o = outcomeOf(t, v);
  const running = v.phase === 'running' && v.action ? t(`o.running.${v.action}` as 'o.running.run') : '';
  const reading = v.reading && v.phase !== 'unsure' ? t('o.reading') : '';
  const now = running && reading ? `${running} ${reading}` : running || reading;
  return (
    // No live region of its own: what is going on now is one kit StatusLine that stays mounted and changes only
    // its words; the kit Outcome beside it carries its own role.
    <div className={s.outcome}>
      <StatusLine>{now}</StatusLine>
      {o && (
        <Outcome
          variant="block"
          outcome={o.kind}
          title={o.title}
          detail={o.detail}
          error={v.refusal?.error}
          onCheck={v.phase === 'unsure' ? () => store.check() : undefined}
          checking={v.reading}
          onDismiss={v.phase === 'done' || v.phase === 'refused' ? () => store.clear() : undefined}
        />
      )}
      {/* The kit shows no Dismiss on an unknown outcome: stopping to watch one is its own, worded press. */}
      {v.phase === 'unsure' && (
        <Row gap={2}>
          <TextButton isDisabled={v.reading} onPress={() => store.forget()}>
            {t('o.forget')}
          </TextButton>
          <FaqLink item={byId.autoUnsure}>{t('more.unsure')}</FaqLink>
        </Row>
      )}
      {o && v.phase !== 'unsure' && (
        <Row gap={2}>
          {v.notSent ? (
            <FaqLink item={byId.autoNotSent}>{t('more.notSent')}</FaqLink>
          ) : v.action === 'cancelRun' ? (
            <FaqLink item={byId.autoCancel}>{t('more.cancel')}</FaqLink>
          ) : (
            <FaqLink item={byId.autoRun}>{t('more.run')}</FaqLink>
          )}
        </Row>
      )}
    </div>
  );
}

/** A TODO's actions in two places: `head` is the one header action (Run, or Cancel run while a worker holds it;
 *  none once it is closed: the caller draws its button), `ctl` what TodoActions draws under it: the closed or claimed
 *  line, the runs waiting for you (each once, with its prompt, Approve and Deny), the outcome and the confirms. `waiting`
 *  names the proposals TodoActions lists, so the thread lists only the others. */
export interface TodoHeadAction {
  action: 'run' | 'cancelRun';
  /** Another action of this TODO is not settled: the button is off. */
  busy: boolean;
  open: () => void;
}

export function useTodoActions(row: TodoRow): { head: TodoHeadAction | null; ctl: TodoCtl; waiting: ReadonlySet<string> } {
  const t = useStrings(strings);
  const tl = useStrings(listStrings);
  const store = useKept(`todo\n${row.key}`, (ctx) => createActionStore({ api: todoApi(row.id, row.realm, ctx), ctx }));
  const v = useView(store);
  const th = useTodo(row.id).data;
  const busy = v.phase === 'running' || v.phase === 'unsure';
  useEffect(() => {
    if (v.phase === 'done' || v.phase === 'refused') refreshTodos();
  }, [v.phase]);
  const closed = row.state === 'done' || row.state === 'dropped';
  const pending = closed ? [] : (th?.proposals ?? []).filter((p) => p.status === 'pending');
  // A proposal the agent has not yet marked expired (it does so lazily) is past its own expires_at: re-render then.
  useDeadlines(pending.map((p) => Date.parse(p.expiresAt)));
  const live = (pid: string) => pending.some((p) => p.id === pid && !past(p.expiresAt, Date.now()));
  // What this TODO offers now: a confirm whose action it no longer offers is discarded, and sends nothing.
  const c = useBoundConfirm<Action>({
    target: row.key,
    offered: (a, pid) => !closed && (a === 'cancelRun' ? row.running : !row.running && (a === 'run' || live(pid))),
    identify: (a, pid) => store.identify(a, pid),
  });
  const open = (a: Action, pid = '') => {
    const exp = pending.find((p) => p.id === pid)?.expiresAt;
    const ms = exp ? Date.parse(exp) : NaN;
    c.open(a, pid, Number.isFinite(ms) ? ms : null);
  };
  const confirm = () => {
    const b = c.take();
    if (b) void store.run(b.action, b.pid, b.ident);
  };
  const deny = (pid: string) => {
    if (!row.running && live(pid)) void store.run('deny', pid, null);
  };
  const dialog = (a: Action) => ({
    isOpen: c.ask?.action === a,
    onOpenChange: (o: boolean) => void (!o && c.close()),
    onConfirm: confirm,
    confirmDisabled: c.reading || c.unreadable || !c.ask?.ident,
  });
  // One row per waiting run: Approve and Deny while it can be decided here, the expiry in its meta once it is past. While
  // another action of this TODO is unsettled they stay focusable and say why they wait (ReasonButton), as Run does.
  const proposalItem = (p: (typeof pending)[number]): ItemProps => {
    const expired = past(p.expiresAt, Date.now());
    const wait = busy ? { disabledReason: t('busy') } : {};
    return {
      id: p.id,
      title: p.agent ? t('proposal', { agent: p.agent }) : t('proposalAny'),
      // Its status, as "Proposed runs" shows a proposal: held or not, it still waits.
      status: expired ? { tone: 'neutral', label: tl('p.expired') } : { tone: 'warn', label: tl('p.pending') },
      ...(expired ? { meta: [t('proposalExpired')] as const } : {}),
      // The prompt keeps its line breaks and spacing (pre-wrap), as the thread's prose did.
      ...(p.prompt ? { details: [{ label: t('prompt'), value: <Bidi className={s.prompt}>{p.prompt}</Bidi>, wide: true }] } : {}),
      ...(expired || row.running
        ? {}
        : {
            actions: {
              inline: [
                { id: `approve-${p.id}`, label: t('a.approve'), opens: 'dialog' as const, onPress: () => open('approve', p.id), ...wait },
                { id: `deny-${p.id}`, label: t('a.deny'), onPress: () => deny(p.id), ...wait },
              ] as const,
            },
          }),
    };
  };
  const head: TodoHeadAction | null = closed ? null : row.running ? { action: 'cancelRun', busy, open: () => open('cancelRun') } : { action: 'run', busy, open: () => open('run') };
  const ctl: TodoCtl = { row, store, closed, pending, changed: c.changed && !c.ask, proposalItem, dialog, reading: c.reading, unreadable: c.unreadable };
  return { head, ctl, waiting: new Set(pending.map((p) => p.id)) };
}

/** What the hook hands its body: the TODO, its kept action, its waiting runs as rows and its confirms. */
export interface TodoCtl {
  row: TodoRow;
  store: ActionStore;
  closed: boolean;
  pending: readonly Proposal[];
  /** The confirm closed because the TODO moved; nothing was sent. */
  changed: boolean;
  proposalItem: (p: Proposal) => ItemProps;
  dialog: (a: Action) => { isOpen: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void; confirmDisabled: boolean };
  /** The confirm's binding read runs, or failed: said after its effect. */
  reading: boolean;
  unreadable: boolean;
}

/** The actions under the header: the closed or claimed line, the runs waiting for you, the outcome and the confirms. */
export function TodoActions({ ctl }: { ctl: TodoCtl }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(useStrings(aiStrings));
  const { row, closed, pending } = ctl;
  const body = (effect: string) => {
    const note = ctl.unreadable ? t('confirm.unreadable') : ctl.reading ? t('confirm.reading') : '';
    return note ? `${effect} ${note}` : effect;
  };
  return (
    <Stack gap={3}>
      {closed ? (
        <Band tone="neutral" size="table" /* noDetails: a state read from the TODO; nothing was refused */>{t('closed')}</Band>
      ) : (
        row.running && (
          <Band tone="neutral" size="table" /* noDetails: a state read from the TODO; nothing was refused */>
            {t('claimed')} {t('claimed.note')} <FaqLink item={byId.autoRun}>{t('more.run')}</FaqLink>
          </Band>
        )
      )}
      {pending.length > 0 && (
        // The waiting runs are named by the list, not a SubSection (that would be an h2 beside the TODO's own title, as
        // DetailBody sets no heading level); Thread's "Proposed runs" section lists the other proposals under its own
        // heading.
        <Stack gap={2}>
          {/* A held TODO is read only: its proposals wait, neither approved nor denied from here. */}
          {row.running && (
            <Band tone="neutral" size="table" /* noDetails: a state read from the TODO; nothing was refused */>
              {t('held.proposals')} <FaqLink item={byId.autoRun}>{t('more.run')}</FaqLink>
            </Band>
          )}
          <ItemList label={t('proposals')} items={pending.map((p) => ctl.proposalItem(p))} />
        </Stack>
      )}
      {ctl.changed && (
        <Band tone="warn" size="table" /* noDetails: the confirm closed because the TODO moved; nothing was sent */>
          {t('changed')} <FaqLink item={byId.autoNotSent}>{t('more.notSent')}</FaqLink>
        </Band>
      )}
      <ActionOutcome store={ctl.store} />
      <ConfirmDialog {...ctl.dialog('run')} overlayId="ai-todos-run" title={t('run.title')} body={body(t('run.effect'))} confirmLabel={t('run.confirm')}
        faq={{ item: byId.autoRun, label: t('more.run') }} />
      <ConfirmDialog {...ctl.dialog('approve')} overlayId="ai-todos-approve" title={t('approve.title')} body={body(t('approve.effect'))} confirmLabel={t('approve.confirm')}
        faq={{ item: byId.autoRun, label: t('more.run') }} />
      <ConfirmDialog {...ctl.dialog('cancelRun')} overlayId="ai-todos-cancel-run" title={t('cancel.title')} tone="danger" body={body(t('cancel.effect'))} confirmLabel={t('cancel.confirm')}
        faq={{ item: byId.autoCancel, label: t('more.cancel') }} />
    </Stack>
  );
}

/** Where a TODO's row went away (archived or deleted elsewhere): its action, while one is kept, with Check again and
 *  Stop tracking. Nothing when none is. */
export function HeldTodoAction({ todoKey }: { todoKey: string }) {
  const store = useHeld<ActionStore>(`todo\n${todoKey}`);
  return store ? <ActionOutcome store={store} /> : null;
}
