// The mark of a tile in Add a program: an icon, or a name's first letter, in ink on the card's own ground (no plate,
// as the navigation draws its icons), in a fixed slot so every tile's text starts at the same edge. Decorative: the
// tile's title names it.
import { Icon, type IconName } from '@kit';
import s from './board.module.css';

export function TileMark({ icon, name }: { icon?: IconName | undefined; name?: string | undefined }) {
  return (
    <span className={s.tileMark} aria-hidden="true">
      {icon ? <Icon name={icon} size="lg" /> : Array.from((name ?? '').trim())[0]?.toUpperCase() ?? ''}
    </span>
  );
}
