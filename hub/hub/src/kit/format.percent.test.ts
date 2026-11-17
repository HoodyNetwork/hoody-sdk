// formatPercent: the one rounding for percentages (usage readings on Computers and Servers).
import { describe, expect, it } from 'vitest';
import { formatPercent } from './format';

describe('kit: formatPercent', () => {
  it('one decimal under 10, whole numbers from 10', () => {
    expect(formatPercent(0.12884237357487155)).toBe('0.1');
    expect(formatPercent(9.94)).toBe('9.9');
    expect(formatPercent(9.95)).toBe('10');
    expect(formatPercent(42.4615)).toBe('42');
    expect(formatPercent(99.5)).toBe('100');
    expect(formatPercent(100)).toBe('100');
    expect(formatPercent(1234.5)).toBe('1,235');
  });

  it('a tiny reading above 0 shows as under 0.1, never as 0', () => {
    expect(formatPercent(0.04)).toBe('<0.1');
    expect(formatPercent(Number.MIN_VALUE)).toBe('<0.1');
    expect(formatPercent(0.05)).toBe('0.1');
    expect(formatPercent(0)).toBe('0');
  });

  it('a negative reading shows 0; a value that is not a finite number shows a dash', () => {
    expect(formatPercent(-3)).toBe('0');
    expect(formatPercent(-0)).toBe('0');
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe('—');
  });
});
