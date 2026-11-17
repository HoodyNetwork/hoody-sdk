// Vitest: the kit Composer is props only. Enter sends only when the host says canSend; the counter, notes,
// chips, Stop and the approval switch come from props; files from the add button, paste and drop go to onAddFiles.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, useRef, type ReactNode, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import { TalkBar, type TalkBarProps } from '../voice/TalkBar';
import strings from './Conversation.strings.en.json';

function mount(o: Partial<ComposerProps> = {}) {
  const p: ComposerProps = {
    draft: 'hello', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
    placeholder: 'Ask anything', max: 4000, canSend: true, onSend: vi.fn(), notes: [], attachments: [],
    onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(), ...o,
  };
  const r = render(<Composer {...p} />);
  return { p, ...r };
}
const box = () => screen.getByRole('textbox', { name: strings['agent.composer'] });

describe('Composer names its box', () => {
  it("without a label the box is the agent's; with one it takes the host's", () => {
    const r = mount();
    expect(box()).toBeInTheDocument();
    r.unmount();
    mount({ label: 'Message the Bot' });
    expect(screen.getByRole('textbox', { name: 'Message the Bot' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: strings['agent.composer'] })).toBeNull();
  });
});

describe('Composer notes that describe the box', () => {
  it('no describes: no link; describes: its id on the box; two describing notes: both ids', () => {
    const r = mount({ notes: [{ key: 'a', text: 'Only shown' }] });
    expect(box()).not.toHaveAttribute('aria-describedby');
    r.unmount();
    const r2 = mount({ notes: [{ key: 'a', text: 'Sending declines the waiting approval.', describes: true }, { key: 'b', text: 'Not linked' }] });
    expect(box()).toHaveAccessibleDescription('Sending declines the waiting approval.');
    r2.unmount();
    mount({ notes: [{ key: 'a', text: 'First note.', describes: true }, { key: 'b', text: 'Not linked' }, { key: 'c', text: 'Second note.', describes: true }] });
    const ids = (box().getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(['First note.', 'Second note.']);
    expect(box()).toHaveAccessibleDescription('First note. Second note.');
  });
});

const sendBtn = () => screen.getByRole('button', { name: new RegExp('^' + strings['agent.send']) }) as HTMLButtonElement;

describe('Composer sends', () => {
  it('Enter sends when the host allows it', () => {
    const { p } = mount();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(p.onSend).toHaveBeenCalledTimes(1);
  });
  it('Shift+Enter is a new line; Ctrl/Cmd+Enter sends; Enter during IME composition does not', () => {
    const { p } = mount();
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true, metaKey: true });
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true });
    expect(p.onSend).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(p.onSend).toHaveBeenCalledTimes(2);
  });
  it('the Enter that commits an IME composition in Safari (isComposing false, keyCode 229) does not send', () => {
    const { p } = mount();
    fireEvent.keyDown(box(), { key: 'Enter', keyCode: 229 });
    expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true, keyCode: 229 });
    expect(p.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(p.onSend).toHaveBeenCalledTimes(1);
  });
  it('without canSend neither Enter nor the button sends, and the button is disabled', () => {
    const { p } = mount({ canSend: false });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(sendBtn().disabled).toBe(true);
    fireEvent.click(sendBtn());
    expect(p.onSend).not.toHaveBeenCalled();
  });
  it('sendWhy is the reason it waits, not its name: Send keeps its name, is described by the reason, and stays focusable', () => {
    const { p } = mount({ canSend: false, sendWhy: 'Sends when the computer is ready' });
    const b = screen.getByRole('button', { name: new RegExp('^' + strings['agent.send'] + '$') }) as HTMLButtonElement;
    expect(b).toHaveAccessibleDescription('Sends when the computer is ready');
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(p.onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Sends when the computer is ready/ })).toBeNull();
  });
  it('after a send the focus is on the draft box, whichever control sent (Send disables when the draft clears)', () => {
    const { p } = mount();
    sendBtn().focus();
    fireEvent.click(sendBtn());
    expect(p.onSend).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(box());
  });
});

