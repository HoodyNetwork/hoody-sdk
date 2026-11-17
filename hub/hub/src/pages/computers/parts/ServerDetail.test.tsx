// The server detail panel on a live page: the real core over a fake fetch, only the places it links to are stubbed.
// It reads and changes nothing (every request is a GET); a missing or failed read falls back to the Servers row.
// eslint-disable-next-line no-restricted-imports -- a test harness for the panel, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { interpolate } from '@kit';
import type { Computer, Server, Subscription } from '../types';
import { ServerDetailBody, ServerDetailDrawer } from './ServerDetail';
import detail from './ServerDetail.strings.en.json';
import strings from '../strings.en.json';
import { links as billingLinks } from '../../billing/links';

const out = vi.hoisted(() => ({ billing: vi.fn(), plans: vi.fn(), has: { billing: true, buy: true } }));
// The kit upgrade piece reads the purchase leaf itself; the rest of core is real.
const gate = vi.hoisted(() => ({ purchase: true }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const can = core.useCan as (cap: string) => boolean;
  return { ...core, useCan: (cap: string) => (cap === 'financial.subscriptions.purchase' ? gate.purchase : can(cap)) };
});
const upgrade = () => screen.queryByRole('link', { name: new RegExp(strings['srv.upgrade']) });
vi.mock('./useOut', () => ({
  useOut: () => ({ ...out, has: out.has, market: () => undefined, guide: () => undefined, sshKeys: () => undefined, logsOf: () => undefined }),
}));

const SID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const RID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const row = (o: Record<string, unknown> = {}) => ({
  id: RID,
  status: 'active',
  rental_end: '2026-12-01T00:00:00.000Z',
  amount: '70.00',
  remaining_days: 38,
  server_id: SID,
  is_free_tier: false,
  server: {
    id: SID,
    name: 'node-7',
    country: 'SG',
    city: 'Singapore',
    datacenter: 'SIN-DC1',
    kvm_supported: false,
    specs: {
      cpu: { model: 'AMD EPYC 7763', cores: 64, threads: 128 },
      ram: { capacity_gb: 256 },
      disks: { total_gb: 2000 },
      additional: { ipv4_count: 5 },
    },
  },
  ...o,
});
/** A row whose server reports its computer room (`server.computer_capacity`). */
const rowCap = (used: number, max: number) => {
  const r = row();
  return { ...r, server: { ...r.server, computer_capacity: { used, max } } };
};
const server: Server = {
  id: SID,
  name: 'node-7',
  place: 'Singapore',
  cc: 'SG',
  cpu: null,
  ram: null,
  disk: null,
  free: false,
  days: 38,
  status: 'active',
  cap: null,
};
const computer = (id: string, name: string, server_id: string): Computer => ({ id, name, status: 'running', project_id: 'p', server_id }) as Computer;
const computers = [computer('0123456789abcdef0000a1b2', 'atlas', SID), computer('0123456789abcdef0000c3d4', 'other', 'eeeeeeeeeeeeeeeeeeeeeeee')];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const wrap = (el: React.ReactElement) => <QueryClientProvider client={queryClient}>{el}</QueryClientProvider>;
const mount = async (el: React.ReactElement) => {
  render(wrap(el));
  await act(flush);
};
const serve = (
  rows: unknown[],
  runtime: { status: number; body: unknown } = {
    status: 200,
    body: { data: { scope: 'server', cpu: { busy_pct: 0.12884237357487155 }, mem: { pct: 41.6 }, storage: { pct: 70 }, stale: false } },
  },
) => onFetch((c) => (c.url.includes('/runtime') ? runtime : { status: 200, body: { data: rows } }));

beforeEach(() => {
  boot();
  queryClient.clear();
  out.billing.mockReset();
  out.plans.mockReset();
  out.has.billing = true;
  out.has.buy = true;
  gate.purchase = true;
});

