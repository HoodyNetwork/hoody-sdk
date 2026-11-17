// The ui.* rules of the page-anatomy detector (scripts/lint/anatomy-ui.cjs)
// against fixtures: every must-hit is also scanned with its rule switched off (`disabled`), and its hits must vanish
// (the red half of red-first); every control stays clean. Only ui.* hits are judged here: the layout rules have their own
// fixtures (conformance.anatomy.detector.test.ts).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Hit = { rule: string; file: string; scope: string; line: number; msg: string };
type Registry = { exceptions: { path: string; rules: string[]; sites?: string[] }[] };
type Detector = {
  RULES: string[];
  CSS_RULES: string[];
  EXPLAIN: Record<string, string>;
  loadRegistry(anatomyDir?: string, exceptionsPath?: string): Registry;
  scan(files: Record<string, string>, opts?: { disabled?: string[]; registry?: Registry }): { hits: Hit[]; usedExceptions: string[] };
};
const A = createRequire(import.meta.url)('../../scripts/lint/anatomy.cjs') as Detector;
const UI = ['ui.kitClass', 'ui.pageLook', 'ui.rawControl'];

/** A tiny kit: legacy and strict layouts, controls, a Visual, overlays, a kit CSS module that reads --btn-req, and the theme attributes. */
const KIT: Record<string, string> = {
  'kit/index.ts': [
    "export { Panel, PageFrame } from './layouts/Layouts';",
    "export * from './layouts/anatomy/Section';",
    "export * from './controls/Button';",
    "export * from './misc/Misc';",
    "export * from './overlays/Overlays';",
  ].join('\n'),
  'kit/layouts/Layouts.tsx': 'export function Panel(p: any) { return <section>{p.children}</section>; }\nexport function PageFrame(p: any) { return <div>{p.children}</div>; }',
  'kit/layouts/anatomy/Section.tsx': 'export function Section(p: any) { return <section>{p.children}</section>; }',
  'kit/controls/Button.tsx': [
    "import s from './Button.module.css';",
    'export function Button(p: any) { return <button className={s.button} />; }',
    'export function TextButton(p: any) { return <button />; }',
    'export function Link(p: any) { return <a href={p.href} />; }',
    'export function Tabs(p: any) { return <div role="tablist" />; }',
  ].join('\n'),
  'kit/controls/Button.module.css': '.button { --btn-h: max(var(--btn-req, var(--btn-nom)), var(--touch-min)); block-size: var(--btn-h); color: var(--hx-ink); }',
  'kit/misc/Misc.tsx': [
    'export function Icon(p: any) { return <span />; }',
    'export function Visual(p: any) { return <figure>{p.children}</figure>; }',
    'export function Widget(p: any) { return <div>{p.children}</div>; }',
    'export function Band(p: any) { return <div>{p.children}</div>; }',
  ].join('\n'),
  'kit/overlays/Overlays.tsx': 'export function Dialog(p: any) { return <div role="dialog">{p.children}</div>; }\nexport function Drawer(p: any) { return <aside>{p.children}</aside>; }',
  'kit/tokens.css': ':root { --hx-ink: #111; --sp-2: 8px; --ctl-h: 40px; }\n[data-hx-theme="dark"] { --hx-ink: #eee; }\n[data-hx-hl="1"] { --hx-acc: #00f; }\n[data-density="compact"] { --row-h: 32px; }\n:root[data-hx-perf="low"] { --dur-1: 0ms; }',
};

const PAGE = 'pages/x/view.tsx';
const PCSS = 'pages/x/v.module.css';
const IMPORTS = "import { Button, TextButton, Link, Icon, Visual, Widget, Band, Dialog, Drawer, Panel, Tabs } from '@kit';\nimport s from './v.module.css';\n";
/** A page that renders `jsx` (with the kit and its CSS module imported), plus the module's CSS and any extra files. */
const page = (jsx: string, css = '', extra: Record<string, string> = {}) => ({ [PAGE]: `${IMPORTS}export function V() { return (${jsx}); }`, [PCSS]: css, ...extra });

