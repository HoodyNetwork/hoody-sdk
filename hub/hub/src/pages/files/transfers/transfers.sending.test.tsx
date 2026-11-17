// Vitest: Transfers lists the Files changes on their way (core sendingChanges: any tab). A copy sent
// from another tab is on its way while this tab shows Transfers: it is listed on its computer, and that computer never
// says nothing is moving; one core cannot attribute is said once, on no computer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { resetFiles } from '../fixtures';
import page from '../page';
import { resetLinksForTest } from '../link/data';
import xs from './transfers.strings.en.json';

const sending: { attributed: boolean; identity: unknown }[] = [];
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, sendingChanges: (...a: Parameters<typeof real.sendingChanges>) => [...sending, ...real.sendingChanges(...a)] };
});
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const PATH = '/files?a=atlas.00a1&ap=%2Ftmp&tab=transfers';

// eslint-disable-next-line no-restricted-globals -- each test starts on an empty browser store
beforeEach(() => { resetFiles(); resetLinksForTest(); localStorage.clear(); sending.length = 0; });

describe('Transfers: changes on their way', () => {
  it('a copy from another tab is listed on its computer, which then never says nothing is moving', async () => {
    const atlas = (await import('@core')).fixtureWorld.computers.find((c) => c.name === 'atlas')!;
    sending.push({ attributed: true, identity: { kind: 'copy', computer: atlas.id, name: 'atlas', path: '/home/ada/notes.txt', dest: '/tmp/notes.txt' } });
    await renderPage(page, { path: PATH, state: 'linkRunning' });
    const row = (await screen.findByText('notes.txt → tmp')).closest('[role="row"], tr') as HTMLElement;
    expect(within(row).getByText(xs['what.copy'])).toBeInTheDocument();
    expect(within(row).getByText(xs['state.sending'])).toBeInTheDocument();
    expect(within(row).getByText('atlas')).toBeInTheDocument();
    await new Promise((r) => { setTimeout(r, 600); });
    expect(screen.queryByText(fill(xs.quiet, { computer: 'atlas' }))).toBeNull();
  });

  it('a change core cannot attribute is said once, on no computer', async () => {
    sending.push({ attributed: false, identity: null });
    await renderPage(page, { path: PATH, state: 'linkRunning' });
    expect(await screen.findByText(xs['sending.unknown'])).toBeInTheDocument();
    expect(await screen.findByText(fill(xs.quiet, { computer: 'atlas' }))).toBeInTheDocument();
    // It is on its way, so it counts as moving at a glance.
    await waitFor(() => expect(screen.getByText(xs['glance.moving'], { selector: 'dt' }).nextElementSibling?.textContent).toBe('1'));
  });
});
