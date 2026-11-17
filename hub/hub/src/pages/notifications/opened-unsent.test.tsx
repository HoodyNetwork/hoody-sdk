// Vitest: opening an unread notice marks it read once, on its own. When core refuses that mark before anything is sent
// (a page shown inside another page, a session without the right), the person asked for nothing: the notice draws no
// failure and keeps its Mark read button. A press of that button still says what became of it (the control).
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as dataModule from './data';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import kitStrings from '@kit/strings.en.json';

// Every mark-read is refused unsent, as core refuses a change in a frame (FRAMED_ACTION_REFUSED).
const world = vi.hoisted(() => ({ runs: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useMarkRead: () => {
      const h = real.useMarkRead();
      return {
        ...h,
        run: async () => {
          world.runs += 1;
          return { outcome: 'not_sent' as const, code: 'FRAMED_ACTION_REFUSED' };
        },
      };
    },
  };
});

const ATLAS = '4e0000000000000000000000';
const FAILED = strings.failedNamed.split('“')[0]!;
// The open notice's own Mark read (the rows' icons share the name). The inspector is the layout's Details section, a
// region by its implicit role only (no role attribute), so it is found by role and name, never by a [role] selector.
const inspectorRead = (): HTMLElement | undefined => {
  const detail = screen.queryByRole('region', { name: kitStrings['listDetail.detail'] });
  return (detail && within(detail).queryByRole('button', { name: strings.read })) ?? undefined;
};
const settle = () => new Promise((r) => setTimeout(r, 300));

describe('the mark-read that opening a notice sends on its own', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
    world.runs = 0;
  });

  it('refused before it was sent: nothing is drawn and Mark read stays', async () => {
    await renderPage(page, { path: `/notifications?sel=${ATLAS}` });
    await waitFor(() => expect(world.runs).toBe(1), { timeout: 8000 });
    await settle();
    expect(screen.queryByText(FAILED, { exact: false })).toBeNull();
    await waitFor(() => expect(inspectorRead()).toBeDefined());
    expect(world.runs).toBe(1);
  }, 30000);

  it('a press of Mark read refused the same way says it did not mark it (the control)', async () => {
    await renderPage(page, { path: `/notifications?sel=${ATLAS}` });
    await waitFor(() => expect(world.runs).toBe(1), { timeout: 8000 });
    await waitFor(() => expect(inspectorRead()).toBeDefined());
    await userEvent.click(inspectorRead()!);
    await waitFor(() => expect(world.runs).toBe(2));
    expect(await screen.findByText(FAILED, { exact: false })).toBeInTheDocument();
  }, 30000);
});
