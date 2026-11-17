// The "Settle it first" lines link to the AI FAQ's settle answer, through the kit dialog's own faq slot. A
// routed parent (Conversation, ChatList) gives each dialog the item and its label; the dialog shows the link only with its busy line or its
// own unknown outcome. Router-less part tests pass no `faq`, so they draw no link and need no router. Here every mount has a router, as
// the page does.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { boot } from '@core/test/env';
import { can, ConfirmDialog, provideActiveConversations, useStrings, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ConversationSource, type ShellData } from '@kit';
import kitStrings from '@kit/strings.en.json';
import fm from '@kit/agent/ForkMenu.strings.en.json';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the dialogs' FAQ link, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness for the dialogs' FAQ link, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageFaq } from '../faq';
import aiStrings from '../strings.en.json';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab at /ai without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { attemptKey, closeAttempts, createCloseAttempts, type CloseAttempt } from './closeAttempts';
import { CloseDialog } from './CloseDialog';
import menu from './ConvMenu.strings.en.json';
import cl from './Pane.strings.en.json';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import { createDeleteAttempts, deleteAttempts, type DeleteAttempt } from './deleteAttempts';
import { DeleteDialog } from './DeleteDialog';
import { chatRules } from './fixtures.chats';
import { createRenameAttempts, renameAttempts, type RenameAttempt } from './renameAttempts';
import { RenameDialog } from './RenameDialog';
import { createTrimAttempts, trimAttempts, type TrimAttempt } from './trimAttempts';
import { TrimDialog } from './TrimDialog';
import ti from './TrimItems.strings.en.json';
import { resetChatScopeForTests } from './allChats';

const LINK = aiStrings['settle.link'];
const ANSWER = aiStrings['faq.settle.a'];
const PEEK = kitStrings['faq.peek'];

/** What a routed parent passes: the page's own settle item and the link label, both from the AI tab's strings. */
function useSettle() {
  const tp = useStrings(aiStrings);
  return { faqItem: pageFaq(tp).byId.settle, faqLabel: tp('settle.link') };
}

async function routed(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/ai'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const dlg = () => screen.findByRole('alertdialog');
/** Where the kit's own `faq` prop draws its link (kit overlays/Dialog.tsx, the faq slot): in the dialog's scroll box, after the body
 *  (when there is one) and outside it, before any field, the outcome and every button below the header. */
function placedLikeTheKitFaq(d: HTMLElement, link: HTMLElement) {
  const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) === Node.DOCUMENT_POSITION_FOLLOWING;
  const scroll = d.querySelector('[data-dialog-scroll]');
  expect(scroll?.contains(link), 'the link is in the dialog\'s scroll box').toBe(true);
  expect(link.closest('[data-dialog-faq]'), 'the link is in the kit dialog\'s own faq slot').not.toBeNull();
  const body = document.getElementById(d.getAttribute('aria-describedby') ?? '');
  if (body) expect(follows(body, link), 'the link comes after the body, outside it').toBe(true);
  const later = [...d.querySelectorAll('input, textarea, [data-dialog-outcome]'), ...within(d).getAllByRole('button').filter((x) => scroll!.contains(x) || follows(scroll!, x))];
  expect(later.length, 'a dialog has buttons below its header').toBeGreaterThan(0);
  for (const el of later) expect(follows(link, el), `the link comes before ${el.tagName.toLowerCase()} ${el.textContent ?? ''}`).toBe(true);
}

/** The link is there, where the kit's faq prop puts it, and pressing it inside the dialog opens the peek with the settle answer
 *  (the dialog stays open). Returns the peek's text, for the comparison with the kit's own faq prop. */
async function linksTheAnswer(d: HTMLElement): Promise<string> {
  const link = within(d).getByRole('link', { name: LINK });
  placedLikeTheKitFaq(d, link);
  await act(async () => { fireEvent.click(link); });
  const peek = await screen.findByRole('dialog', { name: PEEK });
  expect(within(peek).getByText(ANSWER)).toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  return peek.textContent ?? '';
}

const ID = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
const CHAT = { key: attemptKey(ID), ...ID };
const ACTIVE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' }, completedTurns: 4,
};
const SNAP: ConvSnapshot = { facts: ACTIVE, title: 'Fix', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } };
const source: ConversationSource = { kind: 'session', ref: { computer: ID.computer, realm: ID.realm, sid: ID.sid }, snapshot: () => SNAP, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, SNAP.facts) };
const calls = { rename: vi.fn(), read: vi.fn(), close: vi.fn(), delete: vi.fn(), trim: vi.fn(), turns: vi.fn(), loops: vi.fn(() => new Promise(() => {})) } as unknown as agent.SessionApi;
/** Another store holding an unsettled record for this chat: the dialog shows its busy line. */
const holding = { get: (k: string) => (k === CHAT.key ? {} : undefined), subscribe: () => () => {}, version: () => 0 };
const none = { get: () => undefined, subscribe: () => () => {}, version: () => 0 };

