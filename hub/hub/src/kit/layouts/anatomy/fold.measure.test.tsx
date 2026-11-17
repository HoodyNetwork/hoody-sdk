// Vitest: the ActionBar's fold below 600 px must read the
// same size as the kit's `@container content (width < 600px)` rules beside it. It measured the page region
// (#hub-main, clientWidth). In the AI tab the anatomy sits in the main region beside the rail, its own `content`
// container, so the CSS was already narrow while the bar still drew its secondaries. Now the bar measures the nearest
// marked `content` container, content box.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_CONTAINER } from '../../media';
import { ActionBar } from './ActionBar';
import type { ActionSpec } from './types';

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const width = (el: HTMLElement | null, px: number) => {
  if (el) Object.defineProperty(el, 'clientWidth', { configurable: true, value: px });
};

/** A page region (#hub-main) of `px`, outside the rendered tree, as the anatomy tests set it up. */
function pageRegion(px: number) {
  const main = document.createElement('main');
  main.id = 'hub-main';
  width(main, px);
  document.body.appendChild(main);
}

afterEach(() => {
  document.getElementById('hub-main')?.remove();
});

/** A marked `content` container of `px` (the AI tab's main region), with optional inline padding. */
function Region({ px, pad, children }: { px: number; pad?: number; children: ReactNode }) {
  return (
    <div {...{ [CONTENT_CONTAINER]: '' }} ref={(el) => width(el, px)} style={pad === undefined ? undefined : { paddingLeft: `${pad}px`, paddingRight: `${pad}px` }}>
      {children}
    </div>
  );
}

const sec1: ActionSpec = { id: 'around', label: 'Around this moment', onPress: () => undefined };
const bar = () => (
  <ActionBar label="Log line" primary={{ id: 'explain', label: 'Explain', onPress: () => undefined }} secondary={[sec1]} />
);
const drawn = () => within(screen.getByRole('group', { name: 'Log line' })).queryByRole('button', { name: 'Around this moment' });

describe('ActionBar fold: the container the CSS reads', () => {
  it('a narrow main region inside a wide page region folds, as its `@container content` rules do', async () => {
    pageRegion(900);
    await show(() => <Region px={550}>{bar()}</Region>);
    expect(drawn()).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('a wide main region inside a narrower page region does not fold', async () => {
    pageRegion(500);
    await show(() => <Region px={700}>{bar()}</Region>);
    expect(drawn()).toBeInTheDocument();
  });

  it('the content box is measured: padding that takes it under 600 px folds', async () => {
    await show(() => <Region px={620} pad={16}>{bar()}</Region>);
    expect(drawn()).toBeNull();
  });

  it('with no marked container around it, the bar still reads the page region', async () => {
    pageRegion(390);
    await show(bar);
    expect(drawn()).toBeNull();
  });

  it('a fractional content box under 600 px folds (the observer\'s size, not the rounded clientWidth)', async () => {
    // The observer reports at the start, as a browser's does, with the content box a container query reads.
    class FractionalObserver {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentBoxSize: [{ inlineSize: 599.6, blockSize: 0 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', FractionalObserver);
    try {
      await show(() => <Region px={600}>{bar()}</Region>);
      expect(drawn()).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
