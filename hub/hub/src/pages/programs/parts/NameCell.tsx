// The list's text cells, as functions view.tsx calls from its column cells (the name with its mark, and a text cell with
// an optional hover wording), and the tab bar. The terminal draws them with NameCell.term.tsx.
import { Icon, Tabs, useStrings } from '@kit';
import type { ReactNode } from 'react';
import strings from '../strings.en.json';

export interface NameCellProps {
  /** The row needs attention: a warn mark before the name. */
  attention: boolean;
  /** The mark's spoken label. */
  attentionLabel: string;
  name: string;
  /** A secondary label after the name (Schedules' kind tag). */
  after?: ReactNode;
}

/** The name cell: the warn mark when the row needs attention, the name, then the tag. */
export function nameCell({ attention, attentionLabel, name, after }: NameCellProps): ReactNode {
  return (
    <span>
      {attention && <Icon name="warn" size="sm" label={attentionLabel} />} {name}{after ? <> {after}</> : null}
    </span>
  );
}

/** A text cell; `title` is the longer wording shown on hover. */
export function textCell(text: ReactNode, title?: string): ReactNode {
  return <span title={title}>{text}</span>;
}

/** The tab bar (Running programs / Apps / Ports & aliases). What each tab holds is said in a kit place: the Running tab's first question
 *  (faq.whatIsProgram) and the Apps tab's header line (subtitle.apps). */
export function TabsBlock() {
  const t = useStrings(strings);
  return <Tabs label={t('tabs.label')} param="tab" items={[{ id: 'running', label: t('tab.running') }, { id: 'apps', label: t('tab.apps') }, { id: 'ports', label: t('tab.ports') }]} />;
}
