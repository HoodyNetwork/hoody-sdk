// Vitest on a live page: Settings > Helpers. The switches say which helpers the Bot may give work to, the radio which one new helpers run on;
// the save sends only what changed, fenced by the Bot's uid and revision as the form read them. Taking Claude Code away is told before the save.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, settle } from '@core/test/env';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, SavedSettings, SettingsPatch, Workers } from './data';
import { registerTargets } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const llmOnly: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
const claude: Workers = { known: true, backend: 'acp', allowed: ['llm', 'acp'], agent: 'claude', model: 'claude-sonnet-5-5' };
const botWith = (workers: Workers, extra: Partial<BotView> = {}): BotView =>
  ({
    key: KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 6, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: false, ready: null, why: null, config: null }, workers, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
    ...extra,
  }) as BotView;

type Sent = { patch: SettingsPatch; uid?: string; revision?: number };
let sent: Sent[] = [];
let shown: { outcome: 'idle' | 'failed' | 'stale' | 'pending'; code?: string; details?: Record<string, unknown> } = { outcome: 'idle' };
const saveChange = (): Change<SavedSettings, Sent> =>
  ({
    run: async (v: Sent) => { sent.push(v); return { outcome: 'done' as const }; },
    outcome: shown.outcome, data: undefined, code: shown.code, details: shown.details, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<SavedSettings, Sent>;
const rules = { run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
async function show(bot: BotView): Promise<void> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <SettingsDrawer section="workers" onSection={() => undefined} onClose={() => undefined} bot={bot} models={[]} computers={[]} save={saveChange()} saveRules={rules as never} /> }),
    history: createMemoryHistory({ initialEntries: ['/bots'] }),
  });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  sent = [];
  shown = { outcome: 'idle' };
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});
afterEach(() => cleanup());

const box = (name: string) => screen.getByRole('switch', { name: new RegExp(`^${name}`) }) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: /^Save/ });

describe('the choices', () => {
  it('a Bot on Hoody models only: Claude Code is off, the last allowed one cannot be unticked, no default to choose, nothing to save', async () => {
    await show(botWith(llmOnly));
    expect(box('Hoody models').checked).toBe(true);
    expect(box('Hoody models').disabled).toBe(true);
    expect(box('Claude Code').checked).toBe(false);
    expect(screen.queryByRole('radiogroup', { name: strings['workers.default'] })).toBeNull();
    expect(screen.getByText(strings['workers.onlyLlm'])).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('allowing Claude Code offers the default and saves the list and the agent, fenced by the uid and revision the form read', async () => {
    await show(botWith(llmOnly));
    await userEvent.click(box('Claude Code'));
    expect(await screen.findByRole('radiogroup', { name: strings['workers.default'] })).toBeInTheDocument();
    await userEvent.click(save());
    await flush();
    expect(sent).toEqual([{ patch: { allowed_worker_backends: ['llm', 'acp'], worker_delegated_agent: 'claude' }, uid: 'u-chief', revision: 6 }]);
  });

  it('choosing Claude Code as the default names the default too', async () => {
    await show(botWith(llmOnly));
    await userEvent.click(box('Claude Code'));
    await userEvent.click(await screen.findByRole('radio', { name: strings['workers.default.acp'] }));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'], worker_backend: 'acp', worker_delegated_agent: 'claude' });
  });

  it('a stored Claude model is shown as it is, and Claude Code\'s own choice when none is stored', async () => {
    await show(botWith({ ...claude, model: 'claude-weird-9' }));
    // The Claude Code model is a picker: a stored model it does not list is kept as its value.
    expect(screen.getByRole('button', { name: /^claude-weird-9/ })).toBeInTheDocument();
  });
});

describe('taking Claude Code away', () => {
  it('says before the save that new helpers will run on Hoody models and the Claude model is kept, then sends the list only', async () => {
    await show(botWith(claude));
    await userEvent.click(box('Claude Code'));
    expect(await screen.findByText(new RegExp(strings['workers.revoke.kept'].slice(0, 30)))).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: strings['workers.default'] })).toBeNull();
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm'] });
  });

  it('with no Claude model stored the note does not talk about one', async () => {
    await show(botWith({ ...claude, model: '' }));
    await userEvent.click(box('Claude Code'));
    expect(await screen.findByText(strings['workers.revoke'])).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(strings['workers.revoke.kept'].slice(0, 30)))).toBeNull();
  });
});