type Kind = 'rename' | 'close' | 'delete' | 'trim';
function Dialog({ kind, blocked, own }: { kind: Kind; blocked: boolean; own?: 'unknown' }) {
  const settle = useSettle();
  const blockers = [blocked ? holding : none];
  const common = { isOpen: true, onClose: () => {}, chat: CHAT, calls, unavailable: '', blockers, ...settle, returnFocus: () => null };
  // One set of records per mount (a dialog reads its own record when it opens).
  const [at] = useState(() => {
    const rn = createRenameAttempts(), tr = createTrimAttempts();
    if (own && kind === 'rename') rn.set({ key: CHAT.key, chat: ID, sid: ID.sid, realm: ID.realm, calls, name: 'Cart', phase: 'unknown' } as RenameAttempt);
    if (own && kind === 'trim') tr.set({ key: CHAT.key, chat: ID, turn: 1, calls, phase: 'unknown' } as TrimAttempt);
    const cl = createCloseAttempts(), dl = createDeleteAttempts();
    if (own && kind === 'close') cl.set({ key: CHAT.key, chat: ID, sid: ID.sid, realm: ID.realm, calls, phase: 'unknown' } as CloseAttempt);
    if (own && kind === 'delete') dl.set({ key: CHAT.key, chat: ID, sid: ID.sid, realm: ID.realm, calls, phase: 'unknown' } as DeleteAttempt);
    return { rn, cl, dl, tr };
  });
  if (kind === 'rename') return <RenameDialog {...common} allowed={() => true} current="Fix" attempts={at.rn} />;
  if (kind === 'close') return <CloseDialog {...common} allowed={() => true} attempts={at.cl} />;
  if (kind === 'delete') return <DeleteDialog {...common} allowed={() => true} attempts={at.dl} />;
  return <TrimDialog {...common} turn={1} source={source} attempts={at.tr} />;
}

describe('each dialog links the settle answer while its change waits', () => {
  beforeEach(() => { boot(); });
  afterEach(() => cleanup());

  for (const kind of ['rename', 'close', 'delete', 'trim'] as const) {
    it(`${kind}: with another change of the chat waiting, "${LINK}" shows and opens the settle answer`, async () => {
      await routed(() => <Dialog kind={kind} blocked />);
      await linksTheAnswer(await dlg());
    });
  }

  it('with nothing waiting there is no link: it follows the busy line, not the dialog', async () => {
    for (const kind of ['rename', 'close', 'delete', 'trim'] as const) {
      await routed(() => <Dialog kind={kind} blocked={false} />);
      const d = await dlg();
      await flush();
      expect(within(d).queryByRole('link', { name: LINK })).toBeNull();
      cleanup();
    }
  });

  for (const kind of ['rename', 'close', 'delete', 'trim'] as const) {
    it(`${kind}: its own lost answer (Check again) shows the link too`, async () => {
      await routed(() => <Dialog kind={kind} blocked={false} own="unknown" />);
      const d = await dlg();
      expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
      await linksTheAnswer(d);
    });
  }

  it('the link opens the same peek, from the same place, as the kit\'s own faq prop on a ConfirmDialog', async () => {
    function KitFaq() {
      const settle = useSettle();
      return <ConfirmDialog isOpen onOpenChange={() => {}} title="Close this chat?" body="Body" onConfirm={() => {}} faq={{ item: settle.faqItem, label: settle.faqLabel }} />;
    }
    await routed(() => <KitFaq />);
    const kit = await linksTheAnswer(await dlg());
    const kitHref = within(await dlg()).getByRole('link', { name: LINK }).getAttribute('href');
    cleanup();
    for (const kind of ['rename', 'close', 'delete', 'trim'] as const) {
      await routed(() => <Dialog kind={kind} blocked />);
      const d = await dlg();
      const href = within(d).getByRole('link', { name: LINK }).getAttribute('href');
      expect(await linksTheAnswer(d), `${kind}: the same peek`).toBe(kit);
      expect(href, `${kind}: the same link`).toBe(kitHref);
      cleanup();
    }
  });
  it('Escape closes only the peek: focus is back on the link and the dialog is still open, as with the kit\'s faq prop', async () => {
    for (const kind of ['rename', 'close', 'delete', 'trim'] as const) {
      const user = userEvent.setup();
      await routed(() => <Dialog kind={kind} blocked />);
      const link = within(await dlg()).getByRole('link', { name: LINK });
      await user.click(link);
      await screen.findByRole('dialog', { name: PEEK });
      await user.keyboard('{Escape}');
      await flush();
      expect(screen.queryByRole('dialog', { name: PEEK }), `${kind}: the peek closed`).toBeNull();
      expect(screen.getByRole('alertdialog'), `${kind}: the dialog is still open`).toBeInTheDocument();
      expect(document.activeElement, `${kind}: focus is back on the link`).toBe(link);
      cleanup();
    }
  });
});

