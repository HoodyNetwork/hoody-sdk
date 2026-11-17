// Select size="toolbar": a filter Select in a table toolbar follows the toolbar control height (--tb-ctl-h) like
// SearchField size="toolbar", so the filters match the search field in a compact toolbar too. md (default) is
// every other field's height.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Select } from './more';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'more.module.css'), 'utf8');
const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
];

describe('Select sizes', () => {
  it('toolbar sets the toolbar class on the field root, md sets none', () => {
    const { rerender } = render(<Select label="Status" options={OPTIONS} value="all" onChange={() => undefined} size="toolbar" />);
    expect(screen.getByRole('button', { name: /Status/ }).closest('[class*="select_toolbar"]')).not.toBeNull();
    rerender(<Select label="Status" options={OPTIONS} value="all" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: /Status/ }).closest('[class*="select_toolbar"]')).toBeNull();
  });

  it('the toolbar trigger takes the toolbar control height', () => {
    const rule = /\.select_toolbar \.selectBtn \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/min-height: var\(--tb-ctl-h\)/);
  });
});
