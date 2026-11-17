// Network > Firewall on real core (fixture transport): the Agent, as the kit's "Ask the Agent"
// The section head's action opens a drawer whose Explain and "Tell the Agent what you want" start a NEW
// conversation through the kit's startAgentConversation, bound to this computer, with the rules as context:
// the name, never the id. The panel's answer about the start is said once (sent / not sent / may have reached it),
// never re-sent (C9, the kit's hold per computer). A plain summary from the rules stays in the section.
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { useAskDock, type AskDock } from '@kit';
// eslint-disable-next-line no-restricted-imports -- a test harness for the part, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within, type RenderOptions } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the rules table reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firewallRoutes } from '../firewall.data';
import type { Computer } from '../types';
import { Firewall, resetAgentStartsForTests } from './Firewall';
import strings from './Firewall.strings.en.json';
import ask from '@kit/widgets/AskAgent.strings.en.json';

/** The rules table (kit DataTable) reads the URL: the part mounts inside a memory router, one per mount, so a rerender
 *  keeps the part's state. */
const Mounted = createContext<ReactNode>(null);
function Routed({ children }: { children?: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute({ component: function Root() { return <>{useContext(Mounted)}</>; } }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  );
  return <Mounted.Provider value={children}><RouterProvider router={router} /></Mounted.Provider>;
}
const render = (ui: ReactElement, o?: RenderOptions) => rtlRender(ui, { wrapper: Routed, ...o });

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;
const ingress = [{ action: 'drop', protocol: 'tcp', description: 'No SSH from there', destination_port: '22', source: '203.0.113.5', state: 'enabled' }];

let dock: AskDock | null = null;
function Probe() {
  dock = useAskDock();
  return null;
}
let reads = 0;
function boot(rules: readonly object[] = ingress) {
  reads = 0;
  bootFixtureCore({ rules: [reply(firewallRoutes.rules, () => { reads++; return answers.ok({ statusCode: 200, data: { ingress: rules, egress: [], rule_count: rules.length, max_rules: 500 } }); })] });
  render(<QueryClientProvider client={queryClient}><Probe /><Firewall c={C} canWrite={false} /></QueryClientProvider>);
}
/** What the panel does: take this computer's start (one at a time). */
const take = () => {
  let d: ReturnType<AskDock['takeDraft']>;
  act(() => { d = dock!.takeDraft(C.id); });
  return d;
};

const SUMMARY = 'Inbound: 1 block. Outbound: no rules, all allowed.';
/** The section head's Ask the Agent, then its drawer. */
async function openAsk() {
  await userEvent.click(await screen.findByRole('button', { name: /^Ask the Agent/ }));
  return screen.findByRole('dialog');
}
const explainB = () => within(screen.getByRole('dialog')).getByRole('button', { name: ask['aa.explain'] });
const sendB = () => within(screen.getByRole('dialog')).getByRole('button', { name: ask['aa.send'] });
const boxOf = () => within(screen.getByRole('dialog')).findByLabelText(new RegExp(strings['fw.agent.tellLabel']));
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

afterEach(() => {
  act(() => { dock?.takeDraft(); });
  cleanup();
  queryClient.clear();
  resetAgentStartsForTests();
});

describe('Network > Firewall: the Agent', () => {
  it('the drawer shows the plain summary from the rules (no AI), so an Agent answer is never the only one', async () => {
    boot();
    const d = await openAsk();
    expect(await within(d).findByText(SUMMARY)).toBeInTheDocument();
  });
  it('Explain starts one new conversation on this computer, with the rules and never the computer id (even read-only)', async () => {
    boot();
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    expect(d?.start).toBe(true);
    expect(d?.computer).toBe(C.id);
    expect(d?.source).toBe('Firewall');
    expect(d?.text).toMatch(/^Explain the firewall of atlas/);
    expect(d?.text).toContain('Block TCP port 22 from 203.0.113.5');
    expect(d?.text).toContain('No SSH from there');
    expect(d?.text).not.toContain(C.id);
    expect(d?.text).not.toContain(C.id.slice(-8));
    expect(d?.text).not.toContain(C.project_id);
  });
  it('open, then Enter: Explain has the focus when the drawer shows', async () => {
    boot();
    await openAsk();
    await waitFor(() => expect(explainB()).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(take()?.start).toBe(true);
  });
  it('the drawer shows what the Agent reads: the rules as sent, never the computer id', async () => {
    boot();
    const dlg = await openAsk();
    // What the Agent reads is shown open: there is no fold to press.
    expect(within(dlg).queryByRole('button', { name: ask['aa.reads'] })).toBeNull();
    expect(within(dlg).getByRole('figure', { name: ask['aa.reads'] })).toBeVisible();
    expect(dlg).toHaveTextContent('No SSH from there');
    expect(dlg).not.toHaveTextContent(C.id);
  });
  it("Tell sends the person's words with the rules; sent clears the box and closes the drawer, and nothing is sent twice", async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    expect(sendB()).toBeDisabled();
    await userEvent.type(box, 'block outbound mail');
    await userEvent.click(sendB());
    const d = take();
    expect(d?.text).toMatch(/^block outbound mail/);
    expect(d?.text).toMatch(/approve each change/);
    act(() => d?.onStart?.('sent'));
    await closed();
    expect(dock!.draft).toBeUndefined();
    await openAsk();
    expect(await boxOf()).toHaveValue('');
    expect(explainB()).toBeEnabled();
  });
  it('may have reached the Agent: said as unknown, the text kept, nothing re-sent', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'open port 8080');
    await userEvent.click(sendB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    expect(await screen.findByText(ask['aa.unknown'])).toBeInTheDocument();
    expect(box).toHaveValue('open port 8080');
    expect(dock!.draft).toBeUndefined();
  });
  it('a request too long to send with the rules: said, and Enter sends nothing', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(3990));
    expect(await screen.findByText(strings['fw.agent.tooLong'])).toBeInTheDocument();
    expect(sendB()).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(dock!.draft).toBeUndefined();
  });
  // A key or a whole id in a rule's description never reaches the Agent nor the disclosure, and a
  // Tell holding a key is refused with nothing sent.
  const KEY = 'Zx9Qw2Ab7Lm4Np8Rt';
  const HEX = '5f0e1a2b3c4d5e6f7a8b9c0d';
  const keyed = [{ action: 'drop', protocol: 'tcp', description: `office ${KEY} for ${HEX}`, destination_port: '22', state: 'enabled' }];
  it('a description holding a key and an id: Explain sends neither', async () => {
    boot(keyed);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    expect(d?.start).toBe(true);
    expect(d?.text).not.toContain(KEY);
    expect(d?.text).not.toContain(HEX);
    expect(d?.text).toContain('office [hidden] for 5f0e…9c0d');
  });
  it('a description holding a key and an id: What the Agent reads shows neither', async () => {
    boot(keyed);
    const dlg = await openAsk();
    // What the Agent reads is shown open: there is no fold to press.
    expect(within(dlg).queryByRole('button', { name: ask['aa.reads'] })).toBeNull();
    expect(within(dlg).getByRole('figure', { name: ask['aa.reads'] })).toBeVisible();
    await waitFor(() => expect(dlg).toHaveTextContent('office [hidden] for 5f0e…9c0d'));
    expect(dlg).not.toHaveTextContent(KEY);
    expect(dlg).not.toHaveTextContent(HEX);
  });
  it('a Tell holding a key: refused and said, and neither Send nor Enter sends anything', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.click(box);
    await userEvent.paste(`allow ${KEY} please`);
    expect(await screen.findByText(strings['fw.agent.secret'])).toBeInTheDocument();
    expect(sendB()).toBeDisabled();
    await userEvent.click(sendB());
    await userEvent.keyboard('{Enter}');
    expect(dock!.draft).toBeUndefined();
  });
  it('a late "sent" of an older start never clears newer words typed since, nor closes the drawer', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'block outbound mail');
    await userEvent.click(sendB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    await userEvent.clear(box);
    await userEvent.type(box, 'block ping instead');
    act(() => d?.onStart?.('sent'));
    expect(box).toHaveValue('block ping instead');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('C9: after "may have reached it", pressing again unchanged starts nothing; the reason is said; only a warned "Stop tracking" lifts it', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'open port 8080');
    const send = sendB();
    await userEvent.click(send);
    const d = take();
    expect(d?.text).toMatch(/^open port 8080/);
    act(() => d?.onStart?.('unknown'));
    expect(screen.getByText(ask['aa.held'])).toBeInTheDocument();
    expect(send).toBeDisabled();
    expect(explainB()).toBeDisabled();
    // A second press (and Enter) with the same words starts nothing.
    await userEvent.click(send);
    await userEvent.type(box, '{Enter}');
    expect(take()).toBeUndefined();
    // Look: open the Agent panel; nothing is sent by looking.
    act(() => { dock!.close(); });
    await userEvent.click(screen.getByRole('button', { name: ask['aa.look'] }));
    expect(dock!.isOpen).toBe(true);
    expect(take()).toBeUndefined();
    expect(send).toBeDisabled();
    // The warned way out: cancel keeps it paused, confirm lets the person ask again (it does not send by itself).
    await userEvent.click(screen.getByRole('button', { name: ask['aa.release'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /cancel/i }));
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: ask['aa.release'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: ask['aa.releaseGo'] }));
    expect(take()).toBeUndefined();
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    expect(take()?.text).toMatch(/^open port 8080/);
  });
  it('C9: a second press before the first start has any answer starts nothing', async () => {
    boot();
    await openAsk();
    await userEvent.click(explainB());
    expect(screen.getByText(ask['aa.waiting'])).toBeInTheDocument();
    expect(explainB()).toBeDisabled();
    const d = take();
    await userEvent.click(explainB());
    expect(take()).toBeUndefined();
    act(() => d?.onStart?.('sent'));
    await closed();
    await openAsk();
    expect(explainB()).toBeEnabled();
    expect(screen.queryByText(ask['aa.held'])).toBeNull();
  });
  it('C9: two presses in the same tick make one start, and the pause holds when it answers unknown', async () => {
    boot();
    await openAsk();
    const explain = explainB();
    act(() => {
      fireEvent.click(explain);
      fireEvent.click(explain);
    });
    const d = take();
    expect(d?.start).toBe(true);
    act(() => d?.onStart?.('unknown'));
    expect(screen.getByText(ask['aa.held'])).toBeInTheDocument();
    expect(explain).toBeDisabled();
  });
  it('not sent lifts the pause (nothing reached the Agent); the text is kept for a new press', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'block ping');
    await userEvent.click(sendB());
    const d = take();
    act(() => d?.onStart?.('notSent'));
    expect(sendB()).toBeEnabled();
    expect(box).toHaveValue('block ping');
  });
  it("an older start's outcome never speaks over (or unpauses) the newer start's", async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'first');
    await userEvent.click(sendB());
    const d1 = take();
    act(() => d1?.onStart?.('unknown'));
    await userEvent.click(screen.getByRole('button', { name: ask['aa.release'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: ask['aa.releaseGo'] }));
    await userEvent.clear(box);
    await userEvent.type(box, 'second');
    await userEvent.click(sendB());
    const d2 = take();
    act(() => d2?.onStart?.('unknown'));
    act(() => d1?.onStart?.('sent'));
    expect(screen.getByText(ask['aa.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(ask['aa.sent'])).toBeNull();
    expect(box).toHaveValue('second');
    expect(sendB()).toBeDisabled();
  });
  it('Read the rules again reads the list once more', async () => {
    boot();
    await screen.findByText('No SSH from there');
    await openAsk();
    const before = reads;
    await userEvent.click(screen.getByRole('button', { name: strings['fw.agent.reread'] }));
    await waitFor(() => expect(reads).toBe(before + 1));
  });
  it('after a start reached the Agent, the list re-reads on its own (its tools may change the rules)', async () => {
    boot();
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    const before = reads;
    vi.useFakeTimers();
    try {
      act(() => d?.onStart?.('sent'));
      await act(async () => { vi.advanceTimersByTime(15_000); });
      await act(async () => { vi.advanceTimersByTime(15_000); });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(before + 2));
  });
  it('not sent: said, the text kept', async () => {
    boot();
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'block ping');
    await userEvent.click(sendB());
    act(() => { dock!.close(); });
    expect(await screen.findByText(ask['aa.notSent'])).toBeInTheDocument();
    expect(box).toHaveValue('block ping');
  });
});

