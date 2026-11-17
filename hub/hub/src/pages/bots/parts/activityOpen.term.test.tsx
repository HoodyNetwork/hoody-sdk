// Opening a Bot whose waiting card ends the log: the card is in view from the first frame that draws it, so the
// collapsed "Waiting for you" strip (drawn only while the card is off screen) must never be drawn on the way. The card
// was once measured before the terminal had laid it out (no height yet) and read as off screen: the strip flashed for
// some frames on every open, and a loaded run could settle on such a frame (activityResize's "before").
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

const NEWEST = 'Understood. I will change the limit and ask before any restart.';
const STRIP = '◆ Waiting for you';
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

interface Drawn { loop(...a: unknown[]): Promise<void>; currentRenderBuffer: { getRealCharBytes(real: boolean): Uint8Array } }

for (const n of [1, 2, 3]) {
  test(`open ${n}: no frame on the way draws the strip under a card in view`, async () => {
    s = await renderPage({ page: 'bots', cols: 120, rows: 40 });
    await s.settle();
    // Every frame the renderer draws from here on, not only the settled one.
    const r = s.renderer as unknown as Drawn;
    const loop = r.loop.bind(r);
    const text = new TextDecoder();
    let frames = 0;
    let withStrip = 0;
    r.loop = async (...a) => {
      await loop(...a);
      frames++;
      if (text.decode(r.currentRenderBuffer.getRealCharBytes(true)).includes(STRIP)) withStrip++;
    };
    await s.keys.press('enter');
    const after = await s.settle();
    expect(frames).toBeGreaterThan(3);
    expect(after).toContain(NEWEST);
    expect(after).toContain('Needs you');
    expect(after).not.toContain(STRIP);
    expect(withStrip).toBe(0);
    expect(s.failures).toEqual([]);
  }, 120_000);
}
