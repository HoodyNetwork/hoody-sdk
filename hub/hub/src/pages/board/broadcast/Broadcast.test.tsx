// The mounted broadcast: the strip button and Live chip, the panel's gates before Start, the link's C9 states, the
// leftover links and the leave ask. Over the Broadcaster test rig (fake capture, recorder, pipe, alias service).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Button, ConfirmDialog, Drawer, Popover, type LeaveGuardProps } from '@kit';
import type { ReactNode } from 'react';
import type { BoardComputer } from '../computers';
import { BroadcastView, type AliasesView, type ComputersRead, type UseRemove, type UseRenew } from './Broadcast';
import type { Broadcaster } from './broadcaster';
import type { Unsupported } from './capability';
import { RENEW_EVERY_MS, type BroadcastAlias } from './link';
import { flush } from './test/fakes';
import { alias, live, rig } from './test/rig';

const box = { id: 'c1', name: 'cedar', project_id: 'p1', server_name: 'sv1', status: 'running' };
const okAliases = (rows: BroadcastAlias[] = []): AliasesView => ({ data: { computer: 'c1', rows, ids: rows.map((r) => r.id) }, isSuccess: true, isError: false, refetch: vi.fn() });

const noRenewHold: UseRenew = () => ({ readBack: vi.fn(async () => true), held: () => [] });

function Harness(p: { b: Broadcaster; why?: Unsupported | null; aliases?: AliasesView; guard?: (g: LeaveGuardProps) => void; useRemove?: UseRemove; useRenew?: UseRenew; shown?: boolean; restoreFocus?: () => void; computers?: readonly BoardComputer[] | null; read?: ComputersRead; noPick?: boolean }) {
  const state = useSyncExternalStore((fn) => p.b.subscribe(fn), () => p.b.state);
  const Guard = (g: LeaveGuardProps) => { p.guard?.(g); return null; };
  return (
    <BroadcastView
      why={p.why ?? null}
      b={p.b}
      state={state}
      aliases={p.aliases ?? okAliases()}
      computers={p.computers === undefined ? [box] : p.computers}
      chosen={p.noPick ? undefined : p.computers === undefined ? 'c1' : p.computers?.[0]?.id}
      {...(p.read ? { read: p.read } : {})}
      onPick={() => {}}
      area={null}
      Guard={Guard}
      {...(p.useRemove ? { useRemove: p.useRemove } : {})}
      useRenew={p.useRenew ?? noRenewHold}
      {...(p.shown !== undefined ? { shown: p.shown } : {})}
      {...(p.restoreFocus ? { restoreFocus: p.restoreFocus } : {})}
    />
  );
}

const idleRemove: UseRemove = () => ({ mutate: vi.fn(), readBack: vi.fn(async () => false), data: undefined, isPending: false, held: () => [] });

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  // Named Broadcast; while live by its Live words first, then Broadcast (the Live words are its label).
  await user.click(screen.getByRole('button', { name: /(^|· )Broadcast$/ }));
  return screen.findByRole('dialog', { name: 'Broadcast this Board' });
}

async function startLive(user: ReturnType<typeof userEvent.setup>, r: ReturnType<typeof rig>) {
  const panel = await openPanel(user);
  await user.click(within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }));
  await user.click(within(panel).getByRole('button', { name: 'Start broadcast' }));
  await act(() => flush());
  act(() => r.progress.at(-1)!.cb.onEvent('state', live(2)));
  return panel;
}

describe('Broadcast panel: before Start', () => {
  it('shows the privacy warning and the address note; Start waits for the tick', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText(/^Everything on this Board is visible\./)).toBeInTheDocument();
    expect(within(panel).getByText(/only allows your own address, viewers will be refused/)).toBeInTheDocument();
    const start = within(panel).getByRole('button', { name: 'Start broadcast' });
    // Off with its reason on the button (soft-disabled: focusable, aria-disabled), and a press does nothing.
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription('Tick the box above to start.');
    await user.click(start);
    expect(r.b.state.phase).toBe('idle');
    // While only the tick is missing the panel says so (the button used to be off with nothing said).
    expect(within(panel).getAllByText('Tick the box above to start.').length).toBeGreaterThan(0);
    await user.click(within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }));
    expect(start).toBeEnabled();
    expect(within(panel).queryByText('Tick the box above to start.')).toBeNull();
  });
  it('viewer links unavailable: Start is refused, with why', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} aliases={{ isSuccess: false, isError: true, refetch: vi.fn() }} useRemove={idleRemove} />);
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }));
    expect(within(panel).getAllByText("Viewer links are unavailable right now, so a broadcast can't start.").length).toBeGreaterThan(0);
    const start = within(panel).getByRole('button', { name: 'Start broadcast' });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription("Viewer links are unavailable right now, so a broadcast can't start.");
  });
  it('no computer chosen: Start says to choose one', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} noPick />);
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }));
    const start = within(panel).getByRole('button', { name: 'Start broadcast' });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveAccessibleDescription('Choose a computer to send the video through.');
    await user.click(start);
    expect(r.b.state.phase).toBe('idle');
  });
  it('a browser that cannot broadcast gets the reason and no Start', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} why="no-stream-upload" />);
    const panel = await openPanel(user);
    expect(within(panel).getByText("Broadcasting needs single-tab sharing and live uploads, and this browser can't send the Board live. Use an up-to-date Chrome or Edge.")).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Start broadcast' })).toBeNull();
  });
});

