// The composer's Claude Code usage chip shows the governing window in the design's words, in its band's tone,
// silently, and ages itself out at the window's reset.
import { act, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitChip, rateLimitResetText } from './RateLimitChip';
import { parseRateLimit, rateLimitSupersedes, type RateLimitReading } from './rateLimit';

// A pinned zone, so every expected clock text is a calendar fact: Monday 2026-11-02 12:00 in Berlin (CET, UTC+1).
const TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Europe/Berlin'; });
afterAll(() => {
  if (TZ === undefined) delete process.env.TZ;
  else process.env.TZ = TZ;
});
const NOW = Date.UTC(2026, 10, 2, 11, 0, 0);
const S = NOW / 1000;
const reading = (o: Record<string, unknown>): RateLimitReading => parseRateLimit({ status: 'allowed', rev: 1, epoch: 1, ...o })!;
const five = (u: number | null, resetsIn: number, limiting = true) => ({ name: 'five_hour', utilization: u ?? 0, has_utilization: u !== null, resets_at: S + resetsIn, limiting });
const at = (secs: number) => rateLimitResetText(S + secs, NOW);
const apply = (held: RateLimitReading | null, raw: unknown) => {
  const next = parseRateLimit(raw);
  return next && rateLimitSupersedes(held, next) ? next : held;
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe('RateLimitChip', () => {
  it('shows the governing window, its percent and its reset time', () => {
    render(<RateLimitChip reading={reading({ windows: [{ name: 'seven_day', utilization: 0.95, has_utilization: true, resets_at: S + 86400 * 3, limiting: false }, five(0.92, 4 * 3600)] })} />);
    expect(screen.getByText(`5-hour window 92%, resets ${at(4 * 3600)}`)).toBeInTheDocument();
    expect(at(4 * 3600)).toBe('16:00');
  });
  it('reset text is the calendar in the viewer\'s zone: the clock today, the weekday on another day', () => {
    // Berlin: Wednesday 2026-11-04 12:00; Tuesday 00:30 is after the next midnight; Monday 23:59 is still today.
    expect(rateLimitResetText(Date.UTC(2026, 10, 4, 11, 0) / 1000, NOW)).toMatch(/^Wed,? 12:00$/);
    expect(rateLimitResetText(Date.UTC(2026, 10, 2, 23, 30) / 1000, NOW)).toMatch(/^Tue,? 00:30$/);
    expect(rateLimitResetText(Date.UTC(2026, 10, 2, 22, 59) / 1000, NOW)).toBe('23:59');
    expect(rateLimitResetText(0, NOW)).toBe('');
  });
  it('a frame with a reset Date cannot render is refused, so the chip keeps the held reading and never throws', () => {
    const held = reading({ windows: [five(0.5, 600)] });
    const after = apply(held, { status: 'allowed', rev: 2, epoch: 1, windows: [{ ...five(0.6, 600), resets_at: 9_000_000_000_000 }] });
    expect(after).toBe(held);
    render(<RateLimitChip reading={after} />);
    expect(screen.getByText(`5-hour window 50%, resets ${at(600)}`)).toBeInTheDocument();
  });
  it('a frame past the utilization clamp is refused: never "Infinity%", the held reading stays', () => {
    const held = reading({ windows: [five(0.5, 600)] });
    const after = apply(held, { status: 'allowed', rev: 2, epoch: 1, windows: [five(1e306, 600)] });
    expect(after).toBe(held);
    const { container } = render(<RateLimitChip reading={after} />);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
    expect(screen.getByText(/^5-hour window 50%/)).toBeInTheDocument();
    // At the clamp itself the chip reads 1000%.
    render(<RateLimitChip reading={reading({ windows: [five(10, 900)] })} />);
    expect(screen.getByText(/^5-hour window 1000%/)).toBeInTheDocument();
  });
  it('a refusal names the wait, not the percentage, in the danger tone', () => {
    const { container } = render(<RateLimitChip reading={reading({ status: 'rejected', windows: [five(1.04, 1800)] })} />);
    expect(screen.getByText(`5-hour window used up, resets ${at(1800)}`)).toBeInTheDocument();
    expect(container.querySelector('[class*="danger"]')).not.toBeNull();
  });
  it('overage absorbing the work is not a refusal: the percentage, never red', () => {
    const { container } = render(<RateLimitChip reading={reading({ status: 'rejected', is_using_overage: true, windows: [five(1.04, 1800)] })} />);
    expect(screen.getByText(`5-hour window 104%, resets ${at(1800)}`)).toBeInTheDocument();
    expect(container.querySelector('[class*="danger"]')).toBeNull();
  });
  it('amber from the 0.70 floor, neutral below it', () => {
    const { container, rerender } = render(<RateLimitChip reading={reading({ windows: [five(0.71, 600)] })} />);
    expect(container.querySelector('[class*="warn"]')).not.toBeNull();
    rerender(<RateLimitChip reading={reading({ rev: 2, windows: [five(0.4, 600)] })} />);
    expect(container.querySelector('[class*="warn"]')).toBeNull();
    expect(screen.getByText(/^5-hour window 40%/)).toBeInTheDocument();
  });
  it('a window without a number shows its name and reset', () => {
    render(<RateLimitChip reading={reading({ windows: [five(null, 600)] })} />);
    expect(screen.getByText(`5-hour window, resets ${at(600)}`)).toBeInTheDocument();
  });
  it('is a reading, not an announcement: no live region or role', () => {
    const { container } = render(<RateLimitChip reading={reading({ status: 'rejected', windows: [five(1, 600)] })} />);
    expect(container.querySelector('[role], [aria-live]')).toBeNull();
  });
  it('shows nothing without a reading, or with only a window it cannot name', () => {
    const { container, rerender } = render(<RateLimitChip reading={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RateLimitChip reading={reading({ windows: [{ name: 'mystery', utilization: 0.99, has_utilization: true, resets_at: S + 600, limiting: false }] })} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('ages out on its own: the 5-hour window drops at its reset, then the weekly one governs; nothing once both reset', () => {
    const { container } = render(<RateLimitChip reading={reading({ windows: [five(0.8, 60), { name: 'seven_day', utilization: 0.3, has_utilization: true, resets_at: S + 600, limiting: false }] })} />);
    expect(screen.getByText(/^5-hour window 80%/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText(/^Weekly window 30%/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(540_000); });
    expect(container).toBeEmptyDOMElement();
  });
  it('wakes at local midnight: a weekday reset becomes today\'s clock with no new frame', () => {
    // Berlin Monday 23:59; the weekly window resets Tuesday 09:00.
    vi.setSystemTime(Date.UTC(2026, 10, 2, 22, 59));
    render(<RateLimitChip reading={reading({ windows: [{ name: 'seven_day', utilization: 0.3, has_utilization: true, resets_at: Date.UTC(2026, 10, 3, 8, 0) / 1000, limiting: true }] })} />);
    expect(screen.getByText(/^Weekly window 30%, resets Tue,? 09:00$/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText('Weekly window 30%, resets 09:00')).toBeInTheDocument();
  });
});
