// ListDetailPage's list pane and DetailPage's body take the strict Section's
// `state` (SectionState, drawn by the one StateBody), so "Pick a realm" or an empty list is a kit state, never an
// EmptyState a page writes into a slot. Section's new `notHere` kind is the All realms / no computer case.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnatomySection } from './anatomy/Section';
import type { EmptyProof, EmptySpec, SectionState } from './anatomy/types';
import { DetailPage } from './Layouts';
import { ListDetailPage } from './ListDetailPage';

const PROOF = {} as unknown as EmptyProof;
const EMPTY: EmptySpec = { title: 'No skills yet', body: 'Skills you add show here.' };
const PICK = { kind: 'notHere', icon: 'realm', title: 'Pick a realm', body: 'Skills belong to one realm. Choose one in the realm menu.' } as const satisfies SectionState;
const FAQ = { items: [{ id: 'skill', q: 'What is a skill?', a: 'A saved way of working.' }] };

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const listPane = () => screen.getByRole('region', { name: 'Skills' });

describe('ListDetailPage: the list pane state', () => {
  it('notHere draws its words in the list pane in place of the list; the questions stay', async () => {
    await show(() => <ListDetailPage header={{ title: 'Skills' }} state={PICK} faq={FAQ} list={<p>the rows</p>} detail={null} />);
    const pane = listPane();
    expect(within(pane).getByText('Pick a realm')).toBeInTheDocument();
    expect(pane).toHaveTextContent('Skills belong to one realm. Choose one in the realm menu.');
    expect(pane).not.toHaveTextContent('the rows');
    expect(pane).toHaveTextContent('What is a skill?');
  });

  it('notHere shows its own action and no other', async () => {
    const onPress = vi.fn();
    await show(() => (
      <ListDetailPage header={{ title: 'Skills' }} state={{ ...PICK, action: { id: 'pick', label: 'Choose realm', onPress } }} list={<p>the rows</p>} detail={null} />
    ));
    const btn = within(listPane()).getByRole('button', { name: 'Choose realm' });
    await act(async () => fireEvent.click(btn));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('empty draws the spec in place of the list', async () => {
    await show(() => <ListDetailPage header={{ title: 'Skills' }} state={{ kind: 'empty', proof: PROOF }} empty={EMPTY} list={<p>the rows</p>} detail={null} />);
    expect(listPane()).toHaveTextContent('No skills yet');
    expect(listPane()).not.toHaveTextContent('the rows');
  });

  it('ready shows the list', async () => {
    await show(() => <ListDetailPage header={{ title: 'Skills' }} state={{ kind: 'ready' }} list={<p>the rows</p>} detail={null} />);
    expect(listPane()).toHaveTextContent('the rows');
  });

  it('partial keeps the rows it read under its notice, as a Section does', async () => {
    await show(() => <ListDetailPage header={{ title: 'Skills' }} state={{ kind: 'partial', shown: 2, onRecheck: () => undefined }} list={<p>the rows</p>} detail={null} />);
    expect(listPane()).toHaveTextContent('Some items could not be read.');
    expect(listPane()).toHaveTextContent('the rows');
  });

  it('failed is the kit error with Try again', async () => {
    const onRetry = vi.fn();
    await show(() => <ListDetailPage header={{ title: 'Skills' }} state={{ kind: 'failed', error: new Error('boom'), onRetry }} list={<p>the rows</p>} detail={null} />);
    await act(async () => fireEvent.click(within(listPane()).getByRole('button', { name: 'Try again' })));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(listPane()).not.toHaveTextContent('the rows');
  });
});

describe('DetailPage: the body state', () => {
  it('notHere replaces the body; the header stays', async () => {
    await show(() => (
      <DetailPage header={{ title: 'Instructions' }} state={{ ...PICK, body: 'Instructions belong to one realm.' }}>
        <p>the editor</p>
      </DetailPage>
    ));
    expect(screen.getByRole('heading', { name: 'Instructions' })).toBeInTheDocument();
    expect(screen.getByText('Pick a realm')).toBeInTheDocument();
    expect(screen.getByText('Instructions belong to one realm.')).toBeInTheDocument();
    expect(screen.queryByText('the editor')).toBeNull();
  });

  it('a tabbed page keeps its tabs and draws the state in the open tab', async () => {
    await show(() => (
      <DetailPage header={{ title: 'Instructions' }} state={{ kind: 'loading' }} tabs={[{ id: 'a', label: 'Text', content: <p>the editor</p> }, { id: 'b', label: 'History', content: <p>the log</p> }]} />
    ));
    expect(screen.getByRole('tab', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByText('the editor')).toBeNull();
  });

  it('no state shows the body', async () => {
    await show(() => (
      <DetailPage header={{ title: 'Instructions' }}>
        <p>the editor</p>
      </DetailPage>
    ));
    expect(screen.getByText('the editor')).toBeInTheDocument();
  });
});

describe('Section: notHere', () => {
  it('draws its words, shows no count, and keeps the primary off with the state title as its reason', async () => {
    const onPress = vi.fn();
    await show(() => (
      <AnatomySection id="s" title="Skills" actions={{ primary: { id: 'add', label: 'Add skill', onPress } }} state={PICK}>
        <p>the rows</p>
      </AnatomySection>
    ));
    const r = screen.getByRole('region', { name: 'Skills' });
    expect(r).toHaveTextContent('Skills belong to one realm. Choose one in the realm menu.');
    expect(r).not.toHaveTextContent('the rows');
    const btn = within(r).getByRole('button', { name: 'Add skill' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription('Pick a realm');
    await act(async () => fireEvent.click(btn));
    expect(onPress).not.toHaveBeenCalled();
  });
});
