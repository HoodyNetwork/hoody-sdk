// Vitest (askcard): Home's Ask card hands off to the open dock instead of drawing a second composer beside it. With the
// dock open the card is one line that says Agent is open, with a Go to Agent button that moves focus into the dock; with the
// dock closed the card is the composer it always was.
import { act, render, renderHook, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { setAskFocus, setAskForFixtures, useAskDock } from '@kit/ask';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetActionHolds } from './data';
import page from './page';
import { AskStrip } from './parts/AskStrip';
import './testWaits';

const dock = () => renderHook(() => useAskDock()).result.current;

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
  { const d = dock(); act(() => d.close()); }
});
afterEach(() => {
  { const d = dock(); act(() => d.close()); }
  setAskFocus(null);
  setAskForFixtures(false);
});

describe('Home Ask card and the dock', () => {
  it('dock closed: the card is the composer, as before', () => {
    render(<AskStrip name="atlas" />);
    expect(screen.getByRole('textbox', { name: 'Ask atlas to do something' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Agent' })).toBeNull();
  });

  it('dock open: one line that says Agent is open, no second composer', () => {
    { const d = dock(); act(() => d.open()); }
    render(<AskStrip name="atlas" />);
    expect(screen.getByText('Agent is open beside this page.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ask atlas to do something' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });

  it('Go to Agent moves focus into the dock (the panel\'s own focus), and keeps the dock open', async () => {
    const focus = vi.fn(() => true);
    setAskFocus(focus);
    { const d = dock(); act(() => d.open()); }
    render(<AskStrip name="atlas" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to Agent' }));
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    expect(dock().isOpen).toBe(true);
  });

  it('the dock closing brings the composer back', () => {
    { const d = dock(); act(() => d.open()); }
    render(<AskStrip name="atlas" />);
    expect(screen.queryByRole('textbox', { name: 'Ask atlas to do something' })).toBeNull();
    { const d = dock(); act(() => d.close()); }
    expect(screen.getByRole('textbox', { name: 'Ask atlas to do something' })).toBeInTheDocument();
  });

  it('the focus seam: from a closed dock, focus() opens it and then runs the panel\'s focus', async () => {
    const focus = vi.fn(() => true);
    setAskFocus(focus);
    const d = dock();
    act(() => d.focus());
    expect(dock().isOpen).toBe(true);
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  });

  it('on the Home page with the dock open: the handoff line shows, and Home draws no composer of its own', async () => {
    { const d = dock(); act(() => d.open()); }
    await renderPage(page);
    expect(await screen.findByText('Agent is open beside this page.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Ask .* to do something$/ })).toBeNull();
  });
});
