// The kit's one busy mark (the kit Button draws it too). Its own module, importing
// only its own styles, so controls/Button reaches it without the States module (which imports Button).
import s from './Spinner.module.css';

/**
 * A small inline busy mark: three pulsing dots, the mark a busy Button draws too (whole areas
 * load with skeletons; this is only for a word-sized wait). Still frames and reduced motion read as
 * "…", never as a broken glyph.
 */
export function Spinner({ label, size = 'sm' }: { label?: string; /** `lg`: the loader of a whole region that is waiting (a tile while its app starts). */ size?: 'sm' | 'lg' }) {
  return (
    <span className={size === 'lg' ? `${s.spinner} ${s.spinnerLg}` : s.spinner} role={label ? 'status' : undefined} aria-label={label}>
      <span className={s.spinnerDot} aria-hidden="true" />
      <span className={s.spinnerDot} aria-hidden="true" />
      <span className={s.spinnerDot} aria-hidden="true" />
    </span>
  );
}
