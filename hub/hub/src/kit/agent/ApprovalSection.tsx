// ApprovalSection: Details → Session's approvals. The mode (Default or Strict, or set by the
// computer's policy and shown read-only) and Auto-approve (YOLO).
//   - The mode changes only while the chat is idle: while it works or waits for a person, or while another change of
//     the tab is unsettled, the choice is disabled with the reason. A change the agent refuses as busy (409
//     session_busy) changed nothing and says so; nothing is resent.
//   - Strict refuses every automatic answer, so Auto-approve is not offered under it. Under a lock it shows, disabled,
//     with the one sentence its 409s map to.
//   - Turning Auto-approve on asks first, in a red confirm naming the computer; turning it off does not. The confirm
//     belongs to the conversation that opened it: another conversation, or Auto-approve no longer on offer, closes it,
//     and a confirm from another conversation sends nothing.
//   - Every change is sent once and is "Saved" only when the approvals read back show it; a lost answer reads "may have
//     gone through" with Check again (one read), never a resend (C9). That outcome and its Check again show whatever
//     hides the control it came from (Strict hiding Auto-approve, approvals that cannot be read): recovery never hides.
// The data is the caller's useApproval, so the tab's hooks share one lock. It sits inside the caller's "This chat"
// section (no section of its own: approvals change only while the chat is idle, as the rest there).
import { useEffect, useState } from 'react';
import { Switch } from '../forms/fields';
import type { FaqItem } from '../layouts/Faq';
import { Why } from '../layouts/Why';
import { RadioGroup } from '../forms/more';
import { Outcome } from '../forms/Outcome';
import { ConfirmDialog } from '../overlays/Overlays';
import { ErrorState } from '../states/States';
import { useStrings } from '../strings';
import type { ApprovalChangeState, ApprovalData } from './useApproval';
import strings from './ApprovalSection.strings.en.json';
import s from './AgentSettings.module.css';

export interface ApprovalSectionProps {
  data: ApprovalData;
  /** The computer's name as the header shows it (the Auto-approve confirm names it). */
  computer: string;
  /** The chat works or waits for a person now (null: not known yet). */
  busy: boolean | null;
  /** Another part of the tab sends, reads or holds an unsettled change. */
  waiting: boolean;
  /** Why Auto-approve cannot be changed now although the approvals read allows it (the chat is asleep on the computer: the agent
   *  changes it on a running chat only). Absent: nothing more holds it. */
  yoloWhy?: string;
  /** The page FAQ's question about Strict (the whole list of what asks and what is off): the Strict Why ends with it.
   *  Absent: no Why (the kit cannot read a page's FAQ, and a Why always ends with its link). */
  strictFaq?: FaqItem;
}

type T = (k: string, v?: Record<string, string>) => string;

function changeOutcome(t: T, c: ApprovalChangeState, field: 'mode' | 'yolo', check: () => Promise<boolean>, other: boolean) {
  if (!c || c.change.field !== field || c.kind === 'running') return null;
  if (c.kind === 'busy') return <Outcome outcome={{ kind: 'not_sent', code: 'session_busy' }} detail={t('ap.busy')} />;
  if (c.kind === 'conflict') return <Outcome outcome={{ kind: 'not_sent', code: 'precondition_failed' }} detail={t('ap.conflict')} />;
  if (c.kind === 'refused') {
    const words = field === 'yolo' ? t('ap.yoloRefused') : c.code === 'approval_policy_unsatisfiable' ? t('ap.unsatisfiable') : t('ap.policyLocked');
    return <Outcome outcome={{ kind: 'not_sent', code: c.code ?? 'approval_policy_locked' }} detail={words} />;
  }
  return <Outcome outcome={{ kind: c.kind, code: c.code }} doneText={t('ap.saved')} onCheck={check} checking={other || undefined} />;
}