describe('Composer counter', () => {
  it('shows from 90 % of max and never below', () => {
    const { rerender, p } = mount({ draft: 'x'.repeat(3599) });
    expect(screen.queryByText(/ \/ /)).toBeNull();
    rerender(<Composer {...p} draft={'x'.repeat(3600)} />);
    expect(screen.getByText(/3,600 \/ 4,000/)).toBeTruthy();
  });
  it('turns red past max (.bad comes after .counter in source order)', () => {
    const { rerender, p } = mount({ draft: 'x'.repeat(4000) });
    expect(screen.getByText(/4,000 \/ 4,000/).className).not.toMatch(/bad/);
    rerender(<Composer {...p} draft={'x'.repeat(4001)} />);
    expect(screen.getByText(/4,001 \/ 4,000/).className).toMatch(/bad/);
  });
  it('counts code points, not UTF-16 units, and ignores the context marker', () => {
    mount({ draft: '😀'.repeat(3600) });
    expect(screen.getByText(/3,600 \/ 4,000/)).toBeTruthy();
  });
});

describe('Composer notes, chips, Stop and the approval switch', () => {
  it('notes keep their role and tone; an array is one block of lines', () => {
    mount({
      notes: [
        { key: 'a', text: 'plain note' },
        { key: 'b', text: 'warn note', warn: true, status: true, end: <button type="button">Fix</button> },
        { key: 'c', text: ['one', 'two'], warn: true, status: true },
      ],
    });
    expect(screen.getByText('plain note').getAttribute('role')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Fix' })).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getByText('two')).toBeTruthy();
  });
  it('a note with an error shows its Details beside the sentence; one without shows none', () => {
    mount({ notes: [{ key: 'e', text: 'Could not do it', warn: true, error: { status: 422, code: 'bad_request' } }, { key: 'n', text: 'Plain note' }] });
    const e = screen.getByText('Could not do it').closest('p') as HTMLElement;
    expect(within(e).getByRole('button', { name: 'Details' })).toBeTruthy();
    expect(within(screen.getByText('Plain note').closest('p') as HTMLElement).queryByRole('button', { name: 'Details' })).toBeNull();
  });
  it('a note without an error draws a plain paragraph with its text and end, no Details', () => {
    mount({ notes: [{ key: 'a', text: 'plain note' }, { key: 'b', text: 'with end', end: <b>x</b> }] });
    expect((screen.getByText('plain note') as HTMLElement).outerHTML).toBe(`<p class="${(screen.getByText('plain note') as HTMLElement).className}">plain note</p>`);
    expect((screen.getByText('with end').closest('p') as HTMLElement).innerHTML).toBe('<span>with end</span><b>x</b>');
  });
  it('a block of lines with an error shows its Details too; error null changes nothing', () => {
    mount({ notes: [{ key: 'l', text: ['one', 'two'], error: { status: 422, code: 'bad_request' } }, { key: 'm', text: 'null error', error: null }] });
    expect(within(screen.getByText('one').closest('div') as HTMLElement).getByRole('button', { name: 'Details' })).toBeTruthy();
    expect((screen.getByText('null error').closest('p') as HTMLElement).innerHTML).toBe('null error');
  });
  it('a chip has a remove button that names the file', () => {
    const { p } = mount({ attachments: [{ id: 'f1', kind: 'text', name: 'ci.log', meta: '2 lines' }] });
    fireEvent.click(screen.getByRole('button', { name: strings['agent.attRemove'].replace('{{name}}', 'ci.log') }));
    expect(p.onRemoveAttachment).toHaveBeenCalledWith('f1');
  });
  it('Stop shows only when the host passes it and is disabled while it is stopping', () => {
    const onPress = vi.fn();
    const { rerender, p } = mount();
    expect(screen.queryByRole('button', { name: strings['agent.stop'] })).toBeNull();
    rerender(<Composer {...p} stop={{ busy: false, onPress }} />);
    fireEvent.click(screen.getByRole('button', { name: strings['agent.stop'] }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Composer {...p} stop={{ busy: true, onPress }} />);
    // Busy, not disabled: the Stop that was pressed keeps focus and refuses a second press.
    const stop = screen.getByRole('button', { name: new RegExp(strings['agent.stop']) }) as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    expect(stop.getAttribute('aria-disabled')).toBe('true');
    stop.focus();
    expect(document.activeElement).toBe(stop);
    fireEvent.click(stop);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('the approval switch: absent without the prop; "Not known" for null; "On" when armed', () => {
    const onChange = vi.fn();
    const { rerender, p } = mount();
    expect(screen.queryByRole('switch')).toBeNull();
    rerender(<Composer {...p} auto={{ shown: null, busy: false, onChange }} />);
    expect(screen.getByText(strings['agent.autoNotKnown'])).toBeTruthy();
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    rerender(<Composer {...p} auto={{ shown: true, busy: false, onChange }} />);
    expect(screen.getByText(strings['agent.autoOn'])).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("the host's tools sit in the action row after the add button; its panel sits inside the box under that row; absent, nothing is drawn", () => {
    const { rerender, p, container } = mount();
    expect(container.querySelector('[data-t="tools"], [data-t="below"]')).toBeNull();
    rerender(<Composer {...p} tools={<button type="button" data-t="tools">Model</button>} below={<div data-t="below">Options</div>} />);
    const tools = container.querySelector('[data-t="tools"]')!, below = container.querySelector('[data-t="below"]')!;
    const add = screen.getByRole('button', { name: strings['agent.attach'] });
    // Same row as the add button, after it.
    expect(tools.parentElement).toBe(add.parentElement);
    expect(add.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Inside the box that holds the text field, right after the row that holds Send.
    const row = add.parentElement!.parentElement!;
    expect(row.contains(sendBtn())).toBe(true);
    expect(row.nextElementSibling).toBe(below);
    expect(row.parentElement!.contains(box())).toBe(true);
  });
});

describe('Composer files', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' });
  it('a pasted file goes to onAddFiles and is not pasted as text; a copy with text pastes as text', () => {
    const { p } = mount();
    fireEvent.paste(box(), { clipboardData: { files: [file], types: ['Files'] } });
    expect(p.onAddFiles).toHaveBeenCalledWith([file]);
    fireEvent.paste(box(), { clipboardData: { files: [file], types: ['text/plain', 'Files'] } });
    expect(p.onAddFiles).toHaveBeenCalledTimes(1);
  });
  it('a dropped file goes to onAddFiles; other drags are left alone', () => {
    const { p, container } = mount();
    const wrap = container.firstElementChild as HTMLElement;
    fireEvent.drop(wrap, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(p.onAddFiles).not.toHaveBeenCalled();
    fireEvent.drop(wrap, { dataTransfer: { types: ['Files'], files: [file] } });
    expect(p.onAddFiles).toHaveBeenCalledWith([file]);
  });
  it('the add button opens the file picker, whose pick goes to onAddFiles', () => {
    const { p, container } = mount();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: strings['agent.attach'] }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    expect(p.onAddFiles).toHaveBeenCalledWith([file]);
  });
});

describe('Composer typing', () => {
  it('reports typing on input and focus-with-text, and not typing on blur', () => {
    const { p } = mount();
    fireEvent.focus(box());
    expect(p.onTyping).toHaveBeenLastCalledWith(true);
    fireEvent.blur(box());
    expect(p.onTyping).toHaveBeenLastCalledWith(false);
  });
  // The window losing focus blurs the field but keeps it the active element (:2537): typing stays, so a gate arriving
  // meanwhile does not take focus. jsdom always reports focus, so away is document.hasFocus() false.
  const back = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); await new Promise((r) => setTimeout(r, 0)); }); };
  it('keeps typing on a blur while the window is away, and keeps it on return when focus comes back to the field [:2537]', async () => {
    const { p } = mount();
    act(() => { box().focus(); });
    fireEvent.input(box(), { target: { value: 'hello there' } });
    const away = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      fireEvent.blur(box());
      expect(p.onTyping).toHaveBeenLastCalledWith(true);
      away.mockReturnValue(true);
      await back();
      expect(p.onTyping).toHaveBeenLastCalledWith(true);
    } finally { away.mockRestore(); }
  });
  it('ends typing on return when focus did not come back to the field, so the kept flag never sticks [:2537]', async () => {
    const { p } = mount();
    act(() => { box().focus(); });
    fireEvent.input(box(), { target: { value: 'hello there' } });
    const away = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      act(() => { box().blur(); }); // focus left the field while away
      expect(p.onTyping).toHaveBeenLastCalledWith(true);
      away.mockReturnValue(true);
      await back();
      expect(p.onTyping).toHaveBeenLastCalledWith(false);
    } finally { away.mockRestore(); }
  });
});

