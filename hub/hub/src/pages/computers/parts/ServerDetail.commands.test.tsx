// The server control commands on a live page: the real core over a fake fetch. A run is sent once: nothing before the
// warned confirm, a lost answer is held ("may have run", never failed, never resent), no read ever frees a hold (a fresh boot
// time proves nothing about this send), and only a person's warned Dismiss frees it.
// eslint-disable-next-line no-restricted-imports -- a test harness for the panel, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle, type Reply } from '@core/test/env';
import { interpolate } from '@kit';
import type { Computer, Server } from '../types';
import { ServerDetailBody } from './ServerDetail';
import detail from './ServerDetail.strings.en.json';
import strings from '../strings.en.json';
import kitStrings from '@kit/strings.en.json';

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
const reboot = { id: REBOOT, name: 'Immediate Reboot (Kexec)', slug: 'kexec-reboot', description: 'Immediate kernel reboot', risk_level: 'critical', requires_confirmation: true, cooldown_seconds: 600, rate_limit_per_day: 1, parameter_schema: null };
const info = { id: SID, name: 'node-7', is_ready: true, rental_status: 'active' };

const world = {
  rows: [row()] as unknown[],
  commands: [uptime, reboot] as unknown[],
  info: info as Record<string, unknown>,
  uptime: 90_000 as number | null,
  /** The start of the test on the API's clock; runtime times are offsets from it. */
  t0: 0,
  /** When the runtime figures were collected (the API's ts); null: just now, on every read. */
  ts: null as number | null,
  runtimeStale: false,
  runtimeDown: false,
  /** Another server's runtime, by rental id: [uptime_s, ts]. */
  other: {} as Record<string, [number, number]>,
  exec: ((): Reply => ({ status: 200, body: { data: { status: 'completed', output: '{"uptime_seconds": 90000}', exit_code: 0 } } })) as () => Reply,
};
const serve = () =>
  onFetch((c) => {
    if (c.method === 'POST' && c.url.includes('/execute-command')) return world.exec();
    if (c.url.includes('/available-commands')) return { status: 200, body: { data: { commands: world.commands, server_info: world.info } } };
    if (c.url.includes('/runtime')) {
      if (world.runtimeDown) return { status: 503, body: { message: 'down' } };
      const o = Object.entries(world.other).find(([id]) => c.url.includes(id))?.[1];
      return { status: 200, body: { data: { scope: 'server', uptime_s: o ? o[0] : world.uptime, ts: new Date(o ? o[1] : (world.ts ?? Date.now())).toISOString(), cpu: { busy_pct: 1 }, mem: { pct: 4 }, storage: { pct: 7 }, stale: world.runtimeStale } } };
    }
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
const restartBtn = detail['sd.cmd.restart.run'];
/** A Run the panel offers but will not act on: it stays focusable and says why (kit ReasonButton). */
const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
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
  world.t0 = Date.now();
  world.ts = null;
  world.other = {};
  world.runtimeStale = false;
  world.runtimeDown = false;
  world.exec = () => ({ status: 200, body: { data: { status: 'completed', output: '{"uptime_seconds": 90000}', exit_code: 0 } } });
  serve();
});

