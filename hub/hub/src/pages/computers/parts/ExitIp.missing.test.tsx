// Network > exit, "Use another exit": while "Use this exit" is off because a required box is empty, the footer names
// the box. Before this the button was simply off: a person who typed only the host had to guess that the port (not the
// optional user name or password) was missing, and "Another computer of yours" with none chosen said nothing either.
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { egressRoutes } from '../data';
import { routes } from '../routes';
import type { Computer } from '../types';
import { ExitIp } from './ExitIp';
import { EMPTY, formMissing } from './ExitIp.pure';
import strings from './ExitIp.strings.en.json';

const P = 'a'.repeat(24);
const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const OTHER = { id: 'd'.repeat(24), name: 'beacon', status: 'running', project_id: 'b'.repeat(24), server_id: 't'.repeat(24), server_name: 'n13', server: { name: 'n13', city: 'Singapore', country: 'SG' } } as Computer;

function boot(): FixtureRequest[] {
  const sent: FixtureRequest[] = [];
  const rules: FixtureRule[] = [
    reply(routes.list, () => answers.ok({ data: { computers: [C, OTHER] } })),
    reply(egressRoutes.upstream, () => answers.ok({ enabled: false, state: 'direct', config_path: '/x' })),
    reply(egressRoutes.set, (r) => {
      sent.push(r);
      return answers.ok({ enabled: false, state: 'direct' });
    }),
  ];
  bootFixtureCore({ rules });
  return sent;
}
async function openChoice(): Promise<HTMLElement> {
  render(<QueryClientProvider client={queryClient}><ExitIp c={C} canWrite /></QueryClientProvider>);
  const name = strings['exit.change'];
  await waitFor(() => expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-disabled'));
  await userEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog', { name: strings['exit.form.title'] });
}
const go = () => screen.getByRole('button', { name: strings['exit.form.go'] });

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test clears what a run kept
  localStorage.clear();
});

describe('formMissing', () => {
  it('names the empty required box; the optional login never counts', () => {
    expect(formMissing(EMPTY)).toBe('both');
    expect(formMissing({ ...EMPTY, user: 'u', password: 'p' })).toBe('both');
    expect(formMissing({ ...EMPTY, host: ' proxy.example.com ' })).toBe('port');
    expect(formMissing({ ...EMPTY, port: '1080' })).toBe('host');
    expect(formMissing({ ...EMPTY, host: '   ', port: '1080' })).toBe('host');
    expect(formMissing({ ...EMPTY, host: 'proxy.example.com', port: '1080' })).toBeNull();
  });
});

describe('Use another exit: the footer says which box is missing', () => {
  it('your own proxy: host and port, then only the port, then nothing once both are filled', async () => {
    const sent = boot();
    const d = await openChoice();
    // Opens on "Your own proxy" with both boxes empty: the button is off and the footer says what to enter.
    expect(go()).toBeDisabled();
    expect(screen.getByText(strings['exit.form.need.both'])).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.host'])), 'proxy.example.com');
    expect(go()).toBeDisabled();
    expect(screen.getByText(strings['exit.form.need.port'])).toBeInTheDocument();
    expect(screen.queryByText(strings['exit.form.need.both'])).toBeNull();
    // A bad value is said at its own field, not twice.
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.port'])), '99999');
    expect(go()).toBeDisabled();
    expect(screen.getByText(strings['exit.form.port.bad'])).toBeInTheDocument();
    expect(screen.queryByText(strings['exit.form.need.port'])).toBeNull();
    await userEvent.clear(within(d).getByLabelText(new RegExp(strings['exit.form.port'])));
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.port'])), '1080');
    expect(go()).toBeEnabled();
    for (const k of ['exit.form.need.both', 'exit.form.need.host', 'exit.form.need.port'] as const) expect(screen.queryByText(strings[k])).toBeNull();
    // Naming the box sends nothing.
    expect(sent).toHaveLength(0);
  });

  it('your own proxy: Host and Port announce themselves as required; the optional login does not', async () => {
    boot();
    const d = await openChoice();
    expect(within(d).getByLabelText(new RegExp(strings['exit.form.host']))).toBeRequired();
    expect(within(d).getByLabelText(new RegExp(strings['exit.form.port']))).toBeRequired();
    expect(within(d).getByLabelText(strings['exit.form.user'], { exact: false })).not.toBeRequired();
  });

  it('your own proxy: a port without a host names the host', async () => {
    boot();
    const d = await openChoice();
    await userEvent.type(within(d).getByLabelText(new RegExp(strings['exit.form.port'])), '1080');
    expect(go()).toBeDisabled();
    expect(screen.getByText(strings['exit.form.need.host'])).toBeInTheDocument();
  });

  it('another computer: none chosen says to choose one; chosen, the button is on and the line is gone', async () => {
    const sent = boot();
    const d = await openChoice();
    await userEvent.click(within(d).getByRole('radio', { name: new RegExp(strings['exit.pick.computer']) }));
    expect(go()).toBeDisabled();
    expect(screen.getByText(strings['exit.computer.need'])).toBeInTheDocument();
    expect(screen.queryByText(strings['exit.form.need.both'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: new RegExp(strings['exit.computer.label']) }));
    await userEvent.click(await screen.findByRole('radio', { name: /beacon/ }));
    await waitFor(() => expect(go()).toBeEnabled());
    expect(screen.queryByText(strings['exit.computer.need'])).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
