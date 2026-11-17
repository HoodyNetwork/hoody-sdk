// ApprovalMode: the chat's approval mode where the person types. A chip in the composer's tools row names the mode the chat
// is in now and opens a menu of the three states the agent has, each with one sentence on what it covers:
//   Ask every time   (Strict:        mode `always`)
//   Ask when needed  (Default:       mode `default`, auto-approve off)
//   Allow everything (Auto-approve:  mode `default`, auto-approve on)
// It adds no mode and no rule of its own. What it shows is the caller's useApproval read, never a wish. The mode is changed
// through useApproval (as Details → Session does). Allow everything is switched by the host (`setYolo`: the active source's
// setAutoApprove, the write the ask dock's switch uses), because the host's send guard puts back an On it did not make itself
// (ask/engine.ts turnOut); with no host write it is not offered. Both go through the conversation's one shared attempt: a
// change is sent once, counts only when the approvals read back show it, and a lost answer is "may have gone through" with
// Check again, never a resend (C9).
//   - Widening is asked first. Allow everything opens a danger confirm that names the computer and what it covers; the confirm
//     belongs to the conversation that opened it (another conversation, or the choice no longer on offer, closes it and
//     sends nothing). Narrowing (back to asking) is one press.
//   - One change at a time, never a chain: from Ask every time, Allow everything is not offered (it would take a mode change
//     and then the switch); the menu says to choose Ask when needed first.
//   - The mode itself changes only while the chat is idle (the agent refuses it during a reply), so those two items are
//     disabled then, with the reason. Allow everything can be turned on or off while a reply runs or an approval waits.
//   - A policy set by the computer shows read-only. Approvals that cannot be read show as unknown, never as a mode.
// The approval card's "Allow everything in this chat…" opens the same confirm (`askFor` is the host's state). The chip goes in
// the composer's tools; the confirm (AllowEverythingConfirm) is drawn by the host beside the view, never in a slot.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { ActionMenu } from '../overlays/Menu';
import type { MenuGroup } from '../overlays/Menu.model';
import { ConfirmDialog } from '../overlays/Overlays';
import { useStrings } from '../strings';
import type { ComposerNote } from './Composer';
import type { ApprovalData } from './useApproval';
import strings from './ApprovalMode.strings.en.json';

export type ApprovalModeState = 'always' | 'default' | 'everything' | 'locked' | 'unknown' | 'reading';

/** The one state the chat's approvals are in, from the approvals read (never from a wish or an unsettled change). A change whose
 *  outcome is not known makes the last read no longer sure: unknown until a read shows it. */
export function approvalModeOf(d: Pick<ApprovalData, 'approval' | 'phase'> & { change?: ApprovalData['change'] }): ApprovalModeState {
  if (d.change?.kind === 'pending') return 'unknown';
  const a = d.approval;
  if (!a) return d.phase === 'failed' ? 'unknown' : 'reading';
  if (a.mode === 'locked') return 'locked';
  if (a.strict) return 'always';
  if (a.yolo === null) return 'unknown';
  return a.yolo ? 'everything' : 'default';
}

export interface AllowEverythingOpts {
  /** The host's switch of Allow everything, sent once: false when it sent nothing. Null: this surface cannot switch it. */
  setYolo: ((want: boolean) => boolean) | null;
  /** Another part of the page sends, reads or holds an unsettled change of this chat. */
  waiting?: boolean;
  /** Why auto-approve cannot be changed now although the read allows it (the chat is asleep on the computer). */
  yoloWhy?: string;
}

/** Whether Allow everything can be turned on for this conversation now: read, not Strict, not locked, off, nothing unsettled.
 *  A read of the approvals running now does not take the offer away (the last read stands); it only holds the confirm's button. */
export function allowEverythingOffered(d: ApprovalData, o: AllowEverythingOpts): boolean {
  return !!o.setYolo && approvalModeOf(d) === 'default' && d.change?.kind !== 'pending' && d.change?.kind !== 'running' && !o.waiting && !o.yoloWhy;
}

export interface AllowEverythingAsk extends AllowEverythingOpts {
  data: ApprovalData;
  /** The confirm, by the conversation (`data.key`) that opened it; null: closed. The host owns it, so the approval card opens the same one. */
  askFor: string | null;
  setAskFor: (key: string | null) => void;
  /** A switch of Allow everything was pressed (useApprovalModeNote's `sent`); `went`: the host sent it. Its outcome is said over the composer. */
  onSent: (want: boolean, went: boolean) => void;
}

export interface ApprovalModeProps extends Omit<AllowEverythingAsk, 'askFor'> {
  /** The chat works or waits for a person now (null: not known yet): the mode itself cannot change then. */
  busy: boolean | null;
}

type T = (k: string, v?: Record<string, string>) => string;
const STATE_KEY: Record<ApprovalModeState, string> = {
  always: 'am.state.always', default: 'am.state.default', everything: 'am.state.everything', locked: 'am.state.locked', unknown: 'am.state.unknown', reading: 'am.state.reading',
};

