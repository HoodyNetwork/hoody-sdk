// Vitest on a live page: Settings > Voice. A Bot with no voice setting of its own uses the agent's default voices and "Check it works" says whether
// they work (one read per press, nothing billed). Choosing the models and voice makes the setting the Bot's own; the save sends the whole `speech`
// (a PATCH replaces it), keeping what the form does not edit; turning it off sends null.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, SavedSettings, SettingsPatch, SpeechConfig } from './data';
import { registerTargets } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const own: SpeechConfig = {
  raw: { stt_model: 'openai/gpt-4o-transcribe', tts_model: 'openai/gpt-4o-mini-tts', voice: 'nova', language: 'en', speed: 1.1, speak_wakes: false, speak_gates: true, stt_prompt: 'Hoody', limits: { tts_chars: 5000 } },
  sttModel: 'openai/gpt-4o-transcribe',
  ttsModel: 'openai/gpt-4o-mini-tts',
  voice: 'nova',
  language: 'en',
  speed: 1.1,
  speakWakes: false,
  speakGates: true,
};
const botWith = (config: SpeechConfig | null, extra: Partial<BotView> = {}): BotView =>
  ({
    key: KEY, id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
    provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
    pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
    guardrailRevision: 1, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
    speech: { enabled: config !== null, ready: null, why: null, config }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
    ...extra,
  }) as BotView;

type Sent = { patch: SettingsPatch; uid?: string; revision?: number };
let sent: Sent[] = [];
let outcome: { outcome: 'done' | 'failed'; code?: string; details?: Record<string, unknown> } = { outcome: 'done' };
// The state the save change shows when the form mounts: a refusal the page already got.
let shownFailed = false;
function saveChange(): Change<SavedSettings, Sent> {
  return {
    run: async (v: Sent) => {
      sent.push(v);
      return { outcome: outcome.outcome, ...(outcome.code ? { code: outcome.code } : {}) };
    },
    outcome: shownFailed ? 'failed' : 'idle', data: undefined, code: outcome.code, details: outcome.details, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<SavedSettings, Sent>;
}
const rules = { run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;

const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await settle(); });
};
async function show(bot: BotView): Promise<void> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <SettingsDrawer section="voice" onSection={() => undefined} onClose={() => undefined} bot={bot} models={[]} computers={[]} save={saveChange()} saveRules={rules as never} /> }),
    history: createMemoryHistory({ initialEntries: ['/bots'] }),
  });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}
// The same drawer with a Bot that changes under it (a save that went through, another writer's change).
let setBot: (b: BotView) => void = () => undefined;
function LiveDrawer({ first }: { first: BotView }) {
  const [bot, set] = useState<BotView>(first);
  setBot = set;
  return <SettingsDrawer section="voice" onSection={() => undefined} onClose={() => undefined} bot={bot} models={[]} computers={[]} save={saveChange()} saveRules={rules as never} />;
}
async function showLive(bot: BotView): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <LiveDrawer first={bot} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  await flush();
}
const gets = (re: RegExp) => calls.filter((c) => c.method === 'GET' && re.test(new URL(c.url).pathname));
const checks = () => gets(/\/bots\/chief\/voice\/check$/);
const ready = { ready: true, speak: true, stt: { ok: true, model: 'hoody-ai/hoody-stt' }, tts: { ok: true, model: 'hoody-ai/hoody-tts', voice: 'alloy' }, max_utterance_secs: 60 };
const broken = { ready: false, speak: true, stt: { ok: true, model: 'hoody-ai/hoody-stt' }, tts: { ok: false, model: 'acme/speech-turbo', code: 'speech_unavailable', reason: 'no_credentials', message: 'No credentials for the speaking model.', retryable: false }, max_utterance_secs: 60 };
let checkAnswer: () => { status: number; body: unknown } = () => ({ status: 200, body: ready });
const MODELS = [
  { id: 'hoody-ai/hoody-stt', capabilities: ['stt'], languages: [], available: true },
  { id: 'openai/gpt-4o-transcribe', capabilities: ['stt'], languages: ['en'], available: true },
  { id: 'hoody-ai/hoody-tts', capabilities: ['tts'], languages: [], available: true },
  { id: 'openai/gpt-4o-mini-tts', capabilities: ['tts'], languages: ['en'], available: true },
  { id: 'acme/speech-turbo', capabilities: ['tts'], languages: ['en'], available: false, unavailable_reason: 'no_credentials' },
];
let voicesAnswer: unknown[] = [{ id: 'alloy', languages: ['en'] }, { id: 'nova', languages: ['en'] }];

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  sent = [];
  outcome = { outcome: 'done' };
  shownFailed = false;
  checkAnswer = () => ({ status: 200, body: ready });
  voicesAnswer = [{ id: 'alloy', languages: ['en'] }, { id: 'nova', languages: ['en'] }];
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
  onFetch((c) => {
    const path = new URL(c.url).pathname;
    if (c.method === 'GET' && /\/bots\/chief\/voice\/check$/.test(path)) return checkAnswer();
    if (c.method === 'GET' && /\/audio\/models$/.test(path)) {
      const cap = new URL(c.url).searchParams.get('capability');
      return { status: 200, body: { items: MODELS.filter((m) => !cap || m.capabilities.includes(cap)) } };
    }
    if (c.method === 'GET' && /\/audio\/voices$/.test(path)) return { status: 200, body: { items: voicesAnswer } };
    return { status: 200, body: { data: {} } };
  });
});
afterEach(() => cleanup());

