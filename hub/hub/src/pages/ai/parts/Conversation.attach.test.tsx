// Images and text files in the AI tab's composer, through the dock's own rules (@ask/io
// attach, readFiles) and the source's own send (Draft.images and Draft.files, each text file its own part; ask/active.ts attaches them
// under the send's key). The bytes live in this composer's
// memory only, never in conversationAttempts (its record has no field for them: ChatAttempts is the draft text and two outcomes). Each C9 branch of the send's outcome decides the chips:
//   done            -> they leave (the message was taken with them; their thumbnails are let go);
//   refused/notSent -> they stay, and Send again sends the same bytes (nothing went out);
//   unknown / throw -> they leave the composer and are never put on another send (the row's own key holds them, C9).
// While a turn runs or an approval waits nothing stops the next message being prepared: files are added as at any time, and Send
// queues a message with an image (kit/agent/queuedSend.ts) and sends it once when the turn is over.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type Draft, type SendOutcome, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TEXT, attach } from '@ask/io';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import { resetQueuedForTests } from '@kit/agent/queuedSend';
import kc from '@kit/agent/Conversation.strings.en.json';
import strings from './Conversation.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const IDLE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const RUNNING: CapFacts = { ...IDLE, state: 'running', turn: true };
const GATE: CapFacts = { ...RUNNING, gate: 'confirm' };

// A real 1×1 PNG header (signature + IHDR with its CRC): the agent reads the header, so the rules do too (ask/attach.test.ts).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const B64 = btoa(String.fromCharCode(...PNG));
const png = (name: string) => new File([PNG], name, { type: 'image/png' });
// A PNG of `n` bytes: the real header, then padding. The dock reads the header and the size (prepare), so this is an image of that size.
const bigPng = (name: string, n: number) => { const b = new Uint8Array(n); b.set(PNG); return new File([b], name, { type: 'image/png' }); };
const txt = (name: string, body: string) => new File([body], name, { type: 'text/plain' });

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn>; setFacts(f: CapFacts, confirmed?: boolean): void }
function fake(answer: (d: Draft) => Promise<SendOutcome>, facts: CapFacts = IDLE): Fake {
  let f = facts;
  const subs = new Set<() => void>();
  let snap: ConvSnapshot = { facts: f, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks: [], turnConfirmed: true };
  const send = vi.fn((d: Draft) => answer(d));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => snap, subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb); }, watch: () => undefined,
        can: (a: Parameters<ActiveSource['can']>[0]) => can(a, f),
        send, stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, send, setFacts(n, confirmed = true) { f = n; const { turnConfirmed: _was, ...rest } = snap; void _was; snap = { ...rest, facts: n, ...(confirmed ? { turnConfirmed: true as const } : {}) }; act(() => { for (const cb of subs) cb(); }); } };
}

async function open(h: Fake, strict = false) {
  provideActiveConversations(h.p);
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      strict
        ? <StrictMode><ShellDataProvider value={shell}><main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main></ShellDataProvider></StrictMode>
        : <ShellDataProvider value={shell}><main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main></ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
async function add(...files: File[]) {
  await act(async () => { fireEvent.change(fileInput(), { target: { files } }); });
}
const chips = () => { const l = screen.queryByRole('list', { name: kc['agent.attList'] }); return l ? within(l).queryAllByRole('listitem') : []; };
async function type(text: string) { await act(async () => { fireEvent.change(box(), { target: { value: text } }); }); }
async function pressSend() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); }); }
const lastDraft = (h: Fake): Draft => h.send.mock.calls.at(-1)![0] as Draft;
/** Holds every file read (Blob.arrayBuffer, which readFiles awaits) until release(). */
function holdReads() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const real = Blob.prototype.arrayBuffer;
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) { await gate; return real.call(this); });
  return async () => { await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); }); };
}

