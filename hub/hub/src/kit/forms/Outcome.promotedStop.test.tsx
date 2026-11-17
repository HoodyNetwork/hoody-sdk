// Stop tracking belongs to a pending outcome the page tracks. A failed outcome whose facts say pending is drawn as the
// pending line (C9), but the page never tracked it: the line offers Check again and no Stop tracking.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { errorInfo } from '@core';
import { boot } from '@core/test/env';
import { Outcome } from './Outcome';

boot();

describe('Outcome: Stop tracking only on a tracked pending outcome', () => {
  it('a failed outcome promoted to pending by its facts shows Check again and no Stop tracking', () => {
    const facts = errorInfo({ pending: true, status: 502 });
    render(<Outcome outcome="failed" error={facts} onCheck={() => true} onStop={vi.fn()} />);
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByText('Stop tracking')).toBeNull();
  });

  it('a pending outcome the page tracks keeps Stop tracking', () => {
    render(<Outcome outcome="pending" onCheck={() => true} onStop={vi.fn()} />);
    expect(screen.getByText('Stop tracking')).toBeInTheDocument();
  });
});
