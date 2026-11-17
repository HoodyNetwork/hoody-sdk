// The copy drawers inside the real AI page. Choosing another computer reloads the Claude
// Code section (its loading return); an unknown copy and its leave notice must survive that, bound to the same copy, so a
// later read that settles it retires it and nothing is left behind.
import { act, renderPage, screen, waitFor, within } from '@app/testing';
import { chooseComputer, fixtureWorld, type FixtureRequest } from '@core';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Fixtures from '@app/fixtures';
import type * as Kit from '@kit';
import { links } from '../../links';
import type * as Ctx from '../../parts/ctx';
import page from '../../page';
import { clearCopies } from './copyStore';
import { transferRules, type CopyComputer } from './transferFixtures';
import strings from './Transfer.strings.en.json';

const toasts = vi.hoisted(() => ({ open: [] as string[], closed: [] as string[] }));
// The shell's computer list (the page renders without the shell here).
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  const { fixtureWorld: W } = await import('@core');
  const computers = ['atlas', 'borealis', 'granite'].map((n) => ({ id: W.computers.find((c) => c.name === n)!.id, name: n, running: true }));
  return { ...real, useShellData: () => ({ ...real.useShellData(), computers }) };
});
// The fixture reads answer before a frame shows the section loading; while `L.loading` is set the page model reports the
// Claude Code read loading, as a computer whose read has not answered yet does, so ClaudeSection takes its loading return.
const L = vi.hoisted(() => ({ loading: false }));
vi.mock('../../parts/ctx', async (orig) => {
  const real = await orig<typeof Ctx>();
  return {
    ...real,
    useAi: () => {
      const c = real.useAi();
      return L.loading ? { ...c, m: { ...c.m, loads: { ...c.m.loads, claude: 'loading' as const } } } : c;
    },
  };
});
vi.mock('@kit/states/Toast', async (orig) => ({
  ...(await orig<object>()),
  showToast: (c: { title: string }) => { toasts.open.push(c.title); return `t${toasts.open.length}`; },
  closeToast: (k: string) => { toasts.closed.push(k); },
}));
const T = vi.hoisted(() => ({ world: {} as Record<string, unknown>, sent: [] as FixtureRequest[] }));
vi.mock('@app/fixtures', async (orig) => {
  const real = await orig<typeof Fixtures>();
  return {
    ...real,
    loadCoreRules: async (ids: readonly string[], st: string | null) => [
      ...transferRules({ apply: 'lost', world: T.world as Record<string, CopyComputer>, onSend: (r) => T.sent.push(r) }),
      ...(await real.loadCoreRules(ids, st)),
    ],
  };
});

type K = keyof typeof strings;
const w = (k: K, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const SLOW = { timeout: 5000 };
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

// The page's own chunk (its load(), import('../../tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('../../tab');
}, 120_000);

beforeEach(() => {
  L.loading = false;
  toasts.open.length = 0;
  toasts.closed.length = 0;
  T.sent = [];
  T.world = {
    [byName('atlas').id]: { login: '{"claudeAiOauth":{}}', files: {} },
    [byName('borealis').id]: { files: {} },
  };
});

afterEach(() => { clearCopies(); });

describe('an unknown copy outlives the Claude Code section reloading for another computer', () => {
  it('lost sign-in copy, another computer (the section reloads), back, a known read of the target: no toast left, the apply sent once', async () => {
    const r = await renderPage(page, { path: links.list, state: 'claude' });
    await act(async () => { chooseComputer(byName('atlas')); });
    const open = await screen.findByRole('button', { name: w('login.open') }, SLOW);
    await userEvent.click(open);
    const dlg = await screen.findByRole('dialog', { name: w('login.title') });
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: w('to') })).getByText('borealis'));
    await userEvent.click(screen.getByRole('button', { name: w('preview') }));
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await userEvent.click(screen.getByRole('button', { name: w('login.copy') }));
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: w('login.title') })).toBeNull());
    // Another computer: the section shows its loading state, then itself again.
    L.loading = true;
    await act(async () => { chooseComputer(byName('granite')); });
    await settle();
    // The loading return: the section's controls are gone while granite's Claude Code state loads.
    expect(screen.queryByRole('button', { name: w('login.open') })).toBeNull();
    L.loading = false;
    await act(async () => { chooseComputer(byName('atlas')); });
    await screen.findByRole('button', { name: w('login.open') }, SLOW);
    await settle();
    expect(screen.getByText(w('pending.body', { to: 'borealis' }))).toBeInTheDocument();
    expect(toasts.open, 'no toast while the page lives').toEqual([]);
    // A read of borealis's sign-in path with a known state settles the copy.
    await userEvent.click(screen.getByRole('button', { name: w('login.open') }));
    const dlg2 = await screen.findByRole('dialog', { name: w('login.title') });
    await userEvent.click(within(dlg2).getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: w('to') })).getByText('borealis'));
    await userEvent.click(screen.getByRole('button', { name: w('preview.again') }));
    await screen.findByText(w('login.present', { to: 'borealis' }), {}, { onTimeout: (e) => new Error(`${e.message.slice(0, 120)} | dialog: ${screen.queryByRole('dialog', { name: w('login.title') })?.textContent ?? 'none'}`) });
    expect(screen.queryByText(w('pending.body', { to: 'borealis' }))).toBeNull();
    r.unmount();
    await settle();
    expect(toasts.open, 'nothing left after the page goes').toEqual([]);
    expect(T.sent.filter((x) => x.path.endsWith('/apply'))).toHaveLength(1);
  });
  it('the section reloads while the drawer holding the unknown copy is open: the page shows the copy while it loads', async () => {
    await renderPage(page, { path: links.list, state: 'claude' });
    await act(async () => { chooseComputer(byName('atlas')); });
    await userEvent.click(await screen.findByRole('button', { name: w('login.open') }, SLOW));
    const dlg = await screen.findByRole('dialog', { name: w('login.title') });
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`${w('to')}$`) }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: w('to') })).getByText('borealis'));
    await userEvent.click(screen.getByRole('button', { name: w('preview') }));
    await screen.findByText(w('login.absent', { to: 'borealis' }));
    await userEvent.click(screen.getByRole('button', { name: w('login.copy') }));
    await screen.findByText(w('pending.body', { to: 'borealis' }));
    // No close: the section takes its loading return with the drawer still open.
    L.loading = true;
    await act(async () => { chooseComputer(byName('granite')); });
    await settle();
    expect(screen.queryByRole('button', { name: w('login.open') })).toBeNull();
    expect(screen.getAllByText(w('pending.body', { to: 'borealis' }))).toHaveLength(1);
    expect(toasts.open).toEqual([]);
  });
});
