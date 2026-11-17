// ModelPickList: a virtualized listbox that keeps ModelListbox's contract over the
// whole view: roles, names, positions among all options, roving focus that reaches undrawn options, the heading in
// force, exact spacers, locked, the nearest survivor.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optionId, type ListOption } from './ModelListbox';
import { ModelPickList, type HeadingItem, type OptionItem } from './ModelPickList';
import { indexPick, NO_FILTERS, pickRows, pickView, type PickBase, type PickFilters, type PickView } from './modelPickLogic';

const ROW = 44;
const HEAD = 32;
const VIEWPORT = 600;

function base(n: number, providers = 10): PickBase[] {
  return Array.from({ length: n }, (_, i) => {
    const p = i % providers;
    return { spec: `p${p}/m${String(i).padStart(5, '0')}`, label: `Model ${i}`, providerId: `p${p}`, providerLabel: `Provider ${p}`, ready: p === 0 ? 'ready' : 'needs_key', source: 'provider' as const };
  });
}
const viewOf = (n: number, f: Partial<PickFilters> = {}, inherit = false, favourites: string[] = []): PickView =>
  pickView(indexPick(pickRows(base(n), null)), { ...NO_FILTERS, ...f }, { current: '', favourites, recent: [], inherit: inherit ? { label: "Agent's model" } : null });

const option = (it: OptionItem): ListOption =>
  it.kind === 'inherit' ? { spec: '', label: "Agent's model", selected: false } : { spec: it.row.spec, label: it.row.label, state: it.row.ready === 'ready' ? undefined : 'Needs setup', selected: false };
const heading = (it: HeadingItem) => <span>{it.group ? `${it.group.label} · ${it.count}` : it.section}</span>;

interface ListProps {
  view: PickView;
  value?: string | null;
  onActivate?: (s: string) => void;
  onType?: (c: string) => void;
  onEscape?: () => boolean;
  locked?: boolean;
  probe?: (s: string) => void;
  option?: (it: OptionItem) => ListOption;
  optionKey?: string;
  focusSpec?: string | null;
  focusToken?: number;
}
function List(props: ListProps) {
  return (
    <>
      <h3 id="h">Models</h3>
      <ModelPickList
        id="lb"
        labelledBy="h"
        view={props.view}
        value={props.value ?? null}
        option={props.option ?? option}
        optionKey={props.optionKey}
        heading={heading}
        rowHeight={ROW}
        headingHeight={HEAD}
        onActivate={props.onActivate ?? (() => undefined)}
        onType={props.onType}
        onEscape={props.onEscape}
        locked={props.locked}
        renderProbe={props.probe}
        focusSpec={props.focusSpec}
        focusToken={props.focusToken}
      />
      <button type="button">Outside</button>
    </>
  );
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};
const listbox = () => screen.getByRole('listbox', { name: 'Models' });
const options = () => within(listbox()).getAllByRole('option');
const spacers = () => [...listbox().querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter((el) => el.style.height !== '');
async function scrollTo(y: number) {
  const box = listbox();
  Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => y, set: () => {} });
  fireEvent.scroll(box);
  await flush();
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEWPORT);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(VIEWPORT);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
});
afterEach(() => vi.restoreAllMocks());

