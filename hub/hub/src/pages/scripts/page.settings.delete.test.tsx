// Vitest at the Settings tab: a delete that may have gone through (pressed here, or still held from an earlier visit or another
// computer's view and found again) is shown beside the Delete button with Check again and then the warned close of exactly the hold
// shown. The confirmation has no way out of it, so the banner is the recovery path; the Delete button stays locked meanwhile.
import { act, render, screen, userEvent } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsTab } from './parts/SettingsTab';
import strings from './strings.en.json';

type Row = { hold: string; at: number; identity: unknown; target: { container: { id: string } } | null; account: string };
const world = vi.hoisted(() => ({
  rows: { remove: [] as unknown[], removeManaged: [] as unknown[] },
  dismissed: [] as string[],
  answers: [] as string[],
  reads: 0,
  readKeys: [] as string[],
}));
const mutation = (key: 'remove' | 'removeManaged' | 'other') => ({
  // Captured when the hook renders, as core's `pending` is; `held()` is live.
  pending: key !== 'other' && world.rows[key].length > 0,
  isPending: false,
  mutateAsync: async () => { world.answers.push(key); if (key !== 'other') world.rows[key] = [{ hold: `hold-${key}-new`, at: 1, identity: { path: 'a.ts' }, target: { container: { id: 'c1' } }, account: 'acc' } satisfies Row]; return { outcome: 'pending' as const, hold: `hold-${key}-new` }; },
  held: () => (key === 'other' ? [] : (world.rows[key] as Row[])),
  readBack: async () => { world.reads++; world.readKeys.push(key); return false; },
  dismissHeld: (row: { hold: string }) => { world.dismissed.push(row.hold); world.rows.remove = world.rows.remove.filter((r) => (r as Row).hold !== row.hold); world.rows.removeManaged = world.rows.removeManaged.filter((r) => (r as Row).hold !== row.hold); return true; },
  holdOf: async () => undefined,
});
vi.mock('./data', () => ({
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useEnvUpdate: () => mutation('other'),
  useRemove: () => mutation('remove'),
  useRemoveManaged: () => mutation('removeManaged'),
  useSetComments: () => mutation('other'),
  useCommentsCheck: () => mutation('other'),
  useCommentsSchema: () => ({ isPending: true, isError: false, data: undefined, refetch: async () => undefined }),
  useCommentsRead: () => ({ isPending: true, isError: false, data: undefined, refetch: async () => undefined }),
  useValidate: () => ({ mutateAsync: async () => ({ data: { verdict: 'ready' } }) }),
  // The delete asks Exec who answers each link first: no script answers it here.
  useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
  useWrite: () => mutation('other'),
  useAliasState: () => mutation('other'),
  useAliasCreate: () => mutation('other'),
  useAliasRemove: () => mutation('other'),
  useAliasHeldElsewhere: () => null,
  useTests: () => ({ data: undefined }),
  useTestsDelete: () => mutation('other'),
  useScriptsTarget: () => null,
  useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
}));

const base = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const managed = { ...(base as object), managed: { template: 'x', elsewhere: false } } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] } as never;
const heldRow = (key: string): Row => ({ hold: `hold-${key}-1`, at: 1, identity: { path: 'a.ts' }, target: { container: { id: 'c1' } }, account: 'acc' });
const deleteBtn = () => screen.getByRole('button', { name: strings['delete.action'] }) as HTMLButtonElement;

