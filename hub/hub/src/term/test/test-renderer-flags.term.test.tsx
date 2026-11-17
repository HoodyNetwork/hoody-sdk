// A test renderer (prim/testing testRender, and through it render.ts, goldens, shots, scenarios) is made with the Hub's
// RENDERER_FLAGS (app/run.ts): an error never opens the engine's debug console over the page (no
// "Console (Focused)" drawn in frames), a click never hands focus to an engine renderable, Ctrl-C is the shell's.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, testRender, type TestTerm } from '../prim/testing';
import { Box, Text } from '../prim';
import { RENDERER_FLAGS } from '../app/run';

let t: TestTerm | Awaited<ReturnType<typeof testRender>> | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
type Flags = { _openConsoleOnError: boolean; consoleMode: string; autoFocus: boolean; exitOnCtrlC: boolean; console: { visible?: boolean; isVisible?: boolean } };

test('drawTest and testRender make the renderer with RENDERER_FLAGS', async () => {
  t = await drawTest(<Box><Text>hi</Text></Box>, { width: 20, height: 3 });
  const r = t.renderer as unknown as Flags;
  expect(r._openConsoleOnError).toBe(false);
  expect(r.consoleMode).toBe(RENDERER_FLAGS.consoleMode);
  expect(r.autoFocus).toBe(false);
  expect(r.exitOnCtrlC).toBe(false);
});

test('an error reported to the renderer draws no console over the page', async () => {
  t = await drawTest(<Box><Text>page text</Text></Box>, { width: 40, height: 6 });
  const realError = console.error;
  console.error = () => {};
  try { (t.renderer as unknown as { handleError(e: unknown): void }).handleError(new Error('boom')); } finally { console.error = realError; }
  const f = await (t as TestTerm).settle();
  expect(f).toContain('page text');
  expect(f).not.toContain('Console');
});
