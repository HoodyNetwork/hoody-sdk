// test-preload.ts gives the real clock back after every test: a test that pins the fixture clock
// (freezeClock / fixtureClock) and forgets to thaw it cannot leave the next test, or the next file, on a frozen
// Date.now or seeded randomness.
import { expect, setSystemTime, test } from 'bun:test';
import { clockFrozen, fixtureClock, GOLDEN_NOW } from './clock';

test('a test pins the fixture clock and does not thaw it', () => {
  fixtureClock();
  expect(clockFrozen()).toBe(true);
  expect(Date.now()).toBe(GOLDEN_NOW);
});

test('the next test runs on the real clock and randomness', async () => {
  expect(clockFrozen()).toBe(false);
  setSystemTime(new Date('2031-01-01T00:00:00Z'));
  expect(Date.now()).toBe(Date.UTC(2031, 0, 1));
  setSystemTime();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 30));
  expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
  expect(String(Math.random)).toContain('[native code]');
  expect(String(crypto.randomUUID)).toContain('[native code]');
});