function scanUi(files: Record<string, string>, disabled: string[] = []) {
  return A.scan({ ...KIT, ...files }, { disabled }).hits.filter((h) => h.rule.startsWith('ui.'));
}
const of = (hits: Hit[], rule: string) => hits.filter((h) => h.rule === rule);

/** The fixture has exactly `n` hits of `rule`, and none once `rule` is switched off. */
function must(name: string, rule: string, files: Record<string, string>, n = 1) {
  it(`${rule}: ${name}`, () => {
    expect(of(scanUi(files), rule), 'hits').toHaveLength(n);
    expect(of(scanUi(files, [rule]), rule), 'rule switched off').toEqual([]);
  });
}
/** The fixture has no hit of `rule` (every ui rule when `rule` is omitted). */
function clean(name: string, files: Record<string, string>, rule?: string) {
  it(`control: ${name}`, () => {
    const hits = scanUi(files);
    expect(rule ? of(hits, rule) : hits).toEqual([]);
  });
}

describe('ui rules: ids', () => {
  it('the three ui rules follow the layout rules, ui.pageLook is a CSS rule, each has an explanation', () => {
    // eight more rules follow them (conformance.anatomy.ui.set8.test.ts)
    expect(A.RULES.filter((r) => r.startsWith('ui.')).slice(0, UI.length)).toEqual(UI);
    expect(A.CSS_RULES).toContain('ui.pageLook');
    expect(A.CSS_RULES).not.toContain('ui.kitClass');
    for (const r of UI) expect(A.EXPLAIN[r]).toBeTruthy();
  });
});

describe('ui rules: scope (consumer files only)', () => {
  const tsx = "export function V() { return <button>go</button>; }";
  const css = '.a { color: var(--hx-ink); }';
  for (const root of ['pages/x', 'shell', 'ask', 'app']) {
    must(`a <button> in ${root}/`, 'ui.rawControl', { [`${root}/w.tsx`]: tsx });
    must(`a colour in ${root}/ CSS`, 'ui.pageLook', { [`${root}/w.module.css`]: css });
  }
  clean('kit/, kit/gallery/, app/DevToolbar* and test files are never read', {
    'kit/gallery/view.tsx': "import { Button } from '@kit';\nexport function G() { return <div data-hx-theme=\"dark\" style={{ color: 'red' }}><button /><Button className=\"x\" /></div>; }",
    'kit/gallery/g.module.css': css,
    'kit/controls/Extra.module.css': css,
    'app/DevToolbar.tsx': tsx,
    'app/DevToolbar.module.css': css,
    'pages/x/view.test.tsx': tsx,
    'pages/x/shots.tsx': tsx,
    'pages/x/fixtures.tsx': tsx,
  });
});