describe('Broadcast panel: live', () => {
  // "Live for" is a running time (kit useNow). Driven by fake setInterval and Date only (setTimeout stays real
  // for userEvent and flush), so the 65 s move is deterministic: a clock that never moves stays at 0:00 and fails here.
  it('the live time moves while live, and is gone once the broadcast stops', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    // The rig's broadcaster clock reads 1_000_000 (rig deps.now), so `since` is that instant; the page's clock starts there too.
    vi.setSystemTime(1_000_000);
    try {
      const user = userEvent.setup();
      const r = rig();
      render(<Harness b={r.b} useRemove={idleRemove} />);
      const panel = await startLive(user, r);
      expect(within(panel).getByText('Live for 0:00')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(65_000); });
      expect(within(panel).getByText('Live for 1:05')).toBeInTheDocument();
      act(() => r.b.stop());
      expect(r.b.state.phase).not.toBe('live');
      expect(screen.queryByText(/^Live for /)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('Start asks for the tab in the press; the chip shows live with the viewers; the tick is cleared for the next Start', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Live · 2 watching').length).toBeGreaterThan(0);
    expect(within(panel).getByText('2 watching')).toBeInTheDocument();
    expect(within(panel).getByText('Making the viewer link…')).toBeInTheDocument();
  });
  it('viewers read unknown (never 0) while the status stream is closed', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    act(() => r.progress[0]!.cb.onClosed('network'));
    expect(within(panel).getByText('Number of watchers unavailable right now')).toBeInTheDocument();
    expect(screen.getAllByText('Live · watchers unknown').length).toBeGreaterThan(0);
    expect(within(panel).queryByText('0 watching')).toBeNull();
  });
  it('a made link shows with Copy and QR', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) }); await flush(); });
    expect(within(panel).getByText('https://abc.sv1.alias.test')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Copy viewer link' })).toBeInTheDocument();
  });
  it('the viewer link grants watching, so its QR says it holds a key and what it gives: the page\'s own words in the trust note', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) }); await flush(); });
    await user.click(within(panel).getByRole('button', { name: 'QR code' }));
    const qr = await screen.findByRole('dialog', { name: 'QR code: Viewer link' });
    // Shown at once (no Show); the caption describes the code, and its trust sentence's note is the page's own warning.
    expect(within(qr).queryByRole('button', { name: 'Show' })).toBeNull();
    expect(within(qr).getByRole('img', { name: 'QR code for this address' })).toHaveAccessibleDescription('Contains a key. Only share it with people you trust.');
    await user.click(within(qr).getByRole('button', { name: 'Only share it with people you trust.' }));
    expect(await screen.findByRole('dialog', { name: 'Only share it with people you trust.' })).toHaveTextContent('Anyone with this link can watch while you broadcast.');
  });
  it('the live link says when it turns off by itself; a failed or unknown extension warns, never silently', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!, { expiresAt: '2026-10-24T08:00:00.000Z' }) }); await flush(); });
    expect(within(panel).getByText(/If this tab closes without stopping, the link turns off by itself by /)).toBeInTheDocument();
    await act(async () => { r.fire(RENEW_EVERY_MS); await flush(); r.renews[0]!.d.resolve({ outcome: 'failed' }); await flush(); });
    expect(within(panel).getByText(/The link could not be extended\. It stops at /)).toBeInTheDocument();
    await act(async () => { r.fire(RENEW_EVERY_MS); await flush(); r.renews[1]!.d.resolve({ outcome: 'pending' }); await flush(); });
    expect(within(panel).getByText(/We could not confirm that the link was extended\. It may stop at /)).toBeInTheDocument();
  });
  it('an unknown create is its own state with Check again, never "could not be made"', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'pending' }); await flush(); });
    expect(within(panel).getByText('We could not confirm whether the viewer link was made. It may exist; if it does, it stops by itself within 15 minutes.')).toBeInTheDocument();
    expect(within(panel).queryByText('The viewer link could not be made.')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });
  it('after Stop, the computer stays locked while the link turn-off is unknown', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) }); await flush(); });
    await user.click(within(panel).getByRole('button', { name: 'Stop and turn off the link' }));
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    await act(async () => { r.removes[0]!.d.resolve({ outcome: 'pending' }); await flush(); });
    expect(r.b.running).toBe(false);
    expect(within(panel).getByRole('button', { name: /Send through/ })).toBeDisabled();
  });
  it('Stop keeps the chip as Ending… until the pipe answered', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    const panel = await startLive(user, r);
    await user.click(within(panel).getByRole('button', { name: 'Stop and turn off the link' }));
    expect(screen.getAllByText('Ending…').length).toBeGreaterThan(0);
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    expect(screen.queryByText('Ending…')).toBeNull();
    expect(screen.getByText('Broadcast stopped.')).toBeInTheDocument();
  });
});

