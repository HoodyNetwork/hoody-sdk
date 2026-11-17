// A Dialog's primary carries the button's end glyph, its Cancel never does, and a primary that is itself a Cancel
// (Files upload while running) takes primaryChip={false}.
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const primary = () => document.querySelector('[data-dialog-primary]') as HTMLElement;
const cancel = () => document.querySelector('[data-dialog-cancel]') as HTMLElement;

describe('Dialog footer glyphs', () => {
  it('the primary carries the glyph; Cancel does not', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Rename" primaryLabel="Rename" onPrimary={() => undefined} />);
    expect(primary()).toHaveAttribute('data-glyph');
    expect(cancel()).not.toHaveAttribute('data-glyph');
  });

  it('a primary that is a Cancel says primaryChip={false} and has no glyph', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Upload" cancelLabel="Close" primaryLabel="Cancel" primaryVariant="secondary" primaryChip={false} onPrimary={() => undefined} />);
    expect(primary()).not.toHaveAttribute('data-glyph');
    expect(primary().textContent).toBe('Cancel');
  });

  it('a danger primary never has a glyph (danger keeps its own look)', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Delete" tone="danger" primaryLabel="Delete" onPrimary={() => undefined} />);
    expect(primary()).not.toHaveAttribute('data-glyph');
  });
});
