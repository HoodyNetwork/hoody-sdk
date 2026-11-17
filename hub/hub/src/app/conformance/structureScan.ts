// The page-structure scan behind app/conformance.structure.test.ts: what a page, the shell or Ask builds by hand where a
// kit part exists. Each rule proves one mechanical thing and names the kit part that replaces the site. Test-only.
//   struct.kitRestyle   a CSS-module class handed to a kit control, card or heading whose rules change that part's look
//                       (colour, frame, type, a fixed height, or one of the part's own tokens; a size floor or layout is not one)
//   struct.globalReach  a consumer stylesheet rule that leaves its module with :global(…) (a theme scope on :root or html is not one)
//   struct.pressable    a consumer CSS rule that is a button recipe of its own: pointer cursor, a fill and a border
//   struct.rawChoice    a hand-written <input type="radio"> or <input type="checkbox">
//   struct.looseHint    a <p> whose module class is named as a hint (hint, help, note, caption, explain, …)
// Counts are per file: distinct classes (kitRestyle), rules (globalReach, pressable) or elements (rawChoice, looseHint).
import ts from 'typescript';
import { cssModules, cssRules, moduleClassesIn, parseTsx, styledClasses } from './cssScan';

export const STRUCT_RULES = ['struct.kitRestyle', 'struct.globalReach', 'struct.pressable', 'struct.rawChoice', 'struct.looseHint'] as const;
export type StructRule = (typeof STRUCT_RULES)[number];
export interface StructHit { rule: StructRule; file: string; line: number; what: string }

/** What fixes a hit of each rule: the kit part to use, or where to ask for one. */
export const STRUCT_FIX: Record<StructRule, string> = {
  'struct.kitRestyle':
    'a kit control, card or heading takes its look from its own props (Button variant / tone / size / literal, Tag tone, Heading level, Panel and Widget tone); drop the look declarations from the page class (layout such as flex, margin and inline-size may stay). A look the kit lacks is added to the kit, never a page class',
  'struct.globalReach': 'a page stylesheet styles its own module classes only: drop the :global(…) rule and use the kit part\'s prop or slot (an overlay\'s padding and header are the Drawer / Dialog / Sheet props)',
  'struct.pressable': 'a pressable is a kit Button (variant ghost, row or bubble), PickCard, Tile, ItemList row, Disclosure or SectionMenuList: use that part instead of a page-made button recipe',
  'struct.rawChoice': 'use the kit RadioGroup (look="tiles" for cards), Checkbox, Switch or SegmentedControl; in a settings list, a SettingRow or SettingSwitch',
  'struct.looseHint': 'a hint has a kit place: SettingRow `help`, a field\'s `description`, a Section `description`, a Why, or a Band `attach` on the field it is about',
};

/** Kit parts whose look a consumer may not change from outside: controls, cards and headings. */
export const KIT_LOOK_PARTS = new Set([
  'Button', 'IconButton', 'LinkButton', 'TextButton', 'ReasonButton', 'CopyButton', 'FileButton', 'QrButton', 'Fab', 'ActionMenu',
  'Tag', 'StatusPill', 'SegmentedControl', 'Switch', 'Checkbox', 'RadioGroup', 'Link', 'Tabs',
  'Panel', 'Widget', 'Section', 'SubSection', 'AnatomySection', 'PickCard', 'Tile', 'PlanCard', 'Heading', 'PageHeader', 'DetailHeader',
]);

/** A declaration that changes how a kit part looks (colour, frame, type, control height), or re-points one of its tokens. */
const LOOK_PROP = /^(?:background(?:-color|-image)?|color|border(?!-collapse|-spacing)[a-z-]*|box-shadow|font(?:-size|-weight|-family|-style)?|text-transform|letter-spacing|text-decoration[a-z-]*|outline[a-z-]*|opacity|block-size|height)$/;
const KIT_TOKEN_PROP = /^--(?:btn|ctl|ghost|tag|pill|seg|chip|card|pad-card|touch|icon-hit)(?:-|$)/;
const isLook = (prop: string) => LOOK_PROP.test(prop) || KIT_TOKEN_PROP.test(prop);

const RESET = /^(?:none|0(?:px)?|transparent|inherit|initial|unset|revert)(?:\s+!important)?$/i;
const HINT_CLASS = /^(?:hint|help|helper|note|caption|explain|explainer|finePrint|smallPrint)(?:[A-Z_-].*|\d*)$/;

const isConsumer = (f: string) => /^(?:pages|shell|ask)\//.test(f);
const isTest = (f: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) || /(?:^|\/)(?:fixtures|shots)(?:\.|\/)/.test(f);
/** A selector that names something outside its module: a :global(…) whose argument is not a theme scope (:root…, html…). */
const reachesOut = (sel: string) => [...sel.matchAll(/:global\(\s*([^\s)]*)/g)].some((m) => !/^(?::root|html)(?![\w-])/.test(m[1] ?? ''));
const lineAt = (text: string, pos: number) => text.slice(0, pos).split('\n').length;

