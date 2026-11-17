// Vitest at the page: a script's own "Make a link" (the detail's Overview). The dialog fills a valid suggested name (the API's
// rule checks it) and sends nothing until Make link; one press sends one alias for the script's address with the typed name;
// a made link is said in place (an announced note, no toast), each new one by name; a link under a minute old says it may not
// answer yet; the dialog sends only while the link is still allowed (no pending create of it, a name that is not empty), and a
// taken name is explained on the Overview too. Replaced: the overview (one computer), the write and alias mutations (doubles
// that record what they were sent and answer what the test says), and showToast.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { useMemo, useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ans = { outcome: 'done' | 'pending' | 'failed' | 'not_sent'; code?: string; hold?: string };
const ID = 'c0a7150000000000000000a1';
const world = vi.hoisted(() => ({
  writes: [] as Array<Record<string, unknown>>,
  aliases: [] as Array<Record<string, unknown>>,
  aliasAnswer: { outcome: 'done' } as Ans,
  writeAnswer: { outcome: 'done' } as Ans,
  toasts: [] as Array<{ title: string }>,
  rows: [] as Array<Record<string, unknown>>,
  aliasRows: [] as Array<Record<string, unknown>>,
  instantiates: [] as Array<Record<string, unknown>>,
  /** The write is held until a test lets it go (a deferred answer). */
  writeGate: null as null | Promise<void>,
  /** The alias create is held the same way. */
  aliasGate: null as null | Promise<void>,
  /** Core's view of the create: a pending change is held, and a read-back says whether it is there. */
  aliasHeld: false,
  /** The write is checked as the computer checks expectRoute: against the tree after the change (a new script at a free
   *  address answers it itself), with exec's root-relative path; any other expectation is refused, nothing changed. */
  routeCheck: false,
  readBackOk: false,
  /** The hold is let go in another tab while the read is out: the read says "no longer pending" with nothing proved. */
  releaseDuringRead: false,
  /** A read-back is held until a test lets it go (an older Check still out). */
  readGate: null as null | Promise<void>,
  /** The address of the last link send (the hold names it). */
  aliasTarget: '/probe',
  readBacks: 0,
  /** A write/instantiate hold of /probe on atlas from an earlier visit shows up (core's held row of that path and computer). */
  writeHeld: false,
  /** Core's complete (frees a proved pending send's own hold) calls. */
  completes: 0,
  /** The computer's list of scripts as a fresh read finds it, and whether core frees a pending create the read proved. */
  listPaths: [] as string[],
  completeOk: false,
  /** The list the page shows when it is older than the computer's (null: the computer's own), and what a read of the aliases does to it. */
  staleAliases: null as null | Array<Record<string, unknown>>,
  refreshOnRead: false,
  ver: 0,
  subs: new Set<() => void>(),
}));

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { world.toasts.push(c); return 'toast-1'; } }));

vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const { toItems } = await import('./logic');
  const mutation = (log: Array<Record<string, unknown>>, answer: () => Ans, gate?: () => Promise<void> | null, isAlias = false) => ({
    get pending() { return isAlias ? world.aliasHeld : world.writeHeld; },
    isPending: false,
    mutateAsync: async (v: Record<string, unknown>) => {
      log.push(v);
      if (isAlias && typeof v.target === 'string') world.aliasTarget = v.target;
      if (!isAlias && world.routeCheck) {
        const e = v.expectRoute as { route?: unknown; answeredBy?: unknown } | undefined;
        if (e && e.answeredBy !== v.path) return { outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' } as Ans;
      }
      const g = gate?.();
      if (g) await g;
      const a = answer();
      if (isAlias && a.outcome === 'pending') world.aliasHeld = true;
      return a;
    },
    held: () => (!isAlias && world.writeHeld ? [{ hold: 'hw', at: 1, identity: { path: 'default/1/probe.ts' }, target: { container: { id: ID } }, account: 'acc' }] : isAlias && world.aliasHeld ? [{ hold: 'h1', at: 1, identity: { compId: ID, target: world.aliasTarget }, target: { container: { id: ID } }, account: 'acc' }] : []),
    holdOf: async () => undefined,
    readBack: async () => { world.readBacks++; if (isAlias && world.refreshOnRead) { world.staleAliases = null; world.ver++; for (const f of [...world.subs]) f(); } if (isAlias && world.readGate) await world.readGate; if (isAlias && world.releaseDuringRead) { world.aliasHeld = false; return true; } if (isAlias && world.readBackOk) world.aliasHeld = false; return isAlias && world.readBackOk; },
    complete: async () => { world.completes++; return world.completeOk; },
    discard: async () => false,
    settle: async () => true,
  });
  return {
    ...real,
    useWrite: () => mutation(world.writes, () => world.writeAnswer, () => world.writeGate),
    useInstantiate: () => mutation(world.instantiates, () => world.writeAnswer),
    useAliasCreate: () => mutation(world.aliases, () => world.aliasAnswer, () => world.aliasGate, true),
    useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
    useOverview: () => {
      const ver = useSyncExternalStore((f: () => void) => { world.subs.add(f); return () => { world.subs.delete(f); }; }, () => world.ver);
      const data = useMemo(() => ({
        ver,
        computers: [{
          id: ID, name: 'atlas', handle: 'a.0000', state: 'on', serverName: 'n1', realmIds: [], err: null,
          origin: `https://atlas-${ID}-exec-1.n1.example`,
          caps: { now: null, revisions: true, history: true, env: true, executions: true, tests: true, publishable: true },
          agent: { templates: true, writer: false, guardedDelete: true }, agentRealm: 'global',
          rows: world.rows.length ? world.rows : [{ path: 'default/1/probe.ts', isDirectory: false }],
          summary: {}, instances: {}, aliases: world.staleAliases ?? world.aliasRows, deleted: [],
        } as never],
      }), [ver]);
      const items = useMemo(() => toItems(data.computers), [data]);
      return { data, items, isPending: false, isError: false, error: null, refetch: async () => ({ 'a.0000': world.listPaths }) };
    },
  };
});

