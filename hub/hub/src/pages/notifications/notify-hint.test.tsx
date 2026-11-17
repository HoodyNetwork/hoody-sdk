// Vitest: notifications as discovery. The inbox carries the "inbox" hint under its list, and the
// Home widget's empty state carries the "bell" hint. The hint's own rules (one per screen, dismissal, alerts already on,
// a hidden Notifications page) are shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind.
import { bootFixtureCore } from '@core';
import { renderPage, screen } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const hints = () => screen.queryAllByTestId('notify-hint').map((e) => e.getAttribute('data-kind'));

beforeEach(() => {
  bootFixtureCore();
  resetFixtureServer();
});

describe('notification hints', () => {
  it('the inbox shows the inbox hint under its list', async () => {
    await renderPage(page);
    await screen.findByRole('table', {}, { timeout: 8000 });
    expect(hints()).toEqual(['inbox']);
  });

  it('the Home widget, all read, shows the bell hint with its empty line', async () => {
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'caught-up' });
    expect(await screen.findByText(strings['widget.empty'])).toBeInTheDocument();
    expect(hints()).toEqual(['bell']);
  });

  it('the Home widget listing unread notices shows no hint', async () => {
    await renderPage({ ...page, load: () => import('./widget') });
    await screen.findByRole('list', { name: strings.title });
    expect(hints()).toEqual([]);
  });
});
