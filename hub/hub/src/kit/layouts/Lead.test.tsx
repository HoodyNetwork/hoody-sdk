// Lead is a page's lead line (Home's welcome): head font, semibold, 22 px, 18 px in a content area under
// 600 px. The type lives in the kit, so page CSS sets no display sizes (layout.cssType).
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lead } from './Lead';

const css = readFileSync(join(__dirname, 'Lead.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Lead', () => {
  it('renders a paragraph with its id and the page class', () => {
    render(<Lead id="x-lead" className="page">Hello</Lead>);
    const p = screen.getByText('Hello');
    expect(p.tagName).toBe('P');
    expect(p.id).toBe('x-lead');
    expect(p.className).toMatch(/lead/);
    expect(p.className).toMatch(/page/);
  });

  it('sets the lead type, smaller in a narrow content area', () => {
    const top = css.match(/^\.lead \{([^}]*)\}/m)?.[1] ?? '';
    expect(top).toMatch(/font-family:\s*var\(--font-head\);/);
    expect(top).toMatch(/font-size:\s*var\(--fs-2xl\);/);
    expect(top).toMatch(/font-weight:\s*var\(--fw-semibold\);/);
    expect(top).toMatch(/line-height:\s*var\(--lh-tight\);/);
    expect(css).toMatch(/@container content \(width < 600px\) \{\s*\.lead \{\s*font-size:\s*var\(--fs-xl\);/);
  });
});
