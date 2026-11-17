// Where the room upgrade shows on the Computers list and detail. The summary strip's slots,
// the Overview beside the size (its first size fact, CPU) or under the usage tiles, never both, a card only near or full and the create form's
// quiet line. The server each place reads is set per test; who may see the piece is the kit's gate.
import { definePage } from '@kit';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localSetting } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { links as billingLinks } from '../billing/links';
import { computers } from './fixtures';
import { serverKey, serverLabel } from './logic';
import page from './page';
import { ComputerCard } from './parts/ComputerCard';
import { CreateDrawer } from './parts/CreateDrawer';
import { Overview } from './parts/Overview';
import { StatStrip } from './parts/StatStrip';
import strings from './strings.en.json';
import type { Computer, Server, Usage } from './types';
import type { useServerOf as UseServerOf } from './parts/useServerOf';

const world = vi.hoisted(() => ({
  server: undefined as Server | undefined,
  /** True: the Overview reads its server through the real hook (from `servers`), not `server`. */
  realServer: false,
  usage: undefined as Usage | undefined,
  usageState: { isPending: false, isError: false },
  servers: undefined as Server[] | undefined,
  all: undefined as Record<string, Usage | null> | undefined,
}));
vi.mock('./parts/useServerOf', async (orig) => {
  const real = await orig<{ useServerOf: typeof UseServerOf }>();
  return {
    useServerOf: (c: Computer) => {
      const found = real.useServerOf(c);
      return world.realServer ? found : world.server;
    },
  };
});
vi.mock('./data', async (orig) => {
  const data = await orig<Record<string, unknown>>();
  const useServers = data.useServers as () => unknown;
  const useAllUsage = data.useAllUsage as (on: boolean) => unknown;
  return {
    ...data,
    useUsage: () => ({ data: world.usage, ...world.usageState, refetch: async () => undefined }),
    // The page-level card test sets the list's servers and every computer's reading; other tests keep the fixtures.
    // The real hooks always run (hook order), and a set value replaces their answer.
    useServers: () => {
      const real = useServers();
      return world.servers ? { data: world.servers, isPending: false, isError: false, error: null, refetch: async () => undefined } : real;
    },
    useAllUsage: (on: boolean) => {
      const real = useAllUsage(on);
      return world.all ? { data: on ? world.all : undefined, isPending: false, isError: false, refetch: async () => undefined } : real;
    },
  };
});
afterEach(() => {
  world.server = undefined;
  world.realServer = false;
  world.usage = undefined;
  world.usageState = { isPending: false, isError: false };
  world.servers = undefined;
  world.all = undefined;
  localSetting('hub.v3.table.present.machines').set(null);
});

const T = 8000;
const PAGE_T = 25000;
const srv = (x: Partial<Server>): Server => ({ id: 's1', name: 'node-1', place: '', cpu: 4, ram: 8, disk: 100, free: false, days: 30, status: 'active', cap: { used: 1, max: 4 }, kind: 'subserver', ...x });
const use = (pct: number): Usage => ({ cpu: pct, mem: { used: 1, total: 8 }, disk: { used: 1, total: 100 }, at: '2026-11-03T00:00:00Z' });
const link = (label: string) => screen.queryByRole('link', { name: new RegExp(label) });
const room = () => link(strings['srv.upgrade']);
const power = () => link(strings['ov.upgrade']);

async function mount(node: ReactNode) {
  const Harness = () => <>{node}</>;
  const p = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
  await renderPage(p, { path: '/computers' });
}

