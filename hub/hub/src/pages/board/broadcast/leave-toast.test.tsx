// Vitest: what "Stop and leave" says when the viewer link's turn-off did not end done.
// A definite failure (the link still works) is an error that says how to fix it; an answer that never came is the C9
// unknown, never an error. Over the Broadcaster test rig, as Broadcast.test.tsx.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaveGuardProps } from '@kit';
import { BroadcastView, type AliasesView, type UseRemove, type UseRenew } from './Broadcast';
import type { Broadcaster } from './broadcaster';
import { flush } from './test/fakes';
import { alias, live, rig } from './test/rig';
import strings from './strings.en.json';

const toasts: Array<{ title: string; body?: string; tone?: string; action?: unknown }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'toast-1'; } }));

const box = { id: 'c1', name: 'cedar', project_id: 'p1', server_name: 'sv1', status: 'running' };
const aliases: AliasesView = { data: { computer: 'c1', rows: [], ids: [] }, isSuccess: true, isError: false, refetch: vi.fn() };
const noRenewHold: UseRenew = () => ({ readBack: vi.fn(async () => true), held: () => [] });
const idleRemove: UseRemove = () => ({ mutate: vi.fn(), readBack: vi.fn(async () => false), data: undefined, isPending: false, held: () => [] });

function Harness(p: { b: Broadcaster; guard: (g: LeaveGuardProps) => void }) {
  const state = useSyncExternalStore((fn) => p.b.subscribe(fn), () => p.b.state);
  const Guard = (g: LeaveGuardProps) => { p.guard(g); return null; };
  return <BroadcastView why={null} b={p.b} state={state} aliases={aliases} computers={[box]} chosen="c1" onPick={() => {}} area={null} Guard={Guard} useRemove={idleRemove} useRenew={noRenewHold} />;
}

/** Live with a link, then Stop and leave; the turn-off answers `outcome`. Resolves once the page was let go. */
async function leaveWith(outcome: 'failed' | 'pending') {
  const user = userEvent.setup();
  const r = rig();
  let g: LeaveGuardProps | null = null;
  render(<Harness b={r.b} guard={(x) => { g = x; }} />);
  await user.click(screen.getByRole('button', { name: 'Broadcast' }));
  const panel = await screen.findByRole('dialog', { name: 'Broadcast this Board' });
  await user.click(within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }));
  await user.click(within(panel).getByRole('button', { name: 'Start broadcast' }));
  await act(() => flush());
  act(() => r.progress.at(-1)!.cb.onEvent('state', live(2)));
  await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) }); await flush(); });
  await user.keyboard('{Escape}');
  const proceed = vi.fn();
  act(() => g!.onBlock(proceed, vi.fn()));
  const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
  await user.click(within(ask).getByRole('button', { name: 'Stop and leave' }));
  await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
  await act(async () => { r.removes[0]!.d.resolve({ outcome }); await flush(); });
  expect(proceed).toHaveBeenCalledTimes(1);
}

describe('Broadcast: the toast after Stop and leave when the link is not confirmed off', () => {
  beforeEach(() => { toasts.length = 0; });

  it('a definite failure is an error that says the link still works and how to turn it off', async () => {
    await leaveWith('failed');
    expect(toasts).toEqual([{ tone: 'error', title: strings['link.removalFailed'], body: strings['link.removalFailedFix'] }]);
  });

  it('a turn-off whose answer never came is the unknown toast, never an error and never a resend', async () => {
    await leaveWith('pending');
    expect(toasts).toEqual([{ tone: 'unknown', title: strings['link.removalUnknown'] }]);
  });
});
