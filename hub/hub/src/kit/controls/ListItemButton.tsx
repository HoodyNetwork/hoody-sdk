// ListItemButton: one row of a list that is one button (a provider in the model chooser's lists). A fixed leading box
// for a small mark, the name in the text face as written (user data keeps its case: no capitals, unlike Button), and
// muted facts at the row's end. Flat at rest, with one hover and focus fill (ListItemButton.module.css).
//
// The name for readers is the row's own text, never an aria-label: "OpenAI · 88 models · API key". The label and the
// facts sit in two boxes, so a hidden " · " between them keeps the two from running together ("OpenAI88 models"). An
// aria-label holding the facts would not contain the text as drawn (the boxes join with no space, and a Monogram's
// letter is drawn text too), which axe's label-content-name-mismatch refuses. The leading box is hidden from readers:
// the name already says what the mark shows.
//
// A disabled row carries the disabled-press guard (disabledPress.ts), as the kit Button does: a press on it while the
// chooser is locked never costs the first click once it is enabled again.
import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from './Button';
import { useDisabledPressRef } from './disabledPress';
import s from './ListItemButton.module.css';

/** Read between the name and the facts, never drawn (the row's gap separates them on screen). */
const SEPARATOR = ' · ';

export interface ListItemButtonProps {
  /** The row's name, drawn as written; it ends in "…" when the row is too narrow (the whole name is its `title`). */
  children: string;
  /** A small mark in the fixed leading box (ProviderMark, Monogram, an Icon of size sm). Decorative. */
  leading?: ReactNode;
  /** Muted facts at the end of the row ("119 models · API key"); readers hear them after the name. */
  meta?: string;
  /** For focus restore by id. */
  id?: string;
  isDisabled?: boolean;
  onPress?: () => void;
  className?: string;
}

export function ListItemButton({ children, leading, meta, id, isDisabled, onPress, className }: ListItemButtonProps) {
  const guarded = useDisabledPressRef<HTMLButtonElement>();
  return (
    <AriaButton ref={guarded} id={id} className={cx(s.item, className)} isDisabled={isDisabled} onPress={onPress ? () => onPress() : undefined}>
      {leading !== undefined && (
        <span className={s.lead} aria-hidden="true">
          {leading}
        </span>
      )}
      <span className={s.label} title={children}>
        {children}
      </span>
      {meta !== undefined && (
        <>
          <span className={s.srOnly}>{SEPARATOR}</span>
          <span className={s.meta}>{meta}</span>
        </>
      )}
    </AriaButton>
  );
}
