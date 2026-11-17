// A chat's changed files on the real engine and the FakeAgent, through the AI tab's routes: a chat whose first turn edited files is
// opened on a fresh engine (a reload: read from the transcript) and shows "2 files changed" with Review, which opens Details on
// Edits; a turn run on the page (live) adds its file. The edits stay in memory: no storage holds a change or a write's content,
// and the page never shows a write's content.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kit/agent/approver-live', () => ({
  approvers: () => ({
    open: () => ({ sid: null, setStrict: () => undefined, mintTicket: () => null, decide: () => null, close: () => undefined }),
    state: () => ({ phase: 'none' }), subscribe: () => () => undefined, stamp: () => 0, noteEpoch: () => undefined,
  }),
  resetApproversForTests: () => undefined,
}));
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import { provideActiveConversations, type ActiveConversationProvider, type ShellData } from '@kit';
import { WAIT_MS, engineActive, liveDeps, type ActiveDeps } from './active';
import type { Beat } from './fake';
import { world, type World } from './accept/env';
import { ShellDataProvider } from '@shell/context';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AiTab from '../pages/ai/tab';
import { chatRules } from '../pages/ai/parts/fixtures.chats';
import kc from '@kit/agent/Conversation.strings.en.json';
import det from '@kit/agent/DetailsPanel.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const SECRET = 'WRITE-BODY-NEVER-SHOWN-91c2';
const OLD = 'const total = 0';
const NEW = 'const total = sum(lines)';
const FIRST: Beat[] = [
  { k: 'tool', name: 'edit_file', summary: '/home/ada/shop/cart.ts', input: { path: '/home/ada/shop/cart.ts', old_string: OLD, new_string: NEW } },
  { k: 'tool', name: 'write_file', summary: '/home/ada/shop/NOTES.md', input: { path: '/home/ada/shop/NOTES.md', content: SECRET } },
  { k: 'text', text: 'Fixed the total and wrote notes.' },
];
const SECOND: Beat[] = [
  { k: 'tool', name: 'delete_file', summary: '/home/ada/shop/old.ts', input: { path: '/home/ada/shop/old.ts' } },
  { k: 'text', text: 'Removed the old file.' },
];

let w: World | null = null;
afterEach(() => { cleanup(); provideActiveConversations(null); queryClient.clear(); w?.dispose(); w = null; vi.restoreAllMocks(); });

async function chatWorld() {
  bootFixtureCore({ rules: chatRules() });
  act(() => chooseComputer(atlas));
  w = world({ script: [FIRST, SECOND] });
  const approval = (w.agent as any).approval.bind(w.agent);
  (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
  const first = await w.dock();
  first.setAuto(false);
  first.send('fix the cart');
  await w.flush(3000);
  const sid = first.record!.s! as string;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(1000);
  const x = w;
  const d: ActiveDeps = {
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
    pending: (h) => x.j.pending(h), onPending: (fn) => x.j.subscribe(fn), set: (fn, ms) => x.clock.set(fn, ms), clear: (id) => x.clock.clear(id),
    decode: liveDeps().decode, waitMs: WAIT_MS,
  };
  const over: ActiveConversationProvider = {
    open(_account, ref) {
      const a = engineActive({ current: () => eng, release: () => undefined }, ref, () => ({ computer: 'atlas', realm: 'Personal', folder: '/home/ada/shop' }), d);
      return { source: a, release: () => a.release() };
    },
  };
  provideActiveConversations(over);
  return { sid, first };
}

async function open(sid: string) {
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${sid}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main>
      </ShellDataProvider>,
    );
    await router.load();
  });
}

/** Every value any storage holds now: the fake localStorage's bytes and the browser's own stores. */
function stored(): string {
  const out: string[] = [];
  for (const st of [w!.fs as unknown as Storage, window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k !== null) out.push(k, st.getItem(k) ?? ''); }
  }
  return out.join('\n');
}

/** A file's row on Edits. The transcript can name the same path too (a closed steps row previews its step), so the row is found
 *  among the matches, never by the only match on the page. */
function editRow(path: string): HTMLElement {
  const row = screen.getAllByText(path).map((e) => e.closest<HTMLElement>('[data-edit-row]')).find((r) => r !== null);
  if (!row) throw new Error(`no Edits row for ${path}`);
  return row;
}

describe('chat edits in Details on the real engine', () => {
  it('read from the transcript: the count, Review to Details on Edits, each change; a live turn adds its file; nothing stored', async () => {
    const { sid } = await chatWorld();
    await open(sid);
    const review = await screen.findByRole('button', { name: kc['result.reviewName'].replace('{{n}}', '2') });
    expect(screen.getByText(kc['result.files'].replace('{{n}}', '2'))).toBeInTheDocument();
    fireEvent.click(review);
    await waitFor(() => expect(screen.getByRole('tab', { name: det['det.tab.edits'] }).getAttribute('aria-selected')).toBe('true'));
    const cart = editRow('/home/ada/shop/cart.ts');
    fireEvent.click(within(cart).getByRole('button', { name: det['det.editShow'] }));
    expect(cart.textContent).toContain(OLD);
    expect(cart.textContent).toContain(NEW);
    const notes = editRow('/home/ada/shop/NOTES.md');
    expect(within(notes).getByText(det['det.verb.written'])).toBeInTheDocument();
    expect(within(notes).queryByRole('button', { name: det['det.editShow'] })).toBeNull();

    // A turn on the page: its delete comes in live.
    fireEvent.change(screen.getByRole('textbox', { name: kc['agent.composer'] }), { target: { value: 'and drop old.ts' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); });
    await act(async () => { await w!.flush(3000); });
    await waitFor(() => expect(editRow('/home/ada/shop/old.ts')).toBeInTheDocument());
    expect(screen.getByText(kc['result.file'])).toBeInTheDocument();

    expect(document.body.innerHTML).not.toContain(SECRET);
    const bytes = stored();
    for (const t of [SECRET, OLD, NEW]) expect(bytes).not.toContain(t);
  });
});
