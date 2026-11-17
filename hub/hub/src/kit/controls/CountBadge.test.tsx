// CountBadge: the shown text (whole, capped, a lower bound), the tone marker, the accessible wording when a label is
// given, and hiding it where its container already names the count.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountBadge, countText } from './CountBadge';

describe('countText', () => {
  it('shows a whole count and never a negative one', () => {
    expect(countText(3, 99)).toBe('3');
    expect(countText(3.9, 99)).toBe('3');
    expect(countText(-2, 99)).toBe('0');
  });

  it('caps at max with a plus', () => {
    expect(countText(99, 99)).toBe('99');
    expect(countText(100, 99)).toBe('99+');
    expect(countText(12, 9)).toBe('9+');
  });

  it('shows a lower bound with a plus, still capped at max', () => {
    expect(countText(5, 99, true)).toBe('5+');
    expect(countText(0, 99, true)).toBe('0+');
    expect(countText(150, 99, true)).toBe('99+');
  });
});

describe('CountBadge', () => {
  it('is neutral by default and shows the number as its text', () => {
    const { container } = render(<CountBadge count={7} />);
    const badge = container.querySelector('[data-count-badge]')!;
    expect(badge.getAttribute('data-count-badge')).toBe('neutral');
    expect(badge.textContent).toBe('7');
  });

  it('marks the accent tone', () => {
    const { container } = render(<CountBadge count={1} tone="accent" />);
    expect(container.querySelector('[data-count-badge="accent"]')).not.toBeNull();
  });

  it('with a label, hides the bare number from assistive tech and reads the words', () => {
    const { container } = render(<CountBadge count={120} label="120 unread" />);
    const badge = container.querySelector('[data-count-badge]')!;
    const [shown, words] = [...badge.children];
    expect(shown!.getAttribute('aria-hidden')).toBe('true');
    expect(shown!.textContent).toBe('99+');
    expect(words!.className).toBe('hxSrOnly');
    expect(words!.textContent).toBe('120 unread');
  });

  it('hidden: out of the accessibility tree, the label words too', () => {
    const { container } = render(<CountBadge count={4} atLeast hidden label="at least 4 waiting" />);
    const badge = container.querySelector('[data-count-badge]')!;
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('4+');
    expect(badge.querySelector('.hxSrOnly')).toBeNull();
  });

  it('is in the accessibility tree unless hidden', () => {
    const { container } = render(<CountBadge count={4} />);
    expect(container.querySelector('[data-count-badge]')!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('adds a placement class beside its own', () => {
    const { container } = render(<CountBadge count={2} className="pin" />);
    expect(container.querySelector('[data-count-badge]')!.className).toContain('pin');
  });
});
