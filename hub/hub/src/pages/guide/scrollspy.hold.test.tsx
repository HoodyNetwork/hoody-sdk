// Vitest: the hold a jump puts on a section near the
// end. (1) A scroll back up ends it however slowly it goes: it is measured from the furthest point the scroll reached,
// so a drag up in steps of 2 px or less still ends it, while the jump's own scroll down keeps it. (2) The re-read after
// a jump runs on the Guide's sections as they are then: a section that left the list during the jump is not marked,
// even when the timer fires right after that change commits, before React's passive effects run.
// A move is the reader's only when the scroll position and
// where the section shows agree, so (3) scroll anchoring (content above changes size while the view stays still) and
// content changing size between the anchor and the section never end the hold, during the jump or at rest; (4) a
// scroll up before the jump's own scroll is first read still ends it; (5) no re-read runs once the Guide is removed,
// even when a timer is due in the commit that removes it; (6) a section still in the list but gone from the page is
// neither held nor marked, not even as the last one at the end.
import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@app/testing';
import { useScrollSpy } from './parts/useScrollSpy';
import type { SectionId } from './logic';

// The page's scroller: 600 px shown of 1600, so the scroll ends at 1000. Section tops sit at these offsets in it.
const VIEW = 600;
const HEIGHT = 1600;
const END = HEIGHT - VIEW;
const AT: Partial<Record<SectionId, number>> = { ask: 0, connect: 500, topics: 1100, look: 1300 };

let main: HTMLElement;
let scrollTop = 0;
// How much content above the sections has shrunk (every section and the scroll's height move up by it).
let shift = 0;
// How much content between the anchor (above Topics) and Topics has grown: Topics, Look and the scroll's height move
// down by it, the scroll position stays.
let grow = 0;
const BELOW: ReadonlySet<string> = new Set(['topics', 'look']);

