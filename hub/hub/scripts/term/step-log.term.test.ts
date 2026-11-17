// A failed check.ts step keeps its whole output in a log the problem line names (step-log.ts).
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import { exitMessage, STEP_LOG_KEEP, writeStepLog } from './step-log';

const DIR = path.join(HUB, '.term-cache', 'tmp', `step-log-${process.pid}`);
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test('the log holds the command, the exit and every line; the message keeps the tail and names the log', () => {
  const out = Array.from({ length: 20 }, (_, i) => `ok   page${i}: 3 cases`).join('\n');
  const log = writeStepLog('secrets', ['bun', 'scripts/term/secrets.ts'], { code: 124, out, timedOut: true }, DIR, new Date('2026-11-12T07:00:00Z'));
  const text = fs.readFileSync(path.join(HUB, log), 'utf8');
  expect(text.startsWith('$ bun scripts/term/secrets.ts\nexit 124 (timed out)\n')).toBe(true);
  for (let i = 0; i < 20; i++) expect(text).toContain(`ok   page${i}: 3 cases`);
  const msg = exitMessage({ code: 124, out, log });
  expect(msg).toContain('page19');
  expect(msg).not.toContain('page0:');
  expect(msg.endsWith(`(full output: ${log})`)).toBe(true);
});

test('every "exit N" problem of check.ts goes through exitMessage with the step log (no bare tail)', () => {
  const src = fs.readFileSync(path.join(import.meta.dir, 'check.ts'), 'utf8');
  expect(src).not.toMatch(/`exit \$\{r\.code\}: \$\{r\.out/);
  expect((src.match(/exitMessage\(r\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
});

test('the log directory keeps the newest STEP_LOG_KEEP logs; other files and the new log stay', () => {
  const dir = path.join(DIR, 'prune');
  fs.mkdirSync(dir, { recursive: true });
  const base = Date.parse('2026-11-12T08:00:00Z') / 1000;
  for (let i = 0; i < STEP_LOG_KEEP + 5; i++) {
    const f = path.join(dir, `old-${String(i).padStart(3, '0')}.log`);
    fs.writeFileSync(f, 'x');
    fs.utimesSync(f, base + i, base + i);
  }
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'kept');
  const log = writeStepLog('tests', ['bun', 'test'], { code: 1, out: 'boom' }, dir, new Date('2026-11-12T09:00:00Z'));
  const left = fs.readdirSync(dir).sort();
  expect(left.filter((n) => n.endsWith('.log')).length).toBe(STEP_LOG_KEEP);
  expect(left).toContain(path.basename(log));
  expect(left).toContain('notes.txt');
  // 55 old + 1 new = 56 logs: the 6 oldest go, the rest stay.
  for (let i = 0; i < 6; i++) expect(left).not.toContain(`old-${String(i).padStart(3, '0')}.log`);
  expect(left).toContain('old-006.log');
  expect(left).toContain(`old-${String(STEP_LOG_KEEP + 4).padStart(3, '0')}.log`);
});
