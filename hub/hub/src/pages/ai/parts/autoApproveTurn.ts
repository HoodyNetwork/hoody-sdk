// The Send menu's "Auto-approve this reply". One send whose own approvals are answered yes
// for that reply only (`?policy=auto_approve` on its turn); helpers still ask. Strict answers nothing automatically, so under
// it the item is not offered; a lock, an unknown mode, a closed chat, a running turn or a message Send cannot take yet shows it
// disabled with the reason (a disabled menu item always says why). The
// item never sends by itself: it calls the composer's send with `autoApproveTurn`, which the source checks again.
import { can, useStrings, type CapFacts, type MenuAction } from '@kit';
import strings from './Conversation.strings.en.json';

const WHY = new Set(['closed', 'locked_by_policy', 'approval_unknown']);

/**
 * The menu item, or null under Strict. `canSend`: Send itself could take the draft now. `busy`: a turn runs or a gate waits,
 * so this message would be a follow-up, which cannot carry the policy.
 */
export function useAutoApproveTurn(facts: CapFacts, canSend: boolean, busy: boolean, send: () => void): MenuAction | null {
  const t = useStrings(strings) as (k: string) => string;
  // Strict hides it whatever else is missing (its approver lease, say): it is never on offer there.
  if (facts.approval === 'always') return null;
  const cap = can('autoApproveTurn', facts);
  const why = !cap.ok ? t(WHY.has(cap.reason) ? `conv.aat.why.${cap.reason}` : 'conv.aat.why.other') : busy ? t('conv.aat.why.later') : !canSend ? t('conv.aat.why.send') : undefined;
  const ok = cap.ok && !busy && canSend;
  return {
    id: 'auto-approve-turn',
    label: t('conv.aat.label'),
    description: t('conv.aat.desc'),
    isDisabled: !ok,
    ...(why ? { disabledReason: why } : {}),
    onAction: () => { if (ok) send(); },
  };
}
