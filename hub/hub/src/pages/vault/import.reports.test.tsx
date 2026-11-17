// Vitest: every cut-short import
// keeps its own report until the page shows it. Two runs can overlap (one settles after the person came back while
// another was started and closed), so a late report of an older run must add its own band, never replace a newer one
// not yet seen; with no page mounted, the waiting reports are kept one by one and all shown on return, in the order the runs settled (not the order they started).
import { act, render, renderPage, screen, userEvent } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness: the page mounted again on the same router (leaving the page)
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness: the page mounted again on the same router (leaving the page)
import { RouterProvider } from '@tanstack/react-router';
import { bump, capture } from '@core/ctx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keepLeftImportReport, leftImportReportHeldForTests, takeLeftImportReports } from './data';
import { resetFixtureVaults } from './fixtures';
import page from './page';
import strings from './strings.en.json';

// FIRST is the report that comes first; its text sorts after SECOND's, so an order check passes only in the order the
// reports came, never sorted.
const FIRST = 'The import into Personal stopped before the end: 2 not sent.';
const SECOND = 'The import into Personal stopped before the end: 1 not sent.';
const bands = () => screen.queryAllByText(/^The import into Personal stopped before the end: \d not sent\.$/).map((b) => b.textContent);

beforeEach(() => {
  resetFixtureVaults();
  vi.stubGlobal('isSecureContext', true);
  bump('switch');
});

async function mountVault() {
  const r = await renderPage(page, { state: 'import', path: '/vault' });
  await screen.findByText(strings['stats.entries'], {}, { timeout: 10_000 });
  return r;
}

describe('Import reports: one per run', () => {
  it('the holder keeps each waiting report and hands them all over in the order they came', () => {
    keepLeftImportReport(FIRST, capture());
    keepLeftImportReport(SECOND, capture());
    const taken: string[] = [];
    const stop = takeLeftImportReports((t) => taken.push(t));
    stop();
    expect(taken).toEqual([FIRST, SECOND]);
    expect(leftImportReportHeldForTests()).toBe(false);
  });

  it('a context bump drops the reports kept before it; one kept after it still comes (the take-time check: page.import.test.tsx, sign-out latch)', () => {
    const dead = capture();
    keepLeftImportReport(FIRST, dead);
    bump('switch');
    keepLeftImportReport(SECOND, capture());
    const taken: string[] = [];
    takeLeftImportReports((t) => taken.push(t))();
    expect(taken).toEqual([SECOND]);
  });

  it('a mixed batch: take drops only the report whose context ended and hands every live one over, in order', () => {
    // One waiting report's context ends while the others stay live, with no bump to clear the list (each report is
    // judged at take on its own). Its own copy of the context is moved to an earlier generation after
    // it was kept (the holder keeps the context it was given), placed between two live ones.
    const ended: { gen: number } & ReturnType<typeof capture> = { ...capture() };
    const THIRD = 'The import into Personal stopped before the end: 3 not sent.';
    keepLeftImportReport(FIRST, capture());
    keepLeftImportReport(THIRD, ended);
    keepLeftImportReport(SECOND, capture());
    ended.gen -= 1;
    const taken: string[] = [];
    takeLeftImportReports((t) => taken.push(t))();
    expect(taken).toEqual([FIRST, SECOND]);
    expect(leftImportReportHeldForTests()).toBe(false);
  });

  it('on the mounted page, a report that comes later (an older run settling late) adds its own band below, and the first stays', async () => {
    await mountVault();
    act(() => keepLeftImportReport(FIRST, capture()));
    expect(await screen.findByText(FIRST)).toBeInTheDocument();
    act(() => keepLeftImportReport(SECOND, capture()));
    expect(await screen.findByText(SECOND)).toBeInTheDocument();
    expect(bands()).toEqual([FIRST, SECOND]);
  }, 30_000);

  it('reports kept while the page was away all show on return, in the order they came', async () => {
    // Away: the page unmounts in the same session (no new boot, which would end the context and clear them).
    const left = await mountVault();
    left.unmount();
    keepLeftImportReport(FIRST, capture());
    keepLeftImportReport(SECOND, capture());
    expect(leftImportReportHeldForTests()).toBe(true);
    await act(async () => {
      render(
        <QueryClientProvider client={left.queryClient}>
          <RouterProvider router={left.router} />
        </QueryClientProvider>,
      );
    });
    expect(await screen.findByText(SECOND)).toBeInTheDocument();
    expect(bands()).toEqual([FIRST, SECOND]);
    expect(leftImportReportHeldForTests()).toBe(false);
  }, 30_000);

  it('a new import starts with no old report', async () => {
    await mountVault();
    act(() => keepLeftImportReport(SECOND, capture()));
    expect(await screen.findByText(SECOND)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['action.more'] }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.import'] }));
    await screen.findByRole('dialog', { name: 'Import into Personal' });
    expect(bands()).toEqual([]);
  }, 30_000);
});
