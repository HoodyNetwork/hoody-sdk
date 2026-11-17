// The AI tab's questions: one list for the whole tab. The Models screen shows it as its "Questions"
// section; the other screens keep one short line and a FaqLink, which shows the answer as a peek there. Each screen
// builds it from the tab's own strings (pageFaq(useStrings(strings))).
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;
type Id = 'defaultModel' | 'keyKept' | 'claudeCode' | 'agents' | 'skillTrust' | 'instructionsMemory' | 'autoKinds' | 'workflowRuns' | 'rulesHooks' | 'connections' | 'settle'
  | 'autoRun' | 'autoCancel' | 'autoUnsure' | 'autoNotSent' | 'loopChange' | 'forkUnconfirmed' | 'strictApprovals';

export function pageFaq(t: T): { items: FaqItem[]; byId: Record<Id, FaqItem> } {
  const items = [
    { id: 'defaultModel', q: t('faq.defaultModel.q'), a: t('faq.defaultModel.a') },
    { id: 'keyKept', q: t('faq.keyKept.q'), a: t('faq.keyKept.a') },
    { id: 'claudeCode', q: t('faq.claudeCode.q'), a: t('faq.claudeCode.a') },
    { id: 'agents', q: t('faq.agents.q'), a: t('faq.agents.a') },
    { id: 'skillTrust', q: t('faq.skillTrust.q'), a: t('faq.skillTrust.a') },
    { id: 'instructionsMemory', q: t('faq.instructionsMemory.q'), a: t('faq.instructionsMemory.a') },
    { id: 'autoKinds', q: t('faq.autoKinds.q'), a: t('faq.autoKinds.a') },
    { id: 'workflowRuns', q: t('faq.workflowRuns.q'), a: t('faq.workflowRuns.a') },
    { id: 'rulesHooks', q: t('faq.rulesHooks.q'), a: t('faq.rulesHooks.a') },
    { id: 'connections', q: t('faq.connections.q'), a: t('faq.connections.a') },
    { id: 'settle', q: t('faq.settle.q'), a: t('faq.settle.a') },
    { id: 'autoRun', q: t('faq.autoRun.q'), a: t('faq.autoRun.a') },
    { id: 'autoCancel', q: t('faq.autoCancel.q'), a: t('faq.autoCancel.a') },
    { id: 'autoUnsure', q: t('faq.autoUnsure.q'), a: t('faq.autoUnsure.a') },
    { id: 'autoNotSent', q: t('faq.autoNotSent.q'), a: t('faq.autoNotSent.a') },
    { id: 'loopChange', q: t('faq.loopChange.q'), a: t('faq.loopChange.a') },
    { id: 'forkUnconfirmed', q: t('faq.forkUnconfirmed.q'), a: t('faq.forkUnconfirmed.a') },
    { id: 'strictApprovals', q: t('faq.strictApprovals.q'), a: t('faq.strictApprovals.a') },
  ];
  return {
    items,
    byId: { defaultModel: items[0]!, keyKept: items[1]!, claudeCode: items[2]!, agents: items[3]!, skillTrust: items[4]!, instructionsMemory: items[5]!, autoKinds: items[6]!, workflowRuns: items[7]!, rulesHooks: items[8]!, connections: items[9]!, settle: items[10]!,
      autoRun: items[11]!, autoCancel: items[12]!, autoUnsure: items[13]!, autoNotSent: items[14]!, loopChange: items[15]!, forkUnconfirmed: items[16]!, strictApprovals: items[17]!,
    },
  };
}
