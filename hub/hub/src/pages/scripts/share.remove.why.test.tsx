// Vitest: a public link's remove confirm that is open when the links go off (the ownership read starts again, or a
// change to the links is held elsewhere) stays open with Remove off and says why. Before, Remove closed the confirm
// and sent nothing without a word. Once the links are back, the same confirm removes.
import { act, fireEvent, render, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewTab } from './parts/OverviewTab';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ removes: [] as unknown[], elsewhere: null as { from: null } | null }));
const idle = () => ({ mutateAsync: async () => ({ data: null }), isPending: false, pending: false, held: () => [], readBack: async () => false, dismissHeld: () => undefined, holdOf: async () => undefined });
vi.mock('./data', () => ({
  useUsage: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useFailures: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useAliasState: () => idle(),
  useAliasCreate: () => idle(),
  useAliasRemove: () => ({ ...idle(), mutateAsync: async (v: unknown) => { h.removes.push(v); return { outcome: 'done', data: null }; } }),
  useAliasHeldElsewhere: () => h.elsewhere,
  useScriptsTarget: () => null,
  useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
}));

const S = strings as Record<string, string>;
const item = (extra: object = {}) => ({ id: 'atlas.1111~default/1/a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...extra }) as never;
const link = { id: 'al1', url: 'https://x.example/a', target_path: '/a', enabled: true, created_at: '2026-11-10T00:00:00Z' };
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [link], deleted: [] } as never;
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const tab = (extra: object = {}) => <OverviewTab item={item(extra)} comp={comp} onChanged={() => undefined} />;
const confirm = (ask: HTMLElement) => within(ask).getByRole('button', { name: S['share.remove'] });

beforeEach(() => { h.removes = []; h.elsewhere = null; });

describe('scripts: a link remove confirm whose links went off says why', () => {
  it('the ownership read starts while the confirm is open: Remove is off with that reason, the confirm stays, nothing is sent; back on, it removes', async () => {
    const r = render(tab());
    fireEvent.click(await screen.findByRole('button', { name: S['share.remove'] }));
    const ask = await screen.findByRole('alertdialog');
    r.rerender(tab({ ownershipUnknown: true }));
    await flush();
    expect(confirm(ask)).toHaveAttribute('aria-disabled', 'true');
    expect(confirm(ask)).toHaveAccessibleDescription(S['share.why.ownerReading']);
    fireEvent.click(confirm(ask));
    await flush();
    expect(screen.queryByRole('alertdialog')).not.toBeNull();
    expect(h.removes).toEqual([]);
    r.rerender(tab());
    await flush();
    expect(confirm(ask)).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(confirm(ask));
    await flush();
    expect(h.removes).toEqual([{ id: 'al1' }]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a change to the links held elsewhere while the confirm is open: Remove waits, saying so', async () => {
    const r = render(tab());
    fireEvent.click(await screen.findByRole('button', { name: S['share.remove'] }));
    const ask = await screen.findByRole('alertdialog');
    h.elsewhere = { from: null };
    r.rerender(tab());
    await flush();
    expect(confirm(ask)).toHaveAttribute('aria-disabled', 'true');
    expect(confirm(ask)).toHaveAccessibleDescription(S['share.removeWait']);
    fireEvent.click(confirm(ask));
    await flush();
    expect(screen.queryByRole('alertdialog')).not.toBeNull();
    expect(h.removes).toEqual([]);
  });
});
