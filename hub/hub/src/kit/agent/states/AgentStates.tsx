// The AI tab's cross-cutting states: one sentence and the row's actions, nothing else.
// Presentational only: each state names the callbacks its actions need, and the caller wires them to its own reads and
// writes. A page or pane state (first use, sign-in, no model) is an EmptyState; every other state is a Band.
//
// The states drawn by their own component are not repeated here: paused (PauseBand) and stop all's result
// (StopAllResult); a question, a helper's approval and a vanished gate's unknown decision (GateCard); the memory
// states, the cold host included (the Knowledge page's RealmBand).
//
// An unknown outcome only ever offers a read ("Check again") or Stop tracking: no state here sends anything again.
// "Send it again" exists only for a send proven not sent, and the caller sends it under a new key.
import type { ReactNode } from 'react';
import { Button } from '../../controls/Button';
import { TextButton } from '../../controls/Link';
import { Band, type BandProps } from '../../states/Band';
import { EmptyState } from '../../states/States';
import { formatCompact } from '../../format';
import { LOCALE, useStrings } from '../../strings';
import strings from './AgentStates.strings.en.json';

type Act = () => void;

/** Every state, by kind, with the callbacks its actions need. */
export type AgentStateView =
  | { kind: 'firstUse'; onNewChat: Act }
  | { kind: 'stopped'; computer: string; onStart: Act; onOpenComputers: Act; starting?: boolean }
  | { kind: 'starting'; computer: string }
  | { kind: 'unreachable'; computer: string; onRetry: Act; onOpenComputer: Act; retrying?: boolean }
  /** `until`: when the last event arrived (ms). */
  | { kind: 'reconnecting'; until: number; onRetry: Act }
  | { kind: 'keptWaiting'; onShow: Act }
  | { kind: 'sendUnknown'; onCheck: Act; onDismiss: Act; checking?: boolean }
  /** `onSendAgain` only while the text is still in this page: the caller sends it under a new key. */
  | { kind: 'notSent'; onSendAgain?: Act }
  | { kind: 'newChatUnknown'; computer: string; onCheck: Act; onDismiss: Act; checking?: boolean }
  | { kind: 'noChatMade' }
  | { kind: 'workflowPaused'; computer: string; onResume: Act }
  /** `fetchedAt`: when the local view was read (ms). One way back: Check on GitHub where the branch check exists,
   *  else the branch's page. */
  | { kind: 'githubPartly'; fetchedAt: number; recover: { checkGitHub: Act; openBranch?: never } | { openBranch: Act; checkGitHub?: never } }
  | { kind: 'githubUnknown'; onCheckHistory: Act; onCheckGitHub: Act }
  | { kind: 'issueMaybe'; onCheckIssues: Act }
  /** Token counts before and after the summary. */
  | { kind: 'compacted'; before: number; after: number; onOpenSummary: Act }
  | { kind: 'signIn'; computer: string; onSignIn: Act }
  | { kind: 'noModel'; onSetUp: Act }
  | { kind: 'streamBudget'; onResumeLive: Act }
  | { kind: 'closed'; onReopen: Act }
  | { kind: 'conflict'; computer: string; onCompare: Act; onReload: Act }
  /** `canTakeOver`: the other window's hold has run out. */
  | { kind: 'heldElsewhere'; canTakeOver: boolean; onTakeOver: Act }
  /** A typed refusal: the agent's words by code (the kit's error words), with the code's own actions. */
  | { kind: 'refused'; error: unknown; actions?: ReactNode };

export interface AgentStateProps {
  state: AgentStateView;
  /** A Band's size: `page` above the content, `table` inside a panel or above a list. */
  size?: BandProps['size'];
  className?: string;
}

