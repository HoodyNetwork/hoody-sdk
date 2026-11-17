// Vitest: with Bots hidden in this load, a loop offers no "Open chat" in its inspector or its row menu:
// there is no classic Bots page to fall back to, so the entry would do nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as kitModule from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import defaultFixtures from './fixtures';
import { model, type RawSchedules } from './logic';
import { rowEntries } from './parts/RowActions';
import page from './page';
import strings from './strings.en.json';

const hidden = new Set<string>();
vi.mock('@kit', async (importOriginal) => {
  const orig = await importOriginal<typeof kitModule>();
  return {
    ...orig,
    usePageVisible: (id: string) => !hidden.has(id),
    usePageLink: (id: string) => (hidden.has(id) ? null : orig.usePageLink(id)),
  };
});
afterEach(() => hidden.clear());

const raw = (defaultFixtures.states.many.schedules as { data: RawSchedules }).data;
const loopRow = model(raw).rows.find((r) => r.ref.sid === 'sess_01');

describe('schedules: Open chat with Bots hidden', () => {
  it('the inspector menu has no Open chat', async () => {
    hidden.add('bots');
    expect(loopRow?.can.open).toBe(true);
    await renderPage(page, { path: `/schedules?sel=${encodeURIComponent(loopRow!.key)}` });
    await screen.findByText(strings['detail.history']);
    const [more] = await screen.findAllByRole('button', { name: /^More\b/ });
    await userEvent.click(more!);
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: strings['action.chat'] })).toBeNull();
  });

  // The table's own row menu, mounted: the page passes onChat only while Bots has a link.
  const openRowMenu = async () => {
    const table = await screen.findByRole('table', { name: strings['title'] }, { timeout: 8000 });
    const row = await within(table).findByRole('row', { name: /Watch the build/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByRole('button', { name: /actions|more/i }));
    return within(await screen.findByRole('menu')).getAllByRole('menuitem');
  };

  it('the table row menu has no Open chat with Bots hidden', async () => {
    hidden.add('bots');
    await renderPage(page, { path: '/schedules' });
    const items = await openRowMenu();
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.textContent)).not.toContain(strings['action.chat']);
  });

  it('served: the table row menu offers Open chat and it opens the Bots page', async () => {
    const { router } = await renderPage(page, { path: '/schedules' });
    const chat = (await openRowMenu()).find((i) => i.textContent === strings['action.chat']);
    expect(chat).toBeDefined();
    await userEvent.click(chat!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/bots'));
  });

  it('the row actions leave Open chat out without a handler, and keep it with one (the builder)', () => {
    const t = ((k: string) => k) as Parameters<typeof rowEntries>[0];
    const base = { onRun: () => {}, onPause: () => {}, onEdit: () => {}, onDelete: () => {} };
    const ids = (h: Parameters<typeof rowEntries>[3]) => rowEntries(t, loopRow!, false, h).map((e) => (e === '-' ? '-' : e.id));
    expect(ids(base)).not.toContain('chat');
    expect(ids({ ...base, onChat: () => {} })).toContain('chat');
  });
});
