// AgentSettings: before a conversation exists every value is a draft the caller holds; once it exists the model is
// fixed (another model offers a new conversation and sends nothing), and every other change is sent once and shows
// "Saved" only when the conversation read back shows it, else "may have gone through" with Check again (which sends
// nothing). Effort shows only for a reasoning model or Claude Code with the agent's efforts; Claude Code models come
// only from the agent; ensembles only where the caller says they run.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { AgentSettings, NEW_DRAFT, type AgentDraft } from './AgentSettings';
import strings from './AgentSettings.strings.en.json';

type Body = Record<string, unknown>;
const W = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  yolo: false,
  acp: null as null | Record<string, unknown>,
  lands: true,
  // A definite refusal code for the next change (the agent's 409 on a locked policy).
  fail: null as string | null,
  // While set, a change's answer waits until the test releases it.
  hold: false,
  held: [] as Array<() => void>,
  sent: [] as string[],
  models: [] as Array<Record<string, unknown>>,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const ok = (body: unknown) => Promise.resolve({ ok: true as const, body });
  const write = (k: string, v: unknown) => {
    W.sent.push(`${k}=${String(v)}`);
    if (W.fail) return Promise.resolve({ ok: false as const, err: { kind: 'failed' as const, code: W.fail, status: 409, retryAfter: null, details: {} } });
    if (W.lands) {
      if (k === 'yolo') W.yolo = v as boolean;
      else W.row[k] = v;
    }
    if (!W.hold) return ok({ status: 'ok' });
    return new Promise<{ ok: true; body: unknown }>((resolve) => W.held.push(() => resolve({ ok: true, body: { status: 'ok' } })));
  };
  const fakeAgent: CoreMod.agent.AgentApi = {
    session: () => ok({ session: { ...W.row } }),
    approval: () => ok({ mode: 'default', locked: false, revision: 0, yolo: W.yolo }),
    setEffort: (_id, e) => write('effort', e),
    setVerbosity: (_id, l) => write('verbosity', l),
    setYolo: (_id, on) => write('yolo', on),
    acp: () => (W.acp ? ok(W.acp) : Promise.resolve({ ok: false as const, err: { kind: 'failed' as const, code: '', status: 404, retryAfter: null, details: {} } })),
  };
  return {
    ...real,
    agent: { ...real.agent, agentApi: () => fakeAgent },
    providers: {
      ...real.providers,
      providersApi: () => ({
        catalogue: () => ok(real.providers.catalogue({
          providers: { providers: [{ id: 'hoody-ai', display_name: 'Hoody AI', status: { state: 'ready' } }, { id: 'openai', display_name: 'OpenAI', status: { state: 'ready' } }] },
          models: { models: W.models },
          ready: { models: W.models.filter((m) => m.source !== 'fusion') },
        })),
      }),
    },
  };
});

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'srv' } } as unknown as Target;
const MODELS = [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
  { spec: 'openai/o9', display_name: 'O9 Thinker', reasoning: true },
  { spec: 'fusion/duo', display_name: 'Duo', source: 'fusion', members: ['hoody-ai/hoody-free'] },
];
const CLAUDE = (extra: Body = {}) => ({ status: 'ok', report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, ...extra });

beforeEach(() => {
  W.row = { id: 's1', model: 'hoody-ai/hoody-free', verbosity: 'normal' };
  W.yolo = false;
  W.acp = null;
  W.lands = true;
  W.fail = null;
  W.hold = false;
  W.held = [];
  W.sent = [];
  W.models = MODELS;
});

function Draft(p: { start?: AgentDraft; seen: AgentDraft[]; claudeCode?: boolean; fusion?: boolean }) {
  const [d, setD] = useState(p.start ?? NEW_DRAFT);
  return (
    <AgentSettings
      target={TARGET}
      session={null}
      draft={d}
      onDraft={(n) => {
        p.seen.push(n);
        setD(n);
      }}
      claudeCode={p.claudeCode}
      fusion={p.fusion}
    />
  );
}

/** Turning a live conversation's Auto-approve back On asks first; this answers the dialog. */
const turnOn = async () => {
  const d = await screen.findByRole('alertdialog');
  await userEvent.click(within(d).getByRole('button', { name: strings['as.yoloConfirmGo'] }));
};

const pickSelect = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
};

