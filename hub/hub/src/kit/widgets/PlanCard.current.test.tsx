// Vitest: the card of the plan the person already has (tone "current") is announced as theirs (aria-current), not only
// drawn differently; no other card claims it.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanCard } from './PlanCard';

const card = (name: string) => screen.getByRole('group', { name });

describe('PlanCard: the current plan', () => {
  it('tone current: aria-current="true"', () => {
    render(<PlanCard name="Plus" tone="current" price={{ amount: '$6', per: '/month' }} />);
    expect(card('Plus')).toHaveAttribute('aria-current', 'true');
  });

  it.each(['default', 'accent', undefined] as const)('tone %s: no aria-current', (tone) => {
    render(<PlanCard name="Pro" {...(tone ? { tone } : {})} price={{ amount: '$12', per: '/month' }} />);
    expect(card('Pro')).not.toHaveAttribute('aria-current');
  });
});
