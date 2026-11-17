// Vitest: the kit StatusLine is one status element that stays
// mounted while its words come, change and go, so a screen reader hears each change (a live region that mounts with
// its text may be missed), and it is never inside another live region.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusLine } from '@kit';

describe('StatusLine', () => {
  it('one status element, kept from empty to words to other words and back to empty', () => {
    const { rerender, container } = render(<StatusLine />);
    const el = screen.getByRole('status');
    expect(el).toBeEmptyDOMElement();
    rerender(<StatusLine>Starting the run…</StatusLine>);
    expect(screen.getByRole('status')).toBe(el);
    expect(el).toHaveTextContent('Starting the run…');
    rerender(<StatusLine>Reading the TODO list…</StatusLine>);
    expect(screen.getByRole('status')).toBe(el);
    expect(el).toHaveTextContent('Reading the TODO list…');
    rerender(<StatusLine>{null}</StatusLine>);
    expect(screen.getByRole('status')).toBe(el);
    expect(el).toBeEmptyDOMElement();
    expect(container.querySelectorAll('[role="status"], [aria-live]').length).toBe(1);
  });

  it('polite and whole: the line is read as one, not as its changed part', () => {
    render(<StatusLine>Saving…</StatusLine>);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-live', 'polite');
    expect(el).toHaveAttribute('aria-atomic', 'true');
  });

  it('false, empty strings and arrays of nothing count as nothing to say', () => {
    const { rerender } = render(<StatusLine>{false}</StatusLine>);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(<StatusLine>{''}</StatusLine>);
    expect(screen.getByRole('status')).toHaveAttribute('data-empty', '');
  });
});
