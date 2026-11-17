// A reason in a Shared access row's action cell (why a share has no menu, why a stop is held), before the row's Stop
// button. A render function the cell callback calls (no component of its own, so the reason's text stays in the callback
// as before); its own module so the terminal (ShareNote.term.tsx) can keep it to the row's one line: there the whole
// sentence wrapped above the line and pushed Stop sharing out of the cell. On the web it wraps in the cell (RowNote);
// `short` is the terminal's words for a long reason and is not drawn here.
import type { ReactNode } from "react";
import { RowNote } from "@kit";
import s from "./keys.module.css";

export function shareNote(children: ReactNode, _short?: string) {
  return <RowNote className={s.shareNote}>{children}</RowNote>;
}
