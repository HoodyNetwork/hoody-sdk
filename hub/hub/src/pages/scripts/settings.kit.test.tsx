// Vitest (no unstructured pages): the Settings tab is built from the kit's
// structure. The secret values are rows of one setting group, a new value is added through a reveal row, the answer
// link sits at the end of a Why (a closed question), and Delete is the danger group, the last group of the tab.
import { act, render, screen, userEvent, within } from '@app/testing';
import type { ReactNode } from 'react';
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
  env: undefined as unknown,
  envAnswer: 'done' as string,
  sent: [] as unknown[],
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
// The Why's link is the kit's own FaqLink (imported inside the kit, not through the barrel): it is replaced where it lives.
vi.mock('../../kit/layouts/Faq', async (orig) => ({ ...(await orig<Record<string, unknown>>()), FaqLink: ({ children }: { children: ReactNode }) => <a href="#faq">{children}</a> }));
vi.mock('./data', () => ({
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: world.env, refetch: async () => undefined }),
  useEnvUpdate: () => ({ ...mutation('other'), mutateAsync: async (v: unknown) => { world.sent.push(v); return { outcome: world.envAnswer }; } }),
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

const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] } as never;
const FAQ = { id: 'secrets', q: 'Q?', a: 'A' };
const SFAQ = { id: 'settingsAtTop', q: 'Q2?', a: 'A2' };
const mount = (faqs = true) => render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} {...(faqs ? { secretsFaq: FAQ as never, settingsFaq: SFAQ as never } : {})} />);
const groups = () => Array.from(document.querySelectorAll<HTMLElement>('[data-setting-group]'));

describe('the Settings tab, built from the kit', () => {
  beforeEach(() => {
    world.rows.remove = []; world.rows.removeManaged = []; world.sent.length = 0; world.envAnswer = 'done';
    world.env = { files: [{ scope: 'script', revision: 'e1' }], effective: [{ name: 'API_KEY', from: 'script' }, { name: 'REGION', from: 'computer' }] };
  });

  it('Delete is the danger group, and it is the last group of the tab', async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    const danger = screen.getByRole('group', { name: strings['delete.title'] });
    expect(danger.closest('[data-setting-group]')?.getAttribute('data-sg-tone')).toBe('danger');
    expect(within(danger).getByRole('button', { name: strings['delete.action'] })).toBeTruthy();
    const all = groups();
    expect(all[all.length - 1]).toBe(danger.closest('[data-setting-group]'));
  });

  it('each secret value is a row of the secrets group: its name, then where it comes from', async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    const g = screen.getByRole('group', { name: strings['secrets.title'] });
    const rows = within(g).getAllByText(/^(API_KEY|REGION)$/).map((n) => n.closest('[data-sg-row]') as HTMLElement);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(strings['secrets.from.script'])).toBeTruthy();
    expect(within(rows[1]!).getByText(strings['secrets.from.computer'])).toBeTruthy();
  });

  it('a new value is added through the reveal row: its editor opens in place, Save sends it, and the editor closes once it is saved', async () => {
    mount();
    const g = await screen.findByRole('group', { name: strings['secrets.title'] });
    expect(within(g).queryByLabelText(strings['secrets.name'])).toBeNull();
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.add'] }));
    await userEvent.type(within(g).getByRole('textbox', { name: strings['secrets.name'] }), 'TOKEN');
    await userEvent.type(within(g).getByLabelText(strings['secrets.value']), 's3cret');
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.save'] }));
    await vi.waitFor(() => expect(world.sent).toHaveLength(1));
    expect((world.sent[0] as { set: Record<string, string> }).set).toEqual({ TOKEN: 's3cret' });
    await vi.waitFor(() => expect(within(g).queryByLabelText(strings['secrets.name'])).toBeNull());
  });

  it('a value the computer refused keeps the editor open, with the name kept and the value cleared', async () => {
    world.envAnswer = 'refused';
    mount();
    const g = await screen.findByRole('group', { name: strings['secrets.title'] });
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.add'] }));
    await userEvent.type(within(g).getByRole('textbox', { name: strings['secrets.name'] }), 'TOKEN');
    await userEvent.type(within(g).getByLabelText(strings['secrets.value']), 's3cret');
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.save'] }));
    await vi.waitFor(() => expect(world.sent).toHaveLength(1));
    await act(async () => { await Promise.resolve(); });
    expect((within(g).getByRole('textbox', { name: strings['secrets.name'] }) as HTMLInputElement).value).toBe('TOKEN');
    expect((within(g).getByLabelText(strings['secrets.value']) as HTMLInputElement).value).toBe('');
  });

  it('with no secret values yet, the group still offers the one way to add one and says there are none', async () => {
    world.env = { files: [], effective: [] };
    mount();
    const g = await screen.findByRole('group', { name: strings['secrets.title'] });
    expect(within(g).getByText(strings['secrets.none'])).toBeTruthy();
    expect(within(g).getAllByRole('button')).toHaveLength(1);
  });

  it('the secrets answer is a Why: a closed question whose answer ends with the link', async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('link', { name: strings['secrets.more'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['secrets.why.q'] }));
    expect(screen.getByText(strings['secrets.why.a'])).toBeTruthy();
    expect(screen.getByRole('link', { name: strings['secrets.more'] })).toBeTruthy();
  });

  it('without the page\'s answers there is no secrets question at all', async () => {
    mount(false);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: strings['secrets.why.q'] })).toBeNull();
  });
});
