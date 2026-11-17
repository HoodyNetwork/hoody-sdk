// Vitest: a Band laid over the top edge of a frame or canvas tile (`over`): the band itself is placed (no page wrapper),
// full width at the top of its nearest positioned ancestor and above the frame's content. Not with `attach` (a field's
// band sits under its field).
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Band } from './Band';

describe('Band over', () => {
  it('marks the band itself as laid over, and only when asked', () => {
    const { rerender } = render(<Band size="table" over>Frame is slow</Band>);
    expect(screen.getByRole('status')).toHaveAttribute('data-band-over', '');
    rerender(<Band size="table">Frame is slow</Band>);
    expect(screen.getByRole('status')).not.toHaveAttribute('data-band-over');
  });

  it('the over placement: absolute, top edge, full width, above the content', () => {
    const css = readFileSync(join(import.meta.dirname, 'Band.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = /(?:^|\})\s*\.over\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/inset-block-start:\s*0/);
    expect(body).toMatch(/inset-inline:\s*0/);
    expect(body).toMatch(/z-index:\s*var\(--z-raised\)/);
  });

  // What an over band covers is not the page's ground (a program's dark ground, a document in a frame), and the warn
  // and danger fills are see-through: the fill is an image layer over the card colour, after the edge layer of .band.
  it('the over ground: the card painted under the fill, so nothing shows through the words', () => {
    const css = readFileSync(join(import.meta.dirname, 'Band.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const body = /(?:^|\})\s*\.over\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(body).toMatch(/background:\s*var\(--nt-edge\) 0 0 \/ var\(--bw-notice\) 100% no-repeat border-box, linear-gradient\(var\(--nt-fill\), var\(--nt-fill\)\), var\(--hx-card\);/);
  });
});
