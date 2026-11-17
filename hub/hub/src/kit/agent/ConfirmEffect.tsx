// A confirm that names the effect: what will happen, one line each, what it does not
// do, and, for a write that spends money-like work or cannot be undone, a typed name that arms the button. The kit's
// DangerConfirm is for deleting a thing and always reads as destructive; a tidy-up or a host recovery is typed or plain
// without that tone, so the tone is the caller's. The button stays disabled until the typed text equals `confirmText`
// exactly (outer spaces ignored); an empty `confirmText` never arms a typed confirm.
import { useEffect, useState } from 'react';
import { TextField } from '../forms/fields';
import { ConfirmDialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import strings from './ConfirmEffect.strings.en.json';
import s from './ConfirmEffect.module.css';

export interface ConfirmEffectProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, one line each. */
  effects: readonly string[];
  /** What it does not do, or what stays unknown, one sentence. */
  note?: string;
  /** The text to type before the button arms (a project's name). Omit for a plain confirm. */
  confirmText?: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

export function ConfirmEffect({ isOpen, onOpenChange, title, effects, note, confirmText, confirmLabel, tone = 'default', onConfirm }: ConfirmEffectProps) {
  const t = useStrings(strings);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);
  const needsText = confirmText !== undefined;
  const armed = !needsText || (confirmText.length > 0 && typed.trim() === confirmText);
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      tone={tone}
      typed={needsText}
      confirmLabel={confirmLabel}
      confirmDisabled={!armed}
      onConfirm={() => { if (armed) onConfirm(); }}
      body={
        <>
          {effects.length > 0 && (
            <ul className={s.effects}>
              {effects.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {note ? <p className={s.note}>{note}</p> : null}
        </>
      }
    >
      {needsText && (
        <TextField
          label={t('type', { text: confirmText })}
          value={typed}
          onChange={setTyped}
          autoComplete="off"
          spellCheck="false"
          mono
        />
      )}
    </ConfirmDialog>
  );
}
