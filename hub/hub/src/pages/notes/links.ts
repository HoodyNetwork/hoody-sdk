// Public hrefs of the notes page: the only file other pages may import from this folder.
export const links = {
  list: '/notes',
  computer: (id: string) => `/notes?computer=${encodeURIComponent(id)}`,
} as const;

// The Board's Add a program › Notes › New page creates a page with the Notes page's own New note (the C9 create and its
// read-back, flows.ts) and holds it in the same store (holds.ts), so a create whose answer is unknown is one hold for both.
export { checkNote, createNote, type CreateResult } from './flows';
export { checkTitle, newId } from './logic';
export { useApi as useNotesApi } from './data';
export { BEAT_GRACE, inFlight, SENDING_FOR, useInFlight, useNotesKept } from './holds';
export type { Computer as NotesComputer, Loaded as NotesLoaded, SentNote } from './types';

// ── The AI composer's "Notes…" source: the notes list the page reads, and one note's text, both read-only ────────────
import { download, fixtureModeActive, outcomeOf } from '@core';
import { targetOf } from './coreApi';
import { routes } from './routes';
import type { Computer, NoteRow } from './types';

/** The computers whose Notes the page reads, and each one's recent notes (read once, and again on request). */
export { shownOf as notesShownOf, useComputers as useNotesComputers, useNotes } from './data';
export type { NoteRow } from './types';

/** A note's text, or why there is none: longer than the bound asked (never cut), dropped (the account or realm moved on), or
 *  failed with core's rejection. */
export type NoteText = { ok: true; text: string } | { ok: false; why: 'tooBig' | 'dropped' } | { ok: false; why: 'failed'; error: unknown };

/** One note as Markdown text, read once through the read Download uses (the document route, output=md): at most `maxBytes`,
 *  nothing saved or cached. The fixtures answer a short note under its own title. */
export async function readNoteText(c: Computer, nb: string, n: NoteRow, maxBytes: number): Promise<NoteText> {
  if (fixtureModeActive()) return { ok: true, text: `# ${n.title}\n\nA short note.\n` };
  try {
    const r = await download(routes.document, { target: targetOf(c), params: { nb, id: n.id }, query: { output: 'md' }, maxBytes });
    return { ok: true, text: await new Blob(r.parts).text() };
  } catch (e) {
    if (outcomeOf(e) === 'stale') return { ok: false, why: 'dropped' };
    return (e as { kind?: unknown } | null)?.kind === 'too_large' ? { ok: false, why: 'tooBig' } : { ok: false, why: 'failed', error: e };
  }
}
