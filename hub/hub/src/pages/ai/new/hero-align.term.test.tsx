// New chat's hero: the heading and the composer box start on one column, as on the web, where NewChat sits the kit
// composer flush in its column. The terminal kept the composer's own dock inset (Composer.term padX), so the box began
// one cell right of "What should we do?" (at 240x67). NewChat now passes the composer's `flush`.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const colOf = (frame: string, re: RegExp): number => {
  const line = frame.split('\n').find((l) => re.test(l));
  expect(line ?? `(no line matching ${re})`).toMatch(re);
  return line!.search(re);
};

// 240x67: the rail and the hero side by side (narrower, the rail takes the screen and the hero is a page of its own).
for (const [cols, rows] of [[240, 67]] as const) {
  test(`${cols}x${rows}: the heading, the composer box and its action row start on one column`, async () => {
    s = await renderPage({ page: 'ai', cols, rows });
    const frame = await s.settle();
    const head = colOf(frame, /What should we do\?/);
    expect(colOf(frame, /┌─+/)).toBe(head);
    expect(colOf(frame, /\[\+ Attach/)).toBe(head);
    expect(s.failures).toEqual([]);
    expect(s.trapsAt).toEqual([]);
  }, 240_000);
}
