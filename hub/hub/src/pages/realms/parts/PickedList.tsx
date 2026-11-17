// The picked computers in the summary: how many, then every one by name with its colour mark. A long list scrolls
// inside the rail and is a keyboard stop. Its own part so the terminal (PickedList.term.tsx) lists every name with no
// inner scroll: there the page scrolls, and a capped list the keys cannot scroll would cut the names off.
import { ComputerMark } from '@kit';
import css from '../view.module.css';

export interface PickedListProps {
  /** "3 computers". */
  count: string;
  /** The list's accessible name. */
  label: string;
  items: readonly { id: string; name: string; color?: string | null | undefined }[];
  /** More names than the rail shows at once: the list scrolls inside itself. */
  scroll: boolean;
}

export function PickedList({ count, label, items, scroll }: PickedListProps) {
  return (
    <>
      {count}
      {/* Every picked computer by name: never a count alone. */}
      <ul className={scroll ? `${css.picked} ${css.scroll}` : css.picked} aria-label={label} {...(scroll ? { tabIndex: 0 } : {})}>
        {items.map((r) => <li key={r.id}><ComputerMark color={r.color} />{r.name}</li>)}
      </ul>
    </>
  );
}
