// The AI tab hands the source's row actions to the kit view. `withHost` forwards Send again / Retry / Edit (a wrapper that
// listed methods one by one would drop them and the buttons would never show), and Edit puts the message's text in the chat's composer:
// the draft when it is empty, appended after a blank line when the person has typed something (nothing typed is lost).
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type DraftFile, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const REQ = { key: 'hx-' + 'd'.repeat(32), kind: 'turn' as const };
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000, note: { text: 'Not sent', bad: true }, req: REQ, actions: ['resend', 'takeBack'] }],
};

/** A host that keeps files for the next message (the engine's draft): the list the source reports, and the drop it is asked for. */
function draftHost(initial: DraftFile[]) {
  let list: readonly DraftFile[] = initial;
  const subs = new Set<() => void>();
  return {
    draftFiles: () => list,
    dropDraftFile: vi.fn((id: string) => { list = list.filter((x) => x.id !== id); subs.forEach((f) => f()); }),
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
const FILE: DraftFile = { id: 'a1', kind: 'text', name: 'log.txt', url: null, bytes: 40, lines: 3 };
const WITH_FILES: ConvSnapshot = { ...SNAP, blocks: [{ ...SNAP.blocks[0]!, files: [{ id: 'f1', kind: 'text', name: 'log.txt' }] } as ConvSnapshot['blocks'][number]] };

function provider(o: { host?: ReturnType<typeof draftHost>; snap?: ConvSnapshot } = {}) {
  const resend = vi.fn(async () => ({ k: 'done' as const }));
  const takeBack = vi.fn(() => ({ k: 'text' as const, text: 'Round the cart total half up, please.', files: 0 }));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => o.snap ?? SNAP, subscribe: o.host ? o.host.subscribe : () => () => undefined, watch: () => undefined, can: (a: Parameters<ActiveSource['can']>[0]) => can(a, FACTS),
        send: vi.fn(async () => ({ k: 'done' as const })), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
        resend, takeBack,
        ...(o.host ? { draftFiles: o.host.draftFiles, dropDraftFile: o.host.dropDraftFile } : {}),
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, resend, takeBack };
}

async function open() {
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main>
      </ShellDataProvider>,
    );
    await router.load();
  });
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;

beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 }); });
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the AI tab and the row actions', () => {
  it('Send again reaches the source\'s resend with the row\'s request (withHost forwards it)', async () => {
    const h = provider();
    provideActiveConversations(h.p);
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Send again' }));
    expect(h.resend).toHaveBeenCalledWith(REQ);
  });
  it('Edit with an empty composer puts the message\'s text there', async () => {
    const h = provider();
    provideActiveConversations(h.p);
    await open();
    expect(box().value).toBe('');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(h.takeBack).toHaveBeenCalledWith(REQ);
    await waitFor(() => expect(box().value).toBe('Round the cart total half up, please.'));
  });
  it('Edit with something already typed appends the text after a blank line: nothing typed is lost', async () => {
    const h = provider();
    provideActiveConversations(h.p);
    await open();
    await screen.findByRole('button', { name: 'Edit' });
    fireEvent.change(box(), { target: { value: 'and also the tax' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(box().value).toBe('and also the tax\n\nRound the cart total half up, please.'));
  });
  it('Edit again with the same text already in the composer adds nothing', async () => {
    const h = provider();
    provideActiveConversations(h.p);
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(box().value).toBe('Round the cart total half up, please.'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(box().value).toBe('Round the cart total half up, please.');
  });
  it('a message with files shows Edit only when the source keeps a draft for its files (the flag follows the field)', async () => {
    provideActiveConversations(provider({ snap: WITH_FILES }).p);
    await open();
    await screen.findByRole('button', { name: 'Send again' });
    expect(screen.queryByRole('button', { name: 'Edit' }), 'no draft field, no Edit: its files would be lost').toBeNull();
    cleanup();
    provideActiveConversations(provider({ snap: WITH_FILES, host: draftHost([]) }).p);
    await open();
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeTruthy();
  });
  it('the files the host holds for the next message are chips in the composer, and removing one goes through the host', async () => {
    const host = draftHost([FILE]);
    provideActiveConversations(provider({ host }).p);
    await open();
    expect(await screen.findByText('log.txt'), 'a taken-back file is visible before anything is sent').toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove log.txt' }));
    expect(host.dropDraftFile).toHaveBeenCalledWith('a1');
    await waitFor(() => expect(screen.queryByText('log.txt')).toBeNull());
  });
});
