// A tile's placeholder card: what a tile, the program view or a picker step shows instead of a program (a stopped
// computer, a held change, a refused address, a list that lost its computer). Never a broken frame.
//
// Contract, in plain words:
//   - The words and buttons are the kit's small empty state (icon, title, one sentence, actions); the page adds only
//     the host: the card ground over the dark program body, filling the tile and scrolling when the tile is shorter
//     than the card.
//   - `note` is drawn under the actions: an outcome block (SSH Connect) or a failed read's ErrorState.
//   - `hostRef` is the host element, for a picker step that moves the keys to its notice.
import { EmptyState, type IconName } from '@kit';
import type { ReactNode, Ref } from 'react';
import s from './board.module.css';

export interface TileCardProps {
  /** Left out: the card holds only its `note` and actions (a failed read says the rest). */
  title?: string;
  body?: ReactNode;
  actions?: ReactNode;
  /** Defaults to the information mark; a card about a computer names its own. */
  icon?: IconName;
  note?: ReactNode;
  hostRef?: Ref<HTMLDivElement>;
}

export function TileCard({ title, body, actions, icon = 'info', note, hostRef }: TileCardProps) {
  return (
    <div ref={hostRef} className={s.card}>
      {title !== undefined && <EmptyState size="sm" icon={icon} title={title} body={body} action={actions} />}
      {note}
      {title === undefined && actions}
    </div>
  );
}
