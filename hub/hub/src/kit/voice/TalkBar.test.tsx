// kit/voice TalkBar, CaptionStrip, MicButton: hold to talk pairs every
// down with one up (pointer, keys, cancel, blur, unmount), hands-free needs echo cancellation, Stop speaking only when
// allowed, Escape and the page keys, every phase's band and its way on, captions announced only when final.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptionStrip } from './CaptionStrip';
import { MicButton, useMicAction } from './MicButton';
import { TalkBar, useTalkShortcuts, type TalkBarProps, type TalkShortcuts } from './TalkBar';
import type { Phase } from './machine';
import strings from './Voice.strings.en.json';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function props(over: Partial<TalkBarProps> = {}): TalkBarProps {
  const fn = () => vi.fn();
  return {
    phase: 'live', mode: 'ptt', mic: 'ptt-idle', handsFree: true, level: 0.4, canStopAnswer: false, canStopSpeaking: false, stopping: false,
    inputs: [{ id: 'm1', label: 'Desk mic' }], input: 'm1', outputs: [{ id: 's1', label: 'Headphones' }], output: 's1', canChooseOutput: true,
    onPttDown: fn(), onPttUp: fn(), onMode: fn(), onMute: fn(), onUnmute: fn(), onStopAnswer: fn(), onStopSpeaking: fn(), onEnd: fn(),
    onInput: fn(), onOutput: fn(), onRetry: fn(), onTryAnyway: fn(), onTakeOver: fn(), onOpenSettings: fn(), onEnableSound: fn(),
    ...over,
  };
}
const hold = () => screen.getByRole('button', { name: strings['hold.idle'] });

// Physical input as browsers send it: a mouse is 1x1 with pressure 0.5 while down, keys carry `code`.
const P = { pointerId: 5, button: 0, buttons: 1, isPrimary: true, pointerType: 'mouse', width: 1, height: 1, pressure: 0.5 };
const pd = (el: Element, o: Partial<typeof P> & { detail?: number } = {}) => fireEvent.pointerDown(el, { ...P, ...o });
const pu = (el: Element, o: Partial<typeof P> = {}) => fireEvent.pointerUp(el, { ...P, buttons: 0, pressure: 0, ...o });
const pm = (el: Element, o: Partial<typeof P> = {}) => fireEvent.pointerMove(el, { ...P, ...o });
const SPACE = { key: ' ', code: 'Space' };
const ENTER = { key: 'Enter', code: 'Enter' };
const NUM_ENTER = { key: 'Enter', code: 'NumpadEnter' };
// A virtual pointer (iOS VoiceOver's shape off Android): zero size, no pressure.
const VIRTUAL = { width: 0, height: 0, pressure: 0 };
const calls = (p: TalkBarProps) => [vi.mocked(p.onPttDown).mock.calls.length, vi.mocked(p.onPttUp).mock.calls.length];
const onAndroid = () => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
const clickOf = (o: PointerEventInit & { trusted?: boolean } = {}) => {
  const e = new PointerEvent('click', { bubbles: true, cancelable: true, ...o });
  if (o.trusted) Object.defineProperty(e, 'isTrusted', { value: true });
  return e;
};

