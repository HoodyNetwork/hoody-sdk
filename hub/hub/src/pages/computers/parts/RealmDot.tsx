// A realm's colour dot (palette names only; anything else draws the neutral dot). Its own part so the terminal
// (RealmDot.term.tsx) draws a swatch of the colour: the web's dot is a styled empty span, which draws nothing there.
import type { CSSProperties } from 'react';
import { realmColor } from '../logic';
import s from './parts.module.css';

export function RealmDot({ color }: { color: string | undefined }) {
  const c = realmColor(color);
  return <span className={s.realmDot} aria-hidden="true" data-realm-color={c ?? undefined} style={{ ['--realm' as string]: `var(--hx-r-${c ?? 'blue'})` } as CSSProperties} />;
}