describe('a 7,077-model view draws a window, and says the whole', () => {
  it('draws a screenful, not every option; positions and set size count all options (headings not counted)', async () => {
    render(<List view={viewOf(7077)} />);
    await flush();
    const opts = options();
    expect(opts.length).toBeGreaterThan(5);
    expect(opts.length).toBeLessThan(60);
    for (const o of opts) expect(o).toHaveAttribute('aria-setsize', '7077');
    expect(opts[0]).toHaveAttribute('aria-posinset', '1');
    expect(listbox()).toHaveAttribute('data-rows', '7077');
  });

  it('every heading is a named group holding its rows; a heading is never an option', async () => {
    render(<List view={viewOf(300)} />);
    await flush();
    const groups = within(listbox()).getAllByRole('group');
    expect(groups[0]).toHaveAccessibleName('Provider 0 · 30');
    expect(within(groups[0]!).getAllByRole('option')[0]).toHaveAccessibleName('Model 0');
    expect(options().some((o) => o.textContent?.includes('Provider 0'))).toBe(false);
  });

  it('the layout is exact: drawn heights plus spacers equal the whole list, at the top and deep down', async () => {
    const view = viewOf(7077);
    const whole = view.items.reduce((h, it) => h + (it.kind === 'heading' ? HEAD : ROW), 0);
    render(<List view={view} />);
    await flush();
    const sum = () => spacers().reduce((h, el) => h + parseFloat(el.style.height), 0) + options().length * ROW + within(listbox()).getAllByRole('group').length * HEAD;
    expect(sum()).toBe(whole);
    await scrollTo(150_000);
    expect(Math.max(...options().map((o) => Number(o.getAttribute('aria-posinset'))))).toBeGreaterThan(1000);
    expect(sum()).toBe(whole);
  });

  it('deep down, the heading in force stays drawn in the group of the first drawn row', async () => {
    render(<List view={viewOf(7077)} />);
    await flush();
    await scrollTo(100_000);
    // The first drawn row of the window (the tab stop, option 1, stays drawn far above it).
    const first = options().find((o) => Number(o.getAttribute('aria-posinset')) > 1000)!;
    const group = first.closest('[role="group"]') as HTMLElement;
    expect(group.firstElementChild?.id).toBe(group.getAttribute('aria-labelledby'));
    expect(group).toHaveAccessibleName(/^Provider \d · \d+$/);
  });
});

