// The terminal Activity log hears its scroll box through the engine's own events, never a timer: an idle
// Bots page wakes nothing, and every listener goes when the log unmounts.
import { EventEmitter } from 'node:events';
import { afterEach, expect, test } from 'bun:test';
import { observeLogResize, onAnyScroll, scrollerOf } from './activityScroll';

class FakeBox {
  scrollTop = 0;
  scrollHeight = 40;
  isDestroyed = false;
  verticalScrollBar = new EventEmitter();
  content = new EventEmitter();
  viewport = Object.assign(new EventEmitter(), { y: 0, height: 10 });
  layout: (() => void)[] = [];
  afterLayout(f: () => void): void { this.layout.push(f); }
}
const colIn = (b: FakeBox) => ({ __node: () => ({ parent: { parent: b } }) }) as unknown as HTMLElement;

const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;
let timers = 0;
afterEach(() => { globalThis.setInterval = realSetInterval; globalThis.setTimeout = realSetTimeout; });
const countTimers = () => {
  timers = 0;
  globalThis.setInterval = ((...a: Parameters<typeof setInterval>) => { timers++; return realSetInterval(...a); }) as typeof setInterval;
  globalThis.setTimeout = ((...a: Parameters<typeof setTimeout>) => { timers++; return realSetTimeout(...a); }) as typeof setTimeout;
};

test('size changes reach the log from the box content and viewport "resize" events, once after the next layout', () => {
  const b = new FakeBox();
  let calls = 0;
  countTimers();
  const stop = observeLogResize(colIn(b), () => { calls++; })!;
  expect(typeof stop).toBe('function');
  expect(timers).toBe(0);
  expect(calls).toBe(0);
  b.layout.forEach((f) => f());
  expect(calls).toBe(1);
  b.content.emit('resize');
  b.viewport.emit('resize');
  expect(calls).toBe(3);
  stop();
  expect(b.content.listenerCount('resize')).toBe(0);
  expect(b.viewport.listenerCount('resize')).toBe(0);
  b.content.emit('resize');
  expect(calls).toBe(3);
});

test('a scroll reaches every onAnyScroll listener as an event whose target is the box scroller, and stops on unmount', () => {
  const b = new FakeBox();
  const col = colIn(b);
  const seen: unknown[] = [];
  countTimers();
  const off = onAnyScroll((e) => seen.push((e as unknown as { target: unknown }).target));
  const stop = observeLogResize(col, () => {})!;
  expect(timers).toBe(0);
  b.verticalScrollBar.emit('change', { position: 3 });
  expect(seen).toEqual([scrollerOf(col)]);
  stop();
  expect(b.verticalScrollBar.listenerCount('change')).toBe(0);
  b.verticalScrollBar.emit('change', { position: 4 });
  expect(seen.length).toBe(1);
  off();
});

test('idle: no event, no call (nothing polls the box)', async () => {
  const b = new FakeBox();
  let calls = 0;
  let scrolls = 0;
  const off = onAnyScroll(() => { scrolls++; });
  const stop = observeLogResize(colIn(b), () => { calls++; })!;
  b.layout.forEach((f) => f());
  b.scrollTop = 5; // moved without an engine event: nothing reads it on a timer
  await new Promise((r) => realSetTimeout(r, 350));
  expect(calls).toBe(1);
  expect(scrolls).toBe(0);
  stop();
  off();
});
