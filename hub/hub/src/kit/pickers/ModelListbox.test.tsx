// ModelListbox: the roles and attributes table, the keys table, roving focus, locked, the nearest
// survivor, and an arrow move that re-renders at most two options.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelListbox, ModelPager, optionId, type ListGroup, type ListOption } from './ModelListbox';
import { pager } from './modelPaging';

const opt = (spec: string, o: Partial<ListOption> = {}): ListOption => ({ spec, label: spec.split('/')[1] ?? spec, selected: false, ...o });
const GROUPS: ListGroup[] = [
  { id: 'hoody-ai', header: <span>Hoody AI · Included</span>, options: [opt('hoody-ai/hoody-free', { tags: ['Recommended'] })] },
  {
    id: 'openai',
    header: <span>OpenAI · Your key · 2 of 3 ready</span>,
    options: [opt('openai/gpt-5', { selected: true, tags: ['Current'] }), opt('openai/gpt-5-mini', { state: "Can't tell if it runs here" }), opt('openai/o3', { state: 'Needs setup: API key', hint: 'Enter sets up OpenAI.' })],
  },
];
const MANY: ListGroup[] = [{ id: 'p', header: <span>Big</span>, options: Array.from({ length: 30 }, (_, i) => opt(`p/m${String(i).padStart(2, '0')}`)) }];

function Box(props: Partial<Parameters<typeof ModelListbox>[0]> & { groups?: ListGroup[] }) {
  return (
    <>
      <h3 id="h">Ready to use</h3>
      <p id="c">Showing 4 of 4</p>
      <ModelListbox id="lb" labelledBy="h" describedBy="c" groups={GROUPS} onActivate={() => undefined} {...props} />
    </>
  );
}

describe('roles and attributes', () => {
  it('is one listbox named by the heading and described by the count line, never multi-select', () => {
    render(<Box />);
    const lb = screen.getByRole('listbox', { name: 'Ready to use' });
    expect(lb).toHaveAttribute('aria-describedby', 'c');
    expect(lb).not.toHaveAttribute('aria-multiselectable');
  });

  it('groups are named by their plain header (name and facts), and a header is never an option', () => {
    render(<Box />);
    const g = screen.getByRole('group', { name: 'OpenAI · Your key · 2 of 3 ready' });
    expect(within(g).getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByRole('option', { name: /Your key/ })).toBeNull();
  });

  it('options have stable ids from the list id and the spec, aria-selected only for the value, and their state as description', () => {
    render(<Box />);
    const cur = screen.getByRole('option', { name: 'gpt-5 Current' });
    expect(cur.id).toBe(optionId('lb', 'openai/gpt-5'));
    expect(cur).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /hoody-free/ })).toHaveAttribute('aria-selected', 'false');
    const setup = screen.getByRole('option', { name: /^o3/ });
    expect(setup).toHaveAccessibleDescription('Needs setup: API key Enter sets up OpenAI.');
    // Needs-setup options stay operable (they open setup): never aria-disabled.
    expect(setup).not.toHaveAttribute('aria-disabled');
  });

  it('a drill-in option carries the absolute position and the provider total ("101 of 598")', () => {
    render(<Box groups={[{ id: 'd', header: null, label: 'OpenAI', options: [opt('openai/x', { posinset: 101, setsize: 598 })] }]} />);
    const o = screen.getByRole('option');
    expect(o).toHaveAttribute('aria-posinset', '101');
    expect(o).toHaveAttribute('aria-setsize', '598');
  });

  it('roving tabIndex: the value holds the one tab stop until focus moves, then the focused option does', async () => {
    render(<Box />);
    const stops = () => screen.getAllByRole('option').filter((o) => o.tabIndex === 0);
    expect(stops().map((o) => o.dataset.spec)).toEqual(['openai/gpt-5']);
    await userEvent.click(screen.getByRole('option', { name: /hoody-free/ }));
    expect(stops().map((o) => o.dataset.spec)).toEqual(['hoody-ai/hoody-free']);
  });

  it('selection does not follow focus: arrows move the tab stop, aria-selected stays on the value', async () => {
    render(<Box />);
    screen.getByRole('option', { name: /hoody-free/ }).focus();
    await userEvent.keyboard('{End}');
    const selected = () => screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
    expect((document.activeElement as HTMLElement).dataset.spec).toBe('openai/o3');
    expect(selected().map((o) => o.dataset.spec)).toEqual(['openai/gpt-5']);
  });

  it('with no value the first option holds the tab stop; Tab leaves the list (one stop)', async () => {
    render(
      <>
        <Box groups={MANY} />
        <button type="button">after</button>
      </>,
    );
    expect(screen.getAllByRole('option').filter((o) => o.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab();
    expect(document.activeElement).toHaveAttribute('data-spec', 'p/m00');
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent('after');
  });
});

