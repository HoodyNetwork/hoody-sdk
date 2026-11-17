// A refused send's wait on a live page: a 429 says when to try again, as the API named it (the Retry-After header, else
// the body's retry_after), and a refusal that names none says only that nothing ran. Core hands the page the wait as retryAfter.
// eslint-disable-next-line no-restricted-imports -- a test harness for the panel, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import { interpolate } from '@kit';
import type { Computer, Server } from '../types';
import { ServerDetailBody } from './ServerDetail';
import detail from './ServerDetail.strings.en.json';
import strings from '../strings.en.json';

const out = vi.hoisted(() => ({ billing: vi.fn(), plans: vi.fn(), has: { billing: true, buy: true } }));
vi.mock('./useOut', () => ({
  useOut: () => ({ ...out, has: out.has, market: () => undefined, guide: () => undefined, sshKeys: () => undefined, logsOf: () => undefined }),
}));
// A token session sees no commands ('account' is never part of its access).
const session = { account: true };
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const realCan = real.useCan as (cap: string) => boolean;
  const useCan = (cap: string): boolean => {
    const held = realCan(cap);
    return cap === 'account' ? session.account : held;
  };
  return { ...real, useCan };
});

const SID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const RID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const UP = '1'.repeat(24);
const REBOOT = '2'.repeat(24);
const row = (o: Record<string, unknown> = {}, sv: Record<string, unknown> = {}) => ({
  id: RID,
  status: 'active',
  rental_end: '2026-12-01T00:00:00.000Z',
  amount: '70.00',
  remaining_days: 38,
  server_id: SID,
  is_free_tier: false,
  server: { id: SID, name: 'node-7', country: 'SG', city: 'Singapore', datacenter: 'SIN-DC1', is_vm: false, kvm_supported: true, specs: { cpu: { cores: 64 } }, ...sv },
  ...o,
});
const server: Server = { id: SID, name: 'node-7', place: 'Singapore', cc: 'SG', cpu: null, ram: null, disk: null, free: false, days: 38, status: 'active', cap: null };
const computer = (id: string, name: string, server_id: string): Computer => ({ id, name, status: 'running', project_id: 'p', server_id }) as Computer;
const computers = [computer('0123456789abcdef0000a1b2', 'atlas', SID), computer('0123456789abcdef0000c3d4', 'borealis', SID)];

const uptime = { id: UP, name: 'Uptime', slug: 'check-uptime', description: 'Get system uptime', risk_level: 'low', requires_confirmation: false, parameter_schema: null };
const reboot = { id: REBOOT, name: 'Immediate Reboot (Kexec)', slug: 'kexec-reboot', description: 'Immediate kernel reboot', risk_level: 'critical', requires_confirmation: true, parameter_schema: null };
const info = { id: SID, name: 'node-7', is_ready: true, rental_status: 'active' };

const world = {
  rows: [row()] as unknown[],
  commands: [uptime, reboot] as unknown[],
  info: info as Record<string, unknown>,
  uptime: 90_000 as number | null,
  runtimeStale: false,
  exec: ((): Reply => ({ status: 200, body: { data: { status: 'completed', output: '{"uptime_seconds": 90000}', exit_code: 0 } } })) as () => Reply,
};
const serve = () =>
  onFetch((c) => {
    if (c.method === 'POST' && c.url.includes('/execute-command')) return world.exec();
    if (c.url.includes('/available-commands')) return { status: 200, body: { data: { commands: world.commands, server_info: world.info } } };
    if (c.url.includes('/runtime')) return { status: 200, body: { data: { scope: 'server', uptime_s: world.uptime, cpu: { busy_pct: 1 }, mem: { pct: 4 }, storage: { pct: 7 }, stale: world.runtimeStale } } };
    return { status: 200, body: { data: world.rows } };
  });
const posts = () => calls.filter((c) => c.method === 'POST');

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const body = <ServerDetailBody server={server} computers={computers} subs={[]} />;
const mount = async () => {
  render(<QueryClientProvider client={queryClient}>{body}</QueryClientProvider>);
  await act(flush);
};
const press = async (name: string) => {
  await userEvent.click(await screen.findByRole('button', { name }));
  await act(flush);
};
const runBtn = (n: string) => interpolate(detail['sd.cmd.runNamed'], { name: n });
const held = () => screen.queryByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }));

beforeEach(() => {
  cleanup();
  boot();
  queryClient.clear();
  out.has.billing = true;
  session.account = true;
  world.rows = [row()];
  world.commands = [uptime, reboot];
  world.info = info;
  world.uptime = 90_000;
  world.runtimeStale = false;
  world.exec = () => ({ status: 200, body: { data: { status: 'completed', output: '{"uptime_seconds": 90000}', exit_code: 0 } } });
  serve();
});

describe('server control: when to try again', () => {
  const tooMany = (extra: Partial<Reply> = {}, data: Record<string, unknown> = { retry_after: 90, rate_limit_type: 'hourly' }): (() => Reply) => () => ({
    status: 429,
    body: { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded for this command', data },
    ...extra,
  });
  const limitIn = (wait: string) => interpolate(detail['sd.cmd.refused.limitIn'], { command: 'Uptime', wait });

  it('a 429 says when to try again, from the body\'s retry_after, rounded up to the unit it fills', async () => {
    world.exec = tooMany();
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(limitIn('2 minutes'))).toBeInTheDocument();
    expect(screen.queryByText(strings['held.check'])).toBeNull();
    expect(screen.getByRole('button', { name: runBtn('Uptime') })).not.toHaveAttribute('aria-disabled');
    expect(posts()).toHaveLength(1);
  });

  it('the Retry-After header wins over the body, and an hour or more reads in hours', async () => {
    world.exec = tooMany({ headers: { 'retry-after': '30' } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(limitIn('30 seconds'))).toBeInTheDocument();
    cleanup();
    boot();
    queryClient.clear();
    serve();
    world.exec = tooMany({}, { retry_after: 3600 });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(limitIn('1 hour'))).toBeInTheDocument();
  });

  it('a 429 that names no wait, or a wait that is not a number, says only that it is too often and nothing ran', async () => {
    for (const data of [{}, { retry_after: 'soon' }, { retry_after: -5 }]) {
      cleanup();
      boot();
      queryClient.clear();
      serve();
      world.exec = tooMany({}, data);
      await mount();
      await press(runBtn('Uptime'));
      expect(await screen.findByText(interpolate(detail['sd.cmd.refused.limit'], { command: 'Uptime' }))).toBeInTheDocument();
      expect(screen.queryByText(/Try again in about/)).toBeNull();
    }
  });

  it('a refused reboot shows the wait too, and is never held', async () => {
    world.exec = tooMany();
    await mount();
    await screen.findByText('Get system uptime');
    await press(detail['sd.cmd.restart.run']);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) }));
    await act(flush);
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.limitIn'], { command: reboot.name, wait: '2 minutes' }))).toBeInTheDocument();
    expect(held()).toBeNull();
    expect(screen.getByRole('button', { name: detail['sd.cmd.restart.run'] })).not.toHaveAttribute('aria-disabled');
  });
});
