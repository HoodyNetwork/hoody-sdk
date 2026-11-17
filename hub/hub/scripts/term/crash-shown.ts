// crashShown: does a frame show an error screen instead of the page? A leaf module (no imports) shared by goldens.ts
// and render.ts. It lived in goldens.ts, and render.ts importing it from there made a cycle: `bun scripts/term/goldens.ts
// --page <id>` awaits `import('./render')` at top level while render waits for goldens (its entry, mid-evaluation) to
// finish, so every CLI golden run (check.ts, the ship gate) hung with 0 frames.
/** The error a frame shows instead of the page (a stack, the router's or the page boundary's error screen), else null. */
export function crashShown(frame: string): string | null {
  const stack = /^\s*([A-Za-z]*Error[^\n]*)\n(?:[^\n]*\n){0,3}?\s+at \S/m.exec(frame);
  if (stack) return `error screen: ${stack[1]!.trim()}`;
  const router = /Something went wrong!\s*\n(?:.*\n)?\s*(.+)/.exec(frame);
  if (router) return `error screen: ${router[1]!.trim()}`;
  const page = /This page could not be drawn\.\s*\n(?:\s*\n)?\s*(.+)/.exec(frame);
  if (page) return `page error: ${page[1]!.trim()}`;
  return null;
}
