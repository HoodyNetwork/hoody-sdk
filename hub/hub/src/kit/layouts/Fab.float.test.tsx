// The floating action button: the end glyph is the one the header button would
// show (the plus only for a create, "New …"; the arrow otherwise; the action's own `glyph` when it names one), never a
// forced plus. Collapsed to its glyph (content scrolled down) it shows its name as a tooltip on hover or focus; at full
// width the label is the name and no tip shows.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Fab } from './PageHeader';

vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

let main: HTMLElement;
beforeEach(() => {
  boot();
  main = document.createElement('div');
  main.id = 'hub-main';
  document.body.appendChild(main);
});
afterEach(() => {
  main.remove();
});

async function mount(children: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const glyphOf = () => document.querySelector('[data-hub-fab] [data-glyph-mark] [data-px]')?.getAttribute('data-px');

const scrollDown = () => {
  act(() => {
    main.scrollTop = 400;
    fireEvent.scroll(main);
  });
};

describe('Fab glyph', () => {
  it('a create ("New …") shows the plus', async () => {
    await mount(<Fab action={{ label: 'New note', onPress: () => undefined }} />);
    expect(glyphOf()).toBe('plus');
  });

  it('an action that is not a create shows the arrow, not the plus', async () => {
    await mount(<Fab action={{ label: 'Add key', onPress: () => undefined }} />);
    expect(glyphOf()).toBe('arrow');
  });

  it("the action's own glyph wins", async () => {
    await mount(<Fab action={{ label: 'Add funds', glyph: 'dollar', onPress: () => undefined }} />);
    expect(glyphOf()).toBe('dollar');
  });
});

describe('Fab name tip', () => {
  it('collapsed, it shows its name as a tooltip on focus', async () => {
    await mount(<Fab action={{ label: 'Add funds', glyph: 'dollar', onPress: () => undefined }} />);
    scrollDown();
    expect(document.querySelector('[data-hub-fab]')!.className).toMatch(/fabSmall/);
    await userEvent.tab();
    const tip = await waitFor(() => screen.getByRole('tooltip'));
    expect(tip.textContent).toBe('Add funds');
    expect(tip.hasAttribute('data-hub-fab-tip')).toBe(true);
  });

  it('at full width the label is the name: no tip', async () => {
    await mount(<Fab action={{ label: 'Add funds', glyph: 'dollar', onPress: () => undefined }} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Add funds' })).toHaveFocus();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('the button keeps one name in both states', async () => {
    await mount(<Fab action={{ label: 'New note', onPress: () => undefined }} />);
    expect(screen.getByRole('button', { name: 'New note' })).toBeTruthy();
    scrollDown();
    expect(screen.getByRole('button', { name: 'New note' })).toBeTruthy();
  });
});

describe('Fab collapse: only when the glyph names the action', () => {
  const isSmall = () => /fabSmall/.test(document.querySelector('[data-hub-fab]')!.className);

  it('a float whose glyph is the generic arrow keeps its label on scroll down', async () => {
    await mount(<Fab action={{ label: 'Share this realm', onPress: () => undefined }} />);
    scrollDown();
    expect(isSmall()).toBe(false);
  });

  it('a create ("New …", the plus) collapses on scroll down', async () => {
    await mount(<Fab action={{ label: 'New key', onPress: () => undefined }} />);
    scrollDown();
    expect(isSmall()).toBe(true);
  });

  it('an own glyph other than the arrow collapses', async () => {
    await mount(<Fab action={{ label: 'Add funds', glyph: 'dollar', onPress: () => undefined }} />);
    scrollDown();
    expect(isSmall()).toBe(true);
  });

  it('an action that names the arrow as its own glyph keeps its label', async () => {
    await mount(<Fab action={{ label: 'Open', glyph: 'arrow', onPress: () => undefined }} />);
    scrollDown();
    expect(isSmall()).toBe(false);
  });
  it('a shrunk float whose action changes to an arrow-only one grows back at once, with no scroll', async () => {
    function Swap() {
      const [label, setLabel] = useState('New key');
      return (
        <>
          <button type="button" onClick={() => setLabel('Share this realm')}>
            swap
          </button>
          <Fab action={{ label, onPress: () => undefined }} />
        </>
      );
    }
    await mount(<Swap />);
    scrollDown();
    expect(isSmall()).toBe(true);
    await act(async () => screen.getByText('swap').click());
    expect(isSmall()).toBe(false);
  });
});
