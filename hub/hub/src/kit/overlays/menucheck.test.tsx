// ActionMenu checked items: an item with `checked` is a menuitemcheckbox whose state a
// screen reader hears (aria-checked) and shows a check while on; an item without it is exactly as before.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ICON_NAMES, Icon } from '../icons';
import { ActionMenu, type MenuEntry } from './Overlays';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});

const open = async (items: readonly MenuEntry[]) => {
  render(<ActionMenu label="Layout" items={items} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Layout' })); });
  return screen.getByRole('menu');
};
const noop = () => undefined;
// The menu's markup with React Aria's generated ids renamed in order of first use (id1, id2, …), the same name in
// every attribute that holds or points at that id, so two renders compare by structure, text, keys, tab stops and
// which element each label or description reference targets. A reference to an element outside the compared part
// (the menu's label is its trigger) is named by what it points at and where that element sits in the document (its
// index among all elements), so a look-alike elsewhere with the same role and label reads differently; one that points
// at nothing reads "missing".
const ID_ATTRS = /\b(id|for|aria-labelledby|aria-describedby|aria-controls|data-collection)="([^"]*)"/g;
const REF_ATTRS = new Set(['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']);
const markup = (el: Element) => {
  const names = new Map<string, string>();
  let n = 0;
  const name = (v: string, ref: boolean) => {
    if (!names.has(v)) {
      const t = ref ? document.getElementById(v) : null;
      names.set(v, !ref || (t && el.contains(t)) ? `id${++n}` : t ? `ext:${t.getAttribute('role') ?? t.tagName.toLowerCase()}:${t.getAttribute('aria-label') ?? t.textContent ?? ''}@${[...document.querySelectorAll('*')].indexOf(t)}` : 'missing');
    }
    return names.get(v)!;
  };
  return el.outerHTML.replace(ID_ATTRS, (_m, attr: string, v: string) => `${attr}="${v.split(' ').filter(Boolean).map((x) => name(x, REF_ATTRS.has(attr))).join(' ')}"`);
};
// Which kit icon an svg is: the kit's svg carries no name, so it is matched by viewBox and body against every kit icon
// rendered the same way. A body two icons share reads as both names; one no kit icon has reads "?".
const iconName = (() => {
  let byBody: Map<string, string> | undefined;
  const key = (svg: Element) => `${svg.getAttribute('viewBox')}|${svg.innerHTML}`;
  return (svg: Element | null) => {
    if (!svg) return '';
    if (!byBody) {
      const box = document.createElement('div');
      const r = render(<>{ICON_NAMES.map((n) => <Icon key={n} name={n} />)}</>, { container: box });
      const svgs = [...box.querySelectorAll('svg')];
      if (svgs.length !== ICON_NAMES.length) throw new Error(`rendered ${svgs.length} icons for ${ICON_NAMES.length} names`);
      const m = new Map<string, string>();
      ICON_NAMES.forEach((n, i) => {
        const k = key(svgs[i]!);
        const had = m.get(k);
        m.set(k, had ? `${had}|${n}` : n);
      });
      r.unmount();
      byBody = m;
    }
    return byBody.get(key(svg)) ?? '?';
  };
})();
// What each item reads as: its role, the text its aria-labelledby and aria-describedby point at, its icon's name and
// shortcut, whether it is disabled or danger; groups by whether a separator leads them.
const summary = (menu: Element) =>
  [...menu.querySelectorAll('[role="group"]')].map((g) => ({
    sep: !!g.querySelector(':scope > [role="separator"]'),
    items: [...g.querySelectorAll('[role^="menuitem"]')].map((el) => {
      const text = (attr: string) => (el.getAttribute(attr) ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '?').join(' ');
      return {
        role: el.getAttribute('role'),
        label: text('aria-labelledby'),
        line: text('aria-describedby'),
        // The icon sits in the lead column (`.lead`, where it was the row's own svg).
        icon: iconName(el.querySelector(':scope > [data-lead] svg')),
        kbd: el.querySelector('kbd')?.textContent ?? '',
        disabled: el.getAttribute('aria-disabled') === 'true',
        danger: /\bdanger\b/.test(el.className),
      };
    }),
  }));
