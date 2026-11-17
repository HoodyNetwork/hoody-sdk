// Why: the middle size of an explanation. A closed disclosure whose label is the
// question ("Which one should I pick?"); open, it shows 1-3 sentences and ends with the page FAQ's link, which opens a
// peek inside an overlay (FaqLink). At most one Why per step or section: several questions join one label
// ("Which one should I pick? · How tunnels work"). The step's one visible why sentence is the caller's text, not this.
import type { ReactNode } from 'react';
import { cx } from '../controls/Button';
import { Disclosure } from '../controls/Disclosure';
import { FaqLink, type FaqItem } from './Faq';
import s from './Why.module.css';

export interface WhyProps {
  /** The question, as the closed label. */
  question: string;
  /** The answer: 1-3 sentences. */
  children: ReactNode;
  /** The page FAQ question that says more: the answer always ends with its link (rule 17), a peek inside an overlay. */
  faq: { item: FaqItem; label: string };
  /** Heading level of the question (the Disclosure's), 2-6. */
  level?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function Why({ question, children, faq, level, className }: WhyProps) {
  return (
    <div className={cx(s.why, className)}>
      <Disclosure title={question} {...(level ? { level } : {})}>
        <div className={s.answer}>
          {children}
          <span className={s.more}>
            <FaqLink item={faq.item}>{faq.label}</FaqLink>
          </span>
        </div>
      </Disclosure>
    </div>
  );
}
