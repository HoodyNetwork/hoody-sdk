// The QR image reader (qrImage.ts) on the image the API really sends for a 2FA setup: a PNG of the otpauth address
// drawn at a fixed width, so a module is not a whole number of pixels (300 px over the code's modules plus a margin of
// 2 on each side). A code that reads wrong is worse than none: every matrix read here must be the exact one the
// library made for that address, and an independent decoder (jsQR) must read the address back from it.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The API's own options, for short to long account names (several QR sizes): read, exact, decodes to the address | 'the API image' |
// | 2 | Other widths and margins: read exactly or not at all, never a different matrix; whole pixels still read at any scale | 'exact or nothing' |
// | 3 | A picture with finders but broken timing lines, or two pixels per fractional module, is not read | 'not a clean code' |
import { expect, setDefaultTimeout, test } from 'bun:test';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import type { QrMatrix } from './qr';
import { qrImageMatrix, sample } from './qrImage';

// The scan takes several seconds on a loaded host; bun's 5 s default cuts it short.
setDefaultTimeout(60_000);

// The API's call: QRCode.toDataURL(otpauth_url, { errorCorrectionLevel: 'M', width: 300, margin: 2 }).
const API = { errorCorrectionLevel: 'M', width: 300, margin: 2 } as const;
// A 32-byte secret in base32 is 52 characters; this one is made up.
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW';
const url = (user: string): string => `otpauth://totp/Hoody%20(${user})?secret=${SECRET}&issuer=Hoody`;
const USERS = ['a', 'ada', 'ada.lovelace', 'a-much-longer-user-name-0123456789', 'x'.repeat(60), 'y'.repeat(120)];

const exact = (m: QrMatrix, text: string): boolean => {
  const ref = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  if (m.size !== ref.size) return false;
  for (let r = 0; r < ref.size; r++) for (let c = 0; c < ref.size; c++) if (m.dark(r, c) !== (ref.data[r * ref.size + c] === 1)) return false;
  return true;
};

/** What jsQR reads from the matrix drawn at 4 px a module inside a quiet zone of 4 modules. */
const decoded = (m: QrMatrix): string | undefined => {
  const scale = 4, quiet = 4, w = (m.size + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const r = Math.floor(y / scale) - quiet, c = Math.floor(x / scale) - quiet;
    if (r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c)) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
  }
  return jsQR(data, w, w)?.data;
};

test('the API image', async () => {
  const sizes = new Set<number>();
  for (const user of USERS) {
    const m = await qrImageMatrix(await QRCode.toDataURL(url(user), API));
    expect({ user: user.length, read: m !== null }).toEqual({ user: user.length, read: true });
    expect(exact(m!, url(user))).toBe(true);
    expect(decoded(m!)).toBe(url(user));
    // The module really is fractional here: the old reader's whole-pixel rule would have refused it.
    expect(Number.isInteger(300 / (m!.size + 4))).toBe(false);
    sizes.add(m!.size);
  }
  expect(sizes.size).toBeGreaterThanOrEqual(4);
});

test('exact or nothing', async () => {
  let read = 0, refused = 0;
  for (const user of USERS) for (const width of [120, 150, 200, 256, 300, 333, 512]) for (const margin of [0, 1, 2, 4]) {
    const m = await qrImageMatrix(await QRCode.toDataURL(url(user), { errorCorrectionLevel: 'M', width, margin }));
    if (m === null) { refused++; continue; }
    read++;
    expect({ user: user.length, width, margin, exact: exact(m, url(user)) }).toEqual({ user: user.length, width, margin, exact: true });
  }
  expect(read).toBeGreaterThan(80);
  expect(refused).toBeGreaterThan(0);
  // Whole pixels per module read at any scale, one pixel included.
  for (const scale of [1, 2, 3, 4, 7]) {
    const m = await qrImageMatrix(await QRCode.toDataURL(url('ada'), { errorCorrectionLevel: 'M', scale, margin: 1 }));
    expect({ scale, exact: m !== null && exact(m, url('ada')) }).toEqual({ scale, exact: true });
  }
});

test('not a clean code', () => {
  const ref = QRCode.create(url('ada'), { errorCorrectionLevel: 'M' }).modules;
  const n = ref.size;
  const grid = (px: number, dark: (r: number, c: number) => boolean) => {
    const w = Math.floor(n * px) + 8;
    return { w, h: w, dark: (x: number, y: number) => { const c = Math.floor((x - 4) / px), r = Math.floor((y - 4) / px); return r >= 0 && c >= 0 && r < n && c < n && dark(r, c); } };
  };
  const real = (r: number, c: number): boolean => ref.data[r * n + c] === 1;
  expect(sample(grid(6.5, real))?.size).toBe(n);
  // The timing row filled in: finders are right, the code is not.
  expect(sample(grid(6.5, (r, c) => real(r, c) || (r === 6 && c > 7 && c < n - 8)))).toBeNull();
  // A fractional module too small to sample safely.
  expect(sample(grid(2.5, real))).toBeNull();
  expect(sample(grid(3, real))?.size).toBe(n);
});
