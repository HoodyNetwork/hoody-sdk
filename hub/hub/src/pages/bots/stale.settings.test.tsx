// A Settings form with edits learns at once that the Bot changed elsewhere. When a newer revision of
// the Bot arrives under unsaved edits, the "Changed elsewhere" band with Reload shows before any Save (that save would only be refused);
// Reload takes the Bot as it is now and drops the edits. A form with no edits, or a read no newer than the form's own, shows nothing.
// The same for Helpers, Voice and a model pick, and each with an edit still in the form while the save runs.
// While this form's own save runs (Guardrails: both its writes), the refresh carrying that save's write shows no band; a refusal still does.
// The agent's refusal of the fence, read by its code: 412 revision_mismatch is "Changed elsewhere" with Reload, 412 bot_changed is the Bot gone
// with a way back to the list; neither is said as a failed save. Any other failure (a 5xx) still is.
// A refusal belongs to the save that answered it (Behaviour/model vs Guardrails): a later save of the other kind speaks for the form,
// a failure or a may-have-gone-through with its Check again (C9); while the Bot is gone no model pick is sent.
// The saves' outcomes outlive the form (closing the drawer unmounts it), and so does which save owns a refusal: reopening keeps the band / the Bot gone.
// The owner lives with the saves (BotPane), so a pane that draws something else in the drawer's place and then the drawer again keeps it too.
// The BotPane wiring is pinned at its source, and a model pick while the Bot is gone must find a locked chooser.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, settle } from '@core/test/env';
import { installTransport } from '@core/transport';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, ModelRow, SavedSettings, SettingsPatch, Workers } from './data';
import type { SettingsSection } from './logic';
import { registerTargets } from './data';
import { SettingsDrawer, type SettingsLastSave } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const llmOnly: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
const botAt = (extra: Partial<BotView> = {}): BotView =>
  ({
    key: `c1~${R1}~chief`, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: 'Be brief.', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 6, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: false, ready: null, why: null, config: null }, workers: llmOnly, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
    ...extra,
  }) as BotView;

type Sent = { patch: SettingsPatch; uid?: string; revision?: number };
let sent: Sent[] = [];
// A held save: run waits until release() answers it with the given revision (none: a failure that answered no revision).
let held = false;
let release: (revision?: number) => void = () => undefined;
let outcome = 'idle';
let code: string | undefined;
const answerWith = async (answer?: number) => {
  if (!held) return { outcome: 'done' as const, data: answer !== undefined ? { revision: answer } : undefined };
  const revision = await new Promise<number | undefined>((r) => { release = r; });
  return { outcome: revision !== undefined ? ('done' as const) : ('failed' as const), data: revision !== undefined ? { revision } : undefined };
};
const rules = { run: async (v: Sent) => { sent.push(v); return answerWith(); }, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;
const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
let setBot: (b: BotView) => void = () => undefined;
let setSection: (s: SettingsSection) => void = () => undefined;
let models: ModelRow[] = [];
let router: ReturnType<typeof createRouter> | null = null;
function Host({ first, answer, section: from = 'behaviour' }: { first: BotView; answer?: number; section?: SettingsSection }) {
  const [bot, set] = useState<BotView>(first);
  const [section, setS] = useState<SettingsSection>(from);
  setBot = set;
  setSection = setS;
  const change = {
    run: async (v: Sent) => { sent.push(v); return answerWith(answer); },
    outcome, data: undefined, code, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<SavedSettings, Sent>;
  return <SettingsDrawer section={section} onSection={() => undefined} onClose={() => undefined} bot={bot} models={models} computers={[]} save={change} saveRules={rules as never} />;
}
async function host(first: BotView, answer?: number, section?: SettingsSection): Promise<void> {
  const r = createRouter({ routeTree: createRootRoute({ component: () => <Host first={first} answer={answer} section={section} /> }), history: createMemoryHistory({ initialEntries: ['/bots?settings=x'] }) });
  router = r as never;
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={r} /></CoreQueryProvider>);
    await r.load();
  });
  await flush();
}
const instructions = () => screen.getByRole('textbox', { name: /instructions/i }) as HTMLTextAreaElement;
const band = () => screen.queryByText(strings['settings.stale']);
afterEach(() => installTransport(null));
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  sent = [];
  held = false;
  outcome = 'idle';
  code = undefined;
  Object.assign(rules, { outcome: 'idle', data: undefined, code: undefined });
  models = [];
  registerTargets([]);   // module state: a test that registers computers must not change the next one's
});

