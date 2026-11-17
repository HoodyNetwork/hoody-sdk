// Confirmations and one-field decisions: stop / restart, make current, rename, colour, delete. Each is a centred dialog
// that stays open while the change runs and shows the C9 outcome inside it.
import { computerColor } from '@core';
import { ColorPicker, ComputerMark, ConfirmDialog, DangerConfirm, TextField, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { computerGone, useRemove, useRemoveExpired, useRename, useSetColour } from '../data';
import { cleanRename } from '../logic';
import strings from '../strings.en.json';
import type { Computer } from '../types';
import { Held } from './Held';
import { holdWatch, type ShownHold } from './holdWatch';
import { useRunner } from './runner';

export function StopConfirm({ c, op, onClose, onConfirm }: { c: Computer | null; op: 'stop' | 'restart'; onClose: () => void; onConfirm: (c: Computer) => void }) {
  const t = useStrings(strings);
  return (
    <ConfirmDialog overlayId="computers-dialogs-confirm-dialog"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t(`confirm.${op}.title`, { name: c?.name ?? '' })}
      titleMark={<ComputerMark color={c?.color} />}
      body={t(`confirm.${op}.body`)}
      confirmLabel={t(`menu.${op}`)}
      onConfirm={() => {
        if (c) onConfirm(c);
        onClose();
      }}
    />
  );
}

/** Make current asks first, for the computer it was pressed on: what the current computer is, three places that then
 *  work on this one, and what stays as it is. Nothing is chosen until Make current is pressed here. */
export function MakeCurrentConfirm({ c, onClose, onConfirm }: { c: Computer | null; onClose: () => void; onConfirm: (c: Computer) => void }) {
  const t = useStrings(strings);
  const name = c?.name ?? '';
  return (
    <ConfirmDialog overlayId="computers-dialogs-make-current"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('current.ask.title', { name })}
      titleMark={<ComputerMark color={c?.color} />}
      body={t('current.ask.body', { name })}
      consequences={[t('current.ask.ex.pages', { name }), t('current.ask.ex.agent', { name }), t('current.ask.ex.files', { name })]}
      confirmLabel={t('menu.makeCurrent')}
      onConfirm={() => {
        if (c) onConfirm(c);
        onClose();
      }}
    />
  );
}