describe('ui.kitClass', () => {
  must('className on a kit Button', 'ui.kitClass', page('<Button className={s.a}>go</Button>'));
  must('renamed import (Icon as I)', 'ui.kitClass', { [PAGE]: "import { Icon as I } from '@kit';\nexport function V() { return <I name=\"x\" className=\"tone\" />; }" });
  must('a page barrel re-exporting a kit part', 'ui.kitClass', { [PAGE]: "import { Glyph } from './barrel';\nexport function V() { return <Glyph className=\"tone\" />; }", 'pages/x/barrel.ts': "export { Icon as Glyph } from '@kit';" });
  must('a deep @kit/... import', 'ui.kitClass', { [PAGE]: "import { Icon } from '@kit/misc/Misc';\nexport function V() { return <Icon className=\"tone\" />; }" });
  must('className in an object spread', 'ui.kitClass', page("<Button {...{ className: s.a }}>go</Button>"));
  must('a non-spacing style on a kit part', 'ui.kitClass', page("<Button style={{ color: 'red' }}>go</Button>"));
  must('className and a non-spacing style are two sites', 'ui.kitClass', page("<Button className={s.a} style={{ opacity: 0.5 }}>go</Button>"), 2);
  must('cloneElement(x, { className })', 'ui.kitClass', { [PAGE]: "import { cloneElement } from 'react';\nexport function V(p: any) { return cloneElement(p.child, { className: 'big' }); }" });
  must('React.cloneElement(x, { style }) with a colour', 'ui.kitClass', { [PAGE]: "import React from 'react';\nexport function V(p: any) { return React.cloneElement(p.child, { style: { color: 'red' } }); }" });

  it('ui.kitClass: a className inside a kit overlay takes the overlay scope', () => {
    const hits = of(scanUi(page('<Dialog overlayId="edit"><Button className={s.a}>go</Button></Dialog>')), 'ui.kitClass');
    expect(hits.map((h) => h.scope)).toEqual(['overlay:edit']);
  });
  it('ui.kitClass: a spacing-only style on a kit part is layout.inlineSpacing, not ui.kitClass', () => {
    const r = A.scan({ ...KIT, ...page("<Button style={{ padding: 4, gap: '2px' }}>go</Button>") });
    expect(r.hits.filter((h) => h.rule === 'ui.kitClass')).toEqual([]);
    expect(r.hits.filter((h) => h.rule === 'layout.inlineSpacing')).toHaveLength(2);
  });

  describe('carriers (a local component that forwards its className/style to a kit part)', () => {
    // bots ComputerLink (pages/bots/parts/Bits.tsx:69): destructured className forwarded unchanged to Link and TextButton
    const computerLink = [
      IMPORTS,
      'export function ComputerLink({ handle, children, className }: { handle?: string; children: any; className?: string }) {',
      '  if (!handle) return <span className={className}>{children}</span>;',
      '  if (handle === "x") return <Link href="/c" className={className}>{children}</Link>;',
      '  return <TextButton className={className}>{children}</TextButton>;',
      '}',
      'export function V() {',
      '  return <div>',
      '    <ComputerLink handle="a" className={s.big}>a</ComputerLink>',
      '    <ComputerLink handle="b">b</ComputerLink>',
      '  </div>;',
      '}',
    ].join('\n');
    it('ui.kitClass: counted at a call that passes className, 0 at a call without, 0 on the forwarding lines', () => {
      const hits = of(scanUi({ [PAGE]: computerLink }), 'ui.kitClass');
      expect(hits.map((h) => h.line)).toEqual([11]);
      expect(of(scanUi({ [PAGE]: computerLink }, ['ui.kitClass']), 'ui.kitClass')).toEqual([]);
    });
    must('props.className forwarded (whole props)', 'ui.kitClass', { [PAGE]: `${IMPORTS}function Tone(props: any) { return <Icon name="x" className={props.className} />; }\nexport function V() { return <Tone className="ok" />; }` });
    must('a rest spread carries className', 'ui.kitClass', { [PAGE]: `${IMPORTS}function Tone({ name, ...rest }: any) { return <Icon name={name} {...rest} />; }\nexport function V() { return <Tone name="x" className="ok" />; }` });
    clean('a rest spread that destructured className out carries nothing', { [PAGE]: `${IMPORTS}function Tone({ name, className, ...rest }: any) { return <Icon name={name} {...rest} />; }\nexport function V() { return <Tone name="x" className="ok" />; }` }, 'ui.kitClass');
    // a long chain declared outer-first (each pass of the discovery finds one more link): found at any length, no pass cap
    must('a chain of nine carriers declared outer-first', 'ui.kitClass', {
      [PAGE]: `${IMPORTS}${Array.from({ length: 9 }, (_, i) => `function W${i}({ className }: any) { return ${i === 8 ? '<Icon className={className} />' : `<W${i + 1} className={className} />`}; }`).join('\n')}\nexport function V() { return <W0 className="ok" />; }`,
    });
    must('a carrier of a carrier', 'ui.kitClass', { [PAGE]: `${IMPORTS}function Inner({ className }: any) { return <Icon className={className} />; }\nfunction Outer({ className }: any) { return <Inner className={className} />; }\nexport function V() { return <Outer className="ok" />; }` });
    must('a carrier that forwards style, called with a colour', 'ui.kitClass', { [PAGE]: `${IMPORTS}function Tone({ style }: any) { return <Icon style={style} />; }\nexport function V() { return <Tone style={{ color: 'red' }} />; }` });
    // billing FreeBadge (pages/billing/parts/FreeBadge.tsx:27): the carrier adds its own class to the forwarded one, so its own line is a site
    it('ui.kitClass: a forwarding line that also adds its own class is a site, and so is each call that passes className', () => {
      const src = `${IMPORTS}export function FreeBadge({ className }: { className?: string }) {\n  return <Button variant="ghost" className={className ? \`\${s.badge} \${className}\` : s.badge}>free</Button>;\n}\nexport function V() { return <div><FreeBadge /><FreeBadge className={s.wide} /></div>; }`;
      expect(of(scanUi({ [PAGE]: src }), 'ui.kitClass').map((h) => h.line)).toEqual([4, 6]);
    });
    it('ui.kitClass: a name that only spells className (a nested parameter) is a direct site, not a carrier', () => {
      const src = `${IMPORTS}function Row({ className, items }: any) { return <div>{items.map((className: string) => <Icon key={className} className={className} />)}</div>; }\nexport function V() { return <Row items={[]} className="x" />; }`;
      expect(of(scanUi({ [PAGE]: src }), 'ui.kitClass').map((h) => h.line)).toEqual([3]);
    });
  });

  clean('legacy <Panel className> is layout.legacy, not ui.kitClass', page('<Panel className={s.a}>x</Panel>'), 'ui.kitClass');
  clean('legacy <Tabs className> in a page', page('<Tabs className={s.a} />'), 'ui.kitClass');
  clean('an <Icon> defined locally in the page', { [PAGE]: 'function Icon(p: any) { return <span />; }\nexport function V() { return <Icon className="x" />; }' });
  clean('an untraced spread on a kit part', { [PAGE]: `${IMPORTS}export function V(p: any) { return <Button {...p.rest}>go</Button>; }` }, 'ui.kitClass');
  clean('className on an intrinsic element', page('<div className={s.a} />'), 'ui.kitClass');
});