const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortTime = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function AgentState({ state: v, size = 'table', className }: AgentStateProps) {
  const t = useStrings(strings);
  const band = (tone: BandProps['tone'], text: string, actions?: ReactNode) => (
    <Band tone={tone} size={size} actions={actions} className={className}>
      {text}
    </Band>
  );
  // `name`: the full words, when the chip shows only its verb (a chip's label never grows with a computer name).
  const act = (label: string, onPress: Act, o: { primary?: boolean; busy?: boolean; disabled?: boolean; name?: string } = {}) =>
    o.primary ? (
      <Button size="sm" variant="secondary" busy={o.busy} isDisabled={o.busy || o.disabled} onPress={onPress} aria-label={o.name}>
        {label}
      </Button>
    ) : (
      <TextButton isDisabled={o.busy || o.disabled} onPress={onPress} aria-label={o.name}>
        {label}
      </TextButton>
    );
  switch (v.kind) {
    case 'firstUse':
      return <EmptyState icon="sparkle" title={t('st.firstUse')} action={<Button onPress={v.onNewChat}>{t('st.newChat')}</Button>} className={className} />;
    case 'signIn':
      return <EmptyState icon="lock" title={t('st.signIn', { computer: v.computer })} action={<Button onPress={v.onSignIn}>{t('st.signInAction')}</Button>} className={className} />;
    case 'noModel':
      return <EmptyState icon="sparkle" title={t('st.noModel')} action={<Button onPress={v.onSetUp}>{t('st.setUpModels')}</Button>} className={className} />;
    case 'stopped':
      return band('warn', t('st.stopped', { computer: v.computer }), (
        <>
          {act(t('st.start'), v.onStart, { primary: true, busy: v.starting, name: t('st.startName', { computer: v.computer }) })}
          {act(t('st.openComputers'), v.onOpenComputers)}
        </>
      ));
    case 'starting':
      return band('neutral', t('st.starting', { computer: v.computer }));
    case 'unreachable':
      return band('danger', t('st.unreachable', { computer: v.computer }), (
        <>
          {act(t('st.tryAgain'), v.onRetry, { primary: true, busy: v.retrying })}
          {act(t('st.openComputer'), v.onOpenComputer, { name: t('st.openComputerName', { computer: v.computer }) })}
        </>
      ));
    case 'reconnecting':
      return band('warn', t('st.reconnecting', { time: clock.format(v.until) }), act(t('st.retryNow'), v.onRetry));
    case 'keptWaiting':
      return band('neutral', t('st.keptWaiting'), act(t('st.show'), v.onShow));
    case 'sendUnknown':
      return band('warn', t('st.sendUnknown'), (
        <>
          {act(t('st.checkAgain'), v.onCheck, { primary: true, busy: v.checking })}
          {act(t('st.dismiss'), v.onDismiss)}
        </>
      ));
    case 'notSent':
      return v.onSendAgain ? band('warn', t('st.notSentText'), act(t('st.sendAgain'), v.onSendAgain, { primary: true })) : band('warn', t('st.notSent'));
    case 'newChatUnknown':
      return band('warn', t('st.newChatUnknown', { computer: v.computer }), (
        <>
          {act(t('st.checkAgain'), v.onCheck, { primary: true, busy: v.checking })}
          {act(t('st.dismiss'), v.onDismiss)}
        </>
      ));
    case 'noChatMade':
      return band('warn', t('st.noChatMade'));
    case 'workflowPaused':
      return band('warn', t('st.workflowPaused', { computer: v.computer }), act(t('st.resume'), v.onResume, { primary: true }));
    case 'githubPartly':
      return band(
        'warn',
        t('st.githubPartly', { time: shortTime.format(v.fetchedAt) }),
        v.recover.checkGitHub ? act(t('st.checkGitHub'), v.recover.checkGitHub, { primary: true }) : act(t('st.openBranch'), v.recover.openBranch),
      );
    case 'githubUnknown':
      return band('warn', t('st.githubUnknown'), (
        <>
          {act(t('st.checkHistory'), v.onCheckHistory)}
          {act(t('st.checkGitHub'), v.onCheckGitHub)}
        </>
      ));
    case 'issueMaybe':
      return band('warn', t('st.issueMaybe'), act(t('st.checkIssues'), v.onCheckIssues, { primary: true }));
    case 'compacted':
      return band('neutral', t('st.compacted', { before: formatCompact(v.before), after: formatCompact(v.after) }), act(t('st.openSummary'), v.onOpenSummary));
    case 'streamBudget':
      return band('neutral', t('st.streamBudget'), act(t('st.resumeLive'), v.onResumeLive));
    case 'closed':
      return band('neutral', t('st.closed'), act(t('st.reopen'), v.onReopen, { primary: true }));
    case 'conflict':
      return band('warn', t('st.conflict', { computer: v.computer }), (
        <>
          {act(t('st.compare'), v.onCompare)}
          {act(t('st.reload'), v.onReload)}
        </>
      ));
    case 'heldElsewhere':
      return band('neutral', v.canTakeOver ? t('st.heldElsewhere') : t('st.heldUntil'), act(t('st.takeOver'), v.onTakeOver, { disabled: !v.canTakeOver }));
    case 'refused':
      return <Band tone="danger" size={size} error={v.error} actions={v.actions} className={className} />;
  }
}
