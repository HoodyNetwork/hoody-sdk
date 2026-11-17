// StepTrail.term: the summary row names the trail and its outcome; Enter on it opens one row per step (mark, kind, what it
// worked on, how long, why it failed). stepText reads a recorded text as the web module does.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { StepTrail, stepText } from './StepTrail';
import type { ConvBlock } from './source';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

const block: Extract<ConvBlock, { k: 'steps' }> = {
  k: 'steps', key: 's1', label: '2 steps · 3s', state: 'failed',
  rows: [
    { id: 'a', state: 'ok', verb: 'Read', summary: 'src/app.ts', time: '1s' },
    { id: 'b', state: 'failed', verb: 'Run', summary: '$ bun test', time: '2s', note: 'Exited with code 1' },
  ],
};

test('closed: the summary row with the outcome; Enter opens the step rows', async () => {
  term = await drawTest(<FocusRoot><Box dir="column" width={60} height={8}><StepTrail b={block} /></Box></FocusRoot>, { width: 60, height: 8 });
  let f = await term.settle();
  expect(f).toContain('▸ 2 steps · 3s ✗ Failed');
  expect(f).not.toContain('src/app.ts');
  term.mockInput.pressTab();
  term.mockInput.pressEnter();
  f = await term.settle();
  expect(f).toContain('▾ 2 steps · 3s');
  expect(f).toContain('✓ Read src/app.ts 1s');
  expect(f).toContain('✗ Run $ bun test 2s');
  expect(f).toContain('Exited with code 1');
}, 60_000);

test('stepText: a command, a background command, plain text', () => {
  expect(stepText('$ ls -la')).toEqual({ text: 'ls -la', command: true, background: false });
  expect(stepText('[bg] $ sleep 9')).toEqual({ text: 'sleep 9', command: true, background: true });
  expect(stepText('src/app.ts')).toEqual({ text: 'src/app.ts', command: false, background: false });
  expect(stepText(undefined)).toEqual({ text: '', command: false, background: false });
});
