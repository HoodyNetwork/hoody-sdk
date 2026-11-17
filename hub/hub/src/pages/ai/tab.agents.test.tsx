// Vitest: the Agents mount hands AgentsView the route's choice and moves the route itself; a delete
// leaves the gone agent's route for the index, replacing it so Back skips it. AgentsView is a stub that keeps its
// props (its own behaviour is AgentsView.test.tsx's).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import type { AgentsViewProps } from './agents/AgentsView';
import { links } from './links';
import page from './page';

const seen = vi.hoisted(() => ({ props: [] as AgentsViewProps[] }));
vi.mock('./agents/AgentsView', () => ({
  AgentsView: (p: AgentsViewProps) => {
    seen.props.push(p);
    return <p>agents stub {p.selected ?? 'none'}</p>;
  },
}));

const SLOW = { timeout: 5000 };
const last = () => seen.props[seen.props.length - 1]!;

// The page's own chunk (its load(), import('./tab')) loads once per file before the first visit: renderPage does not
// wait for it, and its cold transform on a busy machine outlives SLOW, which is about the page, not the import.
beforeAll(async () => {
  await import('./tab');
}, 120_000);

describe('the Agents mount', () => {
  it('gives AgentsView the route choice; a pick pushes /ai/agents/<name>', async () => {
    const r = await renderPage(page, { path: links.agents });
    await screen.findByText('agents stub none', undefined, SLOW);
    act(() => last().onSelect!('a b/c'));
    // One segment under /ai/agents (the '/' in the name stays escaped), and the stub gets the name back whole.
    await waitFor(() => expect(r.router.state.location.pathname.split('/')).toHaveLength(4), SLOW);
    expect(decodeURIComponent(r.router.state.location.pathname.split('/')[3]!)).toBe('a b/c');
    await screen.findByText('agents stub a b/c', undefined, SLOW);
  });

  it('a delete goes to the index and replaces the gone entry (Back skips it)', async () => {
    const r = await renderPage(page, { path: links.agents });
    await screen.findByText('agents stub none', undefined, SLOW);
    act(() => last().onSelect!('reviewer'));
    await screen.findByText('agents stub reviewer', undefined, SLOW);
    const depth = r.router.history.length;
    act(() => last().onDeleted!());
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/agents'), SLOW);
    expect(r.router.history.length).toBe(depth);
    act(() => r.router.history.back());
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/agents'), SLOW);
    expect(screen.getByText('agents stub none')).toBeInTheDocument();
  });
});
