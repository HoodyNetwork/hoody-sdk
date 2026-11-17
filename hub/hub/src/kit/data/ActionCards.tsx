// ActionCards: a grid of cards that each name a thing and offer its actions (the Guide's tools and recipes). A card is
// not a press: it holds an icon, a title (a heading one level below its section), one line, and an action row of real
// links and buttons, each its own Tab stop. A list, so a screen reader hears how many there are.
// Use CardGrid + PickCard when the whole card is the one choice; Tile for a bare box a page fills.
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { Heading } from '../layouts/anatomy/Heading';
import s from './ActionCards.module.css';

export interface ActionCard {
  id: string;
  /** A mark before the title (decorative: the title names the card). */
  icon?: IconName;
  title: string;
  /** One line about it, in the muted text colour. */
  body?: ReactNode;
  /** Its links and buttons (PageLinkTo, Link, Button, a page's own button), in one wrapping row at the card's foot. */
  actions?: ReactNode;
}

export interface ActionCardsProps {
  /** The list's accessible name (what the cards are). */
  label: string;
  cards: readonly ActionCard[];
}

/** Cards of about 220 px or more, as many per line as fit; one per line on a phone. */
export function ActionCards({ label, cards }: ActionCardsProps) {
  return (
    <ul className={s.grid} aria-label={label} data-action-cards="">
      {cards.map((c) => (
        <li key={c.id} className={s.card} data-action-card={c.id}>
          <div className={s.head}>
            {c.icon && <Icon name={c.icon} />}
            <Heading>{c.title}</Heading>
          </div>
          {c.body !== undefined && <p className={s.body}>{c.body}</p>}
          {c.actions !== undefined && <div className={s.actions}>{c.actions}</div>}
        </li>
      ))}
    </ul>
  );
}
