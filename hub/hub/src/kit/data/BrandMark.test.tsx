// BrandMark: the Hoody Hub logo as one kit treatment (the sidebar, the lock screen, an auth card): the brand's
// horizontal art in one decorative SVG filled with currentColor, and the name as one line of visually hidden text, so a
// reader gets "Hoody Hub".
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '@kit';
import { BRAND_MARK_PATH, BRAND_WIDTH } from './BrandMark';

const brandIn = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-brand-mark]');
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync(join(import.meta.dirname, 'BrandMark.module.css'), 'utf8'));
const tokens = strip(readFileSync(join(import.meta.dirname, '..', 'tokens.css'), 'utf8'));
const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('BrandMark', () => {
  it('draws the whole logo as one hidden SVG and names it "Hoody Hub" in text', () => {
    const { container } = render(<BrandMark />);
    const b = brandIn(container);
    expect(b?.getAttribute('data-brand-mark')).toBe('sm');
    expect(b?.textContent).toBe('Hoody Hub');
    const svgs = b!.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0]).toHaveAttribute('viewBox', `0 0 ${BRAND_WIDTH.hub} 64`);
    // The square with the h cut out, then H o o d y and H u b.
    const paths = svgs[0]!.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('d', BRAND_MARK_PATH);
    expect(paths).toHaveLength(9);
    for (const p of paths) expect(p).toHaveAttribute('fill-rule', 'evenodd');
    // No colour in the drawing: the CSS fills it with the text colour.
    expect(container.querySelector('[fill]')).toBeNull();
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('hub off: the mark and "Hoody", the drawing cut after the y', () => {
    const { container } = render(<BrandMark hub={false} />);
    const b = brandIn(container);
    expect(b?.textContent).toBe('Hoody');
    expect(b!.querySelector('svg')).toHaveAttribute('viewBox', `0 0 ${BRAND_WIDTH.hoody} 64`);
    expect(b!.querySelectorAll('path')).toHaveLength(6);
  });

  it('words off: the mark alone, no text', () => {
    const { container } = render(<BrandMark words={false} />);
    const b = brandIn(container);
    expect(b?.textContent).toBe('');
    expect(b?.querySelectorAll('svg')).toHaveLength(1);
    expect(b!.querySelector('svg')).toHaveAttribute('viewBox', '0 0 64 64');
    expect(b!.querySelectorAll('path')).toHaveLength(1);
  });

  it('lg says so on the element, and a caller class is kept', () => {
    const { container } = render(<BrandMark size="lg" className="mine" />);
    const b = brandIn(container);
    expect(b?.getAttribute('data-brand-mark')).toBe('lg');
    expect(b).toHaveClass('mine');
  });

  it('the heights come from tokens (24 px sm, 32 px lg), the width from the drawing, the fill from the text colour', () => {
    expect(/(?:^|\n)\s*--brand-h:\s*24px;/.test(tokens)).toBe(true);
    expect(/(?:^|\n)\s*--icon-xl:\s*32px;/.test(tokens)).toBe(true);
    expect(rule('.art')).toMatch(/inline-size:\s*auto;[\s\S]*block-size:\s*var\(--brand-h\);[\s\S]*fill:\s*currentcolor;/);
    expect(rule('.lg .art')).toMatch(/block-size:\s*var\(--icon-xl\);/);
  });
});
