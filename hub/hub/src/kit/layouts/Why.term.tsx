// Why in the terminal: the question is a closed Disclosure line ("▸ Which one should I pick?"); open, it shows the
// answer as muted prose no wider than a line of reading text, then the page FAQ's link on its own line (FaqLink: it
// lands on the question when the page shows it, else it unfolds the answer in place).
import type * as Web from './Why';
import { Disclosure } from '../controls/Disclosure';
import { Box } from '../../term/prim';
import { FaqLink } from './Faq';
import { Inline } from './termParts';

export type { WhyProps } from './Why';

/** The answer's measure (Why.module.css: 64ch). */
const ANSWER_COLS = 64;

export const Why: typeof Web.Why = ({ question, children, faq, level }) => (
  <Box dir="column" shrink={0} minWidth={0}>
    <Disclosure title={question} {...(level ? { level } : {})}>
      <Box dir="column" shrink={0} maxWidth={ANSWER_COLS}>
        <Inline colour="muted">{children}</Inline>
        <FaqLink item={faq.item}>{faq.label}</FaqLink>
      </Box>
    </Disclosure>
  </Box>
);
