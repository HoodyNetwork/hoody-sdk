// Vitest at the page: Delete is in the script's "..." menu (and a list row's "..." goes to the same place); it opens the
// SAME confirmation as Settings' Delete (one implementation, two entry points), naming the script, sends once, and is offered only
// where Settings' own Delete is: a script the agent manages or a computer that cannot delete shows its reason instead. Replaced:
// the overview (one computer) and the remove mutation (a double that records what it was sent); the rest runs.
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { useMemo, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID = 'c0a7150000000000000000a1';
const world = vi.hoisted(() => ({
  removes: [] as Array<Record<string, unknown>>,
  managed: false,
  canDelete: true,
  held: false,
  /** The saved-tests removal becomes held once the script delete was sent. */
  testsAfterDelete: false,
  /** Holds of the other changes of the delete (alias remove / make of this script's address, the saved-tests removal), and another page's. */
  aliasRemoveHeld: false,
  aliasCreateHeld: false,
  testsHeld: false,
  elsewhere: false,
  /** A link of this script that is off (cached `enabled: false`): the delete sequence never sends a change for it. */
  offLink: false,
  /** Alias requests still out (core's sendingChanges): not held yet, so no hold shows them. */
  sending: [] as Array<{ identity: unknown; target: null; realm: null; by: undefined; from: null; here: boolean; attributed: boolean }>,
  /** Holds of the alias lock that another page sent (core's heldChanges lists every sender's; the mutations here list their own). */
  aliasHolds: [] as Array<{ identity: unknown }>,
  /** The toasts shown. */
  toasts: [] as Array<{ title: string }>,
  ver: 0,
  subs: new Set<() => void>(),
}));
const bump = () => { world.ver++; for (const f of [...world.subs]) f(); };

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  // `held`: core still lists an earlier delete of this script (a send from a visit before, outcome unknown).
  // `pending` is a boolean captured when the hook renders (core's snapshot semantics); `held()` is read live.
  const mutation = (log: Array<Record<string, unknown>>, on: () => boolean = () => false, identity: () => Record<string, unknown> = () => ({ path: 'default/1/probe.ts' })) => ({
    pending: on(),
    isPending: false,
    mutateAsync: async (v: Record<string, unknown>) => { log.push(v); if (log === world.removes && world.testsAfterDelete) { world.testsHeld = true; bump(); } return { outcome: 'done' as const }; },
    held: () => (on() ? [{ hold: 'h1', account: 'a', identity: identity(), target: { container: { id: ID } } }] : []),
    holdOf: async () => undefined,
    readBack: async () => false,
    complete: async () => false,
    discard: async () => false,
    settle: async () => true,
  });
  return {
    ...real,
    useRemove: () => mutation(world.removes, () => world.held),
    useRemoveManaged: () => mutation(world.removes),
    useTestsDelete: () => mutation([], () => world.testsHeld),
    useAliasState: () => mutation([]),
    useAliasCreate: () => mutation([], () => world.aliasCreateHeld, () => ({ compId: ID, target: '/probe' })),
    useAliasRemove: () => mutation([], () => world.aliasRemoveHeld, () => ({ alias: 'al1' })),
    useAliasHeldElsewhere: () => (world.elsewhere ? { from: null } : null),
    useTests: () => ({ data: { revision: 't1' }, refetch: async () => undefined }),
    useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
    useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
    useOverview: () => {
      const ver = useSyncExternalStore((f: () => void) => { world.subs.add(f); return () => { world.subs.delete(f); }; }, () => world.ver);
      const data = useMemo(() => ({
        ver,
        computers: [{
          id: ID, name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'n1', realmIds: [], err: null, origin: '',
          caps: { now: null, revisions: world.canDelete, history: true, env: true, executions: true, tests: true, publishable: true },
          agent: { templates: true, writer: false, guardedDelete: true }, agentRealm: 'global', aliasesRead: true,
          rows: [{ path: 'default/1/probe.ts', isDirectory: false }],
          summary: {}, instances: world.managed ? { 'default/1/probe.ts': { state: 'managed', template: 'x' } } : {}, aliases: world.offLink ? [{ id: 'al1', alias: 'shop', url: 'https://x', target_path: '/probe', enabled: false }] : [], deleted: [],
        } as never],
      }), [ver]);
      const items = useMemo(() => toItems(data.computers), [data]);
      return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({ 'a.0000': [] as string[] }) };
    },
  };
});

vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), sendingChanges: () => world.sending, heldChanges: () => world.aliasHolds }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { world.toasts.push(c); return 'toast-1'; } }));

import page from './page';
import strings from './strings.en.json';

const open = (path = '/scripts?sel=a.0000~probe.ts') => renderPage(page, { state: 'many', path });
const menuDelete = async () => {
  await userEvent.click((await screen.findAllByRole('button', { name: /more actions/i }, { timeout: 8000 }))[0] as HTMLElement);
  return screen.findByRole('menuitem', { name: strings['menu.delete'] });
};

describe('Delete in the detail menu', () => {
  beforeEach(() => { world.removes.length = 0; world.managed = false; world.canDelete = true; world.held = false; world.aliasRemoveHeld = false; world.aliasCreateHeld = false; world.testsHeld = false; world.elsewhere = false; world.offLink = false; world.testsAfterDelete = false; world.sending = []; world.aliasHolds = []; world.toasts.length = 0; });

  it('opens the same confirmation as Settings, naming the script, and sends one delete when confirmed', async () => {
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    expect(within(d).getByText(strings['delete.confirmTitle'].replace('{{name}}', 'Probe'))).toBeTruthy();
    expect(world.removes.length).toBe(0);
    await userEvent.click(within(d).getByRole('button', { name: strings['delete.confirm'] }));
    await vi.waitFor(() => expect(world.removes.length).toBe(1));
  });

  it('Cancel sends nothing, and the menu entry can ask again', async () => {
    await open();
    await userEvent.click(await menuDelete());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancel/i }));
    expect(world.removes.length).toBe(0);
    await userEvent.click(await menuDelete());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('shows Settings with the reason, and no confirmation, where Settings Delete is off', async () => {
    world.canDelete = false;
    await open();
    await userEvent.click(await menuDelete());
    expect(await screen.findByRole('button', { name: strings['delete.action'] })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.removes.length).toBe(0);
  });

  it('a list row\'s Delete (the delete=1 link) opens the same confirmation once and the link is consumed', async () => {
    await open('/scripts?sel=a.0000~probe.ts&tab=settings&delete=1');
    expect(await screen.findByRole('alertdialog', {}, { timeout: 8000 })).toBeTruthy();
    expect(window.location.search).not.toContain('delete=1');
  });

  it('a list row\'s "..." Delete opens that script\'s same confirmation', async () => {
    await open('/scripts');
    const table = await screen.findByRole('table', { name: strings.title }, { timeout: 8000 });
    const row = (await within(table).findAllByRole('row', { name: /probe/i }))[0] as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.delete'] }));
    const d = await screen.findByRole('alertdialog', {}, { timeout: 8000 });
    expect(within(d).getByText(strings['delete.confirmTitle'].replace('{{name}}', 'Probe'))).toBeTruthy();
    expect(world.removes.length).toBe(0);
  });

  it('Settings\' own Delete button still opens it (one implementation)', async () => {
    await open('/scripts?sel=a.0000~probe.ts&tab=settings');
    await userEvent.click(await screen.findByRole('button', { name: strings['delete.action'] }, { timeout: 8000 }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('a delete that may have gone through (held) keeps Settings\' Delete off: the header menu opens no confirmation and sends nothing', async () => {
    world.held = true;
    await open();
    await userEvent.click(await menuDelete());
    const btn = await screen.findByRole('button', { name: strings['delete.action'] }, { timeout: 8000 });
    expect((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true').toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.removes.length).toBe(0);
  });

  it('a list row\'s delete=1 link on a script with a hold opens no confirmation either', async () => {
    world.held = true;
    await open('/scripts?sel=a.0000~probe.ts&tab=settings&delete=1');
    const btn = await screen.findByRole('button', { name: strings['delete.action'] }, { timeout: 8000 });
    expect((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true').toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.removes.length).toBe(0);
  });

  // The holds Delete must wait for are all of the change's own locks, whatever the cached state of a link says.
  for (const [name, set] of [
    ['an unresolved removal of a link of this script (the link is cached as off, so the sequence would never touch it)', () => { world.offLink = true; world.aliasRemoveHeld = true; }],
    ['an unresolved "make a link" for this script\'s address', () => { world.aliasCreateHeld = true; }],
    ['an alias change another page sent, still unresolved (read-only here)', () => { world.offLink = true; world.elsewhere = true; }],
  ] as Array<[string, () => void]>) {
    it(`${name} keeps Delete off: no confirmation from the header menu, nothing sent, and the reason is shown`, async () => {
      set();
      await open();
      await userEvent.click(await menuDelete());
      const btn = await screen.findByRole('button', { name: strings['delete.action'] }, { timeout: 8000 });
      expect((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true').toBe(true);
      expect(await screen.findByText(strings['delete.block.held'])).toBeTruthy();
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(world.removes.length).toBe(0);
    });
  }

  // A request that is still out is not a hold yet (core lists a hold once it is pending), so only sendingChanges shows it.
  const out = (identity: unknown, attributed = true) => ({ identity, target: null, realm: null, by: undefined, from: null, here: false, attributed });
  for (const [name, row] of [
    ['a "make a link" for this script\'s address that another page sent', out({ compId: ID, target: '/probe' })],
    ['a change of one of this script\'s links, with the link cached as off', out({ alias: 'al1' })],
    ['an alias request whose subject core cannot name', out(null, false)],
  ] as Array<[string, ReturnType<typeof out>]>) {
    it(`${name}, still out, keeps Delete off: no confirmation from the header menu and nothing sent`, async () => {
      world.offLink = true;
      world.sending = [row];
      await open();
      await userEvent.click(await menuDelete());
      const btn = await screen.findByRole('button', { name: strings['delete.action'] }, { timeout: 8000 });
      expect((btn as HTMLButtonElement).disabled || btn.getAttribute('aria-disabled') === 'true').toBe(true);
      expect(await screen.findByText(strings['delete.block.held'])).toBeTruthy();
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(world.removes.length).toBe(0);
    });
  }

  it('an alias request for another script, or another computer, does not hold Delete', async () => {
    world.sending = [out({ compId: 'other', target: '/probe' }), out({ compId: ID, target: '/elsewhere' }), out({ alias: 'zz9' })];
    await open();
    await userEvent.click(await menuDelete());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('an alias request that went out after the confirmation opened still stops the confirmed press', async () => {
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    world.sending = [out({ compId: ID, target: '/probe' })]; // no render in between: one bare click event
    await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(world.removes.length).toBe(0);
  });

  it('an alias hold another page sent that appeared after the confirmation opened still stops the confirmed press', async () => {
    world.offLink = true;
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    world.aliasHolds = [{ identity: { alias: 'al1' } }]; // no render in between: one bare click event
    await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(world.removes.length).toBe(0);
  });

  it('an alias hold whose subject core cannot name (an older record converted to a hold) stops the confirmed press', async () => {
    world.offLink = true;
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    world.aliasHolds = [{ identity: null }]; // was an unattributed sending row until core converted it: no render in between
    await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(world.removes.length).toBe(0);
  });

  it.each([
    ['an empty object', {}],
    ['an object naming nothing known', { note: 'x' }],
    ['an alias that is not a name', { alias: 5 }],
  ])('a hold whose identity is %s stops the confirmed press (it says nothing about which script it touches)', async (_n, identity) => {
    world.offLink = true;
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    world.aliasHolds = [{ identity }]; // no render in between: one bare click event
    await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(world.removes.length).toBe(0);
  });

  it('a hold of a known shape that is another script\'s (another link, another address, an HTTP or pipe address) does not stop it', async () => {
    world.offLink = true;
    world.aliasHolds = [
      { identity: { alias: 'zz9', enabled: false } },
      { identity: { compId: 'other', target: '/elsewhere' } },
      { identity: { computer: 'c1', port: 80, name: 'web' } },
      { identity: { computer: 'c1', name: 'pipe', until: 5 } },
    ];
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['delete.confirm'] }));
    await vi.waitFor(() => expect(world.removes.length).toBe(1));
  });

  it('the same record, unattributed while sending and then held without its identity, never lets the delete through', async () => {
    world.offLink = true;
    world.sending = [{ ...out({ compId: 'other', target: '/x' }), attributed: false, identity: undefined } as never];
    await open();
    await userEvent.click(await menuDelete());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    world.sending = [];
    world.aliasHolds = [{ identity: undefined }];
    await act(async () => { bump(); });
    await userEvent.click(await menuDelete());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.removes.length).toBe(0);
  });

  it('an alias hold of another script does not stop it', async () => {
    world.offLink = true;
    world.aliasHolds = [{ identity: { alias: 'zz9' } }];
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['delete.confirm'] }));
    await vi.waitFor(() => expect(world.removes.length).toBe(1));
  });

  it('a hold that arrives after the confirmation opened closes it: nothing is sent', async () => {
    await open();
    await userEvent.click(await menuDelete());
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    world.testsHeld = true;
    await act(async () => { bump(); });
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(world.removes.length).toBe(0);
  });

  it('a hold that arrived since the last render still stops the confirmed press (judged again when pressed)', async () => {
    world.offLink = true;
    await open();
    await userEvent.click(await menuDelete());
    const d = await screen.findByRole('alertdialog');
    world.aliasRemoveHeld = true; // no render in between: one bare click event, no pointer events that would render first
    await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(world.removes.length).toBe(0);
  });

  for (const [name, set] of [
    ['an earlier delete of the script', () => { world.held = true; }],
    ['a "make a link" for its address', () => { world.aliasCreateHeld = true; }],
    ['a saved-tests removal', () => { world.testsHeld = true; }],
  ] as Array<[string, () => void]>) {
    it(`${name} that became held since the last render stops the confirmed press (rows read when pressed, not the render's flag)`, async () => {
      await open();
      await userEvent.click(await menuDelete());
      const d = await screen.findByRole('alertdialog');
      set(); // no render in between: one bare click event
      await act(async () => { within(d).getByRole('button', { name: strings['delete.confirm'] }).click(); });
      await new Promise((r) => setTimeout(r, 50));
      expect(world.removes.length).toBe(0);
    });
  }

  it('a saved-tests removal that became held while the script delete was out stays pending: not "cleaned up"', async () => {
    world.testsAfterDelete = true;
    await open();
    await userEvent.click(await menuDelete());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.confirm'] }));
    await vi.waitFor(() => expect(world.removes.length).toBe(1));
    // That removal was sent by another view, so the toast says so and carries no Check again this tab could not answer.
    await vi.waitFor(() => expect(world.toasts.map((x) => x.title)).toContain(strings['delete.testsHeldOlder']));
    expect(world.toasts.map((x) => x.title)).not.toContain(strings['delete.testsLeft']);
  });

  it('a delete link for a script that is not there is dropped: it does not open the next script\'s confirmation', async () => {
    await open('/scripts?sel=a.0000~gone.ts&tab=settings&delete=1');
    await userEvent.click(await screen.findByRole('button', { name: strings['detail.backList'] }, { timeout: 8000 }));
    await vi.waitFor(() => expect(window.location.search).not.toContain('delete=1'));
    const table = await screen.findByRole('table', { name: strings.title }, { timeout: 8000 });
    await userEvent.click((await within(table).findAllByRole('row', { name: /probe/i }))[0] as HTMLElement);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.removes.length).toBe(0);
  });
});