describe('the summary strip\'s slots', () => {
  it('a free slice among the servers: the quiet link to the plans, under the slots', async () => {
    await mount(<StatStrip computers={computers} servers={[srv({ free: true, kind: 'free' })]} />);
    await screen.findByText(strings['strip.slots'], undefined, { timeout: T });
    expect(room()).toHaveAttribute('data-upgrade', 'quiet');
    // The page router is hash-based here, so the link carries the billing path after its #.
    expect(room()?.getAttribute('href')).toContain(billingLinks.plans);
  });

  it('paid slices below 75 %: none', async () => {
    await mount(<StatStrip computers={computers} servers={[srv({ cap: { used: 2, max: 4 } })]} />);
    await screen.findByText(strings['strip.slots'], undefined, { timeout: T });
    expect(room()).toBeNull();
  });

  it('a full shared server beside an empty whole machine: the shown 4 of 44 and the link agree (no "Full")', async () => {
    await mount(<StatStrip computers={computers} servers={[srv({ cap: { used: 4, max: 4 } }), srv({ id: 'm', name: 'metal-1', kind: 'metal', cap: { used: 0, max: 40 } })]} />);
    await screen.findByText(strings['strip.slots'], undefined, { timeout: T });
    expect(screen.getByText(strings['srv.capOf'].replace('{{used}}', '4').replace('{{max}}', '44'))).toBeInTheDocument();
    expect(room()).toBeNull();
  });

  it('paid slices at 75 %: near', async () => {
    await mount(<StatStrip computers={computers} servers={[srv({ cap: { used: 3, max: 4 } })]} />);
    await screen.findByText(strings['strip.slots'], undefined, { timeout: T });
    expect(room()).toHaveAttribute('data-upgrade', 'near');
  });
});

