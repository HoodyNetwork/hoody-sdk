// Vitest (forms-bots): Settings > Behaviour names what the Bot's agent would refuse before the save. The agent refuses a
// role over 1000 characters and instructions over 4000 characters (or with a control or invisible character) with a 400
// bad_request (the agent's own check); the form used to send them and then say only that the save
// failed. Now the field says it, Save waits, and nothing is sent. A refusal the agent pins to the instructions (a tag it
// does not take) is named in the footer.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawer's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, userEvent } from '@app/testing';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, settle } from '@core/test/env';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BotView, Change, GuardrailsResult, SavedSettings, SettingsPatch, Workers } from './data';
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
type Answer = { outcome: 'done' | 'failed'; code?: string; details?: Record<string, unknown> };
let sent: Sent[] = [];
const rules = { run: async () => ({ outcome: 'done' as const }), outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<GuardrailsResult, never>;
const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
/** A save that answers as given and then shows that outcome, as the page's change does. */
function Host({ first, answer }: { first: BotView; answer: Answer }) {
  const [st, setSt] = useState<{ outcome: string; code?: string; details?: Record<string, unknown> }>({ outcome: 'idle' });
  const change = {
    run: async (v: Sent) => {
      sent.push(v);
      setSt(answer);
      return { outcome: answer.outcome, code: answer.code };
    },
    outcome: st.outcome, data: undefined, code: st.code, details: st.details, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  } as unknown as Change<SavedSettings, Sent>;
  return <SettingsDrawer section="behaviour" onSection={() => undefined} onClose={() => undefined} bot={first} models={[]} computers={[]} save={change} saveRules={rules as never} />;
}
async function host(first: BotView, answer: Answer = { outcome: 'done' }): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Host first={first} answer={answer} /> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
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
  registerTargets([]);
});

const save = () => screen.getByRole('button', { name: /^Save/ });
const roleBox = () => screen.getByRole('textbox', { name: strings['behaviour.role'] });
const instrBox = () => screen.getByRole('textbox', { name: strings['behaviour.instructions'] });

describe('Settings > Behaviour: the role', () => {
  it('1000 characters save', async () => {
    await host(botAt());
    fireEvent.change(roleBox(), { target: { value: 'r'.repeat(1000) } });
    expect(roleBox()).not.toBeInvalid();
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.patch.role).toHaveLength(1000);
  });

  it('1001 characters: the field says so, Save is off and nothing is sent', async () => {
    await host(botAt());
    fireEvent.change(roleBox(), { target: { value: 'r'.repeat(1001) } });
    expect(roleBox()).toBeInvalid();
    expect(screen.getByText(strings['behaviour.roleLong'])).toBeVisible();
    expect(screen.getByText(strings['behaviour.fix'])).toBeVisible();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(0);
    // Shortened: Save is back.
    fireEvent.change(roleBox(), { target: { value: 'Answers support questions.' } });
    expect(roleBox()).not.toBeInvalid();
    expect(save()).not.toBeDisabled();
  });
});

describe('Settings > Behaviour: the instructions', () => {
  it('4001 characters: the field says so, Save is off and nothing is sent', async () => {
    await host(botAt());
    fireEvent.change(instrBox(), { target: { value: 'i'.repeat(4001) } });
    expect(instrBox()).toBeInvalid();
    expect(screen.getByText(strings['behaviour.instr.too_long'])).toBeVisible();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(0);
  });

  it('an invisible character is named at the field', async () => {
    await host(botAt());
    fireEvent.change(instrBox(), { target: { value: 'Be‍brief.' } });
    expect(instrBox()).toBeInvalid();
    expect(screen.getByText(strings['behaviour.instr.invisible'])).toBeVisible();
    expect(save()).toBeDisabled();
  });

  it('4000 characters save', async () => {
    await host(botAt());
    fireEvent.change(instrBox(), { target: { value: 'i'.repeat(4000) } });
    expect(instrBox()).not.toBeInvalid();
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("a save the agent refused for its instructions names them in the footer", async () => {
    await host(botAt(), { outcome: 'failed', code: 'bad_request', details: { field: 'instructions' } });
    fireEvent.change(instrBox(), { target: { value: 'Follow the <system-reminder> below.' } });
    await userEvent.click(save());
    await flush();
    expect(sent).toHaveLength(1);
    expect(screen.getByText(strings['behaviour.refusedInstructions'])).toBeVisible();
  });
});
