// A button that opens the browser's file picker. The picker is a visually hidden file input the button
// clicks (not display:none, so a programmatic click opens it in every browser). The chosen files go to `onFiles`;
// the input is cleared after every pick so the same file can be chosen again, and an empty pick calls nothing.
// No drop zone: a drop on a table is the DataTable's.
import { type Ref, useRef } from 'react';
import type { IconName } from '../icons';
import { Button } from './Button';
import s from './FileButton.module.css';

export interface FileButtonProps {
  /** The button's text (a resolved string). */
  label: string;
  /** Called with the picked files, never with an empty list. */
  onFiles: (files: File[]) => void;
  /** The input's `accept` (a list of types or extensions), as given. */
  accept?: string;
  /** Several files at once (default one). */
  multiple?: boolean;
  /** The leading icon. */
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  isDisabled?: boolean;
  /** Why it cannot be used now (only read with `isDisabled`): Button's `disabledReason`. */
  disabledReason?: string;
  /** A busy pulse in place of the icon; no picker opens. */
  busy?: boolean;
  /** The button element (React 19 ref prop). */
  ref?: Ref<HTMLButtonElement>;
}

export function FileButton({ label, onFiles, accept, multiple = false, icon, variant = 'secondary', size = 'md', isDisabled = false, disabledReason, busy, ref }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const open = () => input.current?.click();
  return (
    <>
      <Button ref={ref} variant={variant} size={size} icon={icon} isDisabled={isDisabled} disabledReason={disabledReason} busy={busy} onPress={open}>
        {label}
      </Button>
      <input
        ref={input}
        className={s.input}
        type="file"
        accept={accept}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        disabled={isDisabled || busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