// A drawer whose save answers as the test says and, when it succeeds, optionally shows the Bot as it is after the save (the page's refresh).
let setHostBot: (b: BotView) => void = () => undefined;
function Host({ first, answer }: { first: BotView; answer: (v: Sent, set: (b: BotView) => void) => { outcome: 'done' | 'failed'; code?: string; details?: Record<string, unknown>; revision?: number } }) {
  const [bot, set] = useState<BotView>(first);
  setHostBot = set;
  const [shownNow, setShownNow] = useState<{ outcome: 'idle' | 'failed'; code?: string; details?: Record<string, unknown> }>({ outcome: 'idle' });
  const change = {
    run: async (v: Sent) => {
      sent.push(v);
      const r = answer(v, set);
      setShownNow(r.outcome === 'failed' ? { outcome: 'failed', code: r.code, details: r.details } : { outcome: 'idle' });
      return { outcome: r.outcome, data: r.revision !== undefined ? { revision: r.revision } : undefined, code: r.code };
    },
    outcome: shownNow.outcome, data: undefined, code: shownNow.code, details: shownNow.details, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<SavedSettings, Sent>;
  return <SettingsDrawer section="workers" onSection={() => undefined} onClose={() => undefined} bot={bot} models={[]} computers={[]} save={change} saveRules={rules as never} />;
}
async function host(first: BotView, answer: Parameters<typeof Host>[0]['answer']): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host first={first} answer={answer} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}

describe('after a saved revoke', () => {
  it('allowing Claude Code again keeps Hoody models as the default: the form does not remember the old default, so the save names the list only', async () => {
    // The Bot as the page shows it after the save: the agent moved the default to Hoody models and kept the Claude model.
    await host(botWith(claude), (_v, set) => {
      set(botWith({ ...claude, backend: 'llm', allowed: ['llm'] }, { guardrailRevision: 7 }));
      return { outcome: 'done', revision: 7 };
    });
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm'] });
    await userEvent.click(box('Claude Code'));
    expect(await screen.findByRole('radio', { name: strings['workers.default.llm'] })).toBeChecked();
    await userEvent.click(save());
    await flush();
    expect(sent[1]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
    expect(sent[1]?.revision).toBe(7);
  });
});

describe('a second save before the Bot is read again', () => {
  it('is worked out against what the first save left: the list the first one changed is sent again when the form differs from it', async () => {
    // The first save is acknowledged but the page has not refreshed the Bot: the bot prop still holds the policy from before it.
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: 7 }));
    await userEvent.click(box('Hoody models'));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['acp'], worker_backend: 'acp' });
    await userEvent.click(box('Hoody models'));
    await userEvent.click(await screen.findByRole('radio', { name: strings['workers.default.acp'] }));
    await userEvent.click(save());
    await flush();
    expect(sent[1]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
    // The fence follows the revision the first save answered with: a clean form is not rolled back to the older revision the page still shows.
    expect(sent[1]?.revision).toBe(7);
  });

  it('a form that is back to what the first save left has nothing to save', async () => {
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: 7 }));
    await userEvent.click(box('Hoody models'));
    await userEvent.click(save());
    await flush();
    expect(save()).toBeDisabled();
  });
});

describe('the Bot\'s policy changes under the form', () => {
  const sole: Workers = { known: true, backend: 'acp', allowed: ['acp'], agent: 'claude', model: 'claude-sonnet-5-5' };
  it('a form with nothing to save takes the new policy and the new revision together, so its next save is based on both', async () => {
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: 9 }));
    // Another writer removes Hoody models (revision 7); the page reads the Bot again.
    await act(async () => setHostBot(botWith(sole, { guardrailRevision: 7 })));
    await flush();
    expect(box('Hoody models').checked).toBe(false);
    expect(save()).toBeDisabled();
    await userEvent.click(box('Hoody models'));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
    expect(sent[0]?.revision).toBe(7);
  });

  it('a form with edits keeps them and its older fence: its save is refused as stale, never applied on the other writer\'s policy', async () => {
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: 9 }));
    await userEvent.click(box('Claude Code'));
    await act(async () => setHostBot(botWith(sole, { guardrailRevision: 7 })));
    await flush();
    expect(box('Claude Code').checked).toBe(false);
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.revision).toBe(6);
  });
});

describe('edits undone after the policy changed under the form', () => {
  const sole: Workers = { known: true, backend: 'acp', allowed: ['acp'], agent: 'claude', model: 'claude-sonnet-5-5' };
  it('the form takes the new policy and revision when it turns clean again, never a new revision over the old policy', async () => {
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: 9 }));
    await userEvent.click(box('Claude Code'));
    await act(async () => setHostBot(botWith(sole, { guardrailRevision: 7 })));
    await flush();
    // The edit is undone: the form is clean, so it adopts what the Bot holds now (Hoody models are gone) with the revision.
    await userEvent.click(box('Claude Code'));
    await flush();
    expect(box('Hoody models').checked).toBe(false);
    await userEvent.click(box('Hoody models'));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
    expect(sent[0]?.revision).toBe(7);
  });
});

