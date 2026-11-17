// Vitest: "Screenshot of a display" in the composer's add menu (DisplayShot.tsx), in every composer that passes `screenshot`:
// the item and its reasons, one display captured at once, several asked for, none said, failures worded with Try again, the
// file handed to the host's own add path (a chip only the host draws), nothing sent. Core's api and download are scripted.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { Composer, type ComposerProps, type ComposerScreenshot } from './Composer';
import { shotRoutes } from './displayShot';
import strings from './Conversation.strings.en.json';

const core = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn(), framed: false }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, api: (...a: unknown[]) => core.api(...a), download: (...a: unknown[]) => core.download(...a), isFramed: () => core.framed };
});

const chatComputer: Target = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'sg1' } };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const png = () => ({ parts: [new Blob([PNG])], bytes: PNG.length });
const runtime = (displays: unknown[]) => ({ data: { runtime_info: { displays } } });
const shot = (o: Partial<ComposerScreenshot> = {}): ComposerScreenshot => ({ chat: 'chat-1', target: chatComputer, computer: 'atlas', room: 4, max: 4, ...o });
const say = (key: keyof typeof strings, vars: Record<string, string> = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), strings[key]);

function props(o: Partial<ComposerProps> = {}): ComposerProps {
  return {
    draft: 'look at this', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
    placeholder: 'Ask anything', max: 4000, canSend: true, onSend: vi.fn(), notes: [], attachments: [],
    onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(), screenshot: shot(), ...o,
  };
}
function mount(o: Partial<ComposerProps> = {}) {
  const p = props(o);
  const r = render(<Composer {...p} />);
  return { p, ...r };
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: strings['agent.add'] }));
const item = () => within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['agent.shot.item']) });
const press = async () => { openMenu(); await act(async () => { fireEvent.click(item()); }); };
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const files = (p: ComposerProps) => (p.onAddFiles as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as File[]);

