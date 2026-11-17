// The generic "Stop tracking this?" question of a pending OutcomeBanner is a plain confirm, as on the web
// (States.tsx: ConfirmDialog with no tone). The terminal drew it as a danger dialog: a "!" before the title and a
// danger confirm button, for a step that deletes nothing (it only stops the Hub checking a change).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { OutcomeBanner } from './States';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('Stop tracking on a pending banner asks in a plain confirm: no danger mark on its title', async () => {
  let dismissed = 0;
  t = await drawTest(<FocusRoot><OverlayHost><OutcomeBanner kind="pending" onCheck={() => {}} onDismiss={() => { dismissed++; }} /></OverlayHost></FocusRoot>, { width: 100, height: 20 });
  let f = await t.settle();
  for (let i = 0; i < 6 && !/Stop tracking this\?/.test(f); i++) {
    t.mockInput.pressTab();
    await t.settle();
    t.mockInput.pressEnter();
    f = await t.settle();
  }
  const title = f.split('\n').find((l) => l.includes('Stop tracking this?'));
  expect(title, f).toBeDefined();
  expect(title).not.toMatch(/!\s*Stop tracking this\?/);
  expect(f).toContain('Stop tracking anyway');
  expect(dismissed).toBe(0);
});
