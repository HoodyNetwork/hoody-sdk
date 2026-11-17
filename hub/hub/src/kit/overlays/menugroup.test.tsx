// ActionMenu groups and reasons: a MenuGroup declares its kind (plain, one-of, on/off), its
// label or name reaches its section, and a disabled reason is said once and never lost: shared reasons lift into one note
// that describes exactly the items it is about, danger items keep their group's name and their reason, and every
// aria-describedby names a line that is really there, also while items turn on and off on an open menu.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { ActionMenu, menuInitialKey, menuSections, MenuThumb, type MenuGroup, type MenuList } from './Overlays';

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
});
afterEach(() => vi.restoreAllMocks());

const noop = () => undefined;
const SAVING = 'A change to this layout is still being saved.';
const STOP = 'Stop it first';

/** An open menu, past its opening moment (the opening focus check), so a test's own focus stays the person's. */
const mount = async (items: MenuList, label = 'Layout') => {
  const r = render(<ActionMenu label={label} items={items} isOpen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
  return { ...r, live: (next: MenuList) => r.rerender(<ActionMenu label={label} items={next} isOpen />) };
};
const openByClick = async (items: MenuList, label = 'Layout') => {
  render(<ActionMenu label={label} items={items} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: label }));
  });
  return screen.getByRole('menu');
};
/** The row (any menuitem role) whose label reads `name`. */
const row = (name: string) => {
  const el = screen.getByText(name, { selector: '[slot="label"]' }).closest<HTMLElement>('[role^="menuitem"]');
  if (!el) throw new Error(`no row ${name}`);
  return el;
};
/** The texts an element's aria-describedby points at, in order; '?' for an id that names nothing. */
const described = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '?');
/** Every aria-describedby id in the menu names an element that is rendered. */
const allResolve = (menu: Element) =>
  [...menu.querySelectorAll('[aria-describedby]')].every((el) =>
    (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).every((id) => document.getElementById(id) !== null));
const notes = (menu: Element) => [...menu.querySelectorAll('[data-note]')].map((n) => n.textContent);

