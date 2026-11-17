// SessionView.term: the transcript follows the end while the reader is there, never moves under a reader who scrolled
// up (a "New messages below" line instead), mounts only a window of a long chat, and wires gates to the source.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { SessionView } from './SessionView';
import { DEMO_SCRIPT, longScript, scriptedSource } from './scriptedSource.fixture';
import { estimateRows, windowOf } from './sessionWindow';
import { withGateArm } from './gateArm';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

const mount = (src: ReturnType<typeof scriptedSource>, typing = true) => (
  <FocusRoot>
    <Box dir="column" width={80} height={24}><SessionView source={src} size="l" typing={typing} /></Box>
  </FocusRoot>
);

test('the demo chat: message, steps, reply with table and code, then the approval card in view', async () => {
  restore = withGateArm(0);
  const src = scriptedSource(DEMO_SCRIPT);
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  src.drain();
  const f = await t.settle();
  // Followed to the end: the approval card is on screen.
  expect(f).toContain('! Needs you');
  expect(f).toContain('systemctl --user restart web');
  expect(f).not.toContain('New messages below');
  t.renderer.destroy();
});

test('scrolled up while it streams: the view stays put and says new messages are below; End comes back', async () => {
  const src = scriptedSource([...longScript(6, 6), { k: 'reply', text: 'streamed '.repeat(200), chunk: 30 }]);
  const t = await drawTest(mount(src, true), { width: 80, height: 24 });
  for (let i = 0; i < 13; i++) src.tick();
  await t.settle();
  t.mockInput.pressKey('pageup' as never);
  t.mockInput.pressKey('\x1b[5~' as never);
  let f = await t.settle();
  const before = f.split('\n').slice(0, 10).join('\n');
  for (let i = 0; i < 5; i++) src.tick();
  f = await t.settle();
  expect(f.split('\n').slice(0, 10).join('\n')).toBe(before);
  expect(f).toContain('New messages below');
  t.mockInput.pressKey('\x1b[6~' as never);
  for (let i = 0; i < 20; i++) t.mockInput.pressKey('\x1b[6~' as never);
  f = await t.settle();
  src.tick();
  f = await t.settle();
  expect(f).not.toContain('New messages below');
  t.renderer.destroy();
});

test('a long chat mounts a window only', async () => {
  const src = scriptedSource(longScript(200, 25));
  src.drain();
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  const f = await t.settle();
  expect(f).toContain('answer 200');
  // Count drawn block boxes: far fewer than 400 blocks.
  let boxes = 0;
  const walk = (n: { getChildren?: () => unknown[] }) => { boxes++; for (const c of n.getChildren?.() ?? []) walk(c as never); };
  walk(t.renderer.root as never);
  expect(boxes).toBeLessThan(600);
  t.renderer.destroy();
});

test('windowOf / estimateRows', () => {
  expect(windowOf([10, 10, 10, 10, 10], 20, 10)).toEqual({ from: 1, to: 3 });
  expect(windowOf([], 0, 10)).toEqual({ from: 0, to: -1 });
  expect(windowOf([5, 5], 500, 10)).toEqual({ from: 0, to: 1 });
  expect(estimateRows({ k: 'line', key: 'x', text: 'a', tone: 'muted' }, 80)).toBe(2);
});

test('deciding from the transcript reaches the source', async () => {
  restore = withGateArm(0);
  const src = scriptedSource(DEMO_SCRIPT);
  src.drain();
  const t = await drawTest(mount(src, false), { width: 80, height: 24 });
  await t.settle();
  t.mockInput.pressEnter(); // focus arrived on Deny
  await t.settle();
  expect(src.recorded.decide.map((d) => d.d.choice)).toEqual(['deny']);
  expect(await t.settle()).toContain('✗ Denied');
  t.renderer.destroy();
});

test('End from outside the transcript (nothing focused, or an empty composer) jumps to the newest in one press', async () => {
  const src = scriptedSource([...longScript(6, 6), { k: 'reply', text: 'streamed '.repeat(200), chunk: 30 }]);
  const t = await drawTest(mount(src, true), { width: 80, height: 24 });
  for (let i = 0; i < 13; i++) src.tick();
  await t.settle();
  for (let i = 0; i < 3; i++) t.mockInput.pressKey('\x1b[5~' as never);
  await t.settle();
  for (let i = 0; i < 3; i++) src.tick();
  expect(await t.settle()).toContain('New messages below');
  t.mockInput.pressKey('\x1b[F' as never);
  await t.settle();
  src.tick();
  expect(await t.settle()).not.toContain('New messages below');
  t.renderer.destroy();
});