import page from './page';
import strings from './strings.en.json';
import { aliasProblem } from '@core';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };
const reset = () => { world.writeHeld = false; world.completes = 0; world.writes.length = 0; world.aliases.length = 0; world.toasts.length = 0; world.aliasAnswer = { outcome: 'done' }; world.writeAnswer = { outcome: 'done' }; world.rows = []; world.aliasRows = []; world.instantiates.length = 0; world.writeGate = null; world.aliasGate = null; world.aliasHeld = false; world.routeCheck = false; world.readBackOk = false; world.readBacks = 0; world.listPaths = []; world.completeOk = false; world.releaseDuringRead = false; world.readGate = null; world.aliasTarget = '/probe'; world.staleAliases = null; world.refreshOnRead = false; };

describe('the detail: Make a link asks for the name', () => {
  beforeEach(reset);

  async function openDetail() {
    await renderPage(page, { state: 'many', path: '/scripts?sel=a.0000~probe.ts' });
    const make = await screen.findAllByRole('button', { name: strings['share.make'] }, SLOW);
    await userEvent.click(make[0] as HTMLElement);
    return screen.findByRole('dialog');
  }

  it('opens a dialog with a valid suggested name; nothing is sent until Make link', async () => {
    const d = await openDetail();
    expect(aliasProblem((within(d).getByRole('textbox', { name: strings['link.name'] }) as HTMLInputElement).value)).toBeNull();
    expect(world.aliases.length).toBe(0);
  });

  it('sends one alias with the typed name for the script address, once', async () => {
    const d = await openDetail();
    const box = within(d).getByRole('textbox', { name: strings['link.name'] });
    await userEvent.clear(box);
    await userEvent.type(box, 'weather-api-9');
    await userEvent.click(within(d).getByRole('button', { name: strings['link.go'] }));
    await vi.waitFor(() => expect(world.aliases.length).toBe(1));
    expect(world.aliases[0]).toEqual({ compId: ID, target: '/probe', alias: 'weather-api-9', exec: 1 });
    expect(await screen.findByText(/New links can take about a minute/)).toBeTruthy();
  });

  it('a made link says so in place (an announced note), with no toast', async () => {
    const d = await openDetail();
    await userEvent.click(within(d).getByRole('button', { name: strings['link.go'] }));
    await vi.waitFor(() => expect(world.aliases.length).toBe(1));
    const note = await screen.findByText(/New links can take about a minute/);
    expect(note.closest('[role="status"]')).not.toBeNull();
    expect(world.toasts).toEqual([]);
  });

  it('two links made in one visit are each announced, by name (a new note each time)', async () => {
    const make = async (name: string) => {
      const d = (await screen.findAllByRole('button', { name: strings['share.make'] }))[0] as HTMLElement;
      await userEvent.click(d);
      const dlg = await screen.findByRole('dialog');
      const box = within(dlg).getByRole('textbox', { name: strings['link.name'] });
      await userEvent.clear(box);
      await userEvent.type(box, name);
      await userEvent.click(within(dlg).getByRole('button', { name: strings['link.go'] }));
    };
    await openDetail().then(() => userEvent.keyboard('{Escape}'));
    await make('first-link-1');
    const first = await screen.findByText(strings['share.made'].replace('{{name}}', 'first-link-1'));
    const region = first.closest('[role="status"]');
    expect(region).not.toBeNull();
    await make('second-link-2');
    const second = await screen.findByText(strings['share.made'].replace('{{name}}', 'second-link-2'));
    // The same live region, with a new note in it (the first one is gone): a change a screen reader announces.
    expect(second.closest('[role="status"]')).toBe(region);
    expect(first.isConnected).toBe(false);
    expect(world.aliases.map((a) => a.alias)).toEqual(['first-link-1', 'second-link-2']);
    expect(world.toasts).toEqual([]);
  });

  it('a name the API would refuse cannot be sent', async () => {
    const d = await openDetail();
    const box = within(d).getByRole('textbox', { name: strings['link.name'] });
    await userEvent.clear(box);
    await userEvent.type(box, 'Bad Name');
    expect((within(d).getByRole('button', { name: strings['link.go'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(world.aliases.length).toBe(0);
  });
});

describe('the detail: a link made a moment ago says it may not answer yet', () => {
  beforeEach(reset);
  const link = (created_at: string) => ({ id: 'al1', alias: 'weather-api-9', url: 'https://weather-api-9.hoody.example.test', target_path: '/probe', enabled: true, allow_path_override: false, program: 'exec', index: 1, created_at });
  const open = () => renderPage(page, { state: 'many', path: '/scripts?sel=a.0000~probe.ts' });

  it('a link under a minute old shows the note on its row', async () => {
    world.aliasRows = [link(new Date(Date.now() - 5_000).toISOString())];
    await open();
    expect(await screen.findByText(/Made under a minute ago/i, {}, SLOW)).toBeTruthy();
  });

  it('an older link shows none', async () => {
    world.aliasRows = [link(new Date(Date.now() - 10 * 60_000).toISOString())];
    await open();
    await screen.findByText('weather-api-9.hoody.example.test', {}, SLOW);
    expect(screen.queryByText(/Made under a minute ago/i)).toBeNull();
  });

  it('a link with no created time shows none', async () => {
    world.aliasRows = [{ ...link(''), created_at: undefined }];
    await open();
    await screen.findByText('weather-api-9.hoody.example.test', {}, SLOW);
    expect(screen.queryByText(/Made under a minute ago/i)).toBeNull();
  });
});

describe('the detail dialog sends only while the link is still allowed', () => {
  beforeEach(reset);

  it('a create that went pending while the dialog was open turns Make link off and sends nothing', async () => {
    await renderPage(page, { state: 'many', path: '/scripts?sel=a.0000~probe.ts' });
    const make = await screen.findAllByRole('button', { name: strings['share.make'] }, SLOW);
    await userEvent.click(make[0] as HTMLElement);
    const d = await screen.findByRole('dialog');
    world.aliasHeld = true;
    const box = within(d).getByRole('textbox', { name: strings['link.name'] });
    await userEvent.type(box, 'x');
    await vi.waitFor(() => expect((within(d).getByRole('button', { name: strings['link.go'] }) as HTMLButtonElement).disabled).toBe(true));
    expect(world.aliases.length).toBe(0);
  });

  it('an emptied name cannot be sent', async () => {
    await renderPage(page, { state: 'many', path: '/scripts?sel=a.0000~probe.ts' });
    const make = await screen.findAllByRole('button', { name: strings['share.make'] }, SLOW);
    await userEvent.click(make[0] as HTMLElement);
    const d = await screen.findByRole('dialog');
    await userEvent.clear(within(d).getByRole('textbox', { name: strings['link.name'] }));
    expect((within(d).getByRole('button', { name: strings['link.go'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(world.aliases.length).toBe(0);
  });

  it('a taken name from the dialog is explained on the Overview banner too', async () => {
    world.aliasAnswer = { outcome: 'failed', code: 'ALIAS_IN_USE' };
    await renderPage(page, { state: 'many', path: '/scripts?sel=a.0000~probe.ts' });
    const make = await screen.findAllByRole('button', { name: strings['share.make'] }, SLOW);
    await userEvent.click(make[0] as HTMLElement);
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['link.go'] }));
    expect(await screen.findByText(strings['err.aliasTaken'], {}, SLOW)).toBeTruthy();
    expect(world.aliases.length).toBe(1);
  });
});