describe('Broadcast: leftover links', () => {
  it('lists earlier links; an unknown turn-off stays listed as not confirmed with Check again', async () => {
    const user = userEvent.setup();
    const r = rig();
    const mutate = vi.fn();
    const box2: { data: { outcome: 'pending' } | undefined } = { data: undefined };
    const readBack = vi.fn(async () => false);
    const useRemove: UseRemove = () => ({ mutate, readBack, data: box2.data, isPending: false, held: () => [] });
    const old = alias('bc-' + 'q'.repeat(32), { id: 'old1', createdAt: '2026-10-24T05:00:00Z' });
    const v = render(<Harness b={r.b} aliases={okAliases([old])} useRemove={useRemove} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Earlier broadcast links on this computer')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Turn off' }));
    expect(mutate).toHaveBeenCalledWith({ computer: 'c1', alias: 'old1' });
    box2.data = { outcome: 'pending' };
    v.rerender(<Harness b={r.b} aliases={okAliases([old])} useRemove={useRemove} />);
    expect(within(panel).getByText('Turning off not confirmed')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Turn off' })).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Check again' }));
    expect(readBack).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
  it('a leftover held by an unknown extension reads that extension back, and offers Try again once no hold is left', async () => {
    const user = userEvent.setup();
    const r = rig();
    const mutate = vi.fn();
    const removeBack = vi.fn(async () => false);
    const box2: { data: { outcome: 'not_sent'; code: string } | undefined } = { data: undefined };
    const useRemove: UseRemove = () => ({ mutate, readBack: removeBack, data: box2.data, isPending: false, held: () => [] });
    const held = { rows: [{ hold: 'h2', at: 1, identity: { alias: 'old1', computer: 'c1', until: 'x' }, target: null, account: 'a' }] };
    const renewBack = vi.fn(async () => { held.rows = []; return true; });
    const useRenew: UseRenew = () => ({ readBack: renewBack, held: () => held.rows });
    const old = alias('bc-' + 'q'.repeat(32), { id: 'old1' });
    const v = render(<Harness b={r.b} aliases={okAliases([old])} useRemove={useRemove} useRenew={useRenew} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Turning off not confirmed')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Check again' }));
    expect(renewBack).toHaveBeenCalledTimes(1);
    expect(removeBack).not.toHaveBeenCalled();
    box2.data = { outcome: 'not_sent', code: 'HELD_BY_OTHER' };
    v.rerender(<Harness b={r.b} aliases={okAliases([old])} useRemove={useRemove} useRenew={useRenew} />);
    expect(within(panel).queryByText('Turning off not confirmed')).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(mutate).toHaveBeenCalledWith({ computer: 'c1', alias: 'old1' });
  });
});

describe('Broadcast: leaving while a broadcast runs', () => {
  it('a leftover whose turn-off an earlier panel left held shows not confirmed after a remount', async () => {
    const user = userEvent.setup();
    const r = rig();
    const old = alias('bc-' + 'q'.repeat(32), { id: 'old1' });
    const useRemove: UseRemove = () => ({ mutate: vi.fn(), readBack: vi.fn(async () => false), data: undefined, isPending: false, held: () => [{ hold: 'h1', at: 1, identity: { alias: 'old1', computer: 'c1' }, target: null, account: 'a' }] });
    render(<Harness b={r.b} aliases={okAliases([old])} useRemove={useRemove} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Turning off not confirmed')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Turn off' })).toBeNull();
  });
  it('a second leave while the first is ending the broadcast is kept on the page (reset), the first proceeds', async () => {
    const user = userEvent.setup();
    const r = rig();
    let g: LeaveGuardProps | null = null;
    render(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} />);
    await startLive(user, r);
    await user.keyboard('{Escape}');
    const p1 = vi.fn(), r1 = vi.fn(), p2 = vi.fn(), r2 = vi.fn();
    act(() => g!.onBlock(p1, r1));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
    await user.click(within(ask).getByRole('button', { name: 'Stop and leave' }));
    act(() => g!.onBlock(p2, r2));
    expect(r2).toHaveBeenCalledTimes(1);
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'failed' }); await flush(); });
    expect(p1).toHaveBeenCalledTimes(1);
    expect(p2).not.toHaveBeenCalled();
  });
});

describe('Broadcast: leaving the Board', () => {
  it('guards only while a broadcast runs or its link is on; Stop and leave ends both, then leaves', async () => {
    const user = userEvent.setup();
    const r = rig();
    let g: LeaveGuardProps | null = null;
    render(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} />);
    expect(g!.active).toBe(false);
    await startLive(user, r);
    await act(async () => { r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) }); await flush(); });
    expect(g!.active).toBe(true);
    const proceed = vi.fn(), reset = vi.fn();
    await user.keyboard('{Escape}');
    act(() => g!.onBlock(proceed, reset));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
    await user.click(within(ask).getByRole('button', { name: 'Stop and leave' }));
    await act(() => flush());
    expect(proceed).not.toHaveBeenCalled();
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    expect(r.removes.length).toBe(1);
    expect(proceed).not.toHaveBeenCalled();
    await act(async () => { r.removes[0]!.d.resolve({ outcome: 'done' }); await flush(); });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
  it('Stay keeps the broadcast and the page', async () => {
    const user = userEvent.setup();
    const r = rig();
    let g: LeaveGuardProps | null = null;
    render(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} />);
    await startLive(user, r);
    await user.keyboard('{Escape}');
    const proceed = vi.fn(), reset = vi.fn();
    act(() => g!.onBlock(proceed, reset));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
    await user.click(within(ask).getByRole('button', { name: 'Stay' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();
    expect(r.b.state.phase).toBe('live');
  });
});

