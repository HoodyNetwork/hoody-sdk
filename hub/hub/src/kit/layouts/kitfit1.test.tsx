// Vitest: a Toolbar keeps its controls when its notice comes or goes: the start and end
// controls are the same elements and a focused control keeps focus (one root, the notice slot after the bar).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toolbar } from './PageHeader';

function Bar({ notice }: { notice?: string }) {
  return <Toolbar start={<button type="button">7 days</button>} end={<button type="button">Add AI credit</button>} notice={notice} />;
}

describe('Toolbar notice on and off', () => {
  it('keeps the same controls and the focus when the notice appears and goes', () => {
    const { rerender, container } = render(<Bar />);
    const start = screen.getByRole('button', { name: '7 days' });
    const end = screen.getByRole('button', { name: 'Add AI credit' });
    const bar = screen.getByRole('group');
    const root = container.firstElementChild;
    start.focus();
    expect(document.activeElement).toBe(start);

    rerender(<Bar notice="Credit unavailable" />);
    expect(screen.getByRole('button', { name: '7 days' })).toBe(start);
    expect(screen.getByRole('button', { name: 'Add AI credit' })).toBe(end);
    expect(screen.getByRole('group')).toBe(bar);
    expect(container.firstElementChild).toBe(root);
    expect(document.activeElement).toBe(start);
    expect(bar.contains(screen.getByText('Credit unavailable'))).toBe(false);

    rerender(<Bar />);
    expect(screen.getByRole('button', { name: '7 days' })).toBe(start);
    expect(screen.queryByText('Credit unavailable')).toBeNull();
    expect(document.activeElement).toBe(start);
  });

  it('puts a className on the one root, with or without a notice', () => {
    const { container, rerender } = render(<Toolbar className="mine" start={<button type="button">a</button>} />);
    expect(container.firstElementChild?.classList.contains('mine')).toBe(true);
    rerender(<Toolbar className="mine" start={<button type="button">a</button>} notice="n" />);
    expect(container.firstElementChild?.classList.contains('mine')).toBe(true);
    expect(container.querySelectorAll('.mine')).toHaveLength(1);
  });
});
