// SessionTab (Details → Session): the live/fixed split, busy refusals, the session-only model switch and
// its `persisted` / default-changed words, the product's own agents never offered, and C9 (a change is sent once; "Saved" only when the
// read-back shows it; a lost answer is "may have gone through" with Check again, which sends nothing).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { SessionTab } from './SessionTab';
import { forgetApprovalAttempts } from './useApproval';
import { forgetLiveAttempts } from './useLiveSession';
import strings from './SessionTab.strings.en.json';
import apStrings from './ApprovalSection.strings.en.json';
import svStrings from './SessionView.strings.en.json';

type Settled = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed' | 'pending' | 'not_sent' | 'stale'; code: string; status: number; retryAfter: null; details: Record<string, never> } };
const W = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  agents: [] as string[] | null,
  // The next change's answer: ok (with this body), a refusal code, or lost.
  answer: { kind: 'ok' as 'ok' | 'fail' | 'lost', body: {} as Record<string, unknown>, code: '' },
  // Whether a change lands on the conversation (the read-back shows it).
  lands: true,
  hold: false,
  held: [] as Array<() => void>,
  sent: [] as string[],
  reads: 0,
  acp: null as null | Record<string, unknown>,
  // The next reply-length change's answer is lost (and does not land).
  fieldLost: false,
  // The state the conversation moves to when a change reaches it (it started work meanwhile).
  stateOnSend: null as null | string,
  // How many next live-hook conversation reads answer stale (the page moved on).
  staleReads: 0,
  // How many next live-hook reads fail (the conversation stays as last read).
  failReads: 0,
  // Live-hook reads by conversation id, and settings-hook / catalogue reads.
  liveIds: [] as string[],
  settingsReads: 0,
  catCalls: 0,
  catFail: false,
  // Reply-length changes wait for their answer until released.
  fieldHold: false,
  fieldHeld: [] as Array<() => void>,
  // Live-hook conversation reads wait for their answer until released.
  liveHold: false,
  liveHeld: [] as Array<() => void>,
  // The approvals as read, and whether a mode change's answer is lost.
  approval: {} as Record<string, unknown>,
  apLost: false,
  apRealms: [] as Array<string | undefined>,
  apHold: false,
  apHeld: [] as Array<() => void>,
  // Runs inside the next catalogue read, before React renders again (a press landing in that window).
  onCat: null as null | (() => void),
  // Approvals reads (the approvals hook's own), and whether they fail.
  apReads: 0,
  apFail: false,
  // The next reply-length-free effort change: refused with this code, or answered ok without reaching the conversation.
  effortRefuse: '',
  effortLands: true,
  // The Claude Code read waits for its answer until released.
  acpHold: false,
  acpHeld: [] as Array<() => void>,
  // The Claude Code read fails (not a 404: the list is unreadable, not empty).
  acpFail: false,
  acpCalls: 0,
  // Settings-hook conversation reads (effort, reply length) wait for their answer until released; `settingsDone` counts those that RESOLVED.
  settingsHold: false,
  settingsHeld: [] as Array<() => void>,
  settingsDone: 0,
  // The catalogue read waits for its answer until released.
  catHold: false,
  catHeld: [] as Array<() => void>,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const ok = (body: unknown): Promise<Settled> => Promise.resolve({ ok: true, body });
  const err = (kind: 'failed' | 'pending', code: string, status: number): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
  const answer = (k: string, v: string): Promise<Settled> => {
    W.sent.push(`${k}=${v}`);
    if (W.stateOnSend) W.row.state = W.stateOnSend;
    const a = W.answer;
    if (a.kind === 'ok' && W.lands) W.row[k === 'model' && W.row.backend_kind === 'acp' ? 'delegated_model' : k] = v;
    if (a.kind === 'lost' && W.lands) W.row[k] = v;
    const r: Settled = a.kind === 'ok' ? { ok: true, body: { status: 'ok', ...a.body } } : a.kind === 'fail' ? err('failed', a.code, 409) : err('pending', '', 0);
    if (!W.hold) return Promise.resolve(r);
    return new Promise<Settled>((resolve) => W.held.push(() => resolve(r)));
  };
  const session = () => {
    W.reads += 1;
    return ok({ session: { ...W.row } });
  };
  const liveSession = (id: string) => {
    W.liveIds.push(id);
    if (W.failReads > 0) {
      W.failReads -= 1;
      W.reads += 1;
      return Promise.resolve(err('failed', 'boom', 500));
    }
    if (W.liveHold) {
      const r = session();
      return new Promise<Settled>((resolve) => W.liveHeld.push(() => void r.then(resolve)));
    }
    if (W.staleReads === 0) return session();
    W.staleReads -= 1;
    return Promise.resolve({ ok: false, err: { kind: 'stale', code: '', status: 0, retryAfter: null, details: {} } } as Settled);
  };
  const fakeAgent = {
    session: () => {
      W.settingsReads += 1;
      const r = session();
      // Counted when the answer is handed to the hook (the held wrapper's release), not when the snapshot promise resolves.
      const done = (): Promise<Settled> => r.then((x) => { W.settingsDone += 1; return x; });
      return W.settingsHold ? new Promise<Settled>((resolve) => W.settingsHeld.push(() => void done().then(resolve))) : done();
    },
    approval: () => ok({ mode: 'default', locked: false, revision: 0, yolo: false }),
    setEffort: (_id: string, e: string) => {
      W.sent.push(`effort=${e}`);
      if (W.stateOnSend) W.row.state = W.stateOnSend;
      if (W.effortRefuse) return Promise.resolve(err('failed', W.effortRefuse, 409));
      if (W.effortLands) W.row.effort = e;
      return ok({ status: 'ok' });
    },
    setVerbosity: (_id: string, l: string) => {
      W.sent.push(`verbosity=${l}`);
      if (W.fieldLost) return Promise.resolve(err('pending', '', 0));
      W.row.verbosity = l;
      if (W.fieldHold) return new Promise<Settled>((resolve) => W.fieldHeld.push(() => resolve({ ok: true, body: { status: 'ok' } })));
      return ok({ status: 'ok' });
    },
    setYolo: () => ok({ status: 'ok' }),
    acp: () => {
      W.acpCalls += 1;
      const r = W.acpFail ? Promise.resolve(err('failed', 'boom', 500)) : W.acp ? ok(W.acp) : Promise.resolve(err('failed', '', 404));
      return W.acpHold ? new Promise<Settled>((resolve) => W.acpHeld.push(() => void r.then(resolve))) : r;
    },
  };
  const fakeLive: CoreMod.agent.LiveApi = {
    session: liveSession,
    setModel: (_id, m) => answer('model', m) as never,
    setAgent: (_id, a) => answer('agent', a) as never,
  };
  const fakeApproval: CoreMod.agent.ApprovalApi = {
    approval: () => {
      W.apReads += 1;
      return W.apFail ? Promise.resolve(err('failed', 'boom', 500)) : ok({ ...W.approval });
    },
    // (the realm each approvals API was built for is recorded by approvalApi below)
    setMode: (_id, m, rev) => {
      W.sent.push(`approval=${m}@${rev}`);
      if (W.apLost) return Promise.resolve(err('pending', '', 0));
      W.approval = { ...W.approval, mode: m, revision: rev + 1 };
      if (W.apHold) return new Promise<Settled>((resolve) => W.apHeld.push(() => resolve({ ok: true, body: { status: 'ok' } })));
      return ok({ status: 'ok' });
    },
    setYolo: (_id, on) => {
      W.sent.push(`yolo=${on}`);
      W.approval = { ...W.approval, yolo: on };
      return ok({ status: 'ok' });
    },
  };
  return {
    ...real,
    agent: { ...real.agent, agentApi: () => fakeAgent as never, liveApi: () => fakeLive, approvalApi: (_t?: unknown, realm?: string) => {
      W.apRealms.push(realm);
      return fakeApproval;
    } },
    providers: {
      ...real.providers,
      providersApi: () => ({
        catalogue: () => {
          W.catCalls += 1;
          const press = W.onCat;
          W.onCat = null;
          press?.();
          if (W.catFail) return Promise.resolve(err('failed', 'boom', 500));
          const r = ok(real.providers.catalogue({
            providers: { providers: [{ id: 'hoody-ai', display_name: 'Hoody AI', status: { state: 'ready' } }, { id: 'openai', display_name: 'OpenAI', status: { state: 'ready' } }] },
            models: { models: MODELS },
            ready: { models: MODELS },
            }));
          return W.catHold ? new Promise<Settled>((resolve) => W.catHeld.push(() => void r.then(resolve))) : r;
        },
      }),
    },
  };
});

