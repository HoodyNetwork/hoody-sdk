// Settings > Behaviour > the MCP hints switch (agent mcp_hints). Shown only when the Bot read carries the setting
// (an older agent does not: no switch, and Behaviour's save never sends it); a change makes the form dirty and Save sends it.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, userEvent } from '@app/testing';
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

describe('Settings: MCP hints', () => {
  const sw = () => screen.queryByRole('switch', { name: 'Tell connected apps what is waiting' });
  const save = () => screen.getByRole('button', { name: /^Save/ });
  it('an older agent (no mcp_hints in the read): no switch, and a Behaviour save sends no mcp_hints', async () => {
    await host(botAt({ name: 'Chief' }));
    expect(sw()).toBeNull();
    await userEvent.clear(screen.getByRole('textbox', { name: strings['behaviour.name'] }));
    await userEvent.type(screen.getByRole('textbox', { name: strings['behaviour.name'] }), 'Boss');
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect('mcp_hints' in (sent[0]?.patch ?? {})).toBe(false);
  });
  it('on by default: turning it off makes the form dirty and Save sends mcp_hints false', async () => {
    await host(botAt({ mcpHints: true }));
    expect(sw()).toBeChecked();
    expect(screen.getByText(strings['behaviour.mcpHintsOn'])).toBeInTheDocument();
    await userEvent.click(sw()!);
    expect(sw()).not.toBeChecked();
    expect(screen.getByText(strings['behaviour.mcpHintsOff'])).toBeInTheDocument();
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch.mcp_hints).toBe(false);
  });
  it('off: one press turns it back on, and Save sends true', async () => {
    await host(botAt({ mcpHints: false }));
    expect(sw()).not.toBeChecked();
    await userEvent.click(sw()!);
    await userEvent.click(save());
    await flush();
    expect(sent[0]?.patch.mcp_hints).toBe(true);
  });
});