describe('roving focus over undrawn options', () => {
  it('one tab stop: the value, drawn or not; selection never follows focus', async () => {
    const view = viewOf(2000);
    const rows = view.items.filter((i): i is OptionItem & { kind: 'row' } => i.kind === 'row');
    const deep = rows[1500]!.row.spec;
    render(<List view={view} value={deep} />);
    await flush();
    const stops = options().filter((o) => o.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.id).toBe(optionId('lb', deep));
    expect(stops[0]).toHaveAttribute('aria-selected', 'true');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    // Focus moves; the selection stays on the value.
    act(() => stops[0]!.focus());
    await userEvent.keyboard('{ArrowDown}');
    await flush();
    const next = rows[1501]!.row.spec;
    expect(document.activeElement?.id).toBe(optionId('lb', next));
    expect(document.activeElement).toHaveAttribute('aria-selected', 'false');
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.id)).toEqual([optionId('lb', deep)]);
  });

  it('End reaches the last of 7,077 options (drawn on demand), Home the first; arrows do not wrap', async () => {
    const user = userEvent.setup();
    render(<List view={viewOf(7077)} />);
    await flush();
    act(() => options()[0]!.focus());
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('aria-posinset', '1');
    await user.keyboard('{End}');
    await flush();
    expect(document.activeElement).toHaveAttribute('aria-posinset', '7077');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('aria-posinset', '7077');
    await user.keyboard('{Home}');
    await flush();
    expect(document.activeElement).toHaveAttribute('aria-posinset', '1');
  });

  it('a far move draws its target before any scroll lands: End focuses the last option while the box ignores scrolling', async () => {
    const user = userEvent.setup();
    render(<List view={viewOf(7077)} />);
    await flush();
    // The box never scrolls (writes ignored, scrollTo a no-op): only keeping the move's target drawn can reach it.
    const box = listbox();
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => 0, set: () => {} });
    Object.defineProperty(box, 'scrollTo', { configurable: true, value: () => undefined });
    act(() => options()[0]!.focus());
    await user.keyboard('{End}');
    await flush();
    expect(document.activeElement).toHaveAttribute('aria-posinset', '7077');
    expect(options().some((o) => o.getAttribute('aria-posinset') === '1')).toBe(true);
  });

  it('PageDown moves by 10 options across headings', async () => {
    const user = userEvent.setup();
    render(<List view={viewOf(500)} />);
    await flush();
    act(() => options()[0]!.focus());
    await user.keyboard('{PageDown}{PageDown}');
    await flush();
    expect(document.activeElement).toHaveAttribute('aria-posinset', '21');
  });

  it('Enter and Space activate; every printable key goes to the search; Escape asks', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onType = vi.fn();
    const onEscape = vi.fn(() => true);
    render(<List view={viewOf(50)} onActivate={onActivate} onType={onType} onEscape={onEscape} />);
    await flush();
    const target = options()[1]!;
    act(() => target.focus());
    await user.keyboard('{Enter} ');
    expect(onActivate.mock.calls.map((c) => c[0])).toEqual([target.dataset.spec, target.dataset.spec]);
    await user.keyboard('s*');
    expect(onType.mock.calls.map((c) => c[0])).toEqual(['s', '*']);
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('locked: activation does nothing, focus still moves', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<List view={viewOf(50)} onActivate={onActivate} locked />);
    await flush();
    expect(listbox()).toHaveAttribute('aria-disabled', 'true');
    act(() => options()[0]!.focus());
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onActivate).not.toHaveBeenCalled();
    expect(document.activeElement).toHaveAttribute('aria-posinset', '2');
  });

  it('when the focused option leaves the view (a filter narrowed it), focus goes to the nearest survivor', async () => {
    const { rerender } = render(<List view={viewOf(200)} />);
    await flush();
    act(() => options()[2]!.focus()); // a ready row (Provider 0)
    expect(document.activeElement).toHaveAttribute('aria-posinset', '3');
    rerender(<List view={viewOf(200, { readiness: 'setup' })} />);
    await flush();
    expect(listbox().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute('aria-posinset', '3');
  });

  it('a focused option the view moves to another section keeps focus (it was unmounted and mounted again)', async () => {
    const { rerender } = render(<List view={viewOf(200)} />);
    await flush();
    const spec = options()[2]!.getAttribute('data-spec')!;
    act(() => options()[2]!.focus());
    rerender(<List view={viewOf(200, {}, false, [spec])} />);
    await flush();
    expect(within(listbox()).getAllByRole('group')[0]).toHaveTextContent('favourites');
    expect(document.activeElement?.getAttribute('data-spec')).toBe(spec);
    expect(document.activeElement).toHaveAttribute('aria-posinset', '1');
  });

  it('a far move whose target leaves the view before it is drawn is dropped: it never takes focus later', async () => {
    const full = viewOf(7077);
    const { rerender } = render(<List view={full} />);
    await flush();
    const box = listbox();
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => 0, set: () => {} });
    Object.defineProperty(box, 'scrollTo', { configurable: true, value: () => undefined });
    const first = options()[0]!;
    act(() => first.focus());
    const last = full.items.filter((i) => i.kind === 'row').at(-1)!;
    const lastSpec = last.kind === 'row' ? last.row.spec : '';
    // The End press and a view without the target land in one render: the target is never drawn.
    const firstProvider = full.items.find((i) => i.kind === 'row')!;
    const narrowed = viewOf(7077, { providers: [firstProvider.kind === 'row' ? firstProvider.row.providerId : ''] });
    expect(narrowed.items.some((i) => i.kind === 'row' && i.row.spec === lastSpec)).toBe(false);
    act(() => {
      fireEvent.keyDown(options()[0]!, { key: 'End' });
      rerender(<List view={narrowed} />);
    });
    await flush();
    expect(document.activeElement?.getAttribute('data-spec')).toBe(first.getAttribute('data-spec'));
    // The target comes back: focus stays where it is, and the dropped move draws nothing.
    rerender(<List view={full} />);
    await flush();
    expect(document.activeElement?.getAttribute('data-spec')).toBe(first.getAttribute('data-spec'));
    expect(document.getElementById(optionId('lb', lastSpec))).toBeNull();
    // Focus that left the list on purpose stays out, even when the option it left goes (no survivor pulls it back).
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => outside.focus());
    rerender(<List view={viewOf(7077, { providers: ['p1'] })} />);
    await flush();
    expect(document.activeElement).toBe(outside);
  });

  it('an option whose words change for the same view is drawn anew when the caller changes optionKey', async () => {
    const view = viewOf(20);
    const { rerender } = render(<List view={view} optionKey="a" />);
    await flush();
    const first = options()[0]!.getAttribute('data-spec')!;
    const renamed = (it: OptionItem): ListOption => ({ ...option(it), label: it.kind === 'row' && it.row.spec === first ? 'Renamed' : option(it).label });
    rerender(<List view={view} optionKey="a" option={renamed} />);
    await flush();
    expect(options()[0]).not.toHaveAccessibleName('Renamed');
    rerender(<List view={view} optionKey="b" option={renamed} />);
    await flush();
    expect(options()[0]).toHaveAccessibleName('Renamed');
  });

  it('an asked focus (focusToken) moves focus to its option, drawn or not, and wins over the survivor', async () => {
    const view = viewOf(2000);
    const rows = view.items.filter((i): i is OptionItem & { kind: 'row' } => i.kind === 'row');
    const deep = rows[1500]!.row.spec;
    const { rerender } = render(<List view={view} />);
    await flush();
    rerender(<List view={view} focusSpec={deep} focusToken={1} />);
    await flush();
    expect(document.activeElement?.id).toBe(optionId('lb', deep));
    // The focused option leaves the view in the same render as a new ask: the asked option gets focus.
    const narrowed = viewOf(2000, { readiness: 'setup' });
    const asked = narrowed.items.filter((i): i is OptionItem & { kind: 'row' } => i.kind === 'row')[700]!.row.spec;
    rerender(<List view={narrowed} focusSpec={asked} focusToken={2} />);
    await flush();
    expect(document.activeElement?.id).toBe(optionId('lb', asked));
  });

  it('an asked focus whose token comes before its spec is served once the spec arrives, and only once', async () => {
    const view = viewOf(2000);
    const rows = view.items.filter((i): i is OptionItem & { kind: 'row' } => i.kind === 'row');
    const deep = rows[1500]!.row.spec;
    const { rerender } = render(<List view={view} focusSpec={null} focusToken={1} />);
    await flush();
    rerender(<List view={view} focusSpec={deep} focusToken={1} />);
    await flush();
    expect(document.activeElement?.id).toBe(optionId('lb', deep));
    // Served: the same token does not take focus back, and the survivor recovery works again.
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => outside.focus());
    rerender(<List view={view} focusSpec={rows[3]!.row.spec} focusToken={1} />);
    await flush();
    expect(document.activeElement).toBe(outside);
  });

  it('focus moved out of the list while a far move waits drops the move', async () => {
    const full = viewOf(7077);
    render(<List view={full} />);
    await flush();
    const box = listbox();
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => 0, set: () => {} });
    Object.defineProperty(box, 'scrollTo', { configurable: true, value: () => undefined });
    const first = options()[0]!;
    act(() => first.focus());
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => {
      fireEvent.keyDown(first, { key: 'End' });
      outside.focus();
    });
    await flush();
    expect(document.activeElement).toBe(outside);
  });

  it('the set size is read again when the view says a new total for the same items', async () => {
    const view = viewOf(20);
    const { rerender } = render(<List view={view} />);
    await flush();
    expect(options()[0]).toHaveAttribute('aria-setsize', String(view.total));
    rerender(<List view={{ ...view, total: view.total + 5 }} />);
    await flush();
    expect(options()[0]).toHaveAttribute('aria-setsize', String(view.total + 5));
  });

  it('the inherit row is the first option, and can be the value', async () => {
    const view = viewOf(20, {}, true);
    render(<List view={view} value="" />);
    await flush();
    expect(options()[0]).toHaveAccessibleName("Agent's model");
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(options()[0]).toHaveAttribute('aria-setsize', String(view.total));
  });

  it('an arrow move re-renders only the two rows whose tab stop changed', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(<List view={viewOf(300)} probe={(s) => seen.push(s)} />);
    await flush();
    act(() => options()[3]!.focus());
    seen.length = 0;
    await user.keyboard('{ArrowDown}');
    expect(seen.length).toBeLessThanOrEqual(2);
  });
});