const RICH: MenuEntry[] = [
  { id: 'a', label: 'Grid', icon: 'copy', shortcut: 'G', onAction: noop },
  { id: 'b', label: 'Rename', opens: true, description: 'Pick a new name', onAction: noop },
  { id: 'c', label: 'Copy id', copy: 'id-1', onAction: noop },
  '-',
  { id: 'd', label: 'Restart', isDisabled: true, disabledReason: 'Stop it first', onAction: noop },
  { id: 'e', label: 'Delete', tone: 'danger', onAction: noop },
];

// The plain menu below (Grid, Rows with R, a separator, Equalise) as markup() reads it, taken from a recorded run.
const PLAIN_MARKUP = [
  '<div id="id1" class="menu" data-rac="" aria-labelledby="ext:button:Layout@5" aria-label="Layout" role="menu" tabindex="-1" data-collection="id2">',
  '<section class="section" data-rac="" role="group">',
  '<div class="item" data-rac="" id="id3" role="menuitem" aria-labelledby="id4" tabindex="0" data-collection="id2" data-key="a" data-react-aria-pressable="true" data-focused="true" data-focus-visible="true"><span class="labels"><span class="label" id="id4" slot="label">Grid</span></span></div>',
  '<div class="item" data-rac="" id="id5" role="menuitem" aria-labelledby="id6" tabindex="-1" data-collection="id2" data-key="c" data-react-aria-pressable="true"><span class="labels"><span class="label" id="id6" slot="label">Rows</span></span><kbd class="kbd">R</kbd></div></section>',
  '<section class="section" data-rac="" role="group">',
  '<div role="separator" class="sep"></div>',
  '<div class="item" data-rac="" id="id7" role="menuitem" aria-labelledby="id8" tabindex="-1" data-collection="id2" data-key="d" data-react-aria-pressable="true"><span class="labels"><span class="label" id="id8" slot="label">Equalise</span></span></div></section></div>',
].join('');

