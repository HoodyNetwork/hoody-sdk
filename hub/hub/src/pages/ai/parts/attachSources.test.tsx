// The chat composer's add menu in the AI tab: Upload files… (the kit's), then From a computer…, Notes… and Mention a file….
// From a computer… is the kit FileChooser over every computer of the shown realm (the agent takes file contents, never a path
// on another computer, so a file there is read by the Hub and carried); Mention a file… writes the path into the draft. Both
// attach dialogs hand a File to the composer's own add path, so a picked file or note becomes the same chip, under the same limits, and rides the
// same send (Draft.images, Draft.files) as an uploaded one. A read that fails, or a note that is too long, attaches nothing.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type Draft, type SendOutcome, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attach } from '@ask/io';
import type * as FilesLinks from '../../files/links';
import type * as NotesLinks from '../../notes/links';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { noteFileName } from './AttachNotesDialog';
import { startPath, typeOfName } from './AttachComputerDialog';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';
import sv from '@kit/agent/SessionView.strings.en.json';
import strings from './Conversation.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const FOLDER = '/home/ada/projects/shop';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

// ── The Files page's reads, as its links hand them on: folder listings by path, and one file's bytes ──────────────────────────
const fileE = (name: string, size = 10) => ({ name, dir: false, size, modified: null, lossy: false, type: 'file' });
const dirE = (name: string) => ({ name, dir: true, size: null, modified: null, lossy: false, type: 'dir' });
const BETA = 'c-0000000000000000000000b3';
const files = vi.hoisted(() => ({
  /** Folder listings by absolute path: the chat's computer's, and (keyed "<id>:<path>") another computer's. */
  listings: {} as Record<string, unknown[] | 'fail'>,
  bytes: {} as Record<string, Uint8Array | Error | null>,
  read: [] as { computer: string; path: string; maxBytes: number }[],
  /** Fresh listings asked before a read. */
  fresh: [] as string[],
}));
vi.mock('../../files/links', async (orig) => {
  const React = await import('react');
  const real = await orig<typeof FilesLinks>();
  const atlasId = fixtureWorld.computers[0]!.id;
  const keyOf = (computer: string | null | undefined, path: string) => (computer && computer !== atlasId ? `${computer}:${path}` : path);
  const rows = [
    { id: atlasId, name: 'atlas', project_id: 'p-atlas', server_name: 'node-a', status: 'running', rules: 'open' as const },
    { id: 'c-0000000000000000000000b2', name: 'Ada', project_id: 'p-ada', server_name: 'node-b', status: 'stopped', rules: 'open' as const },
    { id: 'c-0000000000000000000000b3', name: 'beta', project_id: 'p-beta', server_name: 'node-c', status: 'running', rules: 'open' as const },
  ];
  const computers = [
    { id: rows[0]!.id, name: 'atlas', running: true, state: 'Running' },
    { id: rows[1]!.id, name: 'Ada', running: false, state: 'Stopped', disabledReason: 'Stopped. Start it to read its files.' },
    { id: rows[2]!.id, name: 'beta', running: true, state: 'Running' },
  ];
  return {
    ...real,
    // The chooser's host, answering at once from `files.listings`: the shown realm's computers (a computer of another realm
    // is not among them: pages/files/chooser.test.tsx pins that on the real host), one folder at a time.
    useFileChooserHost: () => {
      const [place, setPlace] = React.useState<{ computer: string | null; dir: string } | null>(null);
      const want = React.useCallback((p: { computer: string | null; dir: string } | null) => setPlace(p), []);
      const l = place ? files.listings[keyOf(place.computer, real.chooserAbs(place.dir))] : undefined;
      const ok = Array.isArray(l);
      return {
        reads: {
          folder: { place: ok ? place : null, entries: ok ? (l as { name: string; dir: boolean; size: number | null }[]) : [], failed: place !== null && !ok, error: { kind: 'unavailable', status: 503 } },
          want,
        },
        computers, computersStatus: undefined, places: [],
        computerOf: (id: string) => rows.find((r) => r.id === id),
      };
    },
    freshListing: async (c: { id: string }, path: string) => {
      files.fresh.push(keyOf(c.id, path));
      const l = files.listings[keyOf(c.id, path)];
      return Array.isArray(l) ? { entries: l, whole: true } : 'failed';
    },
    readFileBytes: async (c: { id: string }, path: string, o: { maxBytes: number }) => {
      files.read.push({ computer: c.id, path, maxBytes: o.maxBytes });
      const b = files.bytes[keyOf(c.id, path)];
      if (b instanceof Error) throw Object.assign(b, { kind: 'unavailable', status: 503 });
      return b ?? null;
    },
  };
});

