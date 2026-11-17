// Vitest: Dialog `outcomeDetail`: rich text shown on the outcome's line in place of
// its `message`; without it the line is as before.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const open = (detail?: React.ReactNode) =>
  render(
    <Dialog isOpen onOpenChange={() => undefined} title="Save settings" primaryLabel="Save" onPrimary={() => undefined} outcome={{ kind: 'failed', message: 'Plain words.' }} {...(detail !== undefined ? { outcomeDetail: detail } : {})}>
      <p>Fields</p>
    </Dialog>,
  );

describe('Dialog outcomeDetail', () => {
  it('shows the rich detail on the outcome line instead of the message', () => {
    open(
      <>
        Rich <b data-testid="rich">words</b>.
      </>,
    );
    const slot = document.querySelector('[data-dialog-outcome]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.contains(screen.getByTestId('rich'))).toBe(true);
    expect(slot.textContent).toContain('Rich words.');
    expect(slot.textContent).not.toContain('Plain words.');
  });

  it('without it the message shows as before', () => {
    open();
    const slot = document.querySelector('[data-dialog-outcome]') as HTMLElement;
    expect(slot.textContent).toContain('Plain words.');
  });
});