describe('a delete that may have gone through, found again in Settings', () => {
  beforeEach(() => { world.rows.remove = []; world.rows.removeManaged = []; world.dismissed.length = 0; world.answers.length = 0; world.reads = 0; world.readKeys.length = 0; });

  for (const key of ['remove', 'removeManaged'] as const) {
    it(`${key === 'remove' ? 'an ordinary' : 'a managed'} delete held from an earlier visit: banner, Delete locked, Check again then the warned close frees exactly that hold`, async () => {
      world.rows[key] = [heldRow(key)];
      render(<SettingsTab item={key === 'remove' ? base : managed} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} />);
      expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
      expect(deleteBtn().disabled).toBe(true);
      expect(screen.queryByRole('button', { name: strings['force.label'] })).toBeNull();
      await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
      expect(world.reads).toBeGreaterThan(0);
      await userEvent.click(await screen.findByRole('button', { name: strings['force.label'] }));
      await userEvent.click(await screen.findByRole('button', { name: strings['force.confirm'] }));
      await vi.waitFor(() => expect(world.dismissed).toEqual([`hold-${key}-1`]));
      await vi.waitFor(() => expect(screen.queryByText(strings['outcome.pending.delete'])).toBeNull());
    });
  }

  it('Check asks every hold that is there when it is pressed, not the ones the last render saw: a delete held since then is read, and the sequence does not go on without that read', async () => {
    world.rows.remove = [heldRow('remove')];
    const done: string[] = [];
    render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => done.push('deleted')} />);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    world.rows.remove = [];
    world.rows.removeManaged = [heldRow('removeManaged')]; // after the render: the hook's flag for it is still false
    await act(async () => { screen.getByRole('button', { name: strings['outcome.check'] }).click(); await Promise.resolve(); });
    await vi.waitFor(() => expect(world.readKeys).toContain('removeManaged'));
    expect(done).toEqual([]);
    expect(world.answers).toEqual([]);
  });

  it('a delete pressed here that answers pending closes the confirmation and shows the banner', async () => {
    render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} />);
    expect(screen.queryByText(strings['outcome.pending.delete'])).toBeNull();
    await userEvent.click(deleteBtn());
    await userEvent.click(await screen.findByRole('button', { name: strings['delete.confirm'] }));
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['delete.confirm'] })).toBeNull();
    expect(deleteBtn().disabled).toBe(true);
    expect(world.answers).toEqual(['remove']);
  });

  it('mounted without the page\'s answers (no router above it), the tab draws no question link and still mounts', async () => {
    render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    expect(deleteBtn()).toBeTruthy();
    expect(screen.queryByRole('link', { name: strings['secrets.more'] })).toBeNull();
    expect(screen.queryByRole('link', { name: strings['settings.more'] })).toBeNull();
  });

  it('control: no hold, no banner, Delete available', async () => {
    render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(strings['outcome.pending.delete'])).toBeNull();
    expect(deleteBtn().disabled).toBe(false);
  });
  // Check and the lock follow the holds, never the script's current ordinary/managed metadata.
  for (const [held, from, to] of [['removeManaged', managed, base], ['remove', base, managed]] as const) {
    it(`a ${held === 'remove' ? 'ordinary' : 'managed'} delete held, then the script's classification flips: Check reads the hold back, the banner stays, no second delete goes out`, async () => {
      world.rows[held] = [heldRow(held)];
      const props = { comp, onChanged: () => undefined, onDeleted: () => undefined };
      const view = render(<SettingsTab item={from} {...props} />);
      expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
      view.rerender(<SettingsTab item={to} {...props} />);
      await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
      await vi.waitFor(() => expect(world.readKeys).toContain(held));
      expect(screen.getByText(strings['outcome.pending.delete'])).toBeTruthy();
      expect(deleteBtn().disabled).toBe(true);
      expect(world.answers).toEqual([]);
    });
  }

  it('ownership metadata unavailable, then back: Check does not hide a held managed delete', async () => {
    world.rows.removeManaged = [heldRow('removeManaged')];
    const props = { comp, onChanged: () => undefined, onDeleted: () => undefined };
    const unknown = { ...(base as object), ownershipUnknown: true } as never;
    const view = render(<SettingsTab item={unknown} {...props} />);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: strings['outcome.check'] }));
    await vi.waitFor(() => expect(world.readKeys).toContain('removeManaged'));
    expect(screen.getByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(deleteBtn().disabled).toBe(true);
    view.rerender(<SettingsTab item={managed} {...props} />);
    expect(screen.getByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['outcome.check'] })).toBeTruthy();
    expect(world.answers).toEqual([]);
  });
});
