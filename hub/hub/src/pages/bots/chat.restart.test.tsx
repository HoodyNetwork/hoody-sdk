// Vitest: "Restart and check": the Telegram privacy step's restart is a pause then a resume of
// the app, two writes, never sent again. Each outcome says what is known: a refused pause changed nothing; an unanswered pause
// may have gone in with no resume sent; a refused resume leaves the app known paused; an unanswered resume may or may not have
// turned it back on (C9). It shares one lock with every change that writes the app's `enabled`. A paused app, or a Bot whose
// own pause of every app is on or changing, keeps Open Settings: a restart would resume what was paused or not start the app.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, answers, bootFixtureCore, outcomeOf, reply, type FixtureRequest } from '@core';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LOCK_KEYS, ROUTES, channelChangeCall, registerTargets, type BotView, type Change, type Channel, type ChannelChange, type ChannelSettings, type ChannelVars } from './data';
import { ChatAppsTab } from './parts/ChatAppsTab';
import strings from './strings.en.json';

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const step = (k: keyof typeof strings) => new RegExp(`^${strings[k]}`);

type Seen = { method: string; body: unknown };
/** The app's PATCHes, answered in turn by `answer` (the n-th call gets answer(n)). */
function patches(answer: (n: number) => ReturnType<typeof answers.ok> | ReturnType<typeof answers.refused> | ReturnType<typeof answers.lost>): Seen[] {
  const seen: Seen[] = [];
  registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
  bootFixtureCore({ rules: [reply(ROUTES.chanPatch, (req: FixtureRequest) => { seen.push({ method: req.method, body: req.body }); return answer(seen.length); })] });
  return seen;
}
const restart = () => channelChangeCall({ botKey: KEY, channelId: 'ch-tg', action: 'restart' }, 'k-restart');

describe('the restart send', () => {
  it('is a pause then a resume of the app: two PATCHes, in that order', async () => {
    const seen = patches(() => answers.ok({ ok: true }));
    await restart();
    expect(seen.map((x) => x.body)).toEqual([{ enabled: false }, { enabled: true }]);
  });

  it('a refused pause changed nothing: it fails and the resume is never sent', async () => {
    const seen = patches(() => answers.refused(400, 'bad_request'));
    const err = await restart().then(() => null, (e: unknown) => e);
    expect(outcomeOf(err, true)).toBe('failed');
    expect(seen).toHaveLength(1);
  });

  it('a refused resume after the pause went in: the app is known paused (an answer that says so), and nothing is sent again', async () => {
    const seen = patches((n) => (n === 1 ? answers.ok({ ok: true }) : answers.refused(400, 'bad_request')));
    expect(await restart()).toEqual({ restart: 'paused' });
    expect(seen).toHaveLength(2);
  });

  it('a resume with no answer after the pause went in may have gone through, under its own code', async () => {
    const seen = patches((n) => (n === 1 ? answers.ok({ ok: true }) : answers.lost(10)));
    const err = await restart().then(() => null, (e: unknown) => e);
    expect(outcomeOf(err, true)).toBe('pending');
    expect((err as { code?: string }).code).toBe('restart_resume_unknown');
    expect(seen).toHaveLength(2);
  });

  it('a pause with no answer may have gone in, and no resume is sent', async () => {
    const seen = patches(() => answers.lost(10));
    const err = await restart().then(() => null, (e: unknown) => e);
    expect(outcomeOf(err, true)).toBe('pending');
    expect((err as { code?: string }).code).not.toBe('restart_resume_unknown');
    expect(seen).toHaveLength(1);
  });
});

describe('the restart lock', () => {
  const key = (action: string, channelId = 'ch-tg') => JSON.stringify(LOCK_KEYS.channelChange?.({ botKey: KEY, action, channelId }));
  it('is shared by every change that writes the app enabled, per app, and by nothing else', () => {
    for (const a of ['enable', 'disable', 'webhookRemove']) expect(key(a)).toBe(key('restart'));
    expect(key('restart', 'ch-sl')).not.toBe(key('restart'));
    expect(key('rename')).not.toBe(key('restart'));
    expect(key('remove')).not.toBe(key('restart'));
  });
});

