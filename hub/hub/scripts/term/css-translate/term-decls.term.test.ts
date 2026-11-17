// term-decls.ts: a terminal value replaces the stylesheet's for one class and property, only while the stylesheet
// still says what the row was written against; every row of the table is live.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { translateModule } from './module';
import { envFor, WIDTH_CLASSES } from './queries';
import { TERM_DECLS, termDecl } from './term-decls';

const SRC = path.resolve(import.meta.dirname, '../../../src');
const globals = { get: () => undefined };
const basisOf = (cssPath: string, css: string, cls: string): unknown => {
  const r = translateModule(cssPath, css, envFor(WIDTH_CLASSES.wide!), globals);
  const e = r.entries.find((c) => c.id === `${cssPath}#${cls}`);
  return e?.grid?.childStyles[0]?.flexBasis;
};

test('a row applies while the web value is the one it names, white space apart', () => {
  const rows = [{ cls: 'a.module.css#g', prop: 'width', web: 'min(168px,  100%)', term: '320px', why: 'x' }];
  expect(termDecl('a.module.css#g', 'width', 'min(168px, 100%)', rows)).toBe('320px');
  expect(termDecl('a.module.css#g', 'width', 'min(200px, 100%)', rows)).toBeUndefined();
  expect(termDecl('a.module.css#g', 'height', 'min(168px, 100%)', rows)).toBeUndefined();
  expect(termDecl('a.module.css#other', 'width', 'min(168px, 100%)', rows)).toBeUndefined();
});

test('the use grid: tiles are 40 cells in a terminal, 21 for any other class with the same rule', () => {
  const css = '.useGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr)); }\n.other { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr)); }';
  const p = 'pages/computers/parts/parts.module.css';
  expect(basisOf(p, css, 'useGrid')).toBe(40);
  expect(basisOf(p, css, 'other')).toBe(21);
  // A changed web value: the row is stale and not applied.
  expect(basisOf(p, css.replace('168px', '176px'), 'useGrid')).toBe(22);
});

test('every row is live: its class says `web` in its own rule', () => {
  for (const r of TERM_DECLS) {
    const [file, cls] = r.cls.split('#') as [string, string];
    const root = postcss.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
    const values: string[] = [];
    root.each((n) => { if (n.type === 'rule' && n.selector.trim() === `.${cls}`) n.each((d) => { if (d.type === 'decl' && d.prop === r.prop) values.push(d.value); }); });
    expect({ row: r.cls, applies: values.some((v) => termDecl(r.cls, r.prop, v) === r.term) }).toEqual({ row: r.cls, applies: true });
    expect(r.why.length).toBeGreaterThan(20);
  }
});
