// Vitest: the pictures a step made (StepPictures.tsx), read through SessionView as the page draws them: read only when the
// step is opened, through the host's reader, drawn as a chip that opens larger; a failed read is the same chip, saying so,
// with the path in its title; with no reader the chip and the path alone; the object URL is let go when the row closes.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { SessionView } from './SessionView';
import { STORED_AT_ONCE, StepPictureHost, pictureMedia, type StepPictureReader } from './StepPictures';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';
import strings from './SessionView.strings.en.json';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const PATH = '/home/ada/.hoody/generated-images/cat-1.png';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const steps: ConvBlock = {
  k: 'steps', key: 't1', label: '1 step', count: '1 step', state: 'ok',
  rows: [{ id: 'a', state: 'ok', verb: 'Make image', summary: 'a cat', time: '4 s', pictures: [{ path: PATH, name: 'cat-1.png', size: 48213 }] }],
} as ConvBlock;
const view = (reader: StepPictureReader | null) => {
  const s: ConvSnapshot = { facts, title: 'T', gates: [], blocks: [steps] };
  const source = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, facts) } as unknown as ConversationSource;
  return render(<StepPictureHost value={reader}><SessionView source={source} size="l" /></StepPictureHost>);
};
const openTrail = () => fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
const stepButton = () => within(screen.getAllByRole('listitem')[0]!).getAllByRole('button')[0]!;