describe('ui.pageLook: CSS', () => {
  const families: [string, string][] = [
    ['colour', 'color: var(--hx-muted);'],
    ['background', 'background: var(--hx-panel);'],
    ['border', 'border: 1px solid var(--hx-line);'],
    ['radius', 'border-radius: var(--r-pill);'],
    ['outline', 'outline: 2px solid var(--focus-ring);'],
    ['shadow', 'box-shadow: var(--sh-1);'],
    ['type size', 'font-size: var(--fs-sm);'],
    ['type weight', 'font-weight: 600;'],
    ['type case', 'text-transform: uppercase;'],
    ['type tracking', 'letter-spacing: 0.04em;'],
    ['type line-height', 'line-height: 1.2;'],
    ['type decoration', 'text-decoration: underline;'],
    ['motion transition', 'transition: opacity var(--dur-1);'],
    ['motion animation', 'animation: spin 1s linear infinite;'],
    ['effect opacity', 'opacity: 0.5;'],
    ['effect filter', 'filter: blur(2px);'],
    ['effect backdrop', 'backdrop-filter: blur(4px);'],
    ['effect blend', 'mix-blend-mode: multiply;'],
    ['effect mask', 'mask: url(x.svg);'],
    ['another clip-path', 'clip-path: circle(40%);'],
    ['interaction cursor: pointer', 'cursor: pointer;'],
    ['generated content', "content: '→';"],
    ['outline: none (removes the focus ring)', 'outline: none;'],
    ['a kit-private token read by a layout property (the D9a .askField input shape)', 'block-size: var(--ctl-h);'],
    ['a kit property override holding a raw value (--btn-req, billing FreeBadge.module.css:15)', '--btn-req: 44px;'],
    ['a kit property override holding a kit token (--btn-req, home parts.module.css:246): one site', '--btn-req: var(--ctl-h);'],
    ['a page property holding a colour token', '--accent: var(--hx-blue);'],
    ['a page property holding a raw colour', '--accent: #12abef;'],
  ];
  for (const [name, decl] of families) must(name, 'ui.pageLook', { [PCSS]: `.a { ${decl} }` });
  must('a page property holding a raw radius that a look declaration reads (2 sites)', 'ui.pageLook', { [PCSS]: '.a { --r: 6px; border-radius: var(--r); }' }, 2);
  must('a page-drawn card frame (market Tiers.module.css shape): one site per look declaration', 'ui.pageLook', { [PCSS]: '.tier { display: grid; padding: var(--sp-4); background: var(--hx-card); border: 1px solid var(--hx-line); border-radius: var(--r-2); box-shadow: var(--sh-1); }' }, 4);
  must('@keyframes bodies are not sites; the animation declaration is', 'ui.pageLook', { [PCSS]: '@keyframes spin { from { opacity: 0; } to { transform: rotate(1turn); color: var(--hx-ink); } }\n.a { animation: spin 1s; }' });
  must('a look declaration inside @media and a nested rule', 'ui.pageLook', { [PCSS]: '@media (pointer: coarse) { .a { color: var(--hx-ink); & .b { background: var(--hx-panel); } } }' }, 2);
  must('a heading type token in shell CSS (K0 reads only pages/ CSS)', 'ui.pageLook', { 'shell/Other.module.css': '.a { font: var(--t-title); }' });
  must('a non-owner shell file', 'ui.pageLook', { 'shell/CommandPalette.module.css': '.a { color: var(--hx-ink); }' });

  clean('cursor: ew-resize, pointer-events, user-select, layout and spacing', { [PCSS]: '.a { cursor: ew-resize; pointer-events: none; user-select: none; display: grid; gap: var(--sp-2); inline-size: 12px; overflow: hidden; text-align: end; white-space: nowrap; }' });
  clean('the visually-hidden clip', { [PCSS]: '.srOnly { position: absolute; clip-path: inset(50%); clip: rect(0 0 0 0); overflow: hidden; }' });
  clean('resets: inherit, none, 0, currentColor, transparent', { [PCSS]: '.a { color: inherit; background: none; border: 0; border-block-end: none; fill: currentColor; background-color: transparent; font: inherit; text-decoration: none; box-shadow: none; }' });
  clean('a page property holding a spacing token or a number', { [PCSS]: '.a { --w: var(--sp-2); --cols: 3; --size: 6px; inline-size: var(--size); }' });
  clean('a read of spacing and z tokens', { [PCSS]: '.a { padding: var(--sp-2); z-index: var(--z-pop); }' });
  clean('look-owner files (shell frame)', { 'shell/TopBar.module.css': '.a { color: var(--hx-ink); }', 'shell/AppShell.module.css': '.a { background: var(--hx-bg); }', 'shell/Sidebar.tsx': "export function S() { return <span style={{ color: 'red' }} />; }" });
  it('ui.pageLook: --pad-card in page CSS is layout.cssReach only', () => {
    const r = A.scan({ ...KIT, [PCSS]: '.a { --pad-card: var(--sp-2); --gap-row: var(--sp-1); }' });
    expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toEqual([]);
    expect(r.hits.filter((h) => h.rule === 'layout.cssReach')).toHaveLength(2);
  });
  it('ui.pageLook: a heading type token in page CSS is layout.cssType only', () => {
    const r = A.scan({ ...KIT, [PCSS]: '.a { font: var(--t-title); }' });
    expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toEqual([]);
    expect(r.hits.filter((h) => h.rule === 'layout.cssType')).toHaveLength(1);
  });
});

