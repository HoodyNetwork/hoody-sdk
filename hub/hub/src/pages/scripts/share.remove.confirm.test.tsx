// Removing a public link asks first, as every other link and alias removal in the Hub: the trash button opens a
// confirm that names the link, and only its Remove sends. Cancel sends nothing, and a link that leaves the list
// before the press closes its confirm.
import { act, fireEvent, render, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewTab } from './parts/OverviewTab';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ removes: [] as unknown[] }));
const idle = () => ({ mutateAsync: async () => ({ data: null }), isPending: false, pending: false, held: () => [], readBack: async () => false, dismissHeld: () => undefined, holdOf: async () => undefined });
vi.mock('./data', () => ({
  useUsage: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useFailures: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useAliasState: () => idle(),
  useAliasCreate: () => idle(),
  useAliasRemove: () => ({ ...idle(), mutateAsync: async (v: unknown) => { h.removes.push(v); return { outcome: 'done', data: null }; } }),
  useAliasHeldElsewhere: () => null,
  useScriptsTarget: () => null,
  useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
}));

const S = strings as Record<string, string>;
const item = { id: 'atlas.1111~default/1/a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' };
const link = { id: 'al1', url: 'https://x.example/a', target_path: '/a', enabled: true, created_at: '2026-11-10T00:00:00Z' };
const comp = (aliases: unknown[]) => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases, deleted: [] });
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

beforeEach(() => { h.removes = []; });

describe('scripts: removing a public link asks first', () => {
  it('the trash button opens a confirm naming the link; only its Remove sends', async () => {
    render(<OverviewTab item={item as never} comp={comp([link]) as never} onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: S['share.remove'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(ask.textContent).toContain('x.example/a');
    expect(h.removes).toEqual([]);
    fireEvent.click(within(ask).getByRole('button', { name: S['share.remove'] }));
    await flush();
    expect(h.removes).toEqual([{ id: 'al1' }]);
  });

  it('Cancel sends nothing', async () => {
    render(<OverviewTab item={item as never} comp={comp([link]) as never} onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: S['share.remove'] }));
    const ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: /cancel/i }));
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.removes).toEqual([]);
  });

  it('a link that leaves the list closes its confirm', async () => {
    const r = render(<OverviewTab item={item as never} comp={comp([link]) as never} onChanged={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: S['share.remove'] }));
    await screen.findByRole('alertdialog');
    r.rerender(<OverviewTab item={item as never} comp={comp([]) as never} onChanged={() => undefined} />);
    await flush();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.removes).toEqual([]);
  });
});
