// The Bot drawers' two computer pickers (Re-point, Guardrails'
// allowed computers) draw each computer's colour mark before its flag and name, through kit ComputerMark: a valid
// colour draws its mark, a hostile or missing one draws none and reaches no style.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawers' URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotLink, BotView, Change, Computer, GuardrailsResult, SavedSettings, SettingsPatch } from './data';
import { RepointDrawer } from './parts/LinkDrawers';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const comp = (id: string, name: string, color?: string): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state: 'running', listState: 'ok', suspended: 0, hasMore: false, ...(color === undefined ? {} : { color }) });
const computers: Computer[] = [comp('c1', 'Atlas', '#3b82f6'), comp('c2', 'Borealis', 'red;x:url(y)'), comp('c3', 'Dune')];

const bot = {
  key: 'c1~global~chief', id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
  provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
  pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: ['c1'], allowedAgents: null, guardrails: [], guardrailCheck: 'off',
  guardrailRevision: 1, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
  speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
} as BotView;

const stubChange = <R, V>() =>
  ({
    run: async () => ({ outcome: 'done' as const }),
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
afterEach(cleanup);

// A PickerPanel row is the radio/checkbox element itself; its lead (the mark) is inside it.
const markOf = (row: HTMLElement) => row.querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;
const noUrlInStyles = () => { for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style')).not.toContain('url('); };

describe('Bot drawers: the computer colour in their pickers', () => {
  it('Re-point: Atlas draws its mark, Borealis (hostile) and Dune (none) draw none', async () => {
    await show(<RepointDrawer open onClose={() => undefined} bot={bot} computers={computers} repoint={stubChange<BotLink, { computerId: string }>()} />);
    const list = within(await screen.findByRole('radiogroup', { name: strings['picker.computer.label'] }));
    expect(markOf(await list.findByRole('radio', { name: /Atlas/ }))).toBe('#3B82F6');
    expect(markOf(list.getByRole('radio', { name: /Borealis/ }))).toBeNull();
    expect(markOf(list.getByRole('radio', { name: /Dune/ }))).toBeNull();
    noUrlInStyles();
  });

  it('Guardrails: the allowed computers list draws the same marks', async () => {
    await show(<SettingsDrawer section="guardrails" onSection={() => undefined} onClose={() => undefined} bot={bot} models={[]} computers={computers} save={stubChange<SavedSettings, { patch: SettingsPatch }>()} saveRules={stubChange<GuardrailsResult, unknown>()} />);
    const panel = within(await screen.findByRole('group', { name: strings['guard.computersLabel'] }));
    expect(markOf(await panel.findByRole('checkbox', { name: /Atlas/ }))).toBe('#3B82F6');
    expect(markOf(panel.getByRole('checkbox', { name: /Borealis/ }))).toBeNull();
    expect(markOf(panel.getByRole('checkbox', { name: /Dune/ }))).toBeNull();
    noUrlInStyles();
  });
});
