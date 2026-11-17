// Rules & safety → Where agents may work on real core (fixture transport). Read only: one read of the folder's settings in
// the realm shown, both lists and the hidden count; no folder or All realms reads nothing (without a folder the agent would answer
// for the folder it was started in); a failed or malformed read shows neither list; nothing is ever written.
import { answers, bootFixtureCore, fixtureWorld, queryClient, reply, useCurrentComputer, useRealms, type FixtureAnswer, type FixtureRequest, type Target } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { featuresTable } from './features.data';
import { featureRoutes } from './features.routes';
import strings from './strings.en.json';
import WhereAgentsWork from './Where';

let sent: FixtureRequest[] = [];
const body = { allowed_directories: ['/srv/shared', '/home/me/notes'], deny_paths: ['/home/me/.ssh'], deny_paths_hidden: 2 };

async function show(folder: string | null, o: { realm?: string; answer?: (r: FixtureRequest) => FixtureAnswer } = {}) {
  sent = [];
  bootFixtureCore({ rules: [reply(featureRoutes.where, (r) => (sent.push(r), (o.answer ?? (() => answers.ok(body)))(r)))], ...(o.realm !== undefined ? { realm: o.realm } : {}) });
  function Harness() {
    const target = useCurrentComputer();
    const realm = useRealms().selected;
    return target ? <WhereAgentsWork target={target} realm={realm} folder={folder} /> : null;
  }
  const router = createRouter({ routeTree: createRootRoute({ component: Harness }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}
const noControls = () => {
  for (const role of ['switch', 'textbox', 'checkbox', 'combobox'] as const) expect(screen.queryAllByRole(role)).toHaveLength(0);
};

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('where agents may work, read only', () => {
  it('reads the folder in the realm shown once, and lists both kinds of places and the hidden count', async () => {
    const work = fixtureWorld.realms[0]!;
    await show('/home/me/shop', { realm: work.id });
    expect(await screen.findByText('/srv/shared')).toBeInTheDocument();
    expect(screen.getByText('/home/me/notes')).toBeInTheDocument();
    expect(screen.getByText('/home/me/.ssh')).toBeInTheDocument();
    expect(screen.getByText(/2 more inside the agent's own folder are not listed/)).toBeInTheDocument();
    expect(screen.getByText(strings['where.readOnly'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('GET');
    // The fixture records the route's own query; the realm (query or header) is core's agentRealm of the route's realm 'realm'.
    const realm = sent[0]!.query.realm;
    if (realm !== undefined) expect(realm).toBe(work.id);
    noControls();
  });

  it('empty lists say None, and no hidden count is mentioned when there is none', async () => {
    await show('/home/me/shop', { realm: 'global', answer: () => answers.ok({ allowed_directories: [], deny_paths: [], deny_paths_hidden: 0 }) });
    expect(await screen.findAllByText(strings['where.none'])).toHaveLength(2);
    expect(screen.queryByText(/not listed/)).toBeNull();
  });

  it('no folder (the Realm scope) reads nothing and asks for a folder, with no read-only note (nothing is shown to be read only)', async () => {
    await show(null, { realm: 'global' });
    expect(await screen.findByText(strings['where.noFolder.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['where.noFolder.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['where.readOnly'])).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('All realms reads nothing and asks for one realm', async () => {
    await show('/home/me/shop', { realm: 'all' });
    expect(await screen.findByText(strings['where.allRealms.title'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['500 store_failed', () => answers.refused(500, 'store_failed')],
    ['503 restriction_unknown', () => answers.refused(503, 'restriction_unknown')],
    ['an answer of the wrong shape', () => answers.ok({ allowed_directories: ['/srv'], deny_paths: [3], deny_paths_hidden: 0 })],
    ['an answer missing the hidden count', () => answers.ok({ allowed_directories: ['/srv'], deny_paths: [] })],
  ])('%s shows the error and neither list', async (_n, answer) => {
    await show('/home/me/shop', { realm: 'global', answer });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('/srv')).toBeNull();
    expect(screen.queryByText(strings['where.none'])).toBeNull();
  });
  it('a read that fails after a good one hides the lists it showed (they are unknown now)', async () => {
    let n = 0;
    await show('/home/me/shop', { realm: 'global', answer: () => (++n === 1 ? answers.ok(body) : answers.refused(500, 'store_failed')) });
    expect(await screen.findByText('/srv/shared')).toBeInTheDocument();
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('/srv/shared')).toBeNull();
    expect(screen.queryByText('/home/me/.ssh')).toBeNull();
  });
});

describe('where agents may work: the declared routes and inputs', () => {
  const target: Target = { project: { id: 'p1' }, container: { id: 'c1' } };
  it('where sends the folder as X-Hoody-Cwd in the realm named; features send no realm and no folder', () => {
    expect(featureRoutes.where.cwd).toBe(true);
    expect(featureRoutes.where.realm).toBe('realm');
    expect(featuresTable.reads!.where!.input!({ target, realm: 'global', folder: '/home/me/shop' })).toEqual({ target, realm: 'global', cwd: '/home/me/shop' });
    for (const r of [featureRoutes.features, featureRoutes.setFeatures]) {
      expect(r.realm).toBe('none');
      expect(r.cwd).toBe(false);
    }
  });
  it('a feature change sends that one feature, and the agent\'s two refusals before writing are declared', () => {
    expect(featuresTable.changes!.setFeature!.input!({ target, name: 'read_claude_md', value: false })).toEqual({ target, body: { features: { read_claude_md: false } } });
    expect(featureRoutes.setFeatures.refuses).toEqual(['settings_key_protected', 'admin_unauthorized']);
    expect(featureRoutes.setFeatures.cas).toBeNull();
  });
  it('the change lock is per computer and feature and holds in every realm view', () => {
    const c = featuresTable.changes!.setFeature!;
    expect(c.acrossRealms).toBe(true);
    expect(c.lockKey!({ target, name: 'account_rotation', value: true })).toEqual({ computer: 'p1/c1', name: 'account_rotation' });
    expect(c.identity!({ target, name: 'account_rotation', value: true })).toEqual({ computer: 'p1/c1', name: 'account_rotation', value: true });
  });
});
