// HoodyLoader: the Hoody mark (the filled `logo` of kit/icons.tsx: a square with the pixel h cut out, in three parts)
// as a busy mark for a row that waits, its three parts lighting in turn. Still (reduced motion, performance mode, a
// still frame) it is the plain mark, never a broken glyph. currentColor throughout, so it follows the text colour and
// forced colours. The words of what it waits for are the page's (`text`). Spinner stays the busy mark of buttons and
// step rows.
import type { ReactNode } from 'react';
import s from './HoodyLoader.module.css';

/** The mark's outline with its parts cut out (the `logo` path of kit/icons.tsx). */
export const HOODY_MARK = 'M1 1h22v22H1zM4.4375 4.4375h2.75v8.25h-2.75zM4.4375 15.4375h2.75v4.125h-2.75zM7.1875 12.6875h12.375v6.875h-2.75v-4.125H7.1875z';
/** The h's three cut-out parts, in the order they light: up the left (the lower stem, then the upper), then the arch
 *  across and down. */
export const HOODY_PARTS = [
  'M4.4375 15.4375h2.75v4.125h-2.75z',
  'M4.4375 4.4375h2.75v8.25h-2.75z',
  'M7.1875 12.6875h12.375v6.875h-2.75v-4.125H7.1875z',
] as const;

export interface HoodyLoaderProps {
  /** `sm` (default): the size of Spinner in a text row (--icon-sm). `md`: --icon-md. `lg`: a page section that waits,
   * the mark at Spinner lg's frame (--sp-10) with the line centred under it. */
  size?: 'sm' | 'md' | 'lg';
  /** As on Spinner: with a label (and no `text`) the mark is a status named by it; without either it is decorative. */
  label?: string;
  /** What it waits for, in the page's words, drawn after the mark. The loader is then a status whose content is this line. */
  text?: ReactNode;
  className?: string;
}

export function HoodyLoader({ size = 'sm', label, text, className }: HoodyLoaderProps) {
  const hasText = text !== undefined && text !== null && text !== false && text !== '';
  const status = hasText || Boolean(label);
  return (
    <span
      className={[s.loader, size === 'md' ? s.md : size === 'lg' ? s.lg : undefined, className].filter(Boolean).join(' ')}
      role={status ? 'status' : undefined}
      aria-label={!hasText && label ? label : undefined}
      aria-hidden={status ? undefined : true}
      data-hoody-loader=""
    >
      <svg className={s.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fillRule="evenodd" d={HOODY_MARK} />
        {HOODY_PARTS.map((d) => (
          <path key={d} className={s.part} d={d} />
        ))}
      </svg>
      {hasText && <span className={s.text}>{text}</span>}
    </span>
  );
}
