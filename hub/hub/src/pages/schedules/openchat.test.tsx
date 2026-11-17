// Vitest: "Open chat" on a loop lands on a place the Bots page reads (its computer filter), never a
// parameter it ignores.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import page from './page';
import strings from './strings.en.json';

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const loopRow = model(raw).rows.find((r) => r.ref.sid === 'sess_01');

describe('schedules: Open chat', () => {
  it('opens the Bots page filtered to this computer, with no loop parameter', async () => {
    expect(loopRow).toBeDefined();
    const { router } = await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(loopRow!.key)}` });
    await screen.findByText(strings['detail.history']);
    const [more] = await screen.findAllByRole('button', { name: /^More\b/ });
    await userEvent.click(more!);
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.chat'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/bots'));
    const search = router.state.location.search as Record<string, unknown>;
    expect(search).not.toHaveProperty('loop');
    expect(typeof search.computer).toBe('string');
    expect(String(search.computer)).not.toBe('');
  });
});
