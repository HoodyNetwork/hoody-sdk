// The strict anatomy: the section's states, the
// head's count and primary, heading levels by context, first use, the ActionBar rule, ReasonButton and ItemList.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState } from '../../states/States';
import { ActionBar, splitActions } from './ActionBar';
import { ItemList } from './ItemList';
import { isKitMarked } from './provenance';
import { REASON_HOVER_GRACE_MS, ReasonButton } from './ReasonButton';
import { AnatomySection, SubSection, focusSection } from './Section';
import { SectionGroup } from './SectionGroup';
import type { ActionSpec, EmptyProof, EmptySpec, LinkSpec, SectionState, WholeCount } from './types';

// Only core mints these; a test stands in for it.
const PROOF = {} as unknown as EmptyProof;
const whole = (n: number) => ({ total: n }) as unknown as WholeCount;
const EMPTY: EmptySpec = { title: 'No storage yet', body: 'Connect a storage to keep files off this computer.' };

async function show(ui: () => ReactElement) {
  const history = createMemoryHistory({ initialEntries: ['/'] });
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

/** A content area of `px` (the shell's #hub-main), for the fold below 600 px. */
function contentWidth(px: number) {
  const main = document.createElement('main');
  main.id = 'hub-main';
  Object.defineProperty(main, 'clientWidth', { configurable: true, value: px });
  document.body.appendChild(main);
}

afterEach(() => {
  document.getElementById('hub-main')?.remove();
});

/** Lets a hover-shown reason's grace run out. */
const graceOver = () => act(() => new Promise<void>((r) => setTimeout(r, REASON_HOVER_GRACE_MS + 50)));

const add = (onPress = vi.fn()): ActionSpec => ({ id: 'add', label: 'Add storage', onPress });

describe('AnatomySection: the head', () => {
  it('is a region named by its title, with an h2 title at the top level and a count while ready', async () => {
    await show(() => (
      <AnatomySection id="storage" title="Connected storage" count={whole(3)} state={{ kind: 'ready' }}>
        <p>rows</p>
      </AnatomySection>
    ));
    const region = screen.getByRole('region', { name: 'Connected storage' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Connected storage' })).toHaveAttribute('data-hub-h', '2');
    expect(region.querySelector('[class*="count"]')).toHaveTextContent('3');
    expect(region).toHaveAttribute('data-hub-state', 'ready');
    expect(region).toHaveAttribute('data-card-cut');
  });

  it('never shows a count at zero, nor while loading, partial, stale, unknown or failed', async () => {
    const states: SectionState[] = [
      { kind: 'loading' },
      { kind: 'partial', shown: 2, onRecheck: () => undefined },
      { kind: 'stale', shown: 2, error: new Error('x'), onRetry: () => undefined },
      { kind: 'unknown', text: 'Could not tell.', onRecheck: () => undefined },
      { kind: 'failed', error: new Error('x'), onRetry: () => undefined },
    ];
    await show(() => (
      <>
        <AnatomySection id="zero" title="Zero" count={whole(0)} state={{ kind: 'ready' }} />
        {states.map((st) => (
          <AnatomySection key={st.kind} id={st.kind} title={`T-${st.kind}`} count={whole(7)} state={st} />
        ))}
      </>
    ));
    expect(screen.getByRole('region', { name: 'Zero' }).querySelector('[class*="count"]')).toBeNull();
    for (const st of states) expect(screen.getByRole('region', { name: `T-${st.kind}` }).querySelector('[class*="count"]')).toBeNull();
    expect(screen.queryAllByText('7')).toHaveLength(0);
  });

  it('keeps the primary focusable but inert while reading, with the reason as its description', async () => {
    const onPress = vi.fn();
    await show(() => <AnatomySection id="s" title="Folders" actions={{ primary: add(onPress) }} state={{ kind: 'loading' }} />);
    const btn = screen.getByRole('button', { name: 'Add storage' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription('Still reading');
    await press(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyUp(btn, { key: 'Enter' });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a link primary cannot navigate while reading: it is a reason button, not a link', async () => {
    await show(() => <AnatomySection id="s" title="Folders" actions={{ primary: { id: 'docs', label: 'Open guide', href: '/guide' } }} state={{ kind: 'failed', error: new Error('x'), onRetry: () => undefined }} />);
    const region = screen.getByRole('region', { name: 'Folders' });
    expect(within(region).queryByRole('link', { name: 'Open guide' })).toBeNull();
    const btn = within(region).getByRole('button', { name: 'Open guide' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription('Read the list first');
  });

  it('focus follows the primary when it moves between the head and the empty state', async () => {
    let setState: (s: SectionState) => void = () => undefined;
    function Host() {
      const [st, set] = useState<SectionState>({ kind: 'ready' });
      setState = set;
      return <AnatomySection id="s" title="Connected storage" actions={{ primary: add() }} state={st} empty={EMPTY} />;
    }
    await show(() => <Host />);
    const head = screen.getByRole('button', { name: 'Add storage' });
    act(() => head.focus());
    act(() => setState({ kind: 'empty', proof: PROOF }));
    const moved = screen.getByRole('button', { name: 'Add storage' });
    expect(moved).not.toBe(head);
    expect(moved.closest('header')).toBeNull();
    expect(moved).toHaveFocus();
    act(() => setState({ kind: 'ready' }));
    expect(screen.getByRole('button', { name: 'Add storage' }).closest('header')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Add storage' })).toHaveFocus();
  });

  it('focus is left alone when the user moved elsewhere before the primary moved', async () => {
    let setState: (s: SectionState) => void = () => undefined;
    function Host() {
      const [st, set] = useState<SectionState>({ kind: 'ready' });
      setState = set;
      return (
        <>
          <AnatomySection id="s" title="Connected storage" actions={{ primary: add() }} state={st} empty={EMPTY} />
          <button type="button">elsewhere</button>
        </>
      );
    }
    await show(() => <Host />);
    act(() => screen.getByRole('button', { name: 'Add storage' }).focus());
    const other = screen.getByRole('button', { name: 'elsewhere' });
    act(() => other.focus());
    act(() => setState({ kind: 'empty', proof: PROOF }));
    expect(other).toHaveFocus();
  });

  it('moves the primary into the empty state: one Add storage, and it acts', async () => {
    const onPress = vi.fn();
    await show(() => <AnatomySection id="s" title="Connected storage" actions={{ primary: add(onPress) }} state={{ kind: 'empty', proof: PROOF }} empty={EMPTY} />);
    const region = screen.getByRole('region', { name: 'Connected storage' });
    expect(within(region).getAllByRole('button', { name: 'Add storage' })).toHaveLength(1);
    expect(region.querySelector('header')?.textContent).not.toContain('Add storage');
    expect(within(region).getByText('No storage yet').tagName).toBe('P');
    await press(within(region).getByRole('button', { name: 'Add storage' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty state without its spec', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<AnatomySection id="s" title="X" state={{ kind: 'empty', proof: PROOF }} />)).toThrow(/needs an `empty` spec/);
  });
});

describe('AnatomySection: the body each state allows', () => {
  it('unknown shows only its notice; zero-row partial and stale show their notices', async () => {
    const onRecheck = vi.fn();
    await show(() => (
      <>
        <AnatomySection id="u" title="U" state={{ kind: 'unknown', text: 'We could not tell what is mounted.', onRecheck }}>
          <p>hidden rows</p>
        </AnatomySection>
        <AnatomySection id="p" title="P" state={{ kind: 'partial', shown: 0, onRecheck: () => undefined }} />
        <AnatomySection id="st" title="St" state={{ kind: 'stale', shown: 0, error: new Error('x'), onRetry: () => undefined }}>
          <p>kept rows</p>
        </AnatomySection>
      </>
    ));
    const u = screen.getByRole('region', { name: 'U' });
    expect(u).toHaveTextContent('We could not tell what is mounted.');
    expect(u).not.toHaveTextContent('hidden rows');
    await press(within(u).getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'P' })).toHaveTextContent('Some items could not be read.');
    const st = screen.getByRole('region', { name: 'St' });
    expect(within(st).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(st).not.toHaveTextContent('kept rows');
  });

  it('partial and stale show the rows they kept only when there are some', async () => {
    await show(() => (
      <>
        <AnatomySection id="p" title="P" state={{ kind: 'partial', shown: 2, onRecheck: () => undefined }}>
          <p>two rows</p>
        </AnatomySection>
        <AnatomySection id="p0" title="P0" state={{ kind: 'partial', shown: 0, onRecheck: () => undefined }}>
          <p>no rows placeholder</p>
        </AnatomySection>
        <AnatomySection id="st" title="St" state={{ kind: 'stale', shown: 3, error: new Error('x'), onRetry: () => undefined }}>
          <p>last rows</p>
        </AnatomySection>
      </>
    ));
    expect(screen.getByRole('region', { name: 'P' })).toHaveTextContent('two rows');
    expect(screen.getByRole('region', { name: 'P0' })).not.toHaveTextContent('no rows placeholder');
    expect(screen.getByRole('region', { name: 'St' })).toHaveTextContent('last rows');
  });

  it('noMatch offers Clear; failed is the kit error with Try again and no heading', async () => {
    const onClear = vi.fn();
    const onRetry = vi.fn();
    await show(() => (
      <>
        <AnatomySection id="n" title="N" state={{ kind: 'noMatch', onClear }} />
        <AnatomySection id="f" title="F" state={{ kind: 'failed', error: new Error('boom'), onRetry }} />
      </>
    ));
    await press(within(screen.getByRole('region', { name: 'N' })).getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    const f = screen.getByRole('region', { name: 'F' });
    await press(within(f).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // The error's own title is not a heading inside a section (its details fold keeps the kit Disclosure's own).
    expect(within(f).getByText("This didn't load").tagName).toBe('P');
    expect(within(f).getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('keeps notices, the promise and the note visible in every state', async () => {
    await show(() => (
      <AnatomySection id="s" title="S" notices={<p>notice line</p>} promise="Files never leave your account." note="Older entries are kept 30 days." state={{ kind: 'loading' }} />
    ));
    const r = screen.getByRole('region', { name: 'S' });
    for (const t of ['notice line', 'Files never leave your account.', 'Older entries are kept 30 days.']) expect(r).toHaveTextContent(t);
  });

  it('in a flush body (a table edge to edge) the promise and the note keep the card inset; in a padded one they need none', async () => {
    await show(() => (
      <>
        <AnatomySection id="f" title="F" flush promise="Keys stay on the computer." note="Last checked 2 minutes ago." state={{ kind: 'ready' }}>
          <p>rows</p>
        </AnatomySection>
        <AnatomySection id="p" title="P" promise="Kept 30 days." note="Read just now." state={{ kind: 'ready' }}>
          <p>body</p>
        </AnatomySection>
      </>
    ));
    for (const t of ['Keys stay on the computer.', 'Last checked 2 minutes ago.']) expect(screen.getByText(t).className).toMatch(/inset/);
    for (const t of ['Kept 30 days.', 'Read just now.']) expect(screen.getByText(t).className).not.toMatch(/inset/);
  });
});

describe('headings by context', () => {
  it('a section in a titled group is h3, a sub-section in it h4; focusSection lands on the heading', async () => {
    await show(() => (
      <SectionGroup title="Storage on sunny-red-lemur">
        <AnatomySection id="a" title="Connected storage">
          <SubSection title="Mounted here">
            <p>x</p>
          </SubSection>
        </AnatomySection>
      </SectionGroup>
    ));
    expect(screen.getByRole('heading', { name: 'Storage on sunny-red-lemur' })).toHaveAttribute('data-hub-h', '2');
    expect(screen.getByRole('heading', { name: 'Connected storage' })).toHaveAttribute('data-hub-h', '3');
    expect(screen.getByRole('heading', { name: 'Mounted here' })).toHaveAttribute('data-hub-h', '4');
    act(() => {
      expect(focusSection('a')).toBe(true);
    });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Connected storage' }));
    expect(focusSection('nope')).toBe(false);
  });

  it('empty and error titles are headings outside a strict section only', async () => {
    await show(() => (
      <>
        <EmptyState title="Outside empty" />
        <ErrorState title="Outside error" />
      </>
    ));
    expect(screen.getByRole('heading', { name: 'Outside empty' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outside error' })).toBeInTheDocument();
  });

  it('registers every marked element (fixture and test builds)', async () => {
    await show(() => (
      <SectionGroup title="G">
        <AnatomySection id="m" title="Marked" />
      </SectionGroup>
    ));
    expect(isKitMarked(screen.getByRole('region', { name: 'Marked' }))).toBe(true);
    expect(isKitMarked(screen.getByRole('heading', { name: 'Marked' }))).toBe(true);
    expect(isKitMarked(screen.getByRole('group', { name: 'G' }))).toBe(true);
  });
});

describe('SectionGroup first use', () => {
  const FIRST: EmptySpec = { title: 'Set up storage', body: 'Connect storage, then choose folders.' };
  const sec = (id: string, empty: boolean, label: string, extra: Record<string, unknown> = {}) => (
    <AnatomySection
      id={id}
      title={`Title ${id}`}
      actions={{ primary: { id, label, onPress: () => undefined } }}
      state={empty ? { kind: 'empty', proof: PROOF } : { kind: 'ready' }}
      empty={{ title: `Empty ${id}`, body: 'Nothing here.' }}
      {...extra}
    />
  );

  it('collapses only when every section is proven empty, keeping every primary, notice and promise', async () => {
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        {sec('a', true, 'Add storage', { promise: 'Private by default.' })}
        {sec('b', true, 'Add folder', { notices: <p>b notice</p> })}
        {sec('c', true, 'Upload')}
        {sec('d', true, 'Import')}
      </SectionGroup>
    ));
    expect(screen.getByText('Set up storage')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Title a' })).toBeNull();
    for (const l of ['Add storage', 'Add folder', 'Upload']) expect(screen.getAllByRole('button', { name: l })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    await press(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByText('Private by default.')).toBeInTheDocument();
    expect(screen.getByText('b notice')).toBeInTheDocument();
  });

  it('the card always calls the section\'s current callback and shows its current label', async () => {
    const first = vi.fn();
    const second = vi.fn();
    let flip: () => void = () => undefined;
    function Host() {
      const [n, setN] = useState(0);
      flip = () => setN((v) => v + 1);
      // n=1 changes only the callback; n=2 also the label.
      const primary: ActionSpec = { id: 'a', label: n < 2 ? 'Add storage' : 'Add a storage', onPress: n === 0 ? first : second };
      return (
        <SectionGroup firstUse={FIRST}>
          <AnatomySection id="a" title="Title a" actions={{ primary }} state={{ kind: 'empty', proof: PROOF }} empty={{ title: 'Empty a', body: 'x' }} />
          {sec('b', true, 'Add folder')}
        </SectionGroup>
      );
    }
    await show(() => <Host />);
    await press(screen.getByRole('button', { name: 'Add storage' }));
    expect(first).toHaveBeenCalledTimes(1);
    act(() => flip());
    await press(screen.getByRole('button', { name: 'Add storage' }));
    expect(second).toHaveBeenCalledTimes(1);
    act(() => flip());
    await press(screen.getByRole('button', { name: 'Add a storage' }));
    expect(second).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('the card shows a primary\'s current literal: an action or a link that turns literal is redrawn as written', async () => {
    let flip: () => void = () => undefined;
    function Host() {
      // Each step turns one primary literal alone, so neither change rides on the other's redraw.
      const [step, setStep] = useState(0);
      flip = () => setStep((v) => v + 1);
      const a: ActionSpec = { id: 'a', label: 'sunny-red', literal: step >= 1, onPress: () => undefined };
      const b: LinkSpec = { id: 'b', label: 'dark-sea', literal: step >= 2, href: '/guide' };
      return (
        <SectionGroup firstUse={FIRST}>
          <AnatomySection id="a" title="Title a" actions={{ primary: a }} state={{ kind: 'empty', proof: PROOF }} empty={{ title: 'Empty a', body: 'x' }} />
          <AnatomySection id="b" title="Title b" actions={{ primary: b }} state={{ kind: 'empty', proof: PROOF }} empty={{ title: 'Empty b', body: 'x' }} />
        </SectionGroup>
      );
    }
    await show(() => <Host />);
    expect(screen.getByRole('button', { name: 'sunny-red' })).not.toHaveAttribute('data-literal');
    expect(screen.getByRole('link', { name: 'dark-sea' })).not.toHaveAttribute('data-literal');
    act(() => flip());
    expect(screen.getByRole('button', { name: 'sunny-red' })).toHaveAttribute('data-literal');
    expect(screen.getByRole('link', { name: 'dark-sea' })).not.toHaveAttribute('data-literal');
    act(() => flip());
    expect(screen.getByRole('link', { name: 'dark-sea' })).toHaveAttribute('data-literal');
  });

  it('focus follows a section primary onto the first-use card when the group collapses', async () => {
    let empty: () => void = () => undefined;
    function Host() {
      const [e, setE] = useState(false);
      empty = () => setE(true);
      return (
        <SectionGroup firstUse={FIRST}>
          {sec('a', true, 'Add storage')}
          {sec('b', e, 'Add folder')}
        </SectionGroup>
      );
    }
    await show(() => <Host />);
    act(() => screen.getByRole('button', { name: 'Add folder' }).focus());
    act(() => empty());
    expect(screen.getByText('Set up storage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add folder' })).toHaveFocus();
  });

  it('focus lands on the same section\'s action on the card when two sections share an action id', async () => {
    const onA = vi.fn();
    const onB = vi.fn();
    let empty: () => void = () => undefined;
    function Host() {
      const [e, setE] = useState(false);
      empty = () => setE(true);
      const st = (isEmpty: boolean): SectionState => (isEmpty ? { kind: 'empty', proof: PROOF } : { kind: 'ready' });
      return (
        <SectionGroup firstUse={FIRST}>
          <AnatomySection id="a" title="Title a" actions={{ primary: { id: 'add', label: 'Add storage', onPress: onA } }} state={st(true)} empty={{ title: 'Empty a', body: 'x' }} />
          <AnatomySection id="b" title="Title b" actions={{ primary: { id: 'add', label: 'Add folder', onPress: onB } }} state={st(e)} empty={{ title: 'Empty b', body: 'x' }} />
        </SectionGroup>
      );
    }
    await show(() => <Host />);
    act(() => screen.getByRole('button', { name: 'Add folder' }).focus());
    act(() => empty());
    expect(screen.getByText('Set up storage')).toBeInTheDocument();
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAccessibleName('Add folder');
    await press(focused);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  it('firstUse action none: no main action, and no section primary is dropped', async () => {
    await show(() => (
      <SectionGroup firstUse={{ ...FIRST, action: 'none' }}>
        {sec('a', true, 'Add storage')}
        {sec('b', true, 'Add folder')}
      </SectionGroup>
    ));
    expect(screen.getByText('Set up storage')).toBeInTheDocument();
    for (const l of ['Add storage', 'Add folder']) expect(screen.getAllByRole('button', { name: l })).toHaveLength(1);
  });

  it('does not collapse while one section holds something', async () => {
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        {sec('a', true, 'Add storage')}
        {sec('b', false, 'Add folder')}
      </SectionGroup>
    ));
    expect(screen.queryByText('Set up storage')).toBeNull();
    expect(screen.getByRole('region', { name: 'Title a' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Title b' })).toBeInTheDocument();
  });

  it('one section never collapses; two without a firstUse spec are refused', async () => {
    await show(() => <SectionGroup firstUse={FIRST}>{sec('a', true, 'Add storage')}</SectionGroup>);
    expect(screen.getByRole('region', { name: 'Title a' })).toBeInTheDocument();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <SectionGroup>
          {sec('x', false, 'One')}
          {sec('y', false, 'Two')}
        </SectionGroup>,
      ),
    ).toThrow(/need a `firstUse` spec/);
  });
});

describe('ActionBar: the rule', () => {
  const sec1: ActionSpec = { id: 'around', label: 'Around this moment', onPress: () => undefined };
  const sec2: ActionSpec = { id: 'here', label: 'This computer', onPress: () => undefined };

  it('wide: one primary, two secondaries, the rest in ⋯; the name says more than the label', async () => {
    contentWidth(1200);
    await show(() => (
      <ActionBar
        label="Log line"
        primary={{ id: 'explain', label: 'Explain', name: 'Explain this log line', onPress: () => undefined }}
        secondary={[sec1, sec2]}
        menu={[{ id: 'copy', label: 'Copy for support', onAction: () => undefined }]}
      />
    ));
    const bar = screen.getByRole('group', { name: 'Log line' });
    expect(within(bar).getByRole('button', { name: 'Explain this log line' })).toHaveTextContent('Explain');
    expect(within(bar).getByRole('button', { name: 'Around this moment' })).toBeInTheDocument();
    await press(within(bar).getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Copy for support']);
  });

  it('narrow: the action secondaries MOVE into ⋯ (never copied); a link stays a link', async () => {
    contentWidth(390);
    await show(() => <ActionBar label="Log line" secondary={[sec1, { id: 'docs', label: 'Read the guide', href: '/guide' }]} />);
    const bar = screen.getByRole('group', { name: 'Log line' });
    expect(within(bar).queryByRole('button', { name: 'Around this moment' })).toBeNull();
    expect(within(bar).getByRole('link', { name: 'Read the guide' })).toBeInTheDocument();
    await press(within(bar).getByRole('button', { name: 'More actions' }));
    expect(screen.getAllByText('Around this moment')).toHaveLength(1);
  });

  it('narrow: a folded action keeps its fuller name', async () => {
    contentWidth(390);
    await show(() => <ActionBar label="Log line" secondary={[{ id: 'explain', label: 'Explain', name: 'Explain this log line', onPress: () => undefined }]} />);
    await press(within(screen.getByRole('group', { name: 'Log line' })).getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Explain this log line' })).toBeInTheDocument();
  });

  it('a data label is shown as written: literal reaches the button, the reason button and the link', async () => {
    contentWidth(1200);
    await show(() => (
      <ActionBar
        label="Computer"
        primary={{ id: 'open', label: 'sunny-red', literal: true, onPress: () => undefined }}
        secondary={[
          { id: 'stop', label: 'pale-moon', literal: true, onPress: () => undefined, disabledReason: 'Already stopped' },
          { id: 'docs', label: 'dark-sea', literal: true, href: '/guide' },
        ]}
        menu={[{ id: 'm', label: 'Rename', onAction: () => undefined }]}
      />
    ));
    for (const name of ['sunny-red', 'pale-moon']) expect(screen.getByRole('button', { name })).toHaveAttribute('data-literal');
    expect(screen.getByRole('link', { name: 'dark-sea' })).toHaveAttribute('data-literal');
    expect(screen.getByRole('button', { name: 'More actions' })).not.toHaveAttribute('data-literal');
  });

  it('splitActions: one decision for the bar and its menu', () => {
    expect(splitActions({ secondary: [sec1, sec2] }, false)).toMatchObject({ shown: [sec1, sec2], menu: [] });
    const narrow = splitActions({ secondary: [sec1], menu: [{ id: 'm', label: 'M', onAction: () => undefined }] }, true);
    expect(narrow.shown).toEqual([]);
    expect(narrow.menu.map((e) => (e === '-' ? '-' : 'label' in e ? e.label : ''))).toEqual(['Around this moment', '-', 'M']);
  });

  it('refuses the same id or label twice in one group', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ActionBar label="L" primary={sec1} menu={[{ id: 'around', label: 'Other', onAction: () => undefined }]} />)).toThrow(/id "around" appears twice/);
    expect(() => render(<ActionBar label="L" primary={sec1} secondary={[{ ...sec2, label: 'Around this moment' }]} />)).toThrow(/label "Around this moment" appears twice/);
  });
});

describe('ReasonButton', () => {
  it('stays focusable, never acts, and shows its reason on focus, hover and tap; Escape hides it', async () => {
    await show(() => <ReasonButton reason="Stop the computer first">Run</ReasonButton>);
    const btn = screen.getByRole('button', { name: 'Run' });
    const shownTip = () => document.querySelector('[data-hub-reason]');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription('Stop the computer first');
    expect(shownTip()).toBeNull();
    act(() => btn.focus());
    expect(shownTip()).toHaveTextContent('Stop the computer first');
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(shownTip()).toBeNull();
    act(() => btn.blur());
    fireEvent.pointerEnter(btn.parentElement!);
    expect(shownTip()).toHaveTextContent('Stop the computer first');
    fireEvent.pointerLeave(btn.parentElement!);
    await graceOver();
    expect(shownTip()).toBeNull();
    await press(btn);
    expect(shownTip()).toHaveTextContent('Stop the computer first');
  });

  it('the shown reason sits in a layer on <body>, outside any card that clips, and is not read twice', async () => {
    await show(() => (
      <AnatomySection id="s" title="Folders" actions={{ primary: { id: 'run', label: 'Run', onPress: () => undefined, disabledReason: 'Stop the computer first' } }}>
        <p>rows</p>
      </AnatomySection>
    ));
    const btn = screen.getByRole('button', { name: 'Run' });
    act(() => btn.focus());
    const tip = document.querySelector('[data-hub-reason]');
    expect(tip?.parentElement).toBe(document.body);
    expect(screen.getByRole('region', { name: 'Folders' }).contains(tip)).toBe(false);
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    expect(btn).toHaveAccessibleDescription('Stop the computer first');
  });

  it('the shown reason stays inside the viewport at the right and bottom edges, and at the left edge', async () => {
    const view = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    const w = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(200);
    const h = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
    try {
      await show(() => <ReasonButton reason="Stop the computer first">Run</ReasonButton>);
      const btn = screen.getByRole('button', { name: 'Run' });
      const at = (r: { left: number; top: number; right: number; bottom: number }) =>
        vi.spyOn(btn.parentElement!, 'getBoundingClientRect').mockReturnValue({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r } as DOMRect);
      // bottom-right corner: shifted left and flipped above
      at({ left: 350, top: 260, right: 390, bottom: 290 });
      act(() => btn.focus());
      const tip = document.querySelector<HTMLElement>('[data-hub-reason]')!;
      expect(parseFloat(tip.style.left) + 200).toBeLessThanOrEqual(400 - 8);
      expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(8);
      expect(parseFloat(tip.style.top) + 40).toBeLessThanOrEqual(300 - 8);
      expect(parseFloat(tip.style.top)).toBeLessThan(260);
      // left edge, room below (re-placed on scroll): kept off the edge, under the button
      at({ left: 0, top: 20, right: 40, bottom: 50 });
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expect(tip.style.left).toBe('8px');
      expect(tip.style.top).toBe('54px');
    } finally {
      w.mockRestore();
      h.mockRestore();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: view.w });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: view.h });
    }
  });

  it('focus and hover each keep the reason up on their own', async () => {
    await show(() => <ReasonButton reason="Stop the computer first">Run</ReasonButton>);
    const btn = screen.getByRole('button', { name: 'Run' });
    const shownTip = () => document.querySelector('[data-hub-reason]');
    act(() => btn.focus());
    fireEvent.pointerEnter(btn.parentElement!);
    fireEvent.pointerLeave(btn.parentElement!);
    await graceOver();
    expect(shownTip()).toHaveTextContent('Stop the computer first');
    fireEvent.pointerEnter(btn.parentElement!);
    act(() => btn.blur());
    expect(shownTip()).toHaveTextContent('Stop the computer first');
    fireEvent.pointerLeave(btn.parentElement!);
    await graceOver();
    expect(shownTip()).toBeNull();
  });

  it('a hover-shown reason can be reached: the pointer crosses onto it and it stays, then leaves and it goes', async () => {
    await show(() => <ReasonButton reason="Stop the computer first">Run</ReasonButton>);
    const btn = screen.getByRole('button', { name: 'Run' });
    const shownTip = () => document.querySelector<HTMLElement>('[data-hub-reason]');
    fireEvent.pointerEnter(btn.parentElement!);
    fireEvent.pointerLeave(btn.parentElement!);
    // crossing the gap takes a moment, well inside the grace
    await act(() => new Promise<void>((r) => setTimeout(r, REASON_HOVER_GRACE_MS / 3)));
    expect(shownTip()).not.toBeNull();
    fireEvent.pointerEnter(shownTip()!);
    await graceOver();
    expect(shownTip()).toHaveTextContent('Stop the computer first');
    fireEvent.pointerLeave(shownTip()!);
    await graceOver();
    expect(shownTip()).toBeNull();
  });
});

describe('ItemList', () => {
  it('rows open on click and Enter through their title; meta, status and at most two inline actions', async () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    await show(() => (
      <ItemList
        label="Storage"
        items={[
          { id: 's3', title: 'Backups (S3)', onOpen, meta: ['s3://backups', '2 folders'], status: { tone: 'ok', label: 'Connected' }, actions: { inline: [{ id: 'rm', label: 'Remove', onPress: onRemove }] } },
          { id: 'plain', title: 'Local disk' },
        ]}
      />
    ));
    const list = screen.getByRole('list', { name: 'Storage' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    await press(within(rows[0]!).getByRole('button', { name: 'Backups (S3)' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(rows[0]).toHaveTextContent('s3://backups');
    expect(rows[0]).toHaveTextContent('Connected');
    await press(within(rows[0]!).getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
  });

  it('a row can lead with an order mark, show its title as written in mono, and explain its status in an InfoTip', async () => {
    await show(() => (
      <ItemList
        label="Steps"
        items={[
          { id: 'one', title: 'build_image', mark: '1', mono: true, status: { tone: 'neutral', label: 'Agent', tip: 'An agent step asks the model and may call tools.' } },
          { id: 'two', title: 'Plain step', status: { tone: 'ok', label: 'Done' } },
        ]}
      />
    ));
    const rows = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    const mark = rows[0]!.querySelector('[data-hub-item-mark]');
    expect(mark).toHaveTextContent('1');
    expect(rows[0]!.textContent!.indexOf('1')).toBeLessThan(rows[0]!.textContent!.indexOf('build_image'));
    expect(within(rows[0]!).getByText('build_image')).toHaveAttribute('data-mono');
    expect(within(rows[1]!).getByText('Plain step')).not.toHaveAttribute('data-mono');
    expect(rows[1]!.querySelector('[data-hub-item-mark]')).toBeNull();
    // The status words are the InfoTip's trigger; a status without a tip stays a plain pill.
    const tip = within(rows[0]!).getByRole('button', { name: /Agent/ });
    await press(tip);
    expect(await screen.findByText('An agent step asks the model and may call tools.')).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
  });

  it('refuses a mark beside a leading icon, or a mark longer than 4 characters', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ItemList label="L" items={[{ id: 'a', title: 'A', mark: '1', leading: 'file' }]} />)).toThrow(/mark or a leading icon/);
    expect(() => render(<ItemList label="L" items={[{ id: 'a', title: 'A', mark: '12345' }]} />)).toThrow(/at most 4/);
  });

  it('a nested row (a branch step) is a list nested in the row above it one level up, one or two levels in', async () => {
    await show(() => (
      <>
        <ItemList
          label="Steps"
          items={[
            { id: 'check', title: 'check', mark: '1' },
            { id: 'ok', title: 'deploy', mark: '1a', indent: 1 },
            { id: 'notify', title: 'notify', mark: '1a1', indent: 2 },
            { id: 'fail', title: 'rollback', mark: '1b', indent: 1 },
            { id: 'done', title: 'report', mark: '2' },
          ]}
        />
        <ItemList
          label="Flat"
          items={[
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ]}
        />
      </>
    ));
    const steps = screen.getByRole('list', { name: 'Steps' });
    const row = (id: string) => steps.querySelector<HTMLElement>(`[data-hub-item="${id}"]`)!;
    // The parent of a row: the <li> that holds the list the row is in (null at the top).
    const parentOf = (id: string) => row(id).parentElement!.closest('li')?.getAttribute('data-hub-item') ?? null;
    expect(['check', 'ok', 'notify', 'fail', 'done'].map(parentOf)).toEqual([null, 'check', 'ok', 'check', null]);
    // The list's own rows are the top level; the nested ones are inside unnamed lists, in order.
    expect(Array.from(steps.children).map((li) => li.getAttribute('data-hub-item'))).toEqual(['check', 'done']);
    const branch = within(row('check')).getAllByRole('list')[0]!;
    expect(Array.from(branch.children).map((li) => li.getAttribute('data-hub-item'))).toEqual(['ok', 'fail']);
    expect(branch).not.toHaveAttribute('aria-label');
    // A row's own title stays its own: the nested rows are not part of its title line.
    expect(within(row('check')).getByText('check').closest('li')).toBe(row('check'));
    // A flat list nests nothing.
    expect(within(screen.getByRole('list', { name: 'Flat' })).queryAllByRole('list')).toHaveLength(0);
  });

  it('a row may come back up any number of levels', async () => {
    await show(() => (
      <ItemList
        label="Up"
        items={[
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B', indent: 1 },
          { id: 'c', title: 'C', indent: 2 },
          { id: 'd', title: 'D' },
        ]}
      />
    ));
    expect(Array.from(screen.getByRole('list', { name: 'Up' }).children).map((li) => li.getAttribute('data-hub-item'))).toEqual(['a', 'd']);
  });

  it('refuses an indented first row', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ItemList label="L" items={[{ id: 'a', title: 'A', indent: 1 }]} />)).toThrow(/first row/);
  });

  it('refuses a row more than one level deeper than the row above it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <ItemList
          label="L"
          items={[
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B', indent: 2 },
          ]}
        />,
      ),
    ).toThrow(/one level deeper/);
  });
});

describe('types: only core proves empty or counts a whole', () => {
  it('a hand-written empty state or count does not type-check', () => {
    // @ts-expect-error an empty state needs core's proof
    const bad: SectionState = { kind: 'empty' };
    // @ts-expect-error a forged proof is not one
    const forged: SectionState = { kind: 'empty', proof: {} };
    // @ts-expect-error a count is only core's WholeCount
    const count: WholeCount = { total: 3 };
    expect([bad, forged, count]).toHaveLength(3);
  });
});
