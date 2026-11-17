// A realm's colour swatch in the realms card (a styled empty span; the tint names a palette colour). Its own part so
// the terminal (RealmSwatch.term.tsx) draws the colour: there an empty span draws nothing.
import { cx } from '@kit';
import s from './home.module.css';

export function RealmSwatch({ tint }: { tint: string | undefined }) {
  return <span className={cx(s.swatch, tint && `rc-${tint}`)} data-tint={tint || undefined} aria-hidden="true" />;
}
