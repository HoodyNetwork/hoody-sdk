// The programs page's questions. The Running tab's list pane lists them as its "Questions" section, and so does the Ports & aliases
// tab under its two tables (the last eight are the ones about ports and aliases). The start-time field, the network fields, the
// sandbox panel and editor, the system-program note and the Ports & aliases tab link to single answers. The decisions stay where the
// person decides: the system-program stop and restart confirms (what stops), the restart and remove consequences of a sandbox, the
// unconfined and missing-sandbox notices, the environment-values note, and the held-change notices and their Stop tracking dialogs.
// An answer is plain text in short blocks (kit Faq): a blank line starts a paragraph, a list or numbered steps.
import type { FaqItem, Translate } from '@kit';
import type strings from './strings.en.json';

type T = Translate<typeof strings>;

export function pageFaq(t: T): {
  items: FaqItem[];
  byId: Record<
    | 'whatIsProgram' | 'systemPrograms' | 'keepOrOnce' | 'startDone' | 'sandboxLimits' | 'sandboxNetwork' | 'sandboxApply' | 'maybeWentThrough'
    | 'whichPorts' | 'hoodyPorts' | 'portOrAlias' | 'makeAlias' | 'aliasStopped' | 'whoCanOpen' | 'ownDomain' | 'httpsPort',
    FaqItem
  >;
} {
  const items = [
    { id: 'whatIsProgram', q: t('faq.whatIsProgram.q'), a: t('faq.whatIsProgram.a') },
    { id: 'systemPrograms', q: t('faq.systemPrograms.q'), a: t('faq.systemPrograms.a') },
    { id: 'keepOrOnce', q: t('faq.keepOrOnce.q'), a: t('faq.keepOrOnce.a') },
    { id: 'startDone', q: t('faq.startDone.q'), a: t('faq.startDone.a') },
    { id: 'sandboxLimits', q: t('faq.sandboxLimits.q'), a: t('faq.sandboxLimits.a') },
    { id: 'sandboxNetwork', q: t('faq.sandboxNetwork.q'), a: t('faq.sandboxNetwork.a') },
    { id: 'sandboxApply', q: t('faq.sandboxApply.q'), a: t('faq.sandboxApply.a') },
    { id: 'maybeWentThrough', q: t('faq.maybeWentThrough.q'), a: t('faq.maybeWentThrough.a') },
    { id: 'whichPorts', q: t('faq.whichPorts.q'), a: t('faq.whichPorts.a') },
    { id: 'hoodyPorts', q: t('faq.hoodyPorts.q'), a: t('faq.hoodyPorts.a') },
    { id: 'portOrAlias', q: t('faq.portOrAlias.q'), a: t('faq.portOrAlias.a') },
    { id: 'makeAlias', q: t('faq.makeAlias.q'), a: t('faq.makeAlias.a') },
    { id: 'aliasStopped', q: t('faq.aliasStopped.q'), a: t('faq.aliasStopped.a') },
    { id: 'whoCanOpen', q: t('faq.whoCanOpen.q'), a: t('faq.whoCanOpen.a') },
    { id: 'ownDomain', q: t('faq.ownDomain.q'), a: t('faq.ownDomain.a') },
    { id: 'httpsPort', q: t('faq.httpsPort.q'), a: t('faq.httpsPort.a') },
  ];
  return {
    items,
    byId: {
      whatIsProgram: items[0]!,
      systemPrograms: items[1]!,
      keepOrOnce: items[2]!,
      startDone: items[3]!,
      sandboxLimits: items[4]!,
      sandboxNetwork: items[5]!,
      sandboxApply: items[6]!,
      maybeWentThrough: items[7]!,
      whichPorts: items[8]!,
      hoodyPorts: items[9]!,
      portOrAlias: items[10]!,
      makeAlias: items[11]!,
      aliasStopped: items[12]!,
      whoCanOpen: items[13]!,
      ownDomain: items[14]!,
      httpsPort: items[15]!,
    },
  };
}