describe('AgentSettings, before the conversation exists', () => {
  it('holds every value as a draft and sends nothing', async () => {
    const seen: AgentDraft[] = [];
    render(<Draft seen={seen} />);
    expect(await screen.findByRole('radio', { name: /Hoody Free/ })).toBeInTheDocument();
    expect(screen.getByText(strings['as.modelDefault'])).toBeInTheDocument();
    // No reasoning model chosen: no effort.
    expect(screen.queryByRole('button', { name: new RegExp(strings['as.effort']) })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: /O9 Thinker/ }));
    expect(seen.at(-1)).toMatchObject({ model: 'openai/o9', effort: '' });
    await pickSelect(strings['as.effort'], strings['as.effort.xhigh']);
    expect(seen.at(-1)).toMatchObject({ model: 'openai/o9', effort: 'xhigh' });
    await pickSelect(strings['as.verbosity'], strings['as.verbosity.terse']);
    // Auto-approve starts On for a new conversation: the press turns it Off.
    await userEvent.click(screen.getByRole('switch', { name: strings['as.yolo'] }));
    expect(seen.at(-1)).toEqual({ model: 'openai/o9', effort: 'xhigh', verbosity: 'terse', yolo: false });
    expect(W.sent).toEqual([]);
  });

  it('a new conversation starts with Auto-approve On, says so in words, and On again after Off in the draft names the effect first', async () => {
    expect(NEW_DRAFT.yolo).toBe(true);
    const seen: AgentDraft[] = [];
    render(<Draft seen={seen} />);
    const sw = () => screen.getByRole('switch', { name: strings['as.yolo'] });
    expect(sw()).toBeChecked();
    expect(screen.getByText(strings['as.yoloOn'])).toBeInTheDocument();
    await userEvent.click(sw());
    expect(sw()).not.toBeChecked();
    expect(screen.getByText(strings['as.yoloOff'])).toBeInTheDocument();
    const before = seen.length;
    await userEvent.click(sw());
    const d = await screen.findByRole('alertdialog');
    expect(seen.length).toBe(before);   // nothing changes until Turn on
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw());
    await turnOn();
    expect(sw()).toBeChecked();
    expect(seen.at(-1)).toMatchObject({ yolo: true });
    expect(W.sent).toEqual([]);
  });

  it('ensembles show only where the caller says they run', async () => {
    const { unmount } = render(<Draft seen={[]} />);
    await screen.findByRole('radio', { name: /Hoody Free/ });
    expect(screen.queryByRole('radio', { name: /Duo/ })).toBeNull();
    unmount();
    render(<Draft seen={[]} fusion />);
    expect(await screen.findByRole('radio', { name: /Duo/ })).toBeInTheDocument();
  });

  it('an agent without Claude Code\'s set offers Claude\'s default only, with no effort', async () => {
    W.acp = CLAUDE();
    const seen: AgentDraft[] = [];
    render(<Draft seen={seen} claudeCode />);
    await userEvent.click(await screen.findByRole('radio', { name: new RegExp(strings['as.claudeDefault']) }));
    expect(seen.at(-1)?.model).toBe('claude-code');
    expect(screen.queryByRole('button', { name: new RegExp(strings['as.effort']) })).toBeNull();
  });

  it('Claude Code models and efforts are the agent\'s own', async () => {
    W.acp = CLAUDE({ claude_code: { models: [{ id: 'opus', label: 'Opus Big' }], efforts: ['low', 'max'] } });
    render(<Draft seen={[]} claudeCode start={{ ...NEW_DRAFT, model: 'claude-code/opus' }} />);
    expect(await screen.findByRole('radio', { name: /Opus Big/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['as.effort']) }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual([strings['as.effort.default'], strings['as.effort.low'], strings['as.effort.max']]);
  });
});