describe('Broadcast: the strip hides (phone width, focus mode)', () => {
  it('an open panel closes when hidden and stays closed when shown again; the broadcast and the leave ask go on', async () => {
    const user = userEvent.setup();
    const r = rig();
    let g: LeaveGuardProps | null = null;
    const { rerender } = render(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} shown />);
    await startLive(user, r);
    expect(screen.getByRole('dialog', { name: 'Broadcast this Board' })).toBeInTheDocument();
    rerender(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} shown={false} />);
    await act(() => flush());
    expect(screen.queryByRole('dialog', { name: 'Broadcast this Board' })).toBeNull();
    expect(r.b.state.phase).toBe('live');
    expect(r.uploads[0]!.signal.aborted).toBe(false);
    // Hidden, the leave ask still guards; Stay keeps the broadcast.
    expect(g!.active).toBe(true);
    const proceed = vi.fn(), reset = vi.fn();
    act(() => g!.onBlock(proceed, reset));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
    await user.click(within(ask).getByRole('button', { name: 'Stay' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(r.b.state.phase).toBe('live');
    rerender(<Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} shown />);
    await act(() => flush());
    expect(screen.queryByRole('dialog', { name: 'Broadcast this Board' })).toBeNull();
    expect(await openPanel(user)).toBeInTheDocument();
  });
  it('hidden while live, a Live bar outside the strip keeps the broadcast visible and stoppable; it goes once ended', async () => {
    const user = userEvent.setup();
    const r = rig();
    const { rerender, container } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
    await startLive(user, r);
    expect(screen.queryByRole('group', { name: 'Broadcast running' })).toBeNull(); // shown: the strip's chip is enough
    // The Live words are the trigger's own, its name and its face, and drawn once (none beside it).
    const trigger = screen.getByRole('button', { name: 'Live · 2 watching · Broadcast' });
    expect(trigger).toHaveTextContent('Live · 2 watching');
    expect(container.querySelectorAll('button')).toContain(trigger);
    expect(screen.getAllByText('Live · 2 watching').filter((n) => !n.closest('[role="dialog"]'))).toHaveLength(1); // the open panel says it too
    rerender(<Harness b={r.b} useRemove={idleRemove} shown={false} />);
    await act(() => flush());
    const bar = screen.getByRole('group', { name: 'Broadcast running' });
    expect(container.contains(bar)).toBe(false);   // outside the strip, which is off screen
    expect(within(bar).getByText('Live · 2 watching')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Stop and turn off the link' }));
    expect(within(bar).getByText('Ending…')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Stop and turn off the link' })).toBeDisabled();
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    expect(r.b.running).toBe(false);
    expect(screen.queryByRole('group', { name: 'Broadcast running' })).toBeNull();
  });
  it('the Live bar stays named, reachable and pressable over an open kit sheet, and pressing Stop leaves the sheet open', async () => {
    const user = userEvent.setup();
    const r = rig();
    const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
    await startLive(user, r);
    const onOpenChange = vi.fn();
    const sheet = <Drawer resizeKey="test-broadcast-test" isOpen onOpenChange={onOpenChange} title="Board menu"><p>Menu body</p></Drawer>;
    rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{sheet}</>);
    await act(() => flush());
    expect(screen.getByRole('dialog', { name: 'Board menu' })).toBeInTheDocument();
    // The sheet hides everything outside it from assistive tech; the bar is kept out of that (getByRole skips hidden nodes).
    const bar = screen.getByRole('group', { name: 'Broadcast running' });
    expect(bar.closest('[aria-hidden="true"]')).toBeNull();
    const stop = within(bar).getByRole('button', { name: 'Stop and turn off the link' });
    await user.click(stop);
    expect(onOpenChange).not.toHaveBeenCalled();          // a press on the bar is not an outside press
    expect(within(bar).getByText('Ending…')).toBeInTheDocument();
    await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
    expect(r.b.running).toBe(false);
  });
  for (const kind of ['Drawer', 'ConfirmDialog', 'ConfirmDialog over a Drawer'] as const) {
    it(`keyboard: Tab from inside an open ${kind} reaches the Live bar's Stop, Enter stops, and the ${kind} stays open`, async () => {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await startLive(user, r);
      const onOpenChange = vi.fn();
      const drawer = <Drawer resizeKey="test-broadcast-test-2" isOpen onOpenChange={onOpenChange} title="Board menu"><input aria-label="Name" /></Drawer>;
      const confirm = <ConfirmDialog isOpen onOpenChange={onOpenChange} title="Close this Board?" confirmLabel="Close" onConfirm={() => {}} />;
      // Nested: a dialog opened from inside the Drawer; the bar joins the topmost overlay, the one that holds focus.
      const overlay: ReactNode = kind === 'Drawer' ? drawer : kind === 'ConfirmDialog' ? confirm
        : <Drawer resizeKey="test-broadcast-test-3" isOpen onOpenChange={onOpenChange} title="Board menu"><input aria-label="Name" />{confirm}</Drawer>;
      if (kind === 'ConfirmDialog over a Drawer') {   // the Drawer opens first, then the dialog on top of it
        rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{drawer}</>);
        await act(() => flush());
      }
      rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{overlay}</>);
      await act(() => flush());
      const dialog = kind === 'Drawer' ? screen.getByRole('dialog') : screen.getByRole('alertdialog');
      const stop = within(screen.getByRole('group', { name: 'Broadcast running' })).getByRole('button', { name: 'Stop and turn off the link' });
      // Focus starts inside the overlay; Tab cycles through it and the bar's Stop, then wraps back into the overlay
      // (Shift+Tab is checked in the browser: jsdom's Shift+Tab does not reach React Aria's containment here).
      expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
      const cycle = async () => { for (let i = 0; i < 12; i++) { await user.tab(); if (document.activeElement === stop) return true; } return false; };
      expect(await cycle()).toBe(true);
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);   // wrapped back inside the overlay, not onto the page
      expect(await cycle()).toBe(true);
      await user.keyboard('{Enter}');
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(within(screen.getByRole('group', { name: 'Broadcast running' })).getByText('Ending…')).toBeInTheDocument();
      await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
      expect(r.b.running).toBe(false);
    });
  }
  // A desktop Popover portals an inert full-screen underlay before its content; the bar must join the content.
  for (const kind of ['Popover', 'Popover over a Drawer'] as const) {
    it(`keyboard: with a desktop ${kind} open, Stop has no inert or hidden ancestor, Tab reaches it, Enter stops, and the Popover stays open`, async () => {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await startLive(user, r);
      const onOpenChange = vi.fn();
      const popover = (
        <Popover isOpen onOpenChange={onOpenChange} label="Help" title="Help" trigger={<Button>Help</Button>}>
          <p>First row</p>
          <Button>Popover action</Button>
        </Popover>
      );
      const drawer = (inner: ReactNode) => <Drawer resizeKey="test-broadcast-test-4" isOpen onOpenChange={() => {}} title="Board menu"><input aria-label="Name" />{inner}</Drawer>;
      if (kind === 'Popover over a Drawer') {
        rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{drawer(null)}</>);
        await act(() => flush());
      }
      rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{kind === 'Popover' ? popover : drawer(popover)}</>);
      await act(() => flush());
      const dialog = screen.getByRole('dialog', { name: 'Help' });
      const bar = document.querySelector('[role="group"][aria-label="Broadcast running"]') as HTMLElement;
      expect(bar).not.toBeNull();
      expect(bar.closest('[inert], [aria-hidden="true"]')).toBeNull();
      const stop = within(bar).getByRole('button', { name: 'Stop and turn off the link' });
      expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
      const cycle = async () => { for (let i = 0; i < 12; i++) { await user.tab(); if (document.activeElement === stop) return true; } return false; };
      expect(await cycle()).toBe(true);
      await user.keyboard('{Enter}');
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
      expect(within(bar).getByText('Ending…')).toBeInTheDocument();
      await act(async () => { r.uploads[0]!.answer({ status: 200, text: '' }); await flush(); });
      expect(r.b.running).toBe(false);
    });
  }
  // Escape: the bar sits inside the open overlay's root but outside its dialog, where the overlay
  // listens for Escape. Escape on the bar's Stop closes that overlay (only the top one), as it does from inside it,
  // and never stops the broadcast.
  for (const kind of ['Drawer', 'ConfirmDialog', 'ConfirmDialog over a Drawer', 'Popover', 'Popover over a Drawer'] as const) {
    it(`keyboard: Escape on the Live bar's Stop closes the open ${kind} (only the top one) and the broadcast keeps running`, async () => {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await startLive(user, r);
      const top = vi.fn();
      const under = vi.fn();
      const drawer = (inner: ReactNode, on: (o: boolean) => void) => <Drawer resizeKey="test-broadcast-test-5" isOpen onOpenChange={on} title="Board menu"><input aria-label="Name" />{inner}</Drawer>;
      const confirm = <ConfirmDialog isOpen onOpenChange={top} title="Close this Board?" confirmLabel="Close" onConfirm={() => {}} />;
      const popover = <Popover isOpen onOpenChange={top} label="Help" title="Help" trigger={<Button>Help</Button>}><Button>Popover action</Button></Popover>;
      const nested = kind.endsWith('over a Drawer');
      const inner = kind.startsWith('Popover') ? popover : confirm;
      if (nested) {   // the Drawer opens first, then the other overlay on top of it
        rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{drawer(null, under)}</>);
        await act(() => flush());
      }
      rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{kind === 'Drawer' ? drawer(null, top) : nested ? drawer(inner, under) : inner}</>);
      await act(() => flush());
      const bar = screen.getByRole('group', { name: 'Broadcast running' });
      const stop = within(bar).getByRole('button', { name: 'Stop and turn off the link' });
      const cycle = async () => { for (let i = 0; i < 12; i++) { await user.tab(); if (document.activeElement === stop) return true; } return false; };
      expect(await cycle()).toBe(true);
      await user.keyboard('{Escape}');
      expect(top).toHaveBeenCalledTimes(1);
      expect(top).toHaveBeenCalledWith(false);
      expect(under).not.toHaveBeenCalled();
      expect(r.b.running).toBe(true);
      expect(within(bar).queryByText('Ending…')).toBeNull();
    });
  }
  it('keyboard: Escape on the Live bar leaves a busy ConfirmDialog open (it refuses a keyboard dismiss), and Shift+Escape leaves a Drawer open', async () => {
    const user = userEvent.setup();
    const r = rig();
    const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
    await startLive(user, r);
    const busy = vi.fn();
    rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} /><ConfirmDialog isOpen busy onOpenChange={busy} title="Close this Board?" confirmLabel="Close" onConfirm={() => {}} /></>);
    await act(() => flush());
    let stop = within(screen.getByRole('group', { name: 'Broadcast running' })).getByRole('button', { name: 'Stop and turn off the link' });
    stop.focus();
    await user.keyboard('{Escape}');
    expect(busy).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    const drawer = vi.fn();
    rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} /><Drawer resizeKey="test-broadcast-test-6" isOpen onOpenChange={drawer} title="Board menu"><input aria-label="Name" /></Drawer></>);
    await act(() => flush());
    stop = within(screen.getByRole('group', { name: 'Broadcast running' })).getByRole('button', { name: 'Stop and turn off the link' });
    stop.focus();
    await user.keyboard('{Shift>}{Escape}{/Shift}');
    expect(drawer).not.toHaveBeenCalled();
    expect(r.b.running).toBe(true);
  });
  it('keyboard: Escape on the Live bar with no overlay open does nothing to the broadcast', async () => {
    const user = userEvent.setup();
    const r = rig();
    const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
    await startLive(user, r);
    rerender(<Harness b={r.b} useRemove={idleRemove} shown={false} />);
    await act(() => flush());
    const bar = screen.getByRole('group', { name: 'Broadcast running' });
    expect(bar.hasAttribute('data-in-overlay')).toBe(false);
    within(bar).getByRole('button', { name: 'Stop and turn off the link' }).focus();
    await user.keyboard('{Escape}');
    expect(r.b.running).toBe(true);
    expect(within(bar).queryByText('Ending…')).toBeNull();
  });
  // Unknown is never shown as none. The Board's computer list is null until its first answer.
  it('computers still reading: the panel shows the reading skeleton, never "no computers"', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={null} read={{ failed: false, retry: vi.fn() }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByRole('status')).toHaveTextContent(/Loading/);
    expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Start/ })).toBeNull();
  });
  it('computers read failed: the panel shows the read error with Try again, never "no computers"', async () => {
    const user = userEvent.setup();
    const r = rig();
    const retry = vi.fn();
    render(<Harness b={r.b} useRemove={idleRemove} computers={null} read={{ failed: true, retry }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText("Couldn't read your computers")).toBeInTheDocument();
    expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  // The read's own rejection reaches the shared error details (E1): the reason behind "Couldn't read", with Details.
  const readRejection = { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'upstream down', traceId: '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6', route: 'GET /computers' };
  it.each([
    ['not read yet', null],
    ['an empty list', [] as BoardComputer[]],
  ])('computers read failed with a rejection (%s): the panel offers its Details', async (_n, computers) => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={computers} read={{ failed: true, error: readRejection, retry: vi.fn() }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText("Couldn't read your computers")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });
  it('a null list with no read state (an older caller) still reads as unknown, never "no computers"', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={null} />);
    const panel = await openPanel(user);
    expect(within(panel).getByRole('status')).toHaveTextContent(/Loading/);
    expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
  });
  it('computers read and empty: only then the panel says there are none', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={[]} read={{ failed: false, retry: vi.fn() }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeInTheDocument();
    expect(within(panel).queryByRole('status')).toBeNull();
  });
  // An empty list is "none" only from a whole read that succeeded (rows failed over, or a partial page).
  for (const [what, read, shows] of [
    ['empty, the last read failed', { failed: true, complete: true }, "Couldn't read your computers"],
    ['empty, only part of the list read', { failed: false, complete: false }, "Couldn't read your whole computer list"],
  ] as const) {
    it(`computers ${what}: the panel shows "${shows}" with Try again, never "no computers"`, async () => {
      const user = userEvent.setup();
      const r = rig();
      const retry = vi.fn();
      render(<Harness b={r.b} useRemove={idleRemove} computers={[]} read={{ ...read, retry }} />);
      const panel = await openPanel(user);
      expect(within(panel).getByText(shows)).toBeInTheDocument();
      expect(within(panel).queryByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeNull();
      await user.click(within(panel).getByRole('button', { name: 'Try again' }));
      expect(retry).toHaveBeenCalledTimes(1);
    });
  }
  it('computers empty from a whole read that succeeded: "no computers"', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={[]} read={{ failed: false, complete: true, retry: vi.fn() }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Broadcasting needs a computer. Get one or move one here on the Computers page.')).toBeInTheDocument();
  });
  it('a failed refresh over a list already read keeps the list (known data is not replaced by the error)', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} computers={[box]} read={{ failed: true, retry: vi.fn() }} />);
    const panel = await openPanel(user);
    expect(within(panel).getByText('Send through')).toBeInTheDocument();
    expect(within(panel).queryByText("Couldn't read your computers")).toBeNull();
  });
  it('shown defaults to true: the panel opens with no prop', async () => {
    const user = userEvent.setup();
    const r = rig();
    render(<Harness b={r.b} useRemove={idleRemove} />);
    expect(await openPanel(user)).toBeInTheDocument();
  });
});

