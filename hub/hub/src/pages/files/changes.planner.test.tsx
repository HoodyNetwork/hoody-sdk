// Vitest: the delete planner's own rules, with its reads and sends stubbed (C9). One confirmed
// plan sends once: after a partial run nothing is sent again from the same dialog; the sent plan stays frozen when a
// later read changes or fails; a delete still held on an item shows that outcome instead of a plan; and a dialog
// whose changes were turned off while open keeps Delete off. The Shared folders switch is on, so the planner reads
// what the computer shares first: here that list answers at once, whole and empty (changes.planner.shares.test.tsx
// holds its rules). Two cases at the end run the planner's kept branch for the switch off.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import { DeletePlanner } from './DeletePlanner';
import type { DeleteItem } from './plan';
import type * as Flag from './shares/flag';
import strings from './strings.en.json';

type Reads = { real: Map<string, string> | null; failed: boolean; mounts: unknown; retry: () => void };
const h = vi.hoisted(() => ({
  held: [] as unknown[], asked: [] as string[], outcomes: [] as { outcome: string; code?: string }[], read: 0,
  reads: null as unknown, can: true, hang: false, sharesOff: false,
}));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: () => h.held,
    usePlanReads: () => h.reads,
    useRealPaths: (_c: unknown, _paths: readonly string[], enabled: boolean) => (enabled ? { real: new Map<string, string>() } : undefined),
    useCanChange: () => h.can,
    useFilesChange: () => ({
      readBack: () => { h.read += 1; return Promise.resolve(false); },
      run: (v: Data.ChangeVars) => {
        h.asked.push(v.path);
        if (h.hang) return new Promise(() => undefined);
        const r = h.outcomes.shift() ?? { outcome: 'done' };
        // As the real send does: a delete whose answer was lost stays held on its item.
        if (r.outcome === 'pending') h.held = [...h.held, { hold: `d${h.held.length + 1}`, at: 1, identity: { kind: 'delete', computer: 'c-atlas', name: 'atlas', path: v.path, dir: false, size: 10, modified: 1000 } }];
        return Promise.resolve(r);
      },
    }),
  };
});

// This computer shares nothing: a whole list, read since the dialog opened.
vi.mock('./shares/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShares: () => ({ data: { rows: [], dropped: 0, of: 'given:c-atlas' }, isError: false, error: null, isFetchedAfterMount: true, refetch: () => Promise.resolve(undefined) }),
}));
// The switch as it is, except where a case turns it off to run the planner's off branch.
vi.mock('./shares/flag', async (importOriginal) => {
  const m = await importOriginal<typeof Flag>();
  return { ...m, sharesUiOn: () => (h.sharesOff ? false : m.sharesUiOn()) };
});

const ATLAS = { id: 'c-atlas', name: 'atlas', project_id: 'p', server_name: 's', status: 'running', rules: 'open' } as Data.FilesComputer;
const file = (name: string): DeleteItem => ({ path: `/home/ada/${name}`, name, dir: false, size: 10, modified: 1000 });
const ready = (paths: string[]): Reads => ({ real: new Map(paths.map((p) => [p, p])), failed: false, mounts: { complete: true, items: [] }, retry: () => undefined });
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));

beforeEach(() => { h.held = []; h.asked = []; h.outcomes = []; h.read = 0; h.can = true; h.hang = false; h.reads = null; h.sharesOff = false; });