describe('ActionMenu checked items', () => {
  it('a checked item is a menuitemcheckbox with its state; its label stays the plain name', async () => {
    await open([
      { id: 'on', label: 'Scroll', checked: true, onAction: noop },
      { id: 'off', label: 'Wrap', checked: false, onAction: noop },
    ]);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Scroll' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Wrap' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  // The lead place holds the kit box, ticked while on (it was a bare check).
  it('shows a box in place of the icon, ticked only while on', async () => {
    await open([
      { id: 'on', label: 'Scroll', icon: 'copy', checked: true, onAction: noop },
      { id: 'off', label: 'Wrap', icon: 'copy', checked: false, onAction: noop },
    ]);
    const on = screen.getByRole('menuitemcheckbox', { name: 'Scroll' });
    const off = screen.getByRole('menuitemcheckbox', { name: 'Wrap' });
    expect(on.querySelector('[data-lead] [data-box][data-on] svg')).not.toBeNull();
    expect(off.querySelector('[data-lead] [data-box]')).not.toBeNull();
    expect(off.querySelector('[data-box][data-on]')).toBeNull();
    expect(off.querySelector('svg')).toBeNull();
  });

  it('items without it keep role menuitem, no aria-checked and no selection mode, in their order beside checked ones', async () => {
    const menu = await open([
      { id: 'a', label: 'Grid', onAction: noop },
      { id: 'b', label: 'Scroll', checked: true, onAction: noop },
      { id: 'c', label: 'Rows', onAction: noop },
      '-',
      { id: 'd', label: 'Equalise', onAction: noop },
    ]);
    const all = [...menu.querySelectorAll('[role^="menuitem"]')];
    expect(all.map((el) => el.textContent)).toEqual(['Grid', 'Scroll', 'Rows', 'Equalise']);
    for (const name of ['Grid', 'Rows', 'Equalise']) {
      const el = screen.getByRole('menuitem', { name });
      expect(el).not.toHaveAttribute('aria-checked');
      expect(el).not.toHaveAttribute('data-selection-mode');
    }
    // A separator only where the page put one: the checked run adds none.
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  // Compared as markup, with icons, shortcuts, a description, a copy item, a disabled reason and a
  // danger item, not only by roles and group count.
  it('a rich menu without checked items reads as the plain menu always has (fixed baseline)', async () => {
    const it_ = (label: string, more: Partial<{ line: string; icon: string; kbd: string; disabled: boolean; danger: boolean }> = {}) =>
      ({ role: 'menuitem', label, line: '', icon: '', kbd: '', disabled: false, danger: false, ...more });
    expect(summary(await open(RICH))).toEqual([
      { sep: false, items: [it_('Grid', { icon: 'copy', kbd: 'G' }), it_('Rename…', { line: 'Pick a new name' }), it_('Copy id')] },
      { sep: true, items: [it_('Restart', { line: 'Stop it first', disabled: true })] },
      { sep: true, items: [it_('Delete', { danger: true })] },
    ]);
  });

  it('a menu whose items say checked: undefined renders the same markup as one built without the field', async () => {
    const menu = await open(RICH);
    // The menu is named by its trigger, and a label reference that points elsewhere or at nothing changes the markup.
    expect(document.getElementById(menu.getAttribute('aria-labelledby') ?? '')).toBe(screen.getByRole('button', { name: 'Layout' }));
    const without = markup(menu);
    const label = menu.getAttribute('aria-labelledby')!;
    menu.setAttribute('aria-labelledby', 'nowhere');
    expect(markup(menu).replace('aria-labelledby="missing"', '')).toBe(without.replace(/aria-labelledby="ext:button:Layout@\d+"/, ''));
    expect(markup(menu)).not.toBe(without);
    // A look-alike outside the menu (same tag, same label) is told apart by where it sits.
    const twin = document.createElement('button');
    twin.id = 'twin';
    twin.setAttribute('aria-label', 'Layout');
    document.body.append(twin);
    menu.setAttribute('aria-labelledby', 'twin');
    const retargeted = markup(menu);
    expect(retargeted.replace(/(aria-labelledby="ext:button:Layout)@\d+"/, '$1"')).toBe(without.replace(/(aria-labelledby="ext:button:Layout)@\d+"/, '$1"'));
    expect(retargeted).not.toBe(without);
    twin.remove();
    menu.setAttribute('aria-labelledby', label);
    expect(markup(menu)).toBe(without);
    cleanup();
    const withField = markup(await open(RICH.map((i) => (i === '-' ? i : { ...i, checked: undefined }))));
    expect(withField).toBe(without);
  });

  it('a checked run elsewhere in the menu leaves the plain groups\' markup unchanged', async () => {
    const groups = (menu: Element) => [...menu.querySelectorAll('[role="group"]')].filter((g) => !g.querySelector('[role="menuitemcheckbox"]')).map(markup);
    const plain = groups(await open(RICH));
    cleanup();
    // The checked group goes between the plain ones and the danger group (which always ends the menu), so every plain
    // group keeps its place and its leading separator.
    const mixed = groups(await open([...RICH, '-', { id: 'x', label: 'Wrap', checked: true, onAction: noop }]));
    expect(mixed).toEqual(plain);
    expect(plain.length).toBe(3);
  });

  // A fixed DOM baseline: the plain menu's whole normalized markup (tests use non-scoped CSS-module names, so classes
  // are the module's keys), so a removed attribute, a moved element or a changed class shows here.
  it('a menu with no checked item renders exactly the plain menu\'s fixed markup', async () => {
    const plain: MenuEntry[] = [{ id: 'a', label: 'Grid', onAction: noop }, { id: 'c', label: 'Rows', shortcut: 'R', onAction: noop }, '-', { id: 'd', label: 'Equalise', onAction: noop }];
    expect(markup(await open(plain))).toBe(PLAIN_MARKUP);
  });

  it('choosing a checked item acts once and closes the menu, by click, Enter and Space', async () => {
    for (const how of ['click', 'Enter', ' '] as const) {
      const onAction = vi.fn();
      const r = render(<ActionMenu label="Board" items={[{ id: 's', label: 'Scroll', checked: false, onAction }]} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Board' }));
      const item = await screen.findByRole('menuitemcheckbox', { name: 'Scroll' });
      if (how === 'click') await user.click(item);
      else { item.focus(); await user.keyboard(how === 'Enter' ? '{Enter}' : ' '); }
      expect(onAction).toHaveBeenCalledTimes(1);
      await act(async () => { await new Promise((res) => setTimeout(res, 20)); });
      expect(screen.queryByRole('menu')).toBeNull();
      r.unmount();
    }
  });

  // Keyboard across plain -> checked -> plain. The kit keeps a disabled item in the arrow-key order
  // (Menu.tsx header: aria-disabled, choosing it does nothing), so a disabled checked item is reached, not skipped, and
  // Space or Enter on it changes nothing.
  const MIXED = (onWrap: () => void = noop, onScroll: () => void = noop): MenuEntry[] => [
    { id: 'g', label: 'Grid', onAction: noop },
    { id: 's', label: 'Scroll', checked: true, onAction: onScroll },
    { id: 'r', label: 'Rows', onAction: noop },
    { id: 'w', label: 'Wrap', checked: false, isDisabled: true, onAction: onWrap },
    { id: 'z', label: 'Zoom', onAction: noop },
  ];

  it('arrows, Home/End and typeahead move across plain and checked items alike; a disabled checked item is reached', async () => {
    const user = userEvent.setup();
    await open(MIXED());
    const at = () => document.activeElement?.textContent;
    screen.getByRole('menuitem', { name: 'Grid' }).focus();
    const seen: (string | undefined)[] = [];
    for (const key of ['{ArrowDown}', '{ArrowDown}', '{ArrowDown}', '{ArrowDown}', '{Home}', '{End}', '{ArrowUp}']) {
      await user.keyboard(key);
      seen.push(at());
    }
    expect(seen).toEqual(['Scroll', 'Rows', 'Wrap', 'Zoom', 'Grid', 'Zoom', 'Wrap']);
    // Typeahead clears after a second of no typing; each letter starts a fresh search.
    const typed: (string | undefined)[] = [];
    for (const letter of ['s', 'r', 'w', 'g']) {
      await act(async () => { await new Promise((res) => setTimeout(res, 1100)); });
      await user.keyboard(letter);
      typed.push(at());
    }
    expect(typed).toEqual(['Scroll', 'Rows', 'Wrap', 'Grid']);
  }, 30_000);

  // Space right after typeahead is read as search text, so each key goes to a freshly opened menu (no typeahead
  // before it), and the same key on the enabled checked item in the same kind of menu shows the key does reach items.
  it.each([[' ', 'Space'], ['{Enter}', 'Enter']] as const)('%j (%s) on the disabled checked item does nothing; on an enabled one it acts', async (key, _name) => {
    const onWrap = vi.fn();
    const onScroll = vi.fn();
    const user = userEvent.setup();
    await open(MIXED(onWrap, onScroll));
    const wrap = screen.getByRole('menuitemcheckbox', { name: 'Wrap' });
    wrap.focus();
    await user.keyboard(key);
    await act(async () => { await new Promise((res) => setTimeout(res, 20)); });
    expect(onWrap).not.toHaveBeenCalled();
    expect(wrap).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    screen.getByRole('menuitemcheckbox', { name: 'Scroll' }).focus();
    await user.keyboard(key);
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it('a disabled checked item stays disabled and keeps its state', async () => {
    const onAction = vi.fn();
    await open([{ id: 's', label: 'Scroll', checked: true, isDisabled: true, onAction }]);
    const item = screen.getByRole('menuitemcheckbox', { name: 'Scroll' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('aria-checked', 'true');
    await act(async () => { fireEvent.click(item); });
    expect(onAction).not.toHaveBeenCalled();
  });
});
