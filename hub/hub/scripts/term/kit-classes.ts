// Every @kit value export, classified for the terminal (gate (f) of check.ts):
//   shared               the web module runs in the terminal as it is
//   ported               a .term sibling replaces its module
//   auto                 web-only in the graph's eyes (CSS module, DOM members) but the loader runs it through the
//                        compat runtime and the CSS translator: it draws without a sibling, approximated
//   placeholder-allowed  its module is synthesized as a placeholder (scripts/term/placeholder.ts): it draws a labelled
//                        box. Listed in kit-classes.json; the list may only shrink
//   handoff              never native: the terminal shows "open this on the web" (derived: its sibling draws <Handoff>, graph/handoffs.ts)
// A placeholder export missing from the list fails (port it); a listed export that is no longer a placeholder fails
// until `--update` drops it (the list only shrinks, so progress is pinned).
// A sibling export still under its scaffold marker (`// term-stub: <Name>`, scripts/term/new.ts) is NOT ported: it
// counts as placeholder-allowed, so a scaffold alone never shrinks the list (and the ship build refuses the marker).
// `auto` names are a recorded decision too (kit-classes.json `auto`): a NEW kit export that only draws approximated
// (no sibling, no hand-off) fails until a sibling is written or the name is added to `auto` by a reviewed hand edit;
// `--update` only drops names that left the class, it never adds (the first record is written once).
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import type { Analysis } from './graph/analyse';
import type { Problem } from './goldens';

export type KitClass = 'shared' | 'ported' | 'auto' | 'placeholder-allowed' | 'handoff';
export const KIT_CLASSES_FILE = path.join(HUB, 'scripts/term/kit-classes.json');
interface KitFile { _doc: string; placeholderAllowed: string[]; auto?: string[] }

/** The scaffold marker of a stub export in a .term sibling (scripts/term/new.ts writes it). */
export const STUB_MARKER = /^\s*\/\/ term-stub: ([A-Za-z_$][\w$]*)/gm;
/** Names under a scaffold marker in a sibling's text. */
export function stubNames(text: string): Set<string> { return new Set([...text.matchAll(STUB_MARKER)].map((m) => m[1]!)); }
const DOC = 'Kit exports the terminal still draws as placeholders (placeholderAllowed) and those recorded to draw approximated without a sibling (auto) (scripts/term/kit-classes.ts). Both only shrink through `bun scripts/term/check.ts --only kit --update`; a new auto name is a reviewed hand edit.';

/** Whether the loader would synthesize a placeholder for this module (a web-only package import and no sibling). */
async function isPlaceholderModule(file: string): Promise<boolean> {
  const { webOnlyReason, siblingOf } = await import('./resolve');
  const abs = path.join(HUB, file);
  if (siblingOf(abs)) return false;
  let src: string;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return false; }
  const t = new Bun.Transpiler({ loader: abs.endsWith('x') ? 'tsx' : 'ts' });
  let specs: string[];
  try { specs = t.scanImports(src).map((i) => i.path); } catch { specs = [...src.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!); }
  return webOnlyReason(specs) !== null;
}

/** Whether the sibling of `file` still holds the scaffold marker for `name`. */
async function stubbed(file: string, name: string): Promise<boolean> {
  const { siblingOf } = await import('./resolve');
  const sib = siblingOf(path.join(HUB, file));
  if (!sib) return false;
  try { return stubNames(fs.readFileSync(sib, 'utf8')).has(name); } catch { return false; }
}

export interface KitReport { counts: Record<KitClass, number>; rows: { name: string; file: string; cls: KitClass }[]; problems: Problem[] }

