// Get a computer marks the press before it sends and
// hands a proved create to firstPick; Check again on a held create closes the drawer only when the read proved it,
// and an unproved check keeps the drawer and its band open (nothing selected).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Runner from './parts/runner';
import page from './page';
import strings from './strings.en.json';

const st = vi.hoisted(() => ({
  held: undefined as Record<string, unknown> | undefined,
  proved: false,
  pending: false,
  sendProved: [] as string[],
  runs: [] as unknown[],
  order: [] as string[],
  marks: [] as unknown[],
  proofs: [] as unknown[],
}));
vi.mock('./firstPick', () => ({
  markPress: (m: unknown) => { st.order.push('mark'); st.marks.push(m); },
  afterProof: (m: unknown) => { st.proofs.push(m); return Promise.resolve('chosen'); },
}));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), sendProved: (h: string) => { st.sendProved.push(h); return Promise.resolve(st.proved); } }));
vi.mock('./parts/runner', async (orig) => {
  const real = await orig<typeof Runner>();
  const useRunner: typeof real.useRunner = (m, held) => {
    const r = real.useRunner(m, held);
    if (held?.lock !== 'computer.create') return r;
    return {
      ...r,
      held: st.held,
      hold: st.held ? 'h1' : undefined,
      busy: false,
      outcome: undefined,
      run: (v: unknown) => { st.order.push('run'); st.runs.push(v); return Promise.resolve(st.pending ? { outcome: 'pending', hold: 'h7' } : { outcome: 'done' }); },
      check: () => Promise.resolve(st.proved),
    } as unknown as ReturnType<typeof real.useRunner>;
  };
  return { ...real, useRunner };
});

async function open() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click((await screen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 8000 }))[0] as HTMLElement);
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
}
const dialog = () => screen.queryByRole('dialog', { name: strings['create.title'] });

describe('Get a computer: the press is marked, a proved create goes to firstPick', () => {
  beforeEach(() => {
    st.held = undefined; st.proved = false; st.pending = false; st.sendProved = []; st.runs = []; st.order = []; st.marks = []; st.proofs = [];
  });

  it('a done create: marked before it is sent, then handed to firstPick with the same project and name; the drawer closes', async () => {
    const d = await open();
    const name = (within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value;
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await waitFor(() => expect(st.proofs).toHaveLength(1));
    expect(st.order).toEqual(['mark', 'run']);
    const sent = st.runs[0] as { project: string; body: { name: string } };
    expect(st.marks[0]).toEqual({ project: sent.project, name });
    expect(st.proofs[0]).toEqual(st.marks[0]);
    await waitFor(() => expect(dialog()).toBeNull());
  }, 40000);

  it('8. Check again answering false keeps the drawer and its band open, and hands nothing to firstPick', async () => {
    st.held = { project: 'p1', name: 'birch' };
    const d = await open();
    await userEvent.click(await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 }));
    await new Promise((r) => setTimeout(r, 100));
    expect(dialog()).not.toBeNull();
    expect(st.proofs).toEqual([]);
  }, 40000);

  it('Check again that proves the create closes the drawer and hands the held create to firstPick', async () => {
    st.held = { project: 'p1', name: 'birch' };
    st.proved = true;
    const d = await open();
    await userEvent.click(await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(st.proofs).toEqual([{ project: 'p1', name: 'birch' }]);
  }, 40000);

  it('a pending create that core\'s own read-back proves goes to firstPick once; one it does not prove, never', async () => {
    st.pending = true;
    st.proved = true;
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await waitFor(() => expect(st.proofs).toHaveLength(1));
    expect(st.sendProved).toEqual(['h7']);
    expect(st.proofs[0]).toEqual(st.marks[0]);
  }, 40000);

  it('a pending create that the read-back does not prove hands nothing to firstPick', async () => {
    st.pending = true;
    const d = await open();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.go'] }));
    await waitFor(() => expect(st.sendProved).toEqual(['h7']));
    await new Promise((r) => setTimeout(r, 100));
    expect(st.proofs).toEqual([]);
  }, 40000);
});
