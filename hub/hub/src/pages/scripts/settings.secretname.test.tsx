// Vitest (Settings > Secret values > Add a value): the name box takes only what the computer takes. hoody-exec refuses a
// name that is not letters, digits and _ or that starts with a digit (400 INVALID_ENV_KEY); before this the page sent
// 'MY KEY', '1TOKEN' or 'my-key' anyway and, the route being secret with that code unlisted, could only say the change was
// refused. Now the box says the rule and Save sends nothing until the name fits; a refusal the page cannot foresee (a name
// the computer keeps for itself, a value it cannot store, a full file) is said in words for its code.
// Replaced: ./data (as settings.kit.test.tsx), with the env update answering what the test sets.
import { act, render, screen, userEvent, within } from '@app/testing';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsTab } from './parts/SettingsTab';
import { envNameOk } from './secrets';
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
  envCode: undefined as string | undefined,
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
  useEnvUpdate: () => ({ ...mutation('other'), mutateAsync: async (v: unknown) => { world.sent.push(v); return { outcome: world.envAnswer, ...(world.envCode ? { code: world.envCode } : {}) }; } }),
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
const mount = () => render(<SettingsTab item={base} comp={comp} onChanged={() => undefined} onDeleted={() => undefined} secretsFaq={FAQ as never} settingsFaq={SFAQ as never} />);

/** The add editor open, with the name and a value typed. */
async function typed(name: string, value = 's3cret') {
  mount();
  const g = await screen.findByRole('group', { name: strings['secrets.title'] });
  await userEvent.click(within(g).getByRole('button', { name: strings['secrets.add'] }));
  await userEvent.type(within(g).getByRole('textbox', { name: strings['secrets.name'] }), name);
  if (value) await userEvent.type(within(g).getByLabelText(strings['secrets.value']), value);
  return g;
}

describe('envNameOk: the name shape hoody-exec takes', () => {
  it('letters, digits and _, not starting with a digit, at most 256 characters', () => {
    for (const ok of ['TOKEN', 'api_key', '_x', 'A1', 'a'.repeat(256)]) expect(envNameOk(ok)).toBe(true);
    for (const bad of ['', 'MY KEY', '1TOKEN', 'my-key', 'a.b', 'é', 'A=B', 'a'.repeat(257)]) expect(envNameOk(bad)).toBe(false);
  });
});

describe('Add a secret value: the name box', () => {
  beforeEach(() => {
    world.rows.remove = []; world.rows.removeManaged = []; world.sent.length = 0; world.envAnswer = 'done'; world.envCode = undefined;
    world.env = { files: [{ scope: 'script', revision: 'e1' }], effective: [] };
  });

  it('says the rule before anything is typed', async () => {
    mount();
    const g = await screen.findByRole('group', { name: strings['secrets.title'] });
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.add'] }));
    expect(within(g).getByText(strings['secrets.nameRule'])).toBeTruthy();
    expect(within(g).queryByText(strings['secrets.nameBad'])).toBeNull();
  });

  for (const name of ['MY KEY', '1TOKEN', 'my-key']) {
    it(`"${name}" is refused at the box and nothing is sent`, async () => {
      const g = await typed(name);
      expect(within(g).getByText(strings['secrets.nameBad'])).toBeTruthy();
      expect(within(g).getByRole('textbox', { name: strings['secrets.name'] })).toHaveAttribute('aria-invalid', 'true');
      await userEvent.click(within(g).getByRole('button', { name: strings['secrets.save'] }));
      await act(async () => { await Promise.resolve(); });
      expect(world.sent).toHaveLength(0);
    });
  }

  it('a name that fits is sent as typed, trimmed', async () => {
    const g = await typed(' API_TOKEN2 ');
    expect(within(g).queryByText(strings['secrets.nameBad'])).toBeNull();
    await userEvent.click(within(g).getByRole('button', { name: strings['secrets.save'] }));
    await vi.waitFor(() => expect(world.sent).toHaveLength(1));
    expect((world.sent[0] as { set: Record<string, string> }).set).toEqual({ API_TOKEN2: 's3cret' });
  });

  for (const code of ['INVALID_ENV_KEY', 'INVALID_ENV_VALUE', 'ENV_LIMIT'] as const) {
    it(`a refusal with ${code} is said in its own words, not the plain sentence`, async () => {
      world.envAnswer = 'failed';
      world.envCode = code;
      const g = await typed('PATH');
      await userEvent.click(within(g).getByRole('button', { name: strings['secrets.save'] }));
      await vi.waitFor(() => expect(world.sent).toHaveLength(1));
      expect(await screen.findByText(strings[`err.${code}`])).toBeTruthy();
      expect(strings[`err.${code}`]).not.toBe(strings['err.generic']);
    });
  }
});
