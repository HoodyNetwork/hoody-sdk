// attachio.ts: reading picked, pasted and dropped files in the browser. The rules live in attach.ts.
// A screenshot over the agent's 4 MiB is drawn smaller once, here (long side at most 2560, WebP 0.9, PNG
// when it has transparency, smaller per try); the smaller bytes are what is kept, shown ("Made smaller to fit") and
// sent, so a retry sends the same bytes.
import { hostEnv } from '@core';
import * as A from './attach';
import { objectUrl } from './objectUrl';

export { objectUrl, revoke } from './objectUrl';

/** Bigger files are refused without being read (no screenshot is this big; it keeps the tab's memory safe). */
const READ_MAX = 64 * 1024 * 1024;
const TRIES = 4;

/** Draws an image smaller until it fits; null when it cannot (or the browser cannot draw it). */
export type Shrink = (blob: Blob) => Promise<Uint8Array | null>;

let seq = 0;
const nextId = () => 'a' + Date.now().toString(36) + (++seq).toString(36);

async function bytesOf(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

/** At most this many files are read from one pick, paste or drop; the rest are named, never read. */
export const BATCH_MAX = 10;

/** Reads each file in order; never throws. `room`: how many more images and text files the draft takes. A file past
 *  it (or past BATCH_MAX) is refused by name before it is read, so a big pick never holds more than the draft can
 *  keep. */
export async function readFiles(files: readonly File[], room: { imgs: number; texts: number } = { imgs: A.IMG_MAX, texts: A.TXT_MAX }, shrink: Shrink = canvasShrink): Promise<A.Prepared[]> {
  const out: A.Prepared[] = [];
  let imgs = room.imgs, texts = room.texts;
  for (const [i, f] of files.entries()) {
    const name = A.safeName(f.name, 'file');
    if (i >= BATCH_MAX) { out.push({ ok: false, why: { key: 'ask.attSkipped', name } }); continue; }
    try {
      const head = A.sniff(await bytesOf(f.slice(0, 16)));
      if (head && imgs <= 0) { out.push({ ok: false, why: { key: 'ask.attImgMany', name } }); continue; }
      if (!head && texts <= 0) { out.push({ ok: false, why: { key: 'ask.attTextMany', name } }); continue; }
      if (!head && f.size > A.TXT_BYTES) { out.push({ ok: false, why: { key: 'ask.attTextBig', name, size: f.size } }); continue; }
      if (head && (f.size > READ_MAX || (f.size > A.IMG_BYTES && head === 'image/gif'))) { out.push({ ok: false, why: { key: 'ask.attImgBig', name, size: f.size } }); continue; }
      const b = await bytesOf(f);
      let shrunk: { bytes: Uint8Array; from: number } | undefined;
      if (head && b.length > A.IMG_BYTES) {
        const small = await shrink(new Blob([b as BlobPart], { type: head })).catch(() => null);
        if (!small) { out.push({ ok: false, why: { key: 'ask.attImgBig', name, size: b.length } }); continue; }
        shrunk = { bytes: small, from: b.length };
      }
      const sent = shrunk ? shrunk.bytes : b;
      const p = A.prepare(nextId(), name, b, () => objectUrl(sent, A.sniff(sent) ?? 'application/octet-stream'), shrunk);
      if (p.ok) { if (p.att.kind === 'image') imgs--; else texts--; }
      out.push(p);
    } catch {
      out.push({ ok: false, why: { key: 'ask.attReadFail', name } });
    }
  }
  return out;
}

/** The browser's own drawing: createImageBitmap + canvas. */
export const canvasShrink: Shrink = async (blob) => {
  if (hostEnv().browserPage !== true || typeof createImageBitmap !== 'function') return null;
  const bmp = await createImageBitmap(blob);
  try {
    let alpha: boolean | null = null;
    for (let step = 0; step < TRIES; step++) {
      const { w, h } = A.shrinkSize(bmp.width, bmp.height, step);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(bmp, 0, 0, w, h);
      if (alpha === null) alpha = blob.type !== 'image/jpeg' && hasAlpha(g, w, h);
      const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, alpha ? 'image/png' : 'image/webp', 0.9));
      if (out && out.size <= A.IMG_BYTES) return bytesOf(out);
    }
    return null;
  } finally {
    bmp.close();
  }
};
function hasAlpha(g: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = g.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 255) < 255) return true;
  return false;
}