export function ApprovalSection(p: ApprovalSectionProps) {
  const t = useStrings(strings) as T;
  // The confirm, by the target that opened it (null: closed).
  const [askFor, setAskFor] = useState<string | null>(null);
  const d = p.data;
  const a = d.approval;

  const pending = d.change?.kind === 'pending';
  const held = p.waiting || d.running || pending;
  const locked = a?.mode === 'locked';
  const busy = p.busy !== false;
  const modeDisabled = !a || locked || busy || held || a.revision === null;
  // Why the mode can't be chosen now (the lock says it in the group's own words).
  const modeWhy = !a ? null : locked ? t('ap.locked') : p.busy === true ? t('ap.busy') : p.waiting ? t('ap.wait') : a.revision === null ? t('ap.noRevision') : null;
  const modeValue = !a ? undefined : a.strict ? 'always' : 'default';
  const yoloDisabled = !a || locked || held || a.yolo === null || !!p.yoloWhy;
  const other = p.waiting;
  // On offer for this conversation (a read or another change running only holds the confirm's button).
  const offered = !!a && !a.strict && !locked && a.yolo !== null && !pending;
  const askOn = askFor !== null && askFor === d.key && offered;
  // Another conversation, or Auto-approve no longer on offer (Strict, locked, unknown, an unsettled change): it closes.
  useEffect(() => {
    if (askFor !== null && !askOn) setAskFor(null);
  }, [askFor, askOn]);

  const modeOut = changeOutcome(t, d.change, 'mode', d.check, other);
  const yoloOut = changeOutcome(t, d.change, 'yolo', d.check, other);

  if (!a && d.phase === 'failed') {
    return (
      <div className={s.field} role="group" aria-label={t('ap.title')}>
        <ErrorState size="sm" title={t('ap.readFailed')} error={d.error === true ? undefined : d.error} onRetry={d.retry} />
        {modeOut}
        {yoloOut}
      </div>
    );
  }

  return (
    <div className={s.stack} role="group" aria-label={t('ap.title')}>
        <div className={s.field}>
          <RadioGroup<'default' | 'always'>
            label={t('ap.mode')}
            options={[
              { value: 'default', label: t('ap.default'), description: t('ap.defaultDesc') },
              { value: 'always', label: t('ap.strict'), description: t('ap.strictShort') },
            ]}
            value={modeValue}
            onChange={(v) => v !== modeValue && d.save({ field: 'mode', value: v })}
            isDisabled={modeDisabled}
            {...(modeWhy ? { description: modeWhy } : {})}
          />
          {!a && d.phase !== 'failed' ? <p className={s.help}>{t('ap.unknown')}</p> : null}
          {modeOut}
          {/* Strict is one sentence on its option; what never asks is this Why, and the whole list is the page's question. */}
          {p.strictFaq && (
            <Why question={t('ap.why.q')} faq={{ item: p.strictFaq, label: t('ap.why.more') }}>
              {t('ap.why.a')}
            </Why>
          )}
        </div>

        {a && !a.strict ? (
          <div className={s.field}>
            <Switch
              label={t('ap.yolo')}
              description={locked ? t('ap.yoloRefused') : p.yoloWhy ? p.yoloWhy : a.yolo === null ? t('ap.unknown') : a.yolo ? t('ap.yoloOn') : t('ap.yoloOff')}
              isSelected={a.yolo === true}
              onChange={(on) => (on ? setAskFor(d.key) : d.save({ field: 'yolo', value: false }))}
              isDisabled={yoloDisabled}
            />
            {yoloOut}
          </div>
        ) : yoloOut ? (
          <div className={s.field}>{yoloOut}</div>
        ) : null}

      <ConfirmDialog
        isOpen={askOn}
        onOpenChange={(open) => !open && setAskFor(null)}
        tone="danger"
        title={t('ap.yoloConfirmTitle')}
        body={t('ap.yoloConfirmBody', { computer: p.computer })}
        confirmLabel={t('ap.yoloConfirmGo')}
        confirmDisabled={!askOn || yoloDisabled}
        onConfirm={() => {
          const ok = askOn && !yoloDisabled;
          setAskFor(null);
          if (ok) d.save({ field: 'yolo', value: true });
        }}
      />
    </div>
  );
}
