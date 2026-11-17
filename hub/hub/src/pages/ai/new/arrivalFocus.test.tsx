// The arrival's one try. The ref belongs to the route's component; the part that owns the composer can mount
// again under it (a computer change, a view that had nothing to show for a moment) without taking focus again.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState, type MutableRefObject } from 'react';
import { useArrivalFocus } from './arrivalFocus';

let queue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 1;
const frames = () => act(() => {
  for (let i = 0; i < 10 && queue.length > 0; i++) {
    const now = queue;
    queue = [];
    for (const f of now) f.cb(performance.now());
  }
});
beforeEach(() => {
  queue = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { const id = nextId++; queue.push({ id, cb }); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { queue = queue.filter((f) => f.id !== id); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Composer({ arrival, at }: { arrival: MutableRefObject<string | null>; at: string }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const said = useArrivalFocus(arrival, at, input);
  return <><textarea ref={input} aria-label="composer" /><span aria-live="polite">{said ? 'New chat' : null}</span></>;
}

let show: (on: boolean) => void = () => {};
let go: (path: string) => void = () => {};
function Route() {
  const arrival = useRef<string | null>(null);
  const [on, setOn] = useState(true);
  const [path, setPath] = useState('/ai');
  show = setOn;
  go = setPath;
  return on ? <Composer arrival={arrival} at={path} /> : <p>nothing yet</p>;
}

describe('useArrivalFocus', () => {
  it('one try per arrival: the composer mounting again under the same route never takes focus again', async () => {
    const { getByLabelText } = render(<Route />);
    await frames();
    expect(getByLabelText('composer')).toHaveFocus();
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => show(false));
    act(() => show(true));
    await frames();
    expect(getByLabelText('composer')).not.toHaveFocus();
  });
  it('a new path under the same component (/ai -> /ai/new, the rail\'s New chat) is a new arrival', async () => {
    const { getByLabelText } = render(<Route />);
    await frames();
    expect(getByLabelText('composer')).toHaveFocus();
    act(() => (document.activeElement as HTMLElement).blur());
    act(() => go('/ai/new'));
    await frames();
    expect(getByLabelText('composer')).toHaveFocus();
  });
  it('a press or a key before the try is the person\'s: focus is not taken', async () => {
    for (const type of ['pointerdown', 'keydown'] as const) {
      const { getByLabelText, unmount } = render(<Route />);
      act(() => void document.body.dispatchEvent(new Event(type, { bubbles: true })));
      await frames();
      expect(getByLabelText('composer')).not.toHaveFocus();
      unmount();
    }
  });
  it('a mount undone before its frames leaves the try to the next mount of the same arrival', async () => {
    const { getByLabelText } = render(<Route />);
    act(() => show(false));
    await frames();
    act(() => show(true));
    await frames();
    expect(getByLabelText('composer')).toHaveFocus();
  });
});
