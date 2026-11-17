// Width bands (breakpoints.ts): the lengths conditions compare with, and the band of a width among them.
import { expect, test } from 'bun:test';
import { bandKey, bandOf, mergeThresholds, thresholdsOf } from './breakpoints';

const CSS = `
.a { color: red; }
@media (width < 600px) { .a { display: none; } }
@media (min-width: 48rem) and (max-width: 1024px) { .a { gap: 1px; } }
@media (prefers-reduced-motion: reduce) { .a { transition: none; } }
@media (height <= 900px) { .a { top: 0; } }
@container content (width < 640px) { .a { display: block; } }
@container (760px <= width < 1180px) { .a { display: flex; } }
@container guide (inline-size >= 480px) { .a { gap: 0; } }
`;

test('the lengths of width conditions, per kind; height and discrete features are no width edge', () => {
  expect(thresholdsOf(CSS)).toEqual({ media: [600, 768, 1024], container: [480, 640, 760, 1180] });
});

test('merging keeps each length once, ascending', () => {
  expect(mergeThresholds([{ media: [768, 600], container: [640] }, { media: [600], container: [480, 640] }])).toEqual({ media: [600, 768], container: [480, 640] });
});

test('a band is named by its lower edge in px; a width on an edge is a band of its own', () => {
  const t = [600, 768, 1024];
  expect(bandOf(480, t)).toBe('0');
  expect(bandOf(599, t)).toBe('0');
  expect(bandOf(600, t)).toBe('600e');
  expect(bandOf(608, t)).toBe('600');
  expect(bandOf(767, t)).toBe('600');
  expect(bandOf(960, t)).toBe('768');
  expect(bandOf(4000, t)).toBe('1024');
});

test('every width of a band gives every condition the same answer (so one table serves the band)', () => {
  const t = thresholdsOf(CSS);
  const answers = (px: number) => [px < 640, px >= 760 && px < 1180, px >= 480].join();
  const seen = new Map<string, string>();
  for (let cols = 30; cols <= 200; cols++) {
    const px = cols * 8;
    const band = bandOf(px, t.container);
    const a = answers(px);
    if (seen.has(band)) expect(`${band}: ${seen.get(band)}`).toBe(`${band}: ${a}`); else seen.set(band, a);
  }
});

test('a new length renames only the band it splits', () => {
  expect(bandOf(960, [600, 768, 1024])).toBe(bandOf(960, [480, 600, 768, 1024]));
  expect(bandOf(960, [600, 768, 900, 1024])).toBe('900');
});

test('the table key: the terminal among @media lengths, the page pane among @container lengths', () => {
  const t = thresholdsOf(CSS);
  expect(bandKey(960, 768, t)).toBe('m768c760'); // 120 columns, a 96-column pane
  expect(bandKey(640, 640, t)).toBe('m600c640e'); // 80 columns, no sidebar: exactly on 640
  expect(bandKey(960, 608, t)).not.toBe(bandKey(960, 768, t)); // an open dock narrows the pane: another band
});
