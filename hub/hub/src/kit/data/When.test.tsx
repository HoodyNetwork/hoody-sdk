import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateTime } from '../format';
import { When } from './When';

const NOW = Date.parse('2026-11-12T16:00:00Z');

describe('When', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the relative time in a <time> that carries the exact moment', () => {
    for (const at of ['2026-11-12T15:57:00Z', Date.parse('2026-11-12T15:57:00Z'), new Date('2026-11-12T15:57:00Z')]) {
      const { container, unmount } = render(<When at={at} />);
      const el = container.querySelector('time');
      expect(el?.textContent).toBe('3 minutes ago');
      expect(el?.getAttribute('datetime')).toBe('2026-11-12T15:57:00.000Z');
      expect(el?.getAttribute('title')).toBe(formatDateTime('2026-11-12T15:57:00Z'));
      unmount();
    }
  });

  it("shows the page's own words when it gives them, on the same exact moment", () => {
    const { container } = render(<When at="2026-11-12T19:00:00Z" text="ends in 3 hours" />);
    const el = container.querySelector('time');
    expect(el?.textContent).toBe('ends in 3 hours');
    expect(el?.getAttribute('datetime')).toBe('2026-11-12T19:00:00.000Z');
  });

  it('a value that is not a date shows the words alone, never "Invalid Date"', () => {
    const bad = render(<When at="soon" text="unknown" />);
    expect(bad.container.querySelector('time')).toBeNull();
    expect(bad.container.textContent).toBe('unknown');
    const empty = render(<When at={Number.NaN} />);
    expect(empty.container.textContent).toBe('');
  });
});