const bot = { key: 'c1~global~chief', uid: 'u-chief', id: 'chief', name: 'Chief' } as unknown as BotView;
const ana = { id: 'pr-1', platformUser: '1001', name: 'Ana', rights: ['chat'], owner: true, lang: '' };
const app = (over: Partial<Channel> = {}): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 1, chats: 0, homeChat: null, reason: '',
  principals: [ana], chatRows: [], view: { settings: {}, effective: { dm_policy: { value: 'pairing', source: 'channel' } } }, notes: [{ code: 'telegram_privacy_on', field: 'group_mode' }],
  ...over,
}) as unknown as Channel;
const settingsOk = { ok: true, paused: false } as unknown as ChannelSettings;
type Answer = { outcome: string; data?: ChannelChange; code?: string };
function harness(answer: Answer = { outcome: 'done' }) {
  const calls: ChannelVars[] = [];
  const change = {
    run: async (v: ChannelVars) => { calls.push(v); return answer; },
    outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<ChannelChange, ChannelVars>;
  return { calls, change };
}
const idlePause = { run: async () => ({ outcome: 'done' }), outcome: 'idle', running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<unknown, { paused: boolean }>;
let setApp: (c: Channel) => void = () => undefined;
function Live({ first, change, settings, pause }: { first: Channel; change: Change<ChannelChange, ChannelVars>; settings: ChannelSettings; pause: Change<unknown, { paused: boolean }> }) {
  const [ch, set] = useState(first);
  setApp = set;
  return <ChatAppsTab bot={bot} channels={[ch]} settings={settings} loading={false} change={change} pause={pause} />;
}
async function show(ch: Channel, change: Change<ChannelChange, ChannelVars>, settings = settingsOk, pause = idlePause) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Live first={ch} change={change} settings={settings} pause={pause} /> }), history: createMemoryHistory({ initialEntries: ['/bots?app=ch-x'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
  return screen.findByRole('region', { name: step('setup.step.privacy') });
}

describe('Restart and check in the privacy step', () => {
  const press = async (card: HTMLElement) => userEvent.click(within(card).getByRole('button', { name: strings['setup.privacy.restartGo'] }));
  const said = async (card: HTMLElement, k: keyof typeof strings) => expect((await within(card).findByText(strings[k])).closest('[role="status"]')).not.toBeNull();

  it('a connected app offers Restart and check: one restart change, then the step says the pause and resume went in', async () => {
    const { calls, change } = harness();
    const card = await show(app(), change);
    expect(within(card).queryByRole('button', { name: strings['setup.openSettings'] })).toBeNull();
    await press(card);
    expect(calls).toEqual([expect.objectContaining({ channelId: 'ch-x', action: 'restart' })]);
    await said(card, 'setup.privacy.restarted.done');
  });

  it('a refused resume says the app stays paused until it is turned on in Settings', async () => {
    const card = await show(app(), harness({ outcome: 'done', data: { restart: 'paused' } }).change);
    await press(card);
    await said(card, 'setup.privacy.restarted.paused');
    expect(within(card).queryByText(strings['setup.privacy.restarted.done'])).toBeNull();
  });

  it('an unanswered resume says the app was paused and whether it came back is not known', async () => {
    const card = await show(app(), harness({ outcome: 'pending', code: 'restart_resume_unknown' }).change);
    await press(card);
    await said(card, 'setup.privacy.restarted.resumeUnknown');
  });

  it('an unanswered pause says it may have gone in and nothing turned the app back on', async () => {
    const card = await show(app(), harness({ outcome: 'pending' }).change);
    await press(card);
    await said(card, 'setup.privacy.restarted.pauseUnknown');
  });

  it('the status line stays in place when the app reads paused after the press, and keeps its words', async () => {
    const card = await show(app(), harness({ outcome: 'done', data: { restart: 'paused' } }).change);
    await press(card);
    const line = (await within(card).findByText(strings['setup.privacy.restarted.paused'])).closest('[role="status"]');
    act(() => setApp(app({ enabled: false, state: 'paused' })));
    expect(screen.getByText(strings['setup.privacy.restarted.paused']).closest('[role="status"]')).toBe(line);
  });

  it("the Bot's own pause of every app, on or changing, keeps Open Settings: the app would not start", async () => {
    const on = await show(app(), harness().change, { ok: true, paused: true } as unknown as ChannelSettings);
    expect(within(on).queryByRole('button', { name: strings['setup.privacy.restartGo'] })).toBeNull();
    expect(within(on).getByRole('button', { name: strings['setup.openSettings'] })).toBeInTheDocument();
  });

  it("a Bot pause still unresolved keeps Open Settings too", async () => {
    const card = await show(app(), harness().change, settingsOk, { ...idlePause, outcome: 'pending' } as unknown as Change<unknown, { paused: boolean }>);
    expect(within(card).queryByRole('button', { name: strings['setup.privacy.restartGo'] })).toBeNull();
  });

  it('a paused app keeps Open Settings: a restart would resume what the person paused', async () => {
    const { change } = harness();
    const card = await show(app({ enabled: false, state: 'paused' }), change);
    expect(within(card).queryByRole('button', { name: strings['setup.privacy.restartGo'] })).toBeNull();
    expect(within(card).getByRole('button', { name: strings['setup.openSettings'] })).toBeInTheDocument();
  });
});
