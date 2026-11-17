// GroupNotes: what a list says about one of its computers (its read failed, it is off or starting, it lists fewer than
// it has, its items are paused). One shared piece for every list grouped by computer (Bots, Scripts, the AI chat list),
// drawn in the computer's own group (TableGroup.note) as flush Bands, the group's first row, or as a notices strip
// above an ungrouped list (`named`, or one GroupNotes whose notes each carry `of`).
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import type { IconName } from '../icons';
import { Band, type BandTone } from '../states/Band';
import { useStrings } from '../strings';
import strings from './GroupNotes.strings.en.json';

/** The one action of a note. */
export interface GroupNoteAction {
  /** The short words on the action ("Try again", "Resume"). */
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** `text` (default): a TextButton. `button`: the small chip Button, for the one action that resolves it (Resume). */
  kind?: 'text' | 'button';
}

/** One note about a computer: a sentence, its tone and its action. */
export interface GroupNote {
  id: string;
  /** The sentence, without the computer's name. */
  text: string;
  tone?: BandTone;
  icon?: IconName;
  action?: GroupNoteAction;
  /** Outside any group, in a strip over several computers: the computer this note is about, named in its words (as
   *  `named`) and in its action's name. */
  of?: string;
}

/** The props of GroupNotes. */
export interface GroupNotesProps {
  /** The computer the notes are about: in each action's name, and in the words when `named`. Omitted for a strip whose
   *  notes each say theirs (`of`). */
  name?: string;
  notes: readonly GroupNote[];
  /** Outside the computer's group: each note names the computer. */
  named?: boolean;
}

/** A computer's notes as flush Bands. In the computer's group the header names it, so the words do not, and each
 *  action's accessible name says which computer it acts on (a screen reader moving between buttons never hears the
 *  header). With `named` each note names its computer and its action keeps the short name; a note with `of` names its
 *  computer in both. */
export function GroupNotes({ name, notes, named = false }: GroupNotesProps) {
  const t = useStrings(strings);
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((n) => {
        const a = n.action;
        const who = n.of ?? name ?? '';
        const aria = !a ? undefined : n.of ? t('groupNotes.actionOn', { action: a.label, name: who }) : named ? undefined : t('groupNotes.actionOn', { action: a.label, name: who });
        const action = !a ? undefined : a.kind === 'button' ? (
          <Button size="sm" chip busy={a.busy} onPress={a.onPress} aria-label={aria}>
            {a.label}
          </Button>
        ) : (
          <TextButton busy={a.busy} onPress={a.onPress} aria-label={aria}>
            {a.label}
          </TextButton>
        );
        return (
          <Band key={n.id} flush size="table" tone={n.tone} icon={n.icon} actions={action}>
            {n.of || named ? t('groupNotes.named', { name: who, note: n.text }) : n.text}
          </Band>
        );
      })}
    </>
  );
}
