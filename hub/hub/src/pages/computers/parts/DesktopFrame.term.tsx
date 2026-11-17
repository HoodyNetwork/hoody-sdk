// The desktop's frame in the terminal. On the web the desktop is a live picture in a browser frame (DesktopFrame.tsx);
// a terminal cannot draw a frame, so its place is a hand-off: why the desktop is not here and the web Hub's address for
// the Computers page (kit Handoff). The desktop's own address is the toolbar's "Open in a new tab" (Desktop.tsx). Nothing
// waits for a frame to load, so there is no "Loading…" and no slow note, and no frame holds the keys, so there is no
// Leave desktop button. The toolbar around it (switcher, environment, Reload, Stop, Put on Board) is Desktop.tsx, unchanged.
// The hand-off names the computer whose desktop this is (the Desktop tab may be open on any computer, not only the
// shell's current one): the one in the desktop's own address, as NoteFrame.term.tsx does for a note.
import { Handoff, useStrings } from '@kit';
import { Box } from '@term/prim';
import type * as Web from './DesktopFrame';
import strings from './desktopTerm.strings.en.json';

/** A computer program's address is `https://<project id>-<computer id>-<program>….<server>.<domain>` (core/hosts.ts
 *  buildPortUrl, through urls.ts desktopUrl). */
const HOST_IDS = /^[0-9a-f]{24}-([0-9a-f]{24})-/;

/** The computer id in a desktop's address; null for anything else (the hand-off then names no computer). */
function computerOfAddress(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? HOST_IDS.exec(u.hostname)?.[1] ?? null : null;
  } catch {
    return null;
  }
}

export const DesktopFrame: typeof Web.DesktopFrame = ({ url }) => {
  const t = useStrings(strings);
  return (
    <Box dir="column" shrink={0}>
      <Handoff reason={t('term.desktop.reason')} what={t('term.desktop.what')} computer={computerOfAddress(url)} />
    </Box>
  );
};