describe('ui.pageLook: TSX', () => {
  must('data-hx-theme in JSX', 'ui.pageLook', page('<div data-hx-theme="dark" />'));
  must('data-density in JSX', 'ui.pageLook', page('<Widget data-density="compact" />'));
  must('data-hx-hl and data-hx-perf in JSX', 'ui.pageLook', page('<div data-hx-hl="1" data-hx-perf="low" />'), 2);
  must('a theme attribute in an object spread', 'ui.pageLook', page("<div {...{ 'data-hx-theme': 'dark' }} />"));
  it('ui.pageLook: the theme attributes are the ones kit/tokens.css selects on, read at scan time', () => {
    const files = { ...page('<div data-density="compact" />'), 'kit/tokens.css': '[data-hx-theme="dark"] { --hx-ink: #eee; }' };
    expect(of(scanUi(files), 'ui.pageLook')).toEqual([]);
  });
  // board options/Preview.tsx: a user theme's colours drawn inline
  must('an inline style={{ color }} on an intrinsic element', 'ui.pageLook', page('<span style={{ color: th.green }}>x</span>'));
  must('look properties in a style object held by a local const', 'ui.pageLook', { [PAGE]: "const box = { color: 'red', fontWeight: 600, display: 'grid' };\nexport function V() { return <div style={box} />; }" }, 2);
  must('an inline override of a kit property', 'ui.pageLook', page("<span style={{ '--btn-req': '44px' }} />"));
  clean('an inline layout style and an inline reset', page("<div><span style={{ display: 'grid', inlineSize: 4 }} /><span style={{ color: 'inherit' }} /></div>"), 'ui.pageLook');
  clean('data-* attributes that are not theme attributes', page('<div data-state="open" data-computer-color="x" />'), 'ui.pageLook');
});