// ── The Notes page's reads, as its links hand them on: the running computers' recent notes, and one note's text ───────────────
const notes = vi.hoisted(() => ({
  rows: [] as { id: string; title: string; section: string; at: number | null; hasBody: boolean }[],
  texts: {} as Record<string, { ok: true; text: string } | { ok: false; why: 'tooBig' } | { ok: false; why: 'failed'; error: unknown }>,
  read: [] as { note: string; maxBytes: number }[],
}));
vi.mock('../../notes/links', async (orig) => {
  const computer = { id: fixtureWorld.computers[0]!.id, projectId: 'p-atlas', name: 'atlas', serverName: 'node-a', state: 'running' as const };
  const api = {};
  return {
    ...(await orig<typeof NotesLinks>()),
    useNotesApi: () => api,
    useNotesComputers: () => ({ data: [computer], isPending: false, error: null, refetch: async () => undefined }),
    useNotes: () => ({
      loads: { [computer.id]: { state: 'ok', me: { userId: 'u1', notebookId: 'nb1', role: 'owner' }, recent: { items: notes.rows, partial: false, create: null } } },
      reload: () => undefined, reloadAll: () => undefined,
    }),
    readNoteText: async (_c: unknown, _nb: string, n: { id: string }, maxBytes: number) => {
      notes.read.push({ note: n.id, maxBytes });
      return notes.texts[n.id] ?? { ok: false, why: 'failed', error: { kind: 'unavailable', status: 503 } };
    },
  };
});

const IDLE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const RUNNING: CapFacts = { ...IDLE, state: 'running', turn: true };
const CLOSED: CapFacts = { ...IDLE, state: 'closed' };

// A real 1×1 PNG header (signature + IHDR with its CRC): the composer reads an image by its first bytes.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const B64 = btoa(String.fromCharCode(...PNG));
const utf8 = (s: string) => new TextEncoder().encode(s);

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn> }
function fake(facts: CapFacts = IDLE): Fake {
  const snap: ConvSnapshot = { facts, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks: [] };
  const send = vi.fn(async (_d: Draft): Promise<SendOutcome> => ({ k: 'done' }));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => snap, subscribe: () => () => undefined, watch: () => undefined,
        can: (a: Parameters<ActiveSource['can']>[0]) => can(a, facts),
        send, stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, send };
}

async function open(h: Fake) {
  provideActiveConversations(h.p);
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(<ShellDataProvider value={shell}><main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main></ShellDataProvider>);
    await router.load();
  });
  await waitFor(() => expect(box()).toBeTruthy());
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;
const chips = () => { const l = screen.queryByRole('list', { name: kc['agent.attList'] }); return l ? within(l).queryAllByRole('listitem') : []; };
async function type(text: string) { await act(async () => { fireEvent.change(box(), { target: { value: text } }); }); }
async function pressSend() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); }); }
const lastDraft = (h: Fake): Draft => h.send.mock.calls.at(-1)![0] as Draft;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };

async function openMenu() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.add'] })); });
  return within(screen.getByRole('menu')).getAllByRole('menuitem');
}
type Source = 'conv.add.computer' | 'conv.add.notes' | 'conv.add.mention';
const label = (key: Source) => strings[key].replace('…', '');
async function choose(key: Source) {
  const items = await openMenu();
  const item = items.find((i) => i.textContent?.includes(label(key)))!;
  await act(async () => { fireEvent.click(item); });
  return waitFor(() => screen.getByRole('dialog', { name: strings[`${key}.title`] }));
}
const attachButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: strings['conv.add.attach'] });
async function pressAttach(dialog: HTMLElement) {
  await act(async () => { fireEvent.click(attachButton(dialog)); });
  await settle();
}
/** A row of the chooser's list, by the start of its name. */
const fileRow = (dialog: HTMLElement, name: string) => within(within(dialog).getByRole('listbox', { name: 'In this folder' })).getAllByRole('option').find((o) => o.getAttribute('data-key') === name)!;
async function press(el: HTMLElement) { await act(async () => { fireEvent.click(el); }); }
/** Picks a computer in the chooser's own computer list. */
async function pickComputer(dialog: HTMLElement, name: string) {
  await press(within(dialog).getByRole('button', { name: /Computer$/ }));
  const panel = await waitFor(() => screen.getByRole('dialog', { name: 'Computer' }));
  await press(within(panel).getByText(name));
}
const noteRow = (dialog: HTMLElement, title: string) => within(dialog).getAllByRole('row').find((r) => r.textContent?.includes(title))!;
async function pickNote(dialog: HTMLElement, title: string) {
  await act(async () => { fireEvent.click(within(noteRow(dialog, title)).getByRole('checkbox')); });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:t/${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  files.listings = {
    '/': [dirE('home')], '/home': [dirE('ada')], '/home/ada': [dirE('projects')], '/home/ada/projects': [dirE('shop')],
    [FOLDER]: [dirE('src'), fileE('notes.txt', 18), fileE('shot.png', PNG.length), fileE('huge.bin', 64 * 1024 * 1024), fileE('long.log', 200 * 1024)],
    [`${BETA}:/`]: [dirE('srv')], [`${BETA}:/srv`]: [fileE('app.log', 12), fileE('my notes.md', 9)],
  };
  files.bytes = { [`${FOLDER}/notes.txt`]: utf8('line one\nline two\n'), [`${FOLDER}/shot.png`]: PNG, [`${BETA}:/srv/app.log`]: utf8('started ok\n') };
  files.read = [];
  files.fresh = [];
  // eslint-disable-next-line no-restricted-globals -- the kit chooser keeps its recent places itself; each test starts with none
  localStorage.removeItem('hub.v3.pane.filechooser.ai-attach');
  notes.rows = [
    { id: 'n1', title: 'Release plan', section: 'Work', at: 1_760_000_000_000, hasBody: true },
    { id: 'n2', title: 'Meeting 11/12', section: 'Work', at: 1_760_000_100_000, hasBody: true },
    { id: 'n3', title: 'Long read', section: 'Work', at: 1_760_000_200_000, hasBody: true },
  ];
  notes.texts = { n1: { ok: true, text: '# Release plan\n\nShip on Friday.\n' }, n2: { ok: true, text: '# Meeting\n' }, n3: { ok: false, why: 'tooBig' } };
  notes.read = [];
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the add menu of the AI tab composer', () => {
  it('has exactly six items in order: Upload files…, Screenshot of a display, From a computer…, Notes…, From a URL…, Mention a file…', async () => {
    await open(fake());
    const items = await openMenu();
    expect(items).toHaveLength(6);
    expect(items[0]!.textContent).toContain(kc['agent.addUpload']);
    expect(items[1]!.textContent).toContain(kc['agent.shot.item']);
    expect(items[2]!.textContent).toContain(strings['conv.add.computer']);
    expect(items[3]!.textContent).toContain(strings['conv.add.notes']);
    expect(items[4]!.textContent).toContain(strings['conv.add.url']);
    expect(items[5]!.textContent).toContain(strings['conv.add.mention']);
    for (const i of items) expect(i.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('while the chat takes no files, the file sources stay in the menu, disabled with the composer\'s own reason; a mention is text, so it stays on', async () => {
    await open(fake(CLOSED));
    const items = await openMenu();
    expect(items).toHaveLength(6);
    expect(items[5]!.getAttribute('aria-disabled')).not.toBe('true');
    for (const i of [items[1]!, items[2]!, items[3]!, items[4]!]) expect(i.getAttribute('aria-disabled')).toBe('true');
    // One reason for all is said once in the menu, and is each item's description for a screen reader.
    expect(screen.getByRole('menu').textContent).toContain(sv['sv.why.closed']);
    for (const i of [items[1]!, items[2]!, items[3]!, items[4]!]) expect(i).toHaveAccessibleDescription(expect.stringContaining(sv['sv.why.closed']));
    await act(async () => { fireEvent.click(items[3]!); });
    expect(screen.queryByRole('dialog', { name: strings['conv.add.notes.title'] })).toBeNull();
  });

  it('while a turn runs every source stays on: a file is prepared for the next message at any time', async () => {
    await open(fake(RUNNING));
    const items = await openMenu();
    expect(items).toHaveLength(6);
    for (const i of items) expect(i.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('with three text files attached, Notes… is disabled and says the message has no room', async () => {
    await open(fake());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: ['a', 'b', 'c'].map((n) => new File([`${n}\n`], `${n}.txt`, { type: 'text/plain' })) } }); });
    await waitFor(() => expect(chips()).toHaveLength(3));
    const items = await openMenu();
    expect(items[2]!.getAttribute('aria-disabled')).not.toBe('true');
    expect(items[3]!.getAttribute('aria-disabled')).toBe('true');
    expect(items[3]!.textContent).toContain(strings['conv.add.notes.full'].replace('{{max}}', String(attach.TXT_MAX)));
  });
});

describe('Notes…', () => {
  it('lists the notes with the limit in words; Attach adds a text chip named after the note, and its text rides the send as Draft.files', async () => {
    const h = fake();
    await open(h);
    const d = await choose('conv.add.notes');
    expect(d.textContent).toContain('24 KB');
    for (const title of ['Release plan', 'Meeting 11/12', 'Long read']) expect(noteRow(d, title)).toBeTruthy();
    expect(attachButton(d)).toBeDisabled();
    await pickNote(d, 'Release plan');
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chips()[0]!.textContent).toContain('Release plan.md');
    // The note is read once, and never past what a text file may hold.
    expect(notes.read).toEqual([{ note: 'n1', maxBytes: attach.TXT_BYTES }]);
    expect(h.send).not.toHaveBeenCalled();
    await type('Summarise this');
    await pressSend();
    const draft = lastDraft(h);
    expect(draft.text).toBe('Summarise this');
    expect(draft.files).toEqual([{ name: 'Release plan.md', text: '# Release plan\n\nShip on Friday.\n' }]);
    expect(draft.images ?? []).toEqual([]);
  });

  it('a note that proves too long attaches nothing, is marked with the reason and can no longer be picked', async () => {
    await open(fake());
    const d = await choose('conv.add.notes');
    await pickNote(d, 'Release plan');
    await pickNote(d, 'Long read');
    await pressAttach(d);
    // Nothing was attached, not even the note that was read: the dialog stays and says which note is too long.
    expect(chips()).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBe(d);
    expect(d.textContent).toContain(strings['conv.add.notes.long'].replace('{{max}}', '24 KB').replace('{{names}}', 'Long read'));
    expect(noteRow(d, 'Long read').textContent).toContain(strings['conv.add.notes.tooLong']);
    // The too-long note left the pick, and picking it again changes nothing.
    await pickNote(d, 'Long read');
    expect((within(noteRow(d, 'Long read')).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    // The other note is still picked: Attach again adds it.
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(chips()[0]!.textContent).toContain('Release plan.md');
  });

  it('a note that cannot be read attaches nothing and the dialog says so', async () => {
    notes.texts.n1 = { ok: false, why: 'failed', error: { kind: 'unavailable', status: 503 } };
    await open(fake());
    const d = await choose('conv.add.notes');
    await pickNote(d, 'Release plan');
    await pickNote(d, 'Meeting 11/12');
    await pressAttach(d);
    expect(chips()).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBe(d);
    expect(d.textContent).toContain(strings['conv.add.notes.failed']);
  });

  it('no more notes are picked than the message has room for', async () => {
    await open(fake());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: ['a', 'b'].map((n) => new File([`${n}\n`], `${n}.txt`, { type: 'text/plain' })) } }); });
    await waitFor(() => expect(chips()).toHaveLength(2));
    const d = await choose('conv.add.notes');
    await pickNote(d, 'Release plan');
    await pickNote(d, 'Meeting 11/12');
    expect((within(noteRow(d, 'Release plan')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect((within(noteRow(d, 'Meeting 11/12')).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(d.textContent).toContain(strings['conv.add.notes.over_one'].replace('{{count}}', '1'));
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(3));
    expect(notes.read.map((r) => r.note)).toEqual(['n1']);
  });

  it('names the file after the note: a slash becomes a dash, an empty title a plain name', () => {
    expect(noteFileName('Meeting 11/12', 'Untitled note')).toBe('Meeting 11-12.md');
    expect(noteFileName('  ', 'Untitled note')).toBe('Untitled note.md');
  });
});

describe('From a computer…', () => {
  it('opens on the chat\'s computer and folder; a text file chosen there rides the send as Draft.files', async () => {
    const h = fake();
    await open(h);
    const d = await choose('conv.add.computer');
    expect(within(d).getByRole('button', { name: /atlas.*Computer$/ })).toBeTruthy();
    expect(within(d).getByText('shop')).toHaveAttribute('aria-current', 'location');
    expect(attachButton(d)).toBeDisabled();
    await press(fileRow(d, 'notes.txt'));
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    // The folder is listed fresh, then the file is read once.
    expect(files.fresh).toEqual([FOLDER]);
    expect(files.read).toEqual([{ computer: atlas.id, path: `${FOLDER}/notes.txt`, maxBytes: expect.any(Number) }]);
    expect(chips()[0]!.textContent).toContain('notes.txt');
    expect(chips()[0]!.textContent).toContain(`from atlas:${FOLDER}/notes.txt`);
    expect(h.send).not.toHaveBeenCalled();
    await type('Read this');
    await pressSend();
    expect(lastDraft(h).files).toEqual([{ name: 'notes.txt', text: 'line one\nline two\n', from: `atlas:${FOLDER}/notes.txt` }]);
  });

  it('a file on ANOTHER computer is read there and carried as content, its chip naming computer and path', async () => {
    const h = fake();
    await open(h);
    const d = await choose('conv.add.computer');
    await pickComputer(d, 'beta');
    await press(fileRow(d, 'srv'));
    await press(fileRow(d, 'app.log'));
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(1));
    expect(files.read).toEqual([{ computer: BETA, path: '/srv/app.log', maxBytes: expect.any(Number) }]);
    expect(chips()[0]!.textContent).toContain('from beta:/srv/app.log');
    await type('Why did it stop?');
    await pressSend();
    // What the agent gets is the file's text: it has no way to open a path on another computer by name.
    expect(lastDraft(h).files).toEqual([{ name: 'app.log', text: 'started ok\n', from: 'beta:/srv/app.log' }]);
    expect(lastDraft(h).text).toBe('Why did it stop?');
  });

  it('files from two computers go in one pick', async () => {
    await open(fake());
    const d = await choose('conv.add.computer');
    await press(fileRow(d, 'notes.txt'));
    await pickComputer(d, 'beta');
    await press(fileRow(d, 'srv'));
    await press(fileRow(d, 'app.log'));
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(2));
    expect(files.read.map((r) => r.computer)).toEqual([atlas.id, BETA]);
  });

  it('a stopped computer is listed with the reason and cannot be opened', async () => {
    await open(fake());
    const d = await choose('conv.add.computer');
    await press(within(d).getByRole('button', { name: /Computer$/ }));
    const panel = await waitFor(() => screen.getByRole('dialog', { name: 'Computer' }));
    expect(within(panel).getByText('Stopped. Start it to read its files.')).toBeTruthy();
    await press(within(panel).getByText('Ada'));
    expect(within(d).getByText('shop')).toHaveAttribute('aria-current', 'location');
    expect(files.read).toEqual([]);
  });

  it('an image chosen there rides the send as Draft.images with its bytes', async () => {
    const h = fake();
    await open(h);
    const d = await choose('conv.add.computer');
    await press(fileRow(d, 'shot.png'));
    await pressAttach(d);
    await waitFor(() => expect(chips()).toHaveLength(1));
    await type('What is on this?');
    await pressSend();
    expect(lastDraft(h).images).toEqual([{ name: 'shot.png', mime: 'image/png', data: B64 }]);
    expect(lastDraft(h).files).toBeUndefined();
  });

  it('a file too large to carry is refused in the list with the reason, before anything is read', async () => {
    await open(fake());
    const d = await choose('conv.add.computer');
    const huge = fileRow(d, 'huge.bin');
    expect(huge.getAttribute('aria-disabled')).toBe('true');
    expect(huge.textContent).toContain('too large to read from a computer');
    const long = fileRow(d, 'long.log');
    expect(long.getAttribute('aria-disabled')).toBe('true');
    expect(long.textContent).toContain('too large to attach as text');
    await press(huge);
    await press(long);
    expect(attachButton(d)).toBeDisabled();
    expect(files.read).toEqual([]);
    expect(files.fresh).toEqual([]);
  });

  it('a file read that fails attaches nothing and shows the error in the dialog', async () => {
    files.bytes[`${FOLDER}/notes.txt`] = new Error('down');
    await open(fake());
    const d = await choose('conv.add.computer');
    await press(fileRow(d, 'notes.txt'));
    await pressAttach(d);
    expect(chips()).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: strings['conv.add.computer.title'] })).toBe(d);
    expect(within(d).getByRole('button', { name: /details/i })).toBeTruthy();
  });

  it('a fresh listing that fails attaches nothing and reads no file', async () => {
    await open(fake());
    const d = await choose('conv.add.computer');
    await press(fileRow(d, 'notes.txt'));
    files.listings[FOLDER] = 'fail';
    await pressAttach(d);
    expect(chips()).toHaveLength(0);
    expect(files.read).toEqual([]);
    expect(within(d).getByRole('button', { name: /details/i })).toBeTruthy();
  });

  it('a file that is gone, or a folder now, when Attach is pressed is refused in words, unread', async () => {
    await open(fake());
    const d = await choose('conv.add.computer');
    await press(fileRow(d, 'notes.txt'));
    files.listings[FOLDER] = [dirE('src')];
    await pressAttach(d);
    expect(d.textContent).toContain(strings['conv.add.computer.why.missing'].replace('{{name}}', 'notes.txt'));
    files.listings[FOLDER] = [dirE('notes.txt')];
    await pressAttach(d);
    expect(d.textContent).toContain(strings['conv.add.computer.why.folder'].replace('{{name}}', 'notes.txt'));
    expect(files.read).toEqual([]);
    expect(chips()).toHaveLength(0);
  });

  it('labels the File by its name and starts in the chat folder', () => {
    expect(typeOfName('a.PNG')).toBe('image/png');
    expect(typeOfName('notes.md')).toBe('text/markdown');
    expect(typeOfName('Makefile')).toBe('text/plain');
    expect(startPath('/home/ada/projects/shop')).toBe('home/ada/projects/shop/');
    expect(startPath('/')).toBe('');
  });
});