describe('delete planner', () => {
  it('a partial run never sends again: Delete stays off, and it says the batch stopped', async () => {
    const items = [file('a.txt'), file('b.txt')];
    h.reads = ready(items.map((i) => i.path));
    h.outcomes = [{ outcome: 'done' }, { outcome: 'failed', code: 'FILE_PATH_BUSY' }];
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    await userEvent.type(within(d).getByRole('textbox'), '2 items');
    const go = within(d).getByRole('button', { name: strings['action.delete'] });
    await userEvent.click(go);
    expect(await within(d).findByText(fill(strings['delete.partial'], { done: 1, count: 2 }))).toBeInTheDocument();
    expect(go).toBeDisabled();
    await userEvent.click(go);
    await userEvent.keyboard('{Enter}');
    expect(h.asked).toEqual(['/home/ada/a.txt', '/home/ada/b.txt']);
  });

  it('a delete whose answer was lost is never called not sent: A done, B may have gone through, C never sent', async () => {
    const items = [file('a.txt'), file('b.txt'), file('c.txt')];
    h.reads = ready(items.map((i) => i.path));
    h.outcomes = [{ outcome: 'done' }, { outcome: 'pending' }];
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    await userEvent.type(within(d).getByRole('textbox'), '3 items');
    const go = within(d).getByRole('button', { name: strings['action.delete'] });
    await userEvent.click(go);
    expect(await within(d).findByText(fill(strings['delete.partial'], { done: 1, count: 3 }))).toBeInTheDocument();
    // Only C, never sent, is counted as not sent; B keeps its outcome.
    expect(within(d).getByText(fill(strings['delete.unsent_one'], { count: 1 }))).toBeInTheDocument();
    expect(within(d).queryByText(/rest were not sent/i)).toBeNull();
    expect(within(d).getAllByText(/may have gone through/i).length).toBeGreaterThan(0);
    expect(go).toBeDisabled();
    await userEvent.click(go);
    await userEvent.keyboard('{Enter}');
    expect(h.asked).toEqual(['/home/ada/a.txt', '/home/ada/b.txt']);
  });

  it('two presses in one moment send once', async () => {
    const items = [file('a.txt')];
    h.reads = ready([items[0]!.path]);
    h.hang = true;
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const go = within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['action.delete'] });
    act(() => { go.click(); go.click(); });
    await waitFor(() => expect(h.asked).toHaveLength(1));
    expect(h.asked).toEqual(['/home/ada/a.txt']);
  });

  it('the sent plan stays as confirmed while a later read fails or changes', async () => {
    const items = [file('a.txt')];
    h.reads = ready([items[0]!.path]);
    h.hang = true;
    const { rerender } = render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['action.delete'] }));
    h.reads = { real: null, failed: true, mounts: null, retry: () => undefined };
    rerender(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    expect(within(d).queryByText(strings['delete.checkFailed'])).toBeNull();
    expect(within(d).getByText(fill(strings['delete.onComputer'], { name: 'atlas' }))).toBeInTheDocument();
    h.reads = { ...ready([items[0]!.path]), mounts: { complete: true, items: [{ path: '/home', label: 'Photos' }] } };
    rerender(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    expect(within(screen.getByRole('alertdialog')).getByText(fill(strings['delete.onComputer'], { name: 'atlas' }))).toBeInTheDocument();
    expect(h.asked).toEqual(['/home/ada/a.txt']);
  });

  it('opened on an item whose delete may have gone through: that outcome and Check again, never a plan', async () => {
    const items = [file('a.txt')];
    h.reads = ready([items[0]!.path]);
    h.held = [{ hold: 'd1', at: 1, identity: { kind: 'delete', computer: 'c-atlas', name: 'atlas', path: '/home/ada/a.txt', dir: false, size: 10, modified: 1000 } }];
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['delete.heldBody'])).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(h.read).toBe(1));
    expect(h.asked).toEqual([]);
  });

  // The planner's branch for the Shared folders switch off, which the terminal still takes (its switch is off; these
  // two cases turn the web switch off for the planner only): the Hub shows no sharing control there, but folders other
  // computers share with this one can still be mounted under /hoody/shares, so those rules stay and the refusal names
  // no control the person cannot see.
  it('sharing switch off: /hoody/shares is still never deleted, and the refusal points at no hidden control', () => {
    h.sharesOff = true;
    const items: DeleteItem[] = [{ path: '/hoody/shares', name: 'shares', dir: true, size: null, modified: 1000 }];
    h.reads = ready(['/hoody/shares']);
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['delete.shareRootNoUi'])).toBeInTheDocument();
    expect(d.textContent).not.toContain('Storage');
    expect(within(d).queryByRole('button', { name: strings['action.delete'] })).toBeNull();
  });

  it('sharing switch off: a file inside a received share still says so and asks for its name', () => {
    h.sharesOff = true;
    const items: DeleteItem[] = [{ path: '/hoody/shares/docs-1a/a.txt', name: 'a.txt', dir: false, size: 10, modified: 1000 }];
    h.reads = ready([items[0]!.path]);
    render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['delete.received'])).toBeInTheDocument();
    expect(within(d).getByRole('textbox')).toBeInTheDocument();
  });

  it('changes turned off while the dialog is open: Delete goes off and says why', async () => {
    const items = [file('a.txt')];
    h.reads = ready([items[0]!.path]);
    const { rerender } = render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['action.delete'] })).toBeEnabled();
    h.can = false;
    rerender(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByRole('button', { name: strings['action.delete'] })).toBeDisabled();
    expect(within(d).getByText(strings['changes.off'])).toBeInTheDocument();
  });
});
