import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from './testing';
import { Box, Text, useKeys, FocusRoot } from './index';
import { ScrollThumb, useListWindow } from './ListWindow';

function Log({ n }: { n: number }) {
  const [cursor, setCursor] = useState(0);
  const heights = useState(() => Array.from({ length: n }, () => 1))[0];
  const w = useListWindow({ heights, cursor, view: 5 });
  useKeys((k) => {
    if (k.name === 'down') { setCursor((c) => Math.min(n - 1, c + 1)); return true; }
    if (k.name === 'pagedown') { w.scroll(5); return true; }
    return false;
  });
  const rows = [];
  for (let i = w.from; i < w.to; i++) rows.push(<Text key={i}>{`${i === cursor ? '>' : ' '} line ${i}`}</Text>);
  return <Box dir="row" height={5}><Box dir="column" grow={1}>{rows}</Box><ScrollThumb bar={w.bar} view={w.view} /></Box>;
}

test('useListWindow: only the lines in view are drawn; the cursor stays in view; the wheel moves the view alone', async () => {
  const t = await drawTest(<FocusRoot><Log n={5000} /></FocusRoot>, { width: 30, height: 5 });
  let f = await t.settle();
  expect(f).toContain('> line 0');
  expect(f).not.toContain('line 5');
  for (let i = 0; i < 7; i++) t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(f).toContain('> line 7');
  expect(f).not.toContain('line 2 ');
  t.mockInput.pressKey('\x1b[6~');
  f = await t.settle();
  expect(f).not.toContain('> line 7');
  expect(f).toContain('line 8');
  expect(f).toMatch(/█/);
  t.renderer.destroy();
});
