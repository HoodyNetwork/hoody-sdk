// Vitest: the Overview tab mounted without the page's public-link answer (no router above it, as in a part test): it mounts, draws no
// question link, and still offers the link-making button. The page always gives the answer (faq.page.test.tsx opens it).
import { render, screen } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { OverviewTab } from './parts/OverviewTab';
import strings from './strings.en.json';

const idle = () => ({ mutateAsync: async () => ({ data: null }), isPending: false, pending: false, held: () => [], readBack: async () => false, dismissHeld: () => undefined, holdOf: async () => undefined });
vi.mock('./data', () => ({
  useUsage: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useFailures: () => ({ data: undefined, isPending: true, isError: false, refetch: async () => undefined }),
  useAliasState: () => idle(),
  useAliasCreate: () => idle(),
  useAliasRemove: () => idle(),
  useAliasHeldElsewhere: () => null,
  useScriptsTarget: () => null,
  useSettle: () => ({ mutateAsync: async () => ({ data: null }), readBack: async () => false, holdOf: async () => undefined, isPending: false }),
}));

const base = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] } as never;

describe('the Overview tab without the page answers', () => {
  it('mounts, shows the link-making button and no public-link question link', async () => {
    render(<OverviewTab item={base as never} comp={comp as never} onChanged={() => undefined} />);
    expect(await screen.findByRole('button', { name: strings['share.make'] })).toBeTruthy();
    expect(screen.queryByRole('link', { name: strings['share.more'] })).toBeNull();
  });
});
