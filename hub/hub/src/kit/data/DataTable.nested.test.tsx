// DataTable nested groups (each holding its resources):
// TableGroup.parent, one level. A parent counts its children, closing it hides them and their rows (each child keeps
// its own state), a child's header and rows are indented one and two steps, the child in force sticks under its parent
// (and only it), virtual rows keep both headers drawn, and the headers stay buttons the keyboard reaches. A table whose
// groups name no parent takes none of this (the other DataTable tests are unchanged).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';

// The search box's URL param (`q`); every other param reads empty.
const nav = vi.hoisted(() => ({ q: undefined as string | undefined }));
vi.mock('../nav', () => ({
  useSearchParam: (name: string) => [name === 'q' ? nav.q : undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  group: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const rows = (group: string, n: number, from = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: `${group}${from + i}`, name: `${group} ${from + i}`, group }));
// Agent holds its own row, Sessions (2) and Tools (3); Files has rows of its own only; Empty has nothing at all.
const SMALL: Row[] = [...rows('agent', 1), ...rows('sessions', 2), ...rows('tools', 3), ...rows('files', 2)];
const GROUPS: TableGroup[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'sessions', label: 'Sessions', parent: 'agent' },
  { id: 'tools', label: 'Tools', parent: 'agent' },
  { id: 'empty', label: 'Empty', parent: 'agent' },
  { id: 'files', label: 'Files' },
];
type Props = Partial<Parameters<typeof DataTable<Row>>[0]>;
const table = (extra: Props = {}, data = SMALL, groups = GROUPS) =>
  render(<DataTable label="Nested" data={data} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={groups} presentation="table" pageSize={500} {...extra} />);

const headerBtn = (label: string) => screen.queryAllByRole('button').find((b) => b.hasAttribute('aria-expanded') && b.textContent?.startsWith(label));
const headerRow = (label: string) => headerBtn(label)?.closest('tr') as HTMLElement | undefined;
/** The body in drawn order: a header as `#Label count`, a row as its id. */
const body = () =>
  [...document.querySelectorAll<HTMLElement>('tbody > tr')]
    .filter((tr) => tr.getAttribute('aria-hidden') !== 'true')
    .map((tr) => {
      const b = tr.querySelector('[aria-expanded]');
      return b ? `#${b.textContent}` : (tr.dataset.rowId ?? '?');
    });
const flush = async () => {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
};

describe('DataTable nested groups (TableGroup.parent)', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    nav.q = undefined;
  });

  it('a parent comes first with its own rows, then each child with its rows; its count is its rows plus its children', () => {
    table();
    expect(body()).toEqual(['#Agent6', 'agent0', '#Sessions2', 'sessions0', 'sessions1', '#Tools3', 'tools0', 'tools1', 'tools2', '#Files2', 'files0', 'files1']);
  });

  it('an empty child is drawn only with showEmpty, counted 0', () => {
    table({}, SMALL, GROUPS.map((g) => (g.id === 'empty' ? { ...g, showEmpty: true } : g)));
    expect(body()).toEqual(['#Agent6', 'agent0', '#Sessions2', 'sessions0', 'sessions1', '#Tools3', 'tools0', 'tools1', 'tools2', '#Empty0', '#Files2', 'files0', 'files1']);
  });

  it('a parent with only children is drawn; one with nothing under it is not', () => {
    table({}, [...rows('tools', 2)]);
    expect(body()).toEqual(['#Agent2', '#Tools2', 'tools0', 'tools1']);
  });

  it('closing a parent hides its children and their rows; reopening shows each child as it was', async () => {
    const user = userEvent.setup();
    table();
    await user.click(headerBtn('Sessions')!);
    expect(body()).toEqual(['#Agent6', 'agent0', '#Sessions2', '#Tools3', 'tools0', 'tools1', 'tools2', '#Files2', 'files0', 'files1']);
    await user.click(headerBtn('Agent')!);
    expect(body()).toEqual(['#Agent6', '#Files2', 'files0', 'files1']);
    expect(headerBtn('Agent')).toHaveAttribute('aria-expanded', 'false');
    await user.click(headerBtn('Agent')!);
    expect(headerBtn('Sessions')).toHaveAttribute('aria-expanded', 'false');
    expect(headerBtn('Tools')).toHaveAttribute('aria-expanded', 'true');
    expect(body()).toEqual(['#Agent6', 'agent0', '#Sessions2', '#Tools3', 'tools0', 'tools1', 'tools2', '#Files2', 'files0', 'files1']);
  });

  it('a collapsed parent (controlled) hides its children; the page opens it by leaving it out', () => {
    const r = table({ collapsedGroups: ['agent'] });
    expect(body()).toEqual(['#Agent6', '#Files2', 'files0', 'files1']);
    r.rerender(<DataTable label="Nested" data={SMALL} columns={COLUMNS} getRowId={(x) => x.id} groupBy={(x) => x.group} groups={GROUPS} presentation="table" pageSize={500} collapsedGroups={['tools']} />);
    expect(body()).toEqual(['#Agent6', 'agent0', '#Sessions2', 'sessions0', 'sessions1', '#Tools3', '#Files2', 'files0', 'files1']);
  });

  it("the keyboard reaches a parent's header: Enter and Space close and open it", async () => {
    const user = userEvent.setup();
    table();
    act(() => headerBtn('Agent')!.focus());
    await user.keyboard('{Enter}');
    expect(headerBtn('Agent')).toHaveAttribute('aria-expanded', 'false');
    expect(headerBtn('Sessions')).toBeUndefined();
    await user.keyboard(' ');
    expect(headerBtn('Agent')).toHaveAttribute('aria-expanded', 'true');
    expect(headerBtn('Sessions')).toBeDefined();
  });

  it("indents: a child's header one step (depth 1), its rows two; a parent's own rows and a plain group's rows one", () => {
    table();
    expect(headerRow('Sessions')?.dataset.groupDepth).toBe('1');
    expect(headerRow('Sessions')?.className).toMatch(/groupRowChild/);
    expect(headerRow('Agent')?.dataset.groupDepth).toBeUndefined();
    expect(headerRow('Agent')?.dataset.groupTop).toBe('agent');
    const lead = (id: string) => document.querySelector<HTMLElement>(`tr[data-row-id="${id}"] [data-group-indent]`);
    expect(lead('sessions0')?.dataset.groupIndent).toBe('2');
    expect(lead('sessions0')?.className).toMatch(/groupIndent2/);
    expect(lead('agent0')?.dataset.groupIndent).toBe('');
    expect(lead('files0')?.dataset.groupIndent).toBe('');
    expect(lead('files0')?.className).not.toMatch(/groupIndent2/);
  });

  it('a search opens every group with a match, children and parents alike', () => {
    nav.q = 'tools 1';
    table({ collapsedGroups: ['agent', 'tools'] });
    expect(body()).toEqual(['#Agent1', '#Tools1', 'tools1']);
  });

  it('one level only: a group under a child, or naming itself or no group, is drawn at the top level', () => {
    const groups: TableGroup[] = [
      { id: 'agent', label: 'Agent' },
      { id: 'sessions', label: 'Sessions', parent: 'agent' },
      { id: 'tools', label: 'Tools', parent: 'sessions' },
      { id: 'files', label: 'Files', parent: 'files' },
      { id: 'notes', label: 'Notes', parent: 'nowhere' },
    ];
    table({}, [...rows('sessions', 1), ...rows('tools', 1), ...rows('files', 1), ...rows('notes', 1)], groups);
    expect(body()).toEqual(['#Agent1', '#Sessions1', 'sessions0', '#Tools1', 'tools0', '#Files1', 'files0', '#Notes1', 'notes0']);
    expect(headerRow('Tools')?.dataset.groupDepth).toBeUndefined();
  });

  it('groups that name no valid parent draw the same markup as groups with no parent field', () => {
    const ids = (html: string) => html.replace(/react-aria-[^"]*/g, 'id'); // reason: generated ids differ per mount
    const plain = GROUPS.map(({ parent: _p, ...g }) => g);
    const a = table({}, SMALL, plain);
    const before = ids(a.container.innerHTML);
    a.unmount();
    const b = table({}, SMALL, plain.map((g) => ({ ...g, parent: g.id })));
    expect(ids(b.container.innerHTML)).toBe(before);
    expect(before).not.toMatch(/data-group-(depth|top)|groupIndent2|groupRowChild/);
  });

  describe('with stickyGroups', () => {
    /** Each top-level header's top on screen, by id: everything else at 0 (jsdom lays nothing out). */
    let tops: Record<string, number> = {};
    /** Each top-level header's drawn height, by id: 0 otherwise. */
    let heights: Record<string, number> = {};
    beforeEach(() => {
      tops = {};
      heights = {};
      const real = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const top = tops[this.dataset.groupTop ?? ''] ?? 0;
        const height = heights[this.dataset.groupTop ?? ''] ?? 0;
        return { ...real.call(this).toJSON(), top, bottom: top + height, y: top, height } as DOMRect;
      });
    });
    const headH = () => document.querySelector('table')!.style.getPropertyValue('--group-head-h');
    const scroller = () => document.querySelector('table')!.parentElement!;

    it("only the children of the parent in force stick, under it; when the next parent takes over, they let go", async () => {
      tops = { files: 400 };
      table({ stickyGroups: true });
      await flush();
      const inForce = (label: string) => /groupChildInForce/.test(headerRow(label)?.className ?? '');
      expect(inForce('Sessions')).toBe(true);
      expect(inForce('Tools')).toBe(true);
      tops = { files: 0 };
      act(() => {
        fireEvent.scroll(scroller());
      });
      expect(inForce('Sessions')).toBe(false);
      expect(inForce('Tools')).toBe(false);
    });

    it("the child sticks under the parent's drawn height (a header whose sentence wraps), measured again when it changes", async () => {
      tops = { files: 400 };
      heights = { agent: 88, files: 44 };
      table({ stickyGroups: true });
      await flush();
      expect(headH()).toBe('88px');
      tops = { files: 0 };
      act(() => {
        fireEvent.scroll(scroller());
      });
      expect(headH()).toBe('44px');
    });

    it('the parent in force is picked again after a render that moved the headers, with no scroll', async () => {
      tops = { files: 400 };
      const r = table({ stickyGroups: true });
      await flush();
      expect(headerRow('Sessions')?.className).toMatch(/groupChildInForce/);
      tops = { files: 0 };
      r.rerender(<DataTable label="Nested" data={SMALL} columns={COLUMNS} getRowId={(x) => x.id} groupBy={(x) => x.group} groups={GROUPS} presentation="table" pageSize={500} stickyGroups collapsedGroups={['sessions']} />);
      await flush();
      expect(headerRow('Sessions')?.className).not.toMatch(/groupChildInForce/);
      expect(headerRow('Tools')?.className).not.toMatch(/groupChildInForce/);
    });

    it('a child never sticks without stickyGroups', async () => {
      tops = { files: 400 };
      table();
      await flush();
      expect(headerRow('Sessions')?.className).not.toMatch(/groupChildInForce/);
    });

    it('virtual rows keep the parent in force and its child in force drawn, far above the window', async () => {
      // 300 rows: Agent > Sessions (150), Tools (150); past 200, so virtual.
      const many = [...rows('sessions', 150), ...rows('tools', 150)];
      table({ stickyGroups: true }, many);
      const scrollTo = async (y: number) => {
        Object.defineProperty(scroller(), 'scrollTop', { configurable: true, get: () => y, set: () => {} });
        fireEvent.scroll(scroller());
        await flush();
      };
      await scrollTo(40 + 40 + 44 * 100);
      expect(headerRow('Agent'), 'the parent is kept').toBeDefined();
      expect(headerRow('Sessions'), 'its child in force is kept').toBeDefined();
      expect(document.querySelector('tr[data-row-id="sessions0"]')).toBeNull();
      // Into Tools: Agent still, Tools now; Sessions' header is no longer kept.
      await scrollTo(40 + 40 + 44 * 150 + 40 + 44 * 60);
      expect(headerRow('Agent')).toBeDefined();
      expect(headerRow('Tools')).toBeDefined();
      expect(headerRow('Sessions')).toBeUndefined();
    });
  });
});
