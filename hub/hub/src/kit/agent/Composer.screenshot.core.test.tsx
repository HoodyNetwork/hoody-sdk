// The composer's screenshot item with the REAL core under it, on the fixture transport: what is sent, what is added, and what
// a realm switch, another chat, a frame or a hostile window title do. From the first code read (reader 1), kept as tests.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computerRuntimeRoute } from '../../core/computerRuntime';
import { bump } from '../../core/ctx';
import { answers, fixtureTransport, installTransport, reply, type FixtureRule } from '../../core/transport';
import { boot, R1, TARGET } from '../../core/test/env';
import { Composer, type ComposerProps, type ComposerScreenshot } from './Composer';
import { shotRoutes } from './displayShot';
import strings from './Conversation.strings.en.json';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const runtime = (displays: unknown[]) => answers.ok({ data: { runtime_info: { displays } } });
const shot = (o: Partial<ComposerScreenshot> = {}): ComposerScreenshot => ({ chat: 'chat-1', target: TARGET, computer: 'atlas', room: 4, max: 4, ...o });
function props(o: Partial<ComposerProps> = {}): ComposerProps {
  return {
    draft: 'x', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
    placeholder: 'Ask anything', max: 4000, canSend: true, onSend: vi.fn(), notes: [], attachments: [],
    onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(), screenshot: shot(), ...o,
  };
}
const sent: string[] = [];
function world(rules: FixtureRule[], framed = false) {
  boot({ realm: R1, framed });
  sent.length = 0;
  const ft = fixtureTransport(rules);
  installTransport({ ...ft, hoody: (...a) => { sent.push('list'); return ft.hoody(...a); }, fetch: (...a) => { sent.push('capture'); return ft.fetch(...a); } });
}
afterEach(() => { installTransport(null); });
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: strings['agent.add'] }));
const item = () => within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['agent.shot.item']) });
const press = async () => { openMenu(); await act(async () => { fireEvent.click(item()); }); };
const wait = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const files = (p: ComposerProps) => (p.onAddFiles as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as File[]);

describe('real core under the composer', () => {
  it('one live display: list, capture, one PNG File', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 2, state: 'live', windows: [] }, { display: 3, state: 'parked' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png'))]);
    const p = props();
    render(<Composer {...p} />);
    await press();
    await wait();
    expect(sent).toEqual(['list', 'capture']);
    expect(files(p)).toHaveLength(1);
    expect(files(p)[0]![0]!.type).toBe('image/png');
  });

  it('an HTML answer (200 text/html) adds nothing and says so', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live' }])), reply(shotRoutes.capture, answers.text('<html><body>login</body></html>'))]);
    const p = props();
    render(<Composer {...p} />);
    await press();
    await wait();
    expect(files(p)).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('picture');
  });

  it('a realm switch (generation bump) mid-capture: nothing added, nothing said', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png', 200))]);
    const p = props();
    render(<Composer {...p} />);
    await press();
    await wait(20);
    expect(sent).toEqual(['list', 'capture']);
    await act(async () => { bump('test'); });
    await wait(300);
    expect(files(p)).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the chat changes mid-capture: nothing added to either chat', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png', 150))]);
    const p = props();
    const r = render(<Composer {...p} />);
    await press();
    await wait(20);
    const other = vi.fn();
    r.rerender(<Composer {...p} onAddFiles={other} screenshot={shot({ chat: 'chat-2' })} />);
    await wait(300);
    expect(files(p)).toHaveLength(0);
    expect(other).not.toHaveBeenCalled();
  });

  it('the chat changes while the picker is open: the dialog closes, nothing captured', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live' }, { display: 2, state: 'live' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png'))]);
    const p = props();
    const r = render(<Composer {...p} />);
    await press();
    await wait();
    expect(screen.getByRole('dialog')).toBeTruthy();
    r.rerender(<Composer {...p} screenshot={shot({ chat: 'chat-2' })} />);
    await wait();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toEqual(['list']);
  });

  it('in a Hub shown inside another page the item is disabled with its reason: nothing is listed, nothing captured', async () => {
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png'))], true);
    const p = props();
    render(<Composer {...p} />);
    openMenu();
    expect(item().getAttribute('aria-disabled')).toBe('true');
    expect(item().textContent).toContain(strings['agent.shot.framed']);
    await act(async () => { fireEvent.click(item()); });
    await wait();
    expect(sent).toEqual([]);
    expect(files(p)).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: strings['agent.shot.pick.title'] })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a hostile window title is drawn as text without its direction override; Cancel closes the dialog', async () => {
    const title = '<img src=x onerror=alert(1)>\u202egnp.exe';
    world([reply(computerRuntimeRoute, runtime([{ display: 1, state: 'live', windows: [{ title }] }, { display: 2, state: 'live' }])), reply(shotRoutes.capture, answers.bytes(PNG, 'image/png'))]);
    const p = props();
    render(<Composer {...p} />);
    await press();
    await wait();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(dialog.textContent).not.toContain('\u202e');
    expect(within(dialog).getByRole('radiogroup').getAttribute('aria-label')).toBe('Display on atlas');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })); });
    await wait(60);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