describe('a delayed read of the Bot after two saves', () => {
  it('is not adopted: the form keeps what the second save left, and its next save is worked out against it', async () => {
    let n = 6;
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: (n += 1) }));
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    await userEvent.click(box('Claude Code'));
    await userEvent.click(await screen.findByRole('radio', { name: strings['workers.default.acp'] }));
    await userEvent.click(save());
    await flush();
    expect(sent.map((s) => s.patch)).toEqual([{ allowed_worker_backends: ['llm'] }, { allowed_worker_backends: ['llm', 'acp'], worker_backend: 'acp' }]);
    // The read of the Bot that arrives now is the one after the first save (revision 7), not the second (8).
    await act(async () => setHostBot(botWith({ ...claude, backend: 'llm', allowed: ['llm'] }, { guardrailRevision: 7 })));
    await flush();
    expect(box('Claude Code').checked).toBe(true);
    expect(screen.getByRole('radio', { name: strings['workers.default.acp'] })).toBeChecked();
    await userEvent.click(box('Hoody models'));
    await userEvent.click(save());
    await flush();
    expect(sent[2]?.patch).toEqual({ allowed_worker_backends: ['acp'] });
    expect(sent[2]?.revision).toBe(8);
  });
});

describe('a newer read of a policy that an older read already showed', () => {
  it('is adopted: an ignored delayed read does not hide the same policy read again at a newer revision', async () => {
    let n = 6;
    const p1 = botWith({ ...claude, backend: 'llm', allowed: ['llm'] }, { guardrailRevision: 7 });
    await host(botWith({ ...claude, backend: 'llm' }), () => ({ outcome: 'done', revision: (n += 1) }));
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    // The delayed read after the first save (revision 7) is ignored; then another writer sets that same policy again (revision 9).
    await act(async () => setHostBot(p1));
    await flush();
    expect(box('Claude Code').checked).toBe(true);
    await act(async () => setHostBot({ ...p1, guardrailRevision: 9 }));
    await flush();
    expect(box('Claude Code').checked).toBe(false);
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    expect(sent[2]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
    expect(sent[2]?.revision).toBe(9);
  });
});

describe('the same policy read again at a newer revision', () => {
  it('moves the baseline\'s revision, so an older read that arrives later is not adopted beneath it', async () => {
    const hoody: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
    await host(botWith(hoody), () => ({ outcome: 'done', revision: 99 }));
    // A write that did not touch the policy moved the Bot to revision 9; then a delayed read at revision 8 shows both choices allowed.
    await act(async () => setHostBot(botWith(hoody, { guardrailRevision: 9 })));
    await flush();
    await act(async () => setHostBot(botWith(claude, { guardrailRevision: 8 })));
    await flush();
    expect(box('Claude Code').checked).toBe(false);
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'], worker_delegated_agent: 'claude' });
    expect(sent[0]?.revision).toBe(9);
  });
});

describe('what the agent may not do', () => {
  it('an agent that reports no policy: the section says so and cannot be changed or saved', async () => {
    await show(botWith({ known: false, backend: 'llm', allowed: ['llm'], agent: '', model: '' }));
    expect(screen.getByText(strings['workers.needsUpdate'])).toBeInTheDocument();
    expect(box('Claude Code').disabled).toBe(true);
    expect(save()).toBeDisabled();
  });

  it('a refused model is told in words from the code and field, never the agent\'s text', async () => {
    await host(botWith(claude), () => ({ outcome: 'failed', code: 'model_unavailable', details: { field: 'worker_delegated_model', reason: 'not_claude' } }));
    await userEvent.click(box('Claude Code'));
    await userEvent.click(save());
    expect(await screen.findByText(strings['workers.refused.model'])).toBeInTheDocument();
  });

  it('a refusal of another section\'s save (the Bot\'s model) is not told here', async () => {
    shown = { outcome: 'failed', code: 'model_unavailable', details: { field: 'model', reason: 'unknown_model' } };
    await show(botWith(claude));
    expect(screen.queryByText(strings['workers.refused.model'])).toBeNull();
    expect(screen.queryByText(strings['workers.refused.generic'])).toBeNull();
  });

  it('another writer\'s change (stale) shows the reload banner and the Helpers section does not send again by itself', async () => {
    shown = { outcome: 'stale' };
    await show(botWith(claude));
    expect(await screen.findByText(strings['settings.stale'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('the section is a rail entry', async () => {
    await show(botWith(llmOnly));
    expect(within(screen.getByRole('navigation', { name: strings['settings.rail'] })).getByText(strings['workers.title'])).toBeInTheDocument();
  });
});