// The bar's placement follows the bar's own width (its live text changes) and a Popover that
// moves without resizing. Happy DOM has no layout: the panel rect, the bar width and ResizeObserver are stand-ins.
describe('Broadcast: the Live bar placement follows its width and a moved overlay', () => {
  type Rect = { left: number; width: number };
  function layout(panel: Rect, barW: number) {
    const st = { panel, barW };
    const observers: { cb: () => void; els: Set<Element> }[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const had = { ro: g.ResizeObserver, rect: Element.prototype.getBoundingClientRect, ow: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth') };
    g.ResizeObserver = class { o: { cb: () => void; els: Set<Element> }; constructor(cb: () => void) { this.o = { cb, els: new Set() }; observers.push(this.o); } observe(el: Element) { this.o.els.add(el); } unobserve(el: Element) { this.o.els.delete(el); } disconnect() { this.o.els.clear(); } };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const r = this.matches('[role="dialog"], [role="alertdialog"]') ? st.panel : { left: 0, width: 0 };
      return { left: r.left, width: r.width, right: r.left + r.width, top: 0, bottom: 100, height: 100, x: r.left, y: 0, toJSON() {} } as DOMRect;
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.getAttribute('aria-label') === 'Broadcast running' ? st.barW : 0; } });
    const resized = async (el: Element) => { await act(async () => { for (const o of observers) if (o.els.has(el)) o.cb(); await flush(); }); };
    const restore = () => {
      g.ResizeObserver = had.ro;
      Element.prototype.getBoundingClientRect = had.rect;
      if (had.ow) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', had.ow);
    };
    return { st, resized, restore };
  }
  const barEl = () => document.querySelector('[role="group"][aria-label="Broadcast running"]') as HTMLElement;
  const startOf = () => barEl().style.getPropertyValue('--away-start');

  it('a Drawer stays open while the live text widens the bar: it crosses to the bottom, then re-centres', async () => {
    const L = layout({ left: 260, width: 500 }, 211);
    try {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await startLive(user, r);
      rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} /><Drawer resizeKey="test-broadcast-test-7" isOpen onOpenChange={() => {}} title="Board menu"><input aria-label="Name" /></Drawer></>);
      await act(() => flush());
      expect(barEl().hasAttribute('data-at-bottom')).toBe(false);        // 260 px of scrim fits 211 + 16
      L.st.barW = 280;                                                    // "Live · watchers unknown"
      await L.resized(barEl());
      expect(barEl().hasAttribute('data-at-bottom')).toBe(true);
      expect(startOf()).toBe(`${510 - 140}px`);                           // centred over the panel (centre 510)
      L.st.barW = 300;
      await L.resized(barEl());
      expect(startOf()).toBe(`${510 - 150}px`);
    } finally { L.restore(); }
  });

  it('a Popover that moves without resizing (React Aria repositions it) is measured again', async () => {
    const L = layout({ left: 16, width: 320 }, 211);
    try {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await startLive(user, r);
      const pop = <Popover isOpen onOpenChange={() => {}} label="Help" title="Help" trigger={<Button>Help</Button>}><Button>Popover action</Button></Popover>;
      rerender(<><Harness b={r.b} useRemove={idleRemove} shown={false} />{pop}</>);
      await act(() => flush());
      expect(barEl().hasAttribute('data-at-bottom')).toBe(true);         // 16 px of scrim at the start
      L.st.panel = { left: 600, width: 320 };
      const dialog = screen.getByRole('dialog', { name: 'Help' });
      await act(async () => { dialog.parentElement!.style.left = '600px'; await flush(); });
      expect(barEl().hasAttribute('data-at-bottom')).toBe(false);
    } finally { L.restore(); }
  });
});