export async function classifyKit(a: Analysis, o: { update: boolean }): Promise<KitReport> {
  const rows: KitReport['rows'] = [];
  for (const n of a.kit) {
    if (n.kind === 'type') continue;
    let cls: KitClass;
    if (n.status === 'handoff') cls = 'handoff';
    else if (n.status === 'ported') cls = (await stubbed(n.file, n.name)) ? 'placeholder-allowed' : 'ported';
    else if (n.status === 'shared') cls = 'shared';
    else cls = (await isPlaceholderModule(n.file)) ? 'placeholder-allowed' : 'auto';
    rows.push({ name: n.name, file: n.file, cls });
  }
  const counts = { shared: 0, ported: 0, auto: 0, 'placeholder-allowed': 0, handoff: 0 } as Record<KitClass, number>;
  for (const r of rows) counts[r.cls]++;
  const now = rows.filter((r) => r.cls === 'placeholder-allowed').map((r) => r.name).sort();
  let file: KitFile | null = null;
  try { file = JSON.parse(fs.readFileSync(KIT_CLASSES_FILE, 'utf8')) as KitFile; } catch { /* first run */ }
  const problems: Problem[] = [];
  const rel = path.relative(HUB, KIT_CLASSES_FILE);
  if (!file) {
    if (o.update) fs.writeFileSync(KIT_CLASSES_FILE, JSON.stringify({ _doc: DOC, placeholderAllowed: now, auto: rows.filter((r) => r.cls === 'auto').map((r) => r.name).sort() }, null, 2) + '\n');
    else problems.push({ file: rel, rule: 'kit-classes-missing', message: 'no kit classification baseline', fix: '`bun scripts/term/check.ts --only kit --update`, then review the file.' });
    return { counts, rows, problems };
  }
  const added = now.filter((x) => !file!.placeholderAllowed.includes(x));
  const gone = file.placeholderAllowed.filter((x) => !now.includes(x));
  for (const name of added) {
    const r = rows.find((x) => x.name === name)!;
    problems.push({ file: r.file, rule: 'kit-placeholder-new', message: `kit export ${name} (${r.file}) is now drawn as a placeholder and is not in the allowed list`, fix: `Write its sibling (\`bun scripts/term/new.ts ${r.file}\`) or drop the web-only import; the allowed list never grows.` });
  }
  // auto: a recorded decision; new names fail, gone names are dropped by --update; no record yet = written once.
  const autoNow = rows.filter((r) => r.cls === 'auto').map((r) => r.name).sort();
  const autoRec = file.auto;
  const autoAdded = autoRec ? autoNow.filter((x) => !autoRec.includes(x)) : [];
  const autoGone = autoRec ? autoRec.filter((x) => !autoNow.includes(x)) : [];
  for (const name of autoAdded) {
    const r = rows.find((x) => x.name === name)!;
    problems.push({ file: r.file, rule: 'kit-auto-new', message: `kit export ${name} (${r.file}) has no terminal decision: no sibling, no hand-off, and it is not recorded in kit-classes.json \`auto\` (it would draw only approximated: raw tags through the compat runtime)`, fix: `Write its sibling (\`bun scripts/term/new.ts ${r.file}\`), hand it off, or add "${name}" to \`auto\` in scripts/term/kit-classes.json by hand after reading its frame (the edit is the reviewed decision).` });
  }
  const writeBack = gone.length > 0 || !autoRec || autoGone.length > 0;
  if (writeBack && o.update) {
    fs.writeFileSync(KIT_CLASSES_FILE, JSON.stringify({ _doc: DOC, placeholderAllowed: file.placeholderAllowed.filter((x) => now.includes(x)), auto: autoRec ? autoRec.filter((x) => autoNow.includes(x)) : autoNow }, null, 2) + '\n');
  } else {
    if (gone.length) problems.push({ file: rel, rule: 'kit-placeholder-stale', message: `no longer placeholders, still listed: ${gone.join(', ')}`, fix: '`bun scripts/term/check.ts --update` shrinks the list (pins the progress).' });
    if (!autoRec) problems.push({ file: rel, rule: 'kit-auto-missing', message: 'kit-classes.json has no `auto` record', fix: '`bun scripts/term/check.ts --only kit --update` writes the first one; review it.' });
    if (autoGone.length) problems.push({ file: rel, rule: 'kit-auto-stale', message: `no longer auto, still recorded: ${autoGone.join(', ')}`, fix: '`bun scripts/term/check.ts --only kit --update` drops them.' });
  }
  return { counts, rows, problems };
}
