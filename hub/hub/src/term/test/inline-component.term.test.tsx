// A kit component marked `hxInline` (Kbd) stays inside a text run: `<p>Use <Kbd>j</Kbd> and <Kbd>k</Kbd> to move</p>` is one line.
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { FocusRoot, Text } from '../prim';

const Kbd = ({ children }: { children?: ReactNode }) => <Text bold>[{children}]</Text>;
(Kbd as { hxInline?: boolean }).hxInline = true;

test('an hxInline component stays in the run and wraps with it', async () => {
  const t = await drawTest(<FocusRoot><p>Use <Kbd>j</Kbd> and <Kbd>k</Kbd> to move</p></FocusRoot>, { width: 16, height: 8 });
  const lines = t.captureCharFrame().split('\n').map((l) => l.trimEnd()).filter(Boolean);
  // One text run: it wraps between words like the paragraph around it.
  expect(lines.slice(0, 2)).toEqual(['Use [j] and [k]', 'to move']);
  t.renderer.destroy();
});
