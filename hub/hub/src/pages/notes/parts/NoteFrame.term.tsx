// One note in the terminal. On the web the note is the Notes program's own page in a browser frame (NoteFrame.tsx);
// a terminal cannot draw a frame, so its place is a hand-off: why the note is not here and the web Hub's address for
// the Notes page (kit Handoff). The note's own address is the header's "Open in a new tab" (NoteDetail.tsx), unchanged.
// Nothing waits for a frame to load, so there is no "Loading…" and no slow note.
// The hand-off names the NOTE's computer, not the shell's: the page lists every computer's notes, so the shell's
// computer may be another one, and a link naming it would land on a list without this note. The computer is the one
// the note's own address is on (buildPortUrl: `https://<project id>-<computer id>-…`); an address that names none
// sends none (the web's "All computers" lists the note). Handoff still sends it only when the shell's list holds it.
import { Handoff, useStrings } from '@kit';
import { Box } from '@term/prim';
import type * as Web from './NoteFrame';
import strings from './notesTerm.strings.en.json';

const HOST_IDS = /^[0-9a-f]{24}-([0-9a-f]{24})-/;

/** The id of the computer a program address of a computer is on, or null. */
function computerOfAddress(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? HOST_IDS.exec(u.hostname)?.[1] ?? null : null;
  } catch {
    return null;
  }
}

export const NoteFrame: typeof Web.NoteFrame = ({ tabUrl }) => {
  const t = useStrings(strings);
  return (
    <Box dir="column" shrink={0} padX={1}>
      <Handoff reason={t('term.note.reason')} what={t('term.note.what')} computer={computerOfAddress(tabUrl)} />
    </Box>
  );
};