// The picker button of a field (the page has other buttons with the same word, such as the section of the rail).
const selectButton = (label: string): HTMLElement => {
  const b = screen.getAllByRole('button', { name: new RegExp(label) }).find((x) => x.getAttribute('aria-haspopup') === 'listbox');
  if (!b) throw new Error(`no picker named ${label}`);
  return b;
};
const pick = async (label: string, option: string | RegExp) => {
  await userEvent.click(selectButton(label));
  await userEvent.click(await screen.findByRole('option', { name: option }));
  await flush();
};
const save = () => screen.getByRole('button', { name: /^Save/ });
/** The check's verdict plate: its sentence and the stages it found. */
const verdict = () => screen.getByRole('group', { name: strings['voice.checkLabel'] });
/** The whole "not ready" sentence, read across its marked phrase. */
const NOT_READY = `${strings['voice.notReady.start']} ${strings['voice.notReady.mark']}${strings['voice.notReady.end']}`;
const notReady = () => screen.queryByText((_, el) => el?.tagName === 'P' && el.textContent === NOT_READY);

describe('Check it works', () => {
  it('the verdict and the row under it do not share one name', async () => {
    await show(botWith(null));
    expect(screen.getAllByText(strings['voice.checkLabel'])).toHaveLength(1);
    expect(screen.getByText(strings['voice.runLabel'])).toBeInTheDocument();
  });

  it('reads once per press, nothing before, and shows each stage', async () => {
    await show(botWith(null));
    expect(checks()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(checks()).toHaveLength(1);
    expect(await screen.findByText(strings['voice.ready'])).toBeInTheDocument();
    expect(within(verdict()).getByText(strings['voice.stageListen'])).toBeInTheDocument();
    expect(within(verdict()).getByText(strings['voice.stageSpeak'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(checks()).toHaveLength(2);
  });

  it('a stage that does not work says why, in the agent\'s reason', async () => {
    checkAnswer = () => ({ status: 200, body: broken });
    await show(botWith(null));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    await waitFor(() => expect(notReady()).toBeInTheDocument());
    expect(within(verdict()).getByText(strings['voice.notReady.mark'])).toHaveAttribute('data-verdict-mark', 'danger');
    expect(screen.getByText(strings['voice.why.no_credentials'])).toBeInTheDocument();
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
  });

  it('a check that could not be read says so, never "not working" or "ready"', async () => {
    checkAnswer = () => ({ status: 502, body: {} });
    await show(botWith(null));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await waitFor(() => expect(screen.getByText(strings['voice.checkFailed'])).toBeInTheDocument());
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
    expect(notReady()).toBeNull();
  });

  it('is not offered while the form differs from what the Bot holds (the check reads the Bot)', async () => {
    await show(botWith(null));
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    await flush();
    expect(screen.getByRole('button', { name: strings['voice.check'] })).toBeDisabled();
    expect(screen.getByText(strings['voice.saveFirst'])).toBeInTheDocument();
  });
});

describe('what a check can be trusted for', () => {
  it('unsaved edits disable it and say to save first: it would test what the Bot holds, not the form', async () => {
    await show(botWith(own));
    expect(screen.getByRole('button', { name: strings['voice.check'] })).toBeEnabled();
    await pick(strings['voice.voice'], 'alloy');
    expect(screen.getByRole('button', { name: strings['voice.check'] })).toBeDisabled();
    expect(screen.getByText(strings['voice.saveFirst'])).toBeInTheDocument();
    expect(checks()).toHaveLength(0);
  });

  it('an edit that is put back is no edit', async () => {
    await show(botWith(own));
    await pick(strings['voice.voice'], 'alloy');
    await pick(strings['voice.voice'], 'nova');
    expect(screen.getByRole('button', { name: strings['voice.check'] })).toBeEnabled();
  });

  it('a result goes when the settings the Bot holds change, so "ready" never stands for settings that were not checked', async () => {
    await showLive(botWith(own));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(await screen.findByText(strings['voice.ready'])).toBeInTheDocument();
    // The person edits the voice and saves: the Bot then holds it. (While the edit is unsaved the result waits.)
    await pick(strings['voice.voice'], 'alloy');
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
    await act(async () => setBot(botWith({ ...own, voice: 'alloy', raw: { ...own.raw, voice: 'alloy' } })));
    await flush();
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
    expect(within(verdict()).queryByText(strings['voice.stageListen'])).toBeNull();
    // and a new press checks the new settings once
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(checks()).toHaveLength(2);
    expect(await screen.findByText(strings['voice.ready'])).toBeInTheDocument();
  });

  it('a press is spent when the settings change: back to the first settings, nothing is read until the next press', async () => {
    await showLive(botWith(own));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(checks()).toHaveLength(1);
    await act(async () => setBot(botWith({ ...own, voice: 'alloy', raw: { ...own.raw, voice: 'alloy' } })));
    await flush();
    await act(async () => setBot(botWith(own)));
    await flush();
    expect(checks()).toHaveLength(1);
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
  });

  it('a result stays while the settings do not change', async () => {
    await showLive(botWith(own));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    await act(async () => setBot(botWith(own, { name: 'Chief 2' })));
    await flush();
    expect(screen.getByText(strings['voice.ready'])).toBeInTheDocument();
  });

  it('a stage the agent could not ask about reads "we couldn\'t tell", with Try again, never "not working"', async () => {
    checkAnswer = () => ({ status: 200, body: { ready: false, speak: true, stt: { ok: true, model: 'hoody-ai/hoody-stt' }, tts: { ok: false, model: 'hoody-ai/hoody-tts', code: 'service_unavailable', reason: 'check_timeout', message: 'The speech settings could not be checked in time. Try again in a moment.', retryable: true }, max_utterance_secs: 60 } });
    await show(botWith(null));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(await screen.findByText(strings['voice.unknown'])).toBeInTheDocument();
    expect(screen.getByText(strings['voice.stageUnknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['voice.stageNo'])).toBeNull();
    expect(notReady()).toBeNull();
    expect(screen.queryByText(strings['voice.ready'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['voice.checkAgain'] }));
    await flush();
    expect(checks()).toHaveLength(2);
  });

  it('a failed stage is shown in plain words, not the agent\'s settings and routes', async () => {
    checkAnswer = () => ({ status: 200, body: { ready: false, speak: true, stt: { ok: false, model: '', code: 'speech_unavailable', reason: 'not_configured', message: 'Set the Bot\'s speech.stt_model or the agent setting audio.stt_model; GET /api/v1/agent/audio/models', retryable: false }, tts: null, max_utterance_secs: 60 } });
    await show(botWith(null));
    await userEvent.click(screen.getByRole('button', { name: strings['voice.check'] }));
    await flush();
    expect(await screen.findByText(strings['voice.why.not_configured'])).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/speech\.stt_model|audio\.stt_model|\/api\/v1/);
  });
});

describe('the transcription prompt', () => {
  const promptBox = () => screen.getByRole('textbox', { name: strings['voice.prompt'] });
  it('is a visible field, kept when the listening model changes, so a save never carries a prompt the person cannot see', async () => {
    await show(botWith(own));
    expect(promptBox()).toHaveValue('Hoody');
    await pick(strings['voice.listenModel'], /hoody-stt/);
    expect(promptBox()).toHaveValue('Hoody');
    await userEvent.click(save());
    await flush();
    expect((sent[0]?.patch.speech as Record<string, unknown>).stt_prompt).toBe('Hoody');
  });
  it('clearing it saves without it (the way out when a model does not take one)', async () => {
    await show(botWith(own));
    await userEvent.clear(promptBox());
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch.speech as Record<string, unknown>).not.toHaveProperty('stt_prompt');
  });
  it('is not shown without a listening model', async () => {
    await show(botWith({ ...own, sttModel: '', raw: { ...own.raw, stt_model: '', stt_prompt: '' } }));
    expect(screen.queryByRole('textbox', { name: strings['voice.prompt'] })).toBeNull();
  });
});

describe('the Bot\'s own setting', () => {
  it('reads the models of both kinds only once the person chooses their own', async () => {
    await show(botWith(null));
    expect(gets(/\/audio\/models$/)).toHaveLength(0);
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    await flush();
    const caps = gets(/\/audio\/models$/).map((c) => new URL(c.url).searchParams.get('capability')).sort();
    expect(caps).toEqual(['stt', 'tts']);
  });

  it('saves the whole setting: the choices, and what the form does not edit carried over', async () => {
    await show(botWith(own));
    await pick(strings['voice.voice'], 'alloy');
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.patch).toEqual({
      speech: {
        stt_model: 'openai/gpt-4o-transcribe',
        tts_model: 'openai/gpt-4o-mini-tts',
        voice: 'alloy',
        language: 'en',
        speed: 1.1,
        stt_prompt: 'Hoody',
        speak_wakes: false,
        speak_gates: true,
        limits: { tts_chars: 5000 },
      },
    });
    expect(sent[0]?.uid).toBe('u-chief');
  });

  it('turning it off sends null, which takes the setting away', async () => {
    await show(botWith(own));
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.patch).toEqual({ speech: null });
  });

  it('a new speaking model drops the old voice and speed, which belong to the old model', async () => {
    await show(botWith(own));
    await pick(strings['voice.speakModel'], /hoody-tts/);
    await userEvent.click(save());
    await flush();
    const sp = sent[0]?.patch.speech as Record<string, unknown>;
    expect(sp.tts_model).toBe('hoody-ai/hoody-tts');
    expect(sp).not.toHaveProperty('voice');
    expect(sp).not.toHaveProperty('speed');
  });

  it('a model the agent does not offer now stays shown as the Bot\'s, and the unavailable one cannot be picked', async () => {
    await show(botWith({ ...own, ttsModel: 'acme/old-tts', raw: { ...own.raw, tts_model: 'acme/old-tts' } }));
    await userEvent.click(selectButton(strings['voice.speakModel']));
    expect(await screen.findByRole('option', { name: /old-tts/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /speech-turbo/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('a bad language blocks the save and says why; a good one saves lower-cased', async () => {
    await show(botWith(own));
    const lang = screen.getByRole('textbox', { name: strings['voice.language'] });
    await userEvent.clear(lang);
    await userEvent.type(lang, 'english please');
    expect(screen.getByText(strings['voice.languageBad'])).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.clear(lang);
    await userEvent.type(lang, 'PT-BR');
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    await flush();
    expect((sent[0]?.patch.speech as Record<string, unknown>).language).toBe('pt-br');
  });

  it('a model without voices lets the person type one', async () => {
    voicesAnswer = [];
    await show(botWith(own));
    expect(await screen.findByRole('textbox', { name: strings['voice.voice'] })).toBeInTheDocument();
  });

  it('nothing is sent when nothing changed', async () => {
    await show(botWith(own));
    expect(save()).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  it('a Bot whose agent is too old to check identity cannot be changed from here', async () => {
    await show(botWith(own, { caps: { botExpect: false, botGateHttp: false, botTurnCancel: false } }));
    expect(screen.getByText(strings['voice.needsUpdate'])).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: strings['voice.custom'] })).toBeDisabled();
  });
});

describe('turning the Bot\'s own voice settings off', () => {
  const lossBand = () => screen.queryByText(/Saving with this off also removes/);
  const silent: SpeechConfig = { ...own, raw: { ...own.raw, limits: { tts_chars: 0, stt_seconds: 0 } } };
  it('while on, no warning; turned off, it names what goes with the setting, and turned on again it goes', async () => {
    await show(botWith(own));
    expect(lossBand()).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    expect(screen.getByText(strings['voice.offLoses.both'], { exact: false })).toBeTruthy();
    expect(screen.queryByText(strings['voice.offLoses.speech'], { exact: false })).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    expect(lossBand()).toBeNull();
  });
  it('a Bot made silent through its limits: turning off says their 0 limits go and the defaults apply', async () => {
    await show(botWith(silent));
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    expect(screen.getByText(strings['voice.offLoses.speech'], { exact: false })).toBeTruthy();
    expect(screen.getByText(strings['voice.offLoses.listen'], { exact: false })).toBeTruthy();
    // still the person's choice: the save sends null as before
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch).toEqual({ speech: null });
  });
  it('only a prompt held: names the prompt alone; a Bot with no setting of its own shows nothing', async () => {
    await show(botWith({ ...own, raw: { ...own.raw, limits: undefined } }));
    await userEvent.click(screen.getByRole('switch', { name: strings['voice.custom'] }));
    expect(screen.getByText(strings['voice.offLoses.prompt'], { exact: false })).toBeTruthy();
    cleanup();
    await show(botWith(null));
    expect(lossBand()).toBeNull();
  });
});

describe('a refused save', () => {
  it('own daily limits the realm no longer allows: says so, and that they cannot be changed here', async () => {
    outcome = { outcome: 'failed', code: 'bad_request', details: { field: 'speech.limits.tts_chars' } };
    shownFailed = true;
    await show(botWith(own));
    expect(screen.getAllByText(strings['voice.refused.limits']).length).toBeGreaterThan(0);
  });

  it('names the setting the agent did not take, from its code and details', async () => {
    outcome = { outcome: 'failed', code: 'model_unavailable', details: { field: 'speech.tts_model', reason: 'not_tts' } };
    shownFailed = true;
    await show(botWith(own));
    expect(screen.getAllByText(strings['voice.refused.tts_model.not_tts']).length).toBeGreaterThan(0);
  });

  it('an unknown refusal still says nothing was changed', async () => {
    outcome = { outcome: 'failed', code: 'internal_error', details: undefined };
    shownFailed = true;
    await show(botWith(own));
    expect(screen.getAllByText(strings['voice.refused.generic']).length).toBeGreaterThan(0);
  });
});

describe('the typed voice and an unavailable model', () => {
  it('a typed voice keeps the spaces inside it and is saved trimmed', async () => {
    voicesAnswer = [];
    await show(botWith(own));
    const field = await screen.findByRole('textbox', { name: strings['voice.voice'] });
    await userEvent.clear(field);
    await userEvent.type(field, ' warm voice ');
    expect(field).toHaveValue(' warm voice ');
    await userEvent.click(save());
    await flush();
    expect((sent[0]?.patch.speech as Record<string, unknown>).voice).toBe('warm voice');
  });

  it('a model unavailable for no stated reason reads "Not available", with no colon after it', async () => {
    MODELS.push({ id: 'acme/quiet-tts', capabilities: ['tts'], languages: ['en'], available: false });
    try {
      await show(botWith(own));
      await userEvent.click(selectButton(strings['voice.speakModel']));
      const opt = await screen.findByRole('option', { name: /quiet-tts/ });
      expect(opt).toHaveAttribute('aria-disabled', 'true');
      expect(opt.textContent ?? '').not.toMatch(/Not available:/);
      expect(opt.textContent ?? '').toMatch(/Not available/);
    } finally {
      MODELS.pop();
    }
  });

  it('a model unavailable for a stated reason shows that reason alone: no "Not available:" before a sentence that says it already', async () => {
    await show(botWith(own));
    await userEvent.click(selectButton(strings['voice.speakModel']));
    const opt = await screen.findByRole('option', { name: /speech-turbo/ });
    expect(opt).toHaveAttribute('aria-disabled', 'true');
    expect(opt.textContent ?? '').toContain(strings['voice.why.no_credentials']);
    expect(opt.textContent ?? '').not.toMatch(/Not available/);
  });

  it('a model unavailable for a reason the page does not know keeps "Not available:" before the agent\'s bare words', async () => {
    MODELS.push({ id: 'acme/odd-tts', capabilities: ['tts'], languages: ['en'], available: false, unavailable_reason: 'weird_thing' });
    try {
      await show(botWith(own));
      await userEvent.click(selectButton(strings['voice.speakModel']));
      const opt = await screen.findByRole('option', { name: /odd-tts/ });
      expect(opt).toHaveAttribute('aria-disabled', 'true');
      expect(opt.textContent ?? '').toContain('Not available: weird thing');
    } finally {
      MODELS.pop();
    }
  });
});
