// ActionMenu item descriptions: an item may carry one short line under its label
// that says what it does, shown whether or not the item is enabled and wired as its accessible description. A disabled
// item's reason takes that line's place. Items without a description render exactly as before.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import type { ReactElement } from 'react';
import { ActionMenu, type MenuEntry } from './Overlays';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const DESC = 'It opens these logs for anyone who already has access to this computer';
const REASON = 'Stop it first';
const openMenu = async (entries: readonly MenuEntry[], label = 'Actions') => {
  render(<ActionMenu label={label} items={entries} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
  return screen.getByRole('menu');
};
const item = (name: string) => screen.getByRole('menuitem', { name });
const descLine = (el: HTMLElement) => el.querySelector('[slot="description"]');
// Generated ids differ per render: compare markup with them blanked.
const norm = (html: string) =>
  html.replace(/ (id|aria-labelledby|aria-describedby|data-collection)="([^"]*)"/g, (_m, name: string, v: string) =>
    ` ${name}="${v.split(' ').map(() => 'ID').join(' ')}"`);

describe('ActionMenu: an item description', () => {
  it('shows under the label of an enabled item and is its accessible description', async () => {
    await openMenu([
      { id: 'link', label: 'Copy link', icon: 'link', description: DESC, onAction: () => undefined },
      { id: 'open', label: 'Open', onAction: () => undefined },
    ]);
    const link = item('Copy link');
    expect(descLine(link)).toHaveTextContent(DESC);
    expect(link).toHaveAccessibleDescription(DESC);
    expect(link).not.toHaveAttribute('aria-disabled');
  });

  it('gives way to the reason while the item is disabled', async () => {
    await openMenu([
      { id: 'start', label: 'Start', description: 'Starts the computer', isDisabled: true, disabledReason: REASON, onAction: () => undefined },
    ]);
    const start = item('Start');
    expect(start).toHaveAccessibleDescription(REASON);
    expect(start.querySelectorAll('[slot="description"]')).toHaveLength(1);
    expect(start).not.toHaveTextContent('Starts the computer');
  });

  it('an enabled item never shows its reason: its description, or nothing', async () => {
    await openMenu([
      { id: 'start', label: 'Start', description: 'Starts the computer', disabledReason: REASON, onAction: () => undefined },
      { id: 'stop', label: 'Stop', disabledReason: REASON, onAction: () => undefined },
    ]);
    expect(item('Start')).toHaveAccessibleDescription('Starts the computer');
    expect(item('Start')).not.toHaveTextContent(REASON);
    expect(descLine(item('Stop'))).toBeNull();
    expect(item('Stop')).not.toHaveAttribute('aria-describedby');
  });

  it('stays on a disabled item that has no reason', async () => {
    await openMenu([
      { id: 'start', label: 'Start', description: 'Starts the computer', isDisabled: true, onAction: () => undefined },
    ]);
    expect(item('Start')).toHaveAccessibleDescription('Starts the computer');
  });

  it('a check item carries it too', async () => {
    await openMenu([{ id: 'wrap', label: 'Wrap', checked: false, description: 'Wraps long lines', onAction: () => undefined }]);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Wrap' })).toHaveAccessibleDescription('Wraps long lines');
  });

  // The menu stays open while its items change (a reason or description arriving or going): the line under the
  // label and the item's accessible description move together, and the focused item keeps focus.
  const live = (rerender: (ui: ReactElement) => void, entries: readonly MenuEntry[]) =>
    rerender(<ActionMenu label="Actions" items={entries} isOpen onOpenChange={() => undefined} />);
  const mountOpen = (entries: readonly MenuEntry[]) =>
    render(<ActionMenu label="Actions" items={entries} isOpen onOpenChange={() => undefined} />);
  const linked = (el: HTMLElement) => {
    const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return ids.length > 0 && ids.every((id) => document.getElementById(id) !== null);
  };

  it('a description added to an open item becomes its accessible description, focus kept', async () => {
    const plain: MenuEntry[] = [{ id: 'link', label: 'Copy link', onAction: () => undefined }];
    const { rerender } = mountOpen(plain);
    item('Copy link').focus();
    await act(async () => live(rerender, [{ ...(plain[0] as object), description: DESC } as MenuEntry]));
    const link = item('Copy link');
    expect(link).toHaveAccessibleDescription(DESC);
    expect(linked(link)).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it('a description removed from an open item leaves no dangling description, focus kept', async () => {
    const withDesc: MenuEntry[] = [{ id: 'link', label: 'Copy link', description: DESC, onAction: () => undefined }];
    const { rerender } = mountOpen(withDesc);
    item('Copy link').focus();
    await act(async () => live(rerender, [{ id: 'link', label: 'Copy link', onAction: () => undefined }]));
    const link = item('Copy link');
    expect(descLine(link)).toBeNull();
    expect(link).not.toHaveAttribute('aria-describedby');
    expect(document.activeElement).toBe(link);
  });

  it('a reason arriving and going on an open item (it becomes disabled, then enabled) follows the same rule', async () => {
    const on: MenuEntry = { id: 'start', label: 'Start', onAction: () => undefined };
    const { rerender } = mountOpen([on]);
    item('Start').focus();
    await act(async () => live(rerender, [{ ...on, isDisabled: true, disabledReason: REASON }]));
    expect(item('Start')).toHaveAccessibleDescription(REASON);
    expect(linked(item('Start'))).toBe(true);
    expect(document.activeElement).toBe(item('Start'));
    await act(async () => live(rerender, [on]));
    expect(item('Start')).not.toHaveAttribute('aria-describedby');
    expect(document.activeElement).toBe(item('Start'));
  });

  it('an item whose id has spaces still points at its own line', async () => {
    await openMenu([{ id: 'view: my errors', label: 'Open “my errors”', description: 'Saved yesterday', onAction: () => undefined }]);
    const v = item('Open “my errors”');
    expect(v).toHaveAccessibleDescription('Saved yesterday');
    expect(linked(v)).toBe(true);
  });

  it('items without a description render exactly as before', async () => {
    const menu = await openMenu(
      [
        { id: 'a', label: 'Open', icon: 'link', onAction: () => undefined },
        { id: 'b', label: 'Stop', isDisabled: true, disabledReason: 'Why', onAction: () => undefined },
        { id: 'c', label: 'Start', isDisabled: true, onAction: () => undefined },
        { id: 'd', label: 'Copy', copy: 'x', shortcut: 'C', onAction: () => undefined },
      ],
      'M',
    );
    expect(norm(menu.outerHTML)).toBe(BEFORE);
    expect(item('Open')).not.toHaveAttribute('aria-describedby');
  });
});

// The menu above as rendered before descriptions existed (ids blanked), with one deliberate change:
// the lead column is a `.lead` span, holding the icon or nothing, where an icon-less row had `.iconGap`.
const BEFORE =
  "<div id=\"ID\" class=\"menu\" data-rac=\"\" aria-labelledby=\"ID\" aria-label=\"M\" role=\"menu\" tabindex=\"-1\" data-collection=\"ID\"><section class=\"section\" data-rac=\"\" role=\"group\"><div class=\"item\" data-rac=\"\" id=\"ID\" role=\"menuitem\" aria-labelledby=\"ID\" tabindex=\"0\" data-collection=\"ID\" data-key=\"a\" data-react-aria-pressable=\"true\" data-focused=\"true\" data-focus-visible=\"true\"><span class=\"lead\" data-lead=\"\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"></path></svg></span><span class=\"labels\"><span class=\"label\" id=\"ID\" slot=\"label\">Open</span></span></div><div data-unavailable=\"true\" class=\"item\" data-rac=\"\" id=\"ID\" role=\"menuitem\" aria-labelledby=\"ID\" aria-describedby=\"ID\" tabindex=\"-1\" data-collection=\"ID\" data-key=\"b\" data-react-aria-pressable=\"true\" aria-disabled=\"true\"><span class=\"lead\" data-lead=\"\"></span><span class=\"labels\"><span class=\"label\" id=\"ID\" slot=\"label\">Stop</span><span class=\"reason\" id=\"ID\" slot=\"description\">Why</span></span></div><div data-unavailable=\"true\" class=\"item\" data-rac=\"\" id=\"ID\" role=\"menuitem\" aria-labelledby=\"ID\" tabindex=\"-1\" data-collection=\"ID\" data-key=\"c\" data-react-aria-pressable=\"true\" aria-disabled=\"true\"><span class=\"lead\" data-lead=\"\"></span><span class=\"labels\"><span class=\"label\" id=\"ID\" slot=\"label\">Start</span></span></div><div class=\"item\" data-rac=\"\" id=\"ID\" role=\"menuitem\" aria-labelledby=\"ID\" tabindex=\"-1\" data-collection=\"ID\" data-key=\"d\" data-react-aria-pressable=\"true\"><span class=\"lead\" data-lead=\"\"></span><span class=\"labels\"><span class=\"label\" id=\"ID\" slot=\"label\">Copy</span></span><kbd class=\"kbd\">C</kbd></div></section></div>";