const MODELS = [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
  { spec: 'openai/o9', display_name: 'O9 Thinker', reasoning: true },
];
const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'srv' } } as unknown as Target;
const S = strings as Record<string, string>;
const AP = apStrings as Record<string, string>;
const fill = (k: string, v: Record<string, string>) => S[k]!.replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

beforeEach(() => {
  W.row = { id: 's1', model: 'hoody-ai/hoody-free', agent: 'general', verbosity: 'normal', state: 'idle', cwd: '/home/u/shop', dir_scope: 'home', realm: 'global' };
  // The caller's list as it read it: the tab itself never offers the product's own agents.
  W.agents = ['chat', 'general', 'bot', 'script-writer', 'reviewer'];
  W.answer = { kind: 'ok', body: { persisted: true, scope: 'session' }, code: '' };
  W.lands = true;
  W.hold = false;
  W.held = [];
  W.sent = [];
  W.reads = 0;
  W.acp = null;
  W.fieldLost = false;
  W.stateOnSend = null;
  W.staleReads = 0;
  W.failReads = 0;
  W.liveIds = [];
  W.settingsReads = 0;
  W.catCalls = 0;
  W.catFail = false;
  W.fieldHold = false;
  W.fieldHeld = [];
  W.liveHold = false;
  W.liveHeld = [];
  W.approval = { mode: 'default', locked: false, revision: 2, yolo: false };
  W.apLost = false;
  W.apRealms = [];
  W.apHold = false;
  W.apHeld = [];
  W.onCat = null;
  W.apReads = 0;
  W.apFail = false;
  W.effortRefuse = '';
  W.effortLands = true;
  W.acpHold = false;
  W.acpHeld = [];
  W.acpFail = false;
  W.acpCalls = 0;
  W.settingsHold = false;
  W.settingsHeld = [];
  W.settingsDone = 0;
  W.catHold = false;
  W.catHeld = [];
  forgetApprovalAttempts();
  forgetLiveAttempts();
});

const view = () => render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
const modelRadio = (name: RegExp) => screen.getByRole('radio', { name });
const free = () => modelRadio(/Hoody Free/);
const sel = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
const ready = async () => {
  view();
  await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
};
async function pickModel(name: RegExp) {
  await userEvent.click(modelRadio(name));
}