function rect(top: number): DOMRect {
  return { top, bottom: top + 100, left: 0, right: 800, width: 800, height: 100, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

// Scroll anchoring after content above shrinks by `px`: the browser lowers the scroll position by as much, so every
// section shows where it showed before.
function anchor(px: number) {
  shift += px;
  scrollTo(scrollTop - px);
}

function scrollTo(y: number) {
  scrollTop = y;
  act(() => {
    main.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  scrollTop = 0;
  shift = 0;
  grow = 0;
  main = document.createElement('div');
  main.id = 'hub-main';
  main.style.overflowY = 'auto';
  Object.defineProperty(main, 'clientHeight', { configurable: true, get: () => VIEW });
  Object.defineProperty(main, 'scrollHeight', { configurable: true, get: () => HEIGHT - shift + grow });
  Object.defineProperty(main, 'scrollTop', { configurable: true, get: () => scrollTop, set: (y: number) => { scrollTop = y; } });
  // A jump's scroll is played by the test (scrollTo above); the call itself moves nothing.
  main.scrollTo = (() => {}) as typeof main.scrollTo;
  main.getBoundingClientRect = () => rect(0);
  for (const [id, at] of Object.entries(AT)) {
    const el = document.createElement('section');
    el.id = `guide-${id}`;
    el.innerHTML = `<h2 tabindex="-1">${id}</h2>`;
    el.getBoundingClientRect = () => rect(at - shift - scrollTop + (BELOW.has(id) ? grow : 0));
    main.append(el);
  }
  document.body.append(main);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const ORDER: readonly SectionId[] = ['ask', 'connect', 'topics', 'look'];

describe('Guide scroll spy: the hold on a section near the end', () => {
  it('a jump to a section that cannot reach the top keeps it marked at the end while its own scroll goes down', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    for (const y of [300, 600, 600, 900, END]) scrollTo(y);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END);
    expect(result.current[0]).toBe('topics');
  });

  it('a slow scroll back up in steps of 2 px during the jump ends the hold: at the end the last section is current', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    for (const y of [300, 600, 598, 596, 594]) scrollTo(y);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END);
    expect(result.current[0]).toBe('look');
  });

  it('the re-read after a jump uses the sections as they are then: one that left the list is not marked', () => {
    const { result, rerender } = renderHook(({ order }) => useScrollSpy(order), { initialProps: { order: ORDER } });
    act(() => result.current[1]('topics', false));
    scrollTop = END;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    document.getElementById('guide-topics')?.remove();
    rerender({ order: ORDER.filter((id) => id !== 'topics') });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current[0]).toBe('look');
  });

  it('the re-read that fires between the commit of a new section list and the passive effects reads the new list', () => {
    // The wrapper's layout effect runs after the hook's own (declaration order) and before every passive effect: the
    // timer fires there, in the window a commit leaves before passive effects run.
    let fireAfterCommit = false;
    const looked: string[] = [];
    const { result, rerender } = renderHook(
      ({ order }) => {
        const spy = useScrollSpy(order);
        useLayoutEffect(() => {
          if (!fireAfterCommit) return;
          fireAfterCommit = false;
          const reads = vi.spyOn(document, 'getElementById');
          vi.advanceTimersByTime(1000);
          looked.push(...reads.mock.calls.map(([id]) => id));
          reads.mockRestore();
        });
        return spy;
      },
      { initialProps: { order: ORDER } },
    );
    act(() => result.current[1]('topics', false));
    scrollTop = END;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    document.getElementById('guide-topics')?.remove();
    fireAfterCommit = true;
    rerender({ order: ORDER.filter((id) => id !== 'topics') });
    expect(looked).toEqual(['guide-ask', 'guide-connect', 'guide-look']);
    expect(result.current[0]).toBe('look');
  });

  it('scroll anchoring during the jump keeps the hold: the section shows where it did, only the scroll position moved', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    scrollTo(300);
    scrollTo(600);
    for (let i = 0; i < 3; i++) anchor(2);
    scrollTo(900);
    scrollTo(END - shift);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END - shift);
    expect(result.current[0]).toBe('topics');
  });

  it('scroll anchoring at the end, after the jump came to rest there, keeps the hold', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    for (const y of [300, 600, 900, END]) scrollTo(y);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current[0]).toBe('topics');
    for (let i = 0; i < 3; i++) anchor(2);
    expect(result.current[0]).toBe('topics');
  });

  it('a scroll up before the jump\'s own scroll is first read still ends the hold', () => {
    scrollTop = 400;
    const { result } = renderHook(() => useScrollSpy(ORDER));
    // Arriving by link: the test plays no scroll for the jump, the reader's PageUp is the first scroll read.
    act(() => result.current[1]('topics', false));
    scrollTo(300);
    scrollTo(END);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END);
    expect(result.current[0]).toBe('look');
  });

  it('content growing between the anchor and the section during the jump keeps the hold: the scroll position stayed', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    scrollTo(300);
    scrollTo(600);
    grow = 10;
    scrollTo(600);
    scrollTo(900);
    scrollTo(END + grow);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END + grow);
    expect(result.current[0]).toBe('topics');
  });

  it('anchoring, then content growing below the anchor, keeps the hold: each moved one measure only', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    scrollTo(300);
    scrollTo(600);
    anchor(6);
    grow = 10;
    scrollTo(scrollTop);
    scrollTo(END - shift + grow);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END - shift + grow);
    expect(result.current[0]).toBe('topics');
  });

  it('anchoring at the end as content above grows keeps the hold: the scroll moved down, the section did not', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    for (const y of [300, 600, 900, END]) scrollTo(y);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    anchor(-6);
    expect(result.current[0]).toBe('topics');
  });

  it('a scroll up after the layout moved still ends the hold: the hold measures from where things then are', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    scrollTo(300);
    scrollTo(600);
    grow = 10;
    scrollTo(600);
    scrollTo(594);
    scrollTo(END + grow);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    scrollTo(END + grow);
    expect(result.current[0]).toBe('look');
  });

  it('the last section in the list but gone from the page is not marked at the end: the last one shown is', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    document.getElementById('guide-look')?.remove();
    scrollTo(500);
    scrollTo(END);
    expect(result.current[0]).toBe('topics');
  });

  it('a section still in the list but gone from the page drops its hold: back on the page, it is not held at the end', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('topics'));
    scrollTo(300);
    scrollTo(600);
    const gone = document.getElementById('guide-topics');
    gone?.remove();
    scrollTo(900);
    // The re-read after the lock finds it missing.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    if (gone) main.insertBefore(gone, document.getElementById('guide-look'));
    scrollTo(END);
    expect(result.current[0]).toBe('look');
  });

  it('no re-read runs once the Guide is removed, even when the timer is due in the commit that removes it', () => {
    // The host's layout effect runs after the commit's layout cleanups (the Guide's included) and before its passive
    // cleanups: the due timer fires there.
    const looked: string[] = [];
    let hostJump: MutableRefObject<((id: SectionId) => void) | null> | null = null;
    function Guide({ jumpRef }: { jumpRef: MutableRefObject<((id: SectionId) => void) | null> }) {
      const [, jump] = useScrollSpy(ORDER);
      jumpRef.current = jump;
      return null;
    }
    function Host({ show, fire }: { show: boolean; fire: boolean }) {
      const jumpRef = useRef<((id: SectionId) => void) | null>(null);
      hostJump = jumpRef;
      useLayoutEffect(() => {
        if (!fire) return;
        const reads = vi.spyOn(document, 'getElementById');
        vi.advanceTimersByTime(1000);
        looked.push(...reads.mock.calls.map(([id]) => id));
        reads.mockRestore();
      });
      return show ? <Guide jumpRef={jumpRef} /> : null;
    }
    const { rerender } = render(<Host show fire={false} />);
    act(() => hostJump?.current?.('topics'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender(<Host show={false} fire />);
    expect(looked).toEqual([]);
  });
});
