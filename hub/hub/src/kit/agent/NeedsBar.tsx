// NeedsBar: the pinned "Waiting for you" row (3.22). It sits between the transcript and the composer, in the
// column's flow, while a gate waits and its card is not fully on screen, or more than one gate waits. It never decides by
// itself: Show brings the card into view and focus goes to the card (one decision surface, one focus owner). Nothing
// draws over it and it draws over nothing.
import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { useStrings } from '../strings';
import type { GateEntry } from './source';
import strings from './NeedsBar.strings.en.json';
import s from './NeedsBar.module.css';

import { needsWhat } from './NeedsBar.pure';

export { needsWhat };

export interface NeedsBarProps {
  /** The gates waiting, in the order the conversation shows them; the first is the one named. */
  gates: readonly GateEntry[];
  /** Brings the first gate's card into view and puts focus on it. */
  onShow: () => void;
  /** The host's control after Show (the running turn's Stop, while this bar stands in for the working bar). */
  end?: ReactNode;
}

export function NeedsBar({ gates, onShow, end }: NeedsBarProps) {
  const t = useStrings(strings);
  const first = gates[0];
  if (!first) return null;
  const more = gates.length - 1;
  return (
    <div className={s.bar} role="region" aria-label={t('needs.aria')} data-needs-bar>
      {/* What waits, as one group: a row beside the buttons, or (a narrow conversation) the label over the request, so the
          buttons never go to a row of their own. */}
      <span className={s.text}>
        <span className={s.label}>{t('needs.label')}</span>
        <span className={s.what} translate="no">{needsWhat(first, t)}</span>
        {more > 0 && <span className={s.more}>{t('needs.more', { n: more })}</span>}
      </span>
      <Button size="sm" variant="secondary" onPress={onShow}>{t('needs.show')}</Button>
      {end}
    </div>
  );
}