describe('AgentSettings, on a conversation', () => {
  it('the model is fixed: another model offers a new conversation and sends nothing', async () => {
    const onNew = vi.fn();
    render(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(screen.getByRole('radio', { name: /O9 Thinker/ }));
    expect(screen.getByText(strings['as.modelFixed'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['as.modelNew'] }));
    expect(onNew).toHaveBeenCalledWith('openai/o9');
    expect(W.sent).toEqual([]);
  });

  it('a change is sent once and Saved only after the read-back shows it', async () => {
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['as.yolo'] })).not.toBeDisabled());
    await pickSelect(strings['as.verbosity'], strings['as.verbosity.minimal']);
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    expect(W.sent).toEqual(['verbosity=minimal']);
  });

  it('a change the read-back does not show may have gone through: Check again reads, never resends', async () => {
    W.lands = false;
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['as.yolo'] })).not.toBeDisabled());
    await userEvent.click(screen.getByRole('switch', { name: strings['as.yolo'] }));
    await turnOn();
    const again = await screen.findByRole('button', { name: /Check again/ });
    expect(screen.queryByText(strings['as.saved'])).toBeNull();
    expect(screen.getByRole('switch', { name: strings['as.yolo'] })).toBeDisabled();
    // The change lands late; Check again proves it without sending anything more.
    W.yolo = true;
    await act(async () => {
      await userEvent.click(again);
    });
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    expect(W.sent).toEqual(['yolo=true']);
  });

  it('while a change runs every control waits, and nothing else is sent', async () => {
    render(<AgentSettings target={TARGET} session="s1" />);
    const yolo = () => screen.getByRole('switch', { name: strings['as.yolo'] });
    const verbosity = () => screen.getByRole('button', { name: new RegExp(strings['as.verbosity']) });
    await waitFor(() => expect(yolo()).not.toBeDisabled());
    W.hold = true;
    await userEvent.click(yolo());
    await turnOn();
    await waitFor(() => expect(W.held).toHaveLength(1));
    expect(yolo()).toBeDisabled();
    expect(verbosity()).toBeDisabled();
    await act(async () => {
      for (const go of W.held.splice(0)) go();
    });
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    await waitFor(() => expect(verbosity()).not.toBeDisabled());
    expect(W.sent).toEqual(['yolo=true']);
  });

  it('while a change runs the model and Start a new conversation wait too: a press starts nothing', async () => {
    const onNew = vi.fn();
    render(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    const o9 = () => screen.getByRole('radio', { name: /O9 Thinker/ });
    const fresh = () => screen.getByRole('button', { name: strings['as.modelNew'] });
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['as.yolo'] })).not.toBeDisabled());
    await userEvent.click(o9());
    expect(fresh()).not.toBeDisabled();
    W.hold = true;
    await pickSelect(strings['as.verbosity'], strings['as.verbosity.minimal']);
    await waitFor(() => expect(W.held).toHaveLength(1));
    expect(o9()).toHaveAttribute('aria-disabled', 'true');
    expect(fresh()).toBeDisabled();
    await userEvent.click(fresh());
    expect(onNew).not.toHaveBeenCalled();
    await act(async () => {
      for (const go of W.held.splice(0)) go();
    });
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    await waitFor(() => expect(fresh()).not.toBeDisabled());
    expect(o9()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(fresh());
    expect(onNew).toHaveBeenCalledWith('openai/o9');
    expect(W.sent).toEqual(['verbosity=minimal']);
  });

  it('an unsettled change\'s Check again waits, shown as checking, while another change runs', async () => {
    W.lands = false;
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(screen.getByRole('switch', { name: strings['as.yolo'] })).not.toBeDisabled());
    await userEvent.click(screen.getByRole('switch', { name: strings['as.yolo'] }));
    await turnOn();
    await screen.findByRole('button', { name: /Check again/ });
    W.lands = true;
    W.hold = true;
    await pickSelect(strings['as.verbosity'], strings['as.verbosity.minimal']);
    await waitFor(() => expect(W.held).toHaveLength(1));
    expect(await screen.findByRole('button', { name: /Checking/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check again/ })).toBeNull();
    await act(async () => {
      for (const go of W.held.splice(0)) go();
    });
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Check again/ })).toBeInTheDocument();
    expect(W.sent).toEqual(['yolo=true', 'verbosity=minimal']);
  });

  it('a Claude Code conversation offers only Claude Code models and its live effort', async () => {
    W.acp = CLAUDE({ claude_code: { models: [{ id: 'opus', label: 'Opus Big' }], efforts: ['high'] } });
    W.row = { id: 's1', backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'opus', effort: 'high', verbosity: 'normal' };
    render(<AgentSettings target={TARGET} session="s1" claudeCode fusion />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Opus Big/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByRole('radio', { name: /Hoody Free/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Duo/ })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(strings['as.effort']) })).toHaveTextContent(strings['as.effort.high']);
  });

  it('a proposed model belongs to its computer and conversation: a rerender on another drops it', async () => {
    const onNew = vi.fn();
    const T2 = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'srv' } } as unknown as Target;
    const { rerender } = render(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(screen.getByRole('radio', { name: /O9 Thinker/ }));
    expect(screen.getByRole('button', { name: strings['as.modelNew'] })).toBeInTheDocument();
    W.row = { id: 's2', model: 'hoody-ai/hoody-free', verbosity: 'normal' };
    rerender(<AgentSettings target={T2} session="s2" onNewConversation={onNew} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByRole('button', { name: strings['as.modelNew'] })).toBeNull();
    expect(screen.getByRole('radio', { name: /O9 Thinker/ })).toHaveAttribute('aria-checked', 'false');
    // Into a draft: no proposal either.
    rerender(<AgentSettings target={TARGET} session={null} onNewConversation={onNew} />);
    expect(screen.queryByRole('button', { name: strings['as.modelNew'] })).toBeNull();
    expect(onNew).not.toHaveBeenCalled();
  });

  it('a proposal is dropped on leaving its conversation: coming back does not bring it back', async () => {
    const onNew = vi.fn();
    const { rerender } = render(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(screen.getByRole('radio', { name: /O9 Thinker/ }));
    expect(screen.getByRole('button', { name: strings['as.modelNew'] })).toBeInTheDocument();
    rerender(<AgentSettings target={TARGET} session="s2" onNewConversation={onNew} />);
    rerender(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByRole('button', { name: strings['as.modelNew'] })).toBeNull();
  });

  it('a proposal no longer among the current rows is not offered', async () => {
    const onNew = vi.fn();
    const { rerender } = render(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} fusion />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Hoody Free/ })).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(screen.getByRole('radio', { name: /Duo/ }));
    expect(screen.getByRole('button', { name: strings['as.modelNew'] })).toBeInTheDocument();
    // Same computer and conversation, but ensembles are no longer offered here.
    rerender(<AgentSettings target={TARGET} session="s1" onNewConversation={onNew} />);
    expect(screen.queryByRole('button', { name: strings['as.modelNew'] })).toBeNull();
  });

  it('a dormant conversation: effort and reply length are unknown and cannot be changed', async () => {
    W.acp = CLAUDE({ claude_code: { models: [{ id: 'opus', label: 'Opus Big' }], efforts: ['high'] } });
    W.row = { id: 's1', backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'opus', delegated_effort: 'high' };
    render(<AgentSettings target={TARGET} session="s1" claudeCode />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Opus Big/ })).toHaveAttribute('aria-checked', 'true'));
    const effort = screen.getByRole('button', { name: new RegExp(strings['as.effort']) });
    expect(effort).toHaveTextContent(strings['as.unknown']);
    expect(effort).toBeDisabled();
    expect(screen.getByRole('button', { name: new RegExp(strings['as.verbosity']) })).toBeDisabled();
    expect(W.sent).toEqual([]);
  });

  it('a failed conversation read says so and offers to try again', async () => {
    W.row = { id: 'other' };
    render(<AgentSettings target={TARGET} session="s1" />);
    expect(await screen.findByText(strings['as.readFailed'])).toBeInTheDocument();
  });
});

