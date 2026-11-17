// CSS ::before / ::after in the compat runtime, through the real translator: css-translate (selectors.ts `pseudo`,
// module.ts PseudoRule) -> css-table.ts (pseudoOf) -> dom.ts (a synthetic first / last child). One test per shape.
import { afterEach, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { clearStyleLedger, resolverFor, styleLedger } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import { buildTable } from '../../../scripts/term/css-translate';
import { translateModule } from '../../../scripts/term/css-translate/module';
import { envFor, WIDTH_CLASSES } from '../../../scripts/term/css-translate/queries';
import type { Table } from '../../../scripts/term/css-translate/types';

const M = 'pages/x/x.module.css';
const cls = (n: string): string => `${M}#${n}`;
function tableOf(css: string): Table {
  const r = translateModule(M, css, envFor(WIDTH_CLASSES.narrow!), { get: () => undefined });
  return { version: 1, generated: '', widthClass: WIDTH_CLASSES.narrow!, unitModel: {}, modules: { [M]: r.exports }, classes: Object.fromEntries(r.entries.map((e) => [e.id, e])) };
}

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });
async function frame(css: string, ui: ReactElement, width = 30, height = 6): Promise<string[]> {
  clearStyleLedger();
  setStyleTable(resolverFor(tableOf(css)));
  t = await drawTest(<Box dir="column" width={width} height={height}>{ui}</Box>, { width, height });
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
}

test('text in inline flow joins the text run, before and after', async () => {
  const f = await frame(`.prompt::before { content: '$ '; color: gray } .q::after { content: "?" }`,
    <><p><code className={cls('prompt')}>ls -la</code></p><p className={cls('q')}>Ready</p></>);
  expect(f[0]).toBe('$ ls -la');
  expect(f[1]).toBe('Ready?');
});

test('text as an item of a flex row: one item, no index of its own', async () => {
  const f = await frame(`.meta { display: flex } .item { display: inline-flex } .item::before { flex: none; width: 8px; text-align: center; content: "·" } .item:first-child::before { content: none }`,
    <div className={cls('meta')}><span className={cls('item')}>one</span><span className={cls('item')}>two</span><span className={cls('item')}>three</span></div>);
  expect(f[0]).toBe('one · two · three');
});

test('a child rule (`.list li::before`) draws on every matching child; list numbers and :first-child ignore the box', async () => {
  const f = await frame(`.list li::before { content: '• ' } .list li:first-child { font-weight: 700 } .nums { list-style: decimal } .nums::before { content: 'Steps' }`,
    <><ul className={cls('list')}><li>alpha</li><li>beta</li></ul><ol className={cls('nums')}><li>first</li><li>second</li></ol></>);
  expect(f[0]).toBe('• alpha');
  expect(f[1]).toBe('• beta');
  expect(f.slice(2, 5).map((l) => l.trim())).toEqual(['Steps', '1. first', '2. second']);
});

test('an empty box in flow keeps its size (a spacer, a flex line break); with no size it is nothing', async () => {
  const f = await frame(`.bar { display: flex } .bar::before { content: ''; width: 32px; height: 0 } .wrap { display: flex; flex-wrap: wrap; row-gap: 16px } .wrap::before { content: ''; flex-basis: 100%; height: 0 } .none::before { content: '' }`,
    <><div className={cls('bar')}><span>Copy</span><span>Move</span></div><div className={cls('wrap')}><span>Sort</span></div><p className={cls('none')}>Plain</p></>);
  expect(f[0]).toBe('     Copy Move');
  // The full-width empty first item takes the wrapping row's first line: the real item starts under the row gap.
  expect(f[1]).toBe('');
  expect(f[2]).toBe('Sort');
  expect(f[3]).toBe('Plain');
});

test('an absolute box (hit area, bar, dot, a mark in the padding) is not drawn and is recorded; content: none and display: none remove a box', async () => {
  const f = await frame(`.hit::after { content: ''; position: absolute; inset: -4px } .bar::before { content: ''; position: absolute; inset-block: 0; width: 2px; background: red }
    .dot::before { content: '·'; position: absolute; inset-inline-start: 0 }
    .off::before { content: 'X' } .off[data-off]::before { content: none } .gone::after { content: 'Y' } .gone.hide::after { display: none }`,
    <><p className={cls('hit')}>Press</p><p className={cls('bar')}>Card</p><p className={cls('off')} data-off="">Quiet</p><p className={`${cls('gone')} ${cls('hide')}`}>Still</p><p className={cls('off')}>Loud</p><p className={cls('dot')}>Item</p></>, 30, 7);
  expect(f.slice(0, 6)).toEqual(['Press', 'Card', 'Quiet', 'Still', 'XLoud', 'Item']);
  expect(styleLedger().pseudoSkipped).toEqual(['.bar::before', '.dot::before', '.hit::after']);
});

test('a generated box is nobody\'s previous sibling (`.a + .b` looks past it)', async () => {
  const f = await frame(`.row { display: flex } .row::before { content: '>' } .it + .it { font-weight: 700 } .it:first-child { text-transform: uppercase }`,
    <div className={cls('row')}><span className={cls('it')}>one</span><span className={cls('it')}>two</span></div>);
  expect(f[0]).toBe('> ONE two');
});

test('the box is no element child of its host (children, firstElementChild) even when it is a box of its own', async () => {
  let host: { children: unknown[]; childElementCount: number } | null = null;
  const f = await frame(`.row { display: flex } .row::before { content: '>' } .row::after { content: '<' }`,
    <div className={cls('row')} ref={(e) => { host = e as never; }}><span>mid</span></div>);
  expect(f[0]).toBe('> mid <');
  expect(host!.childElementCount).toBe(1);
});

test('the real stylesheets: a command line gets its prompt (kit/data/Ids.module.css `.prompt::before`)', async () => {
  clearStyleLedger();
  setStyleTable(resolverFor(buildTable({ width: 'medium', only: ['kit/data/Ids.module.css'] }).table));
  t = await drawTest(<Box dir="column" width={40} height={4}><span className="kit/data/Ids.module.css#prompt">hoody login</span></Box>, { width: 40, height: 4 });
  const f = (await t.settle()).split('\n').map((l) => l.trimEnd());
  expect(f.filter((l) => l !== '')).toEqual(['$ hoody login']);
}, 120_000);

test('the real stylesheets: the Files bar, stacked, breaks before its actions (files.module.css `.barStacked .barActions::before` on a display: contents group)', async () => {
  const F = 'pages/files/files.module.css';
  const c = (n: string): string => `${F}#${n}`;
  clearStyleLedger();
  setStyleTable(resolverFor(buildTable({ width: 'narrow', only: [F] }).table));
  const bar = (stacked: boolean): ReactElement => (
    <Box dir="column" width={60} height={4}>
      <div className={stacked ? `${c('bar')} ${c('barStacked')}` : c('bar')}><span>Up</span><span className={c('crumbs')}>/home</span><div className={c("barActions")}><button>Find</button><button>New folder</button></div></div>
    </Box>);
  t = await drawTest(bar(false), { width: 60, height: 4 });
  const one = (await t.settle()).split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
  expect(one).toHaveLength(1);
  expect(one[0]).toMatch(/^Up \/home\s+Find New folder$/);
  t.renderer.destroy();
  t = await drawTest(bar(true), { width: 60, height: 4 });
  const two = (await t.settle()).split('\n').map((l) => l.trimEnd()).filter((l) => l !== '');
  expect(two).toHaveLength(2);
  expect(two[0]).toMatch(/^Up \/home$/);
  expect(two[1]).toMatch(/Find New folder$/);
}, 120_000);
