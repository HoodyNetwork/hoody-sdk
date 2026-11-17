// StepPictures.pure.ts: what StepPictures (web) and its terminal twin share, with nothing that draws: the picture kinds a
// browser draws, told by their first bytes, and how many stored pictures of one chat are read at the same time.

/** How many stored pictures of one chat are read at the same time. */
export const STORED_AT_ONCE = 2;

/** The media type of bytes that are a picture a browser draws (PNG, JPEG, GIF, WebP), by their first bytes; else null. */
export function pictureMedia(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (b.length >= 6 && at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}
