// Spacing conformance. Kit surfaces own their spacing:
// a page or shell class passed to a kit overlay (Popover, Drawer, Dialog, Menu, MenuItem, Sheet, PickerPanel) sets no
// padding or margin of its own beyond the kit's spacing roles (--pad-*, --surface-inset, --gap-section*); page and
// shell CSS spaces without viewport, font, container or percent lengths (stylelint already rejects raw px/rem/em
// spacing); and no page or shell TSX sets spacing in an inline style, where stylelint cannot see it.
// What it reads: TSX through the TypeScript parser (every class of a CSS module named in a kit overlay's className,
// and style objects written inline, spread in, or held in a const of the same file); CSS through a walker that keeps
// nested rules and at-rules apart from the declarations around them, plus composes: inside the same file. A style
// object built by a call or passed in as a prop is out of reach. Offenders found when the rule started are listed
// below and may only shrink: a stale row fails.
// The geometry half of the guard is kit/overlays/spacing.spec.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { cssModules, cssRules, initializerOf, lineOf, moduleClassesIn, parseTsx, styledClasses } from './conformance/cssScan';

const SRC = join(import.meta.dirname, '..');
const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const owned = (f: string) => /^(pages\/[^/]+|shell)\//.test(f);
const read = (keep: (f: string) => boolean): Record<string, string> => Object.fromEntries(ALL.filter(keep).map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
const tsx = read((f) => owned(f) && f.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(f));
const css = read((f) => owned(f) && f.endsWith('.css'));

// Rows: "<file> <what>" (a space between them) as the failure names them, without the line (lines move).
const ALLOWED_KIT_PAD = new Set<string>([]); // emptied once shell menus used role tokens
const ALLOWED_RAW = new Set([
  'shell/CommandPalette.module.css padding-block-start: 12vh', // the palette sits a fixed share down the screen, as kit Dialog does
]);
const ALLOWED_INLINE = new Set([
  'pages/logs/parts/LogList.tsx paddingBlockStart', // virtual list spacers: the height of the rows not drawn, above and below
  'pages/logs/parts/LogList.tsx paddingBlockEnd',
]);

function ratchet(hits: Map<string, string[]>, allowed: ReadonlySet<string>, fix: string) {
  const bad = [...hits].filter(([k]) => !allowed.has(k)).flatMap(([k, lines]) => lines.map((l) => `${k} (line ${l})`));
  expect.soft(bad, fix).toEqual([]);
  expect([...allowed].filter((k) => !hits.has(k)), 'these rows are clean now: remove them from this file').toEqual([]);
}
const add = (m: Map<string, string[]>, k: string, line: number) => m.set(k, [...(m.get(k) ?? []), String(line)]);

// ── CSS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SPACING_PROP = /^(?:margin|padding|gap|row-gap|column-gap)(?:-[\w-]+)?$/;
// Lengths that are not a --sp-* token: viewport, font-relative, container and percent units (px/rem/em are stylelint's).
const RAW_LEN = /(?<![\w-])(-?\d*\.?\d+)(vh|vw|vi|vb|vmin|vmax|[sdl]v(?:h|w|i|b|min|max)|ch|rch|ex|rex|lh|rlh|cap|rcap|ic|ric|cq(?:w|h|i|b|min|max)|%)(?![\w-])/gi;
// env(name, fallback): the name is no length, the fallback is.
const rawLen = (v: string) => [...v.replace(/env\(\s*[\w-]+\s*,?/g, ' ').matchAll(RAW_LEN)].some((m) => Number.parseFloat(m[1] ?? '0') !== 0);

// ── TSX ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const KIT = /^(?:Popover|Drawer|Dialog|Menu|MenuItem|Sheet|PickerPanel)$/;
const INLINE_SPACING = /^(?:margin|padding|gap|rowGap|columnGap)/;
const nameOf = (n: ts.PropertyName | undefined): string | null => {
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteralLike(n) || ts.isNumericLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n) && ts.isStringLiteralLike(n.expression)) return n.expression.text;
  return null;
};
const unwrap = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) ? unwrap(e.expression) : e);

