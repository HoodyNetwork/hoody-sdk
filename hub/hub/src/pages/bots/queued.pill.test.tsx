// Vitest: a queued Bot's status reads the same in the list's status column and the Bot pane's header pill: a queue of 3+
// digits shows the short form ("4321 waiting") as its whole text: no hidden copy, no native title.
import { renderPage, screen } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';

beforeAll(async () => {
  await import('./view');
}, 30000);

const NOTES = 'c-atlas~c0ffee00c0ffee00c0ffee01~notes';

describe('the Bot pane\'s queued pill', () => {
  it('shows the short form for a 4-digit queue as its only words', async () => {
    await renderPage(page, { state: 'manyQueued', path: `/bots?sel=${encodeURIComponent(NOTES)}` });
    await screen.findByRole('heading', { name: /Notes/ });
    const short = await screen.findAllByText('4321 waiting');
    expect(short.length).toBeGreaterThanOrEqual(2);
    for (const el of short) expect(el.closest('[title]')).toBeNull();
    expect(screen.queryByText('4321 messages waiting')).toBeNull();
  });
});
