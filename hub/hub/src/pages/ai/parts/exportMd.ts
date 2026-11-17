// exportMd.ts: the chat as Markdown. Pure: a snapshot in, text out; no network read, so an export cannot fail half way.
// The file holds what the person sees. Everything the agent or the person wrote is untrusted text: it is cleaned first (ANSI and
// OSC sequences, controls, bidi and invisible marks), then QUOTED line by line, so no line of it can start a heading, a fence or a
// rule of the file's own. Short single-line fields (title, a step's verb and input, a note) are put on one line with the Markdown
// markers that could open something escaped, and a step's input sits in a code span from which backticks are removed.
// A raw `<` before a letter becomes `&lt;`, because the chat shows the text as text, never as markup (an entity cannot be
// cancelled by a backslash in the text). The "where it ran" line is wrapped in emphasis, so no field can open a block.
export { EXPORT_BLOCK_MAX, exportMarkdown, exportFileName } from './exportMd.pure';
export type { ExportWords } from './exportMd.pure';

/** Saves text as a file through an object URL. `doc` is injectable for tests. */
export function downloadText(name: string, text: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = doc.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.hidden = true;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
}
