// Vitest: a SectionGroup's first-use card
// is drawn by EmptyState, whose title was always an h2. Under a group title that put the card's title at the same level
// as the group's own (or above it, in a nested region). The card is the titled body's empty state, so, as a strict
// section's empty title, its title is a p there; an untitled group keeps the card's heading.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { HeadingLevel } from './Heading';
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

const sec = (id: string) => (
  <AnatomySection id={id} title={`Title ${id}`} actions={{ primary: { id, label: `Add ${id}`, onPress: () => undefined } }} state={{ kind: 'empty', proof: PROOF }} empty={{ title: `Empty ${id}`, body: 'Nothing here.' }} />
);

const headings = () => screen.queryAllByRole('heading').map((h) => `${h.tagName.toLowerCase()} ${h.textContent}`);

describe('SectionGroup first-use card: its title under a group title', () => {
  it('a titled group: the group title is the one heading, the card title is a p under it', async () => {
    await show(() => (
      <SectionGroup title="Storage" firstUse={FIRST}>
        {sec('a')}
        {sec('b')}
      </SectionGroup>
    ));
    expect(headings()).toEqual(['h2 Storage']);
    const card = screen.getByText('Set up storage');
    expect(card.tagName).toBe('P');
    expect(card.closest('[data-hub-state="firstUse"]')).not.toBeNull();
    expect(screen.getByText('Connect storage, then choose folders.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a' })).toBeInTheDocument();
  });

  it('a titled group in a nested region: no heading of the card sits at or above the group title', async () => {
    await show(() => (
      <HeadingLevel>
        <SectionGroup title="Storage" firstUse={FIRST}>
          {sec('a')}
          {sec('b')}
        </SectionGroup>
      </HeadingLevel>
    ));
    expect(headings()).toEqual(['h3 Storage']);
    expect(screen.getByText('Set up storage').tagName).toBe('P');
  });

  it('an untitled group: the card keeps its heading (there is no group title to sit under)', async () => {
    await show(() => (
      <SectionGroup firstUse={FIRST}>
        {sec('a')}
        {sec('b')}
      </SectionGroup>
    ));
    expect(screen.getByRole('heading', { name: 'Set up storage' }).tagName).toBe('H2');
  });

  it('once the group opens (a section has content), the sections draw their own headings under the group title', async () => {
    await show(() => (
      <SectionGroup title="Storage" firstUse={FIRST}>
        <AnatomySection id="a" title="Title a" state={{ kind: 'ready' }}>
          <p>rows</p>
        </AnatomySection>
        {sec('b')}
      </SectionGroup>
    ));
    expect(screen.queryByText('Set up storage')).toBeNull();
    expect(headings()).toEqual(expect.arrayContaining(['h2 Storage', 'h3 Title a']));
  });
});
