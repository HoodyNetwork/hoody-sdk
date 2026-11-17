// The one button API. ref, busy and disabledReason on every button, through the real components.
import { createRef, type ReactElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, MenuItem, MenuTrigger, Popover as AriaPopover } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton, LinkButton, chipFor } from './Button';
import { FileButton } from './FileButton';
import { Popover, Tooltip } from '../overlays/Popover';
import { TextButton } from './Link';

const REASON = 'Stop the computer first';

const pressables: Array<[string, (p: { onPress?: () => void; onKeyDown?: () => void; onKeyUp?: () => void; isDisabled?: boolean; disabledReason?: string; busy?: boolean; ref?: React.Ref<HTMLButtonElement> }) => ReactNode]> = [
  ['Button, with the glyph', (p) => <Button variant="primary" {...p}>Go</Button>],
  ['Button, plain', (p) => <Button variant="ghost" {...p}>Go</Button>],
  ['IconButton', (p) => <IconButton icon="plus" label="Go" {...p} />],
  ['TextButton', (p) => <TextButton {...p}>Go</TextButton>],
];

const softAll: typeof pressables = [...pressables, ['LinkButton', ({ ref: _ref, ...p }) => <LinkButton href="/x" {...p}>Go</LinkButton>]];

describe('ref', () => {
  it.each(pressables)('%s hands the element to an object ref', (_n, make) => {
    const ref = createRef<HTMLButtonElement>();
    render(make({ ref }));
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Go' }));
  });

  it.each(pressables)('%s hands the element to a callback ref, and its cleanup runs', (_n, make) => {
    const cleanup = vi.fn();
    const seen: Array<HTMLButtonElement | null> = [];
    const { unmount } = render(make({ ref: (el) => { seen.push(el); return cleanup; } }));
    expect(seen).toEqual([screen.getByRole('button', { name: 'Go' })]);
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('FileButton hands over its button, not its file input', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<FileButton label="Upload" onFiles={() => undefined} ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Upload' }));
  });

  it.each([['with the glyph', 'primary'], ['plain', 'ghost']] as const)('LinkButton, %s, hands over its anchor', (_n, variant) => {
    const ref = createRef<HTMLAnchorElement>();
    render(<LinkButton href="/x" variant={variant} ref={ref}>Go</LinkButton>);
    expect(ref.current).toBe(screen.getByRole('link', { name: 'Go' }));
  });

  it('a caller ref does not cost the keyboard shortcut (the kit sets aria-keyshortcuts through its own ref)', () => {
    const a = createRef<HTMLButtonElement>();
    const b = createRef<HTMLButtonElement>();
    render(
      <>
        <Button ref={a} aria-keyshortcuts="Control+J">A</Button>
        <IconButton ref={b} icon="plus" label="B" aria-keyshortcuts="Control+K" />
      </>,
    );
    expect(a.current?.getAttribute('aria-keyshortcuts')).toBe('Control+J');
    expect(b.current?.getAttribute('aria-keyshortcuts')).toBe('Control+K');
  });

  it('a caller ref does not cost the tooltip its Escape inside a dialog', async () => {
    const onEscape = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <div role="dialog">
        <IconButton ref={ref} icon="plus" label="Go" />
      </div>,
    );
    screen.getByRole('dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') onEscape(); });
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(ref.current);
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('busy', () => {
  it.each(pressables)('%s pends: the pulse shows, the name stays, a press does nothing', async (_n, make) => {
    const onPress = vi.fn();
    render(make({ busy: true, onPress }));
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.hasAttribute('data-pending')).toBe(true);
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('[aria-hidden="true"] > span, [aria-hidden="true"]')).not.toBeNull();
    await userEvent.click(el);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('IconButton: the pulse replaces the icon, and ending the busy state brings the icon back and frees the press', async () => {
    const onPress = vi.fn();
    const { rerender } = render(<IconButton icon="plus" label="Go" busy onPress={onPress} />);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.querySelector('svg')).toBeNull();
    rerender(<IconButton icon="plus" label="Go" onPress={onPress} />);
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('busy outranks isDisabled and a reason: pending, not soft-disabled', () => {
    render(<IconButton icon="plus" label="Go" busy isDisabled disabledReason={REASON} />);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.hasAttribute('data-pending')).toBe(true);
    expect(el.hasAttribute('data-disabled')).toBe(false);
  });

  it('a busy Button with a reason shows the pending state, not the reason', () => {
    render(<Button busy isDisabled disabledReason={REASON}>Go</Button>);
    const el = screen.getByRole('button', { name: /Go/ });
    expect(el.hasAttribute('data-pending')).toBe(true);
    expect(el).not.toHaveAccessibleDescription();
  });

  it('FileButton busy opens no picker and holds the input', async () => {
    const { container } = render(<FileButton label="Upload" busy onFiles={() => undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(click).not.toHaveBeenCalled();
    expect(input.disabled).toBe(true);
  });
});

describe('disabledReason', () => {
  it.each(pressables)('%s stays focusable, never acts, and describes itself; the name stays its own', async (_n, make) => {
    const onPress = vi.fn();
    render(make({ isDisabled: true, disabledReason: REASON, onPress }));
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el).toHaveAccessibleDescription(REASON);
    expect(el).not.toBeDisabled();
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(el);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(el);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(pressables)('%s shows the reason as its tooltip on focus', async (_n, make) => {
    render(make({ isDisabled: true, disabledReason: REASON }));
    await userEvent.tab();
    expect((await screen.findByRole('tooltip')).textContent).toContain(REASON);
  });

  it.each(pressables)('%s without isDisabled ignores the reason (it is an ordinary button)', async (_n, make) => {
    const onPress = vi.fn();
    render(make({ disabledReason: REASON, onPress }));
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a soft-disabled submit button does not send its form, by Enter or by click', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" isDisabled disabledReason={REASON}>Save</Button>
        <IconButton type="submit" icon="plus" label="Add" isDisabled disabledReason={REASON} />
        <TextButton type="submit" isDisabled disabledReason={REASON}>Send</TextButton>
      </form>,
    );
    const user = userEvent.setup();
    for (const name of ['Save', 'Add', 'Send']) {
      const el = screen.getByRole('button', { name });
      await user.click(el);
      el.focus();
      await user.keyboard('{Enter}');
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('turning a soft-disabled button on again removes aria-disabled and the description, and frees the press', async () => {
    const onPress = vi.fn();
    const { rerender } = render(<Button isDisabled disabledReason={REASON} onPress={onPress}>Go</Button>);
    rerender(<Button onPress={onPress}>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    expect(el).not.toHaveAccessibleDescription();
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(pressables)('%s: turning on with its reason kept is the same element, keeps focus, and frees the press', async (_, make) => {
    const onPress = vi.fn();
    const { rerender } = render(make({ isDisabled: true, disabledReason: REASON, onPress }));
    const el = screen.getByRole('button', { name: /Go/ });
    expect(el).toHaveAttribute('aria-disabled', 'true');
    el.focus();
    rerender(make({ disabledReason: REASON, onPress }));
    expect(screen.getByRole('button', { name: /Go/ })).toBe(el);
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    expect(el).not.toHaveAccessibleDescription();
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(softAll)('%s: a caller key handler does not run while soft-disabled', async (_n, make) => {
    const onKeyDown = vi.fn();
    const onKeyUp = vi.fn();
    render(make({ isDisabled: true, disabledReason: REASON, onKeyDown, onKeyUp }));
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onKeyUp).not.toHaveBeenCalled();
  });

  it.each(softAll)('%s: a reason that comes and goes is the same element, keeps focus, and frees the press', async (_n, make) => {
    const onPress = vi.fn();
    const { rerender } = render(make({ isDisabled: true, disabledReason: REASON, onPress }));
    const el = document.querySelector<HTMLElement>('button, a')!;
    el.focus();
    rerender(make({ onPress }));
    expect(document.activeElement).toBe(el);
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    expect(el.hasAttribute('data-disabled')).toBe(false);
    expect(el).not.toHaveAccessibleDescription();
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(make({ isDisabled: true, disabledReason: REASON, onPress }));
    expect(document.activeElement).toBe(el);
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el).toHaveAccessibleDescription(REASON);
    await userEvent.click(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a caller aria-disabled survives the soft state ending', () => {
    const { rerender } = render(<Button aria-disabled="true" isDisabled disabledReason={REASON}>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    rerender(<Button aria-disabled="true" disabledReason={REASON}>Go</Button>);
    expect(el.getAttribute('aria-disabled')).toBe('true');
  });

  it.each(softAll)('%s: no handler a caller passes runs while soft-disabled, capture and auxiliary ones included', (_n, make) => {
    const handlers = {
      onClickCapture: vi.fn(), onPointerDownCapture: vi.fn(), onMouseDownCapture: vi.fn(), onAuxClick: vi.fn(), onContextMenu: vi.fn(), onDoubleClick: vi.fn(), onPointerMove: vi.fn(),
      // React Aria forwards onFocus and onBlur (through useFocusable); it passes no focus or blur capture handler on at all.
      onFocus: vi.fn(), onBlur: vi.fn(),
    };
    const fire = (el: HTMLElement) => {
      el.focus();
      el.blur();
      fireEvent.pointerDown(el);
      fireEvent.mouseDown(el);
      fireEvent.click(el);
      fireEvent(el, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
      fireEvent.contextMenu(el);
      fireEvent.doubleClick(el);
      fireEvent.pointerMove(el);
    };
    // The same handlers on the enabled control prove each event reaches React here.
    const { unmount } = render(make({ ...handlers } as never));
    fire(document.querySelector<HTMLElement>('button, a')!);
    for (const [name, fn] of Object.entries(handlers)) expect(fn, `${name} runs on the enabled control`).toHaveBeenCalled();
    unmount();
    for (const fn of Object.values(handlers)) fn.mockClear();
    render(make({ isDisabled: true, disabledReason: REASON, ...handlers } as never));
    fire(document.querySelector<HTMLElement>('button, a')!);
    for (const [name, fn] of Object.entries(handlers)) expect(fn, `${name} while soft-disabled`).not.toHaveBeenCalled();
  });

  it('a LinkButton enabled and given a new href in the same update goes to the new href', () => {
    const { rerender } = render(<LinkButton href="#/c" isDisabled disabledReason={REASON}>Go</LinkButton>);
    const el = screen.getByRole('link', { name: 'Go' });
    rerender(<LinkButton href="#/c/42">Go</LinkButton>);
    expect(screen.getByRole('link', { name: 'Go' })).toBe(el);
    expect(el.getAttribute('href')).toBe('#/c/42');
    expect(el.hasAttribute('role')).toBe(false);
  });

  it.each(pressables.flatMap(([n, make]) => [
    [n, 'set while soft', make, undefined, 'true', false],
    [n, 'dropped while soft', make, 'true', undefined, false],
    [n, 'set as the soft state ends', make, undefined, 'true', true],
  ] as const))('%s: a caller aria-disabled %s is the one left when the soft state ends', (_n, _w, make, before, after, sameCommit) => {
    const { rerender } = render(make({ 'aria-disabled': before, isDisabled: true, disabledReason: REASON } as never));
    const el = document.querySelector<HTMLElement>('button')!;
    if (!sameCommit) {
      rerender(make({ 'aria-disabled': after, isDisabled: true, disabledReason: REASON } as never));
      expect(el.getAttribute('aria-disabled')).toBe('true');
    }
    rerender(make({ 'aria-disabled': after } as never));
    expect(el.getAttribute('aria-disabled')).toBe(after ?? null);
  });

  it.each(pressables)('%s: soft-disabled, then busy while still disabled, shows the pending state and no disabled mark', (_n, make) => {
    const { rerender } = render(make({ isDisabled: true, disabledReason: REASON }));
    const el = document.querySelector<HTMLElement>('button')!;
    rerender(make({ isDisabled: true, disabledReason: REASON, busy: true }));
    expect(document.querySelector('button')).toBe(el);
    expect(el.hasAttribute('data-disabled')).toBe(false);
    expect(el.hasAttribute('data-pending')).toBe(true);
  });

  it('a soft-disabled LinkButton with an empty href is React Aria\'s span link, and stays one when it turns on', () => {
    const { rerender } = render(<LinkButton href="" isDisabled disabledReason={REASON}>Go</LinkButton>);
    const el = screen.getByRole('link', { name: 'Go' });
    expect(el.tagName).toBe('SPAN');
    rerender(<LinkButton href="">Go</LinkButton>);
    expect(el.hasAttribute('href')).toBe(false);
    expect(el.getAttribute('role')).toBe('link');
  });

  it.each(softAll)('%s: scrolling what holds the control closes its reason, as any tooltip', async (_n, make) => {
    render(<div data-testid="scroller" style={{ overflow: 'auto', height: 40 }}>{make({ isDisabled: true, disabledReason: REASON })}</div>);
    await userEvent.tab();
    await screen.findByRole('tooltip');
    fireEvent.scroll(screen.getByTestId('scroller'));
    // Closed or closing (jsdom does not finish an exit animation).
    await waitFor(() => expect(screen.queryByRole('tooltip')?.hasAttribute('data-exiting') ?? true).toBe(true));
  });

  it('ending the soft state while still disabled hands back to the plain disabled button', () => {
    const { rerender } = render(<Button isDisabled disabledReason={REASON}>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    rerender(<Button isDisabled>Go</Button>);
    expect(el).toBeDisabled();
    expect(el.hasAttribute('data-disabled')).toBe(true);
    expect(el.hasAttribute('aria-disabled')).toBe(false);
  });

  it('a soft-disabled LinkButton keeps its focus, gets its href back, the current one, and loses the role it borrowed', () => {
    const { rerender } = render(<LinkButton href="/a" isDisabled disabledReason={REASON}>Go</LinkButton>);
    const el = screen.getByRole('link', { name: 'Go' });
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('tabindex')).toBe('0');
    rerender(<LinkButton href="/b" isDisabled disabledReason={REASON}>Go</LinkButton>);
    expect(el.getAttribute('href')).toBeNull();
    rerender(<LinkButton href="/b">Go</LinkButton>);
    expect(screen.getByRole('link', { name: 'Go' })).toBe(el);
    expect(el.getAttribute('href')).toBe('/b');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.hasAttribute('role')).toBe(false);
  });

  it.each(softAll)('%s: Escape hides the reason and still reaches the dialog around it', async (_n, make) => {
    const onEscape = vi.fn();
    render(<div role="dialog">{make({ isDisabled: true, disabledReason: REASON })}</div>);
    screen.getByRole('dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') onEscape(); });
    await userEvent.tab();
    await screen.findByRole('tooltip');
    await userEvent.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
    // Closed or closing: jsdom does not finish IconButton's exit animation, so softDisabled.spec.ts proves "gone" in a browser.
    await waitFor(() => expect(screen.queryByRole('tooltip')?.hasAttribute('data-exiting') ?? true).toBe(true));
  });

  it.each(softAll)('%s: a press away closes a reason a tap opened', async (_n, make) => {
    render(<>{make({ isDisabled: true, disabledReason: REASON })}<output>away</output></>);
    const user = userEvent.setup();
    await user.click(document.querySelector<HTMLElement>('button, a')!);
    await screen.findByRole('tooltip');
    await user.click(screen.getByText('away'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  // The click above also moves focus, so the blur alone would close the reason. Where a click does
  // not move focus (Safari), only the press away closes it: a pointerdown elsewhere with focus kept on the control.
  it.each(softAll)('%s: a press away closes the reason even when focus stays on the control', async (_n, make) => {
    render(<>{make({ isDisabled: true, disabledReason: REASON })}<output>away</output></>);
    const el = document.querySelector<HTMLElement>('button, a')!;
    await userEvent.setup().click(el);
    await screen.findByRole('tooltip');
    fireEvent.pointerDown(screen.getByText('away'));
    expect(document.activeElement).toBe(el);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  describe('a handler from context', () => {
    const inPopover = (trigger: ReactElement) => <Popover label="Things" trigger={trigger}><p>inside</p></Popover>;
    const inMenu = (trigger: ReactElement) => (
      <MenuTrigger>
        {trigger}
        <AriaPopover><Menu aria-label="Things"><MenuItem>inside</MenuItem></Menu></AriaPopover>
      </MenuTrigger>
    );
    it.each([['Popover', inPopover], ['Menu', inMenu]] as const)('%s: the enabled trigger opens it, and the soft-disabled one does not, by click or key', async (_n, wrap) => {
      const user = userEvent.setup();
      const soft = render(wrap(<Button isDisabled disabledReason={REASON}>Open</Button>));
      const el = screen.getByRole('button', { name: 'Open' });
      await user.click(el);
      expect(screen.queryByText('inside')).toBeNull();
      el.focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(screen.queryByText('inside')).toBeNull();
      soft.unmount();
      render(wrap(<Button>Open</Button>));
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(await screen.findByText('inside')).toBeTruthy();
    });
  });

  it("a caller's Tooltip works on an enabled control that has a reason, and the reason takes over while it is disabled", async () => {
    const user = userEvent.setup();
    const tree = (isDisabled: boolean) => <Tooltip content="Help"><Button isDisabled={isDisabled} disabledReason={REASON}>Go</Button></Tooltip>;
    const { rerender } = render(tree(false));
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toContain('Help');
    await user.tab();
    rerender(tree(true));
    await user.tab();
    // By keyboard the caller's own shows too: only the pointer is stopped from reaching it.
    await waitFor(() => expect(screen.getAllByRole('tooltip').map((n) => n.textContent)).toContain(REASON));
  });

  it('IconButton description stays as the alias, and disabledReason wins over it', () => {
    render(
      <>
        <IconButton icon="plus" label="A" isDisabled description="old" />
        <IconButton icon="plus" label="B" isDisabled description="old" disabledReason="new" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAccessibleDescription('old');
    expect(screen.getByRole('button', { name: 'B' })).toHaveAccessibleDescription('new');
  });

  it.each([['with the glyph', 'primary'], ['plain', 'ghost']] as const)('LinkButton, %s: focusable, no href, describes itself', async (_n, variant) => {
    render(<LinkButton href="/x" variant={variant} isDisabled disabledReason={REASON}>Go</LinkButton>);
    const el = screen.getByRole('link', { name: 'Go' });
    expect(el.getAttribute('href')).toBeNull();
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el).toHaveAccessibleDescription(REASON);
    await userEvent.tab();
    expect(document.activeElement).toBe(el);
    expect((await screen.findByRole('tooltip')).textContent).toContain(REASON);
  });

  it('LinkButton without isDisabled keeps its href and ignores the reason', () => {
    render(<LinkButton href="/x" disabledReason={REASON}>Go</LinkButton>);
    expect(screen.getByRole('link', { name: 'Go' }).getAttribute('href')).toBe('/x');
  });

  it('FileButton passes the reason on and opens no picker', async () => {
    const { container } = render(<FileButton label="Upload" isDisabled disabledReason={REASON} onFiles={() => undefined} />);
    const click = vi.spyOn(container.querySelector('input[type="file"]') as HTMLInputElement, 'click');
    const el = screen.getByRole('button', { name: 'Upload' });
    expect(el).toHaveAccessibleDescription(REASON);
    fireEvent.click(el);
    await userEvent.click(el);
    expect(click).not.toHaveBeenCalled();
  });
});

describe('xs', () => {
  it('never carries the end glyph, whatever the variant or request', () => {
    for (const variant of ['primary', 'secondary'] as const) {
      expect(chipFor({ variant, size: 'xs', hasEnd: false })).toBe(false);
      expect(chipFor({ variant, size: 'xs', hasEnd: true, chip: true })).toBe(false);
      const { unmount } = render(<Button size="xs" variant={variant} chip iconEnd="chevron-down">Tiny</Button>);
      const b = screen.getByRole('button', { name: 'Tiny' });
      expect(b).not.toHaveAttribute('data-glyph');
      expect(b.querySelector('[data-glyph-mark]')).toBeNull();
      unmount();
    }
  });

  it('Button, IconButton and LinkButton take the size class', () => {
    render(
      <>
        <Button size="xs">A</Button>
        <IconButton size="xs" icon="plus" label="B" />
        <LinkButton size="xs" href="/x">C</LinkButton>
      </>,
    );
    for (const el of [screen.getByRole('button', { name: 'A' }), screen.getByRole('button', { name: 'B' }), screen.getByRole('link', { name: 'C' })]) expect(el.className).toMatch(/\bxs\b|_xs_/);
  });
});