describe('the Bot changed elsewhere under unsaved edits', () => {
  it('a newer revision under edits shows "Changed elsewhere" with Reload before any save; Reload takes the Bot as it is now', async () => {
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    expect(band()).toBeNull();
    await act(async () => setBot(botAt({ instructions: 'Theirs.', guardrailRevision: 7 })));
    await flush();
    expect(band()).not.toBeNull();
    expect(sent).toEqual([]);
    expect(instructions().value).toBe('Be brief. Mine.');            // the edits stay until the person chooses
    await userEvent.click(screen.getByRole('button', { name: strings['settings.reload'] }));
    await flush();
    expect(band()).toBeNull();
    expect(instructions().value).toBe('Theirs.');
    expect(sent).toEqual([]);
  });

  it('a form with no edits takes nothing for a band: a newer revision of the same values shows nothing', async () => {
    await host(botAt());
    await act(async () => setBot(botAt({ guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
  });

  it('no edit typed, but another writer changed a value the form shows: the band shows too (the form is out of date)', async () => {
    await host(botAt());
    await act(async () => setBot(botAt({ instructions: 'Theirs.', guardrailRevision: 7 })));
    await flush();
    expect(band()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['settings.reload'] }));
    await flush();
    expect(instructions().value).toBe('Theirs.');
    expect(band()).toBeNull();
  });

  it('edits under a read no newer than the form\'s own revision show nothing', async () => {
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await act(async () => setBot(botAt({ guardrailRevision: 6, queued: 1 })));
    await flush();
    expect(band()).toBeNull();
  });

  it('this form\'s own save: the refresh at the revision the save answered shows nothing, and later edits show nothing either', async () => {
    await host(botAt(), 7);
    await userEvent.type(instructions(), ' Mine.');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
    expect(sent[0]?.revision).toBe(6);
    await act(async () => setBot(botAt({ instructions: 'Be brief. Mine.', guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await userEvent.type(instructions(), ' More.');
    await flush();
    expect(band()).toBeNull();
  });
});

describe('this form\'s own save is not "changed elsewhere"', () => {
  const saveNow = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
  };

  it('the refresh carrying the save\'s own write arrives before the save answers: no band, then or after', async () => {
    held = true;
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    expect(sent).toHaveLength(1);
    await act(async () => setBot(botAt({ instructions: 'Be brief. Mine.', guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).toBeNull();
    await userEvent.type(instructions(), ' More.');
    await flush();
    expect(band()).toBeNull();
  });

  it('Guardrails: refreshes between its two writes (rules not written yet) and after show no band', async () => {
    held = true;
    await host(botAt(), undefined, 'guardrails');
    await userEvent.type(screen.getByRole('textbox', { name: strings['guard.rules'] }), 'No deletes.');
    await saveNow();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.revision).toBe(6);
    await act(async () => setBot(botAt({ guardrailRevision: 7 })));   // the mode and computers PATCH landed, the rules not yet
    await flush();
    expect(band()).toBeNull();
    await act(async () => setBot(botAt({ guardrails: ['No deletes.'], guardrailRevision: 8 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(8));
    await flush();
    expect(band()).toBeNull();
  });

  it('another writer\'s newer revision during the save shows the band once the save answers an older one', async () => {
    held = true;
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    await act(async () => setBot(botAt({ instructions: 'Theirs.', guardrailRevision: 8 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).not.toBeNull();
  });

  it('a save that answers no revision (failed) under a newer revision shows the band once it answers', async () => {
    held = true;
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    await act(async () => setBot(botAt({ guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(undefined));
    await flush();
    expect(band()).not.toBeNull();
  });

  it('a stale refusal shows the band even while a save runs', async () => {
    held = true;
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    outcome = 'stale';
    await act(async () => setBot(botAt({ queued: 1 })));
    await flush();
    expect(band()).not.toBeNull();
  });
});

describe('every save path, with an edit still in the form while its save runs', () => {
  const saveNow = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
  };

  it('Behaviour: an edit typed while the save runs, then the refresh with the saved write: no band, then or after', async () => {
    held = true;
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    await userEvent.type(instructions(), ' More.');
    await act(async () => setBot(botAt({ instructions: 'Be brief. Mine.', guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).toBeNull();
    expect(instructions().value).toBe('Be brief. Mine. More.');
    await act(async () => setBot(botAt({ instructions: 'Theirs.', guardrailRevision: 8 })));   // another writer, under the kept edit
    await flush();
    expect(band()).not.toBeNull();
  });

  it('Helpers: the refresh before the save answers shows no band, the answer keeps the form as edited, and another writer shows the band', async () => {
    registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
    held = true;
    await host(botAt(), undefined, 'workers');
    await userEvent.click(screen.getByRole('switch', { name: /^Claude Code/ }));
    await saveNow();
    expect(sent[0]?.patch).toEqual({ allowed_worker_backends: ['llm', 'acp'], worker_delegated_agent: 'claude' });
    await userEvent.click(await screen.findByRole('radio', { name: strings['workers.default.acp'] }));   // an edit kept while it runs
    const saved: Workers = { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: '' };
    await act(async () => setBot(botAt({ workers: saved, guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).toBeNull();
    expect((screen.getByRole('switch', { name: /^Claude Code/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: strings['workers.default.acp'] })).toBeChecked();
    await act(async () => setBot(botAt({ workers: { ...saved, model: 'claude-sonnet-5-5' }, guardrailRevision: 8 })));
    await flush();
    expect(band()).not.toBeNull();
  });

  it('Voice: an edit typed while the save runs, then the refresh with the saved write: no band, then or after', async () => {
    const config = { raw: { stt_model: 'openai/gpt-4o-transcribe', tts_model: 'openai/gpt-4o-mini-tts', voice: 'nova', language: 'en', speed: 1, speak_wakes: false, speak_gates: true, stt_prompt: 'Hoody' }, sttModel: 'openai/gpt-4o-transcribe', ttsModel: 'openai/gpt-4o-mini-tts', voice: 'nova', language: 'en', speed: 1, speakWakes: false, speakGates: true };
    const speech = (prompt: string) => ({ enabled: true, ready: null, why: null, config: { ...config, raw: { ...config.raw, stt_prompt: prompt } } }) as BotView['speech'];
    held = true;
    await host(botAt({ speech: speech('Hoody') }), undefined, 'voice');
    const prompt = () => screen.getByRole('textbox', { name: strings['voice.prompt'] }) as HTMLInputElement;
    await userEvent.type(prompt(), 'X');
    await saveNow();
    expect((sent[0]?.patch.speech as Record<string, unknown>).stt_prompt).toBe('HoodyX');
    await userEvent.type(prompt(), 'Y');
    await act(async () => setBot(botAt({ speech: speech('HoodyX'), guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).toBeNull();
  });

  it('a model pick with a Behaviour edit kept: the refresh with the new model before the pick answers shows no band, then or after', async () => {
    models = [
      { spec: 'p/a', label: 'Model A', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
      { spec: 'p/b', label: 'Model B', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
    ];
    held = true;
    // The kit chooser reads c9's agent: provider p reports ready and both models are on its ready list.
    registerTargets([{ id: 'c9', project_id: 'p-1', server_name: 'c9-srv' }]);
    const reads = { providers: { providers: [{ id: 'p', prefix: 'p/', display_name: 'P', status: { state: 'ready', via: 'stored_key', methods: [] } }] }, models: { models: [{ spec: 'p/a', display_name: 'Model A' }, { spec: 'p/b', display_name: 'Model B' }] } };
    installTransport({
      hoody: () => Promise.resolve({ data: {} }),
      fetch: (url) => {
        const path = new URL(String(url), 'http://x').pathname;
        const body = path.endsWith('/providers') ? reads.providers : path.endsWith('/models') ? reads.models : {};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      },
    });
    const bot = (extra: Partial<BotView> = {}) => botAt({ key: `c9~${R1}~chief`, ...extra });
    await host(bot());
    await userEvent.type(instructions(), ' Mine.');
    await act(async () => setSection('model'));
    await flush();
    await userEvent.click(await screen.findByRole('option', { name: /Model B/ }, { timeout: 8000 }));
    await flush();
    expect(sent.at(-1)?.patch).toEqual({ model: 'p/b' });
    await act(async () => setBot(bot({ model: 'p/b', guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    await act(async () => release(7));
    await flush();
    expect(band()).toBeNull();
  });
});

describe('stored guardrails with padded or blank lines', () => {
  // Set through the API: the agent trims each line and drops blank ones when it uses them, and so does a save of this form.
  const padded = ['  No deletes. ', '', 'Ask first.  ', '   '];
  const saveOff = () => {
    const b = screen.getByRole('button', { name: /^Save/ });
    return b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
  };

  it('the form opens clean: nothing to save, nothing to discard', async () => {
    await host(botAt({ guardrails: padded }), undefined, 'guardrails');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: strings['guard.rules'] }).value).not.toBe('');
    expect(saveOff()).toBe(true);
  });

  it('a newer revision of the same values shows no "Changed elsewhere" band (the form follows the Bot)', async () => {
    await host(botAt({ guardrails: padded }), undefined, 'guardrails');
    await act(async () => setBot(botAt({ guardrails: padded, guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    // and a later edit is based on that revision, so its save carries it and is not refused as stale
    await userEvent.type(screen.getByRole('textbox', { name: strings['guard.rules'] }), '\nNo pushes.');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
    expect(sent[0]?.revision).toBe(7);
  });

  it('a real rules edit is still an edit: Save offered, and another writer then shows the band', async () => {
    await host(botAt({ guardrails: padded }), undefined, 'guardrails');
    await userEvent.type(screen.getByRole('textbox', { name: strings['guard.rules'] }), '\nNo pushes.');
    expect(saveOff()).toBe(false);
    await act(async () => setBot(botAt({ guardrails: padded, guardrailRevision: 7 })));
    await flush();
    expect(band()).not.toBeNull();
  });

  it('padding only, changed by another writer, is not a change the form shows', async () => {
    await host(botAt({ guardrails: ['No deletes.', 'Ask first.'] }), undefined, 'guardrails');
    await act(async () => setBot(botAt({ guardrails: padded, guardrailRevision: 7 })));
    await flush();
    expect(band()).toBeNull();
    expect(saveOff()).toBe(true);
  });
});

describe('the agent refused the fence (read by its code)', () => {
  const failedSave = () => screen.queryByText(/go through|weren.t saved/i);
  const gone = () => screen.queryByText(strings['bot.gone']);
  // A save answered with a definite refusal: the change reports it on its next render (the Bot is not read again in between).
  const refuse = async (as: string | undefined) => {
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
    outcome = 'failed';
    code = as;
    await act(async () => setBot(botAt({ queued: 1 })));
    await flush();
  };

  it('Behaviour refused 412 revision_mismatch: "Changed elsewhere" with Reload, never a failed save, with no newer read of the Bot', async () => {
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await refuse('revision_mismatch');
    expect(band()).not.toBeNull();
    expect(screen.getByRole('button', { name: strings['settings.reload'] })).toBeInTheDocument();
    expect(failedSave()).toBeNull();
    expect(gone()).toBeNull();
  });

  it('Behaviour refused 412 bot_changed: the Bot is gone, Save is off, and Back to the list leaves the settings', async () => {
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await refuse('bot_changed');
    expect(gone()).not.toBeNull();
    expect(band()).toBeNull();
    expect(failedSave()).toBeNull();
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['bot.backToList'] }));
    await flush();
    expect(router?.state.location.href).toBe('/bots');
  });

  it('Guardrails: the mode PATCH refused 412 revision_mismatch shows the band; refused 412 bot_changed shows the Bot gone', async () => {
    await host(botAt(), undefined, 'guardrails');
    await userEvent.type(screen.getByRole('textbox', { name: strings['guard.rules'] }), 'No deletes.');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
    Object.assign(rules, { outcome: 'failed', code: 'revision_mismatch' });
    await act(async () => setBot(botAt({ queued: 1 })));
    await flush();
    expect(band()).not.toBeNull();
    expect(failedSave()).toBeNull();
    Object.assign(rules, { outcome: 'failed', code: 'bot_changed' });
    await act(async () => setBot(botAt({ queued: 2 })));
    await flush();
    expect(gone()).not.toBeNull();
    expect(band()).toBeNull();
  });

  it('Guardrails: the rules write refused after the mode saved ("stale" / "gone") reads as the band / the Bot gone, never "rules not saved"', async () => {
    await host(botAt(), undefined, 'guardrails');
    await userEvent.type(screen.getByRole('textbox', { name: strings['guard.rules'] }), 'No deletes.');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
    Object.assign(rules, { outcome: 'done', data: { rules: 'stale', revision: 7 } });
    await act(async () => setBot(botAt({ queued: 1 })));
    await flush();
    expect(band()).not.toBeNull();
    expect(screen.queryByText(strings['settings.rules.failed.title'])).toBeNull();
    Object.assign(rules, { outcome: 'done', data: { rules: 'gone', revision: 7 } });
    await act(async () => setBot(botAt({ queued: 2 })));
    await flush();
    expect(gone()).not.toBeNull();
    expect(screen.queryByText(strings['settings.rules.failed.title'])).toBeNull();
  });

  it('control: a 5xx failure (or a 412 of another code) is still a failed save, with no band and no Bot gone', async () => {
    await host(botAt());
    await userEvent.type(instructions(), ' Mine.');
    await refuse('internal_error');
    expect(failedSave()).not.toBeNull();
    expect(band()).toBeNull();
    expect(gone()).toBeNull();
  });
});

// Two stateful saves (the drawer's save and saveRules): each run takes the next answer from its queue and reports it as its outcome on the next
// render, as useChange does, so these tests drive successive real saves through the drawer's own Save and model pick.
type Answer = { outcome: 'done' | 'failed' | 'pending'; code?: string; data?: unknown };
let queued: { save: Answer[]; rules: Answer[] } = { save: [], rules: [] };
function useFakeChange(kind: 'save' | 'rules') {
  const [st, setSt] = useState<{ outcome: string; code?: string; data?: unknown }>({ outcome: 'idle' });
  return {
    run: async (v: Sent) => {
      sent.push(v);
      const a = queued[kind].shift() ?? { outcome: 'done' as const };
      setSt({ outcome: a.outcome, code: a.code, data: a.data });
      return { outcome: a.outcome, data: a.data, code: a.code };
    },
    outcome: st.outcome, data: st.data, code: st.code, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => setSt({ outcome: 'idle' }),
  };
}
let setOpen: (s: SettingsSection | undefined) => void = () => undefined;
let setShown: (v: boolean) => void = () => undefined;
// As BotPane: the two saves and which was started last live here, beside each other; `shown` false stands for the pane drawing something else in the
// drawer's place (its view loading again or failing, BotPane's early returns), which unmounts the drawer while the saves live on.
function Host2({ first, section: from }: { first: BotView; section: SettingsSection }) {
  const [bot, set] = useState<BotView>(first);
  const [section, setS] = useState<SettingsSection | undefined>(from);
  const [shown, setSh] = useState(true);
  const [last, setLast] = useState<SettingsLastSave | null>(null);
  setBot = set;
  setSection = setS;
  setOpen = setS;
  setShown = setSh;
  const save = useFakeChange('save') as unknown as Change<SavedSettings, Sent>;
  const saveRules = useFakeChange('rules') as never;
  if (!shown) return <p>Loading the Bot</p>;
  return <SettingsDrawer section={section} onSection={() => undefined} onClose={() => undefined} bot={bot} models={models} computers={[]} save={save} saveRules={saveRules} lastSave={last} onSaveStart={setLast} />;
}
async function host2(first: BotView, section: SettingsSection): Promise<void> {
  const r = createRouter({ routeTree: createRootRoute({ component: () => <Host2 first={first} section={section} /> }), history: createMemoryHistory({ initialEntries: ['/bots?settings=x'] }) });
  router = r as never;
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={r} /></CoreQueryProvider>);
    await r.load();
  });
  await flush();
}

describe('a refusal belongs to the save that answered it', () => {
  beforeEach(() => {
    queued = { save: [], rules: [] };
  });
  const failedSave = () => screen.queryByText(/didn.t go through/i);
  const maybe = () => screen.queryByText(/may have gone through/i);
  const gone = () => screen.queryByText(strings['bot.gone']);
  const saveNow = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await flush();
  };
  const rulesBox = () => screen.getByRole('textbox', { name: strings['guard.rules'] });
  const toSection = async (x: SettingsSection) => {
    await act(async () => setSection(x));
    await flush();
  };

  it.each([
    ['a 5xx', { outcome: 'failed', code: 'internal_error' } as Answer, 'failed'],
    ['an answer that may have gone through', { outcome: 'pending' } as Answer, 'pending'],
  ] as const)('Guardrails refused revision_mismatch, then a Behaviour save answering %s: that outcome shows, not the old band', async (_, answer, shows) => {
    queued.rules.push({ outcome: 'failed', code: 'revision_mismatch' });
    queued.save.push(answer);
    await host2(botAt(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    expect(band()).not.toBeNull();
    await toSection('behaviour');
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    expect(band()).toBeNull();
    if (shows === 'failed') expect(failedSave()).not.toBeNull();
    else {
      expect(maybe()).not.toBeNull();
      expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    }
  });

  it.each([
    ['a 5xx', { outcome: 'failed', code: 'internal_error' } as Answer, 'failed'],
    ['an answer that may have gone through', { outcome: 'pending' } as Answer, 'pending'],
  ] as const)('Behaviour refused revision_mismatch, then a Guardrails save answering %s: that outcome shows, not the old band', async (_, answer, shows) => {
    queued.save.push({ outcome: 'failed', code: 'revision_mismatch' });
    queued.rules.push(answer);
    await host2(botAt(), 'behaviour');
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    expect(band()).not.toBeNull();
    await toSection('guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    expect(band()).toBeNull();
    if (shows === 'failed') expect(failedSave()).not.toBeNull();
    else {
      expect(maybe()).not.toBeNull();
      expect(screen.getByRole('button', { name: /Check again/ })).toBeInTheDocument();
    }
  });

  const twoModels = () => {
    models = [
      { spec: 'p/a', label: 'Model A', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
      { spec: 'p/b', label: 'Model B', provider: 'p', providerLabel: 'P', source: 'provider', ready: 'ready', computerDefault: false },
    ];
    registerTargets([{ id: 'c9', project_id: 'p-1', server_name: 'c9-srv' }]);
    const reads = { providers: { providers: [{ id: 'p', prefix: 'p/', display_name: 'P', status: { state: 'ready', via: 'stored_key', methods: [] } }] }, models: { models: [{ spec: 'p/a', display_name: 'Model A' }, { spec: 'p/b', display_name: 'Model B' }] } };
    installTransport({
      hoody: () => Promise.resolve({ data: {} }),
      fetch: (url) => {
        const path = new URL(String(url), 'http://x').pathname;
        const body = path.endsWith('/providers') ? reads.providers : path.endsWith('/models') ? reads.models : {};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      },
    });
    return botAt({ key: `c9~${R1}~chief` });
  };
  const pick = async (name: RegExp) => {
    await userEvent.click(await screen.findByRole('option', { name }, { timeout: 8000 }));
    await flush();
  };

  // While the Bot is gone the chooser is locked: the option is there, its listbox is aria-disabled (activation does nothing), and a real click on
  // it sends nothing. The click is not allowed to fail quietly: a missing option fails the test.
  const lockedPick = async (name: RegExp) => {
    const option = await screen.findByRole('option', { name }, { timeout: 8000 });
    expect(option.closest('[role="listbox"]')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(option);
    await flush();
  };

  it('a model pick refused bot_changed: the Bot is gone, not "weren\'t saved", and a second pick sends nothing', async () => {
    queued.save.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(twoModels(), 'model');
    await pick(/Model B/);
    expect(sent).toHaveLength(1);
    expect(gone()).not.toBeNull();
    expect(screen.queryByText(strings['settings.failed'])).toBeNull();
    await lockedPick(/Model A/);
    expect(sent).toHaveLength(1);
    expect(gone()).not.toBeNull();
  });

  it('a model pick refused revision_mismatch: the band, not "weren\'t saved" at the chooser', async () => {
    queued.save.push({ outcome: 'failed', code: 'revision_mismatch' });
    await host2(twoModels(), 'model');
    await pick(/Model B/);
    expect(band()).not.toBeNull();
    expect(screen.queryByText(strings['settings.failed'])).toBeNull();
  });

  it('Guardrails refused bot_changed, then Model: no pick is sent and the Bot stays gone', async () => {
    queued.rules.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(twoModels(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    expect(gone()).not.toBeNull();
    await toSection('model');
    await lockedPick(/Model B/);
    expect(sent).toHaveLength(1);
    expect(gone()).not.toBeNull();
  });

  const reopen = async (x: SettingsSection) => {
    await act(async () => setOpen(undefined));
    await flush();
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    await act(async () => setOpen(x));
    await flush();
  };

  // The pane draws something else in the drawer's place and then the drawer again, with the section still open: the saves never unmounted.
  const replaced = async () => {
    await act(async () => setShown(false));
    await flush();
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    await act(async () => setShown(true));
    await flush();
  };

  it.each([
    ['behaviour', 'save', 'bot_changed'],
    ['behaviour', 'save', 'revision_mismatch'],
    ['guardrails', 'rules', 'bot_changed'],
    ['guardrails', 'rules', 'revision_mismatch'],
  ] as const)('%s refused %s/%s, the drawer replaced and drawn again: the refusal still reads as it did', async (sec, kind, code) => {
    queued[kind].push({ outcome: 'failed', code });
    await host2(botAt(), sec);
    await userEvent.type(sec === 'behaviour' ? instructions() : rulesBox(), sec === 'behaviour' ? ' Mine.' : 'No deletes.');
    await saveNow();
    await replaced();
    expect(failedSave()).toBeNull();
    if (code === 'bot_changed') {
      expect(gone()).not.toBeNull();
      expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
    } else {
      expect(band()).not.toBeNull();
      expect(gone()).toBeNull();
    }
  });

  it('Guardrails refused bot_changed, the drawer replaced and drawn again on Model: a pick sends nothing', async () => {
    queued.rules.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(twoModels(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    await act(async () => setShown(false));
    await flush();
    await act(async () => setOpen('model'));
    await replaced();
    expect(gone()).not.toBeNull();
    await lockedPick(/Model B/);
    expect(sent).toHaveLength(1);
  });

  it('Behaviour refused bot_changed, drawer closed and opened again: the Bot is still gone and Save stays off', async () => {
    queued.save.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(botAt(), 'behaviour');
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    expect(gone()).not.toBeNull();
    await reopen('behaviour');
    expect(gone()).not.toBeNull();
    await userEvent.type(instructions(), ' More.');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });

  it('Behaviour refused revision_mismatch, closed and opened again: the band still shows, never a failed save', async () => {
    queued.save.push({ outcome: 'failed', code: 'revision_mismatch' });
    await host2(botAt(), 'behaviour');
    await userEvent.type(instructions(), ' Mine.');
    await saveNow();
    await reopen('behaviour');
    expect(band()).not.toBeNull();
    expect(failedSave()).toBeNull();
  });

  it('Guardrails refused revision_mismatch, closed and opened again: the band still shows, never a failed save', async () => {
    queued.rules.push({ outcome: 'failed', code: 'revision_mismatch' });
    await host2(botAt(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    await reopen('guardrails');
    expect(band()).not.toBeNull();
    expect(failedSave()).toBeNull();
  });

  it('Guardrails refused bot_changed, closed and opened again: the Bot is still gone and Save stays off', async () => {
    queued.rules.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(botAt(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    expect(gone()).not.toBeNull();
    await reopen('guardrails');
    expect(gone()).not.toBeNull();
    await userEvent.type(rulesBox(), 'No deploys.');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
  });

  it('Guardrails refused bot_changed, closed and opened on Model: the Bot is still gone and a pick sends nothing', async () => {
    queued.rules.push({ outcome: 'failed', code: 'bot_changed' });
    await host2(twoModels(), 'guardrails');
    await userEvent.type(rulesBox(), 'No deletes.');
    await saveNow();
    await reopen('model');
    expect(gone()).not.toBeNull();
    await lockedPick(/Model B/);
    expect(sent).toHaveLength(1);
  });
});

describe('the Bot\'s pane holds the refusal owner beside the saves', () => {
  // The pane itself is too heavy to render live here (as task.message.host.test.tsx): this holds the wiring Host2 above copies.
  const pane = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'parts', 'BotPane.tsx'), 'utf8');
  const drawer = pane.slice(pane.indexOf('<SettingsDrawer'), pane.indexOf('/>', pane.indexOf('<SettingsDrawer')));
  it('declares it with the two saves, before any early return, and passes it to the drawer', () => {
    const owner = pane.indexOf('const [settingsLast, setSettingsLast] = useState<SettingsLastSave | null>(null);');
    expect(owner).toBeGreaterThan(pane.indexOf('const saveRules = useSaveGuardrails(ctx);'));
    expect(owner).toBeLessThan(pane.indexOf('if (viewQ.isPending'));
    expect(drawer).toMatch(/\bsave=\{save\}/);
    expect(drawer).toMatch(/\bsaveRules=\{saveRules\}/);
    expect(drawer).toMatch(/\blastSave=\{settingsLast\}/);
    expect(drawer).toMatch(/\bonSaveStart=\{setSettingsLast\}/);
  });
});

