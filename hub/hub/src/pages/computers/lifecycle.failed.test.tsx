// A refused start, stop or restart: the "didn't change" banner carries the refusal (kit error=), so it says why in
// the kit's words and offers Details with the status and "Copy details for support" (Errors rule E1). The realm's
// list answering 2xx without its containers is a read error with Try again, never an empty list (core's pageAt).
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { queryClient } from '@core';
import { interpolate } from '@kit';
import kitStrings from '@kit/states/strings.en.json';
import { computersTable } from './data';
import { listReads } from './fixtures';
import page from './page';
import strings from './strings.en.json';

describe('computers: a refused lifecycle press shows its details', () => {
  it('Start refused 409 COMPUTER_BUSY: the banner says why and Details shows the status', async () => {
    await renderPage(page, { state: 'failedOps', path: '/computers?sel=cedar.00c3' });
    await userEvent.click((await screen.findAllByRole('button', { name: strings['menu.start'] }, { timeout: 30000 }))[0]!);
    const title = await screen.findByText(interpolate(strings['op.failedTitle'], { name: 'cedar' }), {}, { timeout: 4000 });
    const banner = title.closest('[role="alert"], [role="status"], section, div')!.parentElement!;
    expect(banner).toHaveTextContent(kitStrings['err.conflict']);
    // In a banner, Details is a disclosure under it (kit ErrorDetails), not a dialog.
    await userEvent.click(within(banner).getByRole('button', { name: kitStrings['err.details'] }));
    // COMPUTER_BUSY is no published or declared code, so core's errorInfo (errors.ts codeOf) shows none for it:
    // Details carries Status 409, never the raw server code.
    expect(await within(banner).findByText('409')).toBeInTheDocument();
    expect(banner).not.toHaveTextContent('COMPUTER_BUSY');
    expect(within(banner).getByRole('button', { name: kitStrings['err.copy'] })).toBeInTheDocument();
  });
});

describe('computers: the list read is parsed at the boundary', () => {
  const select = computersTable.reads!.computers!.select!;
  it('a body without data.computers, or not an array, throws; an empty list is a list', () => {
    expect(() => select({ data: {} } as never, undefined as never)).toThrow();
    expect(() => select({ data: { computers: 'x' } } as never, undefined as never)).toThrow();
    expect(() => select({} as never, undefined as never)).toThrow();
    expect(select({ data: { computers: [] } } as never, undefined as never)).toEqual([]);
  });
  it('a 2xx list without containers shows the read-failed state with Try again, not an empty list', async () => {
    await renderPage(page, { state: 'listMalformed' });
    expect(await screen.findByRole('button', { name: kitStrings['state.retry'] }, { timeout: 30000 })).toBeInTheDocument();
    // The table keeps its frame for the error state; it lists no computer and no "no computers yet" state.
    expect(screen.queryByText('cedar')).toBeNull();
    expect(screen.queryByText(strings['empty.title'])).toBeNull();
  });
  it('an empty list, then a refetch without computers: the read error with Try again, not the zero state', async () => {
    listReads.n = 0;
    await renderPage(page, { state: 'listEmptyThenMalformed' });
    expect(await screen.findByText(strings['zero.empty.title'], {}, { timeout: 30000 })).toBeInTheDocument();
    await act(() => queryClient.invalidateQueries());
    expect(await screen.findByRole('button', { name: kitStrings['state.retry'] }, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['zero.empty.title'])).toBeNull();
  });
  it('the same failed refetch with a computer open: no "gone" detail from the kept empty list, and Get a computer stays', async () => {
    listReads.n = 0;
    await renderPage(page, { state: 'listEmptyThenMalformed', path: '/computers?sel=nope' });
    expect(await screen.findByText(strings['zero.empty.title'], {}, { timeout: 30000 })).toBeInTheDocument();
    await act(() => queryClient.invalidateQueries());
    expect(await screen.findByRole('button', { name: kitStrings['state.retry'] }, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['detail.gone'])).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['action.get'] }).length).toBeGreaterThan(0);
  });
});
