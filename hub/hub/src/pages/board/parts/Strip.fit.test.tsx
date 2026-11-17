// Vitest: the Board strip's one row. stripRowNeed asks for
// the Boards' floor (Boards ▾, the whole tab list and New Board when that narrow, else the larger of the open tab with
// two chevron widths plus Boards ▾ and New Board, and STRIP_TABS_SHARE of the row) plus the tools whole; and what each
// step draws: words, then the note's short form (named by the whole sentence) with Even out tiles gone (Layout's
// Equalise does it), then Layout and Focus as icons, then Boards ▾ as an icon, then Add a program as "Add" (still named
// Add a program). Boards ▾ starts the row and New Board stays right after the tabs (an icon, the drop target for a
// tile) at every step, both the kit Tabs' own row slots; no ⋯ after the tabs. Every control is a toolbar control with no
// key cap; Add a program is the row's last control, past a rule, yellow with no chip. The fit key changes with what the
// row holds, never with a number in the note, and with a Broadcast trigger that narrows. Layout is the browser's
// (oneline.spec.ts); here the step is set by hand.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STRIP_LAST_STEP, STRIP_TABS_SHARE, Strip, stripRowNeed, type StripProps } from './Strip';
import strings from '../strings.en.json';

const fit = vi.hoisted(() => ({ step: 0, keys: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return {
    ...m,
    useRowFit: (_ref: unknown, _last: number, key: string) => {
      fit.keys.push(key);
      return fit.step;
    },
  };
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  fit.step = 0;
  fit.keys = [];
  vi.restoreAllMocks();
});

/** Sets an element's layout widths, which jsdom does not compute. */
function widths(el: HTMLElement, w: { client?: number; scroll?: number; offset?: number }) {
  if (w.client !== undefined) Object.defineProperty(el, 'clientWidth', { configurable: true, value: w.client });
  if (w.scroll !== undefined) Object.defineProperty(el, 'scrollWidth', { configurable: true, value: w.scroll });
  if (w.offset !== undefined) Object.defineProperty(el, 'offsetWidth', { configurable: true, value: w.offset });
}

/** A strip row: 16 px padding each side, an 8 px gap, 44 px controls; the list, its open tab and the controls' widths. */
function row(r: { client: number; list: number; open: number; end: number }) {
  const el = document.createElement('div');
  el.style.paddingLeft = '16px';
  el.style.paddingRight = '16px';
  el.style.columnGap = '8px';
  el.style.setProperty('--board-btn', '44px');
  el.innerHTML = '<div><div role="tablist"><div role="tab" aria-selected="false"></div><div role="tab" aria-selected="true"></div></div></div><span data-strip-end></span>';
  document.body.append(el);
  widths(el, { client: r.client });
  widths(el.querySelector<HTMLElement>('[role="tablist"]')!, { scroll: r.list });
  widths(el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!, { offset: r.open });
  widths(el.querySelector<HTMLElement>('[data-strip-end]')!, { scroll: r.end });
  return el;
}

/** The kit Tabs' row slots (K-d) around the list: Boards ▾ before it, New Board after it. */
function slots(el: HTMLElement, before: number, after: number) {
  const bar = el.firstElementChild!;
  const pre = document.createElement('span');
  pre.setAttribute('data-tabs-before', '');
  widths(pre, { offset: before });
  const post = document.createElement('span');
  post.setAttribute('data-tabs-after', '');
  widths(post, { offset: after });
  bar.prepend(pre);
  bar.append(post);
  return el;
}

describe('stripRowNeed', () => {
  it('a tab list narrower than its floor: the whole list, plus padding, gap and the controls (no tab ⋯ any more)', () => {
    expect(stripRowNeed(row({ client: 1000, list: 150, open: 80, end: 300 }))).toBe(32 + 150 + 8 + 300);
  });
  it('a long list in a wide row: the tabs keep STRIP_TABS_SHARE of the inner width', () => {
    expect(STRIP_TABS_SHARE).toBe(0.4);
    expect(stripRowNeed(row({ client: 1032, list: 2000, open: 80, end: 300 }))).toBe(32 + 400 + 8 + 300);
  });
  it('a long list in a narrow row: the open tab and two control widths (a chevron at each side)', () => {
    expect(stripRowNeed(row({ client: 432, list: 2000, open: 120, end: 200 }))).toBe(32 + 120 + 2 * 44 + 8 + 200);
  });
  it('Boards ▾ and New Board (the kit row slots) count with the Boards, in the floor and in the whole list', () => {
    expect(stripRowNeed(slots(row({ client: 1000, list: 150, open: 80, end: 300 }), 90, 32))).toBe(32 + 150 + 90 + 32 + 8 + 300);
    expect(stripRowNeed(slots(row({ client: 432, list: 2000, open: 120, end: 200 }), 90, 32))).toBe(32 + 120 + 2 * 44 + 90 + 32 + 8 + 200);
    // A wide row: the share is the floor while it is larger than the open tab, chevrons and slots.
    expect(stripRowNeed(slots(row({ client: 1032, list: 2000, open: 80, end: 300 }), 90, 32))).toBe(32 + 400 + 8 + 300);
  });
  it('a row with no tab list (not drawn yet): its scroll width', () => {
    const el = document.createElement('div');
    widths(el, { scroll: 321 });
    expect(stripRowNeed(el)).toBe(321);
  });
});

const items = [
  { id: 'a', label: 'Main' },
  { id: 'b', label: 'Board 2' },
];
const note = { full: 'Showing 2 of 6 tiles on this page (a Board holds up to 8).', short: '2/6 · 6/8 tiles' };

function strip(over: Partial<StripProps> = {}) {
  const p: StripProps = {
    items,
    active: 'a',
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    tabMenu: () => [],
    canCreate: true,
    createReason: '',
    onCreate: vi.fn(),
    note,
    onEven: vi.fn(),
    layoutMenu: [{ id: 'one', label: 'One', onAction: vi.fn() }],
    boardMenu: [{ id: 'rename', label: strings['board.rename'], onAction: vi.fn() }],
    boardMenuOpen: false,
    onBoardMenuOpen: vi.fn(),
    onFocus: vi.fn(),
    add: { onPress: vi.fn(), reason: null },
    ...over,
  };
  return { p, ...render(<Strip {...p} />) };
}

const btn = (name: string) => screen.queryByRole('button', { name, exact: true } as never);

describe('Strip steps', () => {
  it(`has ${STRIP_LAST_STEP + 1} steps, 0 to ${STRIP_LAST_STEP}`, () => {
    expect(STRIP_LAST_STEP).toBe(4);
  });

  it('step 0: every control in words, the note whole, New Board and Even out in the row', () => {
    fit.step = 0;
    strip();
    expect(btn(strings.boards)).toHaveTextContent(strings.boards);
    expect(btn(strings['board.addProgram'])).toHaveTextContent(strings['board.addProgram']);
    expect(btn(strings.layout)).toHaveTextContent(strings.layout);
    expect(btn(strings.focus)).toHaveTextContent(strings.focus);
    expect(screen.getByText(note.full)).toBeInTheDocument();
    expect(screen.queryByText(note.short)).toBeNull();
    expect(btn(strings['board.new'])).not.toBeNull();
    expect(btn(strings['overflow.even'])).not.toBeNull();
  });

  it('step 1: the note its short form, named by the whole sentence; Even out tiles leaves the row; the rest keep their words', () => {
    fit.step = 1;
    strip();
    expect(btn(note.full)).toHaveTextContent(note.short);
    expect(btn(strings['overflow.even'])).toBeNull();
    expect(btn(strings['board.addProgram'])).toHaveTextContent(strings['board.addProgram']);
    expect(btn(strings['board.addProgram'])).toHaveAttribute('aria-keyshortcuts', 'N');
    expect(btn(strings.layout)).toHaveTextContent(strings.layout);
    expect(btn(strings.focus)).toHaveTextContent(strings.focus);
  });

  it('step 2: Layout and Focus are icons (Focus keeps F); Add a program keeps its words; New Board still in the row', () => {
    fit.step = 2;
    strip();
    expect(btn(strings.layout)).not.toHaveTextContent(strings.layout);
    expect(btn(strings.focus)).not.toHaveTextContent(strings.focus);
    expect(btn(strings.focus)).toHaveAttribute('aria-keyshortcuts', 'F');
    expect(btn(strings['board.addProgram'])).toHaveTextContent(strings['board.addProgram']);
    expect(btn(strings.boards)).toHaveTextContent(strings.boards);
    expect(btn(strings['board.new'])).not.toBeNull();
  });

  it('step 3: Boards ▾ is an icon named Boards that still opens its menu; Add a program keeps its words', async () => {
    fit.step = 3;
    const { p } = strip();
    const boards = btn(strings.boards)!;
    expect(boards).not.toHaveTextContent(strings.boards);
    expect(boards).toHaveAttribute('aria-haspopup');
    expect(btn(strings['board.addProgram'])).toHaveTextContent(strings['board.addProgram']);
    await userEvent.setup().click(boards);
    expect(p.onBoardMenuOpen).toHaveBeenCalledWith(true);
  });

  it('step 4: Add a program shows "Add" (never a bare plus), still named Add a program with N, and adds; New Board stays the drop target', async () => {
    fit.step = 4;
    const { p } = strip();
    const add = btn(strings['board.addProgram'])!;
    expect(add).toHaveTextContent(new RegExp('^' + strings['board.addShort'] + '$'));
    expect(add).toHaveAttribute('aria-keyshortcuts', 'N');
    const user = userEvent.setup();
    await user.click(add);
    expect(p.add?.onPress).toHaveBeenCalledTimes(1);
    const make = btn(strings['board.new'])!;
    expect(make).toHaveAttribute('data-board-new-drop');
    await user.click(make);
    expect(p.onCreate).toHaveBeenCalledTimes(1);
  });

  for (const step of [0, 4]) {
    it(`at step ${step} with Boards at the limit: New Board is soft-disabled (focusable), says its reason, and makes nothing`, async () => {
      fit.step = step;
      const { p } = strip({ canCreate: false, createReason: 'No more Boards' });
      const make = btn(strings['board.new'])!;
      expect(make).toHaveAttribute('aria-disabled', 'true');
      expect(make).not.toBeDisabled();
      expect(make).toHaveAccessibleDescription('No more Boards');
      expect(make).not.toHaveAttribute('data-board-new-drop');
      await userEvent.setup().click(make);
      expect(p.onCreate).not.toHaveBeenCalled();
    });
  }

  it('the order: Boards ▾, the tabs (named Board tabs), New Board right after them, then the Board tools group, Add a program last past a rule', () => {
    strip();
    const list = screen.getByRole('tablist', { name: strings['board.tabs'] });
    const boards = btn(strings.boards)!;
    const make = btn(strings['board.new'])!;
    const tools = screen.getByRole('group', { name: strings['board.tools'] });
    const add = btn(strings['board.addProgram'])!;
    expect(boards.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(make) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools.contains(make)).toBe(false);
    expect(tools.contains(boards)).toBe(false);
    expect(boards.closest('[data-tabs-before]')).not.toBeNull();
    expect(make.closest('[data-tabs-after]')).not.toBeNull();
    for (const name of [strings.layout, strings.focus, strings['board.addProgram']]) expect(tools.contains(btn(name))).toBe(true);
    expect(tools.lastElementChild).toBe(add);
    expect(add.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
    expect(add.previousElementSibling?.className).toMatch(/stripRule/);
  });

  it('every control is a toolbar control in the 32 scope with no key cap; Add a program is the yellow primary with no chip', () => {
    for (const step of [0, 2]) {
      fit.step = step;
      const { container } = strip();
      expect(container.querySelector('[data-tb-size="32"]')).not.toBeNull();
      expect(container.querySelectorAll('kbd')).toHaveLength(0);
      for (const name of [strings.layout, strings.focus, strings['board.new'], strings.boards]) expect(btn(name)!.className, name).toMatch(/toolbar/);
      const add = btn(strings['board.addProgram'])!;
      expect(add.className).toMatch(/primary/);
      expect(add.querySelector('[data-chip-cell]')).toBeNull();
      cleanup();
    }
  });

  it('a full Board: Add a program is soft-disabled, says why, and adds nothing', async () => {
    const { p } = strip({ add: { onPress: vi.fn(), reason: strings['board.full'] } });
    const add = btn(strings['board.addProgram'])!;
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription(strings['board.full']);
    await userEvent.setup().click(add);
    expect(p.add?.onPress).not.toHaveBeenCalled();
  });

  it('an empty Board (add null): no Add a program and no rule', () => {
    const { container } = strip({ add: null });
    expect(btn(strings['board.addProgram'])).toBeNull();
    expect(screen.getByRole('group', { name: strings['board.tools'] }).querySelector('[class*="stripRule"]')).toBeNull();
    expect(container.textContent).not.toContain(strings['board.addProgram']);
  });

  it('at every step Boards ▾ starts the row and opens the menu the page gives it, named Boards', async () => {
    for (const step of [0, 1, 2, 3, 4]) {
      fit.step = step;
      strip({ boardMenuOpen: true });
      const row = document.querySelector('[data-strip-step]')!;
      expect([...row.querySelectorAll('button')][0]).toBe(btn(strings.boards));
      const menu = await screen.findByRole('menu', { name: strings.boards });
      expect(within(menu).getByRole('menuitem', { name: strings['board.rename'] })).toBeInTheDocument();
      cleanup();
    }
  });

  it("no ⋯ after the tabs: a tab's menu opens on the tab (right-click) with the page's rows for that tab", async () => {
    const tabMenu = vi.fn((id: string) => [{ id: 'dup', label: `Duplicate ${id}`, onAction: vi.fn() }]);
    strip({ tabMenu });
    expect(screen.queryByRole('button', { name: /^Tab actions/ })).toBeNull();
    act(() => {
      screen.getByText('Board 2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const menu = await screen.findByRole('menu', { name: /Board 2/ });
    expect(within(menu).getByRole('menuitem', { name: 'Duplicate b' })).toBeInTheDocument();
  });

  it('the Boards menu Rename starts the rename in place through the tabs handle the page passes', async () => {
    const ref = { current: null as null | { rename: (id: string) => void } };
    strip({ tabsRef: ref });
    expect(typeof ref.current?.rename).toBe('function');
    act(() => ref.current?.rename('b'));
    expect(await screen.findByRole('textbox', { name: /Board 2/ })).toBeInTheDocument();
  });

  it('a strip gone mid-rename (the window turned phone-sized) tells the page the rename ended, so its hold is released', async () => {
    const ref = { current: null as null | { rename: (id: string) => void } };
    const onTabEditing = vi.fn();
    const { unmount } = strip({ tabsRef: ref, onTabEditing });
    act(() => ref.current?.rename('b'));
    const field = await screen.findByRole('textbox', { name: /Board 2/ });
    await userEvent.setup().type(field, 'x');
    expect(onTabEditing).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b' }));
    unmount();
    expect(onTabEditing).toHaveBeenLastCalledWith(null);
  });

  it('a rename already ended (Enter) is not ended again when the strip goes: null is said once', async () => {
    const ref = { current: null as null | { rename: (id: string) => void } };
    const onTabEditing = vi.fn();
    const { unmount } = strip({ tabsRef: ref, onTabEditing });
    act(() => ref.current?.rename('b'));
    const field = await screen.findByRole('textbox', { name: /Board 2/ });
    await userEvent.setup().type(field, 'x{Enter}');
    await waitFor(() => expect(onTabEditing).toHaveBeenLastCalledWith(null));
    const nulls = () => onTabEditing.mock.calls.filter(([st]) => st === null).length;
    expect(nulls()).toBe(1);
    unmount();
    expect(nulls()).toBe(1);
  });

  it('a strip gone with no rename open says nothing', () => {
    const onTabEditing = vi.fn();
    const { unmount } = strip({ onTabEditing });
    unmount();
    expect(onTabEditing).not.toHaveBeenCalled();
  });

  it('the keyboard on Even out tiles goes to Layout when it leaves the row at step 1', () => {
    fit.step = 0;
    const { rerender, p } = strip();
    btn(strings['overflow.even'])!.focus();
    fit.step = 1;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toBe(btn(strings.layout));
  });

  it('the keyboard stays on Add a program as it shows "Add" at step 4, and back', () => {
    fit.step = 3;
    const { rerender, p } = strip();
    btn(strings['board.addProgram'])!.focus();
    fit.step = 4;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toBe(btn(strings['board.addProgram']));
    fit.step = 3;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toHaveTextContent(strings['board.addProgram']);
  });

  it('the keyboard stays on Boards ▾ as it becomes an icon at step 3, and back', () => {
    fit.step = 2;
    const { rerender, p } = strip();
    btn(strings.boards)!.focus();
    fit.step = 3;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toBe(btn(strings.boards));
    expect(document.activeElement).not.toHaveTextContent(strings.boards);
    fit.step = 2;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toHaveTextContent(strings.boards);
  });

  it('the keyboard stays on Layout as it becomes an icon at step 2, and back', () => {
    fit.step = 1;
    const { rerender, p } = strip();
    btn(strings.layout)!.focus();
    fit.step = 2;
    rerender(<Strip {...p} />);
    expect(document.activeElement).toBe(btn(strings.layout));
    expect(document.activeElement).not.toHaveTextContent(strings.layout);
  });

  it('the fit key holds while the note tip is open: a new kind of note restarts the fit only after it closes', async () => {
    fit.step = 1;
    const { rerender, p } = strip();
    const user = userEvent.setup();
    await user.click(btn(note.full)!);
    expect(btn(note.full)).toHaveAttribute('aria-expanded', 'true');
    const open = fit.keys.at(-1);
    const fitted = { full: strings['overflow.fitted'], short: strings['overflow.fittedShort'] };
    rerender(<Strip {...p} note={fitted} />);
    expect(fit.keys.at(-1)).toBe(open);
    await user.keyboard('{Escape}');
    rerender(<Strip {...p} note={fitted} />);
    expect(fit.keys.at(-1)).not.toBe(open);
  });

  it('a note that goes while its tip is open stays until the tip closes', async () => {
    fit.step = 1;
    const { rerender, p } = strip();
    const user = userEvent.setup();
    await user.click(btn(note.full)!);
    rerender(<Strip {...p} note={null} />);
    expect(btn(note.full)).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    rerender(<Strip {...p} note={null} />);
    expect(btn(note.full)).toBeNull();
  });

  it('a note that changes and then goes while its tip is open stays as last shown', async () => {
    fit.step = 1;
    const { rerender, p } = strip();
    const user = userEvent.setup();
    await user.click(btn(note.full)!);
    const next = { full: 'Tiles were rearranged to fit this Board.', short: 'Rearranged to fit' };
    rerender(<Strip {...p} note={next} />);
    rerender(<Strip {...p} note={null} />);
    expect(btn(next.full)).toHaveAttribute('aria-expanded', 'true');
    expect(btn(note.full)).toBeNull();
  });

  it('the fit key: a number in the note keeps it (an open tip or menu stays), another kind of note changes it', () => {
    const { rerender, p } = strip();
    const first = fit.keys.at(-1);
    rerender(<Strip {...p} note={{ full: 'Showing 3 of 7 tiles on this page (a Board holds up to 8).', short: '3/7 · 7/8 tiles' }} />);
    expect(fit.keys.at(-1)).toBe(first);
    rerender(<Strip {...p} note={{ full: strings['overflow.fitted'], short: strings['overflow.fittedShort'] }} />);
    expect(fit.keys.at(-1)).not.toBe(first);
  });

  it('the end slot (Broadcast, which renders on its own) changing what it says renders the strip again: a new kind restarts the fit, a number only does not', async () => {
    let slot: HTMLSpanElement | null = null;
    strip({ endSlot: (el) => { slot = el; } });
    expect(slot).not.toBeNull();
    const idle = fit.keys.at(-1);
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Live · 2 watching · Broadcast');
    button.textContent = 'Live · 2 watching';
    await act(async () => { slot!.append(button); });
    await waitFor(() => expect(fit.keys.at(-1)).not.toBe(idle));
    const live = fit.keys.at(-1);
    const renders = fit.keys.length;
    await act(async () => {
      button.textContent = 'Live · 12 watching';
      button.setAttribute('aria-label', 'Live · 12 watching · Broadcast');
    });
    // Rendered again (so a grown row steps down after it), with the same key (an open menu or tip stays).
    await waitFor(() => expect(fit.keys.length).toBeGreaterThan(renders));
    expect(fit.keys.at(-1)).toBe(live);
    await act(async () => { button.remove(); });
    await waitFor(() => expect(fit.keys.at(-1)).toBe(idle));
  });

  it('a Broadcast trigger that narrows (fewer watching, the same masked shape) restarts the fit; one that widens does not', async () => {
    const wide = { w: 160 };
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // The slot has no box of its own (display: contents): what is measured is the button inside it.
      return this.parentElement?.closest('[data-strip-slot]') ? ({ x: 0, y: 0, left: 0, top: 0, right: wide.w, bottom: 32, width: wide.w, height: 32, toJSON: () => ({}) } as DOMRect) : real.call(this);
    });
    let slot: HTMLSpanElement | null = null;
    strip({ endSlot: (el) => { slot = el; } });
    const button = document.createElement('button');
    button.textContent = 'Live · 123 watching';
    await act(async () => { slot!.append(button); });
    await waitFor(() => expect(fit.keys.at(-1)).toContain('Live'));
    const live = fit.keys.at(-1);
    // Wider (a count that grew): the same key, the row steps down after the render.
    wide.w = 200;
    await act(async () => { button.textContent = 'Live · 1234 watching'; });
    await waitFor(() => expect(fit.keys.at(-1)).toBe(live));
    // Narrower: a new key, the fit starts again from step 0 (its widths were measured at the wider slot).
    wide.w = 120;
    await act(async () => { button.textContent = 'Live · 2 watching'; });
    await waitFor(() => expect(fit.keys.at(-1)).not.toBe(live));
  });

  it('a slot that narrows while a menu from the row is open keeps the key until it closes', async () => {
    const wide = { w: 160 };
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // The slot has no box of its own (display: contents): what is measured is the button inside it.
      return this.parentElement?.closest('[data-strip-slot]') ? ({ x: 0, y: 0, left: 0, top: 0, right: wide.w, bottom: 32, width: wide.w, height: 32, toJSON: () => ({}) } as DOMRect) : real.call(this);
    });
    let slot: HTMLSpanElement | null = null;
    const { rerender, p } = strip({ endSlot: (el) => { slot = el; } });
    const button = document.createElement('button');
    button.textContent = 'Live · 123 watching';
    await act(async () => { slot!.append(button); });
    const user = userEvent.setup();
    await user.click(btn(strings.layout)!);
    await screen.findByRole('menu');
    const held = fit.keys.at(-1);
    wide.w = 100;
    await act(async () => { button.textContent = 'Live · 2 watching'; });
    expect(fit.keys.at(-1)).toBe(held);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    rerender(<Strip {...p} />);
    await waitFor(() => expect(fit.keys.at(-1)).not.toBe(held));
  });
});