export function ApprovalMode(p: ApprovalModeProps) {
  const t = useStrings(strings) as T;
  const d = p.data;
  const state = approvalModeOf(d);
  const pendingNow = d.change?.kind === 'pending';
  const held = !!p.waiting || d.running || pendingNow;
  const idle = p.busy === false;
  const canRead = state === 'always' || state === 'default' || state === 'everything';
  const offered = allowEverythingOffered(d, p);
  const { setAskFor } = p;

  // Why a mode item cannot be chosen now; the agent refuses a mode change during a reply, and one change runs at a time.
  const modeWhy = state === 'locked' ? t('am.why.locked') : !canRead ? (pendingNow ? t('am.why.wait') : t('am.why.unknown')) : held ? t('am.why.wait') : d.approval?.revision === null ? t('am.why.noRevision') : !idle ? t('am.why.busy') : undefined;
  const allWhy = !p.setYolo ? t('am.why.notHere') : state === 'locked' ? t('am.why.locked') : !canRead ? (pendingNow ? t('am.why.wait') : t('am.why.unknown')) : state === 'always' ? t('am.why.strictFirst') : held ? t('am.why.wait') : p.yoloWhy ? p.yoloWhy : undefined;
  // Leaving Allow everything for Ask when needed is the switch going off: allowed during a reply, as turning it on is.
  const offWhy = state === 'everything' ? (!p.setYolo ? t('am.why.notHere') : held ? t('am.why.wait') : p.yoloWhy ? p.yoloWhy : undefined) : modeWhy;
  const switchTo = (want: boolean) => p.onSent(want, !!p.setYolo?.(want));
  const current = canRead ? state : null;
  const group: MenuGroup = {
    id: 'approval-mode',
    select: 'one',
    current,
    label: t('am.menu'),
    items: [
      {
        id: 'always', label: t('am.opt.always'), description: t('am.opt.alwaysDesc'),
        isDisabled: current !== 'always' && !!modeWhy, ...(current !== 'always' && modeWhy ? { disabledReason: modeWhy } : {}),
        onAction: () => { if (current !== 'always' && !modeWhy) d.save({ field: 'mode', value: 'always' }); },
      },
      {
        id: 'default', label: t('am.opt.default'), description: t('am.opt.defaultDesc'),
        isDisabled: current !== 'default' && !!offWhy, ...(current !== 'default' && offWhy ? { disabledReason: offWhy } : {}),
        onAction: () => {
          if (current === 'default' || offWhy) return;
          if (current === 'everything') switchTo(false);
          else d.save({ field: 'mode', value: 'default' });
        },
      },
      {
        id: 'everything', label: t('am.opt.everything'), description: t('am.opt.everythingDesc'), opens: current !== 'everything',
        isDisabled: current !== 'everything' && !!allWhy, ...(current !== 'everything' && allWhy ? { disabledReason: allWhy } : {}),
        onAction: () => { if (current !== 'everything' && !allWhy && offered) setAskFor(d.key); },
      },
    ],
  };
  const words = t(STATE_KEY[state]);
  // One quiet control: the chip opens the menu, and Ask when needed there switches Allow everything off.
  return (
    <ActionMenu
      label={t('am.menu')}
      placement="top start"
      items={[group]}
      trigger={
        <Button variant="ghost" size="sm" icon={state === 'everything' ? 'warn' : 'lock'} literal shrink busy={d.change?.kind === 'running'} aria-label={t('am.chip', { mode: words })} data-approval-mode={state}>
          {words}
        </Button>
      }
    />
  );
}

/** The confirm before Allow everything, for the conversation that asked (`askFor`). One press sends one switch. */
export function AllowEverythingConfirm(p: AllowEverythingAsk & { computer: string }) {
  const t = useStrings(strings) as T;
  const d = p.data;
  const askOn = p.askFor !== null && p.askFor === d.key && allowEverythingOffered(d, p);
  // Another conversation, or Allow everything no longer on offer (Strict, locked, unknown, already on, an unsettled change): it closes.
  const { askFor, setAskFor } = p;
  useEffect(() => {
    if (askFor !== null && !askOn) setAskFor(null);
  }, [askFor, askOn, setAskFor]);
  return (
    <ConfirmDialog
      overlayId="approval-allow-everything"
      isOpen={askOn}
      onOpenChange={(open) => { if (!open) setAskFor(null); }}
      tone="danger"
      title={t('am.confirmTitle')}
      body={t('am.confirmBody', { computer: p.computer })}
      consequences={[t('am.confirm.waiting'), t('am.confirm.keeps'), t('am.confirm.until', { computer: p.computer })]}
      confirmLabel={t('am.confirmGo')}
      confirmDisabled={!askOn || d.running}
      onConfirm={() => {
        const ok = askOn && !d.running;
        setAskFor(null);
        if (ok) p.onSent(true, !!p.setYolo?.(true));
      }}
    />
  );
}

/**
 * What a change from the chip (or the card) came to, as a note over the composer, and `sent` for a switch of Allow everything
 * that went out. The host's write settles the shared attempt; useApproval then reads the approvals again, and this says what
 * THEY show: on (or off) as asked, or that nothing changed. `settled`: any change of this chat's approvals ended (the host reads its
 * own mode again there).
 */
