// AskAgent.test.tsx: the kit's "Ask the Agent". One question per key at a time (C9): held while it waits
// to be taken or may have reached the Agent, across remounts and other keys; "Stop tracking" lifts the hold, never a
// second send by itself; an older question's late answer neither speaks nor lifts; a question the page could not
// build sends nothing and says so; Explain is the drawer's primary and has the focus (open, then Enter); placement in
// a section head is the kit's (withAskAgent).
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { dropAskDraft, useAskDock, type AskDock } from '../ask';
import type { ActionSpec } from '../layouts/anatomy/types';
import { AskAgentButton, askAgentHeld, resetAskAgentForTests, useAskAgent, withAskAgent, type AgentQuestion, type UseAskAgentOptions } from './AskAgent';
import strings from './AskAgent.strings.en.json';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running' };
const Q: AgentQuestion = { text: 'Explain the firewall of atlas', context: 'rules: none' };
const outcomes: string[] = [];

function Ask(p: Partial<UseAskAgentOptions> & { k?: string; q?: AgentQuestion | null }) {
  const a = useAskAgent({
    askKey: p.k ?? 'k1',
    subject: 'the firewall of atlas',
    source: 'Firewall',
    computer: C,
    reads: 'rules: none',
    explain: { run: (send) => send(p.q === undefined ? Q : p.q) },
    tell: { label: 'Tell the Agent what you want', check: (text) => (text.length > 20 ? { problem: 'Too long' } : { q: { text } }) },
    onOutcome: (o, kind) => outcomes.push(`${kind}:${o}`),
    ...p,
  });
  return (
    <>
      <Probe />
      <AskAgentButton ask={a} />
      {a.drawer}
    </>
  );
}

let dock: AskDock | null = null;
function Probe() {
  dock = useAskDock();
  return null;
}
const theDock = () => ({ current: dock! });
function take() {
  let d: ReturnType<AskDock['takeDraft']>;
  act(() => { d = dock!.takeDraft(C.id); });
  return d;
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: strings['aa.name'].replace('{{subject}}', 'the firewall of atlas') }));
  return screen.findByRole('dialog');
}
const explain = () => within(screen.getByRole('dialog')).getByRole('button', { name: strings['aa.explain'] });
const send = () => within(screen.getByRole('dialog')).getByRole('button', { name: strings['aa.send'] });

afterEach(() => {
  act(() => dropAskDraft());
  cleanup();
  dock = null;
  outcomes.length = 0;
  resetAskAgentForTests();
});

