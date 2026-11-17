import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilterChips, FiltersButton, type FilterChip } from './FilterChips';
import dt from './DataTable.module.css';

const chip = (kind: 'single' | 'multi'): FilterChip => ({
  id: 'type',
  label: 'Type',
  kind,
  value: undefined,
  onChange: () => undefined,
  options: [
    { value: 'paid', label: 'Billing', count: 10 },
    { value: 'news', label: 'Announcement', count: 0 },
  ],
});

describe('FilterChips option names (facet counts)', () => {
  for (const kind of ['single', 'multi'] as const) {
    it(`${kind}: an option is named by its label; the count is its description`, () => {
      render(<FilterChips filters={[chip(kind)]} />);
      fireEvent.click(screen.getByRole('button', { name: /Type/ }));
      const role = kind === 'single' ? 'menuitemradio' : 'menuitemcheckbox';
      const billing = screen.getByRole(role, { name: 'Billing' });
      expect(billing).toHaveAccessibleDescription('10');
      expect(screen.getByRole(role, { name: 'Announcement' })).toHaveAccessibleDescription('0');
    });
  }
});

// An option may carry a small picture (a computer's ComputerMark) before its label.
// It shows in the option row and, while the option is the chip's value, before the value text. It is decorative: the
// option's name, the chip's text and the chip's name are the same with or without it.
describe('FilterChips option marks', () => {
  const Dot = ({ c }: { c: string }) => <span aria-hidden="true" data-mark={c} />;
  const computers = (kind: 'single' | 'multi', value: string | undefined, marked: boolean): FilterChip => ({
    id: 'computer',
    label: 'Computer',
    kind,
    value,
    onChange: () => undefined,
    options: [
      { value: 'a1', label: 'atlas', count: 3, ...(marked ? { mark: <Dot c="blue" /> } : {}) },
      { value: 'f1', label: 'fjord', ...(marked ? { mark: <Dot c="green" /> } : {}) },
    ],
  });
  const chipButton = () => screen.getByRole('button', { name: /^Computer/ });

  for (const kind of ['single', 'multi'] as const) {
    it(`${kind}: each option row draws its mark; the option is still named by its label alone`, () => {
      render(<FilterChips filters={[computers(kind, undefined, true)]} />);
      fireEvent.click(chipButton());
      const role = kind === 'single' ? 'menuitemradio' : 'menuitemcheckbox';
      const atlas = screen.getByRole(role, { name: 'atlas' });
      expect(atlas.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('blue');
      expect(atlas).toHaveAccessibleDescription('3');
      expect(screen.getByRole(role, { name: 'fjord' }).querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('green');
    });
  }

  it('single: the active chip draws its value’s mark before the value text; text and name match an unmarked chip', () => {
    const { unmount } = render(<FilterChips filters={[computers('single', 'f1', false)]} />);
    const plainText = chipButton().textContent;
    const plainName = chipButton().getAttribute('aria-label') ?? chipButton().textContent;
    unmount();
    render(<FilterChips filters={[computers('single', 'f1', true)]} />);
    const b = chipButton();
    expect(b.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('green');
    expect(b.textContent).toBe(plainText);
    expect(b.textContent).toBe('Computerfjord');
    expect(b.getAttribute('aria-label') ?? b.textContent).toBe(plainName);
    // The mark comes first inside the value (value > mark place > mark), then the value text.
    const place = b.querySelector('[data-mark]')!.parentElement!;
    expect(place.parentElement!.textContent).toBe('fjord');
    expect(place.parentElement!.firstChild).toBe(place);
  });

  it('multi: the chip draws the first value’s mark; the text stays "atlas +1"', () => {
    render(<FilterChips filters={[computers('multi', 'a1,f1', true)]} />);
    const b = chipButton();
    expect([...b.querySelectorAll('[data-mark]')].map((m) => m.getAttribute('data-mark'))).toEqual(['blue']);
    expect(b.textContent).toBe('Computeratlas +1');
  });

  it('no mark: the option rows and the chip hold no mark place', () => {
    render(<FilterChips filters={[computers('single', 'a1', false)]} />);
    expect(chipButton().textContent).toBe('Computeratlas');
    // chip = name + value; the value holds its text only (one part, cut short when long).
    expect([...chipButton().children[1]!.children].map((c) => c.className)).toEqual([dt.chipValueText]);
    expect(chipButton().children[1]!.children[0]!.children).toHaveLength(0);
    fireEvent.click(chipButton());
    // row = check place + label + count, nothing more.
    expect(screen.getByRole('menuitemradio', { name: 'atlas' }).children).toHaveLength(3);
  });

  it('a mark that would carry a name of its own is hidden: the option and chip names stay the label', () => {
    const { unmount } = render(<FilterChips filters={[computers('single', 'a1', false)]} />);
    const plain = screen.getByRole('button', { name: /^Computer/ });
    expect(plain).toHaveAccessibleName('Computer atlas');
    unmount();
    const named: FilterChip = { ...computers('single', 'a1', false), options: [{ value: 'a1', label: 'atlas', mark: <img alt="blue computer" src="data:," /> }] };
    render(<FilterChips filters={[named]} />);
    const b = screen.getByRole('button', { name: /^Computer/ });
    expect(b).toHaveAccessibleName('Computer atlas');
    expect(b.querySelector('img')?.closest('[aria-hidden="true"]')).not.toBeNull();
    fireEvent.click(b);
    expect(screen.getByRole('menuitemradio', { name: 'atlas' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'blue computer' })).toBeNull();
  });

  it('the narrow Filters panel draws the same marks', () => {
    render(<FiltersButton filters={[computers('single', 'f1', true)]} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const b = screen.getByRole('button', { name: /^Computer/ });
    expect(b.querySelector('[data-mark]')?.getAttribute('data-mark')).toBe('green');
    expect(b.textContent).toBe('Computerfjord');
  });
});

// FilterChips option lines (launcher Category filter): an option may carry one short line under its
// label that says what it keeps. The line is the option's accessible description, followed by its count when it has
// one; the name stays the label alone. Options without a line render exactly as before.
describe('FilterChips option lines', () => {
  const LINE = 'Programs already on this computer.';
  const kinds = (kind: 'single' | 'multi', count?: number): FilterChip => ({
    id: 'category',
    label: 'Category',
    kind,
    value: undefined,
    onChange: () => undefined,
    options: [
      { value: 'installed', label: 'Installed', description: LINE, ...(count === undefined ? {} : { count }) },
      { value: 'web', label: 'Web', count: 4 },
    ],
  });
  const open = (name = /^Category/) => fireEvent.click(screen.getByRole('button', { name }));
  const roleOf = (kind: 'single' | 'multi') => (kind === 'single' ? 'menuitemradio' : 'menuitemcheckbox');

  for (const kind of ['single', 'multi'] as const) {
    it(`${kind}: the line shows under the label and is the description; the name stays the label`, () => {
      render(<FilterChips filters={[kinds(kind)]} />);
      open();
      const installed = screen.getByRole(roleOf(kind), { name: 'Installed' });
      expect(installed).toHaveTextContent(LINE);
      expect(installed).toHaveAccessibleDescription(LINE);
      // The line sits in the label column, after the label.
      const line = [...installed.querySelectorAll('span')].find((e) => e.textContent === LINE)!;
      expect(line.previousElementSibling).toHaveTextContent('Installed');
      // Every id the item names is rendered.
      for (const id of installed.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull();
    });

    it(`${kind}: with a count too, the description is the line then the count`, () => {
      render(<FilterChips filters={[kinds(kind, 3)]} />);
      open();
      const installed = screen.getByRole(roleOf(kind), { name: 'Installed' });
      expect(installed).toHaveAccessibleDescription(`${LINE} 3`);
      expect(installed.lastElementChild).toHaveTextContent('3');
    });

    it(`${kind}: an option without a line keeps the count as its only description and its old shape`, () => {
      render(<FilterChips filters={[kinds(kind)]} />);
      open();
      const web = screen.getByRole(roleOf(kind), { name: 'Web' });
      expect(web).toHaveAccessibleDescription('4');
      // row = check place + label + count, nothing more.
      expect(web.children).toHaveLength(3);
    });

    // React Aria reads its description slot only when an item mounts, so the
    // description must follow a line or count that comes or goes while the menu is open.
    it(`${kind}: an open menu follows a line that goes (count kept), comes back, and a count that goes`, () => {
      const withOpts = (options: FilterChip['options']) => <FilterChips filters={[{ ...kinds(kind), options }]} />;
      const { rerender } = render(withOpts([{ value: 'installed', label: 'Installed', description: LINE, count: 3 }]));
      open();
      const item = () => screen.getByRole(roleOf(kind), { name: 'Installed' });
      expect(item()).toHaveAccessibleDescription(`${LINE} 3`);
      rerender(withOpts([{ value: 'installed', label: 'Installed', count: 3 }]));
      expect(item()).toHaveAccessibleDescription('3');
      rerender(withOpts([{ value: 'installed', label: 'Installed', description: LINE, count: 3 }]));
      expect(item()).toHaveAccessibleDescription(`${LINE} 3`);
      rerender(withOpts([{ value: 'installed', label: 'Installed', description: LINE }]));
      expect(item()).toHaveAccessibleDescription(LINE);
      rerender(withOpts([{ value: 'installed', label: 'Installed' }]));
      expect(item()).not.toHaveAttribute('aria-describedby');
      rerender(withOpts([{ value: 'installed', label: 'Installed', count: 5 }]));
      expect(item()).toHaveAccessibleDescription('5');
    });
  }

  it('two chips with the same option values keep their own lines', () => {
    const other: FilterChip = { ...kinds('single'), id: 'kind', label: 'Kind', options: [{ value: 'installed', label: 'Installed', description: 'Another line.' }] };
    render(<FilterChips filters={[kinds('single'), other]} />);
    open(/^Kind/);
    expect(screen.getByRole('menuitemradio', { name: 'Installed' })).toHaveAccessibleDescription('Another line.');
  });

  // The ids are each chip's own, even though only one menu is normally open at a time.
  it('two chips give the same option place different ids', () => {
    const other: FilterChip = { ...kinds('single'), id: 'kind', label: 'Kind', options: [{ value: 'installed', label: 'Installed', description: 'Another line.', count: 2 }] };
    render(<FilterChips filters={[kinds('single', 3), other]} />);
    const idsOf = (chip: RegExp) => {
      open(chip);
      const ids = screen.getByRole('menuitemradio', { name: 'Installed' }).getAttribute('aria-describedby')!.split(' ');
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      return ids;
    };
    const a = idsOf(/^Category/);
    const b = idsOf(/^Kind/);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    for (const id of a) expect(b).not.toContain(id);
  });

  it('the narrow Filters panel shows the same lines', () => {
    render(<FiltersButton filters={[kinds('single')]} />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    open();
    expect(screen.getByRole('menuitemradio', { name: 'Installed' })).toHaveAccessibleDescription(LINE);
  });

  it('a segmented display shows no line', () => {
    render(<FilterChips filters={[{ ...kinds('single'), display: 'segmented' }]} />);
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.getByRole('radio', { name: /Installed/ })).toBeInTheDocument();
  });
});

// The controls that remove themselves hand focus to a named place.
describe('FilterChips: focus moves when a control removes itself', () => {
  function Host({ initial }: { initial: Record<string, string | undefined> }) {
    const [v, setV] = useState(initial);
    const mk = (id: string, label: string): FilterChip => ({ id, label, kind: 'single', value: v[id], onChange: (x) => setV((m) => ({ ...m, [id]: x })), options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] });
    return <FilterChips filters={[mk('type', 'Type'), mk('state', 'State')]} />;
  }
  it('the x that clears a chip hands focus to that chip\'s own button', () => {
    render(<Host initial={{ type: 'a', state: undefined }} />);
    const x = screen.getByRole('button', { name: /Clear.*Type/i });
    x.focus();
    fireEvent.click(x);
    expect(screen.queryByRole('button', { name: /Clear.*Type/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Type/ }));
  });
  it('Clear all hands focus to the first chip', () => {
    render(<Host initial={{ type: 'a', state: 'b' }} />);
    const all = screen.getByRole('button', { name: 'Clear all' });
    // Clear all is a toolbar word button, drawn in the toolbar type.
    expect(all).toHaveClass(dt.tbWords as string);
    // As tall as the chips beside it: a toolbar control, never a small button.
    expect(all).toHaveClass('toolbar');
    expect(all).not.toHaveClass('sm');
    all.focus();
    fireEvent.click(all);
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Type/ }));
  });
});

// The folded, icon-only Filters button has the toolbar field look whether filters are set or not, so
// a set button shows its number in a badge. The badge is hidden from the name, which already carries the number.
describe('the folded Filters icon shows the number set', () => {
  const set = (value: string | undefined, id = 'type'): FilterChip => ({ ...chip('single'), id, value });

  it('unset: no badge, and the name is "Filters"', () => {
    const { container } = render(<FiltersButton filters={[set(undefined)]} iconOnly />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();
    expect(container.querySelector('[data-filters-count]')).toBeNull();
  });

  it('two set: a badge reading 2, hidden from the name, which stays "Filters (2)"', () => {
    const { container } = render(<FiltersButton filters={[set('paid'), set('news', 'kind')]} iconOnly />);
    const button = screen.getByRole('button', { name: 'Filters (2)' });
    const badge = container.querySelector('[data-filters-count]');
    expect(badge?.textContent).toBe('2');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(button.contains(badge)).toBe(false); // outside the button: never part of its name
  });

  it('with words, the number is in the words and no badge is drawn', () => {
    const { container } = render(<FiltersButton filters={[set('paid')]} />);
    expect(screen.getByRole('button', { name: /Filters \(1\)/ })).toBeTruthy();
    expect(container.querySelector('[data-filters-count]')).toBeNull();
  });
});

describe('the narrow Filters panel, Clear filters', () => {
  it('leaves with the filters it clears, and focus goes to the first filter in the panel, not to the page', () => {
    function Host() {
      const [v, setV] = useState<string | undefined>('paid');
      return <FiltersButton filters={[{ ...chip('single'), value: v, onChange: (x) => setV(x as string | undefined) }]} />;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const clear = screen.getByRole('button', { name: /clear filters/i });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Type/ }));
  });
});