// Hiding the strip while the panel is open. Happy DOM runs no CSS animations, so react-aria unmounts a
// closed overlay at once. This stand-in plays the browser for the two rules involved, as measured in Chromium
// as follows: the kit's `.popover[data-exiting]` starts an exit animation whose `finished` waits;
// the panel's no-exit class (the stand-in for its `animation-duration: 0s`) means a close that starts with it has no
// running animation, and an exit already running when it is added finishes at once (its `finished` resolves).
function withExitAnimations(): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const had = { gA: proto.getAnimations, cssT: g.CSSTransition };
  if (typeof g.CSSTransition === 'undefined') g.CSSTransition = class {};
  const instant = (el: Element) => /(^|\s)\S*instant\S*/.test(el.className);
  const running = new WeakMap<Element, unknown>();
  const exitOf = (el: Element) => {
    let done!: () => void;
    const finished = new Promise<void>((ok) => { done = ok; });
    const mo = new MutationObserver(() => { if (instant(el)) { mo.disconnect(); done(); } });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return { playState: 'running', timeline: typeof DocumentTimeline === 'undefined' ? undefined : document.timeline, finished };
  };
  proto.getAnimations = function (this: Element) {
    if (!this.hasAttribute('data-exiting') || instant(this)) return [];
    let a = running.get(this);
    if (!a) { a = exitOf(this); running.set(this, a); }
    return [a];
  };
  return () => { proto.getAnimations = had.gA; g.CSSTransition = had.cssT; };
}

