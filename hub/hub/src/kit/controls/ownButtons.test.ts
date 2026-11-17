// @vitest-environment node
// kit.ownButtons: the kit's button look lives in Button.module.css alone, so a restyle of it is one edit. Kit CSS outside
// kit/controls may not give a class it puts on a button (a React Aria Button, a native <button>, or a kit Button,
// IconButton, LinkButton, ToggleButton or CopyButton, in a .tsx of the same folder) a background on hover or press
// ([data-hovered], [data-pressed], :hover, :active): a kit part that must retint a kit button sets its --plate
// properties instead, since a background of its own would erase the plate and its cut. The ghost buttons inside kit
// parts (the Toast action and close, CopyButton, the calendar's month arrows, the SearchField clear) are kit buttons;
// what is left is ALLOW, each with why, and ALLOW only shrinks: a row the scan no longer finds fails until it is deleted.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = join(import.meta.dirname, '..');
const BUTTON_NAMES = ['AriaButton', 'button', 'Button', 'IconButton', 'LinkButton', 'ToggleButton', 'CopyButton'];
/** Hover or press: React Aria's state attributes (bare or with a value, any quoting) and the CSS pseudo-classes. */
const STATE = /\[\s*data-(?:hovered|pressed)\s*(?:=\s*(?:"[^"]*"|'[^']*'|[\w-]+)\s*)?\]|:hover\b|:active\b/;
const BACKGROUND = /(?:^|[;{\s])background(?:-color|-image)?\s*:/;

const noComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The tag names that draw a button in `tsx`: the kit's and React Aria's names, plus any local name one is imported as
 *  (`import { Button as RawButton }`), so renaming an import does not hide a button from the scan. */
function buttonTags(tsx: string): string {
  const names = new Set(BUTTON_NAMES);
  for (const m of tsx.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from/g))
    for (const part of (m[1] ?? '').split(',')) {
      const as = /^\s*(?:type\s+)?(\w+)\s+as\s+(\w+)\s*$/.exec(part);
      if (as && names.has(as[1] ?? '')) names.add(as[2] ?? '');
    }
  return [...names].filter(Boolean).join('|');
}

/** The attribute text of every opening tag named in `names` (braces balanced, so `=>` and `{a > b}` stay inside). */
function openingTags(tsx: string, names: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:${names})\\b`, 'g');
  for (let m = re.exec(tsx); m; m = re.exec(tsx)) {
    let depth = 0;
    let i = re.lastIndex;
    for (; i < tsx.length; i++) {
      const c = tsx[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(tsx.slice(re.lastIndex, i));
  }
  return out;
}

/** Every innermost `selector { body }` of a stylesheet (an @media block's rules included, the at-rule itself not). */
function flatRules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let text = css;
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/([^{}]*)\{([^{}]*)\}/g, (_all, sel: string, body: string) => {
      out.push([sel.trim(), body]);
      return '';
    });
  }
  return out;
}

/** A button whose class is picked at run time from the module: every class of it may be on the button. */
const ANY = '*';
/** Every class a stylesheet names. */
const cssClasses = (css: string) => new Set([...noComments(css).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1] ?? ''));

/** The classes of `cssName` (imported as a module) that `tsx` puts on a button (ANY when it picks one at run time). */
function buttonClasses(tsx: string, cssName: string): Set<string> {
  // Default or namespace import, either quote.
  const vars = [...tsx.matchAll(new RegExp(`import\\s+(?:\\*\\s+as\\s+)?(\\w+)\\s+from\\s+(['"])\\./${escapeRe(cssName)}\\2`, 'g'))].map((m) => m[1]);
  const out = new Set<string>();
  for (const attrs of openingTags(tsx, buttonTags(tsx)))
    for (const v of vars) {
      for (const m of attrs.matchAll(new RegExp(`\\b${v}\\.(\\w+)|\\b${v}\\[['"](\\w+)['"]\\]`, 'g'))) out.add(m[1] ?? m[2] ?? '');
      // A class picked at run time (`s[variant]`) can be any class of the module: the scan takes them all (ANY).
      if (new RegExp(`\\b${v}\\[(?!\\s*['"]\\w+['"]\\s*\\])`).test(attrs)) out.add(ANY);
    }
  return out;
}

/** The selectors of a selector list: split at its top-level commas, so `:is(.a, .b)[data-hovered]` stays one selector. */
function selectorsOf(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i));
      from = i + 1;
    }
  }
  out.push(list.slice(from));
  return out;
}

