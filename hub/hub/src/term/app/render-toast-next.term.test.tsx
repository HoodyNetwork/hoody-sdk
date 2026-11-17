// A render starts clean: what the render before it in the same process left in the app's process-wide UI stores is
// not drawn (scripts/term/render.ts closes the one toast queue and forgets the Ask dock's cached state before it
// boots). The golden runner draws every case through renderPage, so this is also "a golden case starts clean".
// Before, an error toast (they stay until closed) covered rows of every later render: realms-card 80x24, order-sum,
// BoardView and the schedules goldens failed after a file that left one, and vault's new-entry goldens typed the value
// into Name because two "Saved." toasts covered the Value field. Both renders are in one test: the test preload
// resets the Ask dock between tests, the golden runner has no such step.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { showToast } from '../../kit/states/Toast.store';

const ALT = { meta: true } as never;

test('the second render of a process draws what a first render draws, after a toast and an open Ask dock', async () => {
  const first = await renderPage({ page: 'home', cols: 120, rows: 40 });
  let clean = '';
  try {
    clean = await first.settle();
    expect(clean).toContain('Good morning, Ada');
    showToast({ title: 'Left over toast', tone: 'error' });
    expect(await first.settle()).toContain('Left over toast');
    await first.keys.press('j', ALT);
    expect(await first.settle()).not.toBe(clean);
  } finally { first.close(); }

  const second = await renderPage({ page: 'home', cols: 120, rows: 40 });
  try {
    const frame = await second.settle();
    expect(frame).not.toContain('Left over toast');
    expect(frame).toBe(clean);
  } finally { second.close(); }
}, 240_000);
