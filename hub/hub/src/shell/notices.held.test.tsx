// A page's held band (kit HeldBand: "may have gone through" with Check again) is that page's own pending outcome, so
// the shell's "A change in <realm> may have gone through" toast stays away while it shows (no doubled notice after a
// lost answer on computers, files, programs and vms).
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyPending } from '@core/api';
import { capture } from '@core/ctx';
import { HeldBand } from '@kit/states/HeldBand';
import { Toaster } from '@kit/states/Toast';
import { CoreNotices, PENDING_SETTLE_MS } from './notices';

describe('CoreNotices beside a held band', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  for (const readOnly of [false, true]) {
    it(`no shell toast while the page shows its held band${readOnly ? ' (another sender’s hold)' : ''}`, async () => {
      render(
        <>
          <HeldBand text="We can't tell yet whether port 8080 was opened." readOnly={readOnly} onCheck={() => undefined} onDismiss={() => undefined} overlayId="held-test" />
          <CoreNotices />
          <Toaster />
        </>,
      );
      await act(async () => {
        notifyPending(capture());
        vi.advanceTimersByTime(PENDING_SETTLE_MS + 10);
      });
      expect(screen.getByText(/port 8080 was opened/)).toBeInTheDocument();
      expect(screen.queryAllByText(/may have gone through$/)).toHaveLength(0);
    });
  }
});