describe('ui.pageLook: Visual-only rules', () => {
  const visual = (outside: string) => page(`<div><Visual><svg className={s.g}><rect className={s.r} /></svg></Visual>${outside}</div>`, '.g { fill: var(--hx-ink); }\n.r { stroke: var(--hx-line); }\n.g .r { opacity: 0.5; }');
  clean('a class used only inside <Visual>', visual(''), 'ui.pageLook');
  must('a class used inside and outside <Visual>', 'ui.pageLook', visual('<div className={s.g} />'), 2);
  must('a module accessed as s[x] exempts nothing', 'ui.pageLook', visual('<div className={s[k]} />'), 3);
  must('a module passed as a value exempts nothing', 'ui.pageLook', visual('<Row styles={s} />'), 3);
});

describe('ui rules: each counts on its own', () => {
  const css2 = '.box { background: var(--hx-panel); color: var(--hx-ink); }';
  const counts = (files: Record<string, string>) => {
    const h = scanUi(files);
    return { kitClass: of(h, 'ui.kitClass').length, pageLook: of(h, 'ui.pageLook').length };
  };
  it('<Button className={s.box}> with two look declarations is 1 ui.kitClass + 2 ui.pageLook', () => {
    expect(counts(page('<Button className={s.box}>go</Button>', css2))).toEqual({ kitClass: 1, pageLook: 2 });
    expect(of(scanUi(page('<Button className={s.box}>go</Button>', css2), ['ui.kitClass']), 'ui.kitClass')).toEqual([]);
    expect(of(scanUi(page('<Button className={s.box}>go</Button>', css2), ['ui.pageLook']), 'ui.pageLook')).toEqual([]);
  });
  it('adding <div className={s.box}> changes nothing', () => {
    expect(counts(page('<div><Button className={s.box}>go</Button><div className={s.box} /></div>', css2))).toEqual({ kitClass: 1, pageLook: 2 });
  });
  it('a third look declaration in the passed class adds 1 (the pile-on is caught)', () => {
    expect(counts(page('<Button className={s.box}>go</Button>', '.box { background: var(--hx-panel); color: var(--hx-ink); border-radius: var(--r-pill); }'))).toEqual({ kitClass: 1, pageLook: 3 });
  });
  it('a rule that reaches into kit internals counts its reach and its look declarations', () => {
    const files = page('<Button className={s.box}>go</Button>', '.box [data-hub-heading] { color: var(--hx-ink); font-weight: 600; }');
    const r = A.scan({ ...KIT, ...files });
    expect(r.hits.filter((h) => h.rule === 'layout.cssReach')).toHaveLength(1);
    expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toHaveLength(2);
  });
});

