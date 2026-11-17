// A bar-only strip with a body the caller draws: the body starts as far below the strip as an item's own panel does
// (16 px), and a caller's panelClassName still decides when it sets its own padding.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';
import s from './Tabs.module.css';

const css = readFileSync(join(import.meta.dirname, 'Tabs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Tabs with a body under a bar-only strip', () => {
  it('the body panel carries the kit padding class, beside the caller class', () => {
    render(
      <Tabs label="Views" value="a" onChange={() => {}} panelClassName="mine" items={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}>
        <p>Body</p>
      </Tabs>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel.classList.contains(s.bodyPanel!)).toBe(true);
    expect(panel.classList.contains('mine')).toBe(true);
    expect(panel.classList.contains(s.panel!)).toBe(false);
  });

  it('the padding is the item panel\'s 16 px, at zero weight', () => {
    expect(css).toMatch(/:where\(\.bodyPanel\)\s*\{\s*padding-block-start:\s*var\(--sp-4\);\s*\}/);
    expect(/(?:^|\})\s*\.panel\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/padding-block-start:\s*var\(--sp-4\)/);
  });
});
