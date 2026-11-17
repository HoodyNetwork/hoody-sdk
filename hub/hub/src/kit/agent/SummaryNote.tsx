// The agent's summary of the earlier conversation (it compacted its context and keeps the summary in place of the earlier
// messages): one folded line; opened, the summary in the replies' markdown. The conversation (web and terminal) and the
// dock's column draw it.
import type { ReactNode } from 'react';
import { Disclosure } from '../controls/Disclosure';
import { useStrings } from '../strings';
import { Prose } from './Reply';
import strings from './SessionView.strings.en.json';

export function SummaryNote({ text }: { text: string }): ReactNode {
  const t = useStrings(strings);
  return <Disclosure heading={false} title={t('sv.summary')}><Prose text={text} /></Disclosure>;
}
