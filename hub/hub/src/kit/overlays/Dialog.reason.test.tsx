// Vitest: Dialog `primaryDisabledReason` and ConfirmDialog `confirmDisabledReason`. A disabled primary that says why is
// the kit Button's soft-disabled state: focusable, aria-disabled, the reason its description, no press. With no reason,
// or while an outcome is pending, the primary is natively disabled as before; once enabled it presses.
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ConfirmDialog, Dialog } from './Dialog';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const REASON = 'Name the branch first.';
const primary = () => document.querySelector('[data-dialog-primary]') as HTMLButtonElement;
const noop = () => undefined;

describe('a disabled dialog primary that says why', () => {
  it('Dialog: focusable, aria-disabled, described by the reason, and it never presses', () => {
    const onPrimary = vi.fn();
    render(<Dialog isOpen onOpenChange={noop} title="New branch" primaryLabel="Create" primaryDisabled primaryDisabledReason={REASON} onPrimary={onPrimary} />);
    const b = primary();
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(REASON);
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    fireEvent.keyDown(b, { key: 'Enter' });
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('ConfirmDialog: confirmDisabledReason does the same for the confirm button', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog isOpen onOpenChange={noop} title="Restart atlas?" confirmLabel="Restart" confirmDisabled confirmDisabledReason={REASON} onConfirm={onConfirm} />);
    const b = primary();
    expect(b).not.toBeDisabled();
    expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(b).toHaveAccessibleDescription(REASON);
    fireEvent.click(b);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('no reason: the primary is natively disabled, as before', () => {
    render(<Dialog isOpen onOpenChange={noop} title="New branch" primaryLabel="Create" primaryDisabled onPrimary={noop} />);
    expect(primary()).toBeDisabled();
  });

  it('a pending outcome locks the primary natively; the reason is not given', () => {
    render(<Dialog isOpen onOpenChange={noop} title="New branch" primaryLabel="Create" primaryDisabled primaryDisabledReason={REASON} outcome={{ kind: 'pending' }} onPrimary={noop} />);
    expect(primary()).toBeDisabled();
    expect(primary()).not.toHaveAccessibleDescription(REASON);
  });

  it('a reason with an enabled primary changes nothing: it presses', () => {
    const onPrimary = vi.fn();
    const { rerender } = render(<Dialog isOpen onOpenChange={noop} title="New branch" primaryLabel="Create" primaryDisabled primaryDisabledReason={REASON} onPrimary={onPrimary} />);
    rerender(<Dialog isOpen onOpenChange={noop} title="New branch" primaryLabel="Create" primaryDisabledReason={REASON} onPrimary={onPrimary} />);
    const b = primary();
    expect(b).not.toHaveAttribute('aria-disabled');
    expect(b).not.toBeDisabled();
    fireEvent.click(b);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});
