// Vitest: focus follows an action the anatomy
// re-draws elsewhere, unless the user moved on. A blur with no new target kept the remembered action even when the user
// had sent focus to the document (a click on empty space), so a later head/empty move took focus back. Now such a blur
// forgets it; a blur from the control's own removal, or from the window losing focus, still keeps it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnatomySection } from './Section';
import type { EmptyProof, EmptySpec, SectionActions, SectionState } from './types';

const PROOF = {} as unknown as EmptyProof;
const EMPTY: EmptySpec = { title: 'No storage yet', body: 'Connect a storage to keep files off this computer.' };

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

let setState: (s: SectionState) => void = () => undefined;
let withRefresh = false;
function Host() {
  const [st, set] = useState<SectionState>({ kind: 'ready' });
  setState = set;
  const primary = { id: 'add', label: 'Add storage', onPress: () => undefined };
  const actions: SectionActions = withRefresh ? { primary, secondary: [{ id: 'refresh', label: 'Refresh', onPress: () => undefined }] } : { primary };
  return <AnatomySection id="s" title="Connected storage" actions={actions} state={st} empty={EMPTY} />;
}

const add = () => screen.getByRole('button', { name: 'Add storage' });

describe('focus follow: a blur with no new target', () => {
  it('focus sent to the document (empty space): a later move does not take focus back', async () => {
    await show(() => <Host />);
    act(() => add().focus());
    // The control blurs to the document: no related target, still in the page, no longer active.
    await act(async () => add().blur());
    expect(document.activeElement).toBe(document.body);
    act(() => setState({ kind: 'empty', proof: PROOF }));
    expect(add().closest('header')).toBeNull();
    expect(add()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('the window losing focus (the control stays active) keeps the place: the move still takes focus along', async () => {
    await show(() => <Host />);
    act(() => add().focus());
    const head = add();
    await act(async () => {
      fireEvent.blur(head, { relatedTarget: null });
    });
    expect(head).toHaveFocus();
    act(() => setState({ kind: 'empty', proof: PROOF }));
    expect(add()).not.toBe(head);
    expect(add()).toHaveFocus();
  });

  it('the control removed while focused (blur on its way out) keeps the place: focus follows this move and the next', async () => {
    await show(() => <Host />);
    act(() => add().focus());
    const head = add();
    // A browser blurs the focused control as it leaves the DOM: focus goes to the document first (no related target,
    // the control still connected), then the removal completes. jsdom does not, so the removal does it here.
    const remove = Node.prototype.removeChild;
    const spy = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function (this: Node, child) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && child.contains(active)) active.blur();
      return remove.call(this, child) as never;
    });
    try {
      act(() => setState({ kind: 'empty', proof: PROOF }));
      expect(head.isConnected).toBe(false);
      expect(add().closest('header')).toBeNull();
      expect(add()).toHaveFocus();
      await act(async () => {
        await Promise.resolve();
      });
      act(() => setState({ kind: 'ready' }));
      expect(add().closest('header')).not.toBeNull();
      expect(add()).toHaveFocus();
    } finally {
      spy.mockRestore();
    }
  });

  it('a blur to the document and a re-draw in the same task: focus stays on the document', async () => {
    await show(() => <Host />);
    act(() => add().focus());
    act(() => {
      add().blur();
      setState({ kind: 'empty', proof: PROOF });
    });
    expect(add().closest('header')).toBeNull();
    expect(add()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('moving from one action to another here keeps the newer place: focus still follows', async () => {
    withRefresh = true;
    try {
      await show(() => <Host />);
      act(() => screen.getByRole('button', { name: 'Refresh' }).focus());
      // Refresh blurs to Add storage, which records itself.
      await act(async () => add().focus());
      act(() => setState({ kind: 'empty', proof: PROOF }));
      expect(add().closest('header')).toBeNull();
      expect(add()).toHaveFocus();
    } finally {
      withRefresh = false;
    }
  });
});
