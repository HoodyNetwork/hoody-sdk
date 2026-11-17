// Vitest: a disabled section item (button form) looks off: the kit's disabled opacity, no pointer cursor, and hover
// changes neither fill nor ink (the disabled rule outweighs the hover rule); forced colours draw it in GrayText.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';

const css = readFileSync(join(import.meta.dirname, 'SectionMenu.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.()[\]:]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('SectionMenuItem disabled', () => {
  it('a disabled item is a disabled button', () => {
    render(
      <SectionMenuList>
        <SectionMenuItem disabled>People</SectionMenuItem>
      </SectionMenuList>,
    );
    expect(screen.getByRole('button', { name: 'People' })).toBeDisabled();
  });

  it('draws the off look and keeps the rest look under the pointer', () => {
    const off = body('.item:disabled');
    expect(off).toMatch(/opacity:\s*var\(--ctl-off-opacity\)/);
    expect(off).toMatch(/cursor:\s*default/);
    // Same fill and ink as at rest, at a specificity above `.item:where(:hover, [data-hovered])`.
    expect(off).toMatch(/background:\s*transparent/);
    expect(off).toMatch(/color:\s*var\(--hx-section-text\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{[^@]*\.item:disabled\s*\{[^}]*color:\s*GrayText/);
  });
});
