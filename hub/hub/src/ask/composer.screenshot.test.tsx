// The dock's composer offers "Screenshot of a display" through the kit composer, for the computer its own engine runs on (the
// engine's slot), whatever page is shown beside it. Core's api and download are scripted: nothing leaves.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import kitStrings from '../kit/agent/Conversation.strings.en.json';
import { captureDisplay, shotCtx } from '../kit/agent/displayShot';
import * as A from './attach';
import { readFiles } from './attachio';
import { Composer } from './Composer';
import * as C from './conv';
import askStrings from './strings.en.json';
import type { AskEngine, Slot, Snapshot } from './engine';

const core = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, api: (...a: unknown[]) => core.api(...a), download: (...a: unknown[]) => core.download(...a) };
});

// A real PNG header (signature + a 1×1 IHDR with its CRC): the dock's reader checks the header, not only the signature.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89]);
const P = 'a'.repeat(24), CID = 'b'.repeat(24);
const slotOf = (server?: string): Slot => ({ account: 'u1', project: P, computer: CID, realm: 'global', name: 'box', ...(server ? { server } : {}) });

function mount(slot: Slot, images = 0, sid: string | null = null) {
  const attach = vi.fn();
  const eng = { slot, autoShown: () => null, send: () => false, setAuto: () => false, attBlock: () => null, beginRead: () => 1, attRoom: () => ({ imgs: 4 - images, texts: 3 }), attach } as unknown as AskEngine;
  const items = Array.from({ length: images }, (_, i) => ({ id: `i${i}`, kind: 'image' as const, name: `p${i}.png`, media: 'image/png' as const, data: '', bytes: 10, url: '' }));
  const snap = {
    auto: { cap: false, on: null, busy: false, err: '', note: '' }, conv: C.emptyConv(), dup: null, followUps: true, gate: null,
    needLogin: false, sendable: true, att: { items, refused: [], dropped: false },
  } as unknown as Snapshot;
  const at = (id: string | null) => ({ ...snap, conv: { ...snap.conv, sid: id } }) as Snapshot;
  const ui = (id: string | null) => <Composer eng={eng} snap={at(id)} computer="box" draft="" setDraft={() => {}} note={null} onDismissNote={() => {}} flash={false} inputRef={{ current: null }} onTyping={() => {}} />;
  const r = render(ui(sid));
  return { attach, to: (id: string | null) => r.rerender(ui(id)) };
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: kitStrings['agent.add'] }));
const item = () => within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(kitStrings['agent.shot.item']) });
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

beforeEach(() => { core.api.mockReset(); core.download.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the dock composer: Screenshot of a display', () => {
  it('captures a display of the engine\'s own computer and hands the picture to the dock\'s own attach path', async () => {
    core.api.mockResolvedValue({ data: { runtime_info: { displays: [{ display: 2, state: 'live', windows: [] }] } } });
    core.download.mockResolvedValue({ parts: [new Blob([PNG])], bytes: PNG.length });
    const { attach } = mount(slotOf('sg1'));
    openMenu();
    await act(async () => { fireEvent.click(item()); });
    await settle();
    expect((core.api.mock.calls[0] as [unknown, { params: { id: string } }])[1].params.id).toBe(CID);
    expect(core.download).toHaveBeenCalledTimes(1);
    const input = (core.download.mock.calls[0] as [unknown, { target: unknown; index: number }])[1];
    expect(input.target).toEqual({ project: { id: P }, container: { id: CID, server_name: 'sg1' } });
    expect(input.index).toBe(2);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    // The dock read the file (readFiles) and gave it to the engine's draft: one image, named for the display.
    expect(attach).toHaveBeenCalledTimes(1);
    const list = (attach.mock.calls[0] as [Array<{ ok: boolean; att?: { kind: string; name: string } }>])[0];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ok: true, att: { kind: 'image' } });
    expect(list[0]?.att?.name).toMatch(/^display-2 /);
  });

  it('a computer whose server is not known offers the item disabled, and asks nothing', async () => {
    mount(slotOf());
    openMenu();
    expect(item().getAttribute('aria-disabled')).toBe('true');
    // The dock's own words: it is the server that is not known, not the page that shows another computer.
    expect(item().textContent).toContain(askStrings['ask.shotNoServer'].replace('{{computer}}', 'box'));
    expect(item().textContent).not.toContain(kitStrings['agent.shot.noComputer']);
    expect(core.api).not.toHaveBeenCalled();
  });

  it('a draft that has its 4 images offers the item disabled with that reason', () => {
    mount(slotOf('sg1'), 4);
    openMenu();
    expect(item().textContent).toContain(kitStrings['agent.shot.full_other'].replace('{{max}}', String(A.IMG_MAX)));
  });

  it('a capture over the 4 MiB an image may weigh is made smaller by the dock\'s reader, and the chip keeps the size it had', async () => {
    // A real header followed by filler: 5 MiB, as a large display answers it.
    const big = new Uint8Array(5 * 1024 * 1024);
    big.set(PNG);
    core.download.mockResolvedValue({ parts: [new Blob([big])], bytes: big.length });
    const target = { project: { id: P }, container: { id: CID, server_name: 'sg1' } };
    const file = await captureDisplay(target, 1, { ctx: shotCtx(target) });
    expect(file.size).toBe(big.length);
    expect(file.size).toBeGreaterThan(A.IMG_BYTES);
    const shrink = vi.fn(async () => PNG);
    const [made] = await readFiles([file], { imgs: 1, texts: 0 }, shrink);
    expect(shrink).toHaveBeenCalledTimes(1);
    expect(made).toMatchObject({ ok: true, att: { kind: 'image', media: 'image/png', bytes: PNG.length } });
    expect(made?.ok && made.att.name).toMatch(/^display-1 /);
    // Where the browser cannot draw (no shrink), the picture is refused by name with its size, never attached whole.
    const [refused] = await readFiles([file], { imgs: 1, texts: 0 }, async () => null);
    expect(refused).toMatchObject({ ok: false, why: { key: 'ask.attImgBig', size: big.length } });
  });

  it('a capture in flight when a new conversation gets its first message stays with the conversation it becomes', async () => {
    let done!: (v: unknown) => void;
    core.api.mockResolvedValue({ data: { runtime_info: { displays: [{ display: 1, state: 'live', windows: [] }] } } });
    core.download.mockReturnValue(new Promise((r) => { done = r; }));
    const { attach, to } = mount(slotOf('sg1'));
    openMenu();
    await act(async () => { fireEvent.click(item()); });
    await settle();
    expect(core.download).toHaveBeenCalledTimes(1);
    // The first message was sent: the conversation now has its id.
    to('s-new');
    await settle();
    await act(async () => { done({ parts: [new Blob([PNG])], bytes: PNG.length }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('a capture in flight when ANOTHER conversation is opened is dropped: nothing is added there', async () => {
    let done!: (v: unknown) => void;
    core.api.mockResolvedValue({ data: { runtime_info: { displays: [{ display: 1, state: 'live', windows: [] }] } } });
    core.download.mockReturnValue(new Promise((r) => { done = r; }));
    const { attach, to } = mount(slotOf('sg1'), 0, 's-one');
    openMenu();
    await act(async () => { fireEvent.click(item()); });
    await settle();
    to('s-two');
    await settle();
    await act(async () => { done({ parts: [new Blob([PNG])], bytes: PNG.length }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(attach).not.toHaveBeenCalled();
  });
});