describe('Composer sendMenu: other ways to send, beside Send', () => {
  const menuBtn = () => screen.queryByRole('button', { name: strings['agent.sendMenu'] });
  it('nothing shows without it, or with no items', () => {
    mount();
    expect(menuBtn()).toBeNull();
    mount({ sendMenu: [] });
    expect(menuBtn()).toBeNull();
  });
  it('its items run the host\'s action; a disabled one says why and does nothing', async () => {
    const go = vi.fn(), off = vi.fn();
    mount({ sendMenu: [
      { id: 'a', label: 'Auto-approve this reply', description: 'Its approvals are answered yes', onAction: go },
      { id: 'b', label: 'Other way', isDisabled: true, disabledReason: 'Not now', onAction: off },
    ] });
    await act(async () => { fireEvent.click(menuBtn()!); });
    const off1 = screen.getByRole('menuitem', { name: /Other way/ });
    expect(off1.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Not now')).toBeTruthy();
    await act(async () => { fireEvent.click(off1); });
    expect(off).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /Auto-approve this reply/ })); });
    expect(go).toHaveBeenCalledTimes(1);
  });
  it('Send itself is unchanged: it still sends the draft', () => {
    const { p } = mount({ sendMenu: [{ id: 'a', label: 'Auto-approve this reply', onAction: vi.fn() }] });
    fireEvent.click(sendBtn());
    expect(p.onSend).toHaveBeenCalledTimes(1);
  });
});

