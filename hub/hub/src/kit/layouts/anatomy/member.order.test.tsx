// Vitest: a SectionGroup keeps its sections in a
// Map, whose insertion order survives a keyed reorder of existing sections, so the first-use card kept the old order:
// the old first section's primary stayed the card's main action. The group now reads document order, also while it is
// collapsed (a section with nothing to keep leaves a hidden marker).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { memo, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { AnatomySection } from './Section';
import { SectionGroup } from './SectionGroup';
import type { EmptyProof, EmptySpec } from './types';

const PROOF = {} as unknown as EmptyProof;
const FIRST: EmptySpec = { title: 'Set up storage', body: 'Connect storage, then choose folders.' };

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const sec = (id: string, extra: Record<string, unknown> = {}) => (
  <AnatomySection key={id} id={id} title={`Title ${id}`} actions={{ primary: { id, label: `Add ${id}`, onPress: () => undefined } }} state={{ kind: 'empty', proof: PROOF }} empty={{ title: `Empty ${id}`, body: 'Nothing here.' }} {...extra} />
);

/** The card's buttons in order; the first is its main action. */
const cardButtons = () => [...document.querySelectorAll('[data-hub-state="firstUse"] button')].map((b) => b.textContent);

describe('SectionGroup first-use card follows the sections\' order', () => {
  it('a keyed reorder of collapsed sections reorders the card: the new first section gives the main action', async () => {
    let flip: () => void = () => undefined;
    function Page() {
      const [order, setOrder] = useState(['a', 'b', 'c']);
      flip = () => setOrder(['c', 'a', 'b']);
      return <SectionGroup firstUse={FIRST}>{order.map((id) => sec(id))}</SectionGroup>;
    }
    await show(() => <Page />);
    expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
    expect(screen.getByRole('button', { name: 'Add a' }).className).toMatch(/\bprimary\b/);
    await act(async () => flip());
    expect(cardButtons()).toEqual(['Add c', 'Add a', 'Add b']);
    expect(screen.getByRole('button', { name: 'Add c' }).className).toMatch(/\bprimary\b/);
    expect(screen.getByRole('button', { name: 'Add a' }).className).not.toMatch(/\bprimary\b/);
  });

  it('a reorder where a section keeps a notice (no marker) still follows the new order', async () => {
    let flip: () => void = () => undefined;
    function Page() {
      const [order, setOrder] = useState(['a', 'b']);
      flip = () => setOrder(['b', 'a']);
      return <SectionGroup firstUse={FIRST}>{order.map((id) => sec(id, id === 'a' ? { notices: <p>a notice</p> } : {}))}</SectionGroup>;
    }
    await show(() => <Page />);
    expect(cardButtons()).toEqual(['Add a', 'Add b']);
    await act(async () => flip());
    expect(cardButtons()).toEqual(['Add b', 'Add a']);
    expect(screen.getByText('a notice')).toBeInTheDocument();
  });

  it('a section that joins later, in the middle, takes its place in document order, not at the end', async () => {
    let add: () => void = () => undefined;
    function Page() {
      const [ids, setIds] = useState(['a', 'c']);
      add = () => setIds(['a', 'b', 'c']);
      return <SectionGroup firstUse={FIRST}>{ids.map((id) => sec(id))}</SectionGroup>;
    }
    await show(() => <Page />);
    await act(async () => add());
    expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
  });

  it('a section drawn into another tree (a shadow root) keeps its place after its tree; the rest still follow document order', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    let flip: () => void = () => undefined;
    function Page() {
      const [order, setOrder] = useState<[string, string]>(['a', 'b']);
      flip = () => setOrder(['b', 'a']);
      // Registration order a, c, b: c sits between the two light-tree sections.
      return <SectionGroup firstUse={FIRST}>{[sec(order[0]), createPortal(sec('c'), shadow, 'c'), sec(order[1])]}</SectionGroup>;
    }
    try {
      await show(() => <Page />);
      await act(async () => flip());
      expect(cardButtons()).toEqual(['Add b', 'Add a', 'Add c']);
      expect(screen.getByRole('button', { name: 'Add b' }).className).toMatch(/\bprimary\b/);
    } finally {
      host.remove();
    }
  });

  for (const wrapped of [false, true]) {
    it(`memoised sections reordered by a component inside the group${wrapped ? ', in an element of its own' : ''} (neither re-renders): the card still follows`, async () => {
      const Memo = memo(function MemoSection({ id }: { id: string }) {
        return sec(id);
      });
      let flip: () => void = () => undefined;
      function Inner() {
        const [order, setOrder] = useState(['a', 'b', 'c']);
        flip = () => setOrder(['c', 'a', 'b']);
        const list = order.map((id) => <Memo key={id} id={id} />);
        return wrapped ? <div>{list}</div> : list;
      }
      await show(() => (
        <SectionGroup firstUse={FIRST}>
          <Inner />
        </SectionGroup>
      ));
      expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
      await act(async () => flip());
      expect(cardButtons()).toEqual(['Add c', 'Add a', 'Add b']);
      expect(screen.getByRole('button', { name: 'Add c' }).className).toMatch(/\bprimary\b/);
    });
  }

  it('memoised wrappers, each holding a section, reordered inside an element of the page (neither re-renders): the card still follows', async () => {
    const Memo = memo(function Wrapped({ id }: { id: string }) {
      return <div>{sec(id)}</div>;
    });
    let flip: () => void = () => undefined;
    function Inner() {
      const [order, setOrder] = useState(['a', 'b', 'c']);
      flip = () => setOrder(['c', 'a', 'b']);
      return <div>{order.map((id) => <Memo key={id} id={id} />)}</div>;
    }
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        <Inner />
      </SectionGroup>
    ));
    expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
    await act(async () => flip());
    expect(cardButtons()).toEqual(['Add c', 'Add a', 'Add b']);
  });

  it('memoised sections reordered inside a portal by a component of their own (neither re-renders): the card still follows', async () => {
    const outside = document.body.appendChild(document.createElement('div'));
    const Memo = memo(function MemoSection({ id }: { id: string }) {
      return sec(id);
    });
    let flip: () => void = () => undefined;
    function Inner() {
      const [order, setOrder] = useState(['a', 'b', 'c']);
      flip = () => setOrder(['c', 'a', 'b']);
      return createPortal(
        order.map((id) => <Memo key={id} id={id} />),
        outside,
      );
    }
    try {
      await show(() => (
        <SectionGroup firstUse={FIRST}>
          <Inner />
        </SectionGroup>
      ));
      expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
      await act(async () => flip());
      expect(cardButtons()).toEqual(['Add c', 'Add a', 'Add b']);
    } finally {
      outside.remove();
    }
  });

  it('memoised wrappers, each holding a section, reordered inside a portal (neither re-renders): the card still follows', async () => {
    const outside = document.body.appendChild(document.createElement('div'));
    const Memo = memo(function Wrapped({ id }: { id: string }) {
      return <div>{sec(id)}</div>;
    });
    let flip: () => void = () => undefined;
    function Inner() {
      const [order, setOrder] = useState(['a', 'b', 'c']);
      flip = () => setOrder(['c', 'a', 'b']);
      return createPortal(
        order.map((id) => <Memo key={id} id={id} />),
        outside,
      );
    }
    try {
      await show(() => (
        <SectionGroup firstUse={FIRST}>
          <Inner />
        </SectionGroup>
      ));
      expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
      await act(async () => flip());
      expect(cardButtons()).toEqual(['Add c', 'Add a', 'Add b']);
    } finally {
      outside.remove();
    }
  });

  it('a section that re-renders (its group collapsing or opening) keeps every watch: a later wrapper reorder is still seen', async () => {
    const Memo = memo(function Wrapped({ id }: { id: string }) {
      return <div>{sec(id)}</div>;
    });
    let flip: () => void = () => undefined;
    let bump: () => void = () => undefined;
    function Inner() {
      const [order, setOrder] = useState(['a', 'b', 'c']);
      flip = () => setOrder(['c', 'a', 'b']);
      return <div>{order.map((id) => <Memo key={id} id={id} />)}</div>;
    }
    function Page() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return (
        <SectionGroup firstUse={FIRST}>
          <Inner />
          {sec(`d${n}`)}
        </SectionGroup>
      );
    }
    await show(() => <Page />);
    await act(async () => bump());
    await act(async () => flip());
    // Four primaries: the card shows three and folds the last into its menu.
    expect(cardButtons().slice(0, 3)).toEqual(['Add c', 'Add a', 'Add b']);
  });

  it('sections moved by other code into a container not watched before: the card follows, and so do later moves inside it', async () => {
    let target: HTMLDivElement | null = null;
    // Memoised, so no section registers again after the first move: only the observer can see the second.
    const Wrapped = memo(function Wrapped({ id }: { id: string }) {
      return <div data-testid={`wrap-${id}`}>{sec(id)}</div>;
    });
    const Plain = memo(function Plain({ id }: { id: string }) {
      return sec(id);
    });
    const Target = memo(function Target() {
      return <div ref={(el) => void (target = el)} />;
    });
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        <Wrapped id="a" />
        <Plain id="b" />
        <Target />
        <Wrapped id="c" />
      </SectionGroup>
    ));
    expect(cardButtons()).toEqual(['Add a', 'Add b', 'Add c']);
    // Not React: DOM code moves A's wrapper into the empty container after B.
    await act(async () => void target!.appendChild(screen.getByTestId('wrap-a')));
    expect(cardButtons()).toEqual(['Add b', 'Add a', 'Add c']);
    await act(async () => void target!.appendChild(screen.getByTestId('wrap-c')));
    expect(cardButtons()).toEqual(['Add b', 'Add a', 'Add c']);
    // A move inside that container alone (no watched parent loses a node): seen because the container is watched now.
    await act(async () => void target!.appendChild(screen.getByTestId('wrap-a')));
    expect(cardButtons()).toEqual(['Add b', 'Add c', 'Add a']);
  });

  it('a section taken out by other code, then put back later where nothing was watched: the card follows (late insert)', async () => {
    let target: HTMLDivElement | null = null;
    const Wrapped = memo(function Wrapped({ id }: { id: string }) {
      return <div data-testid={`wrap-${id}`}>{sec(id)}</div>;
    });
    const Plain = memo(function Plain({ id }: { id: string }) {
      return sec(id);
    });
    const Target = memo(function Target() {
      return <div ref={(el) => void (target = el)} />;
    });
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        <Target />
        <Plain id="b" />
        <Wrapped id="a" />
      </SectionGroup>
    ));
    expect(cardButtons()).toEqual(['Add b', 'Add a']);
    const wrap = screen.getByTestId('wrap-a');
    // Not React: DOM code takes A out, the observer runs, and only later puts it into the empty container before B.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await act(async () => wrap.remove());
      await act(async () => void vi.advanceTimersByTime(40));
      await act(async () => void target!.appendChild(wrap));
      await act(async () => void vi.advanceTimersByTime(1000));
      expect(cardButtons()).toEqual(['Add a', 'Add b']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('while a section is out, the group looks again on a timer only; once it is back the timer stops', async () => {
    const Wrapped = memo(function Wrapped({ id }: { id: string }) {
      return <div data-testid={`wrap-${id}`}>{sec(id)}</div>;
    });
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        <Wrapped id="a" />
        <Wrapped id="b" />
      </SectionGroup>
    ));
    const wrap = screen.getByTestId('wrap-a');
    const host = wrap.parentElement!;
    // Fake timers from here on: the only timer is the group's own look (the observer is a microtask, not a timer).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => wrap.remove());
      expect(vi.getTimerCount()).toBe(1);
      // Still out: each look schedules the next one, slower.
      await act(async () => void vi.advanceTimersByTime(16));
      expect(vi.getTimerCount()).toBe(1);
      await act(async () => void host.appendChild(wrap));
      await act(async () => void vi.advanceTimersByTime(1000));
      expect(vi.getTimerCount()).toBe(0);
      expect(cardButtons()).toEqual(['Add b', 'Add a']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a group unmounted while a section is out leaves no look pending', async () => {
    const Wrapped = memo(function Wrapped({ id }: { id: string }) {
      return <div data-testid={`wrap-${id}`}>{sec(id)}</div>;
    });
    let hide: () => void = () => undefined;
    function Page() {
      const [shown, setShown] = useState(true);
      hide = () => setShown(false);
      return shown ? (
        <SectionGroup firstUse={FIRST}>
          <Wrapped id="a" />
          <Wrapped id="b" />
        </SectionGroup>
      ) : null;
    }
    await show(() => <Page />);
    const wrap = screen.getByTestId('wrap-a');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await act(async () => wrap.remove());
      expect(vi.getTimerCount()).toBe(1);
      await act(async () => hide());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the hidden marker draws nothing: no role, no text, hidden', async () => {
    await show(() => <SectionGroup firstUse={FIRST}>{['a', 'b'].map((id) => sec(id))}</SectionGroup>);
    const marks = [...document.querySelectorAll('[data-hub-member]')];
    expect(marks.map((m) => m.getAttribute('data-hub-member'))).toEqual(['a', 'b']);
    for (const m of marks) {
      expect(m).toHaveAttribute('hidden');
      expect(m.textContent).toBe('');
    }
  });
});
