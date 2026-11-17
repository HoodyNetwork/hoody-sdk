// The toast's own frame: the frame's cells keep the
// ground under them and only the inside is card colour, so the frame is one line, not a line on a band of card colour
// (a second edge). The stack's key hint ("F6", "Esc / F6 leave") sits ON the top edge, right-aligned, whole and opaque.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Toaster, showToast } from './Toast';
import { toastQueue } from './Toast.store';

afterEach(() => { (toastQueue() as unknown as { clear(): void }).clear(); });

type Span = { text: string; width: number; bg: { toInts(): number[] } };
const bgAt = (lines: Array<{ spans: Span[] }>, x: number, y: number): string => {
  let at = 0;
  for (const sp of lines[y]!.spans) { if (x < at + sp.width) return sp.bg.toInts().join(','); at += sp.width; }
  return 'none';
};

for (const [w, h] of [[80, 24], [60, 20]] as const) {
  test(`${w}x${h}: frame cells keep the ground, the body is card; the F6 hint sits whole on the top edge`, async () => {
    const t = await drawTest(<FocusRoot><OverlayHost><Text>page</Text><Toaster /></OverlayHost></FocusRoot>, { width: w, height: h });
    showToast({ title: 'nightly-backup is deleted.', body: 'Its history is kept.', tone: 'error' });
    const frame = await t.settle();
    const rows = frame.split('\n');
    const top = rows.findIndex((r) => /┌/.test(r) && r.includes('F6'));
    expect(top, frame).toBeGreaterThanOrEqual(0);
    const left = rows[top]!.indexOf('┌');
    const right = rows[top]!.indexOf('┐');
    // The hint: whole, between the corners, right-aligned with one rule cell before the corner (as the native title).
    expect(rows[top]!.slice(left, right + 1), frame).toMatch(/^┌─+ F6 ─┐$/);
    const lines = t.captureSpans().lines as unknown as Array<{ spans: Span[] }>;
    const body = rows.findIndex((r, i) => i > top && r.includes('nightly-backup'));
    expect(body, frame).toBeGreaterThan(top);
    const ground = bgAt(lines, left - 1, body);
    // Frame cells (left and right edge, top rule) have the ground's colour, not the body's card colour.
    expect(bgAt(lines, left, body), 'left frame cell').toBe(ground);
    expect(bgAt(lines, right, body), 'right frame cell').toBe(ground);
    expect(bgAt(lines, left + 1, top), 'top rule cell').toBe(ground);
    const card = bgAt(lines, left + 1, body);
    expect(card, 'body is card, not the ground').not.toBe(ground);
    // The hint is an opaque strip of card colour: the ground never shows between its words.
    const f6 = rows[top]!.indexOf(' F6 ');
    for (let x = f6; x < f6 + 4; x++) expect(bgAt(lines, x, top), `hint cell ${x}`).toBe(card);
    t.renderer.destroy();
  });
}
