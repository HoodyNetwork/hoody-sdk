// Delete note: the confirm for one note, opened from its row menu or from the open note's menu. Notes deletes for good,
// so the dialog names the note and its computer and says so; nothing is sent before Delete note is pressed here.
//
// C9 (rules in ../remove.ts): the delete is sent once and its attempt is a record under the note, kept outside this
// dialog. An unknown answer shows "This may have gone through" with Check again, which reads the captured note and sends
// nothing; closing the dialog keeps the record, and the note's Delete opens this dialog on it again. The dialog is bound
// to the note it was opened for: the page mounts it per note (key) and closes it when that note's computer or notebook
// is no longer the one read (`allowed`), unless an attempt is on record. Every definite end is told to the page (onEnd),
// which says what happened in a toast. The dialog closes itself then, one render AFTER it stopped showing the unknown
// outcome: a dialog taken away while it still shows one would leave the kit's "may have gone through" toast behind.
import { ConfirmDialog, useStrings } from '@kit';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RemoveApi } from '../api';
import type { OnRemoveEnd, RemoveAttempts, RemoveTarget } from '../remove';
import strings from '../strings.en.json';

const PENDING = { kind: 'pending' } as const;

export interface DeleteNoteProps {
  /** The note this dialog was opened for, captured at the press. */
  target: RemoveTarget;
  api: RemoveApi;
  attempts: RemoveAttempts;
  /** The note's computer still lists the notebook the dialog opened with and a delete may be sent now. Asked again when
   *  Delete note is pressed. */
  allowed: () => boolean;
  onClose: () => void;
  /** A delete of this dialog (or its Check again) ended. */
  onEnd: OnRemoveEnd;
}

export function DeleteNote({ target, api, attempts, allowed, onClose, onEnd }: DeleteNoteProps) {
  const t = useStrings(strings);
  useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
  const attempt = attempts.get(target.key);
  const ok = allowed();
  const unknown = attempt?.phase === 'unknown';
  // This dialog showed an attempt (its own send, or one on record when it opened), and one of its own sends or reads ended.
  const [had, setHad] = useState(attempt !== undefined);
  if (attempt && !had) setHad(true);
  const [over, setOver] = useState(false);
  const ended: OnRemoveEnd = (a, end) => {
    setOver(true);
    onEnd(a, end);
  };
  // It goes when the attempt it showed is over, or (nothing sent) when the note's computer or notebook changed under it.
  useEffect(() => {
    if (over || (!attempt && (had || !ok))) onClose();
  }, [over, attempt, had, ok, onClose]);

  const confirm = () => {
    // Read now, not from the render that drew the button.
    if (!allowed() || attempts.get(target.key)) return;
    attempts.send(target, api, ended);
  };

  return (
    <ConfirmDialog
      overlayId="notes-delete"
      isOpen
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('delete.title')}
      body={unknown ? t('delete.pending') : target.title ? t('delete.body', { title: target.title, computer: target.computer.name }) : t('delete.bodyUntitled', { computer: target.computer.name })}
      tone="danger"
      confirmLabel={t('delete.go')}
      busy={attempt?.phase === 'sending'}
      outcome={unknown ? PENDING : undefined}
      onCheck={attempt && unknown ? () => attempts.check(attempt, ended) : undefined}
      confirmDisabled={attempt !== undefined || !ok}
      onConfirm={confirm}
    />
  );
}