// Talk's three slots. `mic` sits just before Send while Talk is off; `talk` takes the
// action row while Talk is on (the draft box stays, Enter still sends, the counter stays); `captions` show above the box
// only with `talk`. The plain-composer cases pin the DOM a host without the slots draws.
/** The composer's DOM with React's generated ids replaced, so the same render reads the same whatever ran before. */
function dom(el: Element): string {
  const ids = new Map<string, string>();
  const id = (v: string) => { if (!ids.has(v)) ids.set(v, `id${ids.size}`); return ids.get(v)!; };
  return el.innerHTML
    .replace(/(id|for|aria-describedby|aria-labelledby|aria-controls)="([^"]*)"/g, (_m, k: string, v: string) => `${k}="${v.split(' ').map(id).join(' ')}"`)
    .replace(/></g, '>\n<');
}
/** What the composer draws without the voice slots, as `dom` reads the two plain mounts below. */
const BEFORE_PLAIN = String.raw`<div class="composerWrap">
<div class="composer">
<textarea class="input" rows="1" placeholder="Ask anything" aria-label="Message to your agent" style="height: 0px;">hello</textarea>
<input class="attFile" multiple="" tabindex="-1" aria-hidden="true" type="file">
<div class="actionRow">
<span class="actionStart">
<button class="button iconOnly ghost sm" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" aria-label="Add images (up to 4, 4 MB each) or text files (up to 24 KB)" id="id0">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M12 4v16M4 12h16">
</path>
</svg>
</button>
</span>
<span class="actionEnd">
<button class="button iconOnly primary md" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" aria-label="Send" id="id1">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M12 20V4M5 11l7-7 7 7">
</path>
</svg>
</button>
</span>
</div>
</div>
</div>`;
const BEFORE_FULL = String.raw`<div class="composerWrap">
<p class="composerNote warnText" role="status">A note</p>
<div class="composer">
<ul class="attList" aria-label="Files with this message">
<li class="attChip">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M3 5h7l2 2h9v12H3z">
</path>
</svg>
<span class="attText">
<span class="attName">a.txt</span>
<span class="attMeta">1 line</span>
</span>
<button class="button iconOnly ghost sm" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" aria-label="Remove a.txt" id="id0">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M5 5l14 14M19 5 5 19">
</path>
</svg>
</button>
</li>
</ul>
<textarea class="input" rows="1" placeholder="Ask anything" aria-label="Message to your agent" style="height: 0px;">xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</textarea>
<input class="attFile" multiple="" tabindex="-1" aria-hidden="true" type="file">
<div class="actionRow">
<span class="actionStart">
<button class="button iconOnly ghost sm" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" aria-label="Add images (up to 4, 4 MB each) or text files (up to 24 KB)" id="id1">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M12 4v16M4 12h16">
</path>
</svg>
</button>
<span class="autoWrap autoArmed">
<div class="switchRow autoChip">
<label data-react-aria-pressable="true" class="switch" data-rac="" data-selected="true">
<span style="border: 0px; clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; padding: 0px; position: absolute; width: 1px; white-space: nowrap;">
<input data-react-aria-pressable="true" tabindex="0" role="switch" type="checkbox" checked="">
</span>
<span class="track" aria-hidden="true">
<span class="thumb">
</span>
</span>
<span class="switchLabel" title="Allow everything">Allow everything</span>
</label>
</div>
<span class="autoOn">On</span>
</span>
<span>tools</span>
</span>
<span class="actionEnd">
<span class="counter">3,700 / 4,000</span>
<button data-variant="secondary" data-glyph="" data-words="" class="button secondary sm" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" id="id2">
<span class="label" data-btn-label="">Stop</span>
<span class="glyph" aria-hidden="true" data-glyph-mark="">
<svg viewBox="0 0 24 24" width="14" height="14" class="px pxSmooth stroke" aria-hidden="true" focusable="false" data-px="arrow" data-px-mirror="">
<path d="m9 5 7 7-7 7">
</path>
</svg>
</span>
</button>
<button class="button iconOnly primary md" data-rac="" type="button" tabindex="0" data-react-aria-pressable="true" aria-label="Send" id="id3">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="M12 20V4M5 11l7-7 7 7">
</path>
</svg>
</button>
<button class="button iconOnly ghost sm" data-rac="" type="button" tabindex="0" aria-haspopup="true" aria-expanded="false" id="id4" data-react-aria-pressable="true" aria-label="More ways to send">
<svg viewBox="0 0 24 24" class="icon md stroke" aria-hidden="true" focusable="false">
<path d="m5 9 7 7 7-7">
</path>
</svg>
</button>
</span>
</div>
<span>below</span>
</div>
</div>`;
// Runs `run` once while it renders: a focus change between Composer's render and the commit, as a concurrent yield allows.
function Between({ run, children }: { run: () => void; children: ReactNode }) {
  const done = useRef(false);
  if (!done.current) { done.current = true; run(); }
  return <div role="group" aria-label="Talk">{children}</div>;
}

