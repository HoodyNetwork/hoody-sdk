// Vitest: a strip's chevron takes its width from the tabs beside it. When the tabs would fit once it is gone, it goes:
// it never stays only because its own width is what cuts the last tab (a Board with one tab at a narrow window).
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

// A ResizeObserver that fires only when a test says an element resized.
let ros: Array<{ cb: () => void; watched: Set<Element> }> = [];
const resized = (el: Element) => {
  for (const ro of ros) if (ro.watched.has(el)) ro.cb();
};

// The strip is 300 px; each chevron shown beside the scroller is 24 px of it. The tabs are `content` px.
const CHEVRON = 24;
let content = 290;
const isScroller = (el: Element) => el.firstElementChild?.getAttribute('role') === 'tablist';
const shownChevrons = (el: Element) => [...(el.parentElement?.children ?? [])].filter((c) => c.hasAttribute('data-more')).length;

beforeEach(() => {
  ros = [];
  content = 290;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private me = { cb: () => undefined as void, watched: new Set<Element>() };
      constructor(cb: () => void) {
        this.me.cb = cb;
        ros.push(this.me);
      }
      observe(el: Element) {
        this.me.watched.add(el);
      }
      unobserve(el: Element) {
        this.me.watched.delete(el);
      }
      disconnect() {
        this.me.watched.clear();
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? 300 - CHEVRON * shownChevrons(this) : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? Math.max(this.clientWidth, content) : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-more') ? CHEVRON : 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockReturnValue(0);
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const VIEWS = [{ id: 'a', label: 'Main' }];
const chevrons = () => [...document.querySelectorAll('[data-more]')].map((b) => b.getAttribute('data-more'));
const scroller = () => screen.getByRole('tablist').parentElement as HTMLElement;

describe('Tabs: the chevron gives its width back', () => {
  it('tabs that fit the strip without the chevron, but not beside it, drop the chevron and show whole', async () => {
    render(<Tabs label="Boards" items={VIEWS} value="a" />);
    expect(chevrons()).toEqual([]);
    // Wider than the strip: the end chevron shows (and takes 24 px from the tabs).
    content = 320;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
    // 290 px of tabs: cut beside the chevron (276 px left), whole without it (300 px). The chevron goes.
    content = 290;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual([]);
    // And it stays gone: with the room back the tabs fit, nothing scrolls.
    await act(async () => resized(scroller()));
    expect(chevrons()).toEqual([]);
  });

  it('tabs wider than the strip even without the chevron keep it', async () => {
    render(<Tabs label="Boards" items={VIEWS} value="a" />);
    content = 340;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
    // 310 px: past 300 with no chevron at all, so the end still has more.
    content = 310;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
  });
});
