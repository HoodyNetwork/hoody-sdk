// One Check at a time per held press: a second Check while the
// first reads reads nothing more, so a stale answer can never settle or discard a newer press. The row menu offers no
// Check (the row draws its own), so the second Check comes from the other Check controls (the
// row's own and the inspector's): pressing every one of them while the first reads sends no second read.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as data from './data';
import { opsStore } from './parts/ops';
import page from './page';

const gate = vi.hoisted(() => ({ open: () => undefined as void, calls: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return {
    ...real,
    useReceipt: () => async () => {
      gate.calls += 1;
      await new Promise<void>((r) => { gate.open = r; });
      return 'completed' as const;
    },
  };
});

function webOp() {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith('|prog:1')) return op;
  return undefined;
}

describe('programs: Check runs once at a time', () => {
  beforeEach(() => { opsStore.reset(); gate.calls = 0; });

  it('a second Check while the first reads sends no second read, from any Check control; the row menu has none', async () => {
    await renderPage(page, { state: 'receipt-done', path: '/programs?sel=prog%3A1' });
    await userEvent.click((await screen.findAllByRole('button', { name: 'Restart web' }))[0] as HTMLElement);
    await waitFor(() => expect(webOp()?.status).toBe('unknown'));
    await userEvent.click((await screen.findAllByRole('button', { name: /Check again/ }))[0] as HTMLElement);
    await waitFor(() => expect(gate.calls).toBe(1));
    // Every Check control, the row's and the inspector's, whatever it says now (Check again, or Checking… while busy).
    const checks = screen.getAllByRole('button', { name: /Check again|Checking/ });
    expect(checks.length).toBeGreaterThanOrEqual(2);
    for (const b of checks) await userEvent.click(b);
    const row = screen.getAllByText('web').map((el) => el.closest('tr')).find((tr): tr is HTMLTableRowElement => !!tr);
    if (!row) throw new Error('no row');
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Check/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(gate.calls).toBe(1);
    gate.open();
    await waitFor(() => expect(webOp()).toBeUndefined());
  });
});
