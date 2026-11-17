import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatStrip } from './Display';

// Read as text (a CSS module import gives class names, not the rules).
const css = readFileSync(path.join(import.meta.dirname, 'Display.module.css'), 'utf8');
// The StatStrip's own narrow query: the one holding its two-to-a-row rule (another 600 px query comes earlier).
const Q = '@container (width < 600px)';
const ssAt = css.lastIndexOf(Q, css.indexOf('.ssItem:nth-child(n + 3)'));
const narrowBlock = css.slice(ssAt, css.indexOf('\n}\n', ssAt) + 3);
const rule = (sel: string) => {
  const at = narrowBlock.indexOf(`${sel} {`);
  return at < 0 ? '' : narrowBlock.slice(at, narrowBlock.indexOf('}', at));
};

const items = [
  { label: 'Clicks', value: '14' },
  { label: 'Sign-ups', value: 'Fewer than 3', detail: 'this month' },
  { label: 'Customers', value: '0' },
];

describe('StatStrip narrow (Referrals counts)', () => {
  it('wraps two to a row by default, and says so on the strip', () => {
    render(<StatStrip label="Counts" items={items} />);
    expect(screen.getByLabelText('Counts')).toHaveAttribute('data-narrow', 'pairs');
  });

  it('narrow="rows" marks the strip and keeps every stat, label and caption', () => {
    render(<StatStrip label="Counts" items={items} narrow="rows" />);
    const dl = screen.getByLabelText('Counts');
    expect(dl).toHaveAttribute('data-narrow', 'rows');
    expect(dl.querySelectorAll('dt')).toHaveLength(3);
    expect(dl.querySelectorAll('dd')).toHaveLength(3);
    expect(screen.getByText('this month')).toBeInTheDocument();
  });

  it('no divider of the strip is dashed', () => {
    const strip = css.slice(css.indexOf('.ss'), css.indexOf('.ss[data-narrow=rows] .ssItem + .ssItem') + 200);
    expect(strip).not.toMatch(/dashed/);
    expect(css).toMatch(/\.ssItem \+ \.ssItem\s*\{\s*border-inline-start:\s*var\(--bw\) solid var\(--hx-line\)/);
  });

  it('below 600 px a rows strip is one column, each stat a label-start / number-end row with a solid rule between', () => {
    expect(rule(".ss[data-narrow=rows]")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    const item = rule(".ss[data-narrow=rows] .ssItem");
    expect(item).toMatch(/display:\s*grid/);
    // The number's track can shrink below its content (a long value is cut by .ssNumber, never past the strip).
    expect(item).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*max-content\)/);
    expect(item).toMatch(/border-inline-start:\s*0/);
    expect(rule(".ss[data-narrow=rows] .ssItem + .ssItem")).toMatch(/border-top:\s*var\(--bw\) solid var\(--hx-line\)/);
    expect(rule(".ss[data-narrow=rows] .ssValue")).toMatch(/text-align:\s*end/);
  });

  it('the rows rules live only under the narrow query: a wide strip stays one row of cells', () => {
    expect(ssAt).toBeGreaterThan(0);
    expect(css.slice(0, ssAt) + css.slice(ssAt + narrowBlock.length)).not.toMatch(/data-narrow=['"]?rows/);
  });
});