export function useApprovalModeNote(d: ApprovalData, settled?: () => void): { note: ComposerNote | null; sent: (want: boolean, went: boolean) => void } {
  const t = useStrings(strings) as T;
  // The switch that went out: `ops` / `reads` are the hook's counts when its attempt ended, so only a read finished after
  // that is judged, and only a read that came back (`reads` moved) can say what the mode is.
  const [asked, setAsked] = useState<{ key: string; want: boolean; ops: number | null; reads: number } | null>(null);
  // ok null: no fresh read has shown the mode since (a failed read, an answer that may predate the switch). `mode`: the
  // mode the judging read showed; the outcome is said only while the approvals still show it.
  // unsent: the host held the switch back (nothing went out); said without any claim about the mode.
  const [result, setResult] = useState<{ key: string; want: boolean; ok: boolean | null; mode: ApprovalModeState; unsent?: true } | null>(null);
  const c = d.change;
  const out = c?.kind === 'running' || c?.kind === 'pending';
  const was = useRef(out);
  const onSettled = useRef(settled);
  onSettled.current = settled;
  useEffect(() => {
    const began = !was.current && out;
    const ended = was.current && !out;
    was.current = out;
    // Another change began (from Details, or another surface) after this switch went out and ended: its outcome no longer
    // stands, and a read after it is not judged as this switch's (a switch still out has ops null: that is this one).
    if (began && (!asked || asked.ops !== null)) { setResult(null); setAsked(null); }
    if (!ended) return;
    onSettled.current?.();
    if (asked && asked.key === d.key && asked.ops === null) setAsked({ ...asked, ops: d.ops, reads: d.reads });
  }, [out, asked, d.key, d.ops, d.reads]);
  useEffect(() => {
    if (!asked) return;
    if (asked.key !== d.key) { setAsked(null); return; }
    if (asked.ops === null || d.ops <= asked.ops || d.running || d.phase === 'loading') return;
    const mode = approvalModeOf(d);
    if (d.reads > asked.reads && d.phase === 'done') {
      // "Still asks first" / "still on" only when the read shows it; a locked or unreadable mode says neither.
      const ok = mode === (asked.want ? 'everything' : 'default') ? true : (asked.want ? mode === 'default' || mode === 'always' : mode === 'everything') ? false : null;
      setResult({ key: asked.key, want: asked.want, ok, mode });
      // Neither: keep watching, so the next read that comes back judges again.
      setAsked(ok === null ? { ...asked, ops: d.ops, reads: d.reads } : null);
      return;
    }
    // Nothing fresh came back: the mode is not known. Said as "may have gone through"; the next read that comes back judges.
    setResult({ key: asked.key, want: asked.want, ok: null, mode });
    setAsked({ ...asked, ops: d.ops });
  }, [asked, d]);
  // Not sent (the host held it back): nothing changed, said at once.
  const sent = (want: boolean, went: boolean) => {
    setResult(went ? null : { key: d.key, want, ok: false, mode: approvalModeOf(d), unsent: true });
    setAsked(went ? { key: d.key, want, ops: null, reads: d.reads } : null);
  };
  const note = (): ComposerNote | null => {
    if (c?.kind === 'pending') return { key: 'approval-mode', text: t('am.maybe'), warn: true, status: true, end: <TextButton isDisabled={d.running} onPress={() => void d.check()}>{t('am.checkAgain')}</TextButton> };
    if (c?.kind === 'running') return null;
    if (result && result.key === d.key && result.ok === null) return { key: 'approval-mode', text: t('am.maybe'), warn: true, status: true, end: <TextButton isDisabled={d.running} onPress={() => { setAsked({ key: d.key, want: result.want, ops: d.ops, reads: d.reads }); d.retry(); }}>{t('am.checkAgain')}</TextButton> };
    if (asked) return null;
    if (result && result.key === d.key && result.mode === approvalModeOf(d)) {
      if (result.unsent) return { key: 'approval-mode', text: t(result.want ? 'am.unsentOn' : 'am.unsentOff'), warn: true, status: true };
      return result.ok
        ? { key: 'approval-mode', text: t(result.want ? 'am.done.everything' : 'am.done.asks'), status: true }
        : { key: 'approval-mode', text: t(result.want ? 'am.failedOn' : 'am.failedOff'), warn: true, status: true };
    }
    if (!c) return null;
    // Said only while the current read is that mode (Ask when needed under Allow everything asks nothing).
    if (c.kind === 'done') return c.change.field === 'mode' && approvalModeOf(d) === c.change.value ? { key: 'approval-mode', text: t(c.change.value === 'always' ? 'am.done.always' : 'am.done.default'), status: true } : null;
    const text = c.kind === 'busy' ? t('am.why.busy') : c.kind === 'conflict' ? t('am.conflict') : c.kind === 'refused' ? t('am.refused') : t('am.failed');
    return { key: 'approval-mode', text, warn: true, status: true };
  };
  return { note: note(), sent };
}
