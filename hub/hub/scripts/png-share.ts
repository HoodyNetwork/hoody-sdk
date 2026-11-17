// The blank-frame measure of a shot, taken in Node from the PNG bytes (no PNG is shipped back into the page to be
// decoded there). The sample: every 4th pixel in raster
// order, the share of the sampled pixels that are not the most common colour.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 1 - (most common sampled colour's count / samples), or null when the bytes are not an 8-bit, non-interlaced RGB or
 * RGBA PNG (the caller then measures in the browser). Throws nothing: a damaged file is null too.
 */
export function nonBackgroundShare(png: Buffer): number | null {
  try {
    if (png.length < 33 || !png.subarray(0, 8).equals(SIGNATURE)) return null;
    let width = 0;
    let height = 0;
    let bpp = 0;
    const idat: Buffer[] = [];
    let ended = false;
    for (let at = 8; at + 8 <= png.length; ) {
      const len = png.readUInt32BE(at);
      const type = png.toString('latin1', at + 4, at + 8);
      const body = png.subarray(at + 8, at + 8 + len);
      if (body.length !== len || at + 12 + len > png.length) return null;
      // A damaged chunk is not measured here: the caller falls back to the page.
      if (typeof zlib.crc32 === 'function' && zlib.crc32(png.subarray(at + 4, at + 8 + len)) !== png.readUInt32BE(at + 8 + len)) return null;
      if (type === 'IHDR') {
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        const depth = body[8];
        const colour = body[9];
        const interlace = body[12];
        if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) return null;
        bpp = colour === 2 ? 3 : 4;
      } else if (type === 'IDAT') idat.push(body);
      else if (type === 'tRNS') return null; // colour-keyed transparency: the canvas would draw it differently
      else if (type === 'IEND') {
        ended = true;
        break;
      }
      at += 12 + len;
    }
    if (!ended || !width || !height || !bpp || idat.length === 0) return null;
    const stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    if (raw.length !== (stride + 1) * height) return null;
    const pix = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const row = y * stride;
      for (let x = 0; x < stride; x++) {
        const cur = raw[src + x] ?? 0;
        const left = x >= bpp ? (pix[row + x - bpp] ?? 0) : 0;
        const up = y > 0 ? (pix[row - stride + x] ?? 0) : 0;
        const upLeft = y > 0 && x >= bpp ? (pix[row - stride + x - bpp] ?? 0) : 0;
        let add: number;
        if (filter === 0) add = 0;
        else if (filter === 1) add = left;
        else if (filter === 2) add = up;
        else if (filter === 3) add = (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        } else return null;
        pix[row + x] = (cur + add) & 255;
      }
    }
    const counts = new Map<number, number>();
    let n = 0;
    for (let p = 0; p < width * height; p += 4) {
      const i = p * bpp;
      if (bpp === 4 && pix[i + 3] !== 255) return null; // translucent pixel: the canvas measure sees it premultiplied
      const k = ((pix[i] ?? 0) << 16) | ((pix[i + 1] ?? 0) << 8) | (pix[i + 2] ?? 0);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      n++;
    }
    let most = 0;
    for (const c of counts.values()) if (c > most) most = c;
    return n ? 1 - most / n : 0;
  } catch {
    return null;
  }
}
