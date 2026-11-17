import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FirstUseState, NoAccessState, NoMatchState, OfflineState } from './Recipes';

describe('empty-state recipes', () => {
  it('first use teaches and leads to the primary action', () => {
    render(<FirstUseState title="Your computers live here" body="One sentence." action={<button type="button">New computer</button>} />);
    expect(screen.getByRole('heading', { name: 'Your computers live here' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New computer' })).toBeInTheDocument();
  });

  it('no match offers Clear filters, in both sizes', () => {
    const onClear = vi.fn();
    const { rerender } = render(<NoMatchState onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    rerender(<NoMatchState onClear={onClear} size="compact" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it('no access says so without an action unless the page gives one', () => {
    render(<NoAccessState />);
    expect(screen.getByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offline retries on the button and again when the connection comes back', () => {
    const onRetry = vi.fn();
    const { unmount } = render(<OfflineState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(onRetry).toHaveBeenCalledTimes(2);
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