/** For each class of `classes`, how many selectors of `css` give it a background on hover or press (0 = none). */
function ownButtonCounts(css: string, classes: Iterable<string>): Map<string, number> {
  const rules = flatRules(noComments(css));
  const out = new Map<string, number>();
  for (const cls of classes) {
    const own = new RegExp(`\\.${escapeRe(cls)}(?![\\w-])`);
    let n = 0;
    for (const [sel, body] of rules) if (BACKGROUND.test(body)) n += selectorsOf(sel).filter((one) => own.test(one) && STATE.test(one)).length;
    if (n > 0) out.set(cls, n);
  }
  return out;
}

/** The classes of `classes` that `css` gives a background on hover or press: the scan's findings for one file. */
function ownButtonHits(css: string, classes: Iterable<string>): string[] {
  return [...ownButtonCounts(css, classes).keys()].sort();
}

/** The scan over the kit: `file|.class` for every hit, with how many hover/press fill selectors it has. */
function scanKit(): Map<string, number> {
  const files = (readdirSync(KIT, { recursive: true }) as string[]).map((f) => f.split('\\').join('/'));
  const out = new Map<string, number>();
  for (const f of files.filter((x) => x.endsWith('.module.css') && !x.startsWith('controls/'))) {
    const dir = dirname(f);
    const classes = new Set<string>();
    for (const x of files.filter((y) => dirname(y) === dir && y.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(y)))
      for (const c of buttonClasses(readFileSync(join(KIT, x), 'utf8'), basename(f))) classes.add(c);
    const css = readFileSync(join(KIT, f), 'utf8');
    for (const [c, n] of ownButtonCounts(css, classes.has(ANY) ? cssClasses(css) : classes)) out.set(`kit/${f}|.${c}`, n);
  }
  return out;
}

/** The kit parts that keep their own hover or press fill on a button: how many fill selectors each has, and why.
 *  Only shrinks: a new fill selector on an allowed class is a new hit, not covered by its row. */
const ALLOW: Record<string, readonly [number, string]> = {
  'kit/agent/StepTrail.module.css|.stepRow': [2, "a step of a turn's trail that opens its detail: one list row across the trail's shared grid (mark, kind, input, time, chevron on the list's columns), with the list hover and press fill; a kit Button is one box and cannot lay its cells on those columns"],
  'kit/data/DataTable.module.css|.chipX': [2, "a set filter chip's clear part: one segment of the chip's single plate (name | value | clear), a step darker on hover and press and cut like the plate; a kit IconButton would draw a second plate inside the chip"],
  'kit/data/DataTable.module.css|.expander': [1, "a row's expand toggle inside the table grid: the row's own control, sized by the row (a control-size debt row)"],
  'kit/forms/CodeEditor.module.css|.problem': [1, "a problem line in the editor's problem list: a list row that jumps to the line, not a ghost button"],
  'kit/layouts/Layouts.module.css|.stepBtn': [1, 'a wizard step button in the layouts step rail: a list row with its own fill'],
  'kit/pickers/FileChooser.module.css|.sideLink': [1, "a place in the file chooser's side list: a list row that opens a folder and carries the selected fill and bar when it is the one shown, not a ghost action"],
  'kit/pickers/PickerPanel.module.css|.foldToggle': [1, "a picker group's fold toggle, drawn as a heading row across the panel: a row fill, not a ghost action"],
};

describe('kit.ownButtons: the ghost look is the kit Button\'s alone', () => {
  it('no kit part outside controls/ gives a button of its own a hover or press background, except ALLOW', () => {
    const hits = scanKit();
    const over = [...hits].filter(([k, n]) => n > (ALLOW[k]?.[0] ?? 0)).map(([k, n]) => `${k}: ${n} fill selector(s), row allows ${ALLOW[k]?.[0] ?? 0}`);
    expect(over, 'a hand-made ghost button: use the kit Button / IconButton (variant ghost)').toEqual([]);
  });

  it('ALLOW only shrinks: every row is still found, and says why', () => {
    const hits = scanKit();
    const stale = Object.entries(ALLOW).filter(([k, [n]]) => (hits.get(k) ?? 0) < n).map(([k, [n]]) => `${k}: row allows ${n}, found ${hits.get(k) ?? 0}`);
    expect(stale, 'fixed (or fewer): lower or delete its ALLOW row').toEqual([]);
    for (const [k, [, why]] of Object.entries(ALLOW)) expect(why.length, k).toBeGreaterThanOrEqual(30);
  });

  it('the six ghost buttons inside kit parts are kit buttons and stay so', () => {
    const read = (f: string) => readFileSync(join(KIT, f), 'utf8');
    expect(read('states/Toast.tsx')).toMatch(/<Button variant="ghost" size="sm" className=\{s\.action\} onPress=\{run\} busy=\{busy\}>/);
    expect(read('states/Toast.tsx')).toMatch(/<IconButton slot="close" icon="x" size="sm"/);
    expect(read('forms/DatePickButton.tsx')).toMatch(/<IconButton slot="previous" icon="chevron-left" size="sm"/);
    expect(read('forms/DatePickButton.tsx')).toMatch(/<IconButton slot="next" icon="chevron-right" size="sm"/);
    expect(read('forms/fields.tsx')).toMatch(/<IconButton icon="x" size="xs" label=\{t\('search\.clear'\)\}/);
    const ids = read('data/Ids.tsx');
    expect(ids).toMatch(/<IconButton icon=\{icon\} size=\{size\} label=\{label\}/);
    expect(ids).toMatch(/<Button variant="ghost" size=\{size\} icon=\{icon\}/);
    for (const f of ['states/Toast.tsx', 'data/Ids.tsx', 'forms/DatePickButton.tsx', 'forms/fields.tsx']) expect(read(f), f).not.toMatch(/\bAriaButton\b/);
  });
});

