// attach.ts: what the Agent panel can send with a message. Pure: no DOM.
//
// Images ride the turn as `attachments: [{type:'image', media_type, data, name}]` under the agent's own rules
// (the agent's own attachment check): at most 4 per turn, each at most 4 MiB decoded,
// bytes that sniff as PNG, JPEG, GIF, WebP or BMP with media_type equal to what they sniff as, and the whole body
// under 8 MiB (checked here with headroom at 7.5 MiB). A follow-up while a turn runs (POST /commands) carries text
// only, so images wait for the next turn.
// Small UTF-8 text files go into the message itself as fenced blocks, one fence longer than the longest backtick run
// in the file: at most 3, 24 KiB each, the whole message at most 28 KiB, which also fits the 32 KiB follow-up cap.
// Everything is checked when it is attached; nothing over a limit is kept, cut or dropped without a line.
// The bytes live in memory only (never the store, drafts or logs); a retry sends the same bytes under the same key.

export type Media = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/bmp';
export interface Img {
  id: string;
  kind: 'image';
  name: string;
  media: Media;
  /** Base64 of the bytes that are sent. */
  data: string;
  bytes: number;
  /** An object URL of the same bytes, for the thumbnail (revoked when the image goes). */
  url: string;
  /** Made smaller in the browser to fit (choice A): the size it had and the size it has. */
  resized?: { from: number; to: number };
}
export interface TextFile {
  id: string;
  kind: 'text';
  name: string;
  text: string;
  bytes: number;
  lines: number;
  /** Where a file read from a computer came from ("<computer>:<path>"): written on its fence line and shown on its chip. It names
   *  the origin for the reader; the agent resolves nothing from it. */
  from?: string;
}
export type Att = Img | TextFile;
/** Why a file was not added: a strings key and its values. */
export interface Refusal { key: string; name: string; size?: number }

export const IMG_MAX = 4;
export const IMG_BYTES = 4 * 1024 * 1024;
export const BODY_BYTES = Math.floor(7.5 * 1024 * 1024);
export const TXT_MAX = 3;
export const TXT_BYTES = 24 * 1024;
export const MSG_BYTES = 28 * 1024;
/** A screenshot made smaller keeps its long side at most this. */
export const SHRINK_SIDE = 2560;
const NAME_MAX = 120;

