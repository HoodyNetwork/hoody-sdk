import { describe, expect, it } from 'vitest';
import * as A from './attach';

// A real PNG header (signature + a 1×1 IHDR with its CRC): the agent reads the header, not only the signature.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89];
const bytes = (head: number[], n = 64) => { const b = new Uint8Array(Math.max(n, head.length)); b.set(head); return b; };
const text = (s: string) => new TextEncoder().encode(s);
const url = () => 'blob:x';
const img = (id: string, n: number): A.Img => ({ id, kind: 'image', name: id + '.png', media: 'image/png', data: 'A'.repeat(Math.ceil(n / 3) * 4), bytes: n, url: 'blob:' + id });
const txt = (id: string, s: string): A.TextFile => ({ id, kind: 'text', name: id + '.log', text: s, bytes: text(s).length, lines: 1 });

describe('attach: what the Agent panel sends with a message', () => {
  it('an image is read as the agent reads its header; one that only looks like an image is refused by name', () => {
    const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (xs: number[]) => { let c = 0xffffffff; for (const x of xs) c = (crcT[(c ^ x) & 0xff] as number) ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const chunk = (type: string, data: number[]) => { const td = [...type].map((c) => c.charCodeAt(0)).concat(data); return [...be(data.length), ...td, ...be(crc(td))]; };
    const SIG = PNG.slice(0, 8);
    const ihdr = (ct: number, depth = 8) => chunk('IHDR', [...be(2), ...be(3), depth, ct, 0, 0, 0]);
    const ok = (b: number[], media: A.Media = 'image/png') => A.headerOk(media, new Uint8Array(b));
    expect(ok(PNG)).toBe(true);
    expect(ok(SIG)).toBe(false);                                                      // the signature alone
    expect(ok([...SIG, ...ihdr(6).slice(0, -1), 0])).toBe(false);                    // IHDR's CRC wrong
    expect(ok([...SIG, ...ihdr(2, 4)])).toBe(false);                                 // RGB at 4 bits: no such PNG
    expect(ok([...SIG, ...ihdr(3), ...chunk('IDAT', [1])])).toBe(false);             // paletted, no PLTE before the data
    // As Go: a paletted header is known at its tRNS or its first IDAT (only that chunk's type is read), not at PLTE.
    expect(ok([...SIG, ...ihdr(3), ...chunk('gAMA', [0, 0, 0, 1]), ...chunk('PLTE', [1, 2, 3])])).toBe(false);
    expect(ok([...SIG, ...ihdr(3), ...chunk('gAMA', [0, 0, 0, 1]), ...chunk('PLTE', [1, 2, 3]), ...chunk('IDAT', [1]).slice(0, 8)])).toBe(true);
    expect(ok([...SIG, ...ihdr(3), ...chunk('PLTE', [1, 2, 3]), ...chunk('tRNS', [0])])).toBe(true);
    expect(ok([...SIG, ...ihdr(3), ...chunk('tRNS', [0]), ...chunk('PLTE', [1, 2, 3])])).toBe(false);   // tRNS before PLTE
    expect(ok([...SIG, ...ihdr(3, 1), ...chunk('PLTE', Array(9).fill(0)), ...chunk('IDAT', [1])])).toBe(false);   // 3 colours at 1 bit
    expect(ok([...SIG, ...chunk('teXt', [97, 0, 98]), ...PNG.slice(8)])).toBe(true);    // a chunk before IHDR is skipped
    const big = (w: number, h: number) => ok([...SIG, ...chunk('IHDR', [...be(w), ...be(h), 8, 6, 0, 0, 0])]);
    expect(big(0x40000000, 0x3fffffff)).toBe(true);
    expect(big(0x40000000, 0x40000000)).toBe(false);   // 2^60 pixels: Go's "dimension overflow"
    const lsd = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 3, 0];
    expect(ok([...lsd, 0, 0, 0], 'image/gif')).toBe(true);
    expect(ok([...lsd, 0x81, 0, 0, ...Array(11).fill(0)], 'image/gif')).toBe(false);  // its colour table cut short
    expect(ok([...lsd, 0x81, 0, 0, ...Array(12).fill(0)], 'image/gif')).toBe(true);
    const jfif = [0xff, 0xe0, 0, 7, 0x4a, 0x46, 0x49, 0x46, 0];
    const exif = [0xff, 0xe1, 0, 4, 1, 2];
    const comps: Record<number, number[]> = { 1: [1, 0x11, 0], 3: [1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 4: [1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0] };
    const sof = (m: number, prec = 8, nc = 3, c = comps[nc] as number[]) => [0xff, m, 0, 8 + 3 * nc, prec, 0, 3, 0, 2, nc, ...c];
    const sos = [0xff, 0xda, 0, 2];
    const jpg = (...parts: number[][]) => ok([0xff, 0xd8, ...parts.flat()], 'image/jpeg');
    expect(jpg(jfif, sof(0xc0))).toBe(true);
    expect(jpg(jfif, sof(0xc2, 8, 1))).toBe(true);
    expect(jpg(jfif, sof(0xc1, 8, 4))).toBe(true);
    expect(jpg(exif, sof(0xc0))).toBe(false);                                     // no JFIF: Go reads on to the scan
    expect(jpg(exif, sof(0xc0), sos)).toBe(true);
    expect(jpg(jfif, [0x12, 0x34, 0xff, 0x00], sof(0xc0))).toBe(true);            // bytes between segments are skipped
    expect(jpg(jfif, [0xff, 0x01], sof(0xc0))).toBe(false);                       // TEM: an unknown marker to Go
    expect(jpg(jfif, sof(0xc0, 8, 3, [1, 0x22, 0, 1, 0x11, 1, 3, 0x11, 1]))).toBe(false);   // a repeated component id
    expect(jpg(jfif, sof(0xc0, 8, 3, [1, 0x22, 0, 2, 0x11, 4, 3, 0x11, 1]))).toBe(false);   // quantization table 4
    expect(jpg(jfif, sof(0xc0, 8, 3, [1, 0x33, 0, 2, 0x11, 1, 3, 0x11, 1]))).toBe(false);   // 3×3 sampling
    expect(jpg(jfif, sof(0xc0, 8, 3, [1, 0x11, 0, 2, 0x22, 1, 3, 0x22, 1]))).toBe(false);   // chroma finer than luma
    expect(jpg(jfif, sof(0xc0), sof(0xc0))).toBe(true);                            // JFIF: done at the first frame
    expect(jpg(exif, sof(0xc0), sof(0xc0), sos)).toBe(false);                      // a second frame before the scan
    expect(jpg(jfif, sof(0xc3))).toBe(false);                                      // lossless: the agent cannot read it
    expect(jpg(jfif, sof(0xc0, 12))).toBe(false);                                  // 12-bit
    expect(ok([0xff, 0xd8, 0xff], 'image/jpeg')).toBe(false);
    expect(jpg(jfif, sos)).toBe(false);                                            // scan before any frame
    // WebP is the agent's sniff exactly: RIFF....WEBPVP.
    expect(A.sniff(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0]))).toBe(null);
    expect(A.prepare('1', 'broken.png', bytes(SIG), url)).toEqual({ ok: false, why: { key: 'ask.attImgBroken', name: 'broken.png' } });
  });

  it('reads the media type from the bytes, never from the name', () => {
    expect(A.sniff(bytes(PNG))).toBe('image/png');
    expect(A.sniff(bytes([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(A.sniff(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif');
    expect(A.sniff(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]))).toBe('image/webp');
    expect(A.sniff(bytes([0x42, 0x4d]))).toBe('image/bmp');
    expect(A.sniff(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(A.sniff(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    // A PNG named .jpg is sent as what it is.
    const p = A.prepare('1', 'shot.jpg', bytes(PNG), url);
    expect(p.ok && p.att.kind === 'image' && p.att.media).toBe('image/png');
  });

  it('a name loses controls, direction marks and its path, and stays bounded', () => {
    expect(A.safeName('C:\\Users\\ada\\shot\u0007.png', 'file')).toBe('shot.png');
    expect(A.safeName('/home/ada/\u202Egnp.exe', 'file')).toBe('gnp.exe');
    expect(A.safeName('', 'file')).toBe('file');
    expect([...A.safeName('x'.repeat(500), 'file')]).toHaveLength(120);
  });

  it('an image over 4 MiB is refused with its size; shrunk bytes are sent with a "resized" record', () => {
    const big = bytes(PNG, A.IMG_BYTES + 1);
    const r = A.prepare('1', 'big.png', big, url);
    expect(r).toEqual({ ok: false, why: { key: 'ask.attImgBig', name: 'big.png', size: A.IMG_BYTES + 1 } });
    const small = bytes(PNG, 1000);
    const s = A.prepare('1', 'big.png', big, url, { bytes: small, from: big.length });
    expect(s.ok).toBe(true);
    if (s.ok && s.att.kind === 'image') {
      expect(s.att.resized).toEqual({ from: big.length, to: 1000 });
      expect(s.att.data).toBe(A.base64(small));
      expect(s.att.bytes).toBe(1000);
    }
    // Shrunk bytes still over the cap: refused with the size it had.
    const still = A.prepare('1', 'big.png', big, url, { bytes: bytes(PNG, A.IMG_BYTES + 5), from: big.length });
    expect(still).toEqual({ ok: false, why: { key: 'ask.attImgBig', name: 'big.png', size: big.length } });
  });

  it('a text file must be UTF-8 text, not empty, at most 24 KiB', () => {
    expect(A.prepare('1', 'a.bin', new Uint8Array([0x61, 0, 0x62]), url)).toEqual({ ok: false, why: { key: 'ask.attNotText', name: 'a.bin' } });
    expect(A.prepare('1', 'a.txt', new Uint8Array([0xc3, 0x28]), url)).toEqual({ ok: false, why: { key: 'ask.attNotText', name: 'a.txt' } });
    expect(A.prepare('1', 'a.txt', text('  \n '), url)).toEqual({ ok: false, why: { key: 'ask.attEmpty', name: 'a.txt' } });
    expect(A.prepare('1', 'a.log', text('x'.repeat(A.TXT_BYTES + 1)), url)).toEqual({ ok: false, why: { key: 'ask.attTextBig', name: 'a.log', size: A.TXT_BYTES + 1 } });
    const ok = A.prepare('1', 'a.log', text('\uFEFFline one\nline two\n'), url);
    expect(ok.ok && ok.att.kind === 'text' && [ok.att.text, ok.att.lines]).toEqual(['line one\nline two\n', 2]);
  });

  it('a text file goes in as a fenced block its own backticks cannot close', () => {
    const f = A.fence({ name: 'my notes.md', text: 'a\n````\nnot the end\n````\nb\n' });
    const lines = f.split('\n');
    expect(lines[0]).toBe('`````markdown title=my_notes.md');
    expect(lines[lines.length - 1]).toBe('`````');
    expect(lines.slice(1, -1).every((l) => !/^`{5,}/.test(l))).toBe(true);
    expect(A.fence({ name: 'x.zzz', text: 'plain' })).toBe('```text title=x.zzz\nplain\n```');
    // A file read from a computer says where it came from on its fence line, as one token the block cannot be closed by.
    expect(A.fence({ name: 'app.log', text: 'ok', from: 'beta:/srv/my app/app.log' })).toBe('```log title=app.log from=beta:/srv/my_app/app.log\nok\n```');
    expect(A.fence({ name: 'a.txt', text: 'ok', from: 'x`y\nz' })).toBe('```text title=a.txt from=x_y_z\nok\n```');
    expect(A.fence({ name: 'a.txt', text: 'ok', from: '' })).toBe('```text title=a.txt\nok\n```');
    expect(A.messageText('Look at this', [txt('a', 'one')])).toBe('Look at this\n\n```log title=a.log\none\n```');
    expect(A.messageText('Only text', [])).toBe('Only text');
  });

  it('the agent\'s limits: 4 images, 3 text files, the message and the body caps, each refusal named', () => {
    const four = [img('a', 10), img('b', 10), img('c', 10), img('d', 10)];
    expect(A.admit(four, [img('e', 10)], '').refused).toEqual([{ key: 'ask.attImgMany', name: 'e.png' }]);
    const three = [txt('a', 'x'), txt('b', 'x'), txt('c', 'x')];
    expect(A.admit(three, [txt('d', 'x')], '').refused).toEqual([{ key: 'ask.attTextMany', name: 'd.log' }]);
    // Three images near 2.5 MiB each fill the 7.5 MiB body: the third is refused, the others stay.
    const r = A.admit([], [img('a', 2_600_000), img('b', 2_600_000), img('c', 2_600_000)], 'hi');
    expect(r.list.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.refused).toEqual([{ key: 'ask.attBodyFull', name: 'c.png' }]);
    // Two 20 KiB text files pass the 28 KiB message cap only one at a time.
    const t = A.admit([], [txt('a', 'x'.repeat(20000)), txt('b', 'y'.repeat(20000))], '');
    expect(t.list.map((x) => x.id)).toEqual(['a']);
    expect(t.refused).toEqual([{ key: 'ask.attTextFull', name: 'b.log' }]);
  });

  it('Send: images never take the follow-up route; text grown past the cap blocks', () => {
    expect(A.sendBlock('hi', [img('a', 10)], 'command')).toBe('ask.attImgLater');
    expect(A.sendBlock('hi', [img('a', 10)], 'turn')).toBeNull();
    expect(A.sendBlock('hi', [txt('a', 'x')], 'command')).toBeNull();
    expect(A.sendBlock('x'.repeat(A.MSG_BYTES), [txt('a', 'x')], 'turn')).toBe('ask.attTooLong');
    expect(A.sendBlock('x'.repeat(A.MSG_BYTES), [], 'turn')).toBeNull();
  });

  it('the wire shape the agent validates, and the body size it counts', () => {
    const i = img('a', 300);
    expect(A.wire([i])).toEqual([{ type: 'image', media_type: 'image/png', data: i.data, name: 'a.png' }]);
    const json = JSON.stringify({ text: 'hi', attachments: A.wire([i]) });
    expect(A.bodyBytes('hi', [i])).toBe(new TextEncoder().encode(json).length);
  });

  it('base64 of large bytes matches the platform', () => {
    const b = new Uint8Array(100_000).map((_, k) => k % 251);
    expect(A.base64(b)).toBe(Buffer.from(b).toString('base64'));
  });

  it('a too-big screenshot is drawn at most 2560 on its long side, smaller per try', () => {
    expect(A.shrinkSize(5120, 2880, 0)).toEqual({ w: 2560, h: 1440 });
    expect(A.shrinkSize(5120, 2880, 1)).toEqual({ w: 1920, h: 1080 });
    expect(A.shrinkSize(800, 600, 0)).toEqual({ w: 800, h: 600 });
  });
});
