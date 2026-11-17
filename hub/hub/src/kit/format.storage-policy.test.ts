// The storage unit policy is one setting (STORAGE_STEP in format.ts): sizes given in GB, sizes given in bytes and the
// bytes→GB conversion a page needs all step by it, so a decimal choice changes every storage size the Hub shows at once.
import { describe, expect, it } from 'vitest';
import { bytesToGb, formatBytes, formatStorage, storageFormatters } from './format';

describe('kit: one storage unit policy', () => {
  it('the exported formatters are the binary policy', () => {
    const bin = storageFormatters(1024);
    for (const b of [0, 512, 1024 ** 3, 1.5 * 1024 ** 3, 1024 ** 4, 2.5 * 1024 ** 4]) {
      expect(formatBytes(b)).toBe(bin.formatBytes(b));
      expect(bytesToGb(b)).toBe(bin.bytesToGb(b));
    }
    expect(formatStorage(2048)).toBe(bin.formatStorage(2048));
  });
  for (const step of [1024, 1000]) {
    it(`step ${step}: a size from bytes reads the same through formatStorage and formatBytes`, () => {
      const p = storageFormatters(step);
      for (const b of [step ** 3, 4 * step ** 3, step ** 4, 2 * step ** 4]) expect(p.formatStorage(p.bytesToGb(b))).toBe(p.formatBytes(b));
    });
  }
  it('decimal: one trillion bytes is 1 TB, and 1000 GB is 1 TB', () => {
    const dec = storageFormatters(1000);
    expect(dec.formatStorage(dec.bytesToGb(1e12))).toBe('1 TB');
    expect(dec.formatStorage(1000)).toBe('1 TB');
    expect(dec.formatBytes(1e12)).toBe('1 TB');
  });
  it('binary: 1024 GB is 1 TB and 1000 GB stays in GB', () => {
    const bin = storageFormatters(1024);
    expect(bin.formatStorage(1024)).toBe('1 TB');
    expect(bin.formatStorage(1000)).toBe('1,000 GB');
    expect(bin.formatStorage(bin.bytesToGb(1e12))).toBe('931.3 GB');
  });
});
