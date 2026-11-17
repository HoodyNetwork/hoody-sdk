// Runtime-safe lookup over a built table (no node imports): what the terminal compat JSX runtime calls.
//
//   import table from '<built css table>.json';
//   const css = createStyleLookup(table as Table);
//   css.styleOf('pages/logs/parts/Logs.module.css#band')   // ClassEntry | undefined
//   css.stylesOf(props.className)                          // entries for every class id in a className string
//   css.moduleExports('pages/logs/parts/Logs.module.css')  // { band: 'pages/logs/parts/Logs.module.css#band', ... }
//
// A CSS-module import evaluates, in the terminal build, to moduleExports(path): local name → class id. `cx(s.a, s.b)`
// then yields "id1 id2", which stylesOf() splits on whitespace. Unknown tokens (global class names, '') are skipped.
//
// Applying an entry (the runtime's job; listed so the contract is in one place):
//   1. box props = entry.style (OpenTUI names, cells). hidden → do not render (or visible: false). contents → render
//      the children without a box. text → merged into the element's text style (inherits like CSS colour).
//   2. variants, in order: apply v.style / v.text / v.border / v.hidden / v.grid when EVERY condition in v.when holds;
//      a condition the runtime cannot evaluate (an unknown pseudo, ancestors it does not track) means "does not apply".
//      v.unset lists base keys to remove.
//   3. grid: give the i-th visible item (children of `contents` children count through) grid.childStyles[i], merged
//      UNDER the item's own style. More items than grid.tracks (and tracks > 0): fallback 'chunk' = wrap them into row
//      boxes of `tracks` items (an item whose entry has gridItem.spanAll takes a row of its own); 'column' = stack.
//   4. childRules: for an element with this class (and rule.when true), apply rule.style/text/... to its direct children
//      (rule.direct) or descendants matching rule.match (tag, attrs, structural pseudo; {} = any), at rule.specificity.
//   5. border: optional; each drawn side costs a full cell. `divider` marks a one-side rule between items.
import type { ClassEntry, Table } from './types';

export interface StyleLookup {
  styleOf(classId: string): ClassEntry | undefined;
  stylesOf(className: string | undefined | null): ClassEntry[];
  moduleExports(cssPath: string): Record<string, string>;
}

/** Normalise a module path to the table key: relative to hub/src, forward slashes. Accepts absolute paths and
 *  `src/...` or `hub/src/...` prefixes. */
export function moduleKey(cssPath: string): string {
  const p = cssPath.replace(/\\/g, '/');
  const i = p.lastIndexOf('/hub/src/');
  if (i >= 0) return p.slice(i + '/hub/src/'.length);
  if (p.startsWith('hub/src/')) return p.slice('hub/src/'.length);
  if (p.startsWith('src/')) return p.slice('src/'.length);
  return p.replace(/^\.\//, '');
}

export function createStyleLookup(table: Table): StyleLookup {
  return {
    styleOf: (classId) => table.classes[classId],
    stylesOf: (className) => {
      if (!className) return [];
      const out: ClassEntry[] = [];
      for (const tok of className.split(/\s+/)) {
        const e = tok ? table.classes[tok] : undefined;
        if (e) out.push(e);
      }
      return out;
    },
    moduleExports: (cssPath) => table.modules[moduleKey(cssPath)] ?? {},
  };
}