let created: string[] = [];
let revoked: string[] = [];
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
  created = []; revoked = [];
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { const u = `blob:t/${++n}`; created.push(u); return u; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => { revoked.push(u); });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  resetQueuedForTests();
  provideActiveConversations(null);
  queryClient.clear();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('images and text files in the AI tab composer', () => {
  it('two images ride the send as Draft.images with their bytes; the typed text stays the text', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(png('a.png'), png('b.png'));
    await waitFor(() => expect(chips()).toHaveLength(2));
    await type('What is on these?');
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(1);
    const d = lastDraft(h);
    expect(d.text).toBe('What is on these?');
    expect(d.images).toEqual([{ name: 'a.png', mime: 'image/png', data: B64 }, { name: 'b.png', mime: 'image/png', data: B64 }]);
    expect(d.files).toBeUndefined();
  });

  it('a fifth image is refused with its own line and never read into the list', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(png('1.png'), png('2.png'), png('3.png'), png('4.png'));
    await waitFor(() => expect(chips()).toHaveLength(4));
    await add(png('5.png'));
    await waitFor(() => expect(screen.getByText(strings['conv.att.imgMany'].replace('{{name}}', '5.png'))).toBeTruthy());
    expect(chips()).toHaveLength(4);
  });

  it('a text file goes as its own part (Draft.files): never folded into the typed text, never as an image', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(txt('notes.txt', 'line one\nline two\n'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('Read this');
    await pressSend();
    const d = lastDraft(h);
    expect(d.images ?? []).toEqual([]);
    expect(d.text).toBe('Read this');
    expect(d.files).toEqual([{ name: 'notes.txt', text: 'line one\nline two\n' }]);
  });

  it('done: the chips leave and every thumbnail is let go', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    await waitFor(() => expect(chips()).toHaveLength(0));
    expect(revoked).toEqual(created);
  });

  it('refused (not sent): the chips stay and Send again sends the same bytes', async () => {
    const h = fake(async () => ({ k: 'refused', code: 'not_sent' } as SendOutcome));
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    await waitFor(() => expect(screen.getByRole('button', { name: strings['conv.send.again'] })).toBeTruthy());
    expect(chips()).toHaveLength(1);
    expect(revoked).toEqual([]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lastDraft(h).images).toEqual(h.send.mock.calls[0]![0].images);
  });

  it('unknown: the chips leave the composer, one send only, and nothing puts them on another send', async () => {
    const h = fake(async () => ({ k: 'unknown' }));
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    await waitFor(() => expect(chips()).toHaveLength(0));
    expect(revoked).toEqual(created);
    // Dismissed after checking the chat: a new message carries no image of the unknown one.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.dismiss'] })); });
    await type('next');
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lastDraft(h).images ?? []).toEqual([]);
  });

  it('a throw is read as unknown: the chips leave and are never sent again; the next message goes without them', async () => {
    let n = 0;
    const h = fake(() => { if (n++ === 0) throw new Error('boom'); return Promise.resolve({ k: 'done' } as SendOutcome); });
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    await waitFor(() => expect(chips()).toHaveLength(0));
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual(created);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.dismiss'] })); });
    await type('next');
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lastDraft(h)).toEqual({ text: 'next' });
    await waitFor(() => expect(box().value).toBe(''));
  });

  it('a text file far over 4000 characters goes as its part; a message over 28 KB holds Send with the reason, nothing is sent to be refused', async () => {
    // The fake takes only what AskEngine.send would (attach.sendBlock on the typed text and its files, ask/engine.ts send).
    const h = fake(async (d) => (attach.messageBytes(d.text, (d.files ?? []) as never) > attach.MSG_BYTES ? { k: 'refused', code: 'not_sent' } as SendOutcome : { k: 'done' }));
    await open(h);
    const reason = strings['conv.att.tooLong'];
    const big = 'a'.repeat(MAX_TEXT * 5);
    await add(txt('n.txt', big));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('x');
    expect(screen.queryAllByText(reason)).toHaveLength(0);
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(lastDraft(h).text).toBe('x');
    expect(lastDraft(h).files).toEqual([{ name: 'n.txt', text: big }]);
    await waitFor(() => expect(chips()).toHaveLength(0));
    // Two files that fit together, then a typed text that takes the message past 28 KB: Send is held with its reason.
    await add(txt('a.txt', 'a'.repeat(14000)), txt('b.txt', 'b'.repeat(14000)));
    await waitFor(() => expect(chips()).toHaveLength(2));
    await type('y'.repeat(1000));
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    await pressSend();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(chips()).toHaveLength(2);
    // A short text fits again: the same two files go.
    await type('y');
    expect(screen.queryAllByText(reason)).toHaveLength(0);
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lastDraft(h).files?.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('Send it now applies the 28 KB message rule too: text files added after a refusal that take it over send nothing', async () => {
    const h = fake(async () => ({ k: 'refused', code: 'not_sent' } as SendOutcome));
    await open(h);
    await add(txt('a.txt', 'short'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('x');
    await pressSend();
    await waitFor(() => expect(screen.getByRole('button', { name: strings['conv.send.again'] })).toBeTruthy());
    await add(txt('b.txt', 'b'.repeat(14000)), txt('c.txt', 'c'.repeat(14000)));
    await waitFor(() => expect(chips()).toHaveLength(3));
    await type('y'.repeat(1000));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('Send it now waits for a file still being read: nothing goes until the read lands, then the file goes too', async () => {
    let n = 0;
    const h = fake(async () => (n++ === 0 ? { k: 'refused', code: 'not_sent' } as SendOutcome : { k: 'done' }));
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    await waitFor(() => expect(screen.getByRole('button', { name: strings['conv.send.again'] })).toBeTruthy());
    const release = holdReads();
    await add(png('b.png'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.send).toHaveBeenCalledTimes(1);
    await release();
    await waitFor(() => expect(chips()).toHaveLength(2));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(lastDraft(h).images?.map((i) => i.name)).toEqual(['a.png', 'b.png']);
  });

  it('a file added while a send is pending stays when that send is taken; only the sent files leave', async () => {
    let answer!: (o: SendOutcome) => void;
    const h = fake(() => new Promise<SendOutcome>((r) => { answer = r; }));
    await open(h);
    await add(png('a.png'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('go');
    await pressSend();
    expect(h.send).toHaveBeenCalledTimes(1);
    await add(png('b.png'));
    await waitFor(() => expect(chips()).toHaveLength(2));
    await act(async () => { answer({ k: 'done' }); });
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(within(screen.getByRole('list', { name: kc['agent.attList'] })).getByText('b.png')).toBeTruthy();
    expect(revoked).toEqual([created[0]]);
  });

  it('a read that ends after the chat changed adds nothing there and lets its thumbnail go', async () => {
    const h = fake(async () => ({ k: 'done' }));
    const router = await open(h);
    const release = holdReads();
    await add(png('late.png'));
    await act(async () => { router.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); });
    await release();
    await waitFor(() => expect(created).toHaveLength(1));
    await waitFor(() => expect(revoked).toEqual(created));
    expect(chips()).toHaveLength(0);
  });

  describe('while a turn runs or an approval waits', () => {
    const note = (k: keyof typeof strings) => screen.queryAllByText(strings[k]).length > 0;
    const queuedWith = async (h: Fake, text = 'and this') => {
      await add(png('a.png'));
      await waitFor(() => expect(chips()).toHaveLength(1));
      await type(text);
      await pressSend();
    };

    it('typing, picking a file and pasting an image all work: the chips show and nothing is refused', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await add(png('a.png'));
      await waitFor(() => expect(chips()).toHaveLength(1));
      await act(async () => { fireEvent.paste(box(), { clipboardData: { files: [png('pasted.png')], types: ['Files'] } }); });
      await waitFor(() => expect(chips()).toHaveLength(2));
      await add(txt('notes.txt', 'one\n'));
      await waitFor(() => expect(chips()).toHaveLength(3));
      await type('look at these');
      expect(box().value).toBe('look at these');
      expect(h.send).not.toHaveBeenCalled();
    });

    it('Send with an image queues the message (nothing is sent, text and chip stay) and it goes once, with its image, when the turn ends', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await add(png('a.png'));
      await waitFor(() => expect(chips()).toHaveLength(1));
      await type('and this');
      // Before the press the composer says what Send will do; it never says the image must wait.
      expect(note('conv.queued.hint')).toBe(true);
      expect(screen.queryByText('Images go with your next message', { exact: false })).toBeNull();
      await pressSend();
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.on')).toBe(true);
      expect(chips()).toHaveLength(1);
      expect(box().value).toBe('and this');
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(lastDraft(h)).toMatchObject({ text: 'and this', images: [{ name: 'a.png', mime: 'image/png', data: B64 }] });
      await waitFor(() => expect(chips()).toHaveLength(0));
      expect(box().value).toBe('');
      expect(note('conv.queued.on')).toBe(false);
      // A later turn starting and ending sends nothing more.
      h.setFacts(RUNNING);
      h.setFacts(IDLE);
      expect(h.send).toHaveBeenCalledTimes(1);
    });

    it('the queued message is still the draft: text changed and a file added after the press go with it', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h, 'first words');
      await type('better words');
      await add(png('b.png'));
      await waitFor(() => expect(chips()).toHaveLength(2));
      expect(note('conv.queued.on')).toBe(true);
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(lastDraft(h).text).toBe('better words');
      expect(lastDraft(h).images).toHaveLength(2);
    });

    it("Don't send takes it out of the queue: the turn ends and nothing is sent; the text and the chip stay", async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.queued.cancel'] })); });
      expect(note('conv.queued.on')).toBe(false);
      h.setFacts(IDLE);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(h.send).not.toHaveBeenCalled();
      expect(chips()).toHaveLength(1);
      expect(box().value).toBe('and this');
    });

    it('during a waiting approval the same: queued, said with the approval, sent once the approval is answered and the turn ends', async () => {
      const h = fake(async () => ({ k: 'done' }), GATE);
      await open(h);
      await queuedWith(h);
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.onGate')).toBe(true);
      // The approval is answered; the turn still runs: nothing goes yet.
      h.setFacts(RUNNING);
      expect(h.send).not.toHaveBeenCalled();
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    });

    it("a text follow-up the agent holds in its own queue goes first: between turns, while the agent's queue is not empty, the queued picture message waits (it would meet the next turn)", async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      // The turn ended, but the agent still holds a queued message: it starts that turn next, so nothing goes now.
      h.setFacts({ ...IDLE, queued: true });
      await act(async () => {});
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.on')).toBe(true);
      // The agent's queue is empty and nothing runs: the picture message goes, once.
      h.setFacts(RUNNING);
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    });

    it('a message the agent holds while an approval waits is said in the composer as a status line describing the box; it goes with the approval', async () => {
      const h = fake(async () => ({ k: 'done' }), { ...GATE, queued: true });
      await open(h);
      const line = screen.getByText(strings['conv.gate.queued']);
      expect(line.closest('[role="status"]')).not.toBeNull();
      expect((box().getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')).toContain(strings['conv.gate.queued']);
      h.setFacts({ ...IDLE, queued: true });
      expect(screen.queryByText(strings['conv.gate.queued'])).toBeNull();
    });

    // A queued draft the person turned into a command is never sent by itself: a command is their own press (with its confirm).
    it.each(['/clear', '/trim 3', '/fork', '  /clear'])('a queued draft changed to the command %j is not sent at the turn end, image kept or removed: it stays with the reason', async (cmd) => {
      for (const keep of [true, false]) {
        const h = fake(async () => ({ k: 'done' }), RUNNING);
        await open(h);
        await queuedWith(h);
        if (!keep) await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.attRemove'].replace('{{name}}', 'a.png') })); });
        await type(cmd);
        h.setFacts(IDLE);
        await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
        expect(h.send, `${cmd} keep=${keep}`).not.toHaveBeenCalled();
        expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
        expect(screen.getByText(strings['conv.queued.no.command'])).toBeTruthy();
        expect(box().value).toBe(cmd);
        cleanup(); resetQueuedForTests();
      }
    });

    it('waits for the agent\'s own state: facts that say idle but are not confirmed (a reopened chat\'s stored record) send nothing', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      h.setFacts(IDLE, false);
      await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.on')).toBe(true);
      h.setFacts(IDLE, true);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
    });

    it('the composer goes while the chat stays (the provider is away for a moment): nothing is sent, and the note says "could not be shown", never "was left"', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      await act(async () => { provideActiveConversations(null); });
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(screen.queryByRole('textbox', { name: kc['agent.composer'] })).toBeNull();
      h.setFacts(IDLE);
      await act(async () => { provideActiveConversations(h.p); });
      await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.gone')).toBe(true);
      expect(note('conv.queued.left')).toBe(false);
      expect(box().value).toBe('and this');
    });

    it('never sent from another chat: leaving the chat un-queues it, and coming back says so with the text still in the box', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      const router = await open(h);
      await queuedWith(h);
      await act(async () => { router.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); });
      h.setFacts(IDLE);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(h.send).not.toHaveBeenCalled();
      expect(note('conv.queued.left')).toBe(false);
      await act(async () => { router.history.push(`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`); });
      await waitFor(() => expect(note('conv.queued.left')).toBe(true));
      expect(box().value).toBe('and this');
      expect(h.send).not.toHaveBeenCalled();
    });

    it('a lost answer is pending: the queued message went once and no later turn end sends it again', async () => {
      const h = fake(async () => ({ k: 'unknown' }), RUNNING);
      await open(h);
      await queuedWith(h);
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(note('conv.send.unknown')).toBe(true));
      h.setFacts(RUNNING);
      h.setFacts(IDLE);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(h.send).toHaveBeenCalledTimes(1);
      // The send's own record holds its files: none is put on another send.
      expect(chips()).toHaveLength(0);
    });

    it('a queued message Send cannot take when the turn ends is not sent and not dropped: it stays in the box with the reason', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      await type('x'.repeat(MAX_TEXT + 1));
      h.setFacts(IDLE);
      await waitFor(() => expect(note('conv.queued.kept')).toBe(true));
      expect(note('conv.queued.no.long')).toBe(true);
      expect(h.send).not.toHaveBeenCalled();
      expect(chips()).toHaveLength(1);
      expect(box().value).toHaveLength(MAX_TEXT + 1);
    });

    it('a refused send at the turn end keeps the chips and offers Send it now, as any refused send', async () => {
      const h = fake(async () => ({ k: 'refused', code: 'not_sent' }), RUNNING);
      await open(h);
      await queuedWith(h);
      h.setFacts(IDLE);
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(note('conv.send.notSent')).toBe(true));
      expect(chips()).toHaveLength(1);
      expect(box().value).toBe('and this');
    });

    it('text and text files need no queue: they go at once as a follow-up', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await add(txt('notes.txt', 'one\n'));
      await waitFor(() => expect(chips()).toHaveLength(1));
      await type('read this');
      expect(note('conv.queued.hint')).toBe(false);
      await pressSend();
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(lastDraft(h)).toMatchObject({ text: 'read this', files: [{ name: 'notes.txt' }] });
      expect(note('conv.queued.on')).toBe(false);
    });

    it('a typed message during a waiting approval says it is read after the answer, and goes at once as a follow-up (it declines nothing)', async () => {
      const h = fake(async () => ({ k: 'done' }), GATE);
      await open(h);
      expect(note('conv.gate.waits')).toBe(false);
      await type('use the staging database');
      expect(note('conv.gate.waits')).toBe(true);
      expect(box()).toHaveAccessibleDescription(strings['conv.gate.waits']);
      await pressSend();
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(lastDraft(h).text).toBe('use the staging database');
    });

    it('a typed message while a QUESTION waits says it is read after the answer, and never names Deny (a question card has none)', async () => {
      const h = fake(async () => ({ k: 'done' }), { ...RUNNING, gate: 'question' });
      await open(h);
      await type('the second option');
      expect(note('conv.gate.waits')).toBe(false);
      expect(note('conv.gate.waitsQuestion')).toBe(true);
      expect(box()).toHaveAccessibleDescription(strings['conv.gate.waitsQuestion']);
      expect(strings['conv.gate.waitsQuestion']).not.toMatch(/Deny|approval/);
    });

    it.each(['confirm', 'question'] as const)('at a waiting %s card the image hint and the queued note name no card kind (right for an approval and a question alike)', async (gate) => {
      const h = fake(async () => ({ k: 'done' }), { ...RUNNING, gate });
      await open(h);
      await add(png('a.png'));
      await waitFor(() => expect(chips()).toHaveLength(1));
      await type('and this');
      expect(note('conv.queued.hintGate')).toBe(true);
      await pressSend();
      await waitFor(() => expect(note('conv.queued.onGate')).toBe(true));
      expect(h.send).not.toHaveBeenCalled();
      for (const k of ['conv.queued.hintGate', 'conv.queued.onGate'] as const) expect(strings[k]).not.toMatch(/Deny|approval|question/);
    });

    it('with its image removed the queued message can go now: Send sends it as a follow-up and the queue is empty', async () => {
      const h = fake(async () => ({ k: 'done' }), RUNNING);
      await open(h);
      await queuedWith(h);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.attRemove'].replace('{{name}}', 'a.png') })); });
      expect(chips()).toHaveLength(0);
      await pressSend();
      await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1));
      expect(lastDraft(h).images).toBeUndefined();
      h.setFacts(IDLE);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(h.send).toHaveBeenCalledTimes(1);
    });
  });

  it('removing a chip lets its thumbnail go; leaving the chat lets every one go', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(png('a.png'), png('b.png'));
    await waitFor(() => expect(chips()).toHaveLength(2));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.attRemove'].replace('{{name}}', 'a.png') })); });
    expect(chips()).toHaveLength(1);
    expect(revoked).toEqual([created[0]]);
    cleanup();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it('a read that ends after the composer left keeps nothing: its thumbnail is let go', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const real = Blob.prototype.arrayBuffer;
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) { await gate; return real.call(this); });
    await add(png('late.png'));
    expect(created).toEqual([]);
    cleanup();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); });
    await waitFor(() => expect(created).toHaveLength(1));
    await waitFor(() => expect(revoked).toEqual(created));
  });
  it('an image refused when it is admitted (the two together pass the message size) has its thumbnail let go at once', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    // Each is under 4 MB, so each is read (a URL made for each); together they pass 7.5 MB, so admission refuses the second.
    await add(bigPng('one.png', 3_500_000), bigPng('two.png', 3_500_000));
    await waitFor(() => expect(created).toHaveLength(2));
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(screen.getByText(strings['conv.att.bodyFull'].replace('{{name}}', 'two.png'))).toBeTruthy();
    expect(revoked).toEqual([created[1]]);
    cleanup();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  describe('under StrictMode (effects run twice on mount)', () => {
    it('files are read and sent once, and done lets every thumbnail go', async () => {
      const h = fake(async () => ({ k: 'done' }));
      await open(h, true);
      await add(png('a.png'), png('b.png'));
      await waitFor(() => expect(chips()).toHaveLength(2));
      await type('go');
      await pressSend();
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(lastDraft(h).images).toHaveLength(2);
      await waitFor(() => expect(chips()).toHaveLength(0));
      expect([...revoked].sort()).toEqual([...created].sort());
    });

    it('a chat change during a read keeps nothing, and Send works on the next chat', async () => {
      const h = fake(async () => ({ k: 'done' }));
      const router = await open(h, true);
      const release = holdReads();
      await add(png('late.png'));
      await act(async () => { router.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); });
      await release();
      await waitFor(() => expect(revoked).toEqual(created));
      expect(created).toHaveLength(1);
      expect(chips()).toHaveLength(0);
      await type('next chat');
      await pressSend();
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(lastDraft(h)).toEqual({ text: 'next chat' });
    });

    it('a read that ends after the composer left keeps nothing', async () => {
      const h = fake(async () => ({ k: 'done' }));
      await open(h, true);
      const release = holdReads();
      await add(png('late.png'));
      cleanup();
      await release();
      await waitFor(() => expect(created).toHaveLength(1));
      await waitFor(() => expect(revoked).toEqual(created));
    });
  });
});