describe('server control', () => {
  it('lists what the API offers as actions, and a reading runs once, waits, and shows its output', async () => {
    await mount();
    expect(await screen.findByText('Get system uptime')).toBeInTheDocument();
    expect(screen.queryByText('Critical')).toBeNull();
    await press(runBtn('Uptime'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.url).toContain(`/servers/${SID}/execute-command`);
    expect(posts()[0]?.body).toEqual({ command_id: UP, parameters: {}, wait: true });
    expect(await screen.findByText('{"uptime_seconds": 90000}')).toBeInTheDocument();
  });

  it('a finished reading says it finished, and one that did not finish cleanly says so; neither shows the raw run status', async () => {
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.out.ok'], { command: 'Uptime' }))).toBeInTheDocument();
    expect(screen.queryByText(/completed/)).toBeNull();
    cleanup();
    queryClient.clear();
    world.exec = () => ({ status: 200, body: { data: { status: 'failed', output: 'no', exit_code: 1 } } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.out.bad'], { command: 'Uptime' }))).toBeInTheDocument();
    expect(screen.queryByText(/failed|\?\./)).toBeNull();
  });

  it('a refusal the API gives no reason for says nothing ran and to try again later', async () => {
    world.exec = () => ({ status: 400, body: { statusCode: 400, error: 'SOMETHING_ELSE', code: 'SOMETHING_ELSE', message: 'no', data: {} } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.generic'], { command: 'Uptime' }))).toBeInTheDocument();
    expect(detail['sd.cmd.refused.generic']).toMatch(/Try again later\. Nothing was run\.$/);
  });

  it('a restart sends nothing until the warned confirm, which names the server and says every computer on it goes down', async () => {
    await mount();
    await press(restartBtn);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(interpolate(detail['sd.cmd.confirm.title'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    expect(within(dialog).getByText(/Every computer on it goes down/)).toBeInTheDocument();
    expect(within(dialog).getByText(interpolate(detail['sd.cmd.confirm.on_other'], { count: 2 }))).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: (n, el) => /^(Cancel|Close)$/.test(n) && !el.hasAttribute('data-dialog-close') }));
    await act(flush);
    expect(posts()).toHaveLength(0);
  });

  it('a confirmed restart is sent once, accepted without waiting, and said to run on its own', async () => {
    world.exec = () => ({ status: 202, body: { data: { command_log_id: 'x', status: 'pending' } } });
    await mount();
    await press(restartBtn);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) }));
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body).toEqual({ command_id: REBOOT, parameters: {}, wait: false });
    expect(await screen.findByText(interpolate(detail['sd.cmd.accepted'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    expect(held()).toBeNull();
  });

  const sendRebootLost = async (reply: Reply) => {
    world.exec = () => reply;
    await mount();
    await screen.findByText('Get system uptime');
    await press(restartBtn);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) }));
    await act(flush);
  };

  it('a lost answer or a 5xx is "may have run", never failed, and nothing is sent again by Check again', async () => {
    for (const reply of [{ status: 500, body: { message: 'x' } }, { status: 200, network: true }] as Reply[]) {
      cleanup();
      boot();
      queryClient.clear();
      serve();
      await sendRebootLost(reply);
      expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
      expect(screen.queryByText(/did not accept|Nothing was run/)).toBeNull();
      expect(isOff(screen.getByRole('button', { name: restartBtn }))).toBe(true);
      expect(isOff(screen.getByRole('button', { name: runBtn('Uptime') }))).toBe(true);
      await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
      await act(flush);
      expect(posts()).toHaveLength(1);
    }
  });

  it('the hold is still there after the panel is closed and opened again, and offers no second send', async () => {
    await sendRebootLost({ status: 500, body: { message: 'x' } });
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    cleanup();
    await mount();
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    expect(isOff(screen.getByRole('button', { name: restartBtn }))).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  it('only a warned Dismiss frees what no read proved, and then a new run is possible', async () => {
    await sendRebootLost({ status: 500, body: { message: 'x' } });
    await userEvent.click(await screen.findByRole('button', { name: detail['sd.cmd.stop'] }));
    const ask = await screen.findByRole('alertdialog');
    // The warning names the command and the server it concerns, not only "this".
    expect(within(ask).getByText(interpolate(detail['sd.cmd.dismiss.title'], { command: reboot.name }))).toBeInTheDocument();
    expect(within(ask).getByText(interpolate(detail['sd.cmd.dismiss.body'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    expect(held()).not.toBeNull();
    await userEvent.click(within(ask).getByRole('button', { name: detail['sd.cmd.stopGo'] }));
    await act(flush);
    await waitFor(() => expect(held()).toBeNull());
    expect(isOff(screen.getByRole('button', { name: restartBtn }))).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it('a reading whose answer is lost is held the same way (every run is send-once)', async () => {
    world.exec = () => ({ status: 200, network: true });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: 'Uptime', server: 'node-7' }))).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it('a refusal the API answers is not held: it says nothing ran and the command can be run again', async () => {
    world.exec = () => ({ status: 409, body: { statusCode: 409, error: 'SERVER_COMMAND_COOLDOWN', code: 'SERVER_COMMAND_COOLDOWN', message: 'wait', data: {} } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.cooldown'], { command: 'Uptime' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['held.check'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: runBtn('Uptime') }))).toBe(false);
  });

  it('a 429 is a refusal that says it ran nothing (the "too often" sentence), is not held, and the command can be run again', async () => {
    world.exec = () => ({ status: 429, body: { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded for this command', data: { rate_limit_type: 'hourly' } } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.limit'], { command: 'Uptime' }), { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(strings['held.check'])).toBeNull();
    expect(screen.queryByText(/may already have run/)).toBeNull();
    expect(isOff(screen.getByRole('button', { name: runBtn('Uptime') }))).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it('a cooldown refusal says how long the command waits between runs when the list said so, and nothing was run', async () => {
    world.commands = [{ ...uptime, cooldown_seconds: 300 }];
    world.exec = () => ({ status: 409, body: { statusCode: 409, error: 'SERVER_COMMAND_COOLDOWN', code: 'SERVER_COMMAND_COOLDOWN', message: 'Command cooldown active. Wait 120 seconds.', data: {} } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.cooldownIn'], { command: 'Uptime', wait: '5 minutes' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['held.check'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: runBtn('Uptime') }))).toBe(false);
  });

  it('the hourly and daily limits the API answers as a 409 are the same "too often" refusal, and nothing was run', async () => {
    world.exec = () => ({ status: 409, body: { statusCode: 409, error: 'SERVER_COMMAND_RATE_LIMITED', code: 'SERVER_COMMAND_RATE_LIMITED', message: 'Hourly rate limit exceeded (3/hour).', data: {} } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.refused.limit'], { command: 'Uptime' }), { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(strings['held.check'])).toBeNull();
  });

  it('a command that asks for confirmation is warned even when it is low risk, and a medium-risk one is warned even when it asks for none', async () => {
    world.commands = [
      { ...uptime, id: '4'.repeat(24), slug: 'low-asks', name: 'Low asks', requires_confirmation: true },
      { ...uptime, id: '5'.repeat(24), slug: 'medium-quiet', name: 'Medium quiet', risk_level: 'medium', requires_confirmation: false },
    ];
    await mount();
    for (const name of ['Low asks', 'Medium quiet']) {
      await press(runBtn(name));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(interpolate(detail['sd.cmd.confirm.title'], { command: name, server: 'node-7' }))).toBeInTheDocument();
      expect(posts()).toHaveLength(0);
      await userEvent.click(within(dialog).getByRole('button', { name: (n, el) => /^(Cancel|Close)$/.test(n) && !el.hasAttribute('data-dialog-close') }));
      await act(flush);
    }
    expect(posts()).toHaveLength(0);
  });

  it('the warning says how many of the person\'s computers are on the server, and says so when that is not known', async () => {
    cleanup();
    render(<QueryClientProvider client={queryClient}><ServerDetailBody server={server} computers={[computers[0] as Computer]} subs={[]} /></QueryClientProvider>);
    await act(flush);
    await press(restartBtn);
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(interpolate(detail['sd.cmd.confirm.on_one'], { count: 1 }))).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: (n, el) => /^(Cancel|Close)$/.test(n) && !el.hasAttribute('data-dialog-close') }));
    await act(flush);
    cleanup();
    render(<QueryClientProvider client={queryClient}><ServerDetailBody server={server} computers={undefined} subs={[]} /></QueryClientProvider>);
    await act(flush);
    await press(restartBtn);
    dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(detail['sd.cmd.confirm.unknown'])).toBeInTheDocument();
    expect(within(dialog).getByText(/Every computer on it goes down until the server is back/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a second press while a run is still out sends nothing', async () => {
    world.exec = () => ({ status: 200, delayMs: 150, body: { data: { status: 'completed', output: 'up', exit_code: 0 } } });
    await mount();
    const btn = await screen.findByRole('button', { name: runBtn('Uptime') });
    await userEvent.click(btn);
    await userEvent.click(btn);
    await act(flush);
    await waitFor(() => expect(screen.getByText('up')).toBeInTheDocument());
    expect(posts()).toHaveLength(1);
  });

  it('a command with parameters shows a form, needs its required fields, and sends them', async () => {
    world.commands = [{ ...uptime, id: '3'.repeat(24), slug: 'echo', name: 'Echo', parameter_schema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] } }];
    await mount();
    const btn = await screen.findByRole('button', { name: runBtn('Echo') });
    expect(isOff(btn)).toBe(true);
    await userEvent.type(screen.getByRole('textbox', { name: /word/ }), 'hello');
    const ready = screen.getByRole('button', { name: runBtn('Echo') });
    expect(isOff(ready)).toBe(false);
    await userEvent.click(ready);
    await act(flush);
    expect(posts()[0]?.body).toEqual({ command_id: '3'.repeat(24), parameters: { word: 'hello' }, wait: true });
  });

  it('a server that is not ready, or whose rental is not current, offers the commands disabled and says why', async () => {
    world.info = { ...info, is_ready: false };
    await mount();
    expect((await screen.findAllByText(detail['sd.cmd.notReady'])).length).toBeGreaterThan(0);
    expect(isOff(screen.getByRole('button', { name: runBtn('Uptime') }))).toBe(true);
  });

  it('an empty list says why, and an unreadable one says it could not be read', async () => {
    world.commands = [];
    await mount();
    expect(await screen.findByText(detail['sd.cmd.none'])).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    onFetch((c) => (c.url.includes('/available-commands') ? { status: 500, body: { message: 'down' } } : c.url.includes('/runtime') ? { status: 409, body: {} } : { status: 200, body: { data: world.rows } }));
    await mount();
    expect(await screen.findByText(kitStrings['state.errorTitle'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: runBtn('Uptime') })).toBeNull();
  });

  it('a press while another send of this server is still out (after a remount) says it is still being sent, never "not sent", and sends nothing', async () => {
    world.exec = () => ({ status: 202, delayMs: 2500, body: { data: { command_log_id: 'x', status: 'pending' } } });
    await mount();
    await screen.findByText('Get system uptime');
    await press(restartBtn);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) }));
    // The panel is closed and opened again while the first request is out: nothing here knows of it.
    cleanup();
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.inFlight'], { command: 'Uptime', server: 'node-7' }))).toBeInTheDocument();
    // It says the earlier run may have finished, and sends the person to look before running again.
    expect(screen.getByText(/It may have finished since\..*before running anything again/)).toBeInTheDocument();
    expect(screen.queryByText(/was not sent/)).toBeNull();
    expect(posts()).toHaveLength(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 2600)); });
    await act(flush);
    expect(posts()).toHaveLength(1);
  });

  it('two presses in the same tick send once and do not show "not sent"', async () => {
    world.exec = () => ({ status: 200, delayMs: 200, body: { data: { status: 'completed', output: 'up', exit_code: 0 } } });
    await mount();
    const btn = await screen.findByRole('button', { name: runBtn('Uptime') });
    await act(async () => {
      btn.click();
      btn.click();
    });
    await act(flush);
    expect(screen.queryByText(/still being sent/)).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(screen.queryByText(/was not sent/)).toBeNull();
    expect(screen.queryByText(/still being sent/)).toBeNull();
  });

  it('a confirm that stays open while the server stops being ready sends nothing when it is confirmed, and says so', async () => {
    await mount();
    await screen.findByText('Get system uptime');
    await press(restartBtn);
    const dialog = await screen.findByRole('alertdialog');
    world.info = { ...info, is_ready: false };
    await act(async () => { await queryClient.invalidateQueries(); });
    await act(flush);
    await userEvent.click(within(dialog).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) }));
    await act(flush);
    expect(posts()).toHaveLength(0);
    expect(await screen.findByText(interpolate(detail['sd.cmd.notSent'], { command: reboot.name }))).toBeInTheDocument();
    // It says nothing ran and what to wait for.
    expect(detail['sd.cmd.notSent']).toMatch(/so nothing was run\. Try again once Run is available\.$/);
  });

  it('a server with no computers of the person says so in the warning', async () => {
    cleanup();
    render(<QueryClientProvider client={queryClient}><ServerDetailBody server={server} computers={[]} subs={[]} /></QueryClientProvider>);
    await act(flush);
    await press(restartBtn);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(interpolate(detail['sd.cmd.confirm.on_other'], { count: 0 }))).toBeInTheDocument();
  });

  it('is not offered for a free server, a slice of a shared host, or in an access-token session, and asks nothing there', async () => {
    for (const [rows, account] of [
      [[row({ is_free_tier: true })], true],
      [[row({}, { is_vm: true })], true],
      [[row()], false],
    ] as const) {
      cleanup();
      boot();
      queryClient.clear();
      world.rows = [...rows];
      session.account = account;
      serve();
      await mount();
      await screen.findByText(detail['sd.about']);
      await act(flush);
      expect(screen.queryByText(detail['sd.control'])).toBeNull();
      expect(calls.some((c) => c.url.includes('/available-commands'))).toBe(false);
    }
  });

  it('a held run is never freed by a read, even one that shows the server just restarted, and Check again sends nothing; only the warned Dismiss frees it', async () => {
    await sendRebootLost({ status: 500, body: { message: 'x' } });
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    // The runtime now reads as a fresh boot, collected well after the send: nothing here can say that this send did it.
    world.uptime = 45;
    world.ts = world.t0 + 300_000;
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    await act(flush);
    expect(held()).not.toBeNull();
    expect(screen.getByText(interpolate(detail['sd.cmd.stillUnknown'], { command: reboot.name }))).toBeInTheDocument();
    // The words themselves: nothing proves it ran or did not run, so it stays held.
    expect(screen.getByText(/Nothing here can tell whether .* ran, so it stays held/)).toBeInTheDocument();
    expect(screen.queryByText(/\(Kexec\) did not run\./)).toBeNull();
    expect(isOff(screen.getByRole('button', { name: restartBtn }))).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  it('two panels confirming the same restart at once send it once', async () => {
    world.exec = () => ({ status: 202, delayMs: 3000, body: { data: { command_log_id: 'x', status: 'pending' } } });
    await mount();
    await screen.findByText('Get system uptime');
    render(<QueryClientProvider client={queryClient}>{body}</QueryClientProvider>);
    await act(flush);
    const buttons = await screen.findAllByRole('button', { name: restartBtn });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0] as HTMLElement);
    await act(flush);
    const dialogs = await screen.findAllByRole('alertdialog');
    const go = (d: HTMLElement) => within(d).getByRole('button', { name: interpolate(detail['sd.cmd.confirm.go'], { command: reboot.name }) });
    // The second panel is opened before the first confirms.
    expect(dialogs).toHaveLength(1);
    await act(async () => { go(dialogs[0] as HTMLElement).click(); });
    await userEvent.click(buttons[1] as HTMLElement);
    await act(flush);
    const second = screen.queryAllByRole('alertdialog');
    for (const d of second) await act(async () => { go(d).click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(screen.queryAllByText(interpolate(detail['sd.cmd.inFlight'], { command: reboot.name, server: 'node-7' })).length).toBeGreaterThan(0);
  });

  it('a held run on one server does not hold, or show on, the panel of another server', async () => {
    await sendRebootLost({ status: 500, body: { message: 'x' } });
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: reboot.name, server: 'node-7' }))).toBeInTheDocument();
    cleanup();
    const SID2 = 'cccccccccccccccccccccccc';
    world.rows = [row(), row({ id: 'dddddddddddddddddddddddd', server_id: SID2 }, { id: SID2, name: 'node-8' })];
    world.info = { id: SID2, name: 'node-8', is_ready: true, rental_status: 'active' };
    render(<QueryClientProvider client={queryClient}><ServerDetailBody server={{ ...server, id: SID2, name: 'node-8' }} computers={[]} subs={[]} /></QueryClientProvider>);
    await act(flush);
    expect(isOff(await screen.findByRole('button', { name: restartBtn }))).toBe(false);
    expect(held()).toBeNull();
  });
});

