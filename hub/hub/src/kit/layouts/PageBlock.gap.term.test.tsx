// PageBlock's gap comes and goes (a notice appears under a tab strip) without remounting what it holds: a focused
// control inside keeps its focus, and only the blank row under the block changes.
import { afterEach, expect, test } from 'bun:test';
import { act, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { routed } from './termHarness';
import { Button } from '../controls/Button';
import { PageBlock } from './PageBlock';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

let setGap: (v: boolean) => void = () => {};
function Strip() {
  const [gap, set] = useState(true);
  setGap = set;
  return (
    <FocusRoot>
      <PageBlock gap={gap}><Button onPress={() => {}}>First</Button></PageBlock>
      <Button onPress={() => {}}>Below</Button>
    </FocusRoot>
  );
}

test('120x40: the focused control keeps focus while the gap goes and comes back; the blank row follows the gap', async () => {
  const { element } = routed(() => <Strip />);
  t = await drawTest(element, { width: 120, height: 40 });
  await t.settle();
  const focused = (): string | undefined => focusedNode(semanticsOf(t!.renderer as never))?.name;
  t.mockInput.pressTab();
  await t.settle();
  expect(focused()).toBe('First');
  const rowOf = (f: string, w: string): number => f.split('\n').findIndex((l) => l.includes(w));
  let f = await t.settle();
  expect(rowOf(f, 'Below') - rowOf(f, 'First')).toBe(2);
  act(() => setGap(false));
  f = await t.settle();
  expect(rowOf(f, 'Below') - rowOf(f, 'First')).toBe(1);
  expect(focused()).toBe('First');
  act(() => setGap(true));
  f = await t.settle();
  expect(rowOf(f, 'Below') - rowOf(f, 'First')).toBe(2);
  expect(focused()).toBe('First');
});