describe('the Overview, one place only', () => {
  const c = computers.find((x) => x.status === 'running') ?? computers[0]!;
  const overview = (usageOn: boolean) => <Overview c={c} projects={undefined} realms={undefined} usageOn={usageOn} onUsageOn={() => {}} canStart={false} onStart={() => {}} />;
  const sizeRow = () => screen.getByText(strings['ov.cpu'], { selector: 'dt' }).nextElementSibling as HTMLElement;
  const usageSection = () => screen.getByRole('heading', { name: strings['ov.status'] }).closest('section') as HTMLElement;

  it('a free slice: quiet, beside Size', async () => {
    world.server = srv({ free: true, kind: 'free' });
    await mount(overview(false));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(sizeRow()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveAttribute('data-upgrade', 'quiet');
    expect(screen.getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('a usage tile at 75 % or more moves it under the tiles, near, and Size no longer has it', async () => {
    world.server = srv({ free: true, kind: 'free' });
    world.usage = use(80);
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(usageSection()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveAttribute('data-upgrade', 'near');
    expect(within(sizeRow()).queryByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toBeNull();
    expect(screen.getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('a free slice with the usage tiles shown, all below 75 %: still beside Size, not under the tiles', async () => {
    world.server = srv({ free: true, kind: 'free' });
    world.usage = use(40);
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(sizeRow()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveAttribute('data-upgrade', 'quiet');
    // The tiles share the Status and usage section with the size facts: the one link is the one beside the size.
    expect(screen.getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('a refetch still pending over an old reading at 80 %: the tiles are not drawn, so it stays beside Size', async () => {
    world.server = srv({ free: true, kind: 'free' });
    world.usage = use(80);
    world.usageState = { isPending: true, isError: false };
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(sizeRow()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('a failed refetch that keeps an old reading at 80 %: the error shows, and the link stays beside Size', async () => {
    world.server = srv({ free: true, kind: 'free' });
    world.usage = use(80);
    world.usageState = { isPending: false, isError: true };
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(usageSection()).getByText(strings['usage.failed'])).toBeInTheDocument();
    expect(within(sizeRow()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('through the real server hook: the server the servers read gives for this computer (a free slice) gives the quiet link', async () => {
    world.realServer = true;
    world.servers = [srv({ id: serverKey(c), name: serverLabel(c).name, free: true, kind: 'free' })];
    await mount(overview(false));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(within(sizeRow()).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveAttribute('data-upgrade', 'quiet');
  });

  it('a paid slice with every tile below 75 %: none', async () => {
    world.server = srv({});
    world.usage = use(40);
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(power()).toBeNull();
  });

  it('a whole machine at 99 %: none', async () => {
    world.server = srv({ kind: 'metal' });
    world.usage = use(99);
    await mount(overview(true));
    await screen.findByText(strings['ov.cpu'], { selector: 'dt' }, { timeout: T });
    expect(power()).toBeNull();
  });
});

describe('a computer card only near or full', () => {
  const c = computers.find((x) => x.status === 'running') ?? computers[0]!;
  // The list hands each card its server (the card reads no data of its own).
  const card = (u: Usage | null, server: Server | undefined) => <ComputerCard computer={c} projects={undefined} realms={undefined} caps="all" current={false} op={undefined} usage={u} showUsage server={server} onAction={() => {}} check={null} menu={null} />;

  it('a bar at 75 % or more: near, inside the card; one only', async () => {
    await mount(card(use(80), srv({ free: true, kind: 'free' })));
    const art = await screen.findByRole('article', { name: c.name }, { timeout: T });
    expect(within(art).getByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveAttribute('data-upgrade', 'near');
    expect(within(art).getAllByRole('link', { name: new RegExp(strings['ov.upgrade']) })).toHaveLength(1);
  });

  it('a free slice below 75 % gets none (never quiet on a card)', async () => {
    await mount(card(use(60), srv({ free: true, kind: 'free' })));
    await screen.findByRole('article', { name: c.name }, { timeout: T });
    expect(power()).toBeNull();
  });

  it('a server the list does not carry (yet): none', async () => {
    await mount(card(use(100), undefined));
    await screen.findByRole('article', { name: c.name }, { timeout: T });
    expect(power()).toBeNull();
  });

  it('on the page, the list hands each card its server: a card at 90 % on a free slice shows near', async () => {
    world.servers = [srv({ id: serverKey(c), name: serverLabel(c).name, free: true, kind: 'free' })];
    world.all = Object.fromEntries(computers.map((x) => [x.id, use(90)]));
    localSetting('hub.v3.table.present.machines').set('cards');
    await renderPage(page, { path: '/computers' });
    // The whole page loads here (its lists and lazy parts), so it gets a longer wait than a harness render.
    await screen.findByRole('article', { name: c.name }, { timeout: PAGE_T });
    await userEvent.click(screen.getByRole('switch', { name: strings['usage.show'] }));
    const art = await screen.findByRole('article', { name: c.name }, { timeout: PAGE_T });
    expect(await within(art).findByRole('link', { name: new RegExp(strings['ov.upgrade']) }, { timeout: PAGE_T })).toHaveAttribute('data-upgrade', 'near');
  }, 90000);

  it('a whole machine at 100 %: none', async () => {
    await mount(card(use(100), srv({ kind: 'metal' })));
    await screen.findByRole('article', { name: c.name }, { timeout: T });
    expect(power()).toBeNull();
  });
});

describe('the create form\'s quiet line', () => {
  const drawer = (servers: Server[]) => <CreateDrawer isOpen servers={servers} serversError={false} projects={undefined} realms={undefined} onClose={() => {}} onDone={() => {}} />;

  it('a full server among them: quiet, to the plans', async () => {
    await mount(drawer([srv({}), srv({ id: 's2', name: 'node-2', cap: { used: 4, max: 4 } })]));
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: T });
    const l = within(d).getByRole('link', { name: new RegExp(strings['srv.upgrade']) });
    expect(l).toHaveAttribute('data-upgrade', 'quiet');
    expect(l.getAttribute('href')).toContain(billingLinks.plans);
  });

  it('room on every server: none', async () => {
    await mount(drawer([srv({})]));
    const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: T });
    expect(within(d).queryByRole('link', { name: new RegExp(strings['srv.upgrade']) })).toBeNull();
  });
});