describe('AgentSettings, Auto-approve on a live conversation', () => {
  const sw = () => screen.getByRole('switch', { name: strings['as.yolo'] });
  it('Off to On names the effect first: nothing is sent until Turn on, and Cancel sends nothing', async () => {
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(sw()).not.toBeDisabled());
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw());
    const d = await screen.findByRole('alertdialog');
    expect(within(d).getByText(strings['as.yoloConfirmTitle'])).toBeInTheDocument();
    expect(within(d).getByText(strings['as.yoloConfirmBody'])).toBeInTheDocument();
    expect(W.sent).toEqual([]);
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(W.sent).toEqual([]);
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw());
    await turnOn();
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    expect(W.sent).toEqual(['yolo=true']);
    expect(sw()).toBeChecked();
  });
  it('On to Off is one press: sent at once, no dialog', async () => {
    W.yolo = true;
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(sw()).toBeChecked());
    await waitFor(() => expect(sw()).not.toBeDisabled());
    await userEvent.click(sw());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText(strings['as.saved'])).toBeInTheDocument();
    expect(W.sent).toEqual(['yolo=false']);
  });
  it('a locked or Strict policy refuses the On and the switch says why, never showing On', async () => {
    W.fail = 'approval_policy_locked';
    render(<AgentSettings target={TARGET} session="s1" />);
    await waitFor(() => expect(sw()).not.toBeDisabled());
    await userEvent.click(sw());
    await turnOn();
    expect(await screen.findByText(strings['as.locked'])).toBeInTheDocument();
    expect(sw()).not.toBeChecked();
    expect(screen.queryByText(strings['as.yoloOn'])).toBeNull();
  });
  it('an unknown mode is never drawn as On', async () => {
    render(<AgentSettings target={TARGET} session="s1" />);
    expect(screen.queryByText(strings['as.yoloOn'])).toBeNull();
  });
});

// Auto-approve Off is the agent's default mode (ApprovalMode `default`): it asks when an action needs you, but what was
// allowed in the conversation, the user's rules and hooks can let an action run without asking. The Off text never
// promises asking before every command or file change, and says what can skip it (as ApprovalMode's default does).
describe('Auto-approve Off says what it does, never more', () => {
  const PROMISE = /\b(asks?|ask you)( you)? (before|first)\b/i;
  it('the Off text is drawn for Off and names what can let an action run without asking', () => {
    for (const k of ['as.yoloOff'] as const) {
      expect(strings[k]).not.toMatch(PROMISE);
      expect(strings[k]).toMatch(/your rules and your hooks can let actions run without asking/);
    }
    expect(strings['as.yoloOff']).toMatch(/\bwhen an action needs you\b/);
  });
  it('the failed turn-on note says the chat asks when needed, not "first"', async () => {
    const am = (await import('./ApprovalMode.strings.en.json')).default as Record<string, string>;
    expect(am['am.failedOn']).not.toMatch(PROMISE);
    expect(am['am.failedOn']).toMatch(/asks when needed/);
  });
});