describe('Composer voice slots', () => {
  it('without the voice props it draws the plain composer', () => {
    const { container } = mount();
    expect(dom(container)).toBe(BEFORE_PLAIN);
  });
  it('without the voice props it draws the composer with every other slot in use', () => {
    const { container } = mount({
      draft: 'x'.repeat(3700), notes: [{ key: 'n', text: 'A note', warn: true, status: true }],
      attachments: [{ id: 'a', kind: 'text', name: 'a.txt', meta: '1 line' }], stop: { busy: false, onPress: vi.fn() },
      auto: { shown: true, busy: false, onChange: vi.fn() }, tools: <span>tools</span>, below: <span>below</span>,
      sendMenu: [{ id: 'm', label: 'Other', onAction: vi.fn() }],
    });
    expect(dom(container)).toBe(BEFORE_FULL);
  });
  it('talk null is Talk off: the plain composer, captions not drawn', () => {
    const { container } = mount({ talk: null, captions: <div role="group" aria-label="Captions" /> });
    expect(dom(container)).toBe(BEFORE_PLAIN);
  });
  it('the mic sits in the action row just before Send, after Stop', () => {
    mount({ mic: <button type="button">Mic</button>, stop: { busy: false, onPress: vi.fn() } });
    const mic = screen.getByRole('button', { name: 'Mic' });
    const send = sendBtn();
    const stop = screen.getByRole('button', { name: strings['agent.stop'] });
    expect(mic.parentElement).toBe(send.parentElement);
    expect(mic.nextElementSibling).toBe(send);
    expect(stop.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('while Talk is on its bar takes the action row: no Send, add, approval switch, tools, Stop or send menu; the draft box stays reachable', () => {
    mount({
      talk: <div role="group" aria-label="Talk" />, stop: { busy: false, onPress: vi.fn() },
      auto: { shown: false, busy: false, onChange: vi.fn() }, tools: <span>tools</span>, below: <span>below</span>,
      sendMenu: [{ id: 'm', label: 'Other', onAction: vi.fn() }],
    });
    expect(screen.getByRole('group', { name: 'Talk' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp('^' + strings['agent.send']) })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['agent.attach'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['agent.stop'] })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: strings['agent.sendMenu'] })).toBeNull();
    expect(screen.queryByText('tools')).toBeNull();
    // The host's panel under the row is not part of the row.
    expect(screen.getByText('below')).toBeInTheDocument();
    const b = box() as HTMLTextAreaElement;
    expect(b.disabled).toBe(false);
    expect(b.tabIndex).not.toBe(-1);
  });
  it('while Talk is on, Enter still sends the draft when the host allows it, and only then', () => {
    const { p } = mount({ talk: <div role="group" aria-label="Talk" /> });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(p.onSend).toHaveBeenCalledTimes(1);
    const q = mount({ talk: <div role="group" aria-label="Talk 2" />, canSend: false });
    fireEvent.keyDown(within(q.container).getByRole('textbox'), { key: 'Enter' });
    expect(q.p.onSend).not.toHaveBeenCalled();
  });
  it('the mic is not drawn while Talk is on', () => {
    mount({ mic: <button type="button">Mic</button>, talk: <div role="group" aria-label="Talk" /> });
    expect(screen.queryByRole('button', { name: 'Mic' })).toBeNull();
  });
  it('captions show with Talk, after the notes and above the box', () => {
    const { container } = mount({
      notes: [{ key: 'n', text: 'A note' }], talk: <div role="group" aria-label="Talk" />,
      captions: <div role="group" aria-label="Captions" />,
    });
    const cap = screen.getByRole('group', { name: 'Captions' });
    const note = screen.getByText('A note');
    expect(note.compareDocumentPosition(cap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cap.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.contains(cap)).toBe(true);
  });
  it('captions without Talk are not drawn', () => {
    mount({ captions: <div role="group" aria-label="Captions" /> });
    expect(screen.queryByRole('group', { name: 'Captions' })).toBeNull();
  });
  it('the counter stays while Talk is on, from 90 % of max, red past it', () => {
    const talk = <div role="group" aria-label="Talk" />;
    const { rerender, p } = mount({ draft: 'x'.repeat(3599), talk });
    expect(screen.queryByText(/ \/ /)).toBeNull();
    rerender(<Composer {...p} draft={'x'.repeat(3600)} />);
    expect(screen.getByText(/3,600 \/ 4,000/).className).not.toMatch(/bad/);
    rerender(<Composer {...p} draft={'x'.repeat(4001)} />);
    expect(screen.getByText(/4,001 \/ 4,000/).className).toMatch(/bad/);
  });
  it('talk false (the `on && <TalkBar/>` form) is Talk off; mic false and captions false draw nothing', () => {
    const { container } = mount({ talk: false, mic: false, captions: false });
    expect(dom(container)).toBe(BEFORE_PLAIN);
    const q = mount({ talk: false, captions: <div role="group" aria-label="Captions" /> });
    expect(within(q.container).queryByRole('group', { name: 'Captions' })).toBeNull();
    expect(within(q.container).getByRole('button', { name: new RegExp('^' + strings['agent.send']) })).toBeInTheDocument();
  });
  it('the row swap moves focus it removed: Mic in -> the Talk row\'s first control; End out -> the draft box', () => {
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    const mic = screen.getByRole('button', { name: 'Mic' });
    mic.focus();
    expect(document.activeElement).toBe(mic);
    rerender(<Composer {...p} talk={<div role="group" aria-label="Talk"><button type="button">Hold</button><button type="button">End</button></div>} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hold' }));
    // A move inside the row (Hold -> End) keeps the row holding focus.
    screen.getByRole('button', { name: 'End' }).focus();
    rerender(<Composer {...p} talk={null} />);
    expect(document.activeElement).toBe(box());
  });
  it('the row swap leaves focus alone when it is on something the swap did not remove', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
      outside.focus();
      rerender(<Composer {...p} talk={<div role="group" aria-label="Talk"><button type="button">Hold</button></div>} />);
      expect(document.activeElement).toBe(outside);
      box().focus();
      rerender(<Composer {...p} talk={null} />);
      expect(document.activeElement).toBe(box());
      rerender(<Composer {...p} talk={<div role="group" aria-label="Talk"><button type="button">Hold</button></div>} />);
      expect(document.activeElement).toBe(box());
    } finally {
      outside.remove();
    }
  });
  it('while Talk is on, Send\'s waiting reason and the armed approval mark stay visible; unarmed, no mark', () => {
    const talk = <div role="group" aria-label="Talk" />;
    const a = mount({ talk, canSend: false, sendWhy: 'Sends when the computer is ready', auto: { shown: true, busy: false, onChange: vi.fn() } });
    expect(within(a.container).getByText('Sends when the computer is ready')).toBeInTheDocument();
    expect(within(a.container).getByText(strings['agent.autoOn'])).toBeInTheDocument();
    expect(within(a.container).getByText(strings['agent.auto'])).toBeInTheDocument();
    // Unarmed, with something else in that place (the waiting reason): still no mark.
    const b = mount({ talk, canSend: false, sendWhy: 'Waiting', auto: { shown: false, busy: false, onChange: vi.fn() } });
    expect(within(b.container).getByText('Waiting')).toBeInTheDocument();
    expect(within(b.container).queryByText(strings['agent.autoOn'])).toBeNull();
    expect(within(b.container).queryByText(strings['agent.auto'])).toBeNull();
  });
  it('focus that was not in the outgoing row is never moved: nothing focused stays nothing focused, both ways', () => {
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    rerender(<Composer {...p} talk={<div role="group" aria-label="Talk"><button type="button">Hold</button></div>} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Composer {...p} talk={null} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('with the real TalkBar: Mic -> its Starting band (End never takes focus) puts focus on the draft box, and Live later does not take it', () => {
    const fn = vi.fn();
    const bar = (phase: TalkBarProps['phase']) => (
      <TalkBar phase={phase} mode="ptt" mic="ptt-idle" handsFree={false} level={0} canStopAnswer={false} canStopSpeaking={false} stopping={false}
        inputs={[]} outputs={[]} canChooseOutput={false} onPttDown={fn} onPttUp={fn} onMode={fn} onMute={fn} onUnmute={fn} onStopAnswer={fn}
        onStopSpeaking={fn} onEnd={fn} onInput={fn} onOutput={fn} onRetry={fn} onTryAnyway={fn} onTakeOver={fn} onOpenSettings={fn} onEnableSound={fn} />
    );
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    screen.getByRole('button', { name: 'Mic' }).focus();
    rerender(<Composer {...p} talk={bar('starting')} />);
    expect(screen.getByRole('button', { name: 'End' })).toBeTruthy();
    expect(document.activeElement).toBe(box());
    rerender(<Composer {...p} talk={bar('live')} />);
    expect(document.activeElement).toBe(box());
  });
  it('focus that leaves the row after Composer has drawn, before the swap commits, is not brought back', () => {
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    const mic = screen.getByRole('button', { name: 'Mic' });
    mic.focus();
    // The Talk row draws after Composer in the same pass: the person leaves the Mic between Composer's render and the commit.
    rerender(<Composer {...p} talk={<Between run={() => mic.blur()}><button type="button">Hold</button></Between>} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('focus that enters the row after Composer has drawn, before the swap commits, is moved like any other', () => {
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    const mic = screen.getByRole('button', { name: 'Mic' });
    expect(document.activeElement).toBe(document.body);
    rerender(<Composer {...p} talk={<Between run={() => mic.focus()}><button type="button">Hold</button></Between>} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hold' }));
  });
  it('after a swap moved focus out of the row, the row no longer counts as holding it', () => {
    const talk = <div role="group" aria-label="Talk"><button type="button">End</button></div>;
    const { rerender, p } = mount({ talk });
    screen.getByRole('button', { name: 'End' }).focus();
    rerender(<Composer {...p} talk={null} />);
    expect(document.activeElement).toBe(box());
    box().blur();
    rerender(<Composer {...p} talk={talk} />);
    expect(document.activeElement).toBe(document.body);
  });
  it('a Talk row that takes focus itself keeps it: the swap moves only focus that fell to the page', () => {
    const { rerender, p } = mount({ mic: <button type="button">Mic</button> });
    screen.getByRole('button', { name: 'Mic' }).focus();
    // eslint-disable-next-line jsx-a11y/no-autofocus
    rerender(<Composer {...p} talk={<div role="group" aria-label="Talk"><button type="button">Hold</button><button type="button" autoFocus>End</button></div>} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'End' }));
  });
});