describe('keys', () => {
  it('ArrowDown/Up cross groups without wrapping; Home/End; PageDown/PageUp move 10', async () => {
    render(<Box />);
    screen.getByRole('option', { name: /hoody-free/ }).focus();
    const at = () => (document.activeElement as HTMLElement).dataset.spec;
    await userEvent.keyboard('{ArrowUp}');
    expect(at()).toBe('hoody-ai/hoody-free');
    await userEvent.keyboard('{ArrowDown}');
    expect(at()).toBe('openai/gpt-5');
    await userEvent.keyboard('{End}');
    expect(at()).toBe('openai/o3');
    await userEvent.keyboard('{ArrowDown}');
    expect(at()).toBe('openai/o3');
    await userEvent.keyboard('{Home}');
    expect(at()).toBe('hoody-ai/hoody-free');
  });

  it('PageDown/PageUp move ten options', async () => {
    render(<Box groups={MANY} />);
    screen.getAllByRole('option')[0]!.focus();
    await userEvent.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-spec', 'p/m10');
    await userEvent.keyboard('{PageDown}{PageDown}{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-spec', 'p/m29');
    await userEvent.keyboard('{PageUp}');
    expect(document.activeElement).toHaveAttribute('data-spec', 'p/m19');
  });

  it('Enter and Space activate; a click activates', async () => {
    const onActivate = vi.fn();
    render(<Box onActivate={onActivate} />);
    screen.getByRole('option', { name: /hoody-free/ }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByRole('option', { name: /^o3/ }));
    expect(onActivate.mock.calls.map((c) => c[0])).toEqual(['hoody-ai/hoody-free', 'hoody-ai/hoody-free', 'openai/o3']);
  });

  it('a printable key goes to onType; Escape asks onEscape and stops only when it was handled', async () => {
    const onType = vi.fn();
    const outer = vi.fn();
    const onEscape = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a test wrapper that sees the bubbling Escape
      <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
        <Box onType={onType} onEscape={onEscape} />
      </div>,
    );
    screen.getByRole('option', { name: /hoody-free/ }).focus();
    await userEvent.keyboard('g');
    expect(onType).toHaveBeenCalledWith('g');
    await userEvent.keyboard('{Escape}');
    expect(outer).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('locked: aria-disabled on the listbox, activation does nothing, focus still moves', async () => {
    const onActivate = vi.fn();
    render(<Box locked onActivate={onActivate} />);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-disabled', 'true');
    screen.getByRole('option', { name: /hoody-free/ }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('option', { name: /^o3/ }));
    await userEvent.keyboard('{ArrowUp}');
    expect(onActivate).not.toHaveBeenCalled();
    expect(document.activeElement).toHaveAttribute('data-spec', 'openai/gpt-5-mini');
  });

  it('a disabled option (the held model while loading) is shown but never activates', async () => {
    const onActivate = vi.fn();
    render(<Box onActivate={onActivate} groups={[{ id: 'f', header: <span>Can&apos;t tell yet</span>, options: [opt('hoody-ai/hoody-free', { isDisabled: true })] }]} />);
    await userEvent.click(screen.getByRole('option'));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('focus and rendering', () => {
  it('when the focused option disappears, focus goes to the nearest survivor', async () => {
    function Shrink() {
      const [groups, setGroups] = useState(GROUPS);
      return (
        <>
          <button type="button" onClick={() => setGroups([GROUPS[0]!, { ...GROUPS[1]!, options: GROUPS[1]!.options.filter((o) => o.spec !== 'openai/gpt-5-mini') }])}>
            drop
          </button>
          <Box groups={groups} onType={() => setGroups([GROUPS[0]!, { ...GROUPS[1]!, options: GROUPS[1]!.options.filter((o) => o.spec !== 'openai/gpt-5-mini') }])} />
        </>
      );
    }
    render(<Shrink />);
    screen.getByRole('option', { name: /gpt-5-mini/ }).focus();
    // A typed key removes the focused row while focus is in the list.
    await userEvent.keyboard('x');
    expect(document.activeElement).toHaveAttribute('data-spec', 'openai/o3');
  });

  it('an arrow move re-renders at most two options', async () => {
    const seen: string[] = [];
    render(<Box groups={MANY} renderProbe={(spec) => seen.push(spec)} />);
    act(() => screen.getAllByRole('option')[3]!.focus());
    seen.length = 0;
    await userEvent.keyboard('{ArrowDown}');
    expect(seen).toEqual(['p/m03', 'p/m04']);
    seen.length = 0;
    await userEvent.keyboard('{ArrowDown}');
    expect(seen.length).toBeLessThanOrEqual(2);
  });

  it('an asked focus (a page change) moves DOM focus to that option', () => {
    const { rerender } = render(<Box groups={MANY} />);
    rerender(<Box groups={MANY} focusSpec="p/m20" focusToken={1} />);
    expect(document.activeElement).toHaveAttribute('data-spec', 'p/m20');
  });
});

describe('ModelPager', () => {
  it('is a nav named "{section} pages" with Previous and Next disabled at the ends and the range as text', async () => {
    const onPage = vi.fn();
    const { rerender } = render(<ModelPager pg={pager(598, 100, 0)} navLabel="OpenAI models pages" range="1–100 of 598" prev="Previous" next="Next" onPage={onPage} />);
    const nav = screen.getByRole('navigation', { name: 'OpenAI models pages' });
    expect(within(nav).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(nav).toHaveTextContent('1–100 of 598');
    await userEvent.click(within(nav).getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(1);
    rerender(<ModelPager pg={pager(598, 100, 5)} navLabel="OpenAI models pages" range="501–598 of 598" prev="Previous" next="Next" onPage={onPage} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
