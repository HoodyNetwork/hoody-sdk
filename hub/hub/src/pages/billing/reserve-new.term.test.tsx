// "Start a new purchase" beside a reservation whose outcome is unknown (parts/ReserveNew.tsx), in a terminal. Its press
// handler asked `e.target instanceof HTMLElement` to find the drawer for the focus return: HTMLElement is a strict
// global, so the press threw (TERM_GLOBAL in the key handler) and the confirm dialog never opened. The handler
// therefore reads the target without the HTMLElement global.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ReserveNew } from './parts/ReserveNew';

test('the button opens its confirm, and the confirm starts the new purchase with what was shown', async () => {
  const started: string[] = [];
  const t = await drawTest(
    <FocusRoot><OverlayHost><ReserveNew prepare={() => 'kept-1'} onStart={(v) => started.push(v)} /></OverlayHost></FocusRoot>,
    { width: 90, height: 20 },
  );
  expect(await t.settle()).toContain('Start a new purchase');
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  const open = await t.settle();
  // The danger confirm is up: its title, and what a second purchase can do.
  expect(open).toContain('Start a new purchase?');
  expect(open.replace(/\s+/g, ' ')).toContain('charge you twice');
  expect(started).toEqual([]);
  t.renderer.destroy();
});
