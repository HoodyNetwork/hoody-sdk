// The copy seam (clipboard.ts) bound to its mount.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | useClipboard's copy goes through the renderer it was rendered under, while that renderer is a mounted host | 'bound copy' |
// | 2 | Kept past its mount's end (A unmounted, B mounted), A's copy answers false and B's terminal is never asked | 'kept copy after the end' |
import { expect, test } from 'bun:test';
import { createElement, useState, type ReactElement } from 'react';
import { ClipboardHost, useClipboard } from './clipboard';
import { copiesOf, drawTest } from './testing';
import { el } from './otui';

type Out = { copy?: (t: string) => boolean; end?: () => void };
// The mount's host (FocusRoot's ClipboardHost) and a component that keeps its copy; end() unmounts the host, as the end
// of a mount unmounts its FocusRoots.
function Grab({ out }: { out: Out }): ReactElement {
  out.copy = useClipboard().copy;
  return el('box', null);
}
function Mount({ out }: { out: Out }): ReactElement {
  const [on, setOn] = useState(true);
  out.end = () => { setOn(false); };
  return el('box', null, createElement(Grab, { out }), on ? createElement(ClipboardHost) : null);
}
const tree = (out: Out) => createElement(Mount, { out });

test('bound copy', async () => {
  const a: Out = {};
  const t = await drawTest(tree(a), { width: 20, height: 3 });
  const sent = copiesOf(t.renderer);
  a.copy!('hello');
  expect(sent).toEqual(['hello']);
  t.renderer.destroy();
});

test('kept copy after the end', async () => {
  const a: Out = {};
  const ta = await drawTest(tree(a), { width: 20, height: 3 });
  const sentA = copiesOf(ta.renderer);
  a.end!();
  await ta.settle();
  const b: Out = {};
  const tb = await drawTest(tree(b), { width: 20, height: 3 });
  const sentB = copiesOf(tb.renderer);
  expect(a.copy!('late from A')).toBe(false);
  expect(sentB).toEqual([]);
  expect(sentA).toEqual([]);
  b.copy!('in B');
  expect(sentB).toEqual(['in B']);
  ta.renderer.destroy();
  tb.renderer.destroy();
});
