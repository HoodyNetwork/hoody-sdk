// Vitest: a shortfall is a warn row of the Ledger (its mark and tone, its words), and the
// attached strip under the list holds one sentence and one button; the list names the strip as its description.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../controls/Button';
import { Ledger } from './Ledger';
import s from './Ledger.module.css';

const rows = [
  { id: 'plan', label: 'Pro plan', amount: '$12.00' },
  { id: 'short', label: 'Short by', amount: '$6.80', tone: 'warn' as const },
];

describe('Ledger warn row and strip', () => {
  it('a warn row is marked and tinted; its term and amount read as before', () => {
    render(<Ledger label="Payment" rows={rows} />);
    const dl = screen.getByLabelText('Payment');
    const row = within(dl).getByText('Short by').closest('[data-ledger-tone]') as HTMLElement;
    expect(row).toHaveAttribute('data-ledger-tone', 'warn');
    expect(row).toHaveClass(s.warn as string);
    expect(row.querySelector('svg')).not.toBeNull();
    expect(within(dl).getAllByRole('term').map((x) => x.textContent)).toEqual(['Pro plan', 'Short by']);
    expect(within(dl).getAllByRole('definition').map((x) => x.textContent)).toEqual(['$12.00', '$6.80']);
    expect(within(dl).getByText('Pro plan').closest('[data-ledger-tone]')).toBeNull();
  });

  it('the strip sits under the list with its sentence and its one button, and describes the list', () => {
    const { container } = render(<Ledger label="Payment" rows={rows} attach={{ text: 'Add $6.80 or more to buy this plan.', action: <Button size="sm">Add funds</Button> }} />);
    const dl = screen.getByLabelText('Payment');
    const strip = container.querySelector('[data-ledger-strip]') as HTMLElement;
    expect(dl).toHaveAccessibleDescription(/^Add \$6\.80 or more to buy this plan\.\s*Add funds$/);
    expect(within(strip).getByRole('button', { name: 'Add funds' })).toBeInTheDocument();
    expect(dl.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dl.contains(strip)).toBe(false);
  });

  // Baseline guard: a Ledger without a strip is unchanged.
  it('without a strip the ledger is the bare list it was', () => {
    const { container } = render(<Ledger label="Payment" rows={rows} />);
    expect(container.firstElementChild?.tagName).toBe('DL');
    expect(screen.getByLabelText('Payment')).not.toHaveAttribute('aria-describedby');
  });
});