describe('a set chip: name | value | clear in one plate', () => {
  const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => new RegExp(`(?:^|\\n|\\})\\s*${sel.replace(/[.[\]()>]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('draws the name, then the value in its own part, then the clear button with its own name', () => {
    const { container } = render(<FilterChips filters={[{ ...chip('single'), value: 'paid' }]} />);
    const wrap = container.querySelector('[data-chip="type"]')!;
    expect(wrap.classList.contains(dt.chipOn!)).toBe(true);
    const open = screen.getByRole('button', { name: 'Type Billing' });
    const parts = [...open.children].map((c) => c.className);
    expect(parts[0]).toContain(dt.chipName!);
    expect(parts[1]).toContain(dt.chipValue!);
    expect(open.querySelector(`.${dt.chipValueText}`)?.textContent).toBe('Billing');
    expect(open.querySelector('svg'), 'a set chip has no caret: its clear button is its end').toBeNull();
    const clear = screen.getByRole('button', { name: 'Clear Type' });
    expect(clear.classList.contains(dt.chipX!)).toBe(true);
    expect(wrap.lastElementChild).toBe(clear);
  });

  it('an unset chip is its name and a caret: no value part, no clear button', () => {
    const { container } = render(<FilterChips filters={[chip('single')]} />);
    const wrap = container.querySelector('[data-chip="type"]')!;
    expect(wrap.classList.contains(dt.chipOn!)).toBe(false);
    expect(wrap.querySelector(`.${dt.chipValue}`)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Clear/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Type' }).querySelector('svg')).not.toBeNull();
  });

  it('several values read in one value part, and a long value keeps its whole text in the name', () => {
    const long = 'The deploy key of the storefront build computer in Frankfurt';
    render(
      <FilterChips
        filters={[
          { ...chip('multi'), value: 'paid,news' },
          { ...chip('single'), id: 'owner', label: 'Owner', options: [{ value: 'x', label: long }], value: 'x' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /^Type Billing/ }).querySelectorAll(`.${dt.chipValueText}`)).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Owner ${long}` })).toBeTruthy();
  });

  it('the rule between the parts is the plate line; the set frame is the darker button line, never the accent', () => {
    expect(rule('.chipOn')).toMatch(/--plate-line:\s*var\(--hx-btn-line-hover\)/);
    expect(rule('.chipOn .chipValue')).toMatch(/border-inline-start:\s*var\(--bw\) solid var\(--plate-line\)/);
    expect(rule('.chipOn .chipX')).toMatch(/border-inline-start:\s*var\(--bw\) solid var\(--plate-line\)/);
    expect(rule('.chipOn .chipName')).toMatch(/color:\s*var\(--hx-muted\)/);
    expect(rule('.chipValue')).toMatch(/color:\s*var\(--hx-ink\)/);
    expect(css.match(/\.chip(On|X|Value|Name)[^{]*\{[^}]*--hx-acc/g)).toBeNull();
  });

  it('a long value is cut short inside its part, and chips sit a step apart', () => {
    expect(rule('.chipValueText')).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule('.chipValueText')).toMatch(/max-inline-size:/);
    expect(rule('.chips')).toMatch(/gap:\s*var\(--sp-2\)/);
  });

  it('the clear button has its own hover step and a rule in forced colours', () => {
    expect(css).toMatch(/\.chipOn \.chipX\[data-hovered\],\s*\.chipOn \.chipX\[data-pressed\]\s*\{[^}]*--hx-btn-plate-press/);
    expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.chipOn \.chipValue,\s*\.chipOn \.chipX\s*\{[^}]*ButtonText/);
  });
});
