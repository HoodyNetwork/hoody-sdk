// Vitest: the StatusPill's measuring descriptor (pillMetrics.ts) says what Display.module.css
// draws. A change to the pill's face, size, tracking, case, padding, border or dot that leaves the descriptor behind
// fails here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATUS_PILL, statusPillMetrics } from './pillMetrics';

const css = readFileSync(join(import.meta.dirname, 'Display.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(join(import.meta.dirname, '..', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations every top-level rule whose selector list names `sel` alone sets (`.pill, .tag` counts for .pill;
 *  `.neutral .dot` does not count for .dot), later rules winning, as the cascade reads them. */
function rule(sel: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(?<=^|\})\s*([^{}@]+)\{([^{}]*)\}/g)) {
    const sels = (m[1] ?? '').split(',').map((x) => x.trim());
    if (!sels.includes(sel)) continue;
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
  }
  if (Object.keys(out).length === 0) throw new Error(`no ${sel} rule in Display.module.css`);
  return out;
}
/** A value through any var() chain of tokens.css (its first, :root, definition). */
function resolve(v: string): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(v.trim());
  if (!ref) return v.trim();
  const m = new RegExp(`${ref[1]}:\\s*([^;]+);`).exec(tokens);
  if (!m?.[1]) throw new Error(`no ${ref[1]} in tokens.css`);
  return resolve(m[1]);
}
/** A px (or plain) number. */
function num(v: string): number {
  const n = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(resolve(v));
  if (!n?.[1]) throw new Error(`not a px number: ${v}`);
  return Number(n[1]);
}

describe('StatusPill measuring descriptor', () => {
  const pill = rule('.pill');
  const dot = rule('.dot');

  it('type: face, size, weight, tracking and case are what .pill draws', () => {
    expect(resolve(pill['font-family'] ?? 'inherit').split(',')[0]?.trim()).toBe(STATUS_PILL.family.split(',')[0]);
    expect(num(pill['font-size'] ?? '')).toBe(STATUS_PILL.size);
    expect(num(pill['font-weight'] ?? '')).toBe(STATUS_PILL.weight);
    expect(resolve(pill['letter-spacing'] ?? 'normal')).toBe(`${STATUS_PILL.trackingEm}em`);
    expect(resolve(pill['text-transform'] ?? 'none') === 'uppercase').toBe(STATUS_PILL.caps);
  });

  it('box: padding, border, dot and gap are what .pill and .dot draw, border-box', () => {
    const pad = (pill.padding ?? '').split(/\s+/);
    expect(pad).toHaveLength(2);
    expect(num(pad[1] ?? '')).toBe(STATUS_PILL.padX);
    expect(num((pill.border ?? '').split(/\s+/)[0] ?? '')).toBe(STATUS_PILL.border);
    expect(pill['box-sizing']).toBe('border-box');
    expect(num(dot.width ?? '')).toBe(STATUS_PILL.dot);
    expect(num(pill.gap ?? '')).toBe(STATUS_PILL.gap);
  });

  it('the metrics add the box to the words, the dot only with a dot, in capitals with the tracking', () => {
    expect(statusPillMetrics(false).pad).toBe(2 * 7 + 2 * 1);
    expect(statusPillMetrics(true).pad).toBe(2 * 7 + 2 * 1 + 6 + 6);
    expect(statusPillMetrics().font).toBe('500 10.5px "Geist Mono", ui-monospace, monospace');
    expect(statusPillMetrics().caps).toBe(true);
    expect(statusPillMetrics().tracking).toBeCloseTo(0.42, 5);
  });
});
