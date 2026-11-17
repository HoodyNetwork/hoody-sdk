// `shrink`: a Button whose label is data that may be cut (a realm name in a tile head). The button may get narrower than
// its words, down to its parent's width, and the label ends in an ellipsis; the coarse-pointer touch floor stays. The
// widths as drawn are shrink.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, LinkButton } from './Button';

const css = readFileSync(join(import.meta.dirname, 'Button.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel: string) => {
  const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((r) => r[1]!.replace(/\s+/g, ' ').trim() === sel);
  return m ? m[2]!.replace(/\s+/g, ' ').trim() : null;
};

describe('Button shrink', () => {
  it('marks the button (Button and LinkButton); off by default', () => {
    render(
      <>
        <Button shrink>A long realm name</Button>
        <LinkButton href="/demo" shrink>
          A long link
        </LinkButton>
        <Button>Plain</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'A long realm name' })).toHaveAttribute('data-shrink', '');
    expect(screen.getByRole('link', { name: 'A long link' })).toHaveAttribute('data-shrink', '');
    expect(screen.getByRole('button', { name: 'Plain' })).not.toHaveAttribute('data-shrink');
  });

  it('its CSS: no minimum, at most the parent; it outweighs the zero-weight words minimum; marks never shrink', () => {
    expect(body('.shrink')).toBe('min-inline-size: 0; max-inline-size: 100%;');
    // The words minimum is :where (0,0,0): one class outweighs it in any order.
    expect(css).toMatch(/:where\(\.button:not\(\.iconOnly, \.bubble\)\) \{\s*min-inline-size: max-content;/);
    // The label still cuts with an ellipsis; icons and the glyph keep their box.
    expect(body('.label')).toBe('overflow: hidden; text-overflow: ellipsis;');
    expect(body('.shrink > :not(.label)')).toBe('flex: none;');
    // The coarse touch floor is on the label, and no shrink rule lowers it.
    const shrinkRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((r) => /\.shrink\b/.test(r[1]!));
    for (const r of shrinkRules) expect(r[2], r[1]!.trim()).not.toMatch(/min-block-size|block-size/);
    expect(shrinkRules.map((r) => r[1]!.trim()).filter((s) => s.replace(/:not\([^)]*\)/g, '').includes('.label'))).toEqual([]);
  });
});