describe('useAskAgent', () => {
  it('the head action: "Ask the Agent", named for its subject, opening a drawer titled the same', async () => {
    render(<Ask />);
    const b = screen.getByRole('button', { name: 'Ask the Agent about the firewall of atlas' });
    expect(b).toHaveTextContent(strings['aa.label']);
    expect(b).toHaveAttribute('aria-haspopup', 'dialog');
    const d = await open();
    expect(d).toHaveTextContent('Ask the Agent about the firewall of atlas');
    expect(d).toHaveTextContent(strings['aa.on'].replace('{{computer}}', 'atlas'));
  });

  it('open, then Enter: Explain is the primary and has the focus; it starts one new conversation on the computer', async () => {
    render(<Ask />);
    await open();
    await waitFor(() => expect(explain()).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    const d = take();
    expect(d?.start).toBe(true);
    expect(d?.computer).toBe(C.id);
    expect(d?.source).toBe('Firewall');
  });

  it('a direct "sent" closes the drawer and clears the words; reopened, nothing definite is said again', async () => {
    render(<Ask />);
    await open();
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'open port 80');
    await userEvent.click(send());
    act(() => take()?.onStart?.('sent'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(outcomes).toEqual(['tell:sent']);
    await open();
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('dialog')).not.toHaveTextContent(strings['aa.sent']);
    expect(askAgentHeld('k1')).toBe(false);
  });

  it('waiting, then unknown: held; nothing else is sent (Explain, Send, Enter); the words stay', async () => {
    render(<Ask />);
    await open();
    const box = within(screen.getByRole('dialog')).getByRole('textbox');
    await userEvent.type(box, 'open port 80');
    await userEvent.click(explain());
    expect(screen.getByText(strings['aa.waiting'])).toBeInTheDocument();
    expect(askAgentHeld('k1')).toBe(true);
    const d = take();
    act(() => d?.onStart?.('unknown'));
    expect(screen.getByText(strings['aa.unknown'])).toBeInTheDocument();
    expect(screen.getByText(strings['aa.held'])).toBeInTheDocument();
    expect(explain()).toBeDisabled();
    expect(send()).toBeDisabled();
    await userEvent.click(explain());
    await userEvent.click(send());
    await userEvent.type(box, '{Enter}');
    expect(take()).toBeUndefined();
    // Enter in the multiline box is a new line, never a send.
    expect((box as HTMLTextAreaElement).value.trim()).toBe('open port 80');
  });

  it('the hold outlives the component and the drawer, and binds only its own key', async () => {
    const r = render(<Ask />);
    await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('unknown'));
    r.unmount();
    render(<Ask k="k2" />);
    await open();
    expect(explain()).toBeEnabled();
    cleanup();
    render(<Ask />);
    await open();
    expect(explain()).toBeDisabled();
    expect(screen.getByText(strings['aa.unknown'])).toBeInTheDocument();
  });

  it('Look opens the Agent panel and sends nothing', async () => {
    render(<Ask />);
    await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('unknown'));
    act(() => theDock().current.close());
    await userEvent.click(screen.getByRole('button', { name: strings['aa.look'] }));
    expect(theDock().current.isOpen).toBe(true);
    expect(take()).toBeUndefined();
  });

  it('Stop tracking: warned; cancel keeps the hold; confirm lifts it and sends nothing by itself', async () => {
    render(<Ask />);
    await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('unknown'));
    await userEvent.click(screen.getByRole('button', { name: strings['aa.release'] }));
    const warn = await screen.findByRole('alertdialog');
    expect(warn).toHaveTextContent(strings['aa.releaseBody']);
    await userEvent.click(within(warn).getByRole('button', { name: /cancel/i }));
    expect(askAgentHeld('k1')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: strings['aa.release'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['aa.releaseGo'] }));
    expect(askAgentHeld('k1')).toBe(false);
    expect(take()).toBeUndefined();
    await waitFor(() => expect(explain()).toBeEnabled());
    await userEvent.click(explain());
    expect(take()?.start).toBe(true);
  });

  it("an older question's late answer neither speaks over nor lifts the newer one's hold, nor closes the drawer", async () => {
    render(<Ask />);
    await open();
    await userEvent.click(explain());
    const d1 = take();
    act(() => d1?.onStart?.('unknown'));
    await userEvent.click(screen.getByRole('button', { name: strings['aa.release'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['aa.releaseGo'] }));
    await waitFor(() => expect(explain()).toBeEnabled());
    await userEvent.click(explain());
    const d2 = take();
    act(() => d2?.onStart?.('unknown'));
    act(() => d1?.onStart?.('sent'));
    act(() => d1?.onStart?.('notSent'));
    expect(screen.getByText(strings['aa.unknown'])).toBeInTheDocument();
    expect(askAgentHeld('k1')).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(outcomes).toEqual(['explain:unknown', 'explain:unknown']);
  });

  it('a late "sent" after "unknown" lifts the hold and says it, but closes nothing and keeps newer words', async () => {
    render(<Ask />);
    await open();
    const box = within(screen.getByRole('dialog')).getByRole('textbox');
    await userEvent.type(box, 'first');
    await userEvent.click(send());
    const d = take();
    act(() => d?.onStart?.('unknown'));
    await userEvent.clear(box);
    await userEvent.type(box, 'second');
    act(() => d?.onStart?.('sent'));
    expect(screen.getByText(strings['aa.sent'])).toBeInTheDocument();
    expect(box).toHaveValue('second');
    expect(askAgentHeld('k1')).toBe(false);
  });

  it('not sent: said, no hold, the words kept for another press', async () => {
    render(<Ask />);
    await open();
    const box = within(screen.getByRole('dialog')).getByRole('textbox');
    await userEvent.type(box, 'block ping');
    await userEvent.click(send());
    act(() => dropAskDraft());
    expect(await screen.findByText(strings['aa.notSent'])).toBeInTheDocument();
    expect(box).toHaveValue('block ping');
    expect(send()).toBeEnabled();
  });

  it('a question the page could not build sends nothing and says the details could not be read', async () => {
    render(<Ask q={null} />);
    await open();
    await userEvent.click(explain());
    expect(screen.getByText(strings['aa.unread'])).toBeInTheDocument();
    expect(take()).toBeUndefined();
    expect(askAgentHeld('k1')).toBe(false);
  });

  it("the page's check: a problem shows under the field and nothing is sent", async () => {
    render(<Ask />);
    await open();
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'x'.repeat(21));
    expect(screen.getByText('Too long')).toBeInTheDocument();
    expect(send()).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(take()).toBeUndefined();
  });

  it('a disabled reason: the action says why and opens nothing', () => {
    render(<Ask disabledReason="The rules could not be read" />);
    expect(screen.getByRole('button', { name: /^Ask the Agent/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('another key on the same component: its own words, closed; back on the first key, its words again', async () => {
    const r = render(<Ask />);
    await open();
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'mine');
    r.rerender(<Ask k="k2" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    const box2 = within(screen.getByRole('dialog')).getByRole('textbox');
    expect(box2).toHaveValue('');
    await userEvent.type(box2, 'theirs');
    r.rerender(<Ask k="k1" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('mine');
    r.rerender(<Ask k="k2" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('theirs');
  });

  it('a sent Tell on a key no longer shown clears the words of that key only, and closes nothing here', async () => {
    const r = render(<Ask />);
    await open();
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'block ping');
    await userEvent.click(send());
    const d = take();
    r.rerender(<Ask k="k2" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    await userEvent.type(within(screen.getByRole('dialog')).getByRole('textbox'), 'block ping');
    act(() => d?.onStart?.('sent'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('block ping');
    r.rerender(<Ask k="k1" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await open();
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('');
  });

  it('opensDisabled: the action opens the drawer, which says why; Explain and Send stay off', async () => {
    render(<Ask disabledReason="The rules could not be read" opensDisabled after={<button type="button">Read the rules again</button>} />);
    const d = await open();
    expect(within(d).getByText('The rules could not be read')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Read the rules again' })).toBeInTheDocument();
    expect(explain()).toBeDisabled();
    await userEvent.type(within(d).getByRole('textbox'), 'x');
    expect(send()).toBeDisabled();
    await userEvent.click(explain());
    expect(take()).toBeUndefined();
  });
});

describe('the drawer says where it asks in its subtitle, has one primary, and one outcome line (in the drawer footer)', () => {
  const bands = (d: HTMLElement) => d.querySelectorAll('div[role="alert"], div[role="status"]');

  it("'aa.on' is the drawer's subtitle under its title, not a paragraph of the body", async () => {
    render(<Ask />);
    const d = await open();
    const on = within(d).getByText(strings['aa.on'].replace('{{computer}}', 'atlas'));
    expect(on.closest('header')).not.toBeNull();
  });

  it('one primary: Explain; Send to the Agent is a text action beside the words', async () => {
    render(<Ask />);
    const d = await open();
    expect(explain()).toHaveAttribute('data-variant', 'primary');
    expect(send()).toHaveAttribute('data-variant', 'ghost');
    expect(within(d).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')).toHaveLength(1);
  });

  // In the own drawer the line is the footer's, the body holds no Band.
  const inBody = (d: HTMLElement) => [...bands(d)].filter((b) => !b.closest('footer'));
  const foot = (d: HTMLElement) => d.querySelector('footer') as HTMLElement;

  it('a disabled reason and a held question: one Outcome line in the footer says both, and no Band in the body', async () => {
    const r = render(<Ask />);
    await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('unknown'));
    r.rerender(<Ask disabledReason="The rules could not be read" opensDisabled />);
    const d = screen.getByRole('dialog');
    expect(inBody(d)).toHaveLength(0);
    const lines = foot(d).querySelectorAll('[data-outcome]');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('data-outcome', 'pending');
    expect(lines[0]).toHaveTextContent(strings['aa.unknown']);
    expect(lines[0]).toHaveTextContent('The rules could not be read');
    expect(lines[0]).toHaveTextContent(strings['aa.held']);
    expect(foot(d).querySelector('[data-drawer-reason]')).toBeNull();
  });

  it("a disabled reason alone is the footer's reason line; nothing asked and nothing blocked shows no line", async () => {
    const r = render(<Ask disabledReason="The rules could not be read" opensDisabled />);
    let d = await open();
    expect(inBody(d)).toHaveLength(0);
    expect(foot(d).querySelector('[data-drawer-reason]')).toHaveTextContent('The rules could not be read');
    expect(foot(d).querySelector('[data-outcome]')).toBeNull();
    r.unmount();
    resetAskAgentForTests();
    render(<Ask k="k2" />);
    d = await open();
    expect(bands(d)).toHaveLength(0);
    expect(foot(d).querySelector('[data-drawer-reason], [data-outcome]')).toBeNull();
  });

  it("nothing reached the Agent: the footer's line says not sent, Explain stays the one primary", async () => {
    render(<Ask />);
    const d = await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('notSent'));
    const line = foot(d).querySelector('[data-outcome]');
    expect(line).toHaveAttribute('data-outcome', 'not_sent');
    expect(line).toHaveTextContent(strings['aa.notSent']);
    expect(inBody(d)).toHaveLength(0);
    expect(within(d).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')).toHaveLength(1);
  });

  // The step (a host drawer shows the panel), a blocked Explain, and a held question's actions.
  function StepAsk(p: Partial<UseAskAgentOptions>) {
    const a = useAskAgent({
      askKey: 'k1',
      subject: 'the firewall of atlas',
      source: 'Firewall',
      computer: C,
      reads: 'rules: none',
      explain: { run: (send) => send(Q) },
      tell: { label: 'Tell the Agent what you want', check: (text) => ({ q: { text } }) },
      mode: 'step',
      ...p,
    });
    return (
      <>
        <Probe />
        <button type="button" onClick={() => a.open()}>
          host
        </button>
        <span data-testid="sub">{a.subtitle}</span>
        <div data-testid="panel">{a.panel}</div>
      </>
    );
  }
  const primaries = (el: HTMLElement) => within(el).getAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary');

  it('a step: the subtitle is given to the host and is the panel\'s first line, once; Explain the one primary, Send a text action', async () => {
    render(<StepAsk />);
    const on = strings['aa.on'].replace('{{computer}}', 'atlas');
    expect(screen.getByTestId('sub')).toHaveTextContent(on);
    await userEvent.click(screen.getByRole('button', { name: 'host' }));
    const panel = screen.getByTestId('panel');
    expect(within(panel).getAllByText(on)).toHaveLength(1);
    expect(panel.querySelector('p')).toHaveTextContent(on);
    expect(primaries(panel)).toHaveLength(1);
    expect(primaries(panel)[0]).toHaveTextContent(strings['aa.explain']);
    expect(within(panel).getByRole('button', { name: strings['aa.send'] })).toHaveAttribute('data-variant', 'ghost');
  });

  it('a step with Explain blocked: still one primary, disabled, and the reason in the one Band', async () => {
    render(<StepAsk disabledReason="The rules could not be read" opensDisabled />);
    await userEvent.click(screen.getByRole('button', { name: 'host' }));
    const panel = screen.getByTestId('panel');
    expect(primaries(panel)).toHaveLength(1);
    expect(primaries(panel)[0]).toBeDisabled();
    expect(bands(panel)).toHaveLength(1);
    expect(bands(panel)[0]).toHaveTextContent('The rules could not be read');
  });

  // The 480 px footer holds the line, Close and Explain only; a held question's actions are a row in the body.
  it('a held question keeps both its actions in a row at the body end, outside any Band; the footer keeps only Close and Explain', async () => {
    const r = render(<Ask />);
    await open();
    await userEvent.click(explain());
    act(() => take()?.onStart?.('unknown'));
    for (const more of [{}, { disabledReason: 'The rules could not be read', opensDisabled: true }]) {
      r.rerender(<Ask {...more} />);
      const d = screen.getByRole('dialog');
      expect(inBody(d)).toHaveLength(0);
      expect(foot(d).querySelectorAll('[data-outcome]')).toHaveLength(1);
      expect(within(foot(d)).getAllByRole('button').map((x) => x.textContent)).toEqual([strings['aa.close'], strings['aa.explain']]);
      for (const name of [strings['aa.look'], strings['aa.release']]) {
        const x = within(d).getByRole('button', { name });
        expect(x.closest('footer')).toBeNull();
        expect(x.closest('div[role="alert"], div[role="status"]')).toBeNull();
      }
      expect(primaries(d)).toHaveLength(1);
    }
  });
});

describe('withAskAgent: the kit places it', () => {
  const ask: ActionSpec = { id: 'ask-agent', label: 'Ask the Agent', name: 'Ask the Agent about x', icon: 'sparkle', opens: 'dialog', onPress: () => {} };
  const a: ActionSpec = { id: 'a', label: 'A', onPress: () => {} };
  const b: ActionSpec = { id: 'b', label: 'B', onPress: () => {} };
  it('a free secondary slot: there', () => {
    expect(withAskAgent(undefined, ask).secondary).toEqual([ask]);
    expect(withAskAgent({ secondary: [a] }, ask).secondary).toEqual([a, ask]);
  });
  it('no slot free: the top of the ⋯ menu, its name as the item, before the page items', () => {
    const out = withAskAgent({ secondary: [a, b], menu: [{ id: 'm', label: 'M', onAction: () => {} }] }, ask);
    expect(out.secondary).toEqual([a, b]);
    expect(out.menu?.[0]).toMatchObject({ id: 'ask-agent', label: 'Ask the Agent about x', opens: true, isDisabled: false });
    expect(out.menu?.[1]).toBe('-');
    expect(out.menu?.[2]).toMatchObject({ id: 'm' });
    const off = withAskAgent({ secondary: [a, b] }, { ...ask, disabledReason: 'why' });
    expect(off.menu).toHaveLength(1);
    expect(off.menu?.[0]).toMatchObject({ isDisabled: true, disabledReason: 'why' });
  });
});