describe('hold to talk', () => {
  it('pointer down sends down once, release sends up once', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ keys: '[/MouseLeft]', target: hold() });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('Space and Enter held on the focused control talk, and their release sends', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    hold().focus();
    await u.keyboard('[Space>]');
    expect(calls(p)).toEqual([1, 0]);
    await u.keyboard('[/Space]');
    expect(calls(p)).toEqual([1, 1]);
    await u.keyboard('[Enter>]');
    expect(calls(p)).toEqual([2, 1]);
    await u.keyboard('[/Enter]');
    expect(calls(p)).toEqual([2, 2]);
  });

  it('the activation keys never make the browser click: their downs and ups are prevented, repeats too; Escape is not', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    for (const k of [SPACE, ENTER, NUM_ENTER]) {
      expect(fireEvent.keyDown(hold(), k)).toBe(false);
      expect(fireEvent.keyDown(hold(), { ...k, repeat: true })).toBe(false);
      expect(fireEvent.keyUp(hold(), k)).toBe(false);
    }
    expect(fireEvent.keyDown(hold(), { key: 'Escape', code: 'Escape' })).toBe(true);
    expect(calls(p)).toEqual([3, 3]);
  });

  it('a cancelled pointer releases', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    expect(calls(p)).toEqual([1, 0]);
    fireEvent.pointerCancel(document.body, { pointerId: 5 });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a key tapped while the pointer holds ends nothing; the release of that pointer does', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    await u.keyboard(' ');
    await u.keyboard('{Enter}');
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ keys: '[/MouseLeft]', target: hold() });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('the capture is taken before the down and still held after the whole pointerdown, on the label too', () => {
    const order: string[] = [];
    const p = props({ onPttDown: vi.fn(() => order.push('down')) });
    render(<TalkBar {...p} />);
    const set = HTMLElement.prototype.setPointerCapture;
    const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(function (this: HTMLElement, id: number) {
      order.push('capture');
      set.call(this, id);
    });
    const lose = vi.spyOn(HTMLElement.prototype, 'releasePointerCapture');
    pd(hold().querySelector('span') ?? hold());
    expect(order).toEqual(['capture', 'down']);
    expect(capture.mock.contexts[0]).toBe(hold());
    expect(hold().hasPointerCapture(5)).toBe(true);
    expect(lose).not.toHaveBeenCalled();
    pu(document.body);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('no capture, no hold: a capture that throws sends nothing, nor does one that did not take', () => {
    const p = props();
    render(<TalkBar {...p} />);
    const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('gone', 'NotFoundError');
    });
    pd(hold());
    pu(document.body);
    expect(calls(p)).toEqual([0, 0]);
    capture.mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'hasPointerCapture').mockReturnValue(false);
    pd(hold());
    pu(document.body);
    expect(calls(p)).toEqual([0, 0]);
    // The physical click after either is no tap.
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([0, 0]);
    // A capture call that throws is no hold even where the pointer reads as captured (an earlier capture of it).
    capture.mockImplementation(() => {
      throw new DOMException('gone', 'InvalidStateError');
    });
    vi.mocked(HTMLElement.prototype.hasPointerCapture).mockReturnValue(true);
    pd(hold());
    pu(document.body);
    expect(calls(p)).toEqual([0, 0]);
  });

  it('losing the capture is a cancel (one up); another pointer losing its own is nothing', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    fireEvent(document.body, new PointerEvent('lostpointercapture', { pointerId: 9, bubbles: true }));
    expect(calls(p)).toEqual([1, 0]);
    fireEvent(hold(), new PointerEvent('lostpointercapture', { pointerId: 5, bubbles: true }));
    expect(calls(p)).toEqual([1, 1]);
    pu(document.body);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a chord: left down, right down, left up ends the hold at the left up; the right up adds nothing', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pm(document.body, { buttons: 1 });
    pm(document.body, { buttons: 3 });
    expect(calls(p)).toEqual([1, 0]);
    pm(document.body, { buttons: 2 });
    expect(calls(p)).toEqual([1, 1]);
    pu(document.body, { buttons: 0 });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a pen: tip down, barrel pressed, tip lifted ends it; moving never starts one', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pm(hold(), { pointerType: 'pen', pointerId: 8, buttons: 1 });
    expect(calls(p)).toEqual([0, 0]);
    pd(hold(), { pointerType: 'pen', pointerId: 8 });
    pm(document.body, { pointerType: 'pen', pointerId: 8, buttons: 3 });
    expect(calls(p)).toEqual([1, 0]);
    pm(document.body, { pointerType: 'pen', pointerId: 8, buttons: 2 });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('tabbing away while a key holds is a cancel (one up); its keyup elsewhere sends nothing', () => {
    const p = props();
    render(<><TalkBar {...p} /><input aria-label="after" /></>);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    expect(calls(p)).toEqual([1, 0]);
    act(() => screen.getByRole('textbox', { name: 'after' }).focus());
    expect(calls(p)).toEqual([1, 1]);
    fireEvent.keyUp(screen.getByRole('textbox', { name: 'after' }), SPACE);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a second key while a key holds changes nothing: Space down, Enter down, Space up ends it', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    fireEvent.keyDown(hold(), ENTER);
    expect(calls(p)).toEqual([1, 0]);
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([1, 1]);
    fireEvent.keyUp(hold(), ENTER);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('Enter and NumpadEnter are two keys: the one that did not start the hold never ends it, in either order', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), ENTER);
    fireEvent.keyDown(hold(), NUM_ENTER);
    fireEvent.keyUp(hold(), NUM_ENTER);
    expect(calls(p)).toEqual([1, 0]);
    fireEvent.keyUp(hold(), ENTER);
    expect(calls(p)).toEqual([1, 1]);
    fireEvent.keyDown(hold(), NUM_ENTER);
    fireEvent.keyDown(hold(), ENTER);
    fireEvent.keyUp(hold(), ENTER);
    expect(calls(p)).toEqual([2, 1]);
    fireEvent.keyUp(hold(), NUM_ENTER);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('the control turning disabled mid-hold (the bar leaves live) is a cancel; nothing starts while disabled', () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    rerender(<TalkBar {...p} phase="muting" />);
    expect(calls(p)).toEqual([1, 1]);
    // The focus leaving the disabled control afterwards (React Aria's focus tracking may send one) adds nothing.
    fireEvent.focusOut(hold());
    fireEvent.keyUp(hold(), SPACE);
    pd(hold(), { pointerId: 7 });
    fireEvent.keyDown(hold(), ENTER);
    fireEvent.click(hold());
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a release by another pointer ends nothing', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(document.body, { pointerId: 9 });
    fireEvent.pointerCancel(document.body, { pointerId: 9 });
    pm(document.body, { pointerId: 9, buttons: 0 });
    expect(calls(p)).toEqual([1, 0]);
    pu(document.body);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('after a blur cancel, coming back with the pointer still down starts nothing; a new press does', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    act(() => { window.dispatchEvent(new Event('blur')); });
    await u.pointer({ target: document.body });
    await u.pointer({ target: hold() });
    expect(calls(p)).toEqual([1, 1]);
    await u.pointer({ keys: '[/MouseLeft]', target: hold() });
    expect(calls(p)).toEqual([1, 1]);
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    expect(calls(p)).toEqual([2, 1]);
    await u.pointer({ keys: '[/MouseLeft]', target: hold() });
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a held key repeating starts nothing more; a secondary mouse button starts nothing', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    fireEvent.keyDown(hold(), { ...SPACE, repeat: true });
    expect(calls(p)).toEqual([1, 0]);
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([1, 1]);
    // After a cancel the key still held keeps repeating: that is no new press.
    fireEvent.keyDown(hold(), SPACE);
    act(() => { window.dispatchEvent(new Event('blur')); });
    fireEvent.keyDown(hold(), { ...SPACE, repeat: true });
    expect(calls(p)).toEqual([2, 2]);
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([2, 2]);
    await u.pointer({ keys: '[MouseRight>]', target: hold() });
    await u.pointer({ keys: '[/MouseRight]', target: hold() });
    expect(calls(p)).toEqual([2, 2]);
  });

  it('an assistive activation with pointer precursors (VoiceOver) is one tap, sent at its click', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), VIRTUAL);
    pu(hold(), VIRTUAL);
    expect(calls(p)).toEqual([0, 0]);
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([1, 1]);
    // A MouseEvent click (no pointerId) after its precursor is the same one tap.
    pd(hold(), { ...VIRTUAL, pointerId: 6 });
    pu(hold(), { ...VIRTUAL, pointerId: 6 });
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a click with no physical down is one tap (switch access, VoiceOver without precursors, a program)', () => {
    const p = props();
    render(<TalkBar {...p} />);
    // A program or switch click as the engines send it (ev/probe-click): a PointerEvent with pointerId -1, detail 0.
    fireEvent(hold(), clickOf({ pointerId: -1, detail: 0 }));
    expect(calls(p)).toEqual([1, 1]);
    hold().click();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('one click Event is at most one tap; two click Events are two', () => {
    const p = props();
    render(<TalkBar {...p} />);
    const e = clickOf({ pointerId: -1, detail: 0 });
    fireEvent(hold(), e);
    fireEvent(hold(), e);
    expect(calls(p)).toEqual([1, 1]);
    fireEvent(hold(), clickOf({ pointerId: -1, detail: 0 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a click after a key release is its own activation: a .click() then is one tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([1, 1]);
    hold().click();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a click after a physical down is no tap even when it looks virtual (detail 0); nor is a click while a key holds', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(calls(p)).toEqual([1, 1]);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    hold().click();
    expect(calls(p)).toEqual([2, 1]);
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a physical click after a hold is never a tap, nor one while a hold runs', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(calls(p)).toEqual([1, 0]);
    pu(hold());
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([1, 1]);
    pd(hold());
    pu(hold());
    fireEvent(hold(), clickOf({ pointerId: 0, pointerType: '', detail: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a mouse click whose down this control never saw (pressed elsewhere) is no tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    fireEvent(hold(), clickOf({ pointerId: 1, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([0, 0]);
  });

  it('an ignored key or click during a pointer hold keeps that press\'s own click from becoming a tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    fireEvent.keyDown(hold(), SPACE);
    fireEvent.keyUp(hold(), SPACE);
    pu(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(calls(p)).toEqual([1, 1]);
    pd(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    pu(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a physical down the control ignored (a key holds it) still marks that press\'s own click: no tap after the key ends', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    pd(hold());
    fireEvent.keyUp(hold(), SPACE);
    pu(hold());
    fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a cancelled pointer leaves no record: a virtual sequence with the same pointerId later is one tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    fireEvent.pointerCancel(document.body, { pointerId: 5 });
    expect(calls(p)).toEqual([1, 1]);
    pd(hold(), VIRTUAL);
    pu(hold(), VIRTUAL);
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  // A press's own click is the click carrying that press's pointerId (every engine sends one, detail 1; a program,
  // key or AT click has pointerId -1). The fixtures below use detail 0 and no pointerType, so isVirtualClick alone
  // would tap them: only the pointerId tells them apart.
  const ownClick = (id = 5) => fireEvent(hold(), clickOf({ pointerId: id, detail: 0 }));
  const programClick = () => fireEvent(hold(), clickOf({ pointerId: -1, detail: 0 }));

  it('a program click between a press\'s release and its own click is its own tap; the press\'s click is still eaten', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    programClick();
    expect(calls(p)).toEqual([2, 2]);
    ownClick();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a chord ends at the primary release with no pointerup; the click then sent is the press\'s own', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pm(document.body, { buttons: 3 });
    pm(document.body, { buttons: 2 });
    expect(calls(p)).toEqual([1, 1]);
    ownClick();
    pu(document.body, { buttons: 0 });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('after any cancel, a new virtual sequence reusing the pointerId (mouse id 1) is one tap', () => {
    const p = props();
    const { rerender } = render(<><TalkBar {...p} /><input aria-label="after" /></>);
    const cancels: Array<[string, () => void]> = [
      ['blur', () => act(() => { window.dispatchEvent(new Event('blur')); })],
      ['pagehide', () => act(() => { window.dispatchEvent(new Event('pagehide')); })],
      ['focusout', () => act(() => screen.getByRole('textbox', { name: 'after' }).focus())],
      ['lost capture', () => fireEvent(hold(), new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))],
      ['mute', () => {
        rerender(<><TalkBar {...p} phase="muting" /><input aria-label="after" /></>);
        rerender(<><TalkBar {...p} /><input aria-label="after" /></>);
      }],
    ];
    let n = 0;
    for (const [name, cancel] of cancels) {
      hold().focus();
      pd(hold(), { pointerId: 1 });
      cancel();
      n += 1;
      expect(calls(p), name).toEqual([n, n]);
      pd(hold(), { ...VIRTUAL, pointerId: 1 });
      pu(hold(), { ...VIRTUAL, pointerId: 1 });
      fireEvent(hold(), clickOf({ pointerId: 1, pointerType: 'mouse', detail: 1 }));
      n += 1;
      expect(calls(p), name).toEqual([n, n]);
    }
  });

  it('a pointercancel ends the press\'s claim: a later virtual-shaped click with that id is its own tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    fireEvent.pointerCancel(document.body, { pointerId: 5 });
    expect(calls(p)).toEqual([1, 1]);
    ownClick();
    expect(calls(p)).toEqual([2, 2]);
  });

  // The boundary. A click that is not a PointerEvent taps through a virtual arm; with a press owed it is that press's
  // click once (trusted: ends the oldest record; untrusted: sets its one-shot latch); with nothing owed it is one tap.
  const legacyClick = () => fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
  const talkBackClick = (id: number) => fireEvent(hold(), clickOf({ pointerId: id, pointerType: 'mouse', detail: 1, buttons: 1 }));

  it('an id-less click between a press\'s release and its own click never makes a second pair', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    legacyClick();
    expect(calls(p)).toEqual([1, 1]);
    ownClick();
    expect(calls(p)).toEqual([1, 1]);
  });

  it('two outstanding presses: an id-less click spends neither, each own click is eaten by its id', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 1 });
    pd(hold(), { pointerId: 2, isPrimary: false });
    pu(hold(), { pointerId: 1 });
    expect(calls(p)).toEqual([1, 1]);
    legacyClick();
    ownClick(1);
    pu(hold(), { pointerId: 2, isPrimary: false });
    ownClick(2);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('an old press\'s own click leaves another pointer\'s virtual arm alone', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 1 });
    pu(hold(), { pointerId: 1 });
    pd(hold(), { ...VIRTUAL, pointerId: 2 });
    ownClick(1);
    expect(calls(p)).toEqual([1, 1]);
    fireEvent(hold(), clickOf({ pointerId: 2, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('every cancel ends the press\'s claim: a lone TalkBack click with its id is one tap', () => {
    onAndroid();
    const p = props();
    const view = render(<><TalkBar {...p} /><input aria-label="after" /></>);
    const bar = (over: Partial<TalkBarProps> = {}) => <><TalkBar {...p} {...over} /><input aria-label="after" /></>;
    const cancels: Array<[string, () => void]> = [
      ['blur', () => act(() => { window.dispatchEvent(new Event('blur')); })],
      ['pagehide', () => act(() => { window.dispatchEvent(new Event('pagehide')); })],
      ['hidden', () => {
        const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        state.mockReturnValue('visible');
      }],
      ['focusout', () => act(() => screen.getByRole('textbox', { name: 'after' }).focus())],
      ['lost capture', () => fireEvent(hold(), new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }))],
      ['mute', () => { view.rerender(bar({ phase: 'muting' })); view.rerender(bar()); }],
      ['hands-free', () => { view.rerender(bar({ mode: 'vad', mic: 'vad' })); view.rerender(bar()); }],
      ['unmount', () => { view.rerender(<input aria-label="after" />); view.rerender(bar()); }],
    ];
    let n = 0;
    for (const [name, cancel] of cancels) {
      hold().focus();
      pd(hold(), { pointerId: 1 });
      cancel();
      n += 1;
      expect(calls(p), name).toEqual([n, n]);
      talkBackClick(1);
      n += 1;
      expect(calls(p), name).toEqual([n, n]);
    }
  });

  it('an arm is spent only by a click of its own pointer (or an id-less one): another id is routed on its own', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { ...VIRTUAL, pointerId: 2 });
    fireEvent(hold(), clickOf({ pointerId: 7, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([0, 0]);
    // An independent program click taps on its own and leaves the arm for its own click.
    fireEvent(hold(), clickOf({ pointerId: -1, detail: 0 }));
    expect(calls(p)).toEqual([1, 1]);
    fireEvent(hold(), clickOf({ pointerId: 2, pointerType: 'mouse', detail: 1, buttons: 0 }));
    expect(calls(p)).toEqual([2, 2]);
    fireEvent(hold(), clickOf({ pointerId: 2, pointerType: 'mouse', detail: 1, buttons: 0 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('an ignored pointer\'s pointercancel drops its record: a later virtual-shaped click with that id taps', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    pd(hold(), { pointerId: 2, isPrimary: false });
    fireEvent.pointerCancel(document.body, { pointerId: 2 });
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([1, 1]);
    ownClick(2);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a new virtual down of an id ends that id\'s record: its armed click is a tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 1 });
    pu(hold(), { pointerId: 1 });
    pd(hold(), { ...VIRTUAL, pointerId: 1 });
    pu(hold(), { ...VIRTUAL, pointerId: 1 });
    fireEvent(hold(), clickOf({ pointerId: 1, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a press\'s click that arrives while another owner holds spends its record, never taps; a later lone click taps', () => {
    onAndroid();
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    pd(hold(), { pointerId: 1 });
    pu(hold(), { pointerId: 1 });
    fireEvent(hold(), clickOf({ pointerId: 1, pointerType: 'mouse', detail: 1 }));
    fireEvent.keyUp(hold(), SPACE);
    expect(calls(p)).toEqual([1, 1]);
    talkBackClick(1);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a click carrying the owner pointer\'s own id while it still holds spends nothing: its real click is still eaten', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 3 });
    ownClick(3);
    pu(hold(), { pointerId: 3 });
    expect(calls(p)).toEqual([1, 1]);
    ownClick(3);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a release outside the control that the control captured still owes its click', () => {
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    pd(hold(), { pointerId: 4 });
    const captured = vi.spyOn(hold(), 'hasPointerCapture').mockReturnValue(true);
    pu(document.body, { pointerId: 4 });
    captured.mockRestore();
    fireEvent.keyUp(hold(), SPACE);
    ownClick(4);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a press the control ignored and that was released elsewhere owes no click here: a lone click with its id taps', () => {
    onAndroid();
    const p = props();
    render(<TalkBar {...p} />);
    hold().focus();
    fireEvent.keyDown(hold(), SPACE);
    pd(hold(), { pointerId: 3 });
    fireEvent.keyUp(hold(), SPACE);
    pu(document.body, { pointerId: 3 });
    expect(calls(p)).toEqual([1, 1]);
    talkBackClick(3);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('an independent click from a timer queued at a cancelled press\'s late release is its own tap', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calls(p)).toEqual([1, 1]);
    const later = () => setTimeout(() => programClick(), 0);
    window.addEventListener('pointerup', later, { capture: true, once: true });
    pu(document.body);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('every cancel drops a waiting virtual arm: a late click after it is routed on its own (a mouse click: nothing)', () => {
    const p = props();
    const { rerender } = render(<><TalkBar {...p} /><input aria-label="after" /></>);
    const late = () => fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    const cancels: Array<() => void> = [
      () => fireEvent.pointerCancel(document.body, { pointerId: 5 }),
      () => act(() => { window.dispatchEvent(new Event('blur')); }),
      () => act(() => { window.dispatchEvent(new Event('pagehide')); }),
      () => {
        const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        state.mockReturnValue('visible');
      },
      () => {
        hold().focus();
        act(() => screen.getByRole('textbox', { name: 'after' }).focus());
      },
      () => {
        rerender(<><TalkBar {...p} phase="muting" /><input aria-label="after" /></>);
        rerender(<><TalkBar {...p} /><input aria-label="after" /></>);
      },
    ];
    for (const cancel of cancels) {
      pd(hold(), VIRTUAL);
      cancel();
      late();
    }
    expect(calls(p)).toEqual([0, 0]);
  });

  it('a cancelled hold leaves nothing behind: a lone click after it (a program, or assistive) is one tap', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calls(p)).toEqual([1, 1]);
    hold().click();
    expect(calls(p)).toEqual([2, 2]);
    fireEvent(hold(), clickOf({ pointerId: -1, detail: 0, trusted: true }));
    expect(calls(p)).toEqual([3, 3]);
  });

  // An id-less click (a MouseEvent, as on engines before PointerEvent clicks) taps through the
  // virtual arm; with a physical press owed it is that press's click (no new pair); with nothing owed it is one tap.
  const lone = () => fireEvent(hold(), new MouseEvent('click', { bubbles: true, detail: 0 }));
  it('id-less lone click, nothing owed and no arm: each one is one tap (a screen-reader click on an older engine)', () => {
    const p = props();
    render(<TalkBar {...p} />);
    lone();
    expect(calls(p)).toEqual([1, 1]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('id-less lone click with a press owed: no new pair, and the press\'s record stays for its own click', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    expect(calls(p)).toEqual([1, 1]);
    lone();
    expect(calls(p)).toEqual([1, 1]);
    ownClick();
    expect(calls(p)).toEqual([1, 1]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('id-less lone click with a virtual arm: one tap, the arm is spent, and a later lone click is its own tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), VIRTUAL);
    expect(calls(p)).toEqual([0, 0]);
    lone();
    expect(calls(p)).toEqual([1, 1]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('id-less click with a virtual arm while another press is owed: the arm wins, one tap, the record stays', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 1 });
    pu(hold(), { pointerId: 1 });
    pd(hold(), { pointerId: 2, ...VIRTUAL });
    lone();
    expect(calls(p)).toEqual([2, 2]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
    ownClick(1);
    lone();
    expect(calls(p)).toEqual([3, 3]);
  });

  it('latch: a second untrusted id-less click while the same press is still owed is its own tap; the press\'s click is still eaten', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    lone();
    expect(calls(p)).toEqual([1, 1]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
    ownClick();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('the latch ends with its record: a new down of the id reopens it, so the next untrusted id-less click is that press\'s', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    lone();
    pd(hold());
    pu(hold());
    expect(calls(p)).toEqual([2, 2]);
    lone();
    expect(calls(p)).toEqual([2, 2]);
  });

  // An engine whose own clicks are MouseEvents: a press's click arrives as a trusted id-less click.
  const trustedLone = () => {
    const e = new MouseEvent('click', { bubbles: true, detail: 1 });
    Object.defineProperty(e, 'isTrusted', { value: true });
    fireEvent(hold(), e);
  };
  it('id-less engine: a press\'s own trusted click ends its record, so a later assistive click is one tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    trustedLone();
    expect(calls(p)).toEqual([1, 1]);
    trustedLone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('id-less engine: a trusted click ends a latched record too (it is the press\'s real click); the next one taps', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    lone();
    trustedLone();
    expect(calls(p)).toEqual([1, 1]);
    trustedLone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('id-less engine: two owed presses take one trusted click each, oldest first; the next is one tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerId: 1 });
    pd(hold(), { pointerId: 2, isPrimary: false });
    pu(hold(), { pointerId: 2, isPrimary: false });
    pu(hold(), { pointerId: 1 });
    expect(calls(p)).toEqual([1, 1]);
    trustedLone();
    trustedLone();
    expect(calls(p)).toEqual([1, 1]);
    trustedLone();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('only the release\'s own task holds its trailing click: a click in a later task is its own activation', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold());
    pu(hold());
    await new Promise((r) => setTimeout(r, 0));
    hold().click();
    expect(calls(p)).toEqual([2, 2]);
  });

  it('Firefox with a screen reader: a trusted click with an empty pointerType is one tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    fireEvent(hold(), clickOf({ pointerType: '', detail: 1, trusted: true }));
    expect(calls(p)).toEqual([1, 1]);
  });

  it('desktop: a 1x1 mouse with no pressure (a trackpad) is a hold, not a tap', () => {
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pressure: 0, detail: 0 });
    expect(calls(p)).toEqual([1, 0]);
    pu(document.body);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('Android: a zero-size touch is a hold (down at once, up at release) and its click adds nothing', () => {
    onAndroid();
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pointerType: 'touch', ...VIRTUAL, pressure: 0.5 });
    expect(calls(p)).toEqual([1, 0]);
    pu(document.body, { pointerType: 'touch' });
    expect(calls(p)).toEqual([1, 1]);
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'touch', detail: 1, buttons: 0 }));
    expect(calls(p)).toEqual([1, 1]);
  });

  it('Android TalkBack: its 1x1 pressureless precursor is one tap at its click, and its lone click too', () => {
    onAndroid();
    const p = props();
    render(<TalkBar {...p} />);
    pd(hold(), { pressure: 0, detail: 0 });
    expect(calls(p)).toEqual([0, 0]);
    fireEvent(hold(), clickOf({ pointerId: 5, pointerType: 'mouse', detail: 1 }));
    expect(calls(p)).toEqual([1, 1]);
    fireEvent(hold(), clickOf({ pointerId: 1, pointerType: 'mouse', detail: 1, buttons: 1 }));
    expect(calls(p)).toEqual([2, 2]);
  });

  it('a long press shows no context menu while it holds; idle it does', () => {
    const p = props();
    render(<TalkBar {...p} />);
    expect(fireEvent.contextMenu(hold())).toBe(true);
    pd(hold(), { pointerType: 'touch', width: 20, height: 20 });
    expect(fireEvent.contextMenu(hold())).toBe(false);
    pu(document.body, { pointerType: 'touch' });
  });

  it('wears the kit primary look and its states: end glyph, hover, pressed while held, disabled while muted', async () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    expect(hold()).toHaveAttribute('type', 'button');
    expect(hold()).toHaveAttribute('data-variant', 'primary');
    expect(hold().querySelector('[data-glyph-mark]')).not.toBeNull();
    expect(hold()).not.toHaveAttribute('data-hovered');
    // React Aria's useHover ignores mouse hover for 500 ms after any touch release (an earlier test's): wait that out.
    await new Promise((r) => setTimeout(r, 520));
    await userEvent.setup().hover(hold());
    expect(hold()).toHaveAttribute('data-hovered');
    expect(hold()).not.toHaveAttribute('data-pressed');
    pd(hold());
    expect(hold()).toHaveAttribute('data-pressed');
    pu(document.body);
    expect(hold()).not.toHaveAttribute('data-pressed');
    rerender(<TalkBar {...p} phase="muted" />);
    expect(hold()).toHaveAttribute('data-disabled');
  });

  it('the window losing focus mid-press releases, and the later key up sends nothing more', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    hold().focus();
    await u.keyboard('[Space>]');
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calls(p)).toEqual([1, 1]);
    await u.keyboard('[/Space]');
    expect(calls(p)).toEqual([1, 1]);
  });

  it('the page being hidden mid-press (a tab switch) releases; becoming visible again does nothing', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    hold().focus();
    await u.keyboard('[Space>]');
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(calls(p)).toEqual([1, 0]);
    state.mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(calls(p)).toEqual([1, 1]);
    await u.keyboard('[/Space]');
    expect(calls(p)).toEqual([1, 1]);
  });

  it('leaving the page mid-press (pagehide) releases, once', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(calls(p)).toEqual([1, 1]);
    await u.pointer({ keys: '[/MouseLeft]', target: hold() });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a pointer that leaves and comes back while held stays one press; it ends where the pointer is released', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    await u.pointer({ target: document.body });
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ target: hold() });
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ target: document.body });
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ keys: '[/MouseLeft]', target: document.body });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('a touch released outside the control still releases, once', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[TouchA>]', target: hold() });
    await u.pointer({ pointerName: 'TouchA', target: document.body });
    expect(calls(p)).toEqual([1, 0]);
    await u.pointer({ keys: '[/TouchA]', target: document.body });
    expect(calls(p)).toEqual([1, 1]);
  });

  it('losing focus mid-press releases, once', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    hold().focus();
    await u.keyboard('[Space>]');
    act(() => hold().blur());
    expect(calls(p)).toEqual([1, 1]);
    await u.keyboard('[/Space]');
    expect(calls(p)).toEqual([1, 1]);
  });

  it('the bar leaving live mid-press still releases', async () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    rerender(<TalkBar {...p} phase="reconnecting" />);
    expect(calls(p)).toEqual([1, 1]);
  });

  it('switching to hands-free or muting mid-press releases, once', async () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    rerender(<TalkBar {...p} mode="vad" mic="vad" />);
    expect(calls(p)).toEqual([1, 1]);
    rerender(<TalkBar {...p} />);
    await u.pointer({ keys: '[MouseLeft>]', target: hold() });
    rerender(<TalkBar {...p} phase="muting" />);
    expect(calls(p)).toEqual([2, 2]);
  });

  it('says what a held or latched press does, and is disabled while muted', () => {
    const { rerender } = render(<TalkBar {...props({ mic: 'ptt-held' })} />);
    expect(screen.getByRole('button', { name: strings['hold.held'] })).toHaveAttribute('aria-pressed', 'true');
    rerender(<TalkBar {...props({ mic: 'latched' })} />);
    expect(screen.getByRole('button', { name: strings['hold.latched'] })).toHaveAttribute('aria-pressed', 'true');
    rerender(<TalkBar {...props({ phase: 'muted' })} />);
    expect(hold()).toBeDisabled();
  });

  it('hands-free shows no hold control', () => {
    render(<TalkBar {...props({ mode: 'vad', mic: 'vad' })} />);
    expect(screen.queryByRole('button', { name: strings['hold.idle'] })).toBeNull();
  });
});

describe('the live controls', () => {
  it('offers hands-free only with echo cancellation, and says to use headphones otherwise', async () => {
    const p = props({ handsFree: false });
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: `Mode: ${strings['mode.ptt']}` }));
    const vad = await screen.findByRole('menuitemradio', { name: new RegExp(strings['mode.vad']) });
    expect(vad).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(strings['mode.vadWhy'])).toBeInTheDocument();
    await u.click(vad);
    expect(p.onMode).not.toHaveBeenCalled();
  });

  it('switches to hands-free when allowed', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: `Mode: ${strings['mode.ptt']}` }));
    await u.click(await screen.findByRole('menuitemradio', { name: new RegExp(strings['mode.vad']) }));
    expect(p.onMode).toHaveBeenCalledWith('vad');
  });

  it('mute, muting and unmute', async () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    await userEvent.click(screen.getByRole('button', { name: strings.mute }));
    expect(p.onMute).toHaveBeenCalledTimes(1);
    rerender(<TalkBar {...p} phase="muting" />);
    expect(screen.getByRole('button', { name: new RegExp(strings.muting) })).toBeInTheDocument();
    rerender(<TalkBar {...p} phase="muted" />);
    expect(screen.getByText(strings['phase.muted'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings.unmute }));
    expect(p.onUnmute).toHaveBeenCalledTimes(1);
  });

  it('Stop speaking shows only when allowed; Stop answer while an answer can stop, Stopping… while it runs', async () => {
    const p = props();
    const { rerender } = render(<TalkBar {...p} />);
    expect(screen.queryByRole('button', { name: strings.stopSpeaking })).toBeNull();
    expect(screen.queryByRole('button', { name: strings.stopAnswer })).toBeNull();
    rerender(<TalkBar {...p} canStopAnswer canStopSpeaking />);
    await userEvent.click(screen.getByRole('button', { name: strings.stopSpeaking }));
    expect(p.onStopSpeaking).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: strings.stopAnswer }));
    expect(p.onStopAnswer).toHaveBeenCalledTimes(1);
    rerender(<TalkBar {...p} canStopAnswer stopping />);
    expect(screen.getByRole('button', { name: new RegExp(strings.stopping) })).toBeInTheDocument();
  });

  it('Escape on the bar stops speaking when allowed, else the answer, else nothing', () => {
    const p = props({ canStopAnswer: true, canStopSpeaking: true });
    const { rerender } = render(<TalkBar {...p} />);
    const bar = () => screen.getByRole('group', { name: strings['bar.label'] });
    fireEvent.keyDown(bar(), { key: 'Escape' });
    expect(p.onStopSpeaking).toHaveBeenCalledTimes(1);
    expect(p.onStopAnswer).not.toHaveBeenCalled();
    rerender(<TalkBar {...p} canStopSpeaking={false} />);
    fireEvent.keyDown(bar(), { key: 'Escape' });
    expect(p.onStopAnswer).toHaveBeenCalledTimes(1);
    rerender(<TalkBar {...p} canStopSpeaking={false} stopping />);
    expect(fireEvent.keyDown(bar(), { key: 'Escape' })).toBe(true);
    rerender(<TalkBar {...p} canStopSpeaking={false} canStopAnswer={false} />);
    expect(fireEvent.keyDown(bar(), { key: 'Escape' })).toBe(true);
    expect(p.onStopAnswer).toHaveBeenCalledTimes(1);
    expect(p.onStopSpeaking).toHaveBeenCalledTimes(1);
  });

  it('the level is a meter named "Microphone level"; a bad reading shows 0', () => {
    const { rerender } = render(<TalkBar {...props({ level: 0.42 })} />);
    expect(screen.getByRole('meter', { name: strings.level })).toHaveAttribute('aria-valuenow', '42');
    rerender(<TalkBar {...props({ level: NaN })} />);
    expect(screen.getByRole('meter', { name: strings.level })).toHaveAttribute('aria-valuenow', '0');
    rerender(<TalkBar {...props({ level: 7 })} />);
    expect(screen.getByRole('meter', { name: strings.level })).toHaveAttribute('aria-valuenow', '100');
  });

  it('devices: picks a microphone and a speaker; without setSinkId the speaker row says why', async () => {
    const p = props();
    const { unmount } = render(<TalkBar {...p} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: strings.devices }));
    await u.click(await screen.findByRole('menuitemradio', { name: /Headphones/ }));
    expect(p.onOutput).toHaveBeenCalledWith('s1');
    unmount();
    render(<TalkBar {...props({ canChooseOutput: false })} />);
    await u.click(screen.getByRole('button', { name: strings.devices }));
    expect(await screen.findByText(strings['devices.outputWhy'])).toBeInTheDocument();
  });

  it('End ends', async () => {
    const p = props();
    render(<TalkBar {...p} />);
    await userEvent.click(screen.getByRole('button', { name: strings.end }));
    expect(p.onEnd).toHaveBeenCalledTimes(1);
  });

  it('says why speech stopped when playback fell behind', () => {
    render(<TalkBar {...props({ overflow: 'old' })} />);
    expect(screen.getByText(strings['overflow.old'])).toBeInTheDocument();
  });
});