describe('Network > Firewall: Ask the Agent across computers, failed reads and other renders', () => {
  const B = { ...C, id: 'b'.repeat(24), name: 'borealis' } as Computer;
  let failReads = false;
  function boot2(first: Computer) {
    reads = 0;
    failReads = false;
    bootFixtureCore({ rules: [reply(firewallRoutes.rules, () => { reads++; return failReads ? answers.refused(503, 'FIREWALL_HOST_UNAVAILABLE') : answers.ok({ statusCode: 200, data: { ingress, egress: [], rule_count: 1, max_rules: 500 } }); })] });
    const ui = (c: Computer | null) => <QueryClientProvider client={queryClient}><Probe />{c ? <Firewall c={c} canWrite={false} /> : null}</QueryClientProvider>;
    const r = render(ui(first));
    return (c: Computer | null) => r.rerender(ui(c));
  }
  it('words, an outcome and a late sent stay with the computer they were started on (switch to a cached one)', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'block outbound mail');
    await userEvent.click(sendB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    expect(screen.getByText(ask['aa.unknown'])).toBeInTheDocument();
    show(B);
    await closed();
    await openAsk();
    const boxB = await boxOf();
    expect(boxB).toHaveValue('');
    expect(screen.queryByText(ask['aa.unknown'])).toBeNull();
    await userEvent.type(boxB, 'mine');
    const before = reads;
    vi.useFakeTimers();
    try {
      act(() => d?.onStart?.('sent'));
      await act(async () => { vi.advanceTimersByTime(31_000); });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.queryByText(ask['aa.sent'])).toBeNull();
    expect(boxB).toHaveValue('mine');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(reads).toBe(before);
  });
  it("a direct sent of the start made on another computer leaves this computer's drawer open and its words", async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    await userEvent.type(await boxOf(), 'block outbound mail');
    await userEvent.click(sendB());
    const d = take();
    show(B);
    await closed();
    await openAsk();
    const boxB = await boxOf();
    await userEvent.type(boxB, 'mine');
    act(() => d?.onStart?.('sent'));
    expect(screen.queryByText(ask['aa.sent'])).toBeNull();
    expect(boxB).toHaveValue('mine');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('closing the drawer keeps the words: opened again, the request is still there', async () => {
    boot2(C);
    await openAsk();
    await userEvent.type(await boxOf(), 'block ping instead');
    await userEvent.keyboard('{Escape}');
    await closed();
    await openAsk();
    expect(await boxOf()).toHaveValue('block ping instead');
  });
  it('a late sent after the drawer was closed never clears words edited after reopening', async () => {
    boot2(C);
    await openAsk();
    await userEvent.type(await boxOf(), 'block ping');
    await userEvent.click(sendB());
    const d = take();
    await userEvent.keyboard('{Escape}');
    await closed();
    await openAsk();
    const box = await boxOf();
    await userEvent.clear(box);
    await userEvent.type(box, 'block mail');
    act(() => d?.onStart?.('sent'));
    // Sent hands the question to the Agent panel (the kit closes the drawer); the newer words stay for the next open.
    await closed();
    await openAsk();
    expect(await boxOf()).toHaveValue('block mail');
  });
  it('a late sent after the drawer was closed clears the words that still hold the request sent', async () => {
    boot2(C);
    await openAsk();
    await userEvent.type(await boxOf(), 'block ping');
    await userEvent.click(sendB());
    const d = take();
    await userEvent.keyboard('{Escape}');
    await closed();
    act(() => d?.onStart?.('sent'));
    await openAsk();
    expect(await boxOf()).toHaveValue('');
  });
  it('words typed for each computer come back with it: A, then B, then A again', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    await openAsk();
    await userEvent.type(await boxOf(), 'words for B');
    show(C);
    await closed();
    await openAsk();
    expect(await boxOf()).toHaveValue('');
    await userEvent.type(await boxOf(), 'words for C');
    show(B);
    await closed();
    await openAsk();
    expect(await boxOf()).toHaveValue('words for B');
    show(C);
    await closed();
    await openAsk();
    expect(await boxOf()).toHaveValue('words for C');
  });
  it('a re-read that fails while the drawer is closed: the drawer still opens, says why, and Read the rules again recovers', async () => {
    boot2(C);
    await screen.findByText('No SSH from there');
    failReads = true;
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ask the Agent/ })).toBeInTheDocument());
    const d = await openAsk();
    expect(await within(d).findByText(strings['fw.agent.stale'].replace('{{name}}', C.name))).toBeInTheDocument();
    expect(explainB()).toBeDisabled();
    failReads = false;
    await userEvent.click(within(d).getByRole('button', { name: strings['fw.agent.reread'] }));
    await waitFor(() => expect(explainB()).toBeEnabled());
  });
  it('the re-reads after a sent start stop when another computer is shown', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    const before = reads;
    vi.useFakeTimers();
    try {
      act(() => d?.onStart?.('sent'));
      act(() => show(B));
      await act(async () => { vi.advanceTimersByTime(31_000); });
    } finally {
      vi.useRealTimers();
    }
    // Showing borealis reads its (stale) list once; no timed re-read follows.
    expect(reads).toBeLessThanOrEqual(before + 1);
  });
  it('C9: leaving a computer and coming back keeps its pause; another computer is not paused by it', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    const box = await boxOf();
    await userEvent.type(box, 'open port 8080');
    await userEvent.click(sendB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    show(B);
    await closed();
    await openAsk();
    expect(explainB()).toBeEnabled();
    expect(screen.queryByText(ask['aa.held'])).toBeNull();
    show(C);
    await closed();
    await openAsk();
    const back = await boxOf();
    expect(screen.getByText(ask['aa.held'])).toBeInTheDocument();
    expect(explainB()).toBeDisabled();
    await userEvent.type(back, 'open port 8080');
    expect(sendB()).toBeDisabled();
    await userEvent.type(back, '{Enter}');
    await userEvent.click(explainB());
    expect(take()).toBeUndefined();
    // The first start's late definite answer still lifts atlas's pause after the remount.
    act(() => d?.onStart?.('notSent'));
    expect(sendB()).toBeEnabled();
  });
  it('C9: after switching back, the warned choice still shows and is the only way to ask again', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    await userEvent.type(await boxOf(), 'open port 8080');
    await userEvent.click(sendB());
    act(() => take()?.onStart?.('unknown'));
    show(B);
    await closed();
    show(C);
    await openAsk();
    const back = await boxOf();
    expect(screen.getByText(ask['aa.unknown'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ask['aa.look'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: ask['aa.release'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(ask['aa.releaseBody']);
    await userEvent.click(within(dlg).getByRole('button', { name: ask['aa.releaseGo'] }));
    expect(take()).toBeUndefined();
    await userEvent.type(back, 'open port 8080');
    await waitFor(() => expect(sendB()).toBeEnabled());
    await userEvent.click(sendB());
    expect(take()?.text).toMatch(/^open port 8080/);
  });
  it('a late sent after the whole Firewall left and came back still starts the re-reads', async () => {
    const show = boot2(C);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    show(null);
    show(C);
    await openAsk();
    await screen.findByText(ask['aa.held']);
    const before = reads;
    vi.useFakeTimers();
    try {
      act(() => d?.onStart?.('sent'));
      await act(async () => { vi.advanceTimersByTime(31_000); });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(before + 2));
  });
  it('coming back to a computer does not say a definite answer again', async () => {
    const show = boot2(B);
    await screen.findByText('No SSH from there');
    show(C);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    // A late answer, so the drawer stays open and says it.
    act(() => d?.onStart?.('unknown'));
    act(() => d?.onStart?.('sent'));
    expect(screen.getByText(ask['aa.sent'])).toBeInTheDocument();
    show(B);
    await closed();
    show(C);
    await openAsk();
    expect(screen.queryByText(ask['aa.sent'])).toBeNull();
  });
  it('a failed re-read keeps the words and the outcome, and starts nothing until a read succeeds', async () => {
    boot2(C);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    act(() => d?.onStart?.('sent'));
    const box = await boxOf();
    await userEvent.type(box, 'block ping instead');
    failReads = true;
    await userEvent.click(screen.getByRole('button', { name: strings['fw.agent.reread'] }));
    await waitFor(() => expect(sendB()).toBeDisabled());
    expect(box).toHaveValue('block ping instead');
    expect(screen.getByText(ask['aa.sent'])).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText(strings['fw.agent.stale'].replace('{{name}}', C.name))).toBeInTheDocument();
    expect(explainB()).toBeDisabled();
    expect(screen.queryByText(SUMMARY)).toBeNull();
    failReads = false;
    await userEvent.click(screen.getByRole('button', { name: strings['fw.agent.reread'] }));
    await waitFor(() => expect(sendB()).toBeEnabled());
    expect(box).toHaveValue('block ping instead');
  });
  it('other renders between the ticks never postpone the re-read', async () => {
    const show = boot2(C);
    await openAsk();
    await userEvent.click(explainB());
    const d = take();
    const before = reads;
    vi.useFakeTimers();
    try {
      act(() => d?.onStart?.('sent'));
      for (let i = 0; i < 6; i++) {
        await act(async () => { vi.advanceTimersByTime(10_000); });
        act(() => show({ ...C }));
      }
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(before + 3));
  });
});
