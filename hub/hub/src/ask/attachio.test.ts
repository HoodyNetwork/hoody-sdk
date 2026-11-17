// attachio: a pick, paste or drop is read file by file, in order, and never holds more than the draft can
// keep: past the draft's room or past BATCH_MAX a file is refused by name before it is read in full.
import { describe, expect, it } from 'vitest';
import { BATCH_MAX, readFiles } from './attachio';

// A real PNG header (signature + a 1×1 IHDR with its CRC).
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89];

/** A file that counts its full reads (the 16-byte sniff reads a slice, which is a different Blob). */
function counted(name: string, bytes: Uint8Array, reads: string[]): File {
  const f = new File([bytes as BlobPart], name);
  const whole = f.arrayBuffer.bind(f);
  f.arrayBuffer = () => { reads.push(name); return whole(); };
  return f;
}
const png = (n = 200) => { const b = new Uint8Array(n); b.set(PNG); return b; };
const txt = (s: string) => new TextEncoder().encode(s);
const noShrink = async () => null;

describe('attachio.readFiles', () => {
  it('reads at most BATCH_MAX files; the rest are named and never read', async () => {
    const reads: string[] = [];
    const files = Array.from({ length: BATCH_MAX + 2 }, (_, i) => counted(`n${i}.txt`, txt(`note ${i}\n`), reads));
    const out = await readFiles(files, { imgs: 4, texts: 100 }, noShrink);
    expect(out).toHaveLength(BATCH_MAX + 2);
    expect(out.slice(BATCH_MAX)).toEqual([
      { ok: false, why: { key: 'ask.attSkipped', name: `n${BATCH_MAX}.txt` } },
      { ok: false, why: { key: 'ask.attSkipped', name: `n${BATCH_MAX + 1}.txt` } },
    ]);
    expect(reads).toHaveLength(BATCH_MAX);
  });

  it('past the draft\'s room, images and text files are refused by name before their bytes are read', async () => {
    const reads: string[] = [];
    const files = [
      counted('a.png', png(), reads), counted('b.png', png(), reads), counted('c.png', png(), reads),
      counted('one.log', txt('x\n'), reads), counted('two.log', txt('y\n'), reads),
    ];
    const out = await readFiles(files, { imgs: 2, texts: 1 }, noShrink);
    expect(out.map((p) => (p.ok ? p.att.name : p.why.key))).toEqual(['a.png', 'b.png', 'ask.attImgMany', 'one.log', 'ask.attTextMany']);
    expect(reads).toEqual(['a.png', 'b.png', 'one.log']);
  });

  it('a refused file does not use up room: the next one still fits', async () => {
    const reads: string[] = [];
    const broken = new Uint8Array(200); broken.set(PNG.slice(0, 8));
    const out = await readFiles([counted('broken.png', broken, reads), counted('ok.png', png(), reads)], { imgs: 1, texts: 0 }, noShrink);
    expect(out.map((p) => (p.ok ? p.att.name : p.why.key))).toEqual(['ask.attImgBroken', 'ok.png']);
  });
});
