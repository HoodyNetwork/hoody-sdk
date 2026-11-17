// The pause bus: event.pause_state frames reach the subscribers of their computer, and only those; nothing a stream can
// carry makes the bus throw.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pauseBusComputersForTests, publishPauseFrame, resetPauseBusForTests, subscribePause } from './pauseBus';

const frame = (data: unknown): string => JSON.stringify({ session_id: 's1', seq: 3, event: { type: 'event.pause_state', data } });
const ON = { paused: true, since_ms: 1700000000000, gen: 4 };

afterEach(resetPauseBusForTests);

describe('pauseBus', () => {
  it('hands a pause_state frame to the subscriber of its computer, as a PauseState', () => {
    const fn = vi.fn();
    subscribePause('c1', fn);
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(fn).toHaveBeenCalledExactlyOnceWith({ paused: true, sinceMs: 1700000000000, gen: 4 });
  });
  it('another computer hears nothing', () => {
    const a = vi.fn(), b = vi.fn();
    subscribePause('c1', a);
    subscribePause('c2', b);
    publishPauseFrame('c2', 'pause_state', frame(ON));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it('every subscriber of the computer hears it, and an unsubscribed one stops', () => {
    const a = vi.fn(), b = vi.fn();
    const off = subscribePause('c1', a);
    subscribePause('c1', b);
    publishPauseFrame('c1', 'pause_state', frame(ON));
    off();
    publishPauseFrame('c1', 'pause_state', frame({ ...ON, gen: 5 }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it('unsubscribing twice is harmless', () => {
    const off = subscribePause('c1', vi.fn());
    off();
    expect(() => off()).not.toThrow();
  });
  it('a frame with another name is ignored, even when its payload is a pause state', () => {
    const fn = vi.fn();
    subscribePause('c1', fn);
    publishPauseFrame('c1', 'turn_started', frame(ON));
    expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    ['not JSON', 'nope{'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['no event', '{"seq":1}'],
    ['an event with no data', JSON.stringify({ event: { type: 'event.pause_state' } })],
    ['a paused that is not a boolean', frame({ paused: 'yes', gen: 1 })],
    ['a gen that is not a count', frame({ paused: true, gen: -1 })],
    ['a since_ms that is not a number', frame({ paused: true, since_ms: 'x', gen: 1 })],
  ])('%s: dropped, nothing thrown, nobody told', (_n, raw) => {
    const fn = vi.fn();
    subscribePause('c1', fn);
    expect(() => publishPauseFrame('c1', 'pause_state', raw)).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
  it('a subscriber that throws does not stop the next one or the stream', () => {
    const bad = vi.fn(() => { throw new Error('x'); }), good = vi.fn();
    subscribePause('c1', bad);
    subscribePause('c1', good);
    expect(() => publishPauseFrame('c1', 'pause_state', frame(ON))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
  it('a subscriber that unsubscribes the NEXT one while the frame is delivered: the frame goes to those subscribed when it came, the next frame does not', () => {
    const second = vi.fn();
    let offSecond: () => void = () => {};
    subscribePause('c1', () => offSecond());
    offSecond = subscribePause('c1', second);
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(second).toHaveBeenCalledTimes(1);
    publishPauseFrame('c1', 'pause_state', frame({ ...ON, gen: 5 }));
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('the same callback subscribed twice is two subscriptions: both are told, each frame twice', () => {
    const fn = vi.fn();
    subscribePause('c1', fn);
    subscribePause('c1', fn);
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('an unsubscribe removes its own subscription only, though another uses the same callback', () => {
    const fn = vi.fn();
    const a = subscribePause('c1', fn);
    subscribePause('c1', fn);
    a();
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('an old unsubscribe called again never removes a later subscription of the same callback', () => {
    const fn = vi.fn();
    const old = subscribePause('c1', fn);
    old();
    subscribePause('c1', fn);
    old();
    old();
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('the frame goes to those subscribed when it came: one that subscribes while it is delivered hears the next', () => {
    const late = vi.fn();
    subscribePause('c1', () => { subscribePause('c1', late); });
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(late).not.toHaveBeenCalled();
    resetPauseBusForTests();
    subscribePause('c1', late);
    publishPauseFrame('c1', 'pause_state', frame(ON));
    expect(late).toHaveBeenCalledTimes(1);
  });
  it('a computer with no subscriber left is forgotten, not kept as an empty set', () => {
    const a = subscribePause('c1', vi.fn()), b = subscribePause('c2', vi.fn());
    expect(pauseBusComputersForTests()).toBe(2);
    a();
    expect(pauseBusComputersForTests()).toBe(1);
    b();
    expect(pauseBusComputersForTests()).toBe(0);
  });
});
