// The empty-state recipes in the terminal (Recipes.term.tsx). The first case fails on Recipes.tsx: its OfflineState
// listens for `online` on `window`, which the terminal refuses (TERM_GLOBAL at mount: the page stops).
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { hostEnv } from '../../core/host-env';
import { EmptyState } from './States';
import { NoAccessState, OfflineState } from './Recipes';

test('OfflineState with a retry mounts (no DOM global) and offers Try again', async () => {
  let n = 0;
  const t = await drawTest(<FocusRoot><OfflineState onRetry={() => { n += 1; }} /></FocusRoot>, { width: 70, height: 10 });
  const frame = await t.settle();
  expect(frame).toContain("You're offline");
  expect(frame).toContain('[↻ Try again]');
  expect(frame).not.toContain('TERM_GLOBAL');
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(n).toBe(1);
  t.renderer.destroy();
});

test('"the connection is back" comes from the host: a host online event retries, and unmounting stops listening', async () => {
  const env = hostEnv();
  const real = env.onLifecycle;
  const heard: Array<() => void> = [];
  let off = 0;
  (env as { onLifecycle: unknown }).onLifecycle = (type: string, cb: () => void) => {
    if (type === 'online') heard.push(cb);
    return () => { off += 1; };
  };
  try {
    let n = 0;
    const t = await drawTest(<FocusRoot><OfflineState onRetry={() => { n += 1; }} size="compact" /></FocusRoot>, { width: 70, height: 4 });
    await t.settle();
    expect(heard.length).toBe(1);
    heard[0]!();
    expect(n).toBe(1);
    t.renderer.destroy();
    await new Promise((r) => setTimeout(r, 20));
    expect(off).toBe(1);
  } finally {
    (env as { onLifecycle: unknown }).onLifecycle = real;
  }
});

// Fails on the old States.term.tsx: an empty state drew its icon's stand-in WORD beside the title
// ("lock You don't have access to this", "lock No sessions"); the lock has no terminal symbol (icons.glyphs.ts).
test('an empty state draws a symbol icon but never an icon\'s stand-in word', async () => {
  const t = await drawTest(<FocusRoot><NoAccessState size="sm" /><EmptyState size="compact" icon="lock" title="No sessions" /><EmptyState size="sm" icon="warn" title="Check this" /></FocusRoot>, { width: 60, height: 8 });
  const rows = (await t.settle()).split('\n').map((r) => r.trimEnd());
  expect(rows[0]).toBe("You don't have access to this");
  expect(rows.some((r) => r === 'No sessions')).toBe(true);
  expect(rows.some((r) => r === '! Check this')).toBe(true);
  expect(rows.join('\n')).not.toContain('lock');
  t.renderer.destroy();
});
