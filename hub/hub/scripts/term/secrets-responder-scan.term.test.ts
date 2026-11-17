// secrets.ts responderScan: the needles only a CALLED responder gives (a mint's token) are still found, and the call
// leaves no trace in this process: neither in the fixtures module nor in a module it imports. A second instance of
// fixtures.ts alone was not enough: its imports are shared, so the scan's synthetic rows stayed in stores the goldens
// then drew.
import { expect, test } from 'bun:test';
import path from 'node:path';

const FILE = path.join(import.meta.dir, 'testdata/needle-scan/fixtures.ts');

test('the scan finds what a responder mints, and the stores this process draws from stay as they were', async () => {
  const { minted } = await import('./testdata/needle-scan/store');
  const fx = await import('./testdata/needle-scan/fixtures');
  expect(minted).toEqual([]);
  const { responderScan } = await import('./secrets');
  const found = await responderScan(FILE);
  // Not weakened: the token exists only in the responder's answer, and it is found, under its key.
  expect(found.map((n) => [n.value, n.key, n.from])).toEqual([[fx.TOKEN, 'token', 'answer']]);
  // The responder ran somewhere else: this process's store is untouched.
  expect(minted).toEqual([]);
  // Control: the same responder called HERE does leave its row (so the check above can fail).
  (fx.default.states.mint[0]!.answer as () => unknown)();
  expect(minted).toEqual([fx.TOKEN]);
  minted.length = 0;
}, 120_000);

test('a fixtures file that is not there has no responders; one that cannot be loaded is an error, never "no needles"', async () => {
  const { responderScan } = await import('./secrets');
  expect(await responderScan(path.join(import.meta.dir, 'testdata/needle-scan/absent.ts'))).toEqual([]);
  let said = '';
  try { await responderScan(path.join(import.meta.dir, 'testdata/needle-scan/broken.ts')); } catch (e) { said = String((e as Error).message); }
  expect(said).toContain('gave no result');
}, 120_000);