beforeEach(() => { core.api.mockReset(); core.download.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Composer: Screenshot of a display', () => {
  it('the add menu has the item right after Upload files, before the host\'s own sources, with one line of what it does', () => {
    mount({ addMenu: [{ id: 'notes', label: 'Notes…', onAction: vi.fn() }] });
    openMenu();
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining(strings['agent.addUpload']), expect.stringContaining(strings['agent.shot.item']), expect.stringContaining('Notes…')]);
    expect(items[1]!.textContent).toContain(strings['agent.shot.desc']);
    expect(core.api).not.toHaveBeenCalled();
  });

  it('a composer with no other source (the dock) gets the menu too: Upload files, then the screenshot', () => {
    mount();
    openMenu();
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(2);
  });

  it('without `screenshot` nothing changes: "+" is the file picker button', () => {
    mount({ screenshot: null });
    expect(screen.queryByRole('button', { name: strings['agent.add'] })).toBeNull();
    expect(screen.getByRole('button', { name: strings['agent.attach'] })).toBeTruthy();
  });

  it('one display: one read of the chat\'s computer, one capture of that display there, one file to the host; nothing is sent', async () => {
    core.api.mockResolvedValue(runtime([{ display: 3, state: 'live', windows: [] }]));
    core.download.mockResolvedValue(png());
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const { p } = mount();
    await press();
    await settle();
    expect(core.api).toHaveBeenCalledTimes(1);
    expect((core.api.mock.calls[0] as [unknown, { params: { id: string } }])[1].params.id).toBe(chatComputer.container.id);
    expect(core.download).toHaveBeenCalledTimes(1);
    const [route, input] = core.download.mock.calls[0] as [unknown, { target: Target; index: number }];
    expect(route).toBe(shotRoutes.capture);
    expect(input.target).toBe(chatComputer);
    expect(input.index).toBe(3);
    const got = files(p);
    expect(got).toHaveLength(1);
    expect(got[0]).toHaveLength(1);
    expect(got[0]![0]!.name).toMatch(/^display-3 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.png$/);
    expect(got[0]![0]!.type).toBe('image/png');
    expect(p.onSend).not.toHaveBeenCalled();
    expect(p.setDraft).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    // No dialog was shown and no note is left.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('while it works a line says what is going on, and the item waits with its reason', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    let done!: (v: unknown) => void;
    core.download.mockReturnValue(new Promise((r) => { done = r; }));
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toBe(say('agent.shot.capturing', { n: '1', computer: 'atlas' }));
    openMenu();
    expect(item().getAttribute('aria-disabled')).toBe('true');
    expect(item().textContent).toContain(strings['agent.shot.busy']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await act(async () => { done(png()); });
    await settle();
    expect(files(p)).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('several displays: a dialog asks which one, by number and windows; the choice is captured, nothing before it', async () => {
    core.api.mockResolvedValue(runtime([
      { display: 1, state: 'live', windows: [{ title: 'Firefox' }, { title: 'Terminal' }, { title: 'Files' }] },
      { display: 12, state: 'live', windows: [] },
      { display: 20, state: 'parked', windows: [] },
    ]));
    core.download.mockResolvedValue(png());
    const { p } = mount();
    await press();
    await settle();
    expect(core.download).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: strings['agent.shot.pick.title'] });
    expect(dialog.textContent).toContain(say('agent.shot.pick.body', { computer: 'atlas' }));
    const radios = within(dialog).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(dialog.textContent).toContain(say('agent.shot.display', { n: '1' }));
    expect(dialog.textContent).toContain('3 windows: Firefox, Terminal, …');
    expect(dialog.textContent).toContain(strings['agent.shot.windows.none']);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(radios[1]!);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: strings['agent.shot.pick.take'] })); });
    await settle();
    expect(core.download).toHaveBeenCalledTimes(1);
    expect((core.download.mock.calls[0] as [unknown, { index: number }])[1].index).toBe(12);
    expect(files(p)[0]![0]!.name).toMatch(/^display-12 /);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the dialog says that the computer keeps its own copy of each screenshot', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }, { display: 2, state: 'live' }]));
    mount();
    await press();
    await settle();
    expect(screen.getByRole('dialog').textContent).toContain('Nothing is sent until you press Send. atlas keeps its own copy of each screenshot.');
  });

  it('Take after the chat\'s computer stopped being known here closes the dialog and says so; nothing is captured', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }, { display: 2, state: 'live' }]));
    const { p, rerender } = mount();
    await press();
    await settle();
    rerender(<Composer {...p} screenshot={shot({ target: null })} />);
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: strings['agent.shot.pick.take'] })); });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(strings['agent.shot.lost']);
    expect(screen.queryByRole('button', { name: strings['agent.shot.again'] })).toBeNull();
    expect(core.download).not.toHaveBeenCalled();
    expect(files(p)).toHaveLength(0);
  });

  it('a display whose state is not said is not offered: with no other, nothing is captured', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1 }, { display: 2, state: 'parked' }]));
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.none', { computer: 'atlas' }));
    expect(core.download).not.toHaveBeenCalled();
    expect(files(p)).toHaveLength(0);
  });

  it('Enter on a display in the dialog takes that display, as the button does', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }, { display: 2, state: 'live' }]));
    core.download.mockResolvedValue(png());
    const { p } = mount();
    await press();
    await settle();
    const radios = within(screen.getByRole('dialog')).getAllByRole('radio');
    await act(async () => { fireEvent.click(radios[1]!); });
    await act(async () => { fireEvent.keyDown(radios[1]!, { key: 'Enter' }); });
    await settle();
    expect(core.download).toHaveBeenCalledTimes(1);
    expect((core.download.mock.calls[0] as [unknown, { index: number }])[1].index).toBe(2);
    expect(files(p)).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: strings['agent.shot.pick.title'] })).toBeNull();
  });

  it('a listing answered without its displays reads "couldn\'t be read" with Try again, never "No display is running"', async () => {
    core.api.mockResolvedValue({ data: { runtime_info: {} } });
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.listFailed', { computer: 'atlas' }));
    expect(screen.getByRole('status').textContent).not.toContain('No display is running');
    expect(screen.getByRole('button', { name: strings['agent.shot.again'] })).toBeTruthy();
    expect(files(p)).toHaveLength(0);
  });

  it('while it works the note shows the kit spinner before its words; a failure keeps Details, Try again and close in one group', async () => {
    let fail!: (e: unknown) => void;
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    core.download.mockReturnValue(new Promise((_r, rej) => { fail = rej; }));
    mount();
    await press();
    await settle();
    const busy = screen.getByRole('status');
    expect(busy.querySelector('[class*="spinner" i]')).not.toBeNull();
    await act(async () => { fail({ kind: 'unavailable', status: 500, code: 'SCREENSHOT_FAILED' }); });
    await settle();
    const said = screen.getByRole('status');
    expect(said.querySelector('[class*="spinner" i]')).toBeNull();
    const group = screen.getByRole('button', { name: strings['agent.shot.again'] }).parentElement!;
    expect(within(group).getByRole('button', { name: strings['agent.shot.dismiss'] })).toBeTruthy();
    expect(within(group).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  it('Cancel in the dialog takes nothing', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }, { display: 2, state: 'live' }]));
    const { p } = mount();
    await press();
    await settle();
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })); });
    await settle();
    expect(core.download).not.toHaveBeenCalled();
    expect(files(p)).toHaveLength(0);
  });

  it('no display running: said with the computer\'s name, nothing captured, and the line can be dismissed', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'parked' }]));
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.none', { computer: 'atlas' }));
    expect(core.download).not.toHaveBeenCalled();
    expect(files(p)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: strings['agent.shot.again'] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: strings['agent.shot.dismiss'] }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a capture that fails says why and attaches nothing; Try again asks for the same display once more, never by itself', async () => {
    core.api.mockResolvedValue(runtime([{ display: 4, state: 'live' }]));
    core.download.mockRejectedValueOnce({ kind: 'unavailable', status: 503, code: 'DISPLAY_NOT_AVAILABLE' });
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.gone', { n: '4', computer: 'atlas' }));
    expect(files(p)).toHaveLength(0);
    expect(core.download).toHaveBeenCalledTimes(1);
    core.download.mockResolvedValueOnce(png());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['agent.shot.again'] })); });
    await settle();
    expect(core.download).toHaveBeenCalledTimes(2);
    expect(core.api).toHaveBeenCalledTimes(1);
    expect(files(p)).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    [{ kind: 'unreachable', status: 0, code: 'TIMEOUT' }, say('agent.shot.unreachable', { computer: 'atlas' })],
    [{ kind: 'private', status: 403 }, say('agent.shot.private', { computer: 'atlas' })],
    [{ kind: 'not_sent', status: 0, code: 'TOKEN_LACKS' }, say('agent.shot.private', { computer: 'atlas' })],
    [{ kind: 'not_sent', status: 0, code: 'FRAMED_ACTION_REFUSED' }, say('agent.shot.framed')],
    [{ kind: 'too_large', status: 200 }, say('agent.shot.tooBig', { n: '1' })],
    [{ kind: 'unavailable', status: 500, code: 'SCREENSHOT_FAILED' }, say('agent.shot.failed', { n: '1', computer: 'atlas' })],
  ])('a capture rejected as %j reads in words', async (rejection, words) => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    core.download.mockRejectedValue(rejection);
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(words);
    expect(files(p)).toHaveLength(0);
  });

  it('an answer that is not a picture attaches nothing', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    core.download.mockResolvedValue({ parts: [new Blob(['<html>nope</html>'])], bytes: 17 });
    const { p } = mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.notImage', { n: '1' }));
    expect(files(p)).toHaveLength(0);
  });

  it('the displays cannot be read: said, with Try again reading them again', async () => {
    core.api.mockRejectedValueOnce({ kind: 'pending', status: 500 });
    mount();
    await press();
    await settle();
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.listFailed', { computer: 'atlas' }));
    expect(core.download).not.toHaveBeenCalled();
    core.api.mockResolvedValueOnce(runtime([]));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['agent.shot.again'] })); });
    await settle();
    expect(core.api).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toContain(say('agent.shot.none', { computer: 'atlas' }));
  });

  it.each([
    ['the message has its 4 images', { room: 0 }, say('agent.shot.full_other', { max: '4' })],
    ['the message has its images, by the host\'s own limit', { room: 0, max: 6 }, say('agent.shot.full_other', { max: '6' })],
    ['the chat\'s computer is not known, in the host\'s words', { target: null, noTarget: 'Where atlas runs is not known yet.' }, 'Where atlas runs is not known yet.'],
    ['the chat\'s computer is not shown here', { target: null }, strings['agent.shot.noComputer']],
    ['the chat takes no files now', { refused: 'This chat is closed.' }, 'This chat is closed.'],
  ] as const)('when %s the item is disabled with that reason and asks nothing', async (_n, over, reason) => {
    const { p } = mount({ screenshot: shot(over) });
    openMenu();
    expect(item().getAttribute('aria-disabled')).toBe('true');
    expect(item().textContent).toContain(reason);
    await act(async () => { fireEvent.click(item()); });
    await settle();
    expect(core.api).not.toHaveBeenCalled();
    expect(core.download).not.toHaveBeenCalled();
    expect(files(p)).toHaveLength(0);
  });

  it('a capture that ends after the chat changed adds nothing to the other chat', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    let done!: (v: unknown) => void;
    core.download.mockReturnValue(new Promise((r) => { done = r; }));
    const { p, rerender } = mount();
    await press();
    await settle();
    const signal = (core.download.mock.calls[0] as [unknown, { signal: AbortSignal }])[1].signal;
    rerender(<Composer {...p} screenshot={shot({ chat: 'chat-2' })} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { done(png()); });
    await settle();
    expect(files(p)).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a composer that leaves mid-capture ends the request', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    core.download.mockReturnValue(new Promise(() => {}));
    const { unmount } = mount();
    await press();
    await settle();
    const signal = (core.download.mock.calls[0] as [unknown, { signal: AbortSignal }])[1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('in a Hub shown inside another page the item is disabled with that reason, and the capture route is refused in a frame', async () => {
    core.framed = true;
    try {
      mount();
      openMenu();
      expect(item().getAttribute('aria-disabled')).toBe('true');
      expect(item().textContent).toContain(strings['agent.shot.framed']);
      await act(async () => { fireEvent.click(item()); });
      await settle();
      expect(core.api).not.toHaveBeenCalled();
      expect(core.download).not.toHaveBeenCalled();
    } finally { core.framed = false; }
    expect((shotRoutes.capture as { framed?: boolean }).framed).toBe(false);
  });
});
