// Vitest: focus follows an action by its
// key, the pair (section id, action id). The key was the two joined with '::', so ('a::b', 'c') and ('a', 'b::c') were
// one key and focus could land on the other section's action. The key now encodes the pair so no two pairs share one.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { cardActionId, cardOwnId } from './focusFollow';
import { AnatomySection } from './Section';
import { SectionGroup } from './SectionGroup';
import type { EmptyProof, EmptySpec, SectionState } from './types';

const PROOF = {} as unknown as EmptyProof;
const FIRST: EmptySpec = { title: 'Set up storage', body: 'Connect storage, then choose folders.' };

async function show(ui: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: ui }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

let empty: () => void = () => undefined;
let ownId: string | undefined;
function Page() {
  const [st, set] = useState<SectionState>({ kind: 'ready' });
  empty = () => set({ kind: 'empty', proof: PROOF });
  const one = (id: string, action: string, label: string) => (
    <AnatomySection id={id} title={`Title ${label}`} actions={{ primary: { id: action, label, onPress: () => undefined } }} state={st} empty={{ title: `No ${label}`, body: 'Nothing here.' }} />
  );
  return (
    <SectionGroup firstUse={ownId === undefined ? FIRST : { ...FIRST, action: { id: ownId, label: 'Card own', onPress: () => undefined } }}>
      {one('a::b', 'c', 'Add first')}
      {one('a', 'b::c', 'Add second')}
    </SectionGroup>
  );
}

describe('focus follow: the action key names its pair exactly', () => {
  it('two pairs that join to the same text are different keys', () => {
    expect(cardActionId('a::b', 'c')).not.toBe(cardActionId('a', 'b::c'));
    expect(cardActionId('a', 'b')).toBe(cardActionId('a', 'b'));
  });

  it('every pair of awkward ids has a key of its own', () => {
    const ids = ['', 'a', 'b', ':', '::', 'a:', ':a', '1', '1:', '1:a', '2:a:', 'a::b', 'b::c', 'c'];
    const pairs = ids.flatMap((s) => ids.map((a) => [s, a] as const));
    const keys = new Map<string, string>();
    for (const [s, a] of pairs) {
      const k = cardActionId(s, a);
      expect(keys.get(k), `(${JSON.stringify(s)}, ${JSON.stringify(a)}) shares ${JSON.stringify(k)}`).toBeUndefined();
      keys.set(k, `${s}|${a}`);
    }
    expect(keys.size).toBe(pairs.length);
    // The card's own actions sit outside the pair keys.
    for (const id of ids) expect(keys.has(cardOwnId(id)), cardOwnId(id)).toBe(false);
  });

  it("the second section's primary, focused as the group collapses, keeps focus on the card: not the first section's", async () => {
    await show(() => <Page />);
    act(() => screen.getByRole('button', { name: 'Add second' }).focus());
    act(() => empty());
    expect(document.querySelector('[data-hub-state="firstUse"]')).not.toBeNull();
    const second = screen.getByRole('button', { name: 'Add second' });
    expect(second.closest('[data-hub-state="firstUse"]')).not.toBeNull();
    expect(second).toHaveFocus();
  });

  it("a card action of its own named like a pair key does not take the section primary's focus", async () => {
    ownId = cardActionId('a', 'b::c');
    try {
      await show(() => <Page />);
      act(() => screen.getByRole('button', { name: 'Add second' }).focus());
      act(() => empty());
      expect(screen.getByRole('button', { name: 'Card own' })).not.toHaveFocus();
      expect(screen.getByRole('button', { name: 'Add second' })).toHaveFocus();
    } finally {
      ownId = undefined;
    }
  });
});