describe('ui.rawControl', () => {
  for (const tag of ['button', 'input', 'select', 'table', 'details', 'summary', 'form', 'dialog']) must(`<${tag}>`, 'ui.rawControl', page(`<${tag} />`));
  must('<a href>', 'ui.rawControl', page('<a href="/x">x</a>'));
  must('a hidden file input (board BoardView.tsx:1230 shape)', 'ui.rawControl', page('<input type="file" hidden onChange={pick} />'));
  must('an account sheet <form> inside a Drawer', 'ui.rawControl', page('<Drawer overlayId="sheet"><form onSubmit={go}><Button>save</Button></form></Drawer>'));
  const roles = ['button', 'link', 'checkbox', 'radio', 'radiogroup', 'switch', 'slider', 'spinbutton', 'tab', 'tablist', 'tabpanel', 'listbox', 'option', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'combobox', 'dialog', 'alertdialog', 'toolbar', 'grid', 'gridcell', 'tree', 'treeitem'];
  for (const role of roles) must(`role="${role}"`, 'ui.rawControl', page(`<div role="${role}" />`));
  must('a role chosen by a condition', 'ui.rawControl', page('<div role={open ? \'menu\' : \'presentation\'} />'));
  must('tabIndex={0}', 'ui.rawControl', page('<div tabIndex={0} />'));
  must('tabIndex that is not a literal', 'ui.rawControl', page('<div tabIndex={focusable ? 0 : -1} />'));
  must('onClick on a <div>', 'ui.rawControl', page('<div onClick={go} />'));
  must('onKeyDown on a <span>', 'ui.rawControl', page('<span onKeyDown={go} />'));
  must('onPointerDown on an <li>', 'ui.rawControl', page('<li onPointerDown={go} />'));
  must('onClick on an <a> without href', 'ui.rawControl', page('<a onClick={go}>x</a>'));
  must('a <button> in app/', 'ui.rawControl', { 'app/AgentSignIn.tsx': 'export function S() { return <button onClick={go}>x</button>; }' });
  must('one hit per element, whatever it carries', 'ui.rawControl', page('<button role="tab" tabIndex={0} onClick={go}>x</button>'));
  clean('textarea, role status/alert, meter/progressbar, tabIndex={-1}, a plain <a>, layout tags', page('<div><textarea /><div role="status" /><div role="alert" /><div role="meter" /><div role="progressbar" /><div tabIndex={-1} /><a>x</a><span /></div>'), 'ui.rawControl');
  clean('anything inside Visual (layout.visual judges it)', page('<Visual><svg><rect onClick={go} tabIndex={0} /></svg></Visual>'), 'ui.rawControl');
  clean('kit controls', page('<div><Button onPress={go}>x</Button><Link href="/x">x</Link></div>'), 'ui.rawControl');
});