// The routed parents pass it: the open chat (its ⋯ menu and a reply's menu) and the chat list's row menu, on the AI tab itself.
const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const KEY = attemptKey({ computer: HANDLE, realm: PERSONAL, sid: SID, target: atlas.id });
const HELD = { key: KEY, chat: { computer: HANDLE, realm: PERSONAL, sid: SID, target: atlas.id }, sid: SID, realm: PERSONAL, calls, phase: 'unknown' as const };
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };
const OPEN: ConvSnapshot = {
  facts: { ...ACTIVE, completedTurns: 2 }, title: 'Fix the cart total', gates: [],
  blocks: [
    { k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 },
    { k: 'reply', key: 'r1', text: 'Found it: the total rounds down in cart.ts.', streaming: false, final: true, cost: null, at: 2000, turn: 0 },
    { k: 'user', key: 'u2', text: 'Now add a test.', at: 3000 },
    { k: 'reply', key: 'r2', text: 'Added cart.test.ts.', streaming: false, final: true, cost: null, at: 4000, turn: 1 },
  ],
  meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
};
const DONE = { k: 'done' as const };
const provider: ActiveConversationProvider = {
  open(_account, ref) {
    const s: ActiveSource = {
      kind: 'session', ref, snapshot: () => OPEN, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, OPEN.facts),
      send: async () => DONE, stop: async () => DONE, decide: async () => DONE, answer: async () => DONE, check: async () => DONE,
      dismissDecision: () => {}, canDismiss: () => false,
    };
    return { source: s, release: () => {} };
  },
};

async function openTab(path: string) {
  bootFixtureCore({ rules: [...chatRules({}), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main>
      </ShellDataProvider>,
    );
    await router.load();
  });
}
const chatPath = `/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`;

describe('the AI tab passes the settle answer to every mount', () => {
  let width = 1300;
  beforeEach(() => {
    width = 1300;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
    provideActiveConversations(provider);
  });
  afterEach(() => {
    cleanup();
    for (const s of [closeAttempts, renameAttempts, trimAttempts, deleteAttempts] as const) { const a = s.get(KEY); if (a) s.end(a as never, 'failed'); }
    resetAttemptsForTests();
    resetChatScopeForTests();
    provideActiveConversations(null);
    queryClient.clear();
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });

  // Every dialog the open chat's ⋯ menu mounts, each with another change of the chat waiting.
  for (const [kind, held] of [['rename', 'close'], ['close', 'rename'], ['delete', 'rename']] as const) {
    it(`the open chat's ⋯ ${kind}, with its ${held} still waiting, links the settle answer`, async () => {
      if (held === 'close') closeAttempts.set(HELD as unknown as CloseAttempt);
      else renameAttempts.set({ ...HELD, name: 'Cart' } as unknown as RenameAttempt);
      await openTab(chatPath);
      await screen.findByText('Round the cart total half up, please.');
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: menu['menu.label'] })); });
      await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(menu[`menu.${kind}`]) })); });
      const d = await dlg();
      expect(within(d).getByText(menu[`${kind}.busy`], { exact: false })).toBeInTheDocument();
      await linksTheAnswer(d);
    });
  }

  it('a reply\'s Remove what follows, with a rename of the chat still waiting, links the settle answer', async () => {
    renameAttempts.set({ ...HELD, name: 'Cart' } as unknown as RenameAttempt);
    await openTab(chatPath);
    await screen.findByText('Added cart.test.ts.');
    await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: fm['tm.more'] }))[0]!); });
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) })); });
    await linksTheAnswer(await dlg());
  });

  // Both chat list variants (This computer: HereList; All computers: AllList), each
  // row dialog (Rename, Close, Delete), each with a trim of the chat still waiting.
  for (const scope of ['here', 'all'] as const) {
    for (const kind of ['rename', 'close', 'delete'] as const) {
      it(`the chat list (${scope}) row ${kind}, with a trim of the chat still waiting, links the settle answer`, async () => {
        trimAttempts.set({ key: KEY, chat: HELD.chat, turn: 0, calls, phase: 'unknown' } as TrimAttempt);
        await openTab('/ai');
        const rowId = scope === 'all' ? `${atlas.id}|${PERSONAL}/${SID}` : `${PERSONAL}/${SID}`;
        if (scope === 'all') {
          await waitFor(() => { if (!document.querySelector(`tr[data-row-id="${PERSONAL}/${SID}"]`)) throw new Error('no row'); });
          await act(async () => { fireEvent.click(screen.getByRole('radio', { name: cl['scope.all'] })); });
        }
        const row = await waitFor(() => { const r = document.querySelector(`tr[data-row-id="${rowId}"]`); if (!r) throw new Error('no row'); return r as HTMLElement; });
        await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Row actions' })); });
        await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(menu[`menu.${kind}`]) })); });
        const d = await dlg();
        expect(within(d).getByText(menu[`${kind}.busy`], { exact: false })).toBeInTheDocument();
        await linksTheAnswer(d);
      });
    }
  }
});
