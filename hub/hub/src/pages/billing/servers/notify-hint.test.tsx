// Vitest: notifications as discovery. A server order not yet delivered carries the "purchase"
// hint under its terms (a notice comes when it is ready, or if it runs late); a delivered one has none. The hint's own
// rules are shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from '../page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

describe('notification hints', () => {
  it('a pending server order shows the purchase hint under its terms', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01' });
    expect(await screen.findByText(strings['res.detail.terms'])).toBeInTheDocument();
    expect(hints()).toEqual(['purchase']);
  });

  it('a delivered order shows no hint', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r03' });
    expect(await screen.findByText(strings['res.detail.terms'])).toBeInTheDocument();
    expect(hints()).toEqual([]);
  });
});
