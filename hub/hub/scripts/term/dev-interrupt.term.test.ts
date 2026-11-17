// dev.ts used to end the run on the first Ctrl+C byte, before the Hub saw it: unsaved text was dropped without the
// Hub's "Discard changes?" question. Now the Hub gets every Ctrl+C; only three fast ones end the run.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hardInterrupt } from './dev-interrupt';

test('one or two Ctrl+C never end the run; the third within the window does', () => {
  let now = 0;
  const hit = hardInterrupt(1500, 3, () => now);
  expect(hit()).toBe(false);
  now = 400;
  expect(hit()).toBe(false);
  now = 900;
  expect(hit()).toBe(true);
});

test('slow presses never add up', () => {
  let now = 0;
  const hit = hardInterrupt(1500, 3, () => now);
  for (let i = 0; i < 10; i++) { now += 1000; expect(hit()).toBe(false); }
});

test('dev.ts hands Ctrl+C to the Hub: the byte ends the run only through hardInterrupt', () => {
  const src = readFileSync(path.join(import.meta.dir, 'dev.ts'), 'utf8');
  expect(src).toContain("if (s === '\\u0003' && interrupted()) ac.abort(); else cb(s);");
  expect(src).not.toMatch(/s === '\\u0003'\) ac\.abort\(\)/);
});