describe('kit.ownButtons: the scan', () => {
  const tsx = [
    "import s from './x.module.css';",
    "const a = <AriaButton className={cx(s.ghost, on && s.on)} onPress={() => go(a > b)}>x</AriaButton>;",
    "const b = <button className={s['raw']} />;",
    "const c = <IconButton icon=\"x\" label=\"X\" className={s.kitOwn} />;",
    "const d = <div className={s.box}><span className={s.text} /></div>;",
  ].join('\n');

  it('reads the classes put on a button, through cx, brackets and arrow functions, never other elements', () => {
    expect([...buttonClasses(tsx, 'x.module.css')].sort()).toEqual(['ghost', 'kitOwn', 'on', 'raw']);
    expect([...buttonClasses(tsx, 'y.module.css')]).toEqual([]);
  });

  it('a renamed import, a double-quoted or namespace CSS import does not hide a button', () => {
    const renamed = [
      'import { Button as RawButton, Tooltip } from "react-aria-components";',
      'import * as s from "./x.module.css";',
      'const a = <RawButton className={s.ghost} />;',
      'const b = <Tooltip className={s.tip} />;',
    ].join('\n');
    expect([...buttonClasses(renamed, 'x.module.css')]).toEqual(['ghost']);
  });

  it('a class picked at run time on a button counts as every class of the module', () => {
    const dynamic = "import s from './x.module.css';\nconst a = <AriaButton className={cx(s.base, s[variant])} />;";
    expect([...buttonClasses(dynamic, 'x.module.css')].sort()).toEqual([ANY, 'base'].sort());
    expect([...buttonClasses("import s from './x.module.css';\nconst a = <button className={s['raw']} />;", 'x.module.css')], 'a literal key is that class').toEqual(['raw']);
    expect([...cssClasses('.compact:hover { background: red; } .a .b-c { color: red; } /* .gone {} */')].sort()).toEqual(['a', 'b-c', 'compact']);
  });

  it('finds a hover or press background, in a selector list or a media block, and nothing else', () => {
    const css = `
      .ghost[data-hovered] { background: var(--hx-hover); }
      @media (pointer: coarse) { .on:active { background-color: red; } }
      .raw:hover, .other { color: red; }
      .kitOwn[data-pressed] { color: var(--hx-ink); }
      .box:hover { background: red; }
      /* .raw[data-pressed] { background: red; } */
    `;
    expect(ownButtonHits(css, ['ghost', 'on', 'raw', 'kitOwn'])).toEqual(['ghost', 'on']);
    expect(ownButtonHits('.ghostly[data-hovered] { background: red; }', ['ghost']), 'a class name is matched whole').toEqual([]);
    expect(ownButtonHits('.row:hover .ghost { background: red; }', ['ghost']), 'a hover anywhere in the selector counts').toEqual(['ghost']);
    expect(ownButtonHits('.ghost { background: red; }', ['ghost']), 'a fill at rest is not a hover look').toEqual([]);
    for (const sel of ['.ghost[data-hovered="true"]', ".ghost[data-pressed='true']", '.ghost[data-hovered=true]', '.ghost[ data-pressed ]'])
      expect(ownButtonHits(`${sel} { background: red; }`, ['ghost']), sel).toEqual(['ghost']);
    expect(ownButtonHits('.ghost[data-focus-visible] { background: red; }', ['ghost']), 'focus is not hover or press').toEqual([]);
    expect(ownButtonHits(':is(.ghost, .other)[data-hovered] { background: red; }', ['ghost', 'other']), 'a state after :is() is on every class in it').toEqual(['ghost', 'other']);
    expect(ownButtonHits('.ghost, .other[data-hovered] { background: red; }', ['ghost', 'other']), 'a state in one selector of a list is that selector\'s alone').toEqual(['other']);
    expect(ownButtonCounts('.ghost:hover { background: red; } .ghost[data-pressed], .x:hover { background: blue; }', ['ghost']).get('ghost'), 'each fill selector counts').toBe(2);
  });
});
