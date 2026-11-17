// formatStorage: one wording for disk and memory sizes given in GB (Market listings first, the rest of the Hub later).
import { describe, expect, it } from 'vitest';
import { formatStorage } from './format';

describe('kit: formatStorage', () => {
  it('under 1024 GB reads in GB, whole numbers without ".0"', () => {
    expect(formatStorage(0)).toBe('0 GB');
    expect(formatStorage(1)).toBe('1 GB');
    expect(formatStorage(256)).toBe('256 GB');
    expect(formatStorage(960)).toBe('960 GB');
    expect(formatStorage(1000)).toBe('1,000 GB');
    expect(formatStorage(1023)).toBe('1,023 GB');
    expect(formatStorage(0.5)).toBe('0.5 GB');
    expect(formatStorage(12.0)).toBe('12 GB');
  });

  it('from 1024 GB reads in TB, in binary steps, with no ".0"', () => {
    expect(formatStorage(1024)).toBe('1 TB');
    expect(formatStorage(1536)).toBe('1.5 TB');
    expect(formatStorage(2048)).toBe('2 TB');
    expect(formatStorage(3840)).toBe('3.75 TB');
    expect(formatStorage(7680)).toBe('7.5 TB');
    expect(formatStorage(8192)).toBe('8 TB');
    // A size just over a whole TB rounds to two decimals and drops trailing zeros.
    expect(formatStorage(1025)).toBe('1 TB');
    expect(formatStorage(1034)).toBe('1.01 TB');
  });

  it('from 1024 TB reads in PB', () => {
    expect(formatStorage(1024 * 1024)).toBe('1 PB');
    // A size that rounds up to the next step reads in that step, never "1,024 TB".
    expect(formatStorage(1024 * 1024 - 1)).toBe('1 PB');
    expect(formatStorage(1023.96)).toBe('1 TB');
    expect(formatStorage(1.5 * 1024 * 1024)).toBe('1.5 PB');
  });

  it('follows the locale it is given', () => {
    expect(formatStorage(1536, { locale: 'de' })).toBe('1,5 TB');
    expect(formatStorage(1000, { locale: 'de' })).toBe('1.000 GB');
    expect(formatStorage(3840, { locale: 'fr' })).toMatch(/^3,75\sTB$/);
  });

  it('a value that is not a finite size of zero or more shows a dash', () => {
    expect(formatStorage(-1)).toBe('—');
    expect(formatStorage(Number.NaN)).toBe('—');
    expect(formatStorage(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
