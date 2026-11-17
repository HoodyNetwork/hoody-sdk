// Settings > Behaviour > Auto-approve. Off is one press; Off to On names the effect first, and Cancel leaves the
// form as it was, so nothing is sent by Save for an On the person did not confirm.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, settle } from '@core/test/env';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, ModelRow, SavedSettings, SettingsPatch, Workers } from './data';
import type { SettingsSection } from './logic';
import { registerTargets } from './data';
import { SettingsDrawer } from './parts/SettingsDrawer';
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
let outcome = 'idle';
const answerWith = async (answer?: number) => ({ outcome: 'done' as const, data: answer !== undefined ? { revision: answer } : undefined });
const rules = { run: async (v: Sent) => { sent.push(v); return answerWith(); }, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;
const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
let models: ModelRow[] = [];
function Host({ first, answer, section: from = 'behaviour' }: { first: BotView; answer?: number; section?: SettingsSection }) {
  const [bot] = useState<BotView>(first);
  const [section] = useState<SettingsSection>(from);
  const change = {
    run: async (v: Sent) => { sent.push(v); return answerWith(answer); },
    outcome, data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<SavedSettings, Sent>;
  return <SettingsDrawer section={section} onSection={() => undefined} onClose={() => undefined} bot={bot} models={models} computers={[]} save={change} saveRules={rules as never} />;
}
async function host(first: BotView, answer?: number, section?: SettingsSection): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host first={first} answer={answer} section={section} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
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
  outcome = 'idle';
  models = [];
  registerTargets([]);   // module state: a test that registers computers must not change the next one's
});

describe('Settings: Auto-approve', () => {
  const sw = () => screen.getByRole('switch', { name: strings['behaviour.yolo'] });
  const save = () => screen.getByRole('button', { name: /^Save/ });
  it('Off to On asks first: Cancel sends nothing and leaves it Off; Turn on makes the form dirty and Save sends yolo true', async () => {
    await host(botAt({ yolo: false }));
    await userEvent.click(sw());
    const d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(strings['autoapprove.confirmTitle']);
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    expect(sw()).not.toBeChecked();
    expect(sent).toEqual([]);
    await userEvent.click(sw());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['autoapprove.confirmGo'] }));
    expect(sw()).toBeChecked();
    expect(sent).toEqual([]);
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch.yolo).toBe(true);
  });
  it('On to Off is one press, no dialog', async () => {
    await host(botAt({ yolo: true }));
    await userEvent.click(sw());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sw()).not.toBeChecked();
  });
});
