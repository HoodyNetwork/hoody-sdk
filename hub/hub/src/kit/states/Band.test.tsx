import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Band, Notice } from './Band';

describe('Band', () => {
  it('neutral is a status, warning and danger are alerts', () => {
    render(
      <>
        <Band>Showing what we read at 12:03</Band>
        <Band tone="warn">One source failed</Band>
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing what we read');
    expect(screen.getByRole('alert')).toHaveTextContent('One source failed');
  });

  it('shows its actions and closes only when dismissible', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Band actions={<button type="button">Try again</button>}>Stale</Band>);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    rerender(<Band onDismiss={onDismiss}>Stale</Band>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Notice ("Edge bars")', () => {
  it('a block notice is a paragraph with no live role, calm by default, with the info mark', () => {
    render(<Notice>Showing 8 of 33 computers.</Notice>);
    const p = screen.getByText('Showing 8 of 33 computers.').closest('[data-notice]');
    expect(p?.tagName).toBe('P');
    expect(p?.getAttribute('data-notice')).toBe('calm');
    expect(p?.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warn takes the warning level; inline is a span; icon={null} draws none', () => {
    render(
      <p>
        <Notice level="warn" inline icon={null}>
          Notes did not answer.
        </Notice>
      </p>,
    );
    const n = screen.getByText('Notes did not answer.').closest('[data-notice]');
    expect(n?.tagName).toBe('SPAN');
    expect(n?.getAttribute('data-notice')).toBe('warn');
    expect(n?.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
