// NodeLink in the terminal. The web file reads `document` (a trap in the terminal build) and draws
// an svg, which the compat runtime cannot draw: no entity was shown or reachable. Each case fails without the sibling.
import { expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Button } from '../controls/Button';
import { NodeLink, type NodeLinkEdge, type NodeLinkNode } from './NodeLink';

const nodes = (n: number): NodeLinkNode[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `entity ${i}` }));
const star = (n: number): NodeLinkEdge[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, source: 'n0', target: `n${i + 1}`, relation: 'uses' }));

async function draw(node: ReactNode, width: number, height = 24) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  const rows = async () => (await t.settle()).split('\n').map((r) => r.trimEnd()).filter((r) => r !== '');
  const on = () => focusedNode(semanticsOf(t.renderer))?.name;
  return { t, rows, on };
}

test('the centre, then one branch per linked entity with the relation and its direction, then the count', async () => {
  const edges: NodeLinkEdge[] = [
    { id: 'a', source: 'n0', target: 'n1', relation: 'runs' },
    { id: 'b', source: 'n2', target: 'n0', relation: 'lives on' },
    { id: 'c', source: 'n0', target: 'n2', relation: 'feeds' },
  ];
  const { t, rows } = await draw(<NodeLink label="Links" nodes={nodes(3)} edges={edges} selected="n0" onSelect={() => {}} />, 80);
  expect(await rows()).toEqual(['◉ entity 0', '├─ runs → ○ entity 1', '└─ ← lives on, feeds → ○ entity 2', 'entity 0: 3 links']);
  t.renderer.destroy();
}, 30_000);

test('12 links drawn at 80 columns, 8 under 62; the rest counted; a long name is cut, never wrapped', async () => {
  const ns = nodes(20).map((n, i) => (i === 3 ? { ...n, label: 'a very long entity name that goes on and on past any sensible width for a label in a drawing' } : n));
  const wide = await draw(<NodeLink label="Links" nodes={ns} edges={star(19)} selected="n0" onSelect={() => {}} />, 80);
  const w = await wide.rows();
  expect(w.filter((r) => /^[├└]─/.test(r)).length).toBe(12);
  expect(w.at(-1)).toBe('+7 more links in the table');
  expect(w.find((r) => r.includes('a very long'))).toMatch(/…$/);
  expect(Math.max(...w.map((r) => r.length))).toBeLessThanOrEqual(80);
  wide.t.renderer.destroy();
  const narrow = await draw(<NodeLink label="Links" nodes={ns} edges={star(19)} selected="n0" onSelect={() => {}} />, 50);
  const n = await narrow.rows();
  expect(n.filter((r) => /^[├└]─/.test(r)).length).toBe(8);
  expect(n.at(-1)).toBe('+11 more links in the table');
  narrow.t.renderer.destroy();
}, 30_000);

test('one Tab stop; arrows, Home and End move it round; the line under the tree says the focused link', async () => {
  const { t, rows, on } = await draw(<><NodeLink label="Links" nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={() => {}} /><Button>After</Button></>, 80);
  t.mockInput.pressTab();
  await t.settle();
  expect(on()).toBe('entity 0: 4 links');
  t.mockInput.pressArrow('down');
  await t.settle();
  expect(on()).toBe('entity 1, entity 0 uses entity 1');
  t.mockInput.pressArrow('up');
  await t.settle();
  expect(on()).toBe('entity 4, entity 0 uses entity 4');
  t.mockInput.pressArrow('right');
  expect((await rows()).at(-2)).toBe('entity 0 uses entity 1');
  t.mockInput.pressTab();
  await t.settle();
  expect(on()).toBe('After'); // the part held one stop: Tab left it
  t.renderer.destroy();
}, 30_000);

test('Enter on a linked entity selects it, and the focus follows it to the centre', async () => {
  const asked: string[] = [];
  function Page() {
    const [sel, setSel] = useState('n0');
    return <NodeLink label="Links" nodes={nodes(5)} edges={[...star(4), { id: 'z', source: 'n2', target: 'n3', relation: 'reads' }]} selected={sel} onSelect={(id) => { asked.push(id); setSel(id); }} />;
  }
  const { t, rows, on } = await draw(<Page />, 80);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressArrow('down');
  await t.settle();
  t.mockInput.pressEnter();
  const f = await rows();
  expect(asked).toEqual(['n2']);
  expect(f[0]).toBe('◉ entity 2');
  expect(f).toContain('├─ ← uses ○ entity 0');
  expect(f).toContain('└─ reads → ○ entity 3');
  expect(on()).toBe('entity 2: 2 links');
  t.mockInput.pressEnter(); // the centre asks nothing
  await t.settle();
  expect(asked).toEqual(['n2']);
  t.renderer.destroy();
}, 30_000);

test('an entity not in the read draws nothing', async () => {
  const { t, rows } = await draw(<NodeLink label="Links" nodes={nodes(3)} edges={star(2)} selected="gone" onSelect={() => {}} />, 80);
  expect(await rows()).toEqual([]);
  t.renderer.destroy();
}, 30_000);