describe('Details → Session: live and fixed', () => {
  it('splits the live fields from the fixed ones, and the fixed rows are read-only with their words', async () => {
    await ready();
    expect(screen.getByRole('heading', { name: S['st.live'] })).toBeInTheDocument();
    const fixed = screen.getByRole('heading', { name: S['st.fixed'] }).closest('section')!;
    expect(within(fixed).getByText(/fixed when its first turn starts/)).toBeInTheDocument();
    for (const v of ['atlas', 'Work', '/home/u/shop', S['st.backend.hoody']!, S['st.dirScope.home']!, S['st.toolMode.standard']!]) expect(within(fixed).getByText(v)).toBeInTheDocument();
    expect(within(fixed).queryAllByRole('button')).toHaveLength(0);
    expect(within(fixed).queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText(S['st.liveIdle']!)).toBeInTheDocument();
  });

  it('while the chat works or waits, every live control is disabled with the reason, and nothing is sent', async () => {
    W.row.state = 'running';
    view();
    await waitFor(() => expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument());
    expect(screen.getByText(S['st.busyModel']!)).toBeInTheDocument();
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    for (const l of [S['st.agent']!, S['st.verbosity']!]) expect(sel(l)).toBeDisabled();
    expect(W.sent).toEqual([]);
  });

  it('a waiting gate is busy too', async () => {
    W.row.pending_gate = true;
    view();
    await waitFor(() => expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument());
    expect(free()).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Details → Session: the model', () => {
  it('a native pick changes only this chat (no default words) and sends only on Use this model; Saved after the read-back', async () => {
    await ready();
    await pickModel(/O9 Thinker/);
    expect(screen.getByText(S['st.modelThisChat']!)).toBeInTheDocument();
    expect(W.sent).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['model=openai/o9']);
    expect(screen.queryByText(fill('st.defaultChanged', { agent: 'general' }))).toBeNull();
    expect(screen.queryByText(S['st.notPersisted']!)).toBeNull();
  });

  it('Use this model removes its own button: focus goes to the model picker, not the page', async () => {
    await ready();
    await pickModel(/O9 Thinker/);
    const use = screen.getByRole('button', { name: S['st.modelUse'] });
    use.focus();
    await userEvent.click(use);
    await waitFor(() => expect(screen.queryByRole('button', { name: S['st.modelUse'] })).toBeNull());
    const group = screen.getByRole('group', { name: S['st.title'] });
    await waitFor(() => expect(document.activeElement && document.activeElement !== document.body).toBe(true));
    expect(group.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).closest('[data-model-field]')).not.toBeNull();
  });

  it('a person who moved focus elsewhere while the change saved keeps it there', async () => {
    W.hold = true;
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    const elsewhere = document.body.appendChild(document.createElement('button'));
    elsewhere.focus();
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('an answer that echoes scope "agent" also rewrote the default: the outcome says so', async () => {
    W.answer = { kind: 'ok', body: { persisted: true, scope: 'agent' }, code: '' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(fill('st.defaultChanged', { agent: 'general' }))).toBeInTheDocument());
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('an answer that echoes no scope proves nothing about the default: Saved, and no claim that it changed', async () => {
    W.answer = { kind: 'ok', body: { persisted: true }, code: '' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(screen.queryByText(fill('st.defaultChanged', { agent: 'general' }))).toBeNull();
    expect(screen.queryByText(fill('st.defaultNotSaved', { agent: 'general' }))).toBeNull();
  });

  it('persisted:false says the chat changed but its record was not saved', async () => {
    W.answer = { kind: 'ok', body: { persisted: false, scope: 'session' }, code: '' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.notPersisted']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(screen.queryByText(fill('st.defaultChanged', { agent: 'general' }))).toBeNull();
  });

  it('a 409 turn_in_flight is a definite refusal of a busy chat: not sent, its reason, no resend', async () => {
    W.answer = { kind: 'fail', body: {}, code: 'turn_in_flight' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.busyModel']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('409 gate_parked reads the same', async () => {
    W.answer = { kind: 'fail', body: {}, code: 'gate_parked' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.busyModel']!)).toBeInTheDocument());
  });

  it('a lost answer whose change the read does not show is "may have gone through"; Check again reads, never resends', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    const check = await screen.findByRole('button', { name: /check again/i });
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    // The change is unsettled: nothing else may be sent meanwhile.
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    W.row.model = 'openai/o9';
    const before = W.reads;
    await userEvent.click(check);
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    // Check again reads (and, once saved, the effort and reply length are read again); it sends nothing.
    expect(W.reads).toBeGreaterThan(before);
    expect(W.sent).toEqual(['model=openai/o9']);
    // A lost answer says nothing about the record or the default: neither set of words.
    expect(screen.queryByText(S['st.notPersisted']!)).toBeNull();
    expect(screen.queryByText(fill('st.defaultChanged', { agent: 'general' }))).toBeNull();
  });

  it('a Claude Code chat applies from its next turn, sends the model id, and never offers Claude\'s default', async () => {
    W.row = { ...W.row, backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'sonnet', model: '' };
    W.acp = { status: 'ok', report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models: [{ id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }] } };
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" claudeCode />);
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByText(S['st.backend.claude_code']!)).toBeInTheDocument();
    const opts = screen.getAllByRole('radio').map((o) => o.getAttribute('aria-label') ?? o.closest('label')?.textContent ?? o.textContent ?? '');
    expect(opts.some((o) => /Opus/.test(o))).toBe(true);
    expect(opts.some((o) => /Hoody Free/.test(o))).toBe(false);
    expect(opts.some((o) => o.includes(S['st.backend.claude_code']!) && !/Opus|Sonnet/.test(o))).toBe(false);
    await userEvent.click(modelRadio(/Opus/));
    expect(screen.getByText(S['st.modelNextTurn']!)).toBeInTheDocument();
    expect(screen.queryByText(S['st.modelThisChat']!)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['model=opus']);
  });
});

describe('Details → Session: a Claude Code chat without the claudeCode flag', () => {
  it('gates the model section off with its reason: no picker, no Hoody catalogue model, nothing to send; the rest of the tab works', async () => {
    W.row = { ...W.row, backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'sonnet', model: '' };
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" />);
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeGated']!)).toBeInTheDocument());
    expect(screen.queryByText(/Hoody Free/)).toBeNull();
    expect(screen.queryByRole('button', { name: S['st.modelUse'] })).toBeNull();
    expect(screen.getByText(S['st.backend.claude_code']!)).toBeInTheDocument();
    expect(W.sent).toEqual([]);
  });
  it('a Hoody chat keeps its picker without the flag', async () => {
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" />);
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBeGreaterThan(0));
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
  });
});

describe('Details → Session: a Claude Code chat with the claudeCode flag', () => {
  const claudeChat = (over: Record<string, unknown> = {}) => {
    W.row = { ...W.row, backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'sonnet', model: '', ...over };
    W.acp = { status: 'ok', report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models: [{ id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }], efforts: ['low', 'high'] } };
  };
  const mountClaude = () => render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" claudeCode agents={W.agents} />);
  const outcome = (kind: string) => document.querySelector(`[data-outcome="${kind}"]`);
  const claudeReady = async () => {
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
  };

  it('while the Claude Code models load nothing is gated and no empty picker shows; once they answer, the picker lists them', async () => {
    claudeChat();
    W.acpHold = true;
    mountClaude();
    await waitFor(() => expect(screen.getByText(S['st.backend.claude_code']!)).toBeInTheDocument());
    await waitFor(() => expect(W.acpHeld).toHaveLength(1));
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
    expect(screen.queryByText(S['st.modelClaudeNone']!)).toBeNull();
    expect(screen.queryByRole('radio', { name: /Sonnet|Opus/ })).toBeNull();
    // Not an empty picker either: the models are still being read.
    expect(screen.queryByText('No models on this computer.')).toBeNull();
    await act(async () => { for (const f of W.acpHeld.splice(0)) f(); });
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    expect(screen.queryByText(S['st.modelClaudeNone']!)).toBeNull();
  });

  it('a computer that confirms no Claude Code models gates the section with that reason (not the flag\'s): no picker, nothing to send', async () => {
    claudeChat();
    W.acp = null;
    mountClaude();
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeNone']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
    expect(screen.queryByText(/Hoody Free/)).toBeNull();
    expect(screen.queryByRole('button', { name: S['st.modelUse'] })).toBeNull();
    expect(W.sent).toEqual([]);
  });

  it('ST7n2 a Claude Code list that could not be read is not "lists none": it says it could not be read and offers Try again, which reads Claude Code\'s set once more (and only that) and shows the models', async () => {
    claudeChat();
    W.acpFail = true;
    mountClaude();
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeUnread']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.modelClaudeNone']!)).toBeNull();
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
    expect(W.sent).toEqual([]);
    W.acpFail = false;
    const [cat, reads, acp] = [W.catCalls, W.settingsReads, W.acpCalls];
    await userEvent.click(screen.getByRole('button', { name: S['st.modelClaudeRetry'] }));
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    expect(screen.queryByText(S['st.modelClaudeUnread']!)).toBeNull();
    expect(W.acpCalls).toBe(acp + 1);
    expect(W.catCalls).toBe(cat);
    expect(W.settingsReads).toBe(reads);
    expect(W.sent).toEqual([]);
  });

  it('ST7n3 Try again stays pressable while the Hoody catalogue is still out, and its read alone brings the models', async () => {
    claudeChat();
    W.acpFail = true;
    W.catHold = true;
    mountClaude();
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeUnread']!)).toBeInTheDocument());
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    const retry = screen.getByRole('button', { name: S['st.modelClaudeRetry'] });
    await waitFor(() => expect(retry).not.toBeDisabled());
    W.acpFail = false;
    await userEvent.click(retry);
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    expect(W.catHeld.length).toBeGreaterThan(0);
    expect(W.sent).toEqual([]);
  });

  it('a Hoody chat never sees the Claude Code models, whatever the flag', async () => {
    W.acp = { status: 'ok', report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models: [{ id: 'opus', label: 'Opus' }], efforts: [] } };
    mountClaude();
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByRole('radio', { name: /Opus/ })).toBeNull();
  });

  it('a model switch the bridge refuses (409 delegated_session) is a failed outcome: never Saved, no resend, the controls come back', async () => {
    claudeChat();
    W.answer = { kind: 'fail', body: {}, code: 'delegated_session' };
    await claudeReady();
    await userEvent.click(modelRadio(/Opus/));
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(outcome('failed')).not.toBeNull());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(screen.queryByText(S['st.nextTurn']!)).toBeNull();
    expect(W.sent).toEqual(['model=opus']);
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
  });

  it('an effort change the bridge refuses (409 delegated_session) is a failed outcome: never Saved', async () => {
    claudeChat();
    W.effortRefuse = 'delegated_session';
    await claudeReady();
    await userEvent.click(sel(S['st.effort']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.effort.high']! }));
    await waitFor(() => expect(outcome('failed')).not.toBeNull());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(screen.queryByText(S['st.nextTurn']!)).toBeNull();
    expect(W.sent).toEqual(['effort=high']);
  });

  it('a change sent while the session is still connecting, then refused (the refusal reaches only the daemon\'s event stream): the read shows nothing, so it is "may have gone through" with the Claude Code words, never Saved; Check again is checking until its read RESOLVES, sends nothing, and the outcome stays unsettled', async () => {
    claudeChat();
    // The session is connecting when the change arrives; it accepts the change and refuses it afterwards, so the conversation never shows it.
    W.stateOnSend = 'connecting';
    W.effortLands = false;
    await claudeReady();
    await userEvent.click(sel(S['st.effort']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.effort.high']! }));
    const check = await screen.findByRole('button', { name: /check again/i });
    expect(outcome('pending')).not.toBeNull();
    expect(screen.getByText(S['st.heldClaude']!)).toBeInTheDocument();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    // Check again: its read is held, so the tab is checking (not settled) until the read has resolved.
    W.settingsHold = true;
    const done = W.settingsDone;
    await userEvent.click(check);
    await screen.findByRole('button', { name: /checking/i });
    expect(W.settingsHeld).toHaveLength(1);
    // Held: nothing has been handed to the hook yet, so the read has not completed and the tab stays checking.
    expect(W.settingsDone).toBe(done);
    expect(screen.getByRole('button', { name: /checking/i })).toBeInTheDocument();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    await act(async () => { for (const f of W.settingsHeld.splice(0)) f(); });
    await waitFor(() => expect(W.settingsDone).toBeGreaterThan(done));
    await screen.findByRole('button', { name: /check again/i });
    expect(screen.queryByRole('button', { name: /checking/i })).toBeNull();
    expect(outcome('pending')).not.toBeNull();
    expect(screen.getByText(S['st.heldClaude']!)).toBeInTheDocument();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.sent).toEqual(['effort=high']);
  });

  it('a slow Hoody catalogue neither hides, gates nor locks the Claude Code models: they show, a model can be picked, and the change goes out and is Saved', async () => {
    claudeChat();
    W.catHold = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByText(S['st.modelClaudeNone']!)).toBeNull();
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
    await userEvent.click(modelRadio(/Opus/));
    const use = screen.getByRole('button', { name: S['st.modelUse'] });
    expect(use).not.toBeDisabled();
    await userEvent.click(use);
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['model=opus']);
    // The catalogue is still out the whole time.
    expect(W.catHeld.length).toBeGreaterThan(0);
  });

  it('ST7w2 a Hoody chat\'s picker still waits for the Hoody catalogue (its choices are the catalogue)', async () => {
    W.catHold = true;
    view();
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    expect(screen.queryByRole('radio', { name: /Hoody Free/ })).toBeNull();
  });

  it('ST7w3 with the Hoody catalogue still out, Check again of an unsettled model change is pressable and starts its own read (the line is its running state until the read answers)', async () => {
    claudeChat();
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    W.catHold = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    await userEvent.click(modelRadio(/Opus/));
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    const check = await screen.findByRole('button', { name: /check again/i });
    expect(check).not.toBeDisabled();
    expect(outcome('pending')).not.toBeNull();
    W.liveHold = true;
    await userEvent.click(check);
    // Its own read starts (the live change is "running" while it is out: the unsettled line gives way to that state), though the catalogue is out.
    await waitFor(() => expect(W.liveHeld.length).toBe(1));
    await waitFor(() => expect(outcome('pending')).toBeNull());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.catHeld.length).toBeGreaterThan(0);
    await act(async () => { for (const f of W.liveHeld.splice(0)) f(); });
    await screen.findByRole('button', { name: /check again/i });
    expect(screen.getByRole('button', { name: /check again/i })).not.toBeDisabled();
    expect(outcome('pending')).not.toBeNull();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    // The catalogue never answered, and only the one model change was sent.
    expect(W.catHeld.length).toBeGreaterThan(0);
    expect(W.sent).toEqual(['model=opus']);
  });

  it('ST7w4 with the Hoody catalogue still out, the approvals mode of a Claude Code chat is not held and its change goes out', async () => {
    claudeChat();
    W.catHold = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    const strict = screen.getByRole('radio', { name: /^Ask every time/ });
    await waitFor(() => expect(strict).not.toBeDisabled());
    await userEvent.click(strict);
    await waitFor(() => expect(W.sent).toEqual(['approval=always@2']));
  });

  it('ST7w5 the Claude Code picker waits for the conversation\'s settings read (any read but the catalogue\'s holds it) and opens when that read answers', async () => {
    claudeChat();
    W.settingsHold = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    await waitFor(() => expect(W.settingsHeld.length).toBe(1));
    expect(modelRadio(/Opus/)).toHaveAttribute('aria-disabled', 'true');
    await act(async () => { for (const f of W.settingsHeld.splice(0)) f(); });
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
  });

  it('ST7w6 with the Hoody catalogue still out, the live hook still refreshes the conversation (the catalogue does not pause it)', async () => {
    claudeChat();
    W.catHold = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    const live = W.liveIds.length;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(W.liveIds.length).toBe(live + 1));
    expect(W.catHeld.length).toBeGreaterThan(0);
  });

  it('ST7w7 a catalogue Retry still out does not keep the tab\'s claim: Check again of an unsettled agent change starts its read', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    W.lands = false;
    W.answer = { kind: 'lost', body: {}, code: '' };
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    const check = await screen.findByRole('button', { name: /check again/i });
    // Retry: its catalogue read stays out, its settings read answers.
    W.catFail = false;
    W.catHold = true;
    const reads = W.settingsReads;
    await userEvent.click(retry);
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    await waitFor(() => expect(W.settingsReads).toBeGreaterThan(reads));
    W.liveHold = true;
    await waitFor(() => expect(screen.getByRole('button', { name: /check again/i })).not.toBeDisabled());
    await userEvent.click(check);
    await waitFor(() => expect(W.liveHeld.length).toBe(1));
    await act(async () => { for (const f of W.liveHeld.splice(0)) f(); });
    expect(W.sent).toEqual(['agent=reviewer']);
  });

  it('ST7w8 a pending reply-length outcome and a catalogue read still out: the field\'s Check again is disabled (checking) and starts nothing; it enables once the catalogue settles and then reads', async () => {
    W.catFail = true;
    W.fieldLost = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.verbosity']!)).not.toBeDisabled());
    await userEvent.click(sel(S['st.verbosity']!));
    const other = (await screen.findAllByRole('option')).find((o) => o.textContent !== S['st.verbosity.normal']);
    await userEvent.click(other!);
    const check = await screen.findByRole('button', { name: /check again/i });
    expect(check).not.toBeDisabled();
    const sent = [...W.sent];
    // The catalogue Retry stays out: the settings hook is busy, so the field's Check again cannot read.
    W.catFail = false;
    W.catHold = true;
    await userEvent.click(retry);
    await waitFor(() => expect(W.catHeld.length).toBeGreaterThan(0));
    const checking = await screen.findByRole('button', { name: /checking/i });
    // A busy button refuses presses (aria-disabled), whatever its label.
    expect(checking).toHaveAttribute('aria-disabled', 'true');
    const reads = W.settingsReads;
    await userEvent.click(checking);
    expect(W.settingsReads).toBe(reads);
    expect(outcome('pending')).not.toBeNull();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    await act(async () => { for (const f of W.catHeld.splice(0)) f(); });
    const again = await screen.findByRole('button', { name: /check again/i });
    expect(again).not.toHaveAttribute('aria-disabled', 'true');
    const before = W.settingsReads;
    await userEvent.click(again);
    await waitFor(() => expect(W.settingsReads).toBeGreaterThan(before));
    expect(W.sent).toEqual(sent);
  });

  it('a failed Hoody catalogue does not touch a Claude Code chat\'s picker', async () => {
    claudeChat();
    W.catFail = true;
    mountClaude();
    await waitFor(() => expect(modelRadio(/Opus/)).toBeInTheDocument());
    await waitFor(() => expect(W.catCalls).toBeGreaterThan(0));
    await waitFor(() => expect(modelRadio(/Opus/)).not.toHaveAttribute('aria-disabled', 'true'));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(S['st.modelClaudeNone']!)).toBeNull();
    // The Hoody catalogue's readiness error is about Hoody models: not shown on a chat that runs on Claude Code.
    expect(screen.queryByText(/Readiness couldn't be read/)).toBeNull();
  });

  it('ST7x2 (control) the same failed catalogue does show its readiness error on a Hoody chat', async () => {
    W.catFail = true;
    view();
    await waitFor(() => expect(screen.getByText(/Readiness couldn't be read/)).toBeInTheDocument());
  });

  it('a lost model answer on a Claude Code chat is the plain "may have gone through": a busy model switch is refused outright, so the held words do not apply', async () => {
    claudeChat();
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    await claudeReady();
    await userEvent.click(modelRadio(/Opus/));
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    expect(outcome('pending')).not.toBeNull();
    expect(screen.queryByText(S['st.heldClaude']!)).toBeNull();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
  });

  it('a Claude Code model that needs setup asks the caller to set Claude Code up and sends nothing', async () => {
    claudeChat();
    W.acp = { ...(W.acp as Record<string, unknown>), report: { agents: [{ name: 'claude', enabled: true, startable: false }] } };
    const onSetup = vi.fn();
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" claudeCode onSetup={onSetup} agents={W.agents} />);
    // A model that needs setup is not a row: the line under the list names Claude Code, and a search still finds the model.
    await userEvent.click(await screen.findByRole('button', { name: 'Set up Claude Code' }));
    await waitFor(() => expect(onSetup).toHaveBeenCalledTimes(1));
    expect(onSetup.mock.calls[0]![0]).toMatchObject({ providerId: 'claude-code' });
    onSetup.mockClear();
    expect(screen.queryByRole('radio', { name: /Opus/ })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'opus');
    await userEvent.click(modelRadio(/Opus/));
    await waitFor(() => expect(onSetup).toHaveBeenCalledTimes(1));
    expect(onSetup.mock.calls[0]![0]).toMatchObject({ providerId: 'claude-code' });
    expect(W.sent).toEqual([]);
  });

  it('ST7z2 while the chat works, the line\'s Set up action stays a keyboard stop, says why it waits and asks for nothing', async () => {
    claudeChat();
    W.acp = { ...(W.acp as Record<string, unknown>), report: { agents: [{ name: 'claude', enabled: true, startable: false }] } };
    W.row = { ...W.row, state: 'running' };
    const onSetup = vi.fn();
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" claudeCode onSetup={onSetup} agents={W.agents} />);
    const setUp = await screen.findByRole('button', { name: 'Set up Claude Code' });
    await waitFor(() => expect(setUp).toHaveAttribute('aria-disabled', 'true'));
    expect(setUp).not.toBeDisabled();
    expect(setUp).toHaveAccessibleDescription(S['st.busyModel']!);
    setUp.focus();
    expect(document.activeElement).toBe(setUp);
    await userEvent.click(setUp);
    expect(onSetup).not.toHaveBeenCalled();
    expect(W.sent).toEqual([]);
  });

  it('a saved effort change says it applies from the chat\'s next turn (a Hoody chat does not say it)', async () => {
    claudeChat();
    await claudeReady();
    await userEvent.click(sel(S['st.effort']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.effort.high']! }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(screen.getByText(S['st.nextTurn']!)).toBeInTheDocument();
  });

  it('an effort change sent as the chat started working, not visible in the read-back, says Claude Code applies it when the reply ends', async () => {
    claudeChat();
    W.effortLands = false;
    W.stateOnSend = 'running';
    await claudeReady();
    await userEvent.click(sel(S['st.effort']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.effort.high']! }));
    await waitFor(() => expect(screen.getByText(S['st.heldClaude']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('an agent switch sent as the chat started working says the same', async () => {
    claudeChat();
    W.lands = false;
    W.stateOnSend = 'running';
    await claudeReady();
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(screen.getByText(S['st.heldClaude']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
  });

  it('a Hoody chat\'s lost change while it works keeps the plain "may have gone through" and never the Claude Code words', async () => {
    W.lands = false;
    W.stateOnSend = 'running';
    W.answer = { kind: 'lost', body: {}, code: '' };
    await ready();
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await screen.findByRole('button', { name: /check again/i });
    expect(screen.queryByText(S['st.heldClaude']!)).toBeNull();
    expect(screen.queryByText(S['st.nextTurn']!)).toBeNull();
  });
});

describe('Details → Session: an unproven change outlives the tab (C9)', () => {
  it('unknown, then Details is closed (the tab unmounts) and reopened: still "may have gone through", the model and agent stay locked, nothing more is sent', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    W.answer = { kind: 'ok', body: { persisted: true, scope: 'session' }, code: '' };
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await screen.findByRole('button', { name: /check again/i });
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(sel(S['st.agent']!)).toBeDisabled();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('the reopened tab\'s Check again reads the captured change, sends nothing, and when it shows the change says Saved and frees the controls', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    // The reopened tab reads the chat first; Check again then reads the captured change.
    await screen.findByText('/home/u/shop');
    const check = await screen.findByRole('button', { name: /check again/i });
    W.row.model = 'openai/o9';
    await userEvent.click(check);
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['model=openai/o9']);
    await waitFor(() => expect(modelRadio(/Hoody Free/)).not.toHaveAttribute('aria-disabled', 'true'));
  });

  it('another conversation of the same computer never shows it', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    W.row = { ...W.row, id: 's2' };
    render(<SessionTab realmId="r-work" target={TARGET} session="s2" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
  });
});

describe('Details → Session: an unproven change is bound to its realm too', () => {
  it('the same conversation shown in another realm never shows it', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    render(<SessionTab realmId="r-home" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
  });

  it('a renamed realm label is the same realm: the unproven change is still shown and still refuses another', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work (renamed)" agents={W.agents} />);
    await screen.findByRole('button', { name: /check again/i });
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('two realms with the same label are two realms: one never shows the other\'s unproven change', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    render(<SessionTab realmId="r-other" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
  });
});

describe('Details → Session: the busy help beside the Claude Code gate', () => {
  const claudeRow = (state: string) => ({ ...W.row, backend_kind: 'acp', delegated_agent: 'claude', delegated_model: 'sonnet', model: '', state });
  it('a busy Claude Code chat shows the gate\'s reason and not "change the model when this reply ends" (it will not become possible then)', async () => {
    W.row = claudeRow('running');
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" agents={W.agents} />);
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeGated']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.busyModel']!)).toBeNull();
  });

  it('a Hoody chat that is busy keeps that help; the same tab moved to a busy Claude Code chat drops it for the gate', async () => {
    W.row = { ...W.row, state: 'running' };
    const r = render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" agents={W.agents} />);
    await waitFor(() => expect(screen.getByText(S['st.busyModel']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.modelClaudeGated']!)).toBeNull();
    W.row = { ...claudeRow('running'), id: 's2' };
    r.rerender(<SessionTab realmId="r-work" target={TARGET} session="s2" computer="atlas" agents={W.agents} />);
    await waitFor(() => expect(screen.getByText(S['st.modelClaudeGated']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.busyModel']!)).toBeNull();
  });
});

describe('Details → Session: the agent', () => {
  it('never offers the product\'s own agents; a switch is sent once and Saved after the read-back', async () => {
    await ready();
    await userEvent.click(sel(S['st.agent']!));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['chat', 'general', 'reviewer']));
    expect(names).not.toEqual(expect.arrayContaining(['bot']));
    expect(names).not.toEqual(expect.arrayContaining(['script-writer']));
    await userEvent.click(screen.getByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['agent=reviewer']);
    // A Hoody chat does not carry the Claude Code words.
    expect(screen.queryByText(S['st.nextTurn']!)).toBeNull();
  });

  it('a switch the agent discarded behind a parked gate (deferred) says so: not saved, no resend', async () => {
    W.answer = { kind: 'ok', body: { deferred: true }, code: '' };
    W.lands = false;
    await ready();
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(screen.getByText(S['st.deferred']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    expect(W.sent).toEqual(['agent=reviewer']);
  });

  it('unreadable agents: the agent cannot be changed here, and says why', async () => {
    W.agents = null;
    view();
    await waitFor(() => expect(screen.getByText(S['st.agentsFailed']!)).toBeInTheDocument());
    expect(sel(S['st.agent']!)).toBeDisabled();
  });
});

describe('Details → Session: one chat at a time', () => {
  it('an answer arriving after another chat is shown is dropped', async () => {
    W.hold = true;
    const r = view();
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    W.row = { ...W.row, id: 's2', model: 'hoody-ai/hoody-free' };
    r.rerender(<SessionTab realmId="r-work" target={TARGET} session="s2" computer="atlas" realm="Work" agents={W.agents} />);
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
  });

  it('the read fails: an error with Try again, no controls', async () => {
    W.row = { id: 'other' };
    view();
    expect(await screen.findByText(S['st.readFailed']!)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Hoody Free/ })).toBeNull();
  });
});

describe('Details → Session: locks, busy chats and read-backs', () => {
  it('an unsettled reply-length change locks the model and the agent too', async () => {
    W.fieldLost = true;
    await ready();
    await userEvent.click(sel(S['st.verbosity']!));
    const other = (await screen.findAllByRole('option')).find((o) => o.textContent !== S['st.verbosity.normal']);
    await userEvent.click(other!);
    await screen.findByRole('button', { name: /check again/i });
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(modelRadio(/O9 Thinker/)).toHaveAttribute('aria-disabled', 'true');
    expect(sel(S['st.agent']!)).toBeDisabled();
    expect(W.sent.filter((x) => x.startsWith('model=') || x.startsWith('agent='))).toEqual([]);
  });

  it('a busy chat is read again while the tab stays open, and its controls come back when it is idle', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      W.row.state = 'running';
      view();
      await screen.findByText(S['st.liveBusy']!);
      expect(free()).toHaveAttribute('aria-disabled', 'true');
      const before = W.reads;
      W.row.state = 'idle';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
      expect(W.reads).toBeGreaterThan(before);
      expect(screen.getByText(S['st.liveIdle']!)).toBeInTheDocument();
      // Idle: no more scheduled reads.
      const idleReads = W.reads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });
      expect(W.reads).toBe(idleReads);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a chat that started work since it was read: the busy refusal reads it again and the controls follow', async () => {
    W.answer = { kind: 'fail', body: {}, code: 'turn_in_flight' };
    W.stateOnSend = 'running';
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument());
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('an idle chat (never re-read on a schedule) is read again when the window comes back into view', async () => {
    await ready();
    W.row.state = 'running';
    // Idle: nothing is scheduled, so only coming back into view can show the work it started.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2500));
    });
    expect(screen.getByText(S['st.liveIdle']!)).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument();
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(W.sent).toEqual([]);
  });

  it('an answered persisted:false survives a read-back that does not show it; Check again then shows the warning', async () => {
    W.answer = { kind: 'ok', body: { persisted: false, scope: 'session' }, code: '' };
    W.lands = false;
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    const check = await screen.findByRole('button', { name: /check again/i });
    W.row.model = 'openai/o9';
    await userEvent.click(check);
    await waitFor(() => expect(screen.getByText(S['st.notPersisted']!)).toBeInTheDocument());
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('a stale first read is a failed read with Try again, never a tab left loading', async () => {
    W.staleReads = 1;
    view();
    const again = await screen.findByRole('button', { name: /try again/i });
    expect(screen.getByText(S['st.readFailed']!)).toBeInTheDocument();
    await userEvent.click(again);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
  });
});

describe('Details → Session: waiting Retries, the refresh schedule and defaults', () => {
  it('a catalogue Retry pressed while a change is held reads nothing then, and runs once the change is done', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.agent']!)).not.toBeDisabled());
    W.hold = true;
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(W.held.length).toBe(1));
    const cat = W.catCalls;
    const reads = W.settingsReads;
    W.catFail = false;
    await userEvent.click(retry);
    expect(W.catCalls).toBe(cat);
    expect(W.settingsReads).toBe(reads);
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    expect(W.sent).toEqual(['agent=reviewer']);
  });

  it('the waiting Retry runs itself when the held change is refused (nothing else reads the catalogue)', async () => {
    W.catFail = true;
    const r = view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.agent']!)).not.toBeDisabled());
    W.hold = true;
    W.answer = { kind: 'fail', body: {}, code: 'agent_unknown' };
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(W.held.length).toBe(1));
    const cat = W.catCalls;
    W.catFail = false;
    await userEvent.click(retry);
    expect(W.catCalls).toBe(cat);
    // The page passes an equal target object meanwhile: the same computer, so the waiting Retry stays.
    r.rerender(<SessionTab realmId="r-work" target={{ ...TARGET, container: { ...TARGET.container } } as Target} session="s1" computer="atlas" realm="Work" agents={W.agents} />);
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    await act(async () => {
      await new Promise((res) => setTimeout(res, 100));
    });
    expect(W.catCalls).toBe(cat + 1);
  });

  it('a waiting Retry and a waiting focus refresh released together never read at once: one after the other', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.agent']!)).not.toBeDisabled());
    W.hold = true;
    W.answer = { kind: 'fail', body: {}, code: 'agent_unknown' };
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(W.held.length).toBe(1));
    const cat = W.catCalls;
    const live = W.liveIds.length;
    W.catFail = false;
    await userEvent.click(retry);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    // Both reads wait: the live read is held from here on to see whether the settings read starts beside it.
    W.liveHold = true;
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(W.liveIds.length).toBe(live + 1));
    expect(W.catCalls).toBe(cat);
    await act(async () => {
      for (const f of W.liveHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    expect(W.liveIds.length).toBe(live + 1);
  });

  it('the waiting Retry still runs when the live refresh ahead of it answers at once', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.agent']!)).not.toBeDisabled());
    W.hold = true;
    W.answer = { kind: 'fail', body: {}, code: 'agent_unknown' };
    await userEvent.click(sel(S['st.agent']!));
    await userEvent.click(await screen.findByRole('option', { name: 'reviewer' }));
    await waitFor(() => expect(W.held.length).toBe(1));
    const cat = W.catCalls;
    W.catFail = false;
    await userEvent.click(retry);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
  });

  it('a busy refresh that fails at once keeps the schedule: reads at 2, 5, 10 and 30 s steps, then every 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      W.row.state = 'running';
      view();
      await screen.findByText(S['st.liveBusy']!);
      W.failReads = 1;
      const n0 = W.liveIds.length;
      const step = async (ms: number) => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(ms);
        });
        return W.liveIds.length - n0;
      };
      expect(await step(1900)).toBe(0);
      expect(await step(200)).toBe(1);
      // The failed read kept the conversation (still busy, controls still off).
      expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument();
      expect(await step(4800)).toBe(1);
      expect(await step(400)).toBe(2);
      expect(await step(9700)).toBe(2);
      expect(await step(400)).toBe(3);
      expect(await step(29600)).toBe(3);
      expect(await step(400)).toBe(4);
      expect(await step(29600)).toBe(4);
      expect(await step(400)).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('focus or visibility while the other hook works is kept and read once afterwards', async () => {
    await ready();
    W.fieldHold = true;
    await userEvent.click(sel(S['st.verbosity']!));
    const other = (await screen.findAllByRole('option')).find((o) => o.textContent !== S['st.verbosity.normal']);
    await userEvent.click(other!);
    await waitFor(() => expect(W.fieldHeld.length).toBe(1));
    W.row.state = 'running';
    const n = W.liveIds.length;
    const vis = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(W.liveIds.length).toBe(n);
      await act(async () => {
        for (const f of W.fieldHeld.splice(0)) f();
      });
      await waitFor(() => expect(screen.getByText(S['st.liveBusy']!)).toBeInTheDocument());
      // Two asks while held, one read afterwards.
      expect(W.liveIds.length).toBe(n + 1);
    } finally {
      if (vis) Object.defineProperty(document, 'visibilityState', vis);
      else delete (document as unknown as Record<string, unknown>).visibilityState;
    }
  });

  it('an answer of scope "agent" whose default could not be written: the chat changed, the default did not', async () => {
    W.answer = { kind: 'ok', body: { persisted: false, scope: 'agent' }, code: '' };
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await waitFor(() => expect(screen.getByText(fill('st.defaultNotSaved', { agent: 'general' }))).toBeInTheDocument());
    expect(screen.queryByText(fill('st.defaultChanged', { agent: 'general' }))).toBeNull();
    expect(screen.queryByText(S['st.notPersisted']!)).toBeNull();
  });

  it('the default-changed fact survives more than one Check again', async () => {
    W.answer = { kind: 'ok', body: { persisted: true, scope: 'agent' }, code: '' };
    W.lands = false;
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    const again = await screen.findByRole('button', { name: /check again/i });
    W.row.model = 'openai/o9';
    await userEvent.click(again);
    await waitFor(() => expect(screen.getByText(fill('st.defaultChanged', { agent: 'general' }))).toBeInTheDocument());
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('no scheduled read outlives the tab or its conversation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      W.row.state = 'running';
      const r = view();
      await screen.findByText(S['st.liveBusy']!);
      W.row = { ...W.row, id: 's2', state: 'running' };
      r.rerender(<SessionTab realmId="r-work" target={TARGET} session="s2" computer="atlas" realm="Work" agents={W.agents} />);
      await waitFor(() => expect(W.liveIds).toContain('s2'));
      const s1 = W.liveIds.filter((x) => x === 's1').length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(W.liveIds.filter((x) => x === 's1').length).toBe(s1);
      r.unmount();
      const n = W.liveIds.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120000);
      });
      expect(W.liveIds.length).toBe(n);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Details → Session: approvals under the tab\'s lock', () => {
  const strict = () => screen.getByRole('radio', { name: /^Ask every time/ });

  it('a busy chat disables the approvals mode with the reason, as every live control', async () => {
    W.row.state = 'running';
    view();
    await waitFor(() => expect(screen.getByText(AP['ap.busy']!)).toBeInTheDocument());
    expect(strict()).toBeDisabled();
  });

  it('a lost approvals answer holds every other control until Check again settles it', async () => {
    W.apLost = true;
    await ready();
    await waitFor(() => expect(strict()).not.toBeDisabled());
    await userEvent.click(strict());
    await screen.findByRole('button', { name: /check again/i });
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    expect(sel(S['st.verbosity']!)).toBeDisabled();
    expect(W.sent).toEqual(['approval=always@2']);
  });

  it('a lost model answer holds the approvals too', async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    await ready();
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    expect(strict()).toBeDisabled();
    expect(screen.getByText(AP['ap.wait']!)).toBeInTheDocument();
  });

  it('two writes started in one batch, before any render: only one is sent (one synchronous claim across the hooks)', async () => {
    await ready();
    await waitFor(() => expect(strict()).not.toBeDisabled());
    await pickModel(/O9 Thinker/);
    const use = screen.getByRole('button', { name: S['st.modelUse'] });
    act(() => {
      fireEvent.click(use);
      fireEvent.click(strict());
    });
    await act(async () => {});
    expect(W.sent).toHaveLength(1);
  });

  it('the approvals are read in the conversation\'s own realm', async () => {
    W.row.realm = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    await ready();
    await waitFor(() => expect(strict()).not.toBeDisabled());
    expect(W.apRealms.every((r) => r === 'aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(W.apRealms.length).toBeGreaterThan(0);
  });

  it('a reply-length change and an approvals change in one batch: only one is sent (the settings hook has no synchronous flag of its own)', async () => {
    await ready();
    await waitFor(() => expect(strict()).not.toBeDisabled());
    await userEvent.click(sel(S['st.verbosity']!));
    const short = await screen.findByRole('option', { name: S['st.verbosity.terse'] });
    act(() => {
      fireEvent.click(short);
      fireEvent.click(strict());
    });
    await act(async () => {});
    expect(W.sent).toHaveLength(1);
  });

  it('a catalogue Retry pressed while an approvals change is held reads nothing then, and runs once it is done', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(strict()).not.toBeDisabled());
    W.apHold = true;
    await userEvent.click(strict());
    await waitFor(() => expect(W.apHeld.length).toBe(1));
    const cat = W.catCalls;
    const reads = W.settingsReads;
    W.catFail = false;
    await userEvent.click(retry);
    expect(W.catCalls).toBe(cat);
    expect(W.settingsReads).toBe(reads);
    await act(async () => {
      for (const f of W.apHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
  });

  it('a waiting Retry runs once: a later approvals change reads nothing more', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(strict()).not.toBeDisabled());
    W.apHold = true;
    await userEvent.click(strict());
    await waitFor(() => expect(W.apHeld.length).toBe(1));
    const cat = W.catCalls;
    W.catFail = false;
    await userEvent.click(retry);
    W.apHold = false;
    await act(async () => {
      for (const f of W.apHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    const deflt = screen.getByRole('radio', { name: /^Default/ });
    await waitFor(() => expect(deflt).not.toBeDisabled());
    await userEvent.click(deflt);
    await waitFor(() => expect(W.sent).toEqual(['approval=always@2', 'approval=default@3']));
    await waitFor(() => expect(deflt).not.toBeDisabled());
    expect(W.catCalls).toBe(cat + 1);
  });

  it('a waiting Retry that runs takes the claim: an approvals change pressed before the next render is not sent', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(strict()).not.toBeDisabled());
    W.apHold = true;
    await userEvent.click(strict());
    await waitFor(() => expect(W.apHeld.length).toBe(1));
    const cat = W.catCalls;
    W.catFail = false;
    await userEvent.click(retry);
    W.apHold = false;
    W.onCat = () => fireEvent.click(screen.getByRole('radio', { name: /^Default/ }));
    await act(async () => {
      for (const f of W.apHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    expect(W.onCat).toBeNull();
    await act(async () => {});
    expect(W.sent).toEqual(['approval=always@2']);
  });

  it('a catalogue Retry pressed while a reply-length change is held is kept, and runs once the change is done', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.verbosity']!)).not.toBeDisabled());
    W.fieldHold = true;
    await userEvent.click(sel(S['st.verbosity']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.verbosity.terse'] }));
    await waitFor(() => expect(W.fieldHeld.length).toBe(1));
    const cat = W.catCalls;
    W.catFail = false;
    fireEvent.click(retry);
    await act(async () => {});
    expect(W.catCalls).toBe(cat);
    W.fieldHold = false;
    await act(async () => {
      for (const f of W.fieldHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    await act(async () => {});
    expect(W.catCalls).toBe(cat + 1);
  });

  it('a reply-length change and a catalogue Retry in one batch, the change first: the Retry waits, then runs once', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(sel(S['st.verbosity']!)).not.toBeDisabled());
    W.fieldHold = true;
    await userEvent.click(sel(S['st.verbosity']!));
    const terse = await screen.findByRole('option', { name: S['st.verbosity.terse'] });
    const cat = W.catCalls;
    W.catFail = false;
    act(() => {
      fireEvent.click(terse);
      fireEvent.click(retry);
    });
    await act(async () => {});
    expect(W.sent).toEqual(['verbosity=terse']);
    expect(W.catCalls).toBe(cat);
    W.fieldHold = false;
    await act(async () => {
      for (const f of W.fieldHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.catCalls).toBe(cat + 1));
    await act(async () => {});
    expect(W.catCalls).toBe(cat + 1);
  });

  it('a catalogue Retry and the approvals\' Retry in one batch: the approvals read waits for the settings read, then runs once', async () => {
    W.catFail = true;
    W.apFail = true;
    view();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again|retry/i })).toHaveLength(2));
    const [cat0, ap0] = [W.catCalls, W.apReads];
    W.catFail = false;
    W.apFail = false;
    const [catRetry, apRetry] = screen.getAllByRole('button', { name: /try again|retry/i });
    W.onCat = () => expect(W.apReads).toBe(ap0);
    act(() => {
      fireEvent.click(catRetry!);
      fireEvent.click(apRetry!);
    });
    expect(W.catCalls).toBe(cat0 + 1);
    expect(W.apReads).toBe(ap0);
    await waitFor(() => expect(W.apReads).toBe(ap0 + 1));
    await act(async () => {});
    expect(W.apReads).toBe(ap0 + 1);
    expect(W.catCalls).toBe(cat0 + 1);
  });

  it('an approvals Retry still waiting when another chat is shown is dropped: the new chat\'s approvals are read once', async () => {
    W.apFail = true;
    const r = view();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again|retry/i }).length).toBeGreaterThan(0));
    await waitFor(() => expect(sel(S['st.verbosity']!)).not.toBeDisabled());
    W.fieldHold = true;
    await userEvent.click(sel(S['st.verbosity']!));
    await userEvent.click(await screen.findByRole('option', { name: S['st.verbosity.terse'] }));
    await waitFor(() => expect(W.fieldHeld.length).toBe(1));
    const apRetry = screen.getAllByRole('button', { name: /try again|retry/i }).at(-1)!;
    fireEvent.click(apRetry);
    await act(async () => {});
    W.apFail = false;
    const ap0 = W.apReads;
    W.row = { ...W.row, id: 's2' };
    r.rerender(<SessionTab realmId="r-work" target={TARGET} session="s2" computer="atlas" realm="Work" agents={W.agents} />);
    W.fieldHold = false;
    await act(async () => {
      for (const f of W.fieldHeld.splice(0)) f();
    });
    await waitFor(() => expect(W.apReads).toBe(ap0 + 1));
    await act(async () => {});
    await act(async () => {});
    expect(W.apReads).toBe(ap0 + 1);
  });

  it('a catalogue Retry and an approvals change in one batch, Retry first: the read runs and nothing is sent (Retry takes the tab\'s claim)', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(strict()).not.toBeDisabled());
    const cat = W.catCalls;
    W.catFail = false;
    act(() => {
      fireEvent.click(retry);
      fireEvent.click(strict());
    });
    await act(async () => {});
    expect(W.catCalls).toBe(cat + 1);
    expect(W.sent).toEqual([]);
  });

  it('a catalogue Retry and an agent switch in one batch, Retry first: the read runs and the switch is not sent', async () => {
    W.catFail = true;
    view();
    const retry = await screen.findByRole('button', { name: /try again|retry/i });
    await waitFor(() => expect(strict()).not.toBeDisabled());
    await userEvent.click(sel(S['st.agent']!));
    const reviewer = await screen.findByRole('option', { name: 'reviewer' });
    const cat = W.catCalls;
    W.catFail = false;
    act(() => {
      fireEvent.click(retry);
      fireEvent.click(reviewer);
    });
    await act(async () => {});
    expect(W.catCalls).toBe(cat + 1);
    expect(W.sent).toEqual([]);
  });
});


// :2199: Details reopened on a conversation whose model change is still unproven, and the first read fails. The C9 line
// (the same words and the same Check again as under the model) shows beside the error; Try again and Check again are both
// there, and each runs only its own read: Try again reads the conversation and settles nothing, Check again reads the
// change back once and fills the tab. Nothing is sent by either.
describe('Details → Session: a failed read keeps an unproven change (:2199)', () => {
  const lostThenClose = async () => {
    W.answer = { kind: 'lost', body: {}, code: '' };
    W.lands = false;
    const first = view();
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    await pickModel(/O9 Thinker/);
    await userEvent.click(screen.getByRole('button', { name: S['st.modelUse'] }));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
  };

  it('both buttons show beside the error; Try again only reads the conversation, Check again only reads the change back', async () => {
    await lostThenClose();
    W.failReads = 2;
    view();
    expect(await screen.findByText(S['st.readFailed']!)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: S['st.model'] })).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    const again = screen.getByRole('button', { name: /try again/i });
    // Try again: one conversation read (it fails again); the change stays unproven, its line and Check again stay.
    let before = W.liveIds.length;
    await userEvent.click(again);
    await waitFor(() => expect(W.liveIds.length).toBe(before + 1));
    await act(async () => {});
    expect(W.liveIds.length).toBe(before + 1);
    expect(screen.getByText(S['st.readFailed']!)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: S['st.model'] })).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    // Check again: one read back of the change, which now shows it: Saved, and the tab is filled from that read.
    W.row.model = 'openai/o9';
    before = W.liveIds.length;
    await userEvent.click(within(screen.getByRole('group', { name: S['st.model'] })).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.getByText(S['st.saved']!)).toBeInTheDocument());
    expect(W.liveIds.length).toBe(before + 1);
    expect(screen.queryByText(S['st.readFailed']!)).toBeNull();
    expect(modelRadio(/O9 Thinker/)).toBeInTheDocument();
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('Try again beside Check again is the conversation read only: it fills the tab and never settles the change', async () => {
    await lostThenClose();
    W.failReads = 1;
    view();
    expect(await screen.findByText(S['st.readFailed']!)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: S['st.model'] })).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    // The change has reached the chat meanwhile: a read back would prove it, an ordinary read never does.
    W.row.model = 'openai/o9';
    const before = W.liveIds.length;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByText(S['st.readFailed']!)).toBeNull());
    expect(W.liveIds.length).toBe(before + 1);
    // Still "may have gone through" with Check again, under the model: Try again proved nothing.
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(screen.queryByText(S['st.saved']!)).toBeNull();
    expect(W.sent).toEqual(['model=openai/o9']);
  });

  it('the line beside the error is the tab\'s own: its words are the model field\'s "may have gone through" line', async () => {
    await lostThenClose();
    // The line as the tab shows it under the model, when the read answers.
    const ok = view();
    const normal = (await screen.findByRole('button', { name: /check again/i })).closest('[data-model-field]')!;
    const words = within(normal as HTMLElement).getByRole('button', { name: /check again/i }).parentElement!.textContent;
    ok.unmount();
    W.failReads = 1;
    view();
    await screen.findByText(S['st.readFailed']!);
    const beside = within(screen.getByRole('group', { name: S['st.model'] })).getByRole('button', { name: /check again/i }).parentElement!.textContent;
    expect(beside).toBe(words);
  });

  it('with no unproven change the failed read shows the error alone (no Check again)', async () => {
    W.failReads = 1;
    view();
    expect(await screen.findByText(S['st.readFailed']!)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('Details → Session on a chat asleep on the computer', () => {
  // The agent refuses every live-only change of a sleeping chat (404); the chat's capability table says so (`asleep`), and the tab
  // shows that reason instead of letting a change fail at the computer. Approvals (Strict / Default) are not live-only and stay.
  const SV = svStrings as Record<string, string>;
  const asleep = { can: (a: string) => (['setModel', 'setAgent', 'setEffort', 'setVerbosity', 'setYolo'].includes(a) ? { ok: false as const, reason: 'asleep' as const } : { ok: true as const }) };
  it('ST-asleep every live control and Auto-approve are disabled with "send a message first", and nothing is sent', async () => {
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} chat={asleep} />);
    await waitFor(() => expect(screen.getAllByText(SV['sv.why.asleep']!).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole('switch', { name: AP['ap.yolo'] })).toBeInTheDocument());
    expect(free()).toHaveAttribute('aria-disabled', 'true');
    for (const l of [S['st.agent']!, S['st.verbosity']!]) expect(sel(l)).toBeDisabled();
    expect(screen.getByRole('switch', { name: AP['ap.yolo'] })).toBeDisabled();
    expect(screen.queryByText(S['st.liveIdle']!)).toBeNull();
    expect(W.sent).toEqual([]);
  });
  it('ST-awake a chat the table does not call asleep keeps the tab as it was (its own busy read decides)', async () => {
    render(<SessionTab realmId="r-work" target={TARGET} session="s1" computer="atlas" realm="Work" agents={W.agents} chat={{ can: () => ({ ok: false as const, reason: 'turn_in_flight' as const }) }} />);
    await waitFor(() => expect(free()).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByText(SV['sv.why.asleep']!)).toBeNull();
    expect(screen.getByText(S['st.liveIdle']!)).toBeInTheDocument();
  });
});
