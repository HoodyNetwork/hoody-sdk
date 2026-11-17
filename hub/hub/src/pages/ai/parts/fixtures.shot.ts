// Screenshot of a display (the composer's add menu) in the AI tab's fixture world: the chat computer's displays as the runtime
// read lists them, and its display program's capture, answered as PNG bytes. `?shotfx=` picks the case:
//   - absent: two displays run (the dialog asks which one), a third waits for its first use and is never offered;
//   - one: one display runs (captured at once);
//   - none: no display runs;
//   - gone: one display is listed, and its capture answers that it stopped (503 DISPLAY_NOT_AVAILABLE);
//   - big: one display runs and its picture is over the 4 MiB an image may weigh (1400 x 1000, about 5.6 MB), so the
//     browser makes it smaller before it is attached.
// The picture is drawn here (a plain desktop with one window), so a chip and its larger view show something.
import { answers, computerRuntimeRoute, hostEnv, reply } from '@core';
import { shotRoutes } from '@kit';

function shotfx(): string {
  const page = hostEnv().pageAddress;
  return page ? new URLSearchParams(page.search).get('shotfx') ?? '' : '';
}

// The fake computer's window titles (data the computer sends, not Hub text).
const SHOP_WINDOW = 'Storefront: Checkout';
const SHELL_WINDOW = 'Terminal';
const WINDOWS = [{ id: 1, title: SHOP_WINDOW, size: { width: 1280, height: 800 } }, { id: 2, title: SHELL_WINDOW, size: { width: 800, height: 480 } }];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const v of b) c = (crcTable[(c ^ v) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const be = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type: string, data: Uint8Array): Uint8Array {
  const td = new Uint8Array(4 + data.length);
  td.set([...type].map((c) => c.charCodeAt(0)));
  td.set(data, 4);
  return Uint8Array.from([...be(data.length), ...td, ...be(crc(td))]);
}
/** A PNG of a desktop with one window, w x h, written without compression (stored blocks). */
export function desktopPng(w = 480, h = 300): Uint8Array {
  const row = w * 4 + 1;
  const raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inWin = x > w * 0.12 && x < w * 0.82 && y > h * 0.14 && y < h * 0.84;
      const bar = inWin && y < h * 0.14 + 18;
      const line = inWin && !bar && (y - Math.floor(h * 0.14)) % 22 === 12 && x > w * 0.17 && x < w * (0.4 + ((y * 7) % 30) / 100);
      const c = bar ? [52, 58, 70] : line ? [150, 158, 172] : inWin ? [246, 247, 249] : y > h - 20 ? [28, 32, 40] : [34 + Math.floor((y / h) * 20), 92 + Math.floor((x / w) * 40), 128];
      raw.set([c[0] as number, c[1] as number, c[2] as number, 255], y * row + 1 + x * 4);
    }
  }
  const blocks: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length; i += 65535) {
    const part = raw.subarray(i, i + 65535);
    blocks.push(i + 65535 >= raw.length ? 1 : 0, part.length & 255, part.length >>> 8, ~part.length & 255, (~part.length >>> 8) & 255, ...part);
  }
  let a = 1, b = 0;
  for (const v of raw) { a = (a + v) % 65521; b = (b + a) % 65521; }
  blocks.push(...be(((b << 16) | a) >>> 0));
  const head = Uint8Array.from([...be(w), ...be(h), 8, 6, 0, 0, 0]);
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', Uint8Array.from(blocks)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function shotRules() {
  let png: Uint8Array | null = null, big: Uint8Array | null = null;
  return [
    reply(computerRuntimeRoute, () => {
      const fx = shotfx();
      const displays = fx === 'none' ? [{ display: 3, state: 'parked', windows: [] }]
        : fx === 'one' || fx === 'gone' || fx === 'big' ? [{ display: 1, state: 'live', windows: WINDOWS }]
          : [{ display: 1, state: 'live', windows: WINDOWS }, { display: 2, state: 'live', windows: [] }, { display: 3, state: 'parked', windows: [] }];
      return answers.ok({ data: { runtime_info: { displays, terminals: [], network_services: [] } } });
    }),
    reply(shotRoutes.capture, () => (shotfx() === 'gone' ? answers.refused(503, 'DISPLAY_NOT_AVAILABLE')
      : shotfx() === 'big' ? answers.bytes(big ??= desktopPng(1400, 1000), 'image/png', 400) : answers.bytes(png ??= desktopPng(), 'image/png', 400))),
  ];
}