describe('Broadcast: the strip hides', () => {
  it('the stand-in holds an ordinary close in its exit animation (so the next test means something)', async () => {
    const undo = withExitAnimations();
    try {
      const user = userEvent.setup();
      const r = rig();
      render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await openPanel(user);
      await user.keyboard('{Escape}');
      await act(() => flush());
      expect(screen.getByRole('dialog', { name: 'Broadcast this Board', hidden: true }).closest('[data-exiting]')).not.toBeNull();
    } finally { undo(); }
  });
  it('hidden, the panel leaves in the same commit: no exit animation keeps its dialog over the Board', async () => {
    const undo = withExitAnimations();
    try {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await openPanel(user);
      rerender(<Harness b={r.b} useRemove={idleRemove} shown={false} />);
      expect(screen.queryByRole('dialog', { name: 'Broadcast this Board', hidden: true })).toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally { undo(); }
  });
  it('an ordinary close already in its exit when the strip hides ends at once, never kept', async () => {
    const undo = withExitAnimations();
    try {
      const user = userEvent.setup();
      const r = rig();
      const { rerender } = render(<Harness b={r.b} useRemove={idleRemove} shown />);
      await openPanel(user);
      await user.keyboard('{Escape}');
      await act(() => flush());
      expect(document.querySelector('[data-exiting]')).not.toBeNull();
      rerender(<Harness b={r.b} useRemove={idleRemove} shown={false} />);
      await act(() => flush());
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    } finally { undo(); }
  });
  it('the no-exit rule changes only the duration: cancelling a running exit (animation: none) would keep the dialog for good', () => {
    // The stylesheet's own text (CSS modules load as class maps here); the test runs from the hub root or above it.
    const at = ['src', 'hub/src'].map((r) => `${r}/pages/board/broadcast/broadcast.module.css`).find((p) => existsSync(p));
    const rule = /\.instant\.instant\[data-exiting\]\s*\{([^}]*)\}/.exec(at ? readFileSync(at, 'utf8') : '')?.[1] ?? '';
    expect(rule.replace(/\s+/g, ' ').trim()).toBe('animation-duration: 0s;');
  });
  it('focus in the panel when the strip hides goes to restoreFocus, never left on the page body', async () => {
    const user = userEvent.setup();
    const r = rig();
    const restoreFocus = vi.fn(() => document.getElementById('surface')!.focus());
    const page = (shown: boolean) => (
      <>
        <button id="surface" type="button">surface</button>
        <Harness b={r.b} useRemove={idleRemove} shown={shown} restoreFocus={restoreFocus} />
      </>
    );
    const { rerender } = render(page(true));
    const panel = await openPanel(user);
    act(() => within(panel).getByRole('checkbox', { name: 'I understand that viewers see the whole Board' }).focus());
    rerender(page(false));
    await act(async () => { await flush(); await new Promise((ok) => requestAnimationFrame(() => ok(undefined))); });
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('surface'));
    // Shown again (focus on the body by then): nothing is moved.
    act(() => (document.activeElement as HTMLElement).blur());
    rerender(page(true));
    await act(async () => { await flush(); await new Promise((ok) => requestAnimationFrame(() => ok(undefined))); });
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });
  it('a keyboard user resting on the Broadcast button when the strip hides goes to restoreFocus', async () => {
    const r = rig();
    const restoreFocus = vi.fn(() => document.getElementById('surface')!.focus());
    const page = (shown: boolean) => (
      <>
        <button id="surface" type="button">surface</button>
        <Harness b={r.b} useRemove={idleRemove} shown={shown} restoreFocus={restoreFocus} />
      </>
    );
    const { rerender } = render(page(true));
    act(() => screen.getByRole('button', { name: 'Broadcast' }).focus());
    rerender(page(false));
    await act(async () => { await flush(); await new Promise((ok) => requestAnimationFrame(() => ok(undefined))); });
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('surface'));
  });
  it('focus in the leave ask (open over the panel) stays there when the strip hides', async () => {
    const user = userEvent.setup();
    const r = rig();
    const restoreFocus = vi.fn();
    let g: LeaveGuardProps | null = null;
    const page = (shown: boolean) => <Harness b={r.b} guard={(x) => { g = x; }} useRemove={idleRemove} shown={shown} restoreFocus={restoreFocus} />;
    const { rerender } = render(page(true));
    await startLive(user, r);
    act(() => g!.onBlock(vi.fn(), vi.fn()));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop broadcasting?' });
    await waitFor(() => expect(ask.contains(document.activeElement)).toBe(true));
    const inAsk = document.activeElement;
    rerender(page(false));
    await act(async () => { await flush(); await new Promise((ok) => requestAnimationFrame(() => ok(undefined))); });
    expect(restoreFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(inAsk);
    expect(screen.getByRole('alertdialog', { name: 'Stop broadcasting?' })).toBeInTheDocument();
  });
});

describe('the computer to send through is the kit computer picker', () => {
  it('shows the picked computer with its state in words, and lists the others with theirs and their place', async () => {
    const user = userEvent.setup();
    const r = rig();
    const other = { id: 'c2', name: 'dune', project_id: 'p1', server_name: 'sv2', status: 'stopped' };
    render(<Harness b={r.b} useRemove={idleRemove} computers={[box, other]} />);
    const panel = await openPanel(user);
    const trigger = within(panel).getByRole('button', { name: /^cedar.*Running Send through$/ });
    expect(trigger).toHaveTextContent('cedar');
    expect(trigger).toHaveAccessibleDescription("The video goes through this computer's Pipe program.");
    await user.click(trigger);
    const list = await screen.findByRole('dialog', { name: 'Send through' });
    expect(within(list).getByText('dune')).toBeInTheDocument();
    expect(within(list).getByText('Stopped')).toBeInTheDocument();
    expect(within(list).getByText('sv2')).toBeInTheDocument();
  });
});