let made: string[] = [], gone: string[] = [];
beforeEach(() => {
  made = []; gone = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => { const u = `blob:t/${made.length + 1}`; made.push(u); return u; }, revokeObjectURL: (u: string) => { gone.push(u); } }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('pictureMedia', () => {
  it('knows the four picture kinds by their first bytes and nothing else', () => {
    expect(pictureMedia(PNG)).toBe('image/png');
    expect(pictureMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(pictureMedia(new TextEncoder().encode('GIF89a..'))).toBe('image/gif');
    expect(pictureMedia(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('image/webp');
    expect(pictureMedia(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(pictureMedia(new TextEncoder().encode('{"entries":[]}'))).toBeNull();
    expect(pictureMedia(new Uint8Array())).toBeNull();
  });
});

describe('a step that made a picture', () => {
  it('reads nothing until the step is opened; then the named path, once, and draws it as a chip that opens larger', async () => {
    const read = vi.fn(async (_path: string, _signal?: AbortSignal): Promise<Uint8Array | null> => PNG);
    view({ read });
    openTrail();
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(stepButton());
    await waitFor(() => expect(made).toHaveLength(1));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0]).toBe(PATH);
    const list = screen.getByRole('list', { name: strings['sv.step.pictures'] });
    expect(within(list).getByText('cat-1.png')).toBeTruthy();
    await act(async () => { fireEvent.click(within(list).getByRole('button', { name: /cat-1\.png/ })); });
    expect((within(screen.getByRole('dialog', { name: 'cat-1.png' })).getByRole('img', { name: 'cat-1.png' }) as HTMLImageElement).getAttribute('src')).toBe(made[0]);
  });
  it('lets the picture go when the step is closed', async () => {
    view({ read: async () => PNG });
    openTrail();
    fireEvent.click(stepButton());
    await waitFor(() => expect(made).toHaveLength(1));
    fireEvent.click(stepButton());
    expect(gone).toEqual(made);
  });
  it.each([
    ['a read that fails', async (): Promise<Uint8Array | null> => { throw new Error('gone'); }],
    ['a file that cannot be read', async (): Promise<Uint8Array | null> => null],
    ['bytes that are no picture', async () => new TextEncoder().encode('{"entries":[]}')],
  ] as const)('%s is the same tile: its name, that the image could not be loaded, the path in its title', async (_n, read) => {
    view({ read: read as StepPictureReader['read'] });
    openTrail();
    fireEvent.click(stepButton());
    const list = screen.getByRole('list', { name: strings['sv.step.pictures'] });
    await waitFor(() => expect(within(list).getByText(strings['sv.step.picFailed'])).toBeTruthy());
    const tile = within(list).getByText('cat-1.png').closest('li') as HTMLLIElement;
    expect(tile.getAttribute('title')).toBe(PATH);
    expect(within(tile).getByText(strings['sv.step.picFailed'])).toBeTruthy();
    expect(screen.queryByText(PATH)).toBeNull();   // no loose path beside the tiles
    expect(within(list).queryByRole('button')).toBeNull();   // nothing to open larger
    expect(made).toEqual([]);
  });
  it('with no reader the tile and its size, the path in its title, and nothing is asked', () => {
    view(null);
    openTrail();
    fireEvent.click(stepButton());
    const list = screen.getByRole('list', { name: strings['sv.step.pictures'] });
    const tile = within(list).getByText('cat-1.png').closest('li') as HTMLLIElement;
    expect(tile.getAttribute('title')).toBe(PATH);
    expect(screen.queryByText(strings['sv.step.picFailed'])).toBeNull();
  });
});

describe('a picture sent with a message of a reopened chat', () => {
  const ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
  const idN = (n: number) => ID.slice(0, 63) + n.toString(16);
  const pic = (n: number, name = `p${n}.png`) => ({ id: `u1:pic${n}`, kind: 'image', name, stored: idN(n) });
  const user = (files: unknown[]): ConvBlock => ({ k: 'user', key: 'u1', text: 'what is this?', at: 1, files } as ConvBlock);
  const chat = (reader: StepPictureReader | null, files: unknown[], session?: string) => {
    const s: ConvSnapshot = { facts, title: 'T', gates: [], blocks: [user(files)] };
    const source = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, facts) } as unknown as ConversationSource;
    return <StepPictureHost value={reader} session={session}><SessionView source={source} size="l" /></StepPictureHost>;
  };
  const show = (reader: StepPictureReader | null, files: unknown[], session?: string) => render(chat(reader, files, session));
  // The rows come near the screen only when the test says so (an IntersectionObserver it fires by hand).
  let watchers = new Set<{ cb: IntersectionObserverCallback; els: Element[] }>();
  const comeNear = () => act(async () => { for (const w of [...watchers]) w.cb(w.els.map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry), {} as IntersectionObserver); });
  beforeEach(() => {
    watchers = new Set();
    vi.stubGlobal('IntersectionObserver', class {
      private w: { cb: IntersectionObserverCallback; els: Element[] };
      constructor(cb: IntersectionObserverCallback) { this.w = { cb, els: [] }; watchers.add(this.w); }
      observe(el: Element) { this.w.els.push(el); }
      unobserve() {}
      disconnect() { watchers.delete(this.w); }
      takeRecords() { return []; }
    });
  });
  const later = () => {
    const out: { id: string; signal: AbortSignal; done: (v: Uint8Array | null) => void; fail: (e: unknown) => void }[] = [];
    const stored = vi.fn((id: string, signal: AbortSignal) => new Promise<Uint8Array | null>((done, fail) => { out.push({ id, signal, done, fail }); }));
    return { out, stored };
  };

  it('is asked for only once its row comes near the screen; then by its id, once, drawn as a thumbnail that opens larger; let go when the view leaves', async () => {
    const stored = vi.fn(async (_id: string, _signal?: AbortSignal): Promise<Uint8Array | null> => PNG);
    const v = show({ read: async () => null, stored }, [pic(0, 'shot.png')]);
    await act(async () => {});
    expect(stored).not.toHaveBeenCalled();
    expect(screen.getByText('shot.png')).toBeTruthy();
    await comeNear();
    await waitFor(() => expect(made).toHaveLength(1));
    expect(stored).toHaveBeenCalledTimes(1);
    expect(stored.mock.calls[0]![0]).toBe(idN(0));
    expect(screen.getByRole('button', { name: /shot\.png/ })).toBeTruthy();
    v.unmount();
    expect(gone).toEqual(made);
  });
  it('a picture the agent no longer has (404) says "no longer available", shows no thumbnail, and is never asked again while the chat is open', async () => {
    const stored = vi.fn(async () => { throw { status: 404 }; });
    const v = show({ read: async () => null, stored }, [pic(0, 'shot.png')], 'c|global|s');
    await comeNear();
    await waitFor(() => expect(screen.getByText(strings['sv.pic.gone'])).toBeTruthy());
    expect(screen.getByText('shot.png')).toBeTruthy();
    // The row drawn again in the same chat (another view of it stays open): the answer is kept, nothing is asked.
    const other = render(chat({ read: async () => null, stored }, [pic(0, 'shot.png')], 'c|global|s'));
    await comeNear();
    await waitFor(() => expect(within(other.container).getByText(strings['sv.pic.gone'])).toBeTruthy());
    expect(stored).toHaveBeenCalledTimes(1);
    expect(made).toEqual([]);
    v.unmount(); other.unmount();
  });
  it.each([
    ['another refusal', async (): Promise<Uint8Array | null> => { throw { status: 500 }; }],
    ['a read that ends with nothing', async (): Promise<Uint8Array | null> => null],
    ['bytes that are no picture (an SVG)', async () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')],
  ] as const)('%s says "not available", which is not "no longer available"', async (_n, stored) => {
    show({ read: async () => null, stored: stored as NonNullable<StepPictureReader['stored']> }, [pic(0, 'shot.png')]);
    await comeNear();
    await waitFor(() => expect(screen.getByText(strings['sv.pic.none'])).toBeTruthy());
    expect(screen.queryByText(strings['sv.pic.gone'])).toBeNull();
    expect(made).toEqual([]);
  });
  it('bytes that start like a PNG but are damaged (the browser cannot draw them) say "not available" and are not drawn again in the chat', async () => {
    const stored = vi.fn(async () => PNG);
    const v = show({ read: async () => null, stored }, [pic(0, 'shot.png')], 'c|global|s');
    await comeNear();
    await waitFor(() => expect(made).toHaveLength(1));
    const img = v.container.querySelector('img') as HTMLImageElement;
    await act(async () => { fireEvent.error(img); });
    expect(screen.getByText(strings['sv.pic.none'])).toBeTruthy();
    expect(v.container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('button', { name: /shot\.png/ })).toBeNull();
    const again = render(chat({ read: async () => null, stored }, [pic(0, 'shot.png')], 'c|global|s'));
    await comeNear();
    await waitFor(() => expect(within(again.container).getByText(strings['sv.pic.none'])).toBeTruthy());
    expect(stored).toHaveBeenCalledTimes(1);
    expect(made).toHaveLength(1);
  });
  it('a picture that cannot be served is a named tile and is never asked for; with no reader the name alone', async () => {
    const stored = vi.fn(async (_id: string, _signal?: AbortSignal): Promise<Uint8Array | null> => PNG);
    show({ read: async () => null, stored }, [{ id: 'u1:pic0', kind: 'image', name: 'shot.png', gone: true }]);
    await comeNear();
    expect(screen.getByText(strings['sv.pic.none'])).toBeTruthy();
    expect(stored).not.toHaveBeenCalled();
    cleanup();
    show(null, [pic(0, 'shot.png')]);
    await comeNear();
    expect(screen.getByText('shot.png')).toBeTruthy();
    expect(screen.queryByText(strings['sv.pic.gone'])).toBeNull();
    expect(screen.queryByText(strings['sv.pic.none'])).toBeNull();
    expect(made).toEqual([]);
  });
  it(`never has more than ${STORED_AT_ONCE} reads of one chat out at once, also across two views of it; each picture is read once`, async () => {
    const { out, stored } = later();
    const files = [0, 1, 2, 3, 4].map((n) => pic(n));
    const page = render(chat({ read: async () => null, stored }, files, 'c|global|s'));
    const dock = render(chat({ read: async () => null, stored }, files, 'c|global|s'));
    await comeNear();
    expect(stored).toHaveBeenCalledTimes(STORED_AT_ONCE);
    await act(async () => { out[0]!.done(PNG); });
    expect(stored).toHaveBeenCalledTimes(3);
    await act(async () => { out[1]!.fail({ status: 404 }); out[2]!.done(PNG); });
    expect(stored).toHaveBeenCalledTimes(5);
    await act(async () => { out[3]!.done(PNG); out[4]!.done(PNG); });
    expect(stored.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3, 4].map(idN));
    // Each view draws its own thumbnails from the one read: four pictures, two views.
    await waitFor(() => expect(made).toHaveLength(8));
    expect(within(page.container).getAllByText(strings['sv.pic.gone'])).toHaveLength(1);
    expect(within(dock.container).getAllByText(strings['sv.pic.gone'])).toHaveLength(1);
  });
  it('another chat has its own reads; leaving the chat cancels its reads still out and lets the waiting ones go unasked', async () => {
    const { out, stored } = later();
    const files = [0, 1, 2].map((n) => pic(n));
    const a = render(chat({ read: async () => null, stored }, files, 'c|global|s'));
    const b = render(chat({ read: async () => null, stored }, [pic(7)], 'c|global|other'));
    await comeNear();
    expect(stored.mock.calls.map((c) => c[0])).toEqual([idN(0), idN(1), idN(7)]);
    a.unmount();
    expect(out.slice(0, 2).map((o) => o.signal.aborted)).toEqual([true, true]);
    expect(out[2]!.signal.aborted).toBe(false);
    await act(async () => { out[0]!.fail(new DOMException('aborted', 'AbortError')); out[1]!.fail(new DOMException('aborted', 'AbortError')); });
    expect(stored).toHaveBeenCalledTimes(3);
    b.unmount();
  });
});