/** The classes each CSS module gives a kit overlay (cssFile -> classes), and inline style spacing ("<file> <prop>" -> lines). */
function scanTsx(files: Record<string, string>) {
  const onKit = new Map<string, Set<string>>();
  const inlineHits = new Map<string, string[]>();
  for (const [file, text] of Object.entries(files)) {
    const sf = parseTsx(file, text);
    const modules = cssModules(sf, file);
    const styleProps = (e: ts.Expression, line: number, depth = 0): void => {
      if (depth > 8) return;
      const x = unwrap(e);
      if (ts.isObjectLiteralExpression(x)) {
        for (const p of x.properties) {
          if (ts.isSpreadAssignment(p)) { styleProps(p.expression, line, depth + 1); continue; }
          const k = nameOf(p.name);
          if (k && INLINE_SPACING.test(k)) add(inlineHits, `${file} ${k}`, line);
        }
      } else if (ts.isIdentifier(x)) {
        const init = initializerOf(x);
        if (init) styleProps(init, line, depth + 1);
      } else if (ts.isConditionalExpression(x)) {
        styleProps(x.whenTrue, line, depth + 1);
        styleProps(x.whenFalse, line, depth + 1);
      } else if (ts.isBinaryExpression(x) && (x.operatorToken.kind === ts.SyntaxKind.BarBarToken || x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
        styleProps(x.left, line, depth + 1);
        styleProps(x.right, line, depth + 1);
      }
    };
    // A kit overlay imported under another name (import { Popover as Floating } from '@kit') is still that overlay.
    const kitAs = new Map<string, string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== '@kit') continue;
      const b = st.importClause?.namedBindings;
      if (b && ts.isNamedImports(b)) for (const e of b.elements) if (e.propertyName) kitAs.set(e.name.text, e.propertyName.text);
    }
    const visit = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const spelled = n.tagName.getText(sf).split('.').pop() ?? '';
        const tag = kitAs.get(spelled) ?? spelled;
        for (const a of n.attributes.properties) {
          if (!ts.isJsxAttribute(a) || !a.initializer || !ts.isJsxExpression(a.initializer) || !a.initializer.expression) continue;
          const attr = a.name.getText(sf);
          if (attr === 'className' && KIT.test(tag)) moduleClassesIn(a.initializer.expression, modules, (f, c) => onKit.set(f, (onKit.get(f) ?? new Set()).add(c)), true);
          if (attr === 'style') styleProps(a.initializer.expression, sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { onKit, inlineHits };
}
/** composes: a class on a kit overlay brings the classes it composes from the same file along. */
function addComposes(onKit: Map<string, Set<string>>, sheets: Record<string, string>) {
  for (const [file, classes] of onKit) {
    const rs = cssRules(sheets[file] ?? '');
    for (let grew = true; grew;) {
      grew = false;
      for (const r of rs) {
        if (!styledClasses(r.sel).some((c) => classes.has(c))) continue;
        for (const d of r.decls) {
          if (d.prop !== 'composes' || /\bfrom\b/.test(d.value)) continue;
          for (const c of d.value.split(/\s+/)) if (c && !classes.has(c)) { classes.add(c); grew = true; }
        }
      }
    }
  }
}

function kitPadHits(sheets: Record<string, string>, onKit: Map<string, Set<string>>) {
  const hits = new Map<string, string[]>();
  for (const [file, text] of Object.entries(sheets)) {
    const classes = onKit.get(file);
    if (!classes) continue;
    for (const r of cssRules(text)) {
      const cls = styledClasses(r.sel).find((c) => classes.has(c));
      if (!cls) continue;
      for (const d of r.decls) {
        if (!SPACING_PROP.test(d.prop)) continue;
        const prop = d.prop.replace(/-.*/, '');
        // The kit's spacing roles are the kit's own spacing: a class may restate them (an unstyled react-aria row has no inset).
        const roleOnly = d.value.replace(/var\(--(?:pad-[\w-]+|surface-inset|gap-section(?:-label)?)\)/g, '').replace(/calc\(|[-*\s()]|(?<![\w.])[0-9.]+(?![\w.%])/g, '') === '';
        if ((prop === 'padding' || prop === 'margin') && !roleOnly) add(hits, `${file} .${cls} ${prop}`, lineOf(text, d.at));
      }
    }
  }
  return hits;
}

function rawHits(sheets: Record<string, string>) {
  const hits = new Map<string, string[]>();
  for (const [file, text] of Object.entries(sheets)) {
    const rs = cssRules(text);
    // A custom property of this file holding such a length counts when spacing reads it.
    // Local custom properties that hold a raw length, directly or through other local ones (--a: 5vh; --b: var(--a)).
    const props = rs.flatMap((r) => r.decls).filter((d) => d.prop.startsWith('--'));
    const local = new Set(props.filter((d) => rawLen(d.value)).map((d) => d.prop));
    for (let grew = true; grew;) {
      grew = false;
      for (const d of props) if (!local.has(d.prop) && [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].some((m) => local.has(m[1] ?? ''))) { local.add(d.prop); grew = true; }
    }
    for (const r of rs) {
      for (const d of r.decls) {
        if (!SPACING_PROP.test(d.prop)) continue;
        const viaLocal = [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)].some((m) => local.has(m[1] ?? ''));
        if (rawLen(d.value.replace(/var\(\s*--[\w-]+\s*,?/g, ' ')) || viaLocal) add(hits, `${file} ${d.prop}: ${d.value}`, lineOf(text, d.at));
      }
    }
  }
  return hits;
}

const scanned = scanTsx(tsx);
addComposes(scanned.onKit, css);

describe('spacing', () => {
  it('a page or shell class on a kit overlay sets no padding or margin: the kit surface owns it', () => {
    ratchet(kitPadHits(css, scanned.onKit), ALLOWED_KIT_PAD, 'drop the padding/margin and use the kit surface (or its spacing prop) instead');
  });

  it('page and shell spacing uses tokens: no viewport, font, container or percent lengths', () => {
    ratchet(rawHits(css), ALLOWED_RAW, 'use a --sp-* token from kit/tokens.css');
  });

  it('no page or shell TSX sets spacing in an inline style (stylelint cannot see it)', () => {
    ratchet(scanned.inlineHits, ALLOWED_INLINE, 'move the spacing into the CSS module, with a token');
  });
});

// The readers on small sources: each case is one way a spacing rule could hide (or be blamed wrongly).
describe('spacing readers', () => {
  const kit = (tsxText: string, cssText: string) => {
    const { onKit } = scanTsx({ 'pages/x/V.tsx': tsxText });
    addComposes(onKit, { 'pages/x/v.module.css': cssText });
    return [...kitPadHits({ 'pages/x/v.module.css': cssText }, onKit).keys()];
  };
  const PAD = '.surface { padding: var(--sp-8); }';
  it('finds every module class in a kit className, either quote, after an arrow prop', () => {
    expect(kit(`import s from './v.module.css';\nconst x = <Popover className={cx(s.base, s.surface)} />;`, PAD)).toEqual(['pages/x/v.module.css .surface padding']);
    expect(kit(`import s from "./v.module.css";\nconst x = <Popover onOpenChange={(v) => set(v)} className={s.surface} />;`, PAD)).toEqual(['pages/x/v.module.css .surface padding']);
    expect(kit(`import s from './v.module.css';\nconst x = <Popover className={s['surface']}>a</Popover>;`, PAD)).toEqual(['pages/x/v.module.css .surface padding']);
  });
  it('follows composes: in the same file', () => {
    expect(kit(`import s from './v.module.css';\nconst x = <Popover className={s.surface} />;`, '.surface { composes: inset; } .inset { padding: var(--sp-8); }')).toEqual(['pages/x/v.module.css .inset padding']);
  });
  it('blames a descendant rule on the descendant, not the overlay', () => {
    expect(kit(`import s from './v.module.css';\nconst x = <Popover className={s.surface}><div className={s.child} /></Popover>;`, '.surface .child { padding: var(--sp-4); } .surface:not(.child) { color: red; }')).toEqual([]);
  });
  it('keeps an outer declaration beside a nested rule, and resolves & against its parent', () => {
    const tx = `import s from './v.module.css';\nconst x = <Popover className={s.surface} />;`;
    expect(kit(tx, '.surface {\n  padding: var(--sp-8);\n  & .child { color: var(--hx-ink); }\n}')).toEqual(['pages/x/v.module.css .surface padding']);
    expect(kit(tx, '.wrap { & .surface { margin: var(--sp-2); } }')).toEqual(['pages/x/v.module.css .surface margin']);
    expect(kit(tx, '.surface { @media (width < 40rem) { padding: var(--sp-2); } }')).toEqual(['pages/x/v.module.css .surface padding']);
  });
  it('sees an overlay imported under another name, through :is()/:where(), and under each alternative of a nested list', () => {
    expect(kit(`import { Popover as Floating } from '@kit';\nimport s from './v.module.css';\nconst x = <Floating className={s.surface} />;`, PAD)).toEqual(['pages/x/v.module.css .surface padding']);
    const tx = `import s from './v.module.css';\nconst x = <Popover className={s.surface} />;`;
    expect(kit(tx, ':is(.surface) { padding: var(--sp-8); }')).toEqual(['pages/x/v.module.css .surface padding']);
    expect(kit(tx, ':where(.surface) { margin: var(--sp-8); }')).toEqual(['pages/x/v.module.css .surface margin']);
    expect(kit(tx, '.surface, .other { & .child { padding: var(--sp-8); } }')).toEqual([]);
    expect(kit(tx, '.wrap, .other { & .surface { padding: var(--sp-8); } }')).toEqual(['pages/x/v.module.css .surface padding']);
  });
  it('a destructured name is the one in scope, never an outer variable of the same name', () => {
    const inline = (src: string) => [...scanTsx({ 'pages/x/V.tsx': src }).inlineHits.keys()];
    expect(inline('const style = { padding: 16 };\nfunction F({ style }) { return <div style={style} />; }')).toEqual([]);
    expect(inline('const style = { padding: 16 };\nfunction F(p) { const { style } = p; return <div style={style} />; }')).toEqual([]);
  });
  it('rejects viewport, font, container and percent lengths in any component, but not zero', () => {
    const raw = (c: string) => [...rawHits({ 'pages/x/v.module.css': c }).keys()];
    for (const c of ['.a { padding: env(missing-inset, 10vh); }', '.a { padding: 10%; }', '.a { padding: 0vh 20vh; }', '.a { gap: 5dvw; }', '.a { --local-gap: 50vh; gap: var(--local-gap); }', '.a { --raw-gap: 50vh; --local-gap: var(--raw-gap); gap: var(--local-gap); }', '.a { margin: var(--sp-2, 3ch); }', '.a { padding-inline: 2cqi; }']) expect(raw(c), c).toHaveLength(1);
    for (const c of ['.a { padding: 0%; }', '.a { padding: var(--sp-4) 0vh; }', '.a { gap: var(--sp-2); width: 50vw; }', '.a { padding: env(safe-area-inset-bottom); }']) expect(raw(c), c).toEqual([]);
  });
  it('reads inline style objects however they are written, and never a comment', () => {
    const inline = (src: string) => [...scanTsx({ 'pages/x/V.tsx': src }).inlineHits.keys()];
    expect(inline('const inset = { padding: 16 };\nconst a = <div style={inset} />;')).toEqual(['pages/x/V.tsx padding']);
    expect(inline('const a = <div style = {{ padding: 16 }} />;')).toEqual(['pages/x/V.tsx padding']);
    expect(inline('const a = <div style={{ "marginTop": 16 }} />;')).toEqual(['pages/x/V.tsx marginTop']);
    expect(inline("const inset = { gap: 4 };\nconst a = <div style={{ ...inset, color: 'red' }} />;")).toEqual(['pages/x/V.tsx gap']);
    expect(inline("const a = <div style={{ ['paddingInline']: 1 }} />;")).toEqual(['pages/x/V.tsx paddingInline']);
    expect(inline('// Old example: <div style={{padding:16}}/>\nconst a = <div style={{ color: "red" }} />;')).toEqual([]);
    const shadow = 'function A() { const style = { color: "red" }; return <div style={style} />; }\nfunction B() { const style = { padding: 16 }; return <pre>{JSON.stringify(style)}</pre>; }';
    expect(inline(shadow), 'the style A applies is its own').toEqual([]);
    expect(inline(shadow.replace('color: "red"', 'padding: 16').replace('{ padding: 16 }; return <pre>', '{ color: "red" }; return <pre>'))).toEqual(['pages/x/V.tsx padding']);
  });
});
