// NodeLink: the links drawn around the selected entity, the count of those over the limit, the
// keyboard route and the measured labels. The drawn geometry, both themes and 390 px are in nodelink.spec.ts.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeLink, type NodeLinkEdge, type NodeLinkNode } from './NodeLink';
import { fitLabel, NODE_LINK_MAX, NODE_LINK_MAX_NARROW, nodeLinkLayout } from './nodeLink.layout';

const nodes = (n: number): NodeLinkNode[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `entity ${i}` }));
const star = (n: number): NodeLinkEdge[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, source: 'n0', target: `n${i + 1}`, relation: 'uses' }));
/** One pixel per character, so a room is a character count the test can read. */
const px = (text: string) => [...text].length;

const neighbours = () => screen.getAllByRole('button').filter((b) => b.getAttribute('data-part') === 'neighbour');
const center = () => screen.getAllByRole('button').find((b) => b.getAttribute('data-part') === 'center')!;

afterEach(() => vi.restoreAllMocks());

describe('nodeLinkLayout', () => {
  it('draws at most the limit for the width, in the given order, and counts the rest as links', () => {
    const wide = nodeLinkLayout(nodes(20), star(19), 'n0', 720, px)!;
    expect(wide.spokes.map((x) => x.node.id)).toEqual(Array.from({ length: NODE_LINK_MAX }, (_, i) => `n${i + 1}`));
    expect(wide).toMatchObject({ narrow: false, links: 19, more: 7 });
    const phone = nodeLinkLayout(nodes(20), star(19), 'n0', 360, px)!;
    expect(phone.spokes).toHaveLength(NODE_LINK_MAX_NARROW);
    expect(phone).toMatchObject({ narrow: true, links: 19, more: 11 });
    expect(phone.spokes.every((x) => x.mid === null)).toBe(true);
    expect(wide.spokes.every((x) => x.mid !== null)).toBe(true);
  });
  it('joins two relations with one neighbour on one spoke and reads both directions', () => {
    const edges: NodeLinkEdge[] = [
      { id: 'a', source: 'n0', target: 'n1', relation: 'uses' },
      { id: 'b', source: 'n1', target: 'n0', relation: 'reads' },
      { id: 'c', source: 'n2', target: 'n0', relation: 'runs' },
    ];
    const at = nodeLinkLayout(nodes(3), edges, 'n0', 720, px)!;
    expect(at.spokes.map((x) => x.node.id)).toEqual(['n1', 'n2']);
    expect(at.spokes[0]!.relations.map((r) => [r.relation, r.outgoing])).toEqual([['uses', true], ['reads', false]]);
    expect(at.spokes[0]!.mid!.shown).toBe('uses +1');
    expect(at).toMatchObject({ links: 3, more: 0 });
  });
  it('counts a link over the limit once per relation, not once per neighbour', () => {
    const edges = [...star(13), { id: 'x', source: 'n13', target: 'n0', relation: 'reads' }];
    expect(nodeLinkLayout(nodes(14), edges, 'n0', 720, px)).toMatchObject({ links: 14, more: 2 });
  });
  it('skips a link to itself or to an entity not in the read, and an edge not touching the centre', () => {
    const edges: NodeLinkEdge[] = [
      { id: 'a', source: 'n0', target: 'n0', relation: 'uses' },
      { id: 'b', source: 'n0', target: 'gone', relation: 'uses' },
      { id: 'c', source: 'n1', target: 'n2', relation: 'uses' },
    ];
    expect(nodeLinkLayout(nodes(3), edges, 'n0', 720, px)).toMatchObject({ spokes: [], links: 0, more: 0 });
  });
  it('measures each text by its own kind, and two relations on one line never touch', () => {
    const long = 'a-relation-name-long-enough-to-need-cutting';
    const edges = Array.from({ length: 12 }, (_, i): NodeLinkEdge => ({ id: `e${i}`, source: 'n0', target: `n${i + 1}`, relation: long }));
    const kinds = new Set<string>();
    const at = nodeLinkLayout(nodes(13), edges, 'n0', 1028, (t, kind) => { kinds.add(kind); return px(t) * 7; })!;
    expect([...kinds].sort()).toEqual(['center', 'name', 'relation']);
    const mids = at.spokes.flatMap((x) => (x.mid ? [x.mid] : []));
    expect(mids.length).toBeGreaterThan(0);
    for (const a of mids)
      for (const b of mids) {
        if (a === b || Math.abs(a.y - b.y) >= 14) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual((px(a.shown) * 7 + px(b.shown) * 7) / 2);
      }
  });
  it('draws no relation name when it has no room', () => {
    const at = nodeLinkLayout(nodes(3), star(2), 'n0', 520, (t, kind) => (kind === 'relation' ? 1e6 : px(t)))!;
    expect(at.spokes.every((x) => x.mid === null)).toBe(true);
  });
  it('gives no layout for an entity not in the read', () => {
    expect(nodeLinkLayout(nodes(2), [], 'gone', 720, px)).toBeNull();
  });
  it('keeps every drawn label inside the box at phone width, by its measured advance', () => {
    const long = nodes(9).map((n) => ({ ...n, label: `${n.id}-a-very-long-entity-name-indeed` }));
    const glyph = (t: string) => [...t].length * 7;
    for (const width of [320, 358, 390]) {
      const at = nodeLinkLayout(long, star(8), 'n0', width, glyph)!;
      for (const x of at.spokes) {
        const w = glyph(x.shown);
        const left = x.anchor === 'start' ? x.labelX : x.anchor === 'end' ? x.labelX - w : x.labelX - w / 2;
        expect(left, x.shown).toBeGreaterThanOrEqual(0);
        expect(left + w, x.shown).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe('fitLabel', () => {
  it('keeps a label that fits, and cuts one that does not by the measure, never by a count', () => {
    expect(fitLabel('abcdef', 6, px)).toBe('abcdef');
    expect(fitLabel('abcdef', 4, px)).toBe('abc…');
    // Wide letters: the same room holds fewer of them.
    expect(fitLabel('WWWWWW', 4, (t) => [...t].reduce((n, c) => n + (c === 'W' ? 2 : 1), 0))).toBe('W…');
  });
  it('never splits a grapheme', () => {
    expect(fitLabel('👩‍💻👩‍💻👩‍💻', 2, (t) => [...new Intl.Segmenter().segment(t)].length)).toBe('👩‍💻…');
  });
  it('gives an empty label when not even the ellipsis fits', () => {
    expect(fitLabel('abc', 0.5, px)).toBe('');
    expect(fitLabel('abc', -3, px)).toBe('');
  });
  it('leaves only the ellipsis when nothing else fits', () => {
    expect(fitLabel('abc', 1, px)).toBe('…');
  });
});

describe('NodeLink', () => {
  const draw = (over: Partial<Parameters<typeof NodeLink>[0]> = {}) => {
    const onSelect = vi.fn();
    const r = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={onSelect} label="Links" {...over} />);
    return { onSelect, ...r };
  };

  it('draws nothing for an entity not in the read', () => {
    const { container } = draw({ selected: 'gone' });
    expect(container.firstChild).toBeNull();
  });
  it('names the drawing, marks the centre and names each neighbour with its relation', () => {
    draw();
    expect(screen.getByRole('group', { name: 'Links' })).toBeTruthy();
    expect(center().getAttribute('aria-current')).toBe('true');
    expect(neighbours().map((b) => b.getAttribute('aria-label'))[0]).toBe('entity 1, entity 0 uses entity 1');
  });
  it('shows the over-limit line whenever links are over the limit, and only then', () => {
    const { unmount } = draw({ nodes: nodes(20), edges: star(19) });
    expect(screen.getByText('+7 more links in the table')).toBeTruthy();
    unmount();
    const r = draw({ nodes: nodes(14), edges: star(13) });
    expect(screen.getByText('+1 more link in the table')).toBeTruthy();
    r.unmount();
    draw({ nodes: nodes(13), edges: star(12) });
    expect(screen.queryByText(/more link/)).toBeNull();
  });
  it('says how many links the centre has, and what a neighbour is on hover and focus', () => {
    draw();
    const about = () => document.querySelector('[data-part="about"]')!.textContent;
    expect(about()).toBe('entity 0: 4 links');
    fireEvent.pointerEnter(neighbours()[1]!);
    expect(about()).toBe('entity 0 uses entity 2');
    fireEvent.pointerLeave(neighbours()[1]!);
    expect(about()).toBe('entity 0: 4 links');
    fireEvent.focus(neighbours()[2]!);
    expect(about()).toBe('entity 0 uses entity 3');
  });
  it('a press on a neighbour selects it; a press on the centre does nothing', () => {
    const { onSelect } = draw();
    fireEvent.click(center());
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(neighbours()[1]!);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('n2');
  });
  it('holds one keyboard stop, and the arrows, Home and End move it round the ring', () => {
    draw();
    const stops = () => screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');
    expect(stops()).toEqual([center()]);
    act(() => center().focus());
    const on = () => document.activeElement?.getAttribute('aria-label');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(on()).toContain('entity 1,');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(on()).toContain('entity 4,');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(on()).toContain('entity 1,');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(on()).toContain('entity 4,');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(center());
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(on()).toContain('entity 4,');
    expect(stops()).toEqual([document.activeElement]);
  });
  it('Enter and Space select the focused neighbour, and the focus follows it to the centre', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={[...star(4), { id: 'z', source: 'n2', target: 'n3', relation: 'reads' }]} selected="n0" onSelect={onSelect} label="Links" />);
    act(() => neighbours()[1]!.focus());
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('n2');
    rerender(<NodeLink nodes={nodes(5)} edges={[...star(4), { id: 'z', source: 'n2', target: 'n3', relation: 'reads' }]} selected="n2" onSelect={onSelect} label="Links" />);
    expect(document.activeElement).toBe(center());
    expect(center().getAttribute('aria-label')).toBe('entity 2: 2 links');
    act(() => neighbours()[1]!.focus());
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith('n3');
  });
  it('a press that left the focus elsewhere still brings it to the new centre', () => {
    const edges = star(4);
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={edges} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(neighbours()[1]!);
    rerender(<NodeLink nodes={nodes(5)} edges={edges} selected="n2" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(center());
  });
  it('a press the caller did not take never makes a later outside selection take the focus', () => {
    const out = document.body.appendChild(document.createElement('button'));
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    fireEvent.click(neighbours()[0]!);
    out.focus();
    rerender(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n2" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(out);
    out.remove();
  });
  it('a press the caller did not take, then focus outside that ends on the page, never lets the same selection take the focus later', () => {
    const out = document.body.appendChild(document.createElement('button'));
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    fireEvent.click(neighbours()[0]!);
    act(() => out.focus());
    act(() => out.remove());
    expect(document.activeElement).toBe(document.body);
    rerender(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n1" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(document.body);
  });
  it('a pressed entity that lost the focus to the page, not to a control, gives up the move', async () => {
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    const n = neighbours()[0]!;
    act(() => n.focus());
    fireEvent.click(n);
    await act(async () => n.blur());
    rerender(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n1" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(document.body);
  });
  it('an entity the focus left for the page takes no focus back when it leaves', async () => {
    const all = nodes(5);
    const { rerender } = render(<NodeLink nodes={all} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    const n = neighbours()[1]!;
    act(() => n.focus());
    await act(async () => n.blur());
    rerender(<NodeLink nodes={all.filter((x) => x.id !== 'n2')} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(document.body);
  });
  it('a press taken while the focus went outside the part leaves the focus there', () => {
    const out = document.body.appendChild(document.createElement('button'));
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    fireEvent.click(neighbours()[1]!);
    out.focus();
    rerender(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n2" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(out);
    out.remove();
  });
  it('a focused entity that leaves hands the focus to the centre, and its return does not take the stop back', () => {
    const all = nodes(5);
    const { rerender } = render(<NodeLink nodes={all} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    act(() => neighbours()[1]!.focus());
    expect(neighbours()[1]!.getAttribute('tabindex')).toBe('0');
    const less = all.filter((n) => n.id !== 'n2');
    rerender(<NodeLink nodes={less} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(center());
    act(() => center().blur());
    rerender(<NodeLink nodes={all} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(center().getAttribute('tabindex')).toBe('0');
    expect(neighbours()[1]!.getAttribute('tabindex')).toBe('-1');
  });
  it('an entity that leaves while the focus is elsewhere takes no focus', () => {
    const out = document.body.appendChild(document.createElement('button'));
    const all = nodes(5);
    const { rerender } = render(<NodeLink nodes={all} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    out.focus();
    rerender(<NodeLink nodes={all.filter((n) => n.id !== 'n2')} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(out);
    out.remove();
  });
  it('a pointer leaving a focused entity keeps the readout on that entity', () => {
    render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    const n = neighbours()[1]!;
    act(() => n.focus());
    fireEvent.pointerEnter(n);
    fireEvent.pointerLeave(n);
    expect(document.querySelector('[data-part="about"]')!.textContent).toBe('entity 0 uses entity 2');
  });
  it('measures its box when an entity arrives after an empty read', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    const { rerender } = render(<NodeLink nodes={[]} edges={star(12)} selected="n0" onSelect={vi.fn()} label="Links" />);
    rerender(<NodeLink nodes={nodes(13)} edges={star(12)} selected="n0" onSelect={vi.fn()} label="Links" />);
    expect(neighbours().length).toBe(NODE_LINK_MAX_NARROW);
    expect(document.querySelector('svg')!.getAttribute('width')).toBe('320');
    width.mockRestore();
  });
  it('a selection from outside takes no focus', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { rerender } = render(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n0" onSelect={vi.fn()} label="Links" />);
    rerender(<NodeLink nodes={nodes(5)} edges={star(4)} selected="n1" onSelect={vi.fn()} label="Links" />);
    expect(document.activeElement).toBe(before);
    before.remove();
  });
});
