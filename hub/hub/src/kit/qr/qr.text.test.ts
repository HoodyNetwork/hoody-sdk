// Vitest: the text-mode QR matrix (a share message as a code, never as a URL).
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrTextMatrix } from './qr';

describe('qrTextMatrix', () => {
  it('codes any text, with no https rule (a URL stays for qrMatrix)', () => {
    const m = qrTextMatrix('Hoody shared access: Studio\nToken: hdy_x');
    expect(m).not.toBeNull();
    expect(m!.size).toBeGreaterThan(20);
    expect(qrMatrix('Hoody shared access: Studio')).toBeNull();
  });
  it('empty or too long for a code: none', () => {
    expect(qrTextMatrix('')).toBeNull();
    expect(qrTextMatrix(undefined)).toBeNull();
    expect(qrTextMatrix('x'.repeat(5000))).toBeNull();
  });
});
