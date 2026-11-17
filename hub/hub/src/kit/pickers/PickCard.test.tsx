// Vitest: a PickCard on its own is one button named by its title, end tag and line and described by its note
// and mono line; "you were here" adds an ink frame and its words; the card cuts its corner and draws the ring only as
// the outermost card.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CardScope } from '../layouts/CardEdge';
import { SLOTS, SLOT_TYPES } from '../layouts/anatomy/slots';
import { PickCard, PickCardRow } from './PickCard';

const card = (props: Partial<Parameters<typeof PickCard>[0]> = {}) => (
  <PickCard
    title="Uptime Kuma"
    end="Web page"
    line="Uptime monitor with a status page"
    note="Know when one of your sites goes down."
    meta="louislam/uptime-kuma · Node · MIT"
    onPress={() => undefined}
    {...props}
  />
);

describe('PickCard', () => {
  it('is one button: name from title, end tag and line; description from note and mono line', () => {
    let pressed = 0;
    render(card({ onPress: () => pressed++ }));
    const btn = screen.getByRole('button');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(btn).toHaveAccessibleName('Uptime Kuma Web page Uptime monitor with a status page');
    expect(btn).toHaveAccessibleDescription('Know when one of your sites goes down. louislam/uptime-kuma · Node · MIT');
    fireEvent.click(btn);
    expect(pressed).toBe(1);
  });

  it('leaves out what it is not given: no mark column, no note in the description', () => {
    render(<PickCard title="lazygit" meta="jesseduffield/lazygit" onPress={() => undefined} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName('lazygit');
    expect(btn).toHaveAccessibleDescription('jesseduffield/lazygit');
    expect(btn.className).toMatch(/noMark/);
  });

  it('"you were here" is a frame plus words in the mono line, never the frame alone', () => {
    render(card({ here: 'You opened this' }));
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('data-here');
    expect(btn.className).toMatch(/\bhere\b/);
    expect(btn.querySelector('[data-here-words]')).toHaveTextContent('You opened this');
    expect(btn).toHaveAccessibleDescription('Know when one of your sites goes down. louislam/uptime-kuma · Node · MIT You opened this');
  });

  it('selected: the frame and bar of the current choice, said by aria-pressed; unselected says false; absent says nothing', () => {
    const { rerender } = render(card({ isSelected: true }));
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveAttribute('data-selected');
    expect(btn.className).toMatch(/\bhere\b/);
    rerender(card({ isSelected: false }));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button')).not.toHaveAttribute('data-selected');
    rerender(card());
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });

  it('disabled: soft-disabled (still focusable), a press does nothing, the reason ends the mono line and the description', () => {
    let pressed = 0;
    render(card({ isDisabled: true, disabledReason: 'Needs a running computer', onPress: () => pressed++ }));
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    expect(btn.className).toMatch(/\boff\b/);
    act(() => btn.focus());
    expect(btn).toHaveFocus();
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyUp(btn, { key: 'Enter' });
    expect(pressed).toBe(0);
    expect(btn.querySelector('[data-off-words]')).toHaveTextContent('Needs a running computer');
    expect(btn).toHaveAccessibleDescription('Know when one of your sites goes down. louislam/uptime-kuma · Node · MIT Needs a running computer');
  });

  it('the reason takes the place of the "you were here" words while the card is off', () => {
    render(card({ isDisabled: true, disabledReason: 'Full', here: 'You opened this' }));
    const btn = screen.getByRole('button');
    expect(btn.querySelector('[data-here-words]')).toBeNull();
    expect(btn).toHaveAccessibleDescription('Know when one of your sites goes down. louislam/uptime-kuma · Node · MIT Full');
  });

  it('"you were here" words alone make a mono line when there is no meta', () => {
    render(<PickCard title="Memos" here="You opened this" onPress={() => undefined} />);
    expect(screen.getByRole('button')).toHaveAccessibleDescription('You opened this');
  });

  it('outermost: cut corner, edge and ring path; nested in a card: square, no edge', () => {
    const { container, unmount } = render(card());
    const out = container.querySelector('[data-pick-card]')!;
    expect(out).toHaveAttribute('data-card-cut');
    expect(out).toHaveAttribute('data-card-ring');
    expect(out.querySelector('svg[data-card-edge]')).not.toBeNull();
    unmount();
    const nested = render(<CardScope>{card()}</CardScope>);
    const inner = nested.container.querySelector('[data-pick-card]')!;
    expect(inner).not.toHaveAttribute('data-card-cut');
    expect(inner.querySelector('svg[data-card-edge]')).toBeNull();
  });

  it('the slot table admits nothing pressable into a card (anatomy: one interactive owner)', () => {
    expect(SLOTS.PickCard).toEqual({ mark: 'card-mark', end: 'card-tag', line: 'card-text', note: 'card-text', meta: 'card-text' });
    const pressable = ['Tag', 'Link', 'FaqLink', 'ComputerLink', 'AddressText', 'AddressRow', 'IdChip', 'Ids', 'CopyButton', 'Button', 'IconButton', 'TextButton', 'LinkButton', 'ErrorDetails', 'IpInfo', 'InfoTip'];
    for (const type of ['card-mark', 'card-tag', 'card-text'] as const) for (const name of SLOT_TYPES[type]) expect(pressable).not.toContain(name);
  });

  it('a pressable piece carried in through a node prop (an indirect value) is refused in development, in a grid too', () => {
    const tagged = <span>{[<button key="x" type="button">Remove</button>]}</span>;
    expect(() => render(card({ end: tagged }))).toThrow(/holds a <button>/);
    const link = <a href="https://example.com">site</a>;
    expect(() => render(<PickCardRow.Provider value={{ hovered: false, pressed: false, focusVisible: false }}>{card({ mark: link })}</PickCardRow.Provider>)).toThrow(/holds a <a>/);
  });

  it('native controls and focus targets (summary, iframe, media with controls, contenteditable) are refused too, standalone and in a grid', () => {
    const inGrid = (node: ReturnType<typeof card>) => <PickCardRow.Provider value={{ hovered: false, pressed: false, focusVisible: false }}>{node}</PickCardRow.Provider>;
    const native: [ReactElement, RegExp][] = [
      [<details key="d"><summary>More</summary>x</details>, /holds a <summary>/],
      [<iframe key="i" title="frame" />, /holds a <iframe>/],
      [<audio key="a" controls><track kind="captions" /></audio>, /holds a <audio>/],
      [<video key="v" controls><track kind="captions" /></video>, /holds a <video>/],
      [<span key="c" contentEditable suppressContentEditableWarning>edit</span>, /holds a <span>/],
    ];
    for (const [node, msg] of native) {
      expect(() => render(card({ end: <span>{node}</span> }))).toThrow(msg);
      expect(() => render(inGrid(card({ mark: <span>{node}</span> })))).toThrow(msg);
    }
    // Media without controls is not a focus target: the card draws it.
    expect(() => render(card({ end: <video><track kind="captions" /></video> }))).not.toThrow();
  });

  it('a control a piece mounts later on its own, without the card rendering again, is refused in development', async () => {
    let open: () => void = () => {};
    function Late() {
      const [on, setOn] = useState(false);
      open = () => setOn(true);
      return <span>{on ? <button type="button">Remove</button> : 'tag'}</span>;
    }
    for (const wrap of [(n: ReturnType<typeof card>) => n, (n: ReturnType<typeof card>) => <PickCardRow.Provider value={{ hovered: false, pressed: false, focusVisible: false }}>{n}</PickCardRow.Provider>]) {
      const view = render(wrap(card({ end: <Late /> })));
      await expect(act(async () => open())).rejects.toThrow(/holds a <button>/);
      view.unmount();
    }
  });

  it('the later-mount watch stops when the card unmounts', () => {
    const seen: MutationObserver[] = [];
    const Real = globalThis.MutationObserver;
    class Spy extends Real {
      constructor(cb: MutationCallback) {
        super(cb);
        seen.push(this);
      }
      gone = false;
      override disconnect() {
        this.gone = true;
        super.disconnect();
      }
    }
    globalThis.MutationObserver = Spy;
    try {
      const view = render(card({}));
      const mine = seen as Spy[];
      expect(mine.length).toBeGreaterThan(0);
      view.unmount();
      expect(mine.every((o) => o.gone)).toBe(true);
    } finally {
      globalThis.MutationObserver = Real;
    }
  });

  it('a card outside a CardGrid without onPress is refused in development', () => {
    expect(() => render(<PickCard title="Nothing to do" />)).toThrow(/needs onPress/);
  });
});