// One Section "Server control", one row per command, words by the command's identity (slug),
// never by its risk word; rate words only from the answer's own fields; a server that is not ready says so once and
// every Run says why it waits; a result shows directly under the row it belongs to.
describe('server control layout and words', () => {
  const rowOf = (name: string) => {
    const r = screen.getAllByRole('listitem').find((li) => within(li).queryByText(name));
    if (!r) throw new Error(`no row ${name}`);
    return r;
  };
  const before = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('is one Section titled Server control, with the help behind its About tip, not as body text', async () => {
    await mount();
    const sec = (await screen.findByRole('heading', { name: detail['sd.control'] })).closest('section');
    expect(sec).not.toBeNull();
    expect(sec).toHaveAttribute('data-hub-section', '');
    expect(screen.queryByText(detail['sd.cmd.help'])).toBeNull();
    expect(within(sec as HTMLElement).getByRole('button', { name: new RegExp(detail['sd.control']) })).toBeInTheDocument();
  });

  it('the restart says what it does, offers "Restart now…" in the danger tone, and never shows "Critical"', async () => {
    await mount();
    await screen.findByText('Get system uptime');
    const r = rowOf(reboot.name);
    expect(within(r).getByText(detail['sd.cmd.restart.meta'])).toBeInTheDocument();
    const btn = within(r).getByRole('button', { name: restartBtn });
    expect(btn.textContent).toContain('Restart now');
    expect(btn.className).toMatch(/danger/i);
    expect(screen.queryByText(/critical/i)).toBeNull();
    expect(within(r).queryByRole('button', { name: runBtn(reboot.name) })).toBeNull();
  });

  it('a command other than the restart keeps its API name and description and a plain Run', async () => {
    await mount();
    const r = rowOf('Uptime');
    expect(within(r).getByText('Get system uptime')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: runBtn('Uptime') }).textContent).toBe(detail['sd.cmd.run']);
  });

  it('a command that confirms first says "Asks before running"; a harmless reading does not', async () => {
    world.commands = [uptime, reboot, { ...uptime, id: '6'.repeat(24), slug: 'odd', name: 'Odd', description: 'An odd one', risk_level: 'high', requires_confirmation: false }];
    await mount();
    await screen.findByText('Get system uptime');
    expect(within(rowOf(reboot.name)).getByText(detail['sd.cmd.asks'])).toBeInTheDocument();
    expect(within(rowOf('Odd')).getByText(detail['sd.cmd.asks'])).toBeInTheDocument();
    expect(within(rowOf('Odd')).queryByText(/high risk/i)).toBeNull();
    expect(within(rowOf('Uptime')).queryByText(detail['sd.cmd.asks'])).toBeNull();
  });

  it('rate words come from the answer: cooldown and daily limit both shown, neither when the API sends neither', async () => {
    await mount();
    await screen.findByText('Get system uptime');
    const r = rowOf(reboot.name);
    expect(within(r).getByText(/Minimum time between runs: 10 minutes\./)).toBeInTheDocument();
    expect(within(r).getByText(/At most 1 run a day\./)).toBeInTheDocument();
    expect(within(rowOf('Uptime')).queryByText(/Minimum time between runs|run a day|runs a day/)).toBeNull();
  });

  it('the restart is confirmed first even when the API stores it as low risk asking for no confirmation', async () => {
    world.commands = [uptime, { ...reboot, risk_level: 'low', requires_confirmation: false }];
    await mount();
    expect(within(rowOf(reboot.name)).getByText(detail['sd.cmd.asks'])).toBeInTheDocument();
    await press(restartBtn);
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a cooldown is said exactly as sent: no rounding to the minute, no upper limit', async () => {
    world.commands = [
      { ...reboot, cooldown_seconds: 61, rate_limit_per_day: null },
      { ...uptime, id: '7'.repeat(24), slug: 'long', name: 'Long', description: 'A long one', cooldown_seconds: 90_000 },
    ];
    await mount();
    expect(within(rowOf(reboot.name)).getByText(/Minimum time between runs: 1 minute 1 second\./)).toBeInTheDocument();
    expect(within(rowOf('Long')).getByText(/Minimum time between runs: 25 hours\./)).toBeInTheDocument();
  });

  it('only a daily limit: one sentence, in the plural form', async () => {
    world.commands = [{ ...reboot, cooldown_seconds: null, rate_limit_per_day: 3 }];
    await mount();
    const r = rowOf(reboot.name);
    expect(within(r).getByText(/At most 3 runs a day\./)).toBeInTheDocument();
    expect(within(r).queryByText(/Minimum time between runs/)).toBeNull();
  });

  it('a server that is not ready says so once, in a warn band, and every Run says why it waits', async () => {
    world.info = { ...info, is_ready: false };
    await mount();
    await screen.findByText('Get system uptime');
    const sec = screen.getByRole('heading', { name: detail['sd.control'] }).closest('section') as HTMLElement;
    const shownBands = within(sec).getAllByText(detail['sd.cmd.notReady']).filter((el) => el.closest('[data-hub-band], [role="status"], [role="alert"]') || !el.id);
    expect(shownBands.length).toBeGreaterThan(0);
    for (const b of [screen.getByRole('button', { name: runBtn('Uptime') }), screen.getByRole('button', { name: restartBtn })]) {
      expect(isOff(b)).toBe(true);
      expect(b).toHaveAccessibleDescription(detail['sd.cmd.notReady']);
    }
    await userEvent.click(screen.getByRole('button', { name: restartBtn }));
    await act(flush);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('a held run makes every Run say why it waits', async () => {
    world.exec = () => ({ status: 500, body: { message: 'x' } });
    await mount();
    await press(runBtn('Uptime'));
    expect(await screen.findByText(interpolate(detail['sd.cmd.held'], { command: 'Uptime', server: 'node-7' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: restartBtn })).toHaveAccessibleDescription(detail['sd.cmd.why.held']);
  });

  it('a result shows directly under its own row, before the next row', async () => {
    await mount();
    await press(runBtn('Uptime'));
    const output = await screen.findByText('{"uptime_seconds": 90000}');
    const up = rowOf('Uptime');
    const rb = rowOf(reboot.name);
    expect(before(up, output)).toBe(true);
    expect(before(output, rb)).toBe(true);
  });

  it('a held run shows under the row of the command it was', async () => {
    world.exec = () => ({ status: 500, body: { message: 'x' } });
    world.commands = [reboot, uptime];
    await mount();
    await press(runBtn('Uptime'));
    const band = await screen.findByText(interpolate(detail['sd.cmd.held'], { command: 'Uptime', server: 'node-7' }));
    expect(before(rowOf('Uptime'), band)).toBe(true);
    expect(before(rowOf(reboot.name), band)).toBe(true);
  });

  it('a held run stays shown when the list can no longer be read', async () => {
    world.exec = () => ({ status: 500, body: { message: 'x' } });
    await mount();
    await press(runBtn('Uptime'));
    await screen.findByText(interpolate(detail['sd.cmd.held'], { command: 'Uptime', server: 'node-7' }));
    cleanup();
    queryClient.removeQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('serverCommands') });
    onFetch((c) => (c.url.includes('/available-commands') ? { status: 500, body: { message: 'down' } } : c.url.includes('/runtime') ? { status: 409, body: {} } : { status: 200, body: { data: world.rows } }));
    await mount();
    expect(await screen.findByText(kitStrings['state.errorTitle'])).toBeInTheDocument();
    expect(screen.getByText(interpolate(detail['sd.cmd.held'], { command: 'Uptime', server: 'node-7' }))).toBeInTheDocument();
  });
});
