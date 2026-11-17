// Vitest: the notes list's states around its rows. A partial list that still lists notes shows them without the stale
// band; Refresh keeps an open note's frame on screen; while the list is empty the header's New note stands back for the
// empty state's own; an off New note says why; the Computer filter on a computer with no notes says so.
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

const idOf = (name: string): string => (fixtureWorld.computers.find((c) => c.name === name) as { id: string }).id;
const table = () => screen.findByRole('table', { name: strings.table }, { timeout: 8000 });
const STALE = kitStrings['table.staleData'];

describe('the notes list states', () => {
  it('a partial list that lists notes shows them with no stale-answer band', async () => {
    await renderPage(page, { state: 'long' });
    await within(await table()).findAllByRole('row', { name: /Weekly plan|Deploy|Reading/ }, { timeout: 8000 });
    expect(screen.queryByText(STALE)).toBeNull();
  });

  it('Refresh keeps the open note and its frame on screen while the list is read again', async () => {
    await renderPage(page, { latency: 'slow' });
    await userEvent.click(await within(await table()).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 }));
    const frame = await screen.findByTitle('Note: Weekly plan', undefined, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: kitStrings['action.refresh'] }));
    expect(screen.queryByTitle('Note: Weekly plan')).toBe(frame);
    expect(screen.queryByText('Reading the notes…')).toBeNull();
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByTitle('Note: Weekly plan')).toBe(frame);
  });

  it('with no note listed, New note is the accent only once: the header one stands back', async () => {
    await renderPage(page, { state: 'emptyRunning' });
    await screen.findByText(strings['empty.noneTitle'], undefined, { timeout: 8000 });
    const news = screen.getAllByRole('button', { name: strings['action.new'] });
    expect(news.length).toBeGreaterThan(1);
    expect(news.filter((b) => b.getAttribute('data-variant') === 'primary')).toHaveLength(1);
  });

  it('with notes listed, the header New note is the accent', async () => {
    await renderPage(page, {});
    await within(await table()).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    const news = screen.getAllByRole('button', { name: strings['action.new'] });
    expect(news.some((b) => b.getAttribute('data-variant') === 'primary')).toBe(true);
  });

  it('an off header New note says why: the computer it would go to gives no place for a note', async () => {
    await renderPage(page, { state: 'noPlace' });
    await within(await table()).findByRole('row', { name: /Weekly plan/ }, { timeout: 8000 });
    const off = screen.getAllByRole('button', { name: strings['action.new'] }).filter((b) => b.getAttribute('aria-disabled') === 'true');
    expect(off.length).toBeGreaterThan(0);
    for (const b of off) expect(b).toHaveAccessibleDescription(strings['new.offHere'].replace('{{computer}}', 'atlas'));
  });

  it('an off header New note says why: the filtered computer is not running', async () => {
    await renderPage(page, { path: `/notes?computer=${idOf('cedar')}` });
    const said = strings['empty.c.off_one'].replace('{{names}}', 'cedar');
    await waitFor(() => {
      const off = screen.getAllByRole('button', { name: strings['action.new'] }).filter((b) => b.getAttribute('aria-disabled') === 'true');
      expect(off.length).toBeGreaterThan(0);
      for (const b of off) expect(b).toHaveAccessibleDescription(said);
    }, { timeout: 8000 });
  });

  it('the Computer filter on a computer the person has no access to says who can give it', async () => {
    await renderPage(page, { state: 'refusals', path: `/notes?computer=${idOf('atlas')}` });
    expect(await screen.findByText('Ask the owner for access to notes on atlas.', undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it('the Computer filter on a computer with no notes says that computer has none', async () => {
    await renderPage(page, { path: `/notes?computer=${idOf('harbor')}` });
    expect(await screen.findByText('harbor has no notes yet.', undefined, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Nothing matches these filters')).toBeNull());
  });
});
