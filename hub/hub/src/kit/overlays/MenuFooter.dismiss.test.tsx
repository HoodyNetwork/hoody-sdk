// A footer action that backs out (Cancel) carries no forward glyph, like every other back-out action in the Hub; the
// primary and a plain secondary keep theirs.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MenuFooter } from './MenuFooter';

describe('MenuFooter dismiss', () => {
  it('a dismiss secondary has no glyph; the primary keeps it', () => {
    render(<MenuFooter label="Picker actions" actions={[{ id: 'use', label: 'Use', onPress: () => undefined }, { id: 'cancel', label: 'Cancel', dismiss: true, onPress: () => undefined }]} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute('data-glyph');
    expect(screen.getByRole('button', { name: 'Use' })).toHaveAttribute('data-glyph');
  });
  it('a plain secondary keeps its glyph', () => {
    render(<MenuFooter label="Picker actions" actions={[{ id: 'use', label: 'Use', onPress: () => undefined }, { id: 'more', label: 'More', onPress: () => undefined }]} />);
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('data-glyph');
  });
});
