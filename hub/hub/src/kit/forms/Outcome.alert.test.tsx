// A not_sent line is a status by default; a page that must have it announced at once passes `alert` (ConfirmDialog:
// `outcomeAlert`). The prop only raises: pending and failed stay alerts, whatever it says.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { ConfirmDialog } from '../overlays/Overlays';
import type { OutcomeLike } from '../outcome';
import { Outcome } from './Outcome';

boot();

describe('Outcome alert', () => {
  it('a not_sent line is a status by default', () => {
    render(<Outcome outcome={{ kind: 'not_sent', message: 'Stop it first.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Stop it first.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a not_sent line with `alert` is announced as an alert', () => {
    render(<Outcome outcome={{ kind: 'not_sent', message: 'Stop it first.' }} alert />);
    expect(screen.getByRole('alert')).toHaveTextContent('Stop it first.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('`alert` raises any kind', () => {
    render(<Outcome outcome="stale" alert />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it.each(['pending', 'failed'] as const)('a %s line stays an alert with `alert` false or not passed', (kind) => {
    const { rerender } = render(<Outcome outcome={kind} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<Outcome outcome={kind} alert={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a done line is a status unless raised', () => {
    const { rerender } = render(<Outcome outcome="done" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<Outcome outcome="done" alert />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ConfirmDialog outcomeAlert', () => {
  const NOT_SENT: OutcomeLike = { kind: 'not_sent', message: 'Not stopped: still sending.' };
  const open = (extra: { outcomeAlert?: boolean }) =>
    render(<ConfirmDialog isOpen onOpenChange={() => undefined} title="Stop sharing?" confirmLabel="Stop" onConfirm={() => undefined} outcome={NOT_SENT} {...extra} />);

  it('its not_sent outcome line is a status by default', () => {
    open({});
    const line = screen.getByText('Not stopped: still sending.').closest('[data-outcome]');
    expect(line).toHaveAttribute('role', 'status');
  });

  it('with outcomeAlert it reaches the line and the dialog announces it as an alert', () => {
    open({ outcomeAlert: true });
    const line = screen.getByText('Not stopped: still sending.').closest('[data-outcome]');
    expect(line).toHaveAttribute('role', 'alert');
  });
});
