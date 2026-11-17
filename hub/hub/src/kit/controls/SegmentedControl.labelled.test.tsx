// A SegmentedControl under its own label keeps its content width: the label's column must not stretch the track.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';
import s from './SegmentedControl.module.css';

const css = readFileSync(join(import.meta.dirname, 'SegmentedControl.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ITEMS = [{ id: 'a', label: 'This realm' }, { id: 'b', label: 'All realms' }];

describe('SegmentedControl with a shown label', () => {
  it('the labelled wrapper is marked, and an unlabelled control has no wrapper', () => {
    const { unmount } = render(<SegmentedControl label="Memory of" showLabel items={ITEMS} value="a" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Memory of' }).parentElement!.classList.contains(s.labelled!)).toBe(true);
    unmount();
    const { container } = render(<SegmentedControl label="Memory of" items={ITEMS} value="a" onChange={() => {}} />);
    expect(container.querySelector(`.${s.labelled}`)).toBeNull();
  });

  it('the track under a label starts at the line start unless it is full width', () => {
    expect(css).toMatch(/\.labelled > \.track:not\(\.full\)\s*\{\s*align-self:\s*flex-start;\s*\}/);
  });
});
