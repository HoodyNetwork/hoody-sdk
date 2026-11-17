// The table's cache name describes the code that built it. A process that loaded the translator, then saw it edited on
// disk, named its (old) table after the new files: once the medium table lost `inline-size: min(100%,
// 760px)` that way and the AI new-chat page drew its suggestion cards over each other for a day.
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeStamp } from './style-table';

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'stamp-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name: string, text: string) => { const f = path.join(dir, name); fs.writeFileSync(f, text); return f; };
const bump = (f: string, text: string) => { fs.writeFileSync(f, text); const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t); };

test('a code edit after load does not change the stamp of the code this process runs; a fresh load sees it', () => {
  const code = file('translate.ts', 'old');
  const css = file('a.module.css', '.a{}');
  const stamp = makeStamp([code], () => [css]);
  const before = stamp();
  bump(code, 'new code');
  expect(stamp()).toBe(before);
  expect(makeStamp([code], () => [css])()).not.toBe(before);
});

test('a stylesheet edit changes the stamp at once (stylesheets are read by every build)', () => {
  const code = file('units.ts', 'x');
  const css = file('b.module.css', '.b{}');
  const stamp = makeStamp([code], () => [css]);
  const before = stamp();
  bump(css, '.b{color:red}');
  expect(stamp()).not.toBe(before);
});