describe('every other phase is one band with its way on', () => {
  const cases: [Phase, string, keyof TalkBarProps | null, string | null][] = [
    ['starting', strings['phase.starting'], 'onEnd', strings.end],
    ['connecting', strings['phase.connecting'], 'onEnd', strings.end],
    ['reconnecting', strings['phase.reconnecting'], 'onEnd', strings.end],
    ['notReady', 'Voice isn\'t ready: speech provider', 'onOpenSettings', strings['phase.notReadyAction']],
    ['checkUnknown', strings['phase.checkUnknown'], 'onTryAnyway', strings['phase.tryAnyway']],
    ['denied', strings['phase.denied'], 'onRetry', strings['phase.tryAgain']],
    ['noDevice', strings['phase.noDevice'], 'onRetry', strings['phase.tryAgain']],
    ['playbackBlocked', strings['phase.playbackBlockedWhy'], 'onEnableSound', strings['phase.playbackBlocked']],
    ['busyElsewhere', strings['phase.busyElsewhere'], 'onTakeOver', strings['phase.takeOver']],
    ['budget', strings['phase.budget'], 'onRetry', strings['phase.tryAgain']],
    ['connectFailed', strings['phase.connectFailed'], 'onRetry', strings['phase.tryAgain']],
    ['ended', strings['ended.lost'], 'onRetry', strings['ended.again']],
  ];
  for (const [phase, text, handler, action] of cases) {
    it(`${phase}: "${text}"${action ? ` and ${action}` : ''}`, async () => {
      const p = props({ phase, notReadyStage: 'speech provider', ended: 'lost' });
      render(<TalkBar {...p} />);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: strings['hold.idle'] })).toBeNull();
      if (handler && action) {
        await userEvent.click(screen.getByRole('button', { name: action }));
        expect(p[handler]).toHaveBeenCalledTimes(1);
      }
    });
  }

  it('checkUnknown never says voice is not set up, and offers Try again too', async () => {
    const p = props({ phase: 'checkUnknown' });
    render(<TalkBar {...p} />);
    expect(document.body).not.toHaveTextContent(/not set up/i);
    await userEvent.click(screen.getByRole('button', { name: strings['phase.tryAgain'] }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });

  it('an ended session that overflowed says so; off draws nothing', () => {
    const { rerender, container } = render(<TalkBar {...props({ phase: 'ended', ended: 'closed', overflow: 'lead' })} />);
    expect(screen.getByText(strings['overflow.lead'])).toBeInTheDocument();
    rerender(<TalkBar {...props({ phase: 'off' })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('captions', () => {
  it('shows what is heard as partial, announces only finals, and names the Bot as written', () => {
    const { rerender } = render(<CaptionStrip you={{ text: 'book the', final: false }} />);
    const captions = screen.getByRole('group', { name: strings['caption.label'] });
    expect(captions).toHaveTextContent('book the');
    expect(captions).toHaveTextContent(strings['caption.hearing']);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(<CaptionStrip you={{ text: 'book the flight', final: true }} bot={{ name: 'Juno', text: "I'll start a task", final: false }} />);
    expect(screen.getByRole('status')).toHaveTextContent(`${strings['caption.you']}: book the flight`);
    expect(screen.getByRole('status')).not.toHaveTextContent('Juno');
    rerender(<CaptionStrip you={{ text: 'book the flight', final: true }} bot={{ name: 'Juno', text: "I'll start a task", final: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent("Juno: I'll start a task");
  });

  it('draws nothing without words', () => {
    const { container } = render(<CaptionStrip you={{ text: '', final: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MicButton', () => {
  it('starts Talk, and refuses with its reason (still focusable) when Talk cannot start here', async () => {
    const onPress = vi.fn();
    const { rerender } = render(<MicButton onPress={onPress} />);
    await userEvent.click(screen.getByRole('button', { name: strings['mic.label'] }));
    expect(onPress).toHaveBeenCalledTimes(1);
    for (const reason of ['notSetUp', 'agentOld', 'ownTab'] as const) {
      rerender(<MicButton onPress={onPress} reason={reason} />);
      const b = screen.getByRole('button', { name: new RegExp(strings['mic.label']) });
      await userEvent.click(b);
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(document.body).toHaveTextContent(strings[`mic.why.${reason}`]);
    }
  });

  it('as an ActionSpec carries the same words', () => {
    let spec: ReturnType<typeof useMicAction> | undefined;
    function Probe() { spec = useMicAction({ reason: 'ownTab', onPress: () => undefined }); return null; }
    render(<Probe />);
    expect(spec).toMatchObject({ id: 'talk', label: strings['mic.label'], disabledReason: strings['mic.why.ownTab'] });
  });
});

describe('page keys', () => {
  function Keys(k: TalkShortcuts) { useTalkShortcuts(k); return null; }
  it('t focuses Talk, m mutes or unmutes, Escape stops; nothing runs when not enabled', async () => {
    const k = { enabled: true, focus: vi.fn(), toggleMute: vi.fn(), stop: vi.fn() };
    const { rerender } = render(<Keys {...k} />);
    const u = userEvent.setup();
    await u.keyboard('t');
    await u.keyboard('m');
    await u.keyboard('{Escape}');
    expect([k.focus.mock.calls.length, k.toggleMute.mock.calls.length, k.stop.mock.calls.length]).toEqual([1, 1, 1]);
    rerender(<Keys {...k} enabled={false} />);
    await u.keyboard('t');
    await u.keyboard('m');
    await u.keyboard('{Escape}');
    expect([k.focus.mock.calls.length, k.toggleMute.mock.calls.length, k.stop.mock.calls.length]).toEqual([1, 1, 1]);
    rerender(<Keys enabled focus={k.focus} />);
    await u.keyboard('m');
    await u.keyboard('{Escape}');
    expect([k.toggleMute.mock.calls.length, k.stop.mock.calls.length]).toEqual([1, 1]);
    // A key with nothing to do is not taken: m types, and Escape still reaches a dialog or menu.
    const m = new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true });
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(m);
    document.body.dispatchEvent(esc);
    expect([m.defaultPrevented, esc.defaultPrevented]).toEqual([false, false]);
  });
});
