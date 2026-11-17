// In-memory source rewrites for the scenario runner (never on disk): the terminal loader reads every source file with
// fs.readFileSync, so a hook installed BEFORE the loader runs sees and may rewrite each file's text.
// Two users:
//   - the `sem` shim: until the prims call useSem themselves, the requested edits are applied to the prim
//     files in memory so scenarios can find nodes. Each patch applies only when its anchor is present AND the file does
//     not already call useSem, so it stops applying once the prim calls useSem itself (the report lists what was shimmed);
//   - mutants (scripts/term/scenarios.ts --mutants): a sibling's handling of one prop is removed at load.
import fs from 'node:fs';

type Hook = (file: string, source: string) => string;
const hooks: Hook[] = [];
let installed = false;

export function addSourceHook(h: Hook): void {
  hooks.push(h);
  if (installed) return;
  installed = true;
  const orig = fs.readFileSync;
  (fs as { readFileSync: unknown }).readFileSync = function patched(this: unknown, file: unknown, opts?: unknown) {
    const out = (orig as (...a: unknown[]) => unknown).call(this, file, opts);
    if (typeof file !== 'string' || typeof out !== 'string' || !/\.(tsx?|mts)$/.test(file)) return out;
    let s = out;
    for (const hk of hooks) s = hk(file, s);
    return s;
  };
}

/** What the shim patched (file -> patch names), for the report. */
export const shimmed = new Map<string, string[]>();

interface Patch { name: string; file: RegExp; anchor: RegExp; replace: string }
const IMPORT = "import { useSem as __useSem, mergeRefs as __mergeRefs } from './semantics';\n";
const PATCHES: Patch[] = [
  { name: 'Box.sem', file: /\/src\/term\/prim\/Box\.ts$/, anchor: /if \(p\.boxRef\) s\.ref = p\.boxRef;/, replace: 's.ref = __mergeRefs(p.boxRef, __useSem((p as { sem?: never }).sem, {}));' },
  { name: 'Text.sem', file: /\/src\/term\/prim\/Text\.ts$/, anchor: /const inside = useInText\(\);/, replace: 'const inside = useInText();\n  const __sr = __useSem(inside ? undefined : (p as { sem?: never }).sem, {});' },
  { name: 'Text.sem.ref', file: /\/src\/term\/prim\/Text\.ts$/, anchor: /delete style\.link;/, replace: 'delete style.link;\n  style.ref = __sr;' },
  { name: 'Pressable.sem', file: /\/src\/term\/prim\/Pressable\.ts$/, anchor: /(children, \.\.\.box \}: PressableProps\))/, replace: 'children, sem: __sem, ...box }: PressableProps & { sem?: never })' },
  { name: 'Pressable.sem.ref', file: /\/src\/term\/prim\/Pressable\.ts$/, anchor: /boxRef: f\.ref,/, replace: 'boxRef: __mergeRefs(f.ref, __useSem(__sem, { role: "button", disabled, focus: f })),' },
  { name: 'TextInput.sem', file: /\/src\/term\/prim\/TextInput\.ts$/, anchor: /ref: f\.ref, value: p\.value,/, replace: 'ref: __mergeRefs(f.ref, __useSem((p as { sem?: never }).sem, { role: "textbox", disabled: p.disabled, focus: f, value: p.value })), value: p.value,' },
];
const DOM_IMPORT = "import { semOfDom as __semOfDom } from '../prim/semdom';\n";
const DOM_PATCHES: Patch[] = [
  { name: 'dom.Pressable.sem', file: /\/src\/term\/jsx\/dom\.ts$/, anchor: /createElement\(Pressable, \{ dir: 'row', \.\.\.style\.box,/, replace: "createElement(Pressable, { dir: 'row', ...style.box, sem: __semOfDom(tag, props) as never," },
  { name: 'dom.Box.sem', file: /\/src\/term\/jsx\/dom\.ts$/, anchor: /return createElement\(Box, box, \.\.\.grouped\(/, replace: 'Object.assign(box, { sem: __semOfDom(tag, props) });\n  return createElement(Box, box, ...grouped(' },
];

export function installSemShim(): void {
  addSourceHook((file, src) => {
    const isDom = /\/src\/term\/jsx\/dom\.ts$/.test(file);
    const list = isDom ? DOM_PATCHES : PATCHES;
    const mine = list.filter((p) => p.file.test(file));
    if (!mine.length || (isDom ? /semOfDom/.test(src) : /useSem/.test(src))) return src;
    let s = src;
    const done: string[] = [];
    for (const p of mine) if (p.anchor.test(s)) { s = s.replace(p.anchor, p.replace); done.push(p.name); }
    if (!done.length) return src;
    shimmed.set(file.replace(/.*\/src\//, 'src/'), done);
    // after the file's first comment block, before its imports
    return (isDom ? DOM_IMPORT : IMPORT) + s;
  });
}