describe('menuSections: a reason is said once, never lost', () => {
  it('(a) a reason shared by two disabled items lifts into one note that describes each of them', () => {
    const [sec] = menuSections([
      { id: 'a', label: 'Grid', isDisabled: true, disabledReason: SAVING, onAction: noop },
      { id: 'b', label: 'Rows', isDisabled: true, disabledReason: SAVING, onAction: noop },
      { id: 'c', label: 'Columns', onAction: noop },
    ], 'm');
    expect(sec?.notes.map((n) => [n.text, n.describes])).toEqual([[SAVING, ['a', 'b']]]);
    expect(sec?.items.map((i) => [i.action.id, i.line?.text, i.describedBy])).toEqual([
      ['a', undefined, [sec?.notes[0]?.id]],
      ['b', undefined, [sec?.notes[0]?.id]],
      ['c', undefined, []],
    ]);
  });

  it('(c) two different own reasons in one section: each item is described by its own line only', () => {
    const [sec] = menuSections([
      { id: 'a', label: 'Grid', isDisabled: true, disabledReason: SAVING, onAction: noop },
      { id: 'b', label: 'Rows', isDisabled: true, disabledReason: STOP, onAction: noop },
    ], 'm');
    expect(sec?.notes).toEqual([]);
    expect(sec?.items.map((i) => [i.line?.text, i.describedBy.length])).toEqual([[SAVING, 1], [STOP, 1]]);
  });

  it('(d) an explicit note never describes an item with its own different reason, nor an enabled item', () => {
    const [sec] = menuSections([
      { id: 'g', label: 'Presets', note: SAVING, items: [
        { id: 'a', label: 'Grid', isDisabled: true, onAction: noop },
        { id: 'b', label: 'Rows', isDisabled: true, disabledReason: STOP, onAction: noop },
        { id: 'c', label: 'Columns', description: 'Side by side', onAction: noop },
      ] },
    ], 'm');
    expect(sec?.notes.map((n) => [n.text, n.describes])).toEqual([[SAVING, ['a']]]);
    const [a, b, c] = sec?.items ?? [];
    expect(a?.describedBy).toEqual([sec?.notes[0]?.id]);
    expect(b?.line?.text).toBe(STOP);
    expect(b?.describedBy).toEqual([b?.line?.id]);
    expect(c?.describedBy).toEqual([c?.line?.id]);
    expect(c?.line?.text).toBe('Side by side');
  });

  it('an own reason equal to the shown note joins it; a note item keeps its description after the note', () => {
    const [sec] = menuSections([
      { id: 'g', label: 'Presets', note: SAVING, items: [
        { id: 'a', label: 'Grid', isDisabled: true, description: 'Even squares', onAction: noop },
        { id: 'b', label: 'Rows', isDisabled: true, disabledReason: SAVING, onAction: noop },
      ] },
    ], 'm');
    expect(sec?.notes.map((n) => n.describes)).toEqual([['a', 'b']]);
    const [a, b] = sec?.items ?? [];
    expect(a?.line?.text).toBe('Even squares');
    expect(a?.describedBy).toEqual([sec?.notes[0]?.id, a?.line?.id]);
    expect(b?.line).toBeUndefined();
  });

  it('(e) a disabled item with no reason anywhere is described by no note, and the menu says so once in dev', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(noop);
    const secs = menuSections([
      { id: 'g', label: 'Presets', note: SAVING, items: [{ id: 'a', label: 'Grid', isDisabled: true, onAction: noop }] },
      { id: 'h', label: 'Other', items: [
        { id: 'b', label: 'Rows', isDisabled: true, onAction: noop },
        { id: 'c', label: 'Cols', isDisabled: true, onAction: noop },
      ] },
    ], 'm');
    expect(secs[1]?.notes).toEqual([]);
    expect(secs[1]?.items.map((i) => i.describedBy)).toEqual([[], []]);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('(b) a plain group with a note and danger: Edit and Delete both keep the reason; Delete says it on its own line', () => {
    const secs = menuSections([
      { id: 'files', label: 'Files', note: SAVING, items: [
        { id: 'edit', label: 'Edit', isDisabled: true, onAction: noop },
        { id: 'del', label: 'Delete', tone: 'danger', isDisabled: true, onAction: noop },
      ] },
    ], 'm');
    expect(secs.map((x) => [x.label, x.danger, x.rule])).toEqual([['Files', false, false], ['Files', true, true]]);
    expect(secs[0]?.notes.map((n) => n.describes)).toEqual([['edit']]);
    expect(secs[1]?.notes).toEqual([]);
    expect(secs[1]?.items[0]?.line?.text).toBe(SAVING);
  });

  it('two danger items that took one group note lift it again inside the danger section', () => {
    const secs = menuSections([
      { id: 'files', label: 'Files', note: SAVING, items: [
        { id: 'open', label: 'Open', onAction: noop },
        { id: 'del', label: 'Delete', tone: 'danger', isDisabled: true, onAction: noop },
        { id: 'wipe', label: 'Wipe', tone: 'danger', isDisabled: true, onAction: noop },
      ] },
    ], 'm');
    expect(secs[0]?.notes).toEqual([]);
    expect(secs[1]?.notes.map((n) => [n.text, n.describes])).toEqual([[SAVING, ['del', 'wipe']]]);
  });

  it('(i2) legacy entries: a checked danger item beside a plain one makes two homogeneous danger sections, one rule', () => {
    const secs = menuSections([
      { id: 'a', label: 'Open', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
      { id: 'y', label: 'Armed', tone: 'danger', checked: true, onAction: noop },
    ], 'm');
    expect(secs.map((x) => [x.items.map((i) => i.action.id), x.select ?? 'plain', x.danger, x.rule])).toEqual([
      [['a'], 'plain', false, false],
      [['x'], 'plain', true, true],
      [['y'], 'many', true, false],
    ]);
  });

  it('(i) danger items of two groups: two danger sections, each named by its group, and one rule leads the area', () => {
    const secs = menuSections([
      { id: 'f', label: 'Files', items: [{ id: 'o', label: 'Open', onAction: noop }, { id: 'd', label: 'Delete', tone: 'danger', onAction: noop }] },
      { id: 'b', label: 'Board', items: [{ id: 'r', label: 'Rename', onAction: noop }, { id: 'w', label: 'Wipe', tone: 'danger', onAction: noop }] },
    ], 'm');
    expect(secs.map((x) => [x.label, x.danger, x.rule])).toEqual([
      ['Files', false, false], ['Board', false, true], ['Files', true, true], ['Board', true, false],
    ]);
  });

  it('note ids encode the section key (spaces and slashes): one token each, unique per menu', () => {
    const secs = menuSections([
      { id: 'my group/1', label: 'G', note: SAVING, items: [{ id: 'a', label: 'A', isDisabled: true, onAction: noop }] },
    ], 'menu-1');
    expect(secs[0]?.notes[0]?.id).toMatch(/^menu-1-[^ /]+$/);
  });

  it('section keys stay unique: a group whose danger items move vs a group named like that area, and vs item ids', () => {
    const secs = menuSections([
      { id: 'files', label: 'Files', note: SAVING, items: [
        { id: 'a', label: 'Open', onAction: noop },
        { id: 'd', label: 'Delete', tone: 'danger', isDisabled: true, disabledReason: STOP, onAction: noop },
        { id: 'e', label: 'Erase', tone: 'danger', isDisabled: true, disabledReason: STOP, onAction: noop },
      ] },
      { id: 'files-danger', label: 'More', note: 'Other reason', items: [{ id: 'b', label: 'Rename', isDisabled: true, onAction: noop }] },
      { id: 'c', label: 'Copy', onAction: noop },
    ], 'm');
    const keys = secs.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
    // An item named exactly like a generated section key: the section moves off it.
    const flat = menuSections([{ id: '["e",0,0]', label: 'Odd', onAction: noop }], 'm');
    expect(flat[0]?.key).not.toBe('["e",0,0]');
    // Every note and line id across all sections is unique.
    const ids = secs.flatMap((x) => [...x.notes.map((n) => n.id), ...x.items.flatMap((i) => (i.line ? [i.line.id] : []))]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a note id and an item line id never collide, whatever the item id', () => {
    const secs = menuSections([{ id: 'g', label: 'G', note: SAVING, items: [{ id: 'x', label: 'X', isDisabled: true, onAction: noop }] }], 'm');
    const noteId = secs[0]?.notes[0]?.id ?? '';
    const tail = noteId.slice('m-'.length); // an item whose id spells the note id's tail, and one spelling it whole
    for (const id of [tail, noteId, decodeURIComponent(tail), `n0-${tail}`]) {
      const s2 = menuSections([{ id: 'g', label: 'G', note: SAVING, items: [
        { id: 'x', label: 'X', isDisabled: true, onAction: noop },
        { id, label: 'Y', description: 'Its own line', onAction: noop },
      ] }], 'm');
      const n = s2[0]?.notes[0]?.id;
      const line = s2[0]?.items[1]?.line?.id;
      expect(line, id).toBeDefined();
      expect(line, id).not.toBe(n);
    }
  });

  it('a one-of group with neither label nor name: one dev error per menu, non-throwing', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(noop);
    const list: MenuList = [{ id: 'p', select: 'one', current: null, items: [{ id: 'g', label: 'Grid', onAction: noop }] }];
    menuSections(list, 'u1');
    menuSections(list, 'u1');
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toMatch(/no label or name/);
    menuSections(list, 'u2');
    expect(err).toHaveBeenCalledTimes(2);
  });

  it('the missing-reason diagnostic is said once per menu (another menu says it too), and never in production', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(noop);
    const list: MenuList = [{ id: 'start', label: 'Start', isDisabled: true, onAction: noop }];
    menuSections(list, 'p1');
    menuSections(list, 'p1');
    // The same menu, now missing a different item's reason: still the one diagnostic for this menu.
    menuSections([{ id: 'stop', label: 'Stop', isDisabled: true, onAction: noop }], 'p1');
    menuSections(list, 'p2');
    expect(err).toHaveBeenCalledTimes(2);
    vi.stubEnv('DEV', false);
    try {
      menuSections(list, 'p3');
      menuSections([{ id: 'q', select: 'one', current: null, items: [{ id: 'g', label: 'Grid', onAction: noop }] }], 'p3');
    } finally {
      vi.unstubAllEnvs();
    }
    expect(err).toHaveBeenCalledTimes(2);
  });
});

describe('ActionMenu groups', () => {
  it('(i) a labelled group without danger is one section found by its name; an unlabelled one-of uses `name`', async () => {
    const menu = await openByClick([
      { id: 'views', label: 'Views', items: [{ id: 'a', label: 'Grid', onAction: noop }, { id: 'b', label: 'Rows', onAction: noop }] },
      { id: 'boards', name: 'Boards', select: 'one', current: 'b1', items: [{ id: 'b1', label: 'Main', onAction: noop }] },
    ]);
    const views = screen.getByRole('group', { name: 'Views' });
    expect(views.querySelectorAll('[role^="menuitem"]')).toHaveLength(2);
    expect(menu.querySelectorAll('[role="group"]')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeVisible();
  });

  it('(b2) a labelled "Files" group with Edit and Delete: the danger section is named "Files" too', async () => {
    await openByClick([
      { id: 'files', label: 'Files', items: [
        { id: 'edit', label: 'Edit', onAction: noop },
        { id: 'del', label: 'Delete', tone: 'danger', onAction: noop },
      ] },
    ]);
    const groups = screen.getAllByRole('group', { name: 'Files' });
    expect(groups).toHaveLength(2);
    expect(groups[1]?.textContent).toContain('Delete');
    expect(groups[1]?.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('(g) a one-of group with current null: every item a menuitemradio, none checked; the page passing one checks it', async () => {
    const group = (current: string | null): MenuGroup => ({ id: 'presets', label: 'Presets', select: 'one', current, items: [
      { id: 'grid', label: 'Grid', onAction: noop },
      { id: 'rows', label: 'Rows', onAction: noop },
    ] });
    const { live } = await mount([group(null)]);
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios).toHaveLength(2);
    for (const r of radios) expect(r).toHaveAttribute('aria-checked', 'false');
    live([group('rows')]);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
    expect(screen.getByRole('menuitemradio', { name: 'Rows' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Rows' }).querySelector('[data-current]')).not.toBeNull();
  });

  it('choosing a one-of item runs it and does not move the mark by itself', async () => {
    const pick = vi.fn();
    const { live } = await mount([{ id: 'p', label: 'Presets', select: 'one', current: 'grid', items: [
      { id: 'grid', label: 'Grid', onAction: noop },
      { id: 'rows', label: 'Rows', onAction: pick },
    ] }]);
    await act(async () => { fireEvent.click(screen.getByRole('menuitemradio', { name: 'Rows' })); });
    expect(pick).toHaveBeenCalledTimes(1);
    live([{ id: 'p', label: 'Presets', select: 'one', current: 'grid', items: [
      { id: 'grid', label: 'Grid', onAction: noop },
      { id: 'rows', label: 'Rows', onAction: pick },
    ] }]);
    expect(screen.getByRole('menuitemradio', { name: 'Rows' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
  });

  it('(h) an on/off group: menuitemcheckbox with a leading box, ticked while on', async () => {
    await mount([{ id: 'show', label: 'Show', select: 'many', items: [
      { id: 'grid', label: 'Grid lines', checked: true, onAction: noop },
      { id: 'names', label: 'Names', checked: false, onAction: noop },
    ] }]);
    const on = screen.getByRole('menuitemcheckbox', { name: 'Grid lines' });
    const off = screen.getByRole('menuitemcheckbox', { name: 'Names' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(on.querySelector('[data-box]')).toHaveAttribute('data-on');
    expect(off.querySelector('[data-box]')).not.toHaveAttribute('data-on');
  });

  it('(i2) legacy checked danger beside plain danger: roles stay right and one rule leads the danger area', async () => {
    const menu = await openByClick([
      { id: 'a', label: 'Open', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
      { id: 'y', label: 'Armed', tone: 'danger', checked: true, onAction: noop },
    ]);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Armed' })).toHaveAttribute('aria-checked', 'true');
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('types: danger is refused in one-of and on/off groups; a plain group item cannot be checked', () => {
    const bad: MenuGroup[] = [
      // @ts-expect-error tone 'danger' is not allowed in a one-of group
      { id: 'a', select: 'one', current: null, name: 'A', items: [{ id: 'x', label: 'X', tone: 'danger', onAction: noop }] },
      // @ts-expect-error tone 'danger' is not allowed in an on/off group
      { id: 'b', select: 'many', items: [{ id: 'y', label: 'Y', checked: true, tone: 'danger', onAction: noop }] },
      // @ts-expect-error a plain group item has no `checked`
      { id: 'c', items: [{ id: 'z', label: 'Z', checked: true, onAction: noop }] },
      // @ts-expect-error an on/off item needs `checked`
      { id: 'd', select: 'many', items: [{ id: 'w', label: 'W', onAction: noop }] },
    ];
    expect(bad).toHaveLength(4);
  });

  it('a picture leads its row (MenuThumb, hidden from the accessibility tree) and every row keeps the lead column', async () => {
    await mount([{ id: 'p', label: 'Presets', select: 'one', current: null, items: [
      { id: 'two', label: 'Two', picture: <MenuThumb cells={[[0, 0, 1, 2], [1, 0, 1, 2]]} />, onAction: noop },
      { id: 'own', label: 'Your own', onAction: noop },
    ] }]);
    const two = screen.getByRole('menuitemradio', { name: 'Two' });
    const pic = two.querySelector('[data-lead] svg');
    expect(pic).toHaveAttribute('aria-hidden', 'true');
    expect(pic?.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByRole('menuitemradio', { name: 'Your own' }).querySelector('[data-lead]')).not.toBeNull();
  });
});

describe('ActionMenu notes on screen', () => {
  it('(a) a shared reason shows once as a note; both items are described by it; the group keeps its plain name', async () => {
    const menu = await openByClick([{ id: 'p', label: 'Presets', items: [
      { id: 'a', label: 'Grid', isDisabled: true, disabledReason: SAVING, onAction: noop },
      { id: 'b', label: 'Rows', isDisabled: true, disabledReason: SAVING, onAction: noop },
    ] }]);
    expect(notes(menu)).toEqual([SAVING]);
    expect(described(row('Grid'))).toEqual([SAVING]);
    expect(described(row('Rows'))).toEqual([SAVING]);
    expect(screen.getByRole('group', { name: 'Presets' })).toBeInTheDocument();
    expect(menu.querySelectorAll('[slot="description"]')).toHaveLength(0);
  });

  it('(b) Edit is described by the group note; Delete, in the danger section, by its own line', async () => {
    const menu = await openByClick([{ id: 'files', label: 'Files', note: SAVING, items: [
      { id: 'edit', label: 'Edit', isDisabled: true, onAction: noop },
      { id: 'del', label: 'Delete', tone: 'danger', isDisabled: true, onAction: noop },
    ] }]);
    expect(notes(menu)).toEqual([SAVING]);
    expect(described(row('Edit'))).toEqual([SAVING]);
    expect(described(row('Delete'))).toEqual([SAVING]);
    expect(row('Delete').querySelector('[slot="description"]')).toHaveTextContent(SAVING);
    expect(allResolve(menu)).toBe(true);
  });

  it('(f) an item turning disabled, then enabled, on an open menu adds and removes the shared note; focus stays', async () => {
    const items = (bOff: boolean): MenuList => [{ id: 'p', label: 'Presets', items: [
      { id: 'a', label: 'Grid', isDisabled: true, disabledReason: SAVING, onAction: noop },
      { id: 'b', label: 'Rows', isDisabled: bOff, disabledReason: SAVING, onAction: noop },
      { id: 'c', label: 'Columns', onAction: noop },
    ] }];
    const { live } = await mount(items(false));
    const menu = screen.getByRole('menu');
    row('Columns').focus();
    expect(notes(menu)).toEqual([]);
    expect(described(row('Grid'))).toEqual([SAVING]);
    await act(async () => live(items(true)));
    expect(notes(menu)).toEqual([SAVING]);
    expect(described(row('Grid'))).toEqual([SAVING]);
    expect(described(row('Rows'))).toEqual([SAVING]);
    expect(allResolve(menu)).toBe(true);
    expect(document.activeElement).toBe(row('Columns'));
    await act(async () => live(items(false)));
    expect(notes(menu)).toEqual([]);
    expect(described(row('Grid'))).toEqual([SAVING]);
    expect(row('Rows')).not.toHaveAttribute('aria-describedby');
    expect(allResolve(menu)).toBe(true);
    expect(document.activeElement).toBe(row('Columns'));
  });

  it('(o) lift and unlift with a group id holding spaces and slashes: every described id names the rendered note', async () => {
    const items = (both: boolean): MenuList => [{ id: 'my boards/2', label: 'Boards', items: [
      { id: 'a', label: 'Alpha', isDisabled: true, disabledReason: STOP, onAction: noop },
      { id: 'b', label: 'Beta', isDisabled: both, disabledReason: both ? STOP : undefined, onAction: noop },
    ] }];
    const { live } = await mount(items(true));
    const menu = screen.getByRole('menu');
    row('Alpha').focus();
    expect(notes(menu)).toEqual([STOP]);
    expect(allResolve(menu)).toBe(true);
    await act(async () => live(items(false)));
    expect(notes(menu)).toEqual([]);
    expect(described(row('Alpha'))).toEqual([STOP]);
    expect(allResolve(menu)).toBe(true);
    expect(document.activeElement).toBe(row('Alpha'));
    await act(async () => live(items(true)));
    expect(notes(menu)).toEqual([STOP]);
    expect(described(row('Beta'))).toEqual([STOP]);
    expect(allResolve(menu)).toBe(true);
  });
});

describe('ActionMenu keyboard and choosing', () => {
  it('(n) a disabled radio and a disabled checkbox: click, Enter and Space do nothing; the menu stays open', async () => {
    const run = vi.fn();
    const change = vi.fn();
    render(<ActionMenu label="Layout" onOpenChange={change} items={[
      { id: 'p', label: 'Presets', select: 'one', current: 'grid', items: [
        { id: 'grid', label: 'Grid', onAction: run },
        { id: 'rows', label: 'Rows', isDisabled: true, disabledReason: STOP, onAction: run },
      ] },
      { id: 's', label: 'Show', select: 'many', items: [
        { id: 'names', label: 'Names', checked: false, isDisabled: true, disabledReason: STOP, onAction: run },
      ] },
    ]} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Layout' })); });
    change.mockClear();
    for (const name of ['Rows', 'Names']) {
      const el = row(name);
      const before = el.getAttribute('aria-checked');
      await act(async () => { fireEvent.click(el); });
      el.focus();
      await act(async () => { fireEvent.keyDown(el, { key: 'Enter' }); fireEvent.keyUp(el, { key: 'Enter' }); });
      await act(async () => { fireEvent.keyDown(el, { key: ' ' }); fireEvent.keyUp(el, { key: ' ' }); });
      expect(row(name).getAttribute('aria-checked')).toBe(before);
    }
    expect(run).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('(j) arrows walk every item, disabled ones too; Home and End; type-ahead finds a label', async () => {
    const user = userEvent.setup();
    await openByClick([
      { id: 'p', label: 'Presets', items: [
        { id: 'a', label: 'Alpha', onAction: noop },
        { id: 'b', label: 'Bravo', isDisabled: true, disabledReason: STOP, onAction: noop },
        { id: 'c', label: 'Charlie', onAction: noop },
      ] },
    ]);
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    row('Alpha').focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(row('Bravo'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(row('Charlie'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(row('Alpha'));
    await user.keyboard('c');
    expect(document.activeElement).toBe(row('Charlie'));
  });

  it('(k) Escape closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Layout" items={[{ id: 'p', label: 'Presets', items: [{ id: 'a', label: 'Alpha', onAction: noop }] }]} />);
    const trigger = screen.getByRole('button', { name: 'Layout' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('(l) the keyboard-open rule: the current item of the first one-of group', () => {
    expect(menuInitialKey(menuSections([
      { id: 'act', label: 'Actions', items: [{ id: 'undo', label: 'Undo', onAction: noop }] },
      { id: 'p', label: 'Presets', select: 'one', current: 'rows', items: [
        { id: 'grid', label: 'Grid', onAction: noop },
        { id: 'rows', label: 'Rows', onAction: noop },
      ] },
    ]))).toBe('rows');
  });

  it('(l) the keyboard-open rule never names danger while another item exists; else the first enabled, else the first', () => {
    const sec = (list: MenuList) => menuInitialKey(menuSections(list));
    expect(sec([
      { id: 'a', label: 'Alpha', isDisabled: true, disabledReason: STOP, onAction: noop },
      { id: 'b', label: 'Bravo', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ])).toBe('b');
    expect(sec([
      { id: 'a', label: 'Alpha', isDisabled: true, disabledReason: STOP, onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ])).toBe('a');
    expect(sec([{ id: 'x', label: 'Delete', tone: 'danger', onAction: noop }])).toBe('x');
    expect(sec([
      { id: 'p', label: 'Presets', select: 'one', current: null, items: [{ id: 'g', label: 'Grid', onAction: noop }] },
    ])).toBe('g');
  });

  it('(l) the first one-of group decides: its current, or with none (null) the fallback, never a later group\'s current', () => {
    const sec = (items: MenuList) => menuInitialKey(menuSections(items, 'm'));
    const layouts = (current: string | null): MenuGroup => ({ id: 'l', label: 'Layouts', select: 'one', current, items: [
      { id: 'grid', label: 'Grid', onAction: noop },
      { id: 'side', label: 'Side', onAction: noop },
    ] });
    const boards: MenuGroup = { id: 'b', label: 'Boards', select: 'one', current: 'main', items: [
      { id: 'main', label: 'Main', onAction: noop },
      { id: 'ops', label: 'Ops', onAction: noop },
    ] };
    expect(sec([layouts(null), boards])).toBe('grid');
    expect(sec([layouts('side'), boards])).toBe('side');
    // A current that names no item of its group counts as none.
    expect(sec([layouts('gone'), boards])).toBe('grid');
  });

  it('(l) on an open menu, the item React Aria focused first moves to the rule\'s item', async () => {
    render(<ActionMenu label="Layout" isOpen items={[
      { id: 'a', label: 'Alpha', isDisabled: true, disabledReason: STOP, onAction: noop },
      { id: 'b', label: 'Bravo', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ]} />);
    // What a keyboard open does (focus strategy 'first' / 'last'), done here by hand: happy-dom gives the popover no
    // layout, so React Aria's own autofocus is proven in the browser (menugroup.spec.ts).
    row('Delete').focus();
    await waitFor(() => expect(document.activeElement).toBe(row('Bravo')));
  });

  it('(l) a controlled open from a key (Board \'.\', Tabs Shift+F10) lands on the rule\'s item too', async () => {
    const items: MenuList = [
      { id: 'a', label: 'Alpha', isDisabled: true, disabledReason: STOP, onAction: noop },
      { id: 'b', label: 'Bravo', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ];
    const { rerender } = render(<ActionMenu label="Layout" isOpen={false} onOpenChange={noop} items={items} />);
    fireEvent.keyDown(document.body, { key: '.' });
    rerender(<ActionMenu label="Layout" isOpen onOpenChange={noop} items={items} />);
    await waitFor(() => expect(document.activeElement).toBe(row('Bravo')));
  });

  it('a controlled open from a pointer moves no focus to an item', async () => {
    const items: MenuList = [
      { id: 'b', label: 'Bravo', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ];
    const { rerender } = render(<ActionMenu label="Layout" isOpen={false} onOpenChange={noop} items={items} />);
    fireEvent.pointerDown(document.body);
    rerender(<ActionMenu label="Layout" isOpen onOpenChange={noop} items={items} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement?.getAttribute('role') ?? '').not.toMatch(/^menuitem/);
  });

  it('a copy on a text-only menu still shows its check in the lead place while "Copied"', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    await mount([
      { id: 'o', label: 'Open', onAction: noop },
      { id: 'c', label: 'Copy link', copy: 'https://x.test', onAction: noop },
    ]);
    expect(document.querySelector('[data-lead]')).toBeNull();
    await act(async () => { fireEvent.click(row('Copy link')); await new Promise((r) => setTimeout(r, 10)); });
    const copied = row('Copied');
    expect(copied.querySelector('[data-lead] svg')).not.toBeNull();
  });

  it('a pointer open keeps React Aria\'s default: the menu itself, no item', async () => {
    const menu = await openByClick([
      { id: 'a', label: 'Alpha', onAction: noop },
      { id: 'x', label: 'Delete', tone: 'danger', onAction: noop },
    ]);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(menu);
  });
});

afterEach(() => cleanup());
