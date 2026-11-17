// ActionMenu footer: at most two actions in the menu's last section ("Menu actions"), after the
// danger area, with MenuFooter's sticky look. It is part of the menu: arrows and typeahead reach it, Enter runs it and the
// menu closes with focus back on its trigger. A disabled footer item keeps its reason.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, menuSections, type MenuAction, type MenuList } from './Overlays';
import { footerSection } from './Menu';
import { menuFooterClass } from './MenuFooter';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const noop = () => undefined;
const ITEMS: MenuList = [
  { id: 'rename', label: 'Rename', onAction: noop },
  { id: 'move', label: 'Move', onAction: noop },
  { id: 'delete', label: 'Delete', tone: 'danger', onAction: noop },
];

const open = async (footer: NonNullable<Parameters<typeof ActionMenu>[0]['footer']>, items: MenuList = ITEMS) => {
  const user = userEvent.setup();
  render(<ActionMenu label="Realm" items={items} footer={footer} />);
  const trigger = screen.getByRole('button', { name: 'Realm' });
  await user.click(trigger);
  const menu = await screen.findByRole('menu');
  await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
  return { user, trigger, menu };
};
const rowNames = (menu: HTMLElement) => [...menu.querySelectorAll('[role^="menuitem"]')].map((r) => r.querySelector('[slot="label"]')?.textContent);

describe('ActionMenu footer: the menu\'s last section', () => {
  it('draws the footer as the last section, named "Menu actions", after the danger area, with the MenuFooter look', async () => {
    const { menu } = await open([{ id: 'share', label: 'Share this realm', onAction: noop }, { id: 'new', label: 'New realm', onAction: noop }]);
    expect(rowNames(menu)).toEqual(['Rename', 'Move', 'Delete', 'Share this realm', 'New realm']);
    const groups = [...menu.querySelectorAll(':scope > [role="group"], :scope > section')];
    const last = groups[groups.length - 1] as HTMLElement;
    expect(last.getAttribute('aria-label')).toBe('Menu actions');
    expect(last.className).toContain(menuFooterClass);
    expect(within(last).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Share this realm', 'New realm']);
  });

  it('arrows reach the footer items, End lands on the last one, and Enter runs it and closes with focus on the trigger', async () => {
    const run = vi.fn();
    const { user, trigger } = await open([{ id: 'share', label: 'Share this realm', onAction: noop }, { id: 'new', label: 'New realm', onAction: run }]);
    await act(async () => { screen.getAllByRole('menuitem')[0]?.focus(); });
    await user.keyboard('{End}');
    expect(document.activeElement?.textContent).toBe('New realm');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Share this realm');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('typeahead finds a footer item', async () => {
    const { user } = await open([{ id: 'new', label: 'New realm', onAction: noop }]);
    await act(async () => { screen.getAllByRole('menuitem')[0]?.focus(); });
    await user.keyboard('n');
    expect(document.activeElement?.textContent).toBe('New realm');
  });

  it('a disabled footer item stays in the arrow order with its reason as its description, and choosing it does nothing', async () => {
    const run = vi.fn();
    const { user } = await open([{ id: 'share', label: 'Share this realm', onAction: noop }, { id: 'new', label: 'New realm', isDisabled: true, disabledReason: 'Realms are full', onAction: run }]);
    await act(async () => { screen.getAllByRole('menuitem')[0]?.focus(); });
    await user.keyboard('{End}');
    const item = screen.getByRole('menuitem', { name: 'New realm' });
    expect(document.activeElement).toBe(item);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement?.textContent).toBe('Share this realm');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Realms are full');
    await user.keyboard('{Enter}');
    fireEvent.click(item);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('a menu with no footer draws no "Menu actions" section', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Realm" items={ITEMS} />);
    await user.click(screen.getByRole('button', { name: 'Realm' }));
    const menu = await screen.findByRole('menu');
    expect(menu.querySelector('[aria-label="Menu actions"]')).toBeNull();
  });
});

describe('footerSection', () => {
  const share: MenuAction = { id: 'share', label: 'Share', onAction: noop };
  it('keeps its key off every section key and item id', () => {
    const sections = menuSections([{ id: '["f"]', label: 'Odd id', onAction: noop }], 'm');
    const f = footerSection([share], sections, 'm');
    expect(f?.key).not.toBe('["f"]');
    expect(sections.map((x) => x.key)).not.toContain(f?.key);
  });
  // The section key and the item keys share one React Aria collection: the footer's own ids count too.
  const K = footerSection([share], [], 'm')?.key ?? '';
  const keysOf = (f: ReturnType<typeof footerSection>) => [f?.key, ...(f?.items.map((i) => i.action.id) ?? [])];
  it.each([0, 1])('keeps its key off the footer action ids: the colliding id is action %i', (at) => {
    const footer = at === 0 ? [{ ...share, id: K }, { ...share, id: 'new' }] : [share, { ...share, id: K }];
    const f = footerSection(footer, [], 'm');
    expect(new Set(keysOf(f)).size).toBe(3);
  });
  it('keeps its key off both an item id and a footer action id when each takes a candidate', () => {
    const sections = menuSections([{ id: K, label: 'Odd id', onAction: noop }], 'm');
    const f = footerSection([share, { ...share, id: `${K}#` }], sections, 'm');
    expect([K, `${K}#`, ...sections.map((x) => x.key)]).not.toContain(f?.key);
    expect(new Set(keysOf(f)).size).toBe(3);
  });
  it('a footer action whose id is the section key still renders as a footer row', async () => {
    const { menu } = await open([{ id: K, label: 'Share this realm', onAction: noop }]);
    expect(rowNames(menu)).toEqual(['Rename', 'Move', 'Delete', 'Share this realm']);
  });
  it('takes at most two actions: a third is a type error', () => {
    // @ts-expect-error -- reason: the footer holds the primary and at most one more action
    render(<ActionMenu label="Realm" items={ITEMS} footer={[share, { ...share, id: 's2' }, { ...share, id: 's3' }]} />);
    expect(footerSection(undefined, [], 'm')).toBeUndefined();
  });
});
