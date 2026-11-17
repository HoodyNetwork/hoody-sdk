// Vitest: the Link tab says a link made under a minute ago may still be spreading (DNS), from the
// link's created time as the server gave it, and the note goes away by itself after that minute.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { linkOf } from './data';
import page from './page';

beforeAll(async () => {
  await import('./view');
});
afterEach(() => vi.useRealTimers());

// The Addresses notice's words (strings link.freshNote, the kit note's sentence, shown in the notices).
const NOTE = /may still be spreading/;
const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const FRESH_AT = '2026-10-25T08:00:00.000Z';
const linkTab = (state?: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });

describe('Link tab: a new link may still be propagating', () => {
  it('reads created_at from the server answer', () => {
    expect(linkOf({ id: 'u1', created_at: FRESH_AT }).createdAt).toBe(FRESH_AT);
    expect(linkOf({ id: 'u1' }).createdAt).toBe('');
  });

  it('a link made seconds ago shows the note (its going away by itself is pinned in kit Propagating.test)', async () => {
    // Only the clock is moved: the page's own timers stay real.
    vi.useFakeTimers({ now: Date.parse(FRESH_AT) + 5_000, toFake: ['Date'] });
    await linkTab('linkFresh');
    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it('the same link a minute later shows no note', async () => {
    vi.useFakeTimers({ now: Date.parse(FRESH_AT) + 61_000, toFake: ['Date'] });
    await linkTab('linkFresh');
    await screen.findAllByText(/shop-bot/);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('an older link shows no note', async () => {
    await linkTab();
    await screen.findAllByText(/shop-bot/);
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
