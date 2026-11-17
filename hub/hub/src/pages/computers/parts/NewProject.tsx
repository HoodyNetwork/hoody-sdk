// New project inside Get a computer: made right there, in the Project row, so the form being filled stays. The row's
// action opens a small form in the row (a name; a random preset colour, changed later in Projects), sent once through
// the same change as the Projects drawer (one lock, so a lost create held there is held here too). Only a done answer
// to this opening's own send hands its name up, with the drawer's selection generation taken at the send, and the
// drawer picks that project once the list shows it (the API refuses a second project with the same name) unless a
// project was picked by hand since. A held create that core later clears by proof (its own read-back, or Check again,
// in this opening or a later one) never changes the selection: it says the project was created, with Select. A refusal
// hands nothing up, so a same-named project made elsewhere meanwhile is never picked; Dismiss shows nothing. While it
// is sent the drawer is busy too: it neither closes, switches to Copy, nor sends the computer.
import { Band, Button, Outcome, randomPresetColor, Row, Stack, TextField, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { useCreateProject } from '../data';
import strings from '../strings.en.json';
import type { Project } from '../types';
import { Held } from './Held';
import { refusal, useRunner } from './runner';

const MAX_NAME = 100;
const TAKEN = 'DUPLICATE_ALIAS';

/** Shown in the Project row of Get a computer, under the project field: the new project's form while `open`, a held
 *  create, or "was created" with Select; nothing otherwise. The row's own button opens it (the drawer keeps `open`, and
 *  hides the button while the form is open or a create is held). Mounted only while the new-computer form shows. */
export function NewProject({ projects, inRealm, open, onOpenChange, pickGen, onWant, onSelect, onBusy, onHeld }: {
  projects: readonly Project[] | undefined;
  /** In a realm: the project joins it, and the offer says so. */
  inRealm: boolean;
  /** The form shows (the row's New project button was pressed). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The drawer's selection generation now (a project picked by hand moves it). */
  pickGen: () => number;
  /** A project of this name was made from here: pick it once the list holds it, unless the selection moved since `gen`. */
  onWant: (name: string, gen: number) => void;
  /** The person pressed Select on a project proved made: a pick by hand. */
  onSelect: (name: string) => void;
  /** The create is in flight (the drawer holds its close and its own send). */
  onBusy: (busy: boolean) => void;
  /** A create may have gone through: the held band shows here, and the row offers no second New project. */
  onHeld: (held: boolean) => void;
}) {
  const t = useStrings(strings);
  const create = useRunner(useCreateProject(), { lock: 'project.create', change: 'projectCreate', vars: (i) => ({ name: String(i.name ?? ''), color: '' }) });
  const setOpen = onOpenChange;
  const [name, setName] = useState('');
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    onBusy(create.busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [create.busy]);
  // Unmounted (the drawer closed): a late answer hands nothing to a later opening.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      onBusy(false);
      onHeld(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const held = create.held;
  // A shown hold that core clears (its read-back or Check again proved it) says the project was created, with Select;
  // one the person dismissed says nothing.
  const shownHeld = useRef<{ name: string; dismissed: boolean } | null>(null);
  const [proven, setProven] = useState<string | null>(null);
  const heldName = held ? String(held.name ?? '') : null;
  useEffect(() => {
    onHeld(heldName !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldName !== null]);
  // Opening the form again drops the "was created" note of an earlier one.
  useEffect(() => {
    if (open) setProven(null);
  }, [open]);
  useEffect(() => {
    const was = shownHeld.current;
    if (heldName !== null) shownHeld.current = was?.name === heldName ? was : { name: heldName, dismissed: false };
    else {
      shownHeld.current = null;
      if (was && !was.dismissed && was.name) {
        // Made: the form it was sent from is done with, as after a done answer.
        setProven(was.name);
        setOpen(false);
        setName('');
        setTaken(false);
        create.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldName]);
  if (held) {
    return (
      <Held
        kind="projectCreate"
        name={String(held.name ?? '')}
        elsewhere={create.elsewhere}
        onCheck={create.check}
        onDismiss={async () => {
          if (shownHeld.current) shownHeld.current.dismissed = true;
          const freed = await create.dismiss();
          if (!freed && shownHeld.current) shownHeld.current.dismissed = false;
        }}
      />
    );
  }
  const offer = t(inRealm ? 'create.newProject' : 'proj.new');
  // A held create proved made: the project is listed, and Select picks it.
  const provenNote = proven === null ? null : (
    <Band
      size="table"
      /* noDetails: a create that was proved made; nothing was refused */
      actions={
        <Button
          size="sm"
          onPress={() => {
            onSelect(proven);
            setProven(null);
          }}
        >
          {t('newp.select')}
        </Button>
      }
    >
      {t('newp.proven', { name: proven })}
    </Band>
  );
  if (!open) return provenNote;
  const clean = name.trim();
  const dupe = taken || (clean !== '' && (projects ?? []).some((p) => p.name === clean));
  const tooLong = clean.length > MAX_NAME;
  const valid = clean !== '' && !dupe && !tooLong;
  const shut = () => {
    setOpen(false);
    setName('');
    setTaken(false);
    create.reset();
  };
  const send = () => {
    if (!valid || create.busy) return;
    const gen = pickGen();
    void create.run({ name: clean, color: randomPresetColor() }).then((r) => {
      if (!alive.current) return;
      if (r.outcome === 'done') {
        onWant(clean, gen);
        shut();
      } else if (r.outcome === 'failed' && r.code === TAKEN) setTaken(true);
    });
  };
  const failed = create.outcome && create.outcome.kind !== 'done' && create.outcome.kind !== 'pending' && !(create.outcome.kind === 'failed' && create.outcome.code === TAKEN);
  return (
    <div role="group" aria-label={offer}>
      <Stack gap={2}>
        <TextField
          label={t('newp.name')}
          value={name}
          onChange={(v) => {
            setName(v);
            setTaken(false);
          }}
          // Enter makes the project (the drawer has no form element, so it never sends the computer).
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            send();
          }}
          // The pressed New project button is gone: focus goes to the field it opened, never back to the page top.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          description={t(inRealm ? 'newp.helpRealm' : 'newp.help')}
          errorMessage={dupe ? t('projd.nameTaken') : tooLong ? t('projd.nameLong') : undefined}
          isDisabled={create.busy}
        />
        <Row gap={2}>
          <Button size="sm" onPress={send} isDisabled={!valid} busy={create.busy}>{t('newp.make')}</Button>
          <Button size="sm" variant="ghost" onPress={shut} isDisabled={create.busy}>{t('newp.cancel')}</Button>
        </Row>
        {failed && create.outcome ? <Outcome outcome={create.outcome} error={refusal(create.outcome)} variant="block" /> : null}
      </Stack>
    </div>
  );
}