describe('ui rules: the exception list', () => {
  it('an entry drops the ui hits it covers and is reported in usedExceptions; one that covers nothing is not', () => {
    const files = { ...KIT, ...page('<button />', '.a { color: var(--hx-ink); }') };
    const reg = A.loadRegistry();
    reg.exceptions = [
      { path: PCSS, rules: ['ui.pageLook'] },
      { path: 'pages/x/', rules: ['ui.kitClass'] },
    ];
    const r = A.scan(files, { registry: reg });
    expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toEqual([]);
    expect(r.hits.filter((h) => h.rule === 'ui.rawControl')).toHaveLength(1);
    expect(r.usedExceptions).toEqual([`${PCSS}|ui.pageLook`]);
  });

  it('overlapping entries are each credited, in either order of the list', () => {
    const files = { ...KIT, ...page('<button />', '.a { color: var(--hx-ink); }') };
    const entries = [
      { path: 'pages/', rules: ['ui.pageLook'] },
      { path: 'pages/x/', rules: ['ui.pageLook'] },
      { path: PCSS, rules: ['ui.pageLook'] },
    ];
    for (const list of [entries, [...entries].reverse()]) {
      const reg = A.loadRegistry();
      reg.exceptions = list;
      const r = A.scan(files, { registry: reg });
      expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toEqual([]);
      expect(r.usedExceptions).toEqual([`${PCSS}|ui.pageLook`, 'pages/x/|ui.pageLook', 'pages/|ui.pageLook'].sort());
    }
  });

  // An entry with sites covers only the hits in the functions it lists (the enclosing component, else the nearest
  // named function, else <module>); usedExceptions names each listed site that dropped a hit.
  it('an entry with sites drops only the hits in those sites and reports each used site', () => {
    const tsx = `${IMPORTS}export function V() { return (<button />); }\nexport function W() { return (<button />); }\nconst helper = () => <button />;\n`;
    const files = { ...KIT, ...page('<button />'), [PAGE]: tsx };
    const raw = (sites?: string[]) => {
      const reg = A.loadRegistry();
      reg.exceptions = [{ path: PAGE, rules: ['ui.rawControl'], ...(sites ? { sites } : {}) }];
      return A.scan(files, { registry: reg });
    };
    const lines = (r: { hits: { rule: string; line: number }[] }) => r.hits.filter((h) => h.rule === 'ui.rawControl').map((h) => h.line);
    expect(lines(raw(['none']))).toEqual([3, 4, 5]);
    expect(lines(raw())).toEqual([]);
    expect(raw().usedExceptions).toEqual([`${PAGE}|ui.rawControl`]);
    const one = raw(['W']);
    expect(lines(one)).toEqual([3, 5]);
    expect(one.usedExceptions).toEqual([`${PAGE}|ui.rawControl|W`]);
    const all = raw(['V', 'W', 'helper', 'gone']);
    expect(lines(all)).toEqual([]);
    expect(all.usedExceptions).toEqual([`${PAGE}|ui.rawControl|V`, `${PAGE}|ui.rawControl|W`, `${PAGE}|ui.rawControl|helper`].sort());
  });

  it('a hit in a helper inside a component sits at the component', () => {
    const files = { ...KIT, ...page('<div />'), [PAGE]: `${IMPORTS}export function V() { const row = () => <button />; return row(); }\n` };
    const at = (sites: string[]) => {
      const reg = A.loadRegistry();
      reg.exceptions = [{ path: PAGE, rules: ['ui.rawControl'], sites }];
      return A.scan(files, { registry: reg }).hits.filter((h) => h.rule === 'ui.rawControl').length;
    };
    expect(at(['V'])).toBe(0);
    expect(at(['row'])).toBe(1);
  });

  it('a CSS hit sits at <module>', () => {
    const files = { ...KIT, ...page('<div />', '.a { color: var(--hx-ink); }') };
    const reg = A.loadRegistry();
    reg.exceptions = [{ path: PCSS, rules: ['ui.pageLook'], sites: ['<module>'] }];
    const r = A.scan(files, { registry: reg });
    expect(r.hits.filter((h) => h.rule === 'ui.pageLook')).toEqual([]);
    expect(r.usedExceptions).toEqual([`${PCSS}|ui.pageLook|<module>`]);
  });
});
