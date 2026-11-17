// Vitest: the Desktop tab's truthful states. With no load event in 20 s it says the desktop is taking long and
// offers the new tab (it never shows the bare frame as working); a load event before that keeps the note away.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, within } from '@app/testing';
import { DESKTOP_SLOW_MS } from './desktop';
import { computers } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import { desktopUrl } from './urls';

const atlas = computers.find((c) => c.name === 'atlas');
if (!atlas) throw new Error('fixture computer atlas');

afterEach(() => {
  vi.useRealTimers();
});

describe('computers: Desktop tab, slow', () => {
  it('says the desktop is taking long after 20 s with no load, with Open in a new tab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    const f = await screen.findByTitle('atlas, desktop 1', undefined, { timeout: 8000 });
    expect(screen.queryByText(strings['desktop.slow'])).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(DESKTOP_SLOW_MS + 10);
    });
    const note = (await screen.findByText(strings['desktop.slow'])).closest('[role="status"], [role="alert"], div');
    if (!note) throw new Error('no note');
    expect(f.closest('[data-desktop]')).toHaveAttribute('data-desktop', 'loading');
    const opens = screen.getAllByRole('link', { name: strings['desktop.open'] });
    expect(opens.length).toBe(2);
    for (const o of opens) expect(o).toHaveAttribute('href', desktopUrl(atlas, 1));
    expect(within(screen.getByRole('tabpanel')).getByText(strings['desktop.slow.body'])).toBeInTheDocument();
    // Taking long, never failed: the Hub cannot read the frame, so it claims nothing about the desktop.
    expect(screen.getByRole('tabpanel').textContent ?? '').not.toMatch(/fail|error|cannot reach|can't reach/i);
  }, 30000);

  it('a frame that loads first never shows the note', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=desktop' });
    const f = await screen.findByTitle('atlas, desktop 1', undefined, { timeout: 8000 });
    fireEvent.load(f);
    await act(async () => {
      vi.advanceTimersByTime(DESKTOP_SLOW_MS + 10);
    });
    expect(screen.queryByText(strings['desktop.slow'])).toBeNull();
    expect(f.closest('[data-desktop]')).toHaveAttribute('data-desktop', 'loaded');
  }, 30000);
});
