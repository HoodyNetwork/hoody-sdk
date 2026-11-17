// Dialog focus and the refused-Escape hint where focus sits on the dialog itself:
// while every control is disabled the rescue parks focus on the dialog, so
// when sending ends focus moves on to the outcome; an Escape pressed there still announces why it is refused;
// the hint goes once the reason is gone, a forced dialog too.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import strings from './strings.en.json';
import { Dialog } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

type Phase = 'idle' | 'sending' | 'failed' | 'idle-after';
const ctl: { set?: (p: Phase) => void } = {};

function Sender({ dismissable = true }: { dismissable?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  ctl.set = setPhase;
  const outcome: OutcomeLike | undefined = phase === 'failed' ? { kind: 'failed', message: 'The name is taken.' } : undefined;
  return (
    <Dialog
      isOpen
      isDismissable={dismissable}
      onOpenChange={() => undefined}
      title="New note"
      primaryLabel="Create"
      onPrimary={() => setPhase('sending')}
      busy={phase === 'sending'}
      {...(outcome ? { outcome } : {})}
    >
      <input aria-label="Title" disabled={phase === 'sending'} defaultValue="plan" />
    </Dialog>
  );
}

const escapeOn = (el: Element) =>
  act(async () => {
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.keyUp(el, { key: 'Escape' });
  });

describe('Dialog: focus parked on the dialog while sending moves on when it ends', () => {
  it('a failed send hands focus from the dialog container to the outcome', async () => {
    render(<Sender />);
    await frames();
    await act(async () => ctl.set?.('sending'));
    await frames();
    const dialog = screen.getByRole('dialog');
    act(() => dialog.focus());
    expect(document.activeElement).toBe(dialog);
    await act(async () => ctl.set?.('failed'));
    await frames();
    expect(document.activeElement).not.toBe(dialog);
    expect(document.activeElement?.textContent).toContain('The name is taken.');
  });
});

describe('Dialog: the refused-Escape hint wherever focus is inside it', () => {
  it('Escape on the dialog container itself while sending announces why', async () => {
    render(<Sender />);
    await frames();
    await act(async () => ctl.set?.('sending'));
    await frames();
    const dialog = screen.getByRole('dialog');
    act(() => dialog.focus());
    await escapeOn(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(strings.busyHint)).toHaveAttribute('role', 'status');
  });

  it("a forced dialog's hint goes once the send is over", async () => {
    render(<Sender dismissable={false} />);
    await frames();
    await act(async () => ctl.set?.('sending'));
    await frames();
    await escapeOn(screen.getByRole('dialog'));
    expect(screen.getByText(strings.busyHint)).toBeInTheDocument();
    await act(async () => ctl.set?.('idle-after'));
    await frames();
    expect(screen.queryByText(strings.busyHint)).toBeNull();
    // A later send nobody pressed Escape on shows no hint left over from the first.
    await act(async () => ctl.set?.('sending'));
    await frames();
    expect(screen.queryByText(strings.busyHint)).toBeNull();
  });
});

describe('Dialog: the header x while sending (OP-G)', () => {
  it('the header x is disabled while the dialog sends, and usable again once the send is over', async () => {
    render(<Sender />);
    const closeX = () => screen.getByRole('button', { name: 'Close' });
    expect(closeX()).toBeEnabled();
    await act(async () => { ctl.set?.('sending'); });
    expect(closeX()).toBeDisabled();
    await act(async () => { ctl.set?.('failed'); });
    expect(closeX()).toBeEnabled();
  });
});