/** What the bytes are, read from their first bytes (the agent's own sniff decides, so media_type follows this). */
export function sniff(b: Uint8Array): Media | null {
  const at = (i: number, xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (b.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (b.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (b.length >= 6 && (at(0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || at(0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) return 'image/gif';
  // RIFF....WEBPVP, the agent's (Go's) sniff pattern.
  if (b.length >= 14 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50, 0x56, 0x50])) return 'image/webp';
  if (b.length >= 2 && at(0, [0x42, 0x4d])) return 'image/bmp';
  return null;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = (CRC[(c ^ (b[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32 = (b: Uint8Array, i: number) => (((b[i] as number) << 24) | ((b[i + 1] as number) << 16) | ((b[i + 2] as number) << 8) | (b[i + 3] as number)) >>> 0;
const u16 = (b: Uint8Array, i: number) => ((b[i] as number) << 8) | (b[i + 1] as number);
const PNG_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
/** A chunk's CRC (over its type and data) is right; the chunk is inside the bytes. */
const chunkOk = (b: Uint8Array, i: number, len: number) => i + 12 + len <= b.length && crc32(b, i + 4, i + 8 + len) === u32(b, i + 8 + len);

/** Whether an image's header reads as the agent reads it: step for step Go's image.DecodeConfig for PNG, JPEG and
 *  GIF (the agent checks only the sniff for WebP and BMP). An image that fails here would be refused with the whole
 *  message. */
export function headerOk(media: Media, b: Uint8Array): boolean {
  if (media === 'image/png') return pngOk(b);
  if (media === 'image/gif') {
    if (b.length < 13) return false;
    const flags = b[10] as number;
    return !(flags & 0x80) || b.length >= 13 + 3 * (1 << ((flags & 7) + 1));
  }
  if (media === 'image/jpeg') return jpegOk(b);
  return true;
}

/** PNG: chunks are read in order until the header is known (IHDR; a paletted image also needs its PLTE and then a
 *  tRNS or the first IDAT). Every chunk read whole has its CRC checked; other chunks on the way are skipped. */
function pngOk(b: Uint8Array): boolean {
  const START = 0, IHDR = 1, PLTE = 2;
  let i = 8, stage = START, paletted = false, depth = 0;
  for (;;) {
    if (i + 8 > b.length) return false;
    const len = u32(b, i);
    const type = String.fromCharCode(b[i + 4] as number, b[i + 5] as number, b[i + 6] as number, b[i + 7] as number);
    if (type === 'IHDR') {
      if (stage !== START || len !== 13 || i + 21 > b.length) return false;
      const w = u32(b, i + 8), h = u32(b, i + 12), ct = b[i + 17] as number;
      depth = b[i + 16] as number;
      if (b[i + 18] !== 0 || b[i + 19] !== 0 || (b[i + 20] as number) > 1) return false;
      if (w === 0 || h === 0 || w > 0x7fffffff || h > 0x7fffffff) return false;
      // Go keeps up to 8 bytes a pixel in an int: past that, "dimension overflow".
      if (BigInt(w) * BigInt(h) >= 1n << 60n) return false;
      if (!PNG_DEPTHS[ct]?.includes(depth) || !chunkOk(b, i, len)) return false;
      stage = IHDR;
      paletted = ct === 3;
      if (!paletted) return true;
    } else if (type === 'PLTE') {
      const np = Math.floor(len / 3);
      if (stage !== IHDR || len % 3 !== 0 || np <= 0 || np > 256 || np > 1 << depth || !chunkOk(b, i, len)) return false;
      stage = PLTE;
    } else if (type === 'tRNS') {
      return stage === PLTE && len <= 256 && chunkOk(b, i, len);
    } else if (type === 'IDAT') {
      return stage === PLTE;   // only its type is read
    } else if (type === 'IEND') {
      return false;
    } else if (len > 0x7fffffff || !chunkOk(b, i, len)) {
      return false;
    }
    i += 12 + len;
  }
}

/** JPEG: segments after SOI up to the frame header (SOF0/1/2: 8-bit, 1, 3 or 4 components the decoder supports);
 *  with no JFIF segment before it, on to the scan. Bytes between segments that are not a marker are skipped, as
 *  Go does. */
function jpegOk(b: Uint8Array): boolean {
  let i = 2, jfif = false, nc = 0;
  const hs: number[] = [], vs: number[] = [];
  for (;;) {
    if (i + 2 > b.length) return false;
    let a = b[i] as number, m = b[i + 1] as number;
    i += 2;
    while (a !== 0xff) {
      if (i >= b.length) return false;
      a = m; m = b[i++] as number;
    }
    if (m === 0x00) continue;   // FF 00: extraneous
    while (m === 0xff) {
      if (i >= b.length) return false;
      m = b[i++] as number;
    }
    if (m === 0xd9) return false;   // EOI
    if (m >= 0xd0 && m <= 0xd7) continue;   // RSTn: no length
    if (i + 2 > b.length) return false;
    const n = u16(b, i) - 2;
    i += 2;
    if (n < 0) return false;
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (nc !== 0 || (n !== 9 && n !== 15 && n !== 18) || i + n > b.length || b[i] !== 8) return false;
      nc = (n - 6) / 3;
      if (b[i + 5] !== nc) return false;
      for (let k = 0; k < nc; k++) {
        const c = b[i + 6 + 3 * k], hv = b[i + 7 + 3 * k] as number;
        for (let j = 0; j < k; j++) if (b[i + 6 + 3 * j] === c) return false;
        if ((b[i + 8 + 3 * k] as number) > 3) return false;
        let h = hv >> 4, v = hv & 0x0f;
        if (h < 1 || h > 4 || v < 1 || v > 4 || h === 3 || v === 3) return false;
        if (nc === 1) { h = 1; v = 1; }
        if (nc === 3 && ((k === 0 && v === 4) || (k === 1 && ((hs[0] as number) % h !== 0 || (vs[0] as number) % v !== 0)) || (k === 2 && (hs[1] !== h || vs[1] !== v)))) return false;
        if (nc === 4 && ((k === 0 && hv !== 0x11 && hv !== 0x22) || ((k === 1 || k === 2) && hv !== 0x11) || (k === 3 && (hs[0] !== h || vs[0] !== v)))) return false;
        hs[k] = h; vs[k] = v;
      }
      if (jfif) return true;
      i += n;
      continue;
    }
    if (m === 0xda) return nc > 0;   // SOS: the header is complete when a frame came first
    const skip = m === 0xc4 || m === 0xdb || m === 0xdd || (m >= 0xe0 && m <= 0xef) || m === 0xfe;
    if (!skip || i + n > b.length) return false;   // any other marker: unknown or unsupported
    if (m === 0xe0 && n >= 5) jfif = b[i] === 0x4a && b[i + 1] === 0x46 && b[i + 2] === 0x49 && b[i + 3] === 0x46 && b[i + 4] === 0;
    i += n;
  }
}

/** A file name fit to show and to send: no controls, no path, bounded. */
export function safeName(name: string, fallback: string): string {
  const n = String(name || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').split(/[\\/]/).pop()?.trim() ?? '';
  return [...(n || fallback)].slice(0, NAME_MAX).join('');
}

export function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** A text file's contents, or null when it is not UTF-8 text (invalid UTF-8, or a NUL byte). */
export function decodeText(b: Uint8Array): string | null {
  if (b.includes(0)) return null;
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(b);
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  } catch { return null; }
}

/** The most of an origin that is kept (a path can be long; the fence line stays one short line). */
export const FROM_MAX = 300;
/** An origin as one token of a fence line: no backtick, no whitespace, no control character, bounded. */
export function originToken(from: string | undefined): string {
  return (from ?? '').replace(/[`\s\u0000-\u001f\u007f]+/g, '_').slice(0, FROM_MAX);
}
const LANG: Record<string, string> = { log: 'log', txt: 'text', json: 'json', yaml: 'yaml', yml: 'yaml', csv: 'csv', md: 'markdown', conf: 'ini', ini: 'ini', toml: 'toml', xml: 'xml', sh: 'sh', env: 'text' };
/** One text file as a fenced block: the fence is one backtick longer than any run in the file (at least three). */
export function fence(f: Pick<TextFile, 'name' | 'text' | 'from'>): string {
  let run = 0;
  for (const m of f.text.matchAll(/`+/g)) run = Math.max(run, m[0].length);
  const tick = '`'.repeat(Math.max(3, run + 1));
  const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
  const name = f.name.replace(/[`\s]+/g, '_');
  const body = f.text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const from = originToken(f.from);
  return `${tick}${LANG[ext] ?? 'text'} title=${name}${from ? ` from=${from}` : ''}\n${body}\n${tick}`;
}
/** The text that is sent: what was typed, then each text file as a fenced block. */
export function messageText(typed: string, files: readonly TextFile[] | undefined): string {
  return files && files.length ? [typed, ...files.map(fence)].join('\n\n') : typed;
}
export function messageBytes(typed: string, files: readonly TextFile[] | undefined): number {
  return utf8(messageText(typed, files));
}
/** The turn body as JSON, in bytes (the agent's 8 MiB cap counts the whole request). */
export function bodyBytes(text: string, imgs: readonly Img[]): number {
  const meta = imgs.map((i) => ({ type: 'image', media_type: i.media, data: '', name: i.name }));
  return utf8(JSON.stringify({ text, attachments: meta })) + imgs.reduce((n, i) => n + i.data.length, 0);
}
export interface WireImage { type: 'image'; media_type: Media; data: string; name: string }
export function wire(imgs: readonly Img[]): WireImage[] {
  return imgs.map((i) => ({ type: 'image', media_type: i.media, data: i.data, name: i.name }));
}

/** A file read in the browser, before the limits that depend on what is already attached. */
export type Prepared = { ok: true; att: Att } | { ok: false; why: Refusal };

/** A file's bytes as an attachment, or why not. `shrunk` holds bytes the browser made smaller (choice A). */
export function prepare(id: string, name: string, b: Uint8Array, url: () => string, shrunk?: { bytes: Uint8Array; from: number }): Prepared {
  const n = safeName(name, 'file');
  const bytes = shrunk ? shrunk.bytes : b;
  const media = sniff(bytes);
  if (media) {
    if (!headerOk(media, bytes)) return { ok: false, why: { key: 'ask.attImgBroken', name: n } };
    if (bytes.length > IMG_BYTES) return { ok: false, why: { key: 'ask.attImgBig', name: n, size: (shrunk?.from ?? b.length) } };
    const img: Img = { id, kind: 'image', name: n, media, data: base64(bytes), bytes: bytes.length, url: url() };
    if (shrunk) img.resized = { from: shrunk.from, to: bytes.length };
    return { ok: true, att: img };
  }
  if (shrunk) return { ok: false, why: { key: 'ask.attImgBig', name: n, size: shrunk.from } };
  if (b.length > TXT_BYTES) return { ok: false, why: { key: 'ask.attTextBig', name: n, size: b.length } };
  const text = decodeText(b);
  if (text === null) return { ok: false, why: { key: 'ask.attNotText', name: n } };
  if (!text.trim()) return { ok: false, why: { key: 'ask.attEmpty', name: n } };
  return { ok: true, att: { id, kind: 'text', name: n, text, bytes: b.length, lines: text.replace(/\n$/, '').split('\n').length } };
}

/** Adds what fits to `have`, in order; each file that does not fit gets its line. The typed text counts towards the
 *  message size as it is now (Send checks again). */
export function admit(have: readonly Att[], add: readonly Att[], typed: string): { list: Att[]; refused: Refusal[] } {
  const list = [...have];
  const refused: Refusal[] = [];
  for (const a of add) {
    const imgs = list.filter((x): x is Img => x.kind === 'image');
    const files = list.filter((x): x is TextFile => x.kind === 'text');
    if (a.kind === 'image') {
      if (imgs.length >= IMG_MAX) { refused.push({ key: 'ask.attImgMany', name: a.name }); continue; }
      if (bodyBytes(messageText(typed, files), [...imgs, a]) > BODY_BYTES) { refused.push({ key: 'ask.attBodyFull', name: a.name }); continue; }
    } else {
      if (files.length >= TXT_MAX) { refused.push({ key: 'ask.attTextMany', name: a.name }); continue; }
      if (messageBytes(typed, [...files, a]) > MSG_BYTES) { refused.push({ key: 'ask.attTextFull', name: a.name }); continue; }
      if (bodyBytes(messageText(typed, [...files, a]), imgs) > BODY_BYTES) { refused.push({ key: 'ask.attBodyFull', name: a.name }); continue; }
    }
    list.push(a);
  }
  return { list, refused };
}

/** Why Send cannot take these attachments now, or null. `via` is the route the message would take. */
export function sendBlock(typed: string, atts: readonly Att[], via: 'create' | 'turn' | 'command'): string | null {
  const imgs = atts.filter((x): x is Img => x.kind === 'image');
  const files = atts.filter((x): x is TextFile => x.kind === 'text');
  if (imgs.length && via === 'command') return 'ask.attImgLater';
  if (files.length && messageBytes(typed, files) > MSG_BYTES) return 'ask.attTooLong';
  if (imgs.length && bodyBytes(messageText(typed, files), imgs) > BODY_BYTES) return 'ask.attTooLong';
  return null;
}

/** The long side and size a too-big screenshot is drawn at: at most SHRINK_SIDE, then smaller per try. */
export function shrinkSize(w: number, h: number, step: number): { w: number; h: number } {
  const side = Math.round(SHRINK_SIDE * Math.pow(0.75, step));
  const k = Math.min(1, side / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
