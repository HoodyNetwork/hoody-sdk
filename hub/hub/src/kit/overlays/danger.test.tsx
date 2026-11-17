// DangerConfirm keeps what the person typed while the dialog stays open: a failed,
// refused or pending delete leaves the name in the field, so Retry or Check again needs no retyping. The field
// clears only when the dialog closes (a done outcome closes it).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import type { OutcomeLike } from '../outcome';
import { DangerConfirm } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k' }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

let setOutcome: (o: OutcomeLike | undefined) => void = () => {};
let setOpen: (o: boolean) => void = () => {};
let setBusy: (b: boolean) => void = () => {};

function Harness() {
  const [open, setOpenState] = useState(true);
  const [outcome, setOutcomeState] = useState<OutcomeLike | undefined>(undefined);
  setOutcome = setOutcomeState;
  setOpen = setOpenState;
  const [busy, setBusyState] = useState(false);
  setBusy = setBusyState;
  return (
    <DangerConfirm
      isOpen={open}
      onOpenChange={setOpenState}
      title="Delete atlas"
      confirmLabel="Delete computer"
      confirmText="atlas"
      onConfirm={() => {}}
      outcome={outcome}
      busy={busy}
      onCheck={() => {}}
    />
  );
}

const field = () => screen.getByRole('textbox') as HTMLInputElement;

describe('DangerConfirm keeps the typed name while open', () => {
  it.each<[string, OutcomeLike]>([
    ['failed', { kind: 'failed' }],
    ['refused (not sent)', { kind: 'not_sent' }],
    ['pending', { kind: 'pending' }],
  ])('a %s delete leaves the name typed and the button armed', async (_n, o) => {
    render(<Harness />);
    await tick();
    fireEvent.change(field(), { target: { value: 'atlas' } });
    await act(async () => setBusy(true));
    await tick();
    await act(async () => { setBusy(false); setOutcome(o); });
    await tick();
    expect(field().value).toBe('atlas');
    if (o.kind !== 'pending') expect(screen.getByRole('button', { name: 'Delete computer' })).not.toBeDisabled();
  });

  it('closing clears it: reopened, the field is empty', async () => {
    render(<Harness />);
    await tick();
    fireEvent.change(field(), { target: { value: 'atlas' } });
    await act(async () => setOutcome({ kind: 'failed' }));
    await act(async () => setOpen(false));
    await tick();
    await act(async () => { setOutcome(undefined); setOpen(true); });
    await tick();
    expect(field().value).toBe('');
  });
});
