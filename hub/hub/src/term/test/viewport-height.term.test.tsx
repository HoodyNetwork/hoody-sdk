// Viewport-height lengths (the AI chat frame grew 38 → 47 → 56 rows as messages came, so the composer
// and the approval card fell off the screen). Web behaviours this file holds the terminal to:
// | # | Web behaviour | Test |
// | 1 | `100dvh` (and vh/svh/lvh, inside calc with lengths) is the viewport's height: a box sized by it keeps that height whatever its content, which scrolls or overflows inside | 'the AI frame is the region's height, not its content's' |
// | 2 | The viewport is what the page is mounted in: in the terminal the nearest pane (the shell's content pane, a drawer body), not the whole terminal | 'the AI frame is the region's height, not its content's' |
// | 3 | `calc(100dvh - 2rem)` subtracts the length; a negative result is 0 | 'calc parts and the floor' |
// | 4 | Resizing the viewport resizes the box | 'follows the region when it resizes' |
// | 5 | The translator keeps vh as a run-time length (never "unexpressible"); a vh mixed with % or on a width is refused | 'translator: vh is a run-time length' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, PaneSize, Text } from '../prim';
import { setStyleTable } from '../jsx/style';
import { resolveVh } from '../jsx/dom';
import { installStyleTable } from '../../../scripts/term/style-table';
import { parseLength } from '../../../scripts/term/css-translate/values';
import cv from '../../pages/ai/parts/Conversation.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

type Node = { id?: string; height: number; y: number; getChildren?: () => Node[] };
function find(n: Node, re: RegExp): Node | null {
  if (re.test(String(n.id ?? ''))) return n;
  for (const c of n.getChildren?.() ?? []) { const f = find(c, re); if (f) return f; }
  return null;
}

/** The chat page's shape: a frame (Conversation.module.css .frame, 100dvh) holding the messages and the composer. */
function Chat({ lines }: { lines: number }) {
  return (
    <div className={cv.frame}>
      <Box dir="column" grow={1} shrink={1} clip>
        {Array.from({ length: lines }, (_, i) => <Text key={i}>{`message ${i + 1}`}</Text>)}
      </Box>
      <Box shrink={0}><Text>[composer]</Text></Box>
    </div>
  );
}

test('the AI frame is the region\'s height, not its content\'s', async () => {
  let grow: (n: number) => void = () => {};
  function App() {
    const [n, set] = useState(5);
    grow = set;
    // A 3-row header above the pane, as the shell's top bar: the pane is 17 rows of the 20.
    return <Box dir="column" grow={1}><Box height={3}><Text>header</Text></Box><PaneSize><Chat lines={n} /></PaneSize></Box>;
  }
  const t = await drawTest(<FocusRoot><App /></FocusRoot>, { width: 40, height: 20 });
  await t.settle();
  const root = (t.renderer as unknown as { root: Node }).root;
  for (const n of [5, 30, 60]) {
    grow(n);
    const f = await t.settle();
    const frame = find(root, /div\.frame@/)!;
    expect(frame.height).toBe(17);
    expect(f).toContain('[composer]');
    expect(f.split('\n').findIndex((r) => r.includes('[composer]'))).toBe(19);
  }
  t.renderer.destroy();
});

test('follows the region when it resizes', async () => {
  const t = await drawTest(<FocusRoot><PaneSize><Chat lines={40} /></PaneSize></FocusRoot>, { width: 40, height: 12 });
  await t.settle();
  const root = (t.renderer as unknown as { root: Node }).root;
  expect(find(root, /div\.frame@/)!.height).toBe(12);
  t.resize(40, 18);
  await t.settle();
  await t.settle();
  expect(find(root, /div\.frame@/)!.height).toBe(18);
  expect((await t.settle()).split('\n')[17]).toContain('[composer]');
  t.renderer.destroy();
});

test('calc parts and the floor', () => {
  expect(resolveVh('100vh+0', 38)).toBe(38);
  expect(resolveVh('100vh-2', 38)).toBe(36);
  expect(resolveVh('50vh+1', 37)).toBe(19);
  expect(resolveVh('10vh-9', 20)).toBe(0);
  expect(resolveVh(12, 38)).toBe(12);
  expect(resolveVh('50%', 38)).toBe('50%');
});

test('translator: vh is a run-time length', () => {
  expect(parseLength('calc(100dvh - 0px - 0px)')).toEqual({ kind: 'vh', vh: 100, px: 0 });
  expect(parseLength('calc(100svh - 32px)')).toEqual({ kind: 'vh', vh: 100, px: -32 });
  expect(parseLength('calc(50vh + 50%)').kind).toBe('bad');
  expect(parseLength('100vw').kind).toBe('bad');
});
