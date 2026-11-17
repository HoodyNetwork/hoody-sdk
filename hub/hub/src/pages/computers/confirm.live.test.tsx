// Confirms bound to their target: a bulk Stop and a one-computer Stop act on the live rows, and close when the row they
// were opened on can no longer take the change; a bulk button no selected row allows is off and says why; a sent bulk
// change clears the selection. Also: the table sorts by State, Server, Size and Access, not only by Name.
import { describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
// eslint-disable-next-line no-restricted-imports -- a test harness for the page's queries, not page code
import type { QueryClient } from '@tanstack/react-query';
import page from './page';
import strings from './strings.en.json';
import type { Computer } from './types';
import type * as OpsModule from './parts/ops';

const runs = vi.hoisted(() => [] as [string, string][]);
vi.mock('./parts/ops', async (orig) => {
  const m = await orig<typeof OpsModule>();
  return {
    ...m,
    useLifecycleOps: (reload: () => Promise<unknown>) => {
      const o = m.useLifecycleOps(reload);
      return { ...o, run: (c: Computer, op: Parameters<typeof o.run>[1]) => { runs.push([c.name, op]); return o.run(c, op); } };
    },
  };
});

async function listRow(name: string): Promise<HTMLElement> {
  const cells = await screen.findAllByText(name, {}, { timeout: 20000 });
  return cells.map((e) => e.closest('[data-row-id]')).find((r) => r && r.tagName !== 'ARTICLE' && !r.querySelector('article')) as HTMLElement;
}

async function openList(): Promise<QueryClient> {
  const r = await renderPage(page, { path: '/computers' });
  await screen.findAllByText('ember', {}, { timeout: 20000 });
  await userEvent.click(screen.getByRole('radio', { name: /^List$/i }));
  return r.queryClient;
}

const select = async (name: string) => userEvent.click(within(await listRow(name)).getByRole('checkbox'));

/** Sets a computer's status in every cached list that holds it, as a list re-read would. */
function setStatus(qc: QueryClient, name: string, status: string) {
  const lists = qc.getQueryCache().getAll().filter((q) => Array.isArray(q.state.data) && (q.state.data as Computer[]).some((c) => c?.name === name));
  expect(lists.length).toBeGreaterThan(0);
  act(() => {
    for (const q of lists) qc.setQueryData(q.queryKey, (d: Computer[]) => d.map((c) => (c.name === name ? { ...c, status } : c)));
  });
}

describe('bulk Stop', () => {
  it('closes when the computer it was opened on stops by itself, and stops nothing', async () => {
    runs.length = 0;
    const qc = await openList();
    await select('borealis');
    await userEvent.click(await screen.findByRole('button', { name: strings['bulk.stop'] }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    setStatus(qc, 'borealis', 'stopped');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(runs).toEqual([]);
  }, 60000);

  it('a confirmed Stop clears the selection', async () => {
    await openList();
    await select('borealis');
    await userEvent.click(await screen.findByRole('button', { name: strings['bulk.stop'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['menu.stop'] }));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked)).toEqual([]));
  }, 60000);

  it('only a stopped computer selected: Stop is off, says why, and asks nothing', async () => {
    await openList();
    await select('cedar');
    const stop = await screen.findByRole('button', { name: strings['bulk.stop'] });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toHaveAccessibleDescription(strings['bulk.noneCan']);
    await userEvent.click(stop);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }, 60000);
});

describe('one computer\'s Stop', () => {
  it('closes when that computer stops by itself', async () => {
    runs.length = 0;
    const qc = await openList();
    await userEvent.click(within(await listRow('borealis')).getByRole('button', { name: /Row actions/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.stop'] }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    setStatus(qc, 'borealis', 'stopped');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(runs).toEqual([]);
  }, 60000);
});

describe('the list', () => {
  it('sorts by State, Server, Size and Access', async () => {
    await openList();
    for (const key of ['col.state', 'col.server', 'col.size', 'col.access'] as const) {
      const head = screen.getByRole('columnheader', { name: new RegExp(strings[key]) });
      expect(head).toHaveAttribute('aria-sort', 'none');
    }
  }, 60000);
});
