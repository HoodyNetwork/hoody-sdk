// Vitest: OutcomeBanner `actions` holds one recovery action (Sign in again, Send the same
// request again) between Check again and the close; a banner that facts turn pending drops it with the page's words.
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { OutcomeBanner } from './States';

beforeEach(() => {
  boot();
});

describe('OutcomeBanner actions', () => {
  it('a failed banner shows its recovery action before the close', () => {
    render(<OutcomeBanner kind="failed" title="Your sign-in ended" actions={<Button size="sm">Sign in again</Button>} onDismiss={() => undefined} />);
    const banner = screen.getByRole('alert');
    const signIn = within(banner).getByRole('button', { name: 'Sign in again' });
    const close = within(banner).getAllByRole('button').at(-1) as HTMLElement;
    expect(close).not.toBe(signIn);
    expect(signIn.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('alone it still gets its action area (no close, no Check again)', () => {
    render(<OutcomeBanner kind="not_sent" actions={<Button size="sm">Send the same request again</Button>} />);
    expect(screen.getByRole('button', { name: 'Send the same request again' }).closest('[data-outcome-actions]')).not.toBeNull();
  });

  it('pending: Check again first, then the action, then Stop tracking', () => {
    render(<OutcomeBanner kind="pending" onCheck={() => undefined} onDismiss={() => undefined} dismissWarned actions={<Button size="sm">Send the same request again</Button>} />);
    const names = within(screen.getByRole('alert'))
      .getAllByRole('button')
      .map((b) => b.textContent?.trim());
    expect(names).toEqual(['Check again', 'Send the same request again', 'Stop tracking']);
  });

  it('a banner promoted to pending by its error facts drops the action written for the other kind', () => {
    // The facts errorSurfaces.test.tsx uses for a 502 that may have gone through.
    render(<OutcomeBanner kind="failed" error={{ pending: true, status: 502 }} onCheck={() => undefined} actions={<Button size="sm">Try again</Button>} />);
    const banner = document.querySelector('[data-outcome]') as HTMLElement;
    expect(banner).toHaveAttribute('data-outcome', 'pending');
    expect(within(banner).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(banner).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
});