/** The value cell of the "Allowed to run VMs" fact. */
function kvmCell(): HTMLElement {
  const dd = screen.getByText(detail['sd.kvm']).nextElementSibling;
  if (!(dd instanceof HTMLElement)) throw new Error('no VMs value');
  return dd;
}
const kvmAnswer = () => kvmCell().textContent;

describe('server detail', () => {
  it('shows plan, place, hardware, addresses, time left and whether the server is allowed to run VMs', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(strings['srv.paid'])).toBeInTheDocument();
    expect(screen.getByText('Singapore · SIN-DC1')).toBeInTheDocument();
    expect(screen.getByText(/64 cores · 256 GB RAM · 1.95 TB disk/)).toBeInTheDocument();
    expect(screen.getByText(/AMD EPYC 7763 \(64 cores, 128 threads\)/)).toBeInTheDocument();
    expect(screen.getByText('5 IPv4 addresses')).toBeInTheDocument();
    expect(kvmAnswer()).toBe('No');
    expect(screen.getByText(interpolate(strings['srv.days_other'], { count: 38 }))).toBeInTheDocument();
    expect(screen.getByText('$70.00')).toBeInTheDocument();
    expect(screen.getByText('Dec 1, 2026')).toBeInTheDocument();
  });

  it('the status reads in words and the amount in the money format; an unknown status shows no row, never the raw word', async () => {
    serve([row({ status: 'hold', amount: '1234.50' })]);
    await mount(<ServerDetailBody server={{ ...server, status: 'hold' }} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.status.hold'])).toBeInTheDocument();
    expect(screen.queryByText('hold')).toBeNull();
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    serve([row({ status: 'something_new' })]);
    await mount(<ServerDetailBody server={{ ...server, status: 'something_new' }} computers={computers} subs={[]} />);
    expect(await screen.findByText(strings['srv.paid'])).toBeInTheDocument();
    expect(screen.queryByText(detail['sd.status'])).toBeNull();
    expect(screen.queryByText(/something_new/)).toBeNull();
  });

  it('the disks read in the Hub units: each disk group by formatStorage, never the API summary words', async () => {
    serve([row({ server: { ...row().server, specs: { ...row().server.specs, disks: { config: [{ count: 2, capacity_gb: 1024, type: 'NVMe', interface: 'PCIe' }, { count: 1, capacity_gb: 2000, type: 'HDD' }], total_gb: 4048, summary: '2x1.024TB NVMe + 1x2TB HDD' } } } })]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText('2 × 1 TB NVMe + 1.95 TB HDD')).toBeInTheDocument();
    expect(screen.getByText(/3.95 TB disk/)).toBeInTheDocument();
    expect(screen.queryByText(/2x1\.024TB|1x2TB/)).toBeNull();
  });

  it('a summary without disk groups is shown as given (the one opaque fallback, as in the Market)', async () => {
    serve([row({ server: { ...row().server, specs: { ...row().server.specs, disks: { total_gb: 2000, summary: '1x2TB NVMe' } } } })]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText('1x2TB NVMe')).toBeInTheDocument();
    expect(screen.getByText(/1.95 TB disk/)).toBeInTheDocument();
  });

  it('usage is rounded the page way and says the resources are shared by every computer', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(interpolate(strings['usage.cpu'], { pct: '0.1' }))).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['usage.mem'], { pct: '42' }))).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['usage.shared'], { server: 'node-7' }))).toBeInTheDocument();
    expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(3);
  });

  it('lists only the computers on this server, each a link to it', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    const link = await screen.findByRole('link', { name: /atlas/ });
    expect(link.getAttribute('href')).toContain('/computers?sel=atlas.');
    expect(screen.queryByRole('link', { name: /other/ })).toBeNull();
  });

  it('a server with no computer of yours says so', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={[]} subs={[]} />);
    expect(await screen.findByText(detail['sd.computersNone'])).toBeInTheDocument();
  });

  it('a runtime that cannot be read says live usage is not available, the rest stays', async () => {
    serve([row()], { status: 409, body: { message: 'shared' } });
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.usageNone'])).toBeInTheDocument();
    expect(screen.getByText('Singapore · SIN-DC1')).toBeInTheDocument();
  });

  it('a failed list read keeps the Servers row and says the detail could not be read', async () => {
    onFetch(() => ({ status: 500, body: { message: 'down' } }));
    await mount(<ServerDetailBody server={{ ...server, cpu: 8, ram: 16, disk: 100 }} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.basic'])).toBeInTheDocument();
    expect(screen.getByText(/8 cores · 16 GB RAM · 100 GB disk/)).toBeInTheDocument();
  });

  it('VMs read as a capability, Yes in the ok tone, No neutral; a reason only where the data proves one', async () => {
    serve([row({ server: { ...row().server, kvm_supported: true } })]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    await screen.findByText(detail['sd.kvm']);
    expect(kvmAnswer()).toBe('Yes');
    expect(kvmCell().querySelector('.ok')).not.toBeNull();
    cleanup();
    queryClient.clear();
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    await screen.findByText(detail['sd.kvm']);
    expect(kvmAnswer()).toBe('No');
    expect(kvmCell().querySelector('.neutral')).not.toBeNull();
    expect(kvmCell().querySelector('.danger, .warn, .ok')).toBeNull();
    expect(screen.queryByText(detail['sd.kvmNoFree'], { exact: false })).toBeNull();
    cleanup();
    queryClient.clear();
    serve([row({ is_free_tier: true, rental_end: '2099-01-01T00:00:00.000Z', remaining_days: 99999 })]);
    await mount(<ServerDetailBody server={{ ...server, free: true, days: null }} computers={computers} subs={[]} />);
    await screen.findByText(detail['sd.kvm']);
    expect(kvmCell().textContent).toBe(`No ${detail['sd.kvmNoFree']}`);
    expect(kvmCell().querySelector('.neutral')).not.toBeNull();
    expect(kvmCell().querySelector('.danger, .warn, .ok')).toBeNull();
    expect(screen.queryByText(/Full virtual machines/)).toBeNull();
    // Not known (null, or no field at all): no row, never a guessed No.
    for (const srv of [{ ...row().server, kvm_supported: null }, (({ kvm_supported: _k, ...rest }) => rest)(row().server)]) {
      cleanup();
      queryClient.clear();
      serve([row({ server: srv })]);
      await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
      expect(await screen.findByText('Singapore · SIN-DC1')).toBeInTheDocument();
      expect(screen.queryByText(detail['sd.kvm'])).toBeNull();
    }
  });

  it('a free server has nothing to renew and offers the plans', async () => {
    serve([row({ is_free_tier: true, rental_end: '2099-01-01T00:00:00.000Z', remaining_days: 99999 })]);
    await mount(<ServerDetailBody server={{ ...server, free: true, days: null }} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.freeNoRenew'])).toBeInTheDocument();
    expect(screen.queryByText(detail['sd.paidUntil'])).toBeNull();
    // A free slice: the quiet upgrade to the plans.
    expect(upgrade()).toHaveAttribute('href', billingLinks.plans);
    expect(upgrade()).toHaveAttribute('data-upgrade', 'quiet');
  });

  it('a paid slice gets the upgrade only near or at its limit: full when full, near from 75 %, none below', async () => {
    serve([rowCap(3, 3)]);
    await mount(<ServerDetailBody server={{ ...server, cap: { used: 3, max: 3 } }} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(upgrade()).toHaveAttribute('data-upgrade', 'full');
    cleanup();
    queryClient.clear();
    serve([rowCap(3, 4)]);
    await mount(<ServerDetailBody server={{ ...server, cap: { used: 3, max: 4 } }} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(upgrade()).toHaveAttribute('data-upgrade', 'near');
    cleanup();
    queryClient.clear();
    serve([rowCap(1, 4)]);
    await mount(<ServerDetailBody server={{ ...server, cap: { used: 1, max: 4 } }} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(upgrade()).toBeNull();
  });

  it('a whole machine gets no upgrade, even full', async () => {
    serve([rowCap(3, 3)]);
    await mount(<ServerDetailBody server={{ ...server, kind: 'metal', cap: { used: 3, max: 3 } }} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(upgrade()).toBeNull();
  });

  it('an overdue subscription shows its state and Pay now goes to billing; nothing is sent from here', async () => {
    serve([row()]);
    const sub: Subscription = { id: 's1', state: 'past_due', server_name: 'node-7', paid_through: '2026-10-20T00:00:00.000Z', auto_renew: true };
    await mount(<ServerDetailBody server={server} computers={computers} subs={[sub]} />);
    expect(await screen.findByText(strings['sub.stPastDue'])).toBeInTheDocument();
    expect(screen.getByText(interpolate(strings['sub.renews'], { date: 'Oct 20, 2026' }))).toBeInTheDocument();
    screen.getByRole('button', { name: strings['sub.payNow'] }).click();
    expect(out.billing).toHaveBeenCalledTimes(1);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('with no billing page to go to, no billing button is offered', async () => {
    out.has.billing = false;
    out.has.buy = false;
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    await screen.findByText(strings['srv.paid']);
    expect(screen.queryByRole('button', { name: detail['sd.billingOpen'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['sub.payNow'] })).toBeNull();
  });

  it('a session that may not buy gets no Upgrade and no Pay now; Open billing stays (it only reads)', async () => {
    out.has.buy = false;
    gate.purchase = false;
    serve([row({ is_free_tier: true, rental_end: '2099-01-01T00:00:00.000Z', remaining_days: 99999 })]);
    await mount(<ServerDetailBody server={{ ...server, free: true, days: null }} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.freeNoRenew'])).toBeInTheDocument();
    expect(upgrade()).toBeNull();
    cleanup();
    queryClient.clear();
    serve([row()]);
    const sub: Subscription = { id: 's1', state: 'past_due', server_name: 'node-7', paid_through: '2026-10-20T00:00:00.000Z', auto_renew: true };
    await mount(<ServerDetailBody server={server} computers={computers} subs={[sub]} />);
    expect(await screen.findByText(strings['sub.stPastDue'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['sub.payNow'] })).toBeNull();
    expect(screen.getByRole('button', { name: detail['sd.billingOpen'] })).toBeInTheDocument();
  });

  it('a full server says so', async () => {
    serve([row({ server: { ...row().server, computer_capacity: { used: 3, max: 3 } } })]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(strings['srv.capFull'])).toBeInTheDocument();
  });

  it('the drawer carries the server name and reads nothing while closed', async () => {
    serve([row()]);
    await mount(<ServerDetailDrawer server={server} computers={computers} subs={[]} isOpen={false} onOpenChange={() => undefined} />);
    expect(calls).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    await mount(<ServerDetailDrawer server={server} computers={computers} subs={[]} isOpen onOpenChange={() => undefined} />);
    const dialog = await screen.findByRole('dialog', { name: 'node-7' });
    expect(within(dialog).getByText(strings['srv.paid'])).toBeInTheDocument();
  });

  it('opening an old row of a server shows that row, not the newer rental, and reads its runtime', async () => {
    const OLD = '1'.repeat(24);
    const old = row({ id: OLD, status: 'expired', rental_end: '2026-01-01T00:00:00.000Z', remaining_days: 0, amount: '55.00' });
    serve([row(), old]);
    await mount(<ServerDetailBody server={server} rentalId={OLD} computers={computers} subs={[]} />);
    expect(await screen.findByText('$55.00')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2026')).toBeInTheDocument();
    expect(screen.queryByText('$70.00')).toBeNull();
    expect(calls.some((c) => c.url.includes(`/rentals/${OLD}/runtime`))).toBe(true);
    expect(calls.some((c) => c.url.includes(`/rentals/${RID}/runtime`))).toBe(false);
  });

  it('a runtime refresh that fails does not leave the older readings up as current', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(interpolate(strings['usage.mem'], { pct: '42' }))).toBeInTheDocument();
    serve([row()], { status: 409, body: { message: 'shared' } });
    await act(async () => {
      await queryClient.refetchQueries();
      await flush();
    });
    expect(await screen.findByText(detail['sd.usageNone'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['usage.mem'], { pct: '42' }))).toBeNull();
  });

  it('a list that does not hold the server says the detail is only what the Servers view knew', async () => {
    serve([]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(detail['sd.missing'])).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/runtime'))).toBe(false);
  });

  it('computers and subscriptions that are not known are not said to be none', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={undefined} subs={undefined} />);
    expect(await screen.findByText(detail['sd.computersUnknown'])).toBeInTheDocument();
    expect(screen.getByText(detail['sd.subUnknown'])).toBeInTheDocument();
    expect(screen.queryByText(detail['sd.computersNone'])).toBeNull();
    expect(screen.queryByText(detail['sd.noSub'])).toBeNull();
  });
});

// A calm Verdict plate on top, one Section kind, the loose fallback lines as Facts rows, a
// Section note or a Section state.
describe('server detail: Verdict plate and one Section kind', () => {
  const plate = () => screen.getByRole('group', { name: detail['sd.verdictLabel'] });

  it('the plate says the room left on a server with room', async () => {
    serve([rowCap(1, 3)]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    expect(await screen.findByText(interpolate(detail['sd.verdict.room_other'], { count: 2 }))).toBeInTheDocument();
    expect(plate()).toHaveTextContent(interpolate(detail['sd.verdict.room_other'], { count: 2 }));
  });

  it('a full server is the plate\'s one marked phrase', async () => {
    serve([rowCap(3, 3)]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    const mark = await screen.findByText(strings['srv.capFull']);
    expect(plate()).toContainElement(mark);
    expect(plate().querySelectorAll('[data-verdict-mark]')).toHaveLength(1);
  });

  it('a detail that cannot be read is said in the plate, not in a loose line', async () => {
    onFetch(() => ({ status: 500, body: { message: 'down' } }));
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    const said = await screen.findByText(detail['sd.basic']);
    expect(plate()).toContainElement(said);
    expect(said.closest('[data-verdict-mark]')).not.toBeNull();
  });

  it('every block is the one Section kind (AnatomySection, as Server control is): an anchor and its own heading', async () => {
    serve([row()]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    const ids = { 'server-about': 'sd.about', 'server-usage': 'sd.usage', 'server-computers': 'sd.computers', 'server-billing': 'sd.billing' } as const;
    for (const [id, k] of Object.entries(ids)) {
      const sec = document.getElementById(id);
      expect(sec).not.toBeNull();
      expect(within(sec as HTMLElement).getByRole('heading', { name: detail[k] })).toBeInTheDocument();
    }
  });

  it('subscription and renewal fallbacks are Facts rows, not loose lines', async () => {
    serve([row({ rental_end: null, amount: null, remaining_days: null })]);
    await mount(<ServerDetailBody server={server} computers={computers} subs={[]} />);
    const none = await screen.findByText(detail['sd.noSub']);
    expect(none.closest('dd')).not.toBeNull();
    expect(none.closest('dl')).toHaveAttribute('aria-label', detail['sd.billing']);
  });

  it('a free server has one billing row: nothing to renew', async () => {
    serve([row({ is_free_tier: true })]);
    await mount(<ServerDetailBody server={{ ...server, free: true }} computers={computers} subs={[]} />);
    const only = await screen.findByText(detail['sd.freeNoRenew']);
    expect(only.closest('dd')).not.toBeNull();
    expect(only.closest('dl')?.querySelectorAll('dd')).toHaveLength(1);
  });
});