/** The kit part names a file imports from the kit barrel or a kit module, by local name. */
function kitImports(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !/^@kit(?:\/|$)/.test(n.moduleSpecifier.text)) continue;
    const nb = n.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) out.set(e.name.text, (e.propertyName ?? e.name).text);
  }
  return out;
}

/** Scans `files` (hub/src path -> text). `read` gives a stylesheet a scanned file imports when it is not in `files`. */
export function structureScan(files: Readonly<Record<string, string>>, read: (file: string) => string | undefined = () => undefined): StructHit[] {
  const hits: StructHit[] = [];
  const sheetText = (f: string) => files[f] ?? read(f) ?? '';
  const lookCache = new Map<string, Map<string, string[]>>();
  /** class -> the look properties its rules declare, for one stylesheet */
  const lookOf = (cssFile: string): Map<string, string[]> => {
    let m = lookCache.get(cssFile);
    if (m) return m;
    m = new Map();
    for (const r of cssRules(sheetText(cssFile))) {
      const props = r.decls.map((d) => d.prop).filter(isLook);
      if (!props.length) continue;
      for (const c of styledClasses(r.sel)) m.set(c, [...(m.get(c) ?? []), ...props]);
    }
    lookCache.set(cssFile, m);
    return m;
  };

  for (const [file, text] of Object.entries(files)) {
    if (!isConsumer(file) || isTest(file)) continue;
    if (file.endsWith('.css')) {
      const seen = new Set<string>();
      for (const r of cssRules(text)) {
        const at = r.decls[0]?.at ?? text.indexOf(r.sel);
        if (reachesOut(r.sel) && r.decls.length) hits.push({ rule: 'struct.globalReach', file, line: lineAt(text, at), what: r.sel.replace(/\s+/g, ' ').slice(0, 120) });
        const has = (re: RegExp, pointer = false) => r.decls.some((d) => re.test(d.prop) && (pointer ? /\bpointer\b/.test(d.value) : !RESET.test(d.value.trim())));
        if (has(/^cursor$/, true) && has(/^background(?:-color)?$/) && has(/^border(?:-(?:block|inline)(?:-(?:start|end))?|-top|-right|-bottom|-left)?$/) && !seen.has(r.sel)) {
          seen.add(r.sel);
          hits.push({ rule: 'struct.pressable', file, line: lineAt(text, at), what: r.sel.replace(/\s+/g, ' ').slice(0, 120) });
        }
      }
      continue;
    }
    if (!file.endsWith('.tsx')) continue;
    const sf = parseTsx(file, text);
    const modules = cssModules(sf, file);
    const kit = kitImports(sf);
    const restyled = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName;
        const attr = (name: string) => n.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name);
        const cn = attr('className');
        const classes: { cssFile: string; cls: string }[] = [];
        if (cn?.initializer && ts.isJsxExpression(cn.initializer) && cn.initializer.expression) moduleClassesIn(cn.initializer.expression, modules, (cssFile, cls) => classes.push({ cssFile, cls }), true);
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) {
          if (tag.text === 'input') {
            const t = attr('type')?.initializer;
            const kind = t && ts.isStringLiteral(t) ? t.text : t && ts.isJsxExpression(t) && t.expression && ts.isStringLiteralLike(t.expression) ? t.expression.text : '';
            if (kind === 'radio' || kind === 'checkbox') hits.push({ rule: 'struct.rawChoice', file, line, what: `<input type="${kind}">` });
          }
          if (tag.text === 'p') {
            const named = classes.find((c) => HINT_CLASS.test(c.cls));
            if (named) hits.push({ rule: 'struct.looseHint', file, line, what: `<${tag.text} className=….${named.cls}>` });
          }
        } else if (ts.isIdentifier(tag) && KIT_LOOK_PARTS.has(kit.get(tag.text) ?? '')) {
          for (const c of classes) {
            const props = lookOf(c.cssFile).get(c.cls);
            const key = `${c.cssFile}#${c.cls}`;
            if (!props || restyled.has(key)) continue;
            restyled.add(key);
            hits.push({ rule: 'struct.kitRestyle', file, line, what: `<${kit.get(tag.text)}> takes .${c.cls} (${c.cssFile}), which sets ${[...new Set(props)].slice(0, 5).join(', ')}` });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return hits;
}

/** Hits counted per rule and file. */
export function structureCounts(hits: readonly StructHit[]): Record<StructRule, Record<string, number>> {
  const out = Object.fromEntries(STRUCT_RULES.map((r) => [r, {}])) as Record<StructRule, Record<string, number>>;
  for (const h of hits) out[h.rule][h.file] = (out[h.rule][h.file] ?? 0) + 1;
  return out;
}