describe('Mention a file…', () => {
  const mentionButton = (d: HTMLElement) => within(d).getByRole('button', { name: strings['conv.add.mention.do'] });
  it('a file on the chat\'s own computer is written as the agent\'s "@" mention; nothing is read or sent', async () => {
    const h = fake();
    await open(h);
    await type('Look at');
    const d = await choose('conv.add.mention');
    await press(fileRow(d, 'notes.txt'));
    await press(mentionButton(d));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(box().value).toBe(`Look at @${FOLDER}/notes.txt `);
    expect(files.read).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('a file on another computer is written with that computer\'s name, quoted when its path holds a space', async () => {
    await open(fake());
    const d = await choose('conv.add.mention');
    await pickComputer(d, 'beta');
    await press(fileRow(d, 'srv'));
    await press(fileRow(d, 'my notes.md'));
    await press(mentionButton(d));
    expect(box().value).toBe('@"/srv/my notes.md" (on the computer "beta") ');
    expect(files.read).toEqual([]);
  });

  it('a file too large to attach can still be mentioned', async () => {
    await open(fake());
    const d = await choose('conv.add.mention');
    expect(fileRow(d, 'huge.bin').getAttribute('aria-disabled')).not.toBe('true');
    await press(fileRow(d, 'huge.bin'));
    await press(mentionButton(d));
    expect(box().value).toBe(`@${FOLDER}/huge.bin `);
  });
});
