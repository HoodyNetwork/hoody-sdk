// Vitest (computer colour): a confirm that names a computer shows its mark before the name. The mark is
// decoration: the dialog's accessible name stays the plain `title` string, and the visible heading holds the mark first.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ConfirmDialog, DangerConfirm, Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const MARK = <span data-testid="mark" aria-hidden="true" />;
const heading = () => document.querySelector('[slot="title"]') as HTMLElement;

describe('Dialog titleMark', () => {
  it('Dialog: the accessible name is the plain title; the visible heading holds the mark before the text', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Stop web-prod-1?" titleMark={MARK} primaryLabel="Stop" onPrimary={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Stop web-prod-1?' })).toBeInTheDocument();
    const h = heading();
    expect(h.firstElementChild?.contains(screen.getByTestId('mark'))).toBe(true);
    expect(h.textContent).toBe('Stop web-prod-1?');
  });

  it('ConfirmDialog passes the mark through; the alertdialog name is still the plain string', () => {
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Restart web-prod-1?" titleMark={MARK} confirmLabel="Restart" onConfirm={() => undefined} />);
    expect(screen.getByRole('alertdialog', { name: 'Restart web-prod-1?' })).toBeInTheDocument();
    expect(heading().contains(screen.getByTestId('mark'))).toBe(true);
  });

  it('DangerConfirm passes the mark through', () => {
    render(<DangerConfirm isOpen onOpenChange={() => undefined} title="Delete web-prod-1?" titleMark={MARK} confirmText="web-prod-1" confirmLabel="Delete" onConfirm={() => undefined} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete web-prod-1?' })).toBeInTheDocument();
    expect(heading().contains(screen.getByTestId('mark'))).toBe(true);
  });

  it('without a mark the heading is the bare title (no wrapper spans)', () => {
    render(<Dialog isOpen onOpenChange={() => undefined} title="Rename" primaryLabel="Rename" onPrimary={() => undefined} />);
    expect(heading().children.length).toBe(0);
    expect(heading().textContent).toBe('Rename');
  });
});
