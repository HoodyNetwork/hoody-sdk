import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { stoppedFrame, writeCrash } from './shot-guard';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `shot-guard-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('a crash receipt frame is not a page; a page frame is', () => {
  const crash = 'hoody hub: stopped: ResizeObserver is not available in the terminal (TERM_GLOBAL\n) and 2 more in the receipt\nreceipt: trap TERM_GLOBAL ResizeObserver\n';
  expect(stoppedFrame(crash, null)).toStartWith('hoody hub: stopped: ResizeObserver');
  expect(stoppedFrame('  boot\nhoody hub: could not start (TERM_BOOT)\n', null)).toStartWith('hoody hub: could not start');
  expect(stoppedFrame(' HOODY  Billing\n▌Home │ Plans\n', null)).toBeNull();
  expect(stoppedFrame(' HOODY  Billing\n', { code: 0, signal: null })).toContain('exited (code 0)');
  // The words inside a page (not at a line start) are not the failure line.
  expect(stoppedFrame(' Note: hoody hub: stopped is what the CLI prints\n', null)).toBeNull();
});

test('writeCrash removes the case shot and writes the crash text beside it', () => {
  fs.mkdirSync(TMP, { recursive: true });
  for (const ext of ['.png', '.txt', '.cells.json']) fs.writeFileSync(path.join(TMP, 'default.80x24' + ext), 'old');
  const f = writeCrash(TMP, 'default.80x24', 'hoody hub: stopped: X\n', 'hoody hub: stopped: X');
  expect(fs.existsSync(path.join(TMP, 'default.80x24.png'))).toBe(false);
  expect(fs.existsSync(path.join(TMP, 'default.80x24.txt'))).toBe(false);
  expect(fs.readFileSync(f, 'utf8')).toStartWith('NOT A PAGE SHOT: hoody hub: stopped: X');
});
