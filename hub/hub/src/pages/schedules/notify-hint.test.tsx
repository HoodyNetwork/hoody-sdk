// Vitest: notifications as discovery. A schedule's run history carries the "schedule" hint (a
// browser alert can tell when a schedule fails); the list alone, with nothing selected, has none. The hint's own rules
// are shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

describe('notification hints', () => {
  it('a schedule with runs shows the schedule hint under its history', async () => {
    await renderPage(page, { path: '/schedules?sel=cron%3Auser%2Fa1' });
    expect(await screen.findByRole('table', { name: strings['detail.history'] })).toBeInTheDocument();
    expect(hints()).toEqual(['schedule']);
  });

  it('the list with nothing selected shows no hint', async () => {
    await renderPage(page);
    expect(await screen.findAllByRole('table')).not.toHaveLength(0);
    expect(hints()).toEqual([]);
  });
});