export function RenameDialog({ c, onClose, onDone }: { c: Computer | null; onClose: () => void; onDone: () => void }) {
  const t = useStrings(strings);
  const rename = useRunner(useRename(), { lock: 'computer.rename', pick: (i) => i.computer === c?.id, vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? '') }) });
  const [name, setName] = useState('');
  useEffect(() => {
    if (c) {
      setName(c.name);
      rename.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  const clean = cleanRename(name);
  return (
    <ConfirmDialog overlayId="computers-dialogs-rename"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('rename.title', { name: c?.name ?? '' })}
      confirmLabel={t('rename.go')}
      busy={rename.busy}
      outcome={rename.outcome}
      // A rename that may have gone through is checked or dismissed first (the held band), never sent again.
      confirmDisabled={!!rename.held || !clean || clean === c?.name}
      onCheck={async () => { await rename.check(); onDone(); }}
      onConfirm={() => {
        if (!c || !clean) return;
        void rename.run({ id: c.id, name: clean }).then((r) => {
          if (r.outcome === 'done') {
            onDone();
            onClose();
          }
        });
      }}
    >
      {rename.held ? (
        <Held kind="rename" name={String(rename.held.name ?? '')} dismissOnly onCheck={() => undefined} onDismiss={rename.dismiss} />
      ) : (
        // The dialog opens on the name to type, on the web and in a terminal (a terminal confirm opens on a field only
        // when the field asks for it, else on Cancel, where typing went nowhere and Enter cancelled).
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the one field this dialog is for; the web dialog focuses it too
        <TextField label={t('rename.label')} value={name} onChange={setName} description={t('rename.help')} autoFocus />
      )}
    </ConfirmDialog>
  );
}

/** The computer's colour, opened from the header swatch or the Colour row. Sends only `color`, as the
 *  API keeps it (#RRGGBB), for the computer captured when it opened; like Rename it stays open while the change runs,
 *  and a change that may have gone through is checked or dismissed first, never sent again. */
export function ColourDialog({ c, onClose, onDone }: { c: Computer | null; onClose: () => void; onDone: () => void }) {
  const t = useStrings(strings);
  const save = useRunner(useSetColour(), { lock: 'computer.colour', pick: (i) => i.computer === c?.id, vars: (i) => ({ id: String(i.computer ?? ''), color: String(i.color ?? '') }) });
  const [value, setValue] = useState('');
  useEffect(() => {
    if (c) {
      setValue(computerColor(c) ?? '');
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  // A shown hold that ends other than by the person's own Dismiss (a read-back or Check again proved it, or another
  // page settled it) closes the dialog: its form could send that colour again. Closing claims nothing; the list
  // reload shows the colour as it is. After the person's own Dismiss the form stays (holdWatch decides which end).
  const cbs = useRef({ onDone, onClose });
  useEffect(() => { cbs.current = { onDone, onClose }; });
  const [watch] = useState(() => holdWatch({
    release: () => undefined,
    judge: () => { cbs.current.onDone(); cbs.current.onClose(); },
  }));
  useEffect(() => () => watch.drop(), [watch]);
  const heldComputer = save.held ? String(save.held.computer ?? '') : '';
  const heldColour = save.held ? String(save.held.color ?? '') : '';
  const heldKey = save.held ? JSON.stringify([heldComputer, save.hold ?? null, heldColour]) : '';
  useEffect(() => {
    // ShownHold's list holds the sent colour (it names what the hold sent).
    const shown: ShownHold | null = save.held ? { computer: heldComputer, realms: [heldColour], hold: save.hold } : null;
    watch.seen(shown, c?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, c?.id]);
  const next = computerColor({ color: value });
  return (
    <ConfirmDialog overlayId="computers-dialogs-colour"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('colour.title', { name: c?.name ?? '' })}
      confirmLabel={t('colour.go')}
      busy={save.busy}
      outcome={save.outcome}
      confirmDisabled={!!save.held || !next || next === (c ? computerColor(c) : null)}
      onCheck={async () => { const proved = await save.check(); onDone(); return proved; }}
      onConfirm={() => {
        if (!c || !next) return;
        void save.run({ id: c.id, color: next }).then((r) => {
          if (r.outcome === 'done') {
            onDone();
            onClose();
          }
        });
      }}
    >
      {save.held ? (
        <Held kind="colour" name={c?.name ?? ''} dismissOnly onCheck={() => undefined} onDismiss={() => watch.dismiss(() => save.dismiss())} />
      ) : (
        <ColorPicker label={t('colour.label')} value={value} onChange={setValue} />
      )}
    </ConfirmDialog>
  );
}

/** `expired`: an expired computer from a project's Computers tab (its server ended or was reinstalled), deleted on the
 *  base host; no list can prove that delete, so its Check again reads the computer itself (only its 404 frees the hold).
 *  The caller keys the dialog by `expired`, so one mount never switches its change. */
export function DeleteComputer({ c, expired = false, onClose, onDone }: { c: Computer | null; expired?: boolean; onClose: () => void; onDone: () => void }) {
  const t = useStrings(strings);
  // Both changes are built every render (hooks stay unconditional); the runner sends the one this target needs.
  const live = useRemove();
  const gone = useRemoveExpired();
  const remove = useRunner(expired ? gone : live, { lock: 'computer.remove', pick: (i) => i.computer === c?.id, vars: (i) => ({ id: String(i.computer ?? '') }) });
  useEffect(() => {
    if (c) remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  // A live delete is proved by its declared read (the list, remove.check below); an expired one only by the computer's
  // own 404 on the base host (check() has no proof for it). A computer still there, or no answer, keeps it held.
  const checkLive = async () => {
    if (await remove.check()) {
      onDone();
      onClose();
    }
  };
  const checkExpired = async () => {
    if (c && (await remove.prove(async () => (await computerGone(c.id)) === true))) {
      onDone();
      onClose();
    }
  };
  return (
    <DangerConfirm overlayId="computers-dialogs-delete"
      isOpen={c !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t('delete.title', { name: c?.name ?? '' })}
      titleMark={<ComputerMark color={c?.color} />}
      // A held delete says so once: the band carries the one Check again (its proof), and the dialog's own outcome
      // line stays hidden while held.
      body={remove.held ? (
        <Held kind="remove" name={c?.name ?? ''} onCheck={expired ? checkExpired : checkLive} onDismiss={remove.dismiss} />
      ) : t('delete.body')}
      confirmText={c?.name ?? ''}
      consequences={remove.held ? [] : [t('delete.c1'), t('delete.c2')]}
      confirmLabel={t('delete.go')}
      busy={remove.busy}
      outcome={remove.held ? undefined : remove.outcome}
      onCheck={expired ? checkExpired : checkLive}
      onConfirm={() => {
        if (!c || remove.held) return;
        void remove.run({ id: c.id }).then((r) => {
          if (r.outcome === 'done') {
            onDone();
            onClose();
          }
        });
      }}
    />
  );
}
