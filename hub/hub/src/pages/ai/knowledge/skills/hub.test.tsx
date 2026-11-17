// Knowledge → Skills → Skill Hub, on real core (fixture transport). Search and preview read no realm; the preview shows
// SKILL.md as fetched (plain text), its commands and every file with its size; Install sends exactly the previewed package's
// digest, once, into this realm, and says it lands off and not trusted. A lost answer is "may have gone through" until the
// list shows that folder with this hub skill's record and a new install time (never sent again); a 400 is failed; a 500
// stays unknown. A folder already holding a skill is replaced only after a warning.
import { bootFixtureCore, queryClient, realmsView, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetPresses } from './data';
import { skillRules, skillSeed, type SkillOpts } from './fixtures';
import SkillsView from './List';
import strings from './strings.en.json';
import aiStrings from '../../strings.en.json';

let sent: FixtureRequest[] = [];
const posts = () => sent.filter((r) => r.method === 'POST');
const gets = (path: string) => sent.filter((r) => r.method === 'GET' && r.path === path);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));

async function show(o: SkillOpts = {}) {
  sent = [];
  bootFixtureCore({ rules: skillRules({ ...o, onSend: (r) => sent.push(r) }) });
  const router = createRouter({ routeTree: createRootRoute({ component: SkillsView }), history: createMemoryHistory({ initialEntries: ['/ai/knowledge/skills'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  await screen.findByRole('table', { name: strings.title });
  return router;
}
const drawer = () => screen.getByRole('dialog', { name: strings['hub.title'] });
async function openPreview(o: SkillOpts = {}) {
  const router = await show(o);
  await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
  await userEvent.type(within(drawer()).getByRole('searchbox', { name: strings['hub.search'] }), 'change');
  await userEvent.click(within(drawer()).getByRole('button', { name: strings['hub.searchGo'] }));
  await within(drawer()).findByText('changelog');
  await userEvent.click(readBtn());
  // The preview is in: its facts name the package digest.
  await within(drawer()).findByText(strings['hub.f.digest']);
  return router;
}
const readBtn = (name = 'changelog') => within(drawer()).getByRole('button', { name: fill(strings['hub.read'], { name }) });
const installBtn = () => within(drawer()).getByRole('button', { name: strings['hub.install'] });

afterEach(() => {
  forgetPresses();
  cleanup();
  queryClient.clear();
});

describe('Skill Hub: search and read', () => {
  it('the starts-off line links to the trust question (faq-ai), which peeks over the drawer', async () => {
    await openPreview();
    await userEvent.click(within(drawer()).getByRole('link', { name: strings['trust.more'] }));
    expect(await screen.findByText(aiStrings['faq.skillTrust.a'])).toBeInTheDocument();
  });

  it('before any search: the trust band (with its question) and a start state; no table, nothing sent', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
    const d = drawer();
    expect(within(d).getByText(strings['hub.trust'])).toBeInTheDocument();
    expect(within(d).getByRole('link', { name: strings['trust.more'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['hub.startTitle'])).toBeInTheDocument();
    expect(within(d).getByText(strings['hub.startBody'])).toBeInTheDocument();
    expect(within(d).queryByRole('table')).toBeNull();
    expect(gets('/skills/hub/search')).toHaveLength(0);
  });

  it('searches without a realm into a DataTable: one search bar, a view menu, Published at links, installs say what they count; nothing is sent', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
    await userEvent.type(within(drawer()).getByRole('searchbox', { name: strings['hub.search'] }), 'change{Enter}');
    expect(await within(drawer()).findByText('changelog')).toBeInTheDocument();
    const d = drawer();
    const table = within(d).getByRole('table', { name: strings['hub.label'] });
    expect(within(d).getAllByRole('searchbox')).toHaveLength(1);
    expect(within(d).getByRole('button', { name: /view options/i })).toBeInTheDocument();
    expect(within(d).getByText(strings['hub.trust'])).toBeInTheDocument();
    expect(within(table).getByText(fill(strings['hub.installs_other'], { n: '1,200' }))).toBeInTheDocument();
    const pub = within(table).getByRole('link', { name: /atlas\/skills/ });
    expect(pub).toHaveAttribute('href', 'https://github.com/atlas/skills');
    // The Hub column is hidden by default (the view menu shows it).
    expect(within(table).queryByRole('columnheader', { name: strings['hub.col.hub'] })).toBeNull();
    const q = gets('/skills/hub/search');
    expect(q).toHaveLength(1);
    expect(q[0]!.query).toEqual({ query: 'change' });
    expect(posts()).toHaveLength(0);
  });

  it('a new search starts without the last results\' filters (a publisher picked before never hides the new hits)', async () => {
    const router = await show();
    await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
    const box = within(drawer()).getByRole('searchbox', { name: strings['hub.search'] });
    await userEvent.type(box, 'change{Enter}');
    expect(await within(drawer()).findByText('changelog')).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: '.', search: (s: Record<string, unknown>) => ({ ...s, hubpublisher: 'nobody', hubpage: '2' }) });
    });
    await userEvent.clear(box);
    await userEvent.type(box, 'pdf{Enter}');
    expect(await within(drawer()).findByText('pdf-tools')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('hubpublisher'));
    expect(router.state.location.search).not.toHaveProperty('hubpage');
  });

  it('an older cached answer says it may be out of date; no match says so', async () => {
    await show({ hubOld: true });
    await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
    await userEvent.type(within(drawer()).getByRole('searchbox', { name: strings['hub.search'] }), 'zzz{Enter}');
    expect(await within(drawer()).findByText(strings['hub.old'])).toBeInTheDocument();
    await within(drawer()).findByText(fill(strings['hub.none'], { query: 'zzz' }));
    expect(within(drawer()).getByText(fill(strings['hub.none'], { query: 'zzz' }))).toBeInTheDocument();
  });

  it('a preview from an older cache says it may be out of date', async () => {
    await openPreview({ hubOld: true });
    expect(within(drawer()).getByText(strings['hub.old'])).toBeInTheDocument();
  });

  it('the preview shows the body as the agent read it, its header fields by key, its commands, each file with its size and the package; reads no realm, sends nothing', async () => {
    await openPreview();
    const d = drawer();
    expect(within(d).getByText(/Write a changelog entry from the merged changes\./)).toBeInTheDocument();
    const fm = within(d).getByRole('heading', { name: strings['hub.frontmatter'] }).closest('section')!;
    expect(within(fm).getAllByRole('term').map((x) => x.textContent)).toEqual(['description', 'name']);
    expect(within(d).getByText(fill(strings['hub.commands_one'], { count: 1 }))).toBeInTheDocument();
    const files = within(d).getByRole('table', { name: fill(strings['hub.files_other'], { count: 2 }) });
    const tpl = within(files).getByText('template.md').closest('tr')!;
    expect(within(tpl).getByText('2 KB')).toBeInTheDocument();
    expect(within(d).getByText('sha256:0000fixture0000changelog')).toBeInTheDocument();
    expect(within(d).getByText(strings['hub.filesNote'])).toBeInTheDocument();
    expect(within(d).getByRole('figure', { name: strings['hub.commandsLabel'] }).textContent).toContain('ls -1 notes');
    const p = gets('/skills/hub/preview');
    expect(p).toHaveLength(1);
    expect(p[0]!.query).toEqual({ provider: 'skills.sh', source: 'atlas/skills', skill_id: 'changelog' });
    expect(posts()).toHaveLength(0);
  });

  it('a preview without a package digest offers no install', async () => {
    await show({ previewBad: true });
    await userEvent.click(screen.getByRole('button', { name: strings['list.hub'] }));
    await userEvent.type(within(drawer()).getByRole('searchbox', { name: strings['hub.search'] }), 'change{Enter}');
    await within(drawer()).findByText('changelog');
    await userEvent.click(readBtn());
    expect(await within(drawer()).findByText(strings['hub.badPreview'])).toBeInTheDocument();
    expect(within(drawer()).queryByRole('button', { name: strings['hub.install'] })).toBeNull();
  });
});

describe('Skill Hub: where it comes from, and the reader', () => {
  it('Published at, Read from and Version are web links when they are web addresses', async () => {
    await openPreview({ hubOrigin: 'https://github.com/atlas/skills/tree/abcdef0123/changelog', hubCommit: 'abcdef0123456789abcdef0123456789abcdef01' });
    const d = drawer();
    expect(within(d).getByRole('link', { name: /^https:\/\/github\.com\/atlas\/skills \(/ })).toHaveAttribute('href', 'https://github.com/atlas/skills');
    expect(within(d).getByRole('link', { name: /^https:\/\/github\.com\/atlas\/skills\/tree\/abcdef0123\/changelog/ })).toHaveAttribute('target', '_blank');
    // A 40-hex commit address holds a 24-hex run: it is the secret button (an accepted false mask of the shared table),
    // its short words kept, never an href.
    const v = within(d).getByRole('button', { name: /^abcdef0 / });
    expect(v).not.toHaveAttribute('href');
    expect(d.innerHTML).not.toContain('abcdef0123456789abcdef0123456789abcdef01');
  });

  it('an http origin is a link; a git+ssh origin and a non-hex commit stay plain text', async () => {
    await openPreview({ hubOrigin: 'http://skills.example.com/.well-known/skills/changelog/' });
    expect(within(drawer()).getByRole('link', { name: /^http:\/\/skills\.example\.com\// })).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    await openPreview({ hubOrigin: 'git+ssh://git@example.com/atlas/skills.git' });
    const d = drawer();
    const plain = within(d).getByText('git+ssh://git@example.com/atlas/skills.git');
    expect(plain.closest('a')).toBeNull();
    expect(plain.closest('[title]')).toHaveAttribute('title', 'Not a web address');
    expect(within(d).getByText('fixture0commit').closest('a')).toBeNull();
  });

  it('the reader is the "Markdown body", downloaded as <skill>-body.md, never as SKILL.md; its images are not fetched', async () => {
    await openPreview({ hubBody: '# Changelog\n\nWrite a changelog entry from the merged changes.\n\n![logo](https://img.example.com/logo.png)\n' });
    const d = drawer();
    expect(within(d).getByRole('region', { name: strings['hub.body'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['hub.bodyNote'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /download changelog-body\.md/i })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /download skill\.md/i })).toBeNull();
    expect(d.querySelector('img[src*="img.example.com"]')).toBeNull();
  });
});

describe('Skill Hub: install', () => {
  it('sends the previewed digest once, into this realm; lands off and untrusted; Open it shows the new skill', async () => {
    await openPreview();
    await userEvent.click(installBtn());
    expect(await within(drawer()).findByText(fill(strings['hub.done'], { name: 'changelog' }))).toBeInTheDocument();
    const p = posts();
    expect(p).toHaveLength(1);
    expect(p[0]!.path).toBe('/skills/hub/install');
    expect(p[0]!.body).toEqual({ package_digest: 'sha256:0000fixture0000changelog', overwrite: false });
    const realm = p[0]!.query.realm;
    if (realm !== undefined) expect(realm).toBe(realmsView().selected);
    // The list is read fresh at the press (the install times it holds then), and again after.
    expect(gets('/skills').length).toBeGreaterThanOrEqual(2);
    await userEvent.click(await within(drawer()).findByRole('button', { name: strings['hub.openIt'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['hub.title'] })).toBeNull());
    expect(await screen.findByRole('heading', { name: 'changelog' })).toBeInTheDocument();
    expect(screen.getAllByText(strings['trust.untrusted']).length).toBeGreaterThan(0);
    expect(posts()).toHaveLength(1);
  });

  it('a lost answer is proved by the list (that folder, this hub skill, a new install time); nothing is sent again', async () => {
    await openPreview({ install: 'lost' });
    await userEvent.click(installBtn());
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['hub.done'], { name: 'changelog' }))).toBeInTheDocument());
    expect(posts()).toHaveLength(1);
  });

  it('an answer that never came and a list that does not show it: held after Check again, Install locked; Stop tracking frees it after a warning', async () => {
    await openPreview({ install: 'notApplied' });
    await userEvent.click(installBtn());
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['hub.held'], { name: 'changelog' }))).toBeInTheDocument());
    await userEvent.click(within(drawer()).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['hub.held'], { name: 'changelog' }))).toBeInTheDocument());
    expect(installBtn()).toBeDisabled();
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['use.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
    expect(within(dlg).getByText(strings['use.dismissBody'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['use.dismiss'] }));
    await waitFor(() => expect(installBtn()).not.toBeDisabled());
    expect(posts()).toHaveLength(1);
  });

  it('a 400 is failed (refused before any write), never unknown; a 500 stays unknown', async () => {
    await openPreview({ install: 'refuse' });
    await userEvent.click(installBtn());
    await waitFor(() => expect(drawer().querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(drawer().querySelector('[data-outcome="pending"]')).toBeNull();
    cleanup();
    queryClient.clear();
    await openPreview({ install: 'store' });
    await userEvent.click(installBtn());
    await waitFor(() => expect(drawer().querySelector('[data-outcome="pending"]')).not.toBeNull());
    expect(drawer().querySelector('[data-outcome="failed"]')).toBeNull();
  });

  it('a folder already holding a skill is replaced only after a warning, with overwrite', async () => {
    const seed = [
      ...skillSeed(),
      { name: 'changelog', description: 'Mine.', root_id: 'user', root_dir: '/home/ada/.hoody/skills', rel_dir: 'changelog', dir: '/home/ada/.hoody/skills/changelog', realm: 'global' },
    ];
    await openPreview({ seed });
    expect(within(drawer()).getByText(fill(strings['hub.taken'], { folder: 'changelog' }))).toBeInTheDocument();
    expect(within(drawer()).queryByRole('button', { name: strings['hub.install'] })).toBeNull();
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['hub.replace'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(fill(strings['hub.replaceBody'], { folder: 'changelog' }))).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['hub.replace'] }));
    await within(drawer()).findByText(fill(strings['hub.done'], { name: 'changelog' }));
    expect(posts().map((r) => r.body)).toEqual([{ package_digest: 'sha256:0000fixture0000changelog', overwrite: true }]);
  });

  it('a list that cannot be read at the press sends nothing and says so', async () => {
    let failList = false;
    await openPreview({ listFails: () => failList });
    failList = true;
    await userEvent.click(installBtn());
    expect(await within(drawer()).findByText(strings['add.readFirst'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a list that is only part of what it says sends nothing (an old install it left out could later look new)', async () => {
    let partial = false;
    await openPreview({ listPartial: () => partial });
    partial = true;
    await userEvent.click(installBtn());
    expect(await within(drawer()).findByText(strings['add.readFirst'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a skill of that name in another root is another folder: Install (no overwrite), never Replace', async () => {
    const seed = [
      ...skillSeed(),
      { name: 'changelog', description: 'Project copy.', root_id: 'project', root_dir: '/w/.hoody/skills', rel_dir: 'changelog', dir: '/w/.hoody/skills/changelog', realm: 'global' },
    ];
    await openPreview({ seed });
    expect(within(drawer()).queryByRole('button', { name: strings['hub.replace'] })).toBeNull();
    await userEvent.click(installBtn());
    await within(drawer()).findByText(fill(strings['hub.done'], { name: 'changelog' }));
    expect(posts().map((r) => r.body)).toEqual([{ package_digest: 'sha256:0000fixture0000changelog', overwrite: false }]);
  });

  it('a lost install proved after going back to the results and reading it again still shows done and Open it; sent once', async () => {
    let open = () => {};
    const g = new Promise<void>((r) => { open = r; });
    await openPreview({ install: 'lost', installGate: g });
    await userEvent.click(installBtn());
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['hub.back'] }));
    await act(async () => { open(); });
    await within(drawer()).findByText('changelog');
    await userEvent.click(readBtn());
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['hub.done'], { name: 'changelog' }))).toBeInTheDocument());
    expect(within(drawer()).getByRole('button', { name: strings['hub.openIt'] })).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  for (const shape of ['noTotal', 'noRelDir', 'negTotal', 'fracTotal', 'lowTotal'] as const) {
    it(`a list without what a proof reads (${shape}) sends nothing`, async () => {
      let bad = false;
      await openPreview({ listShape: () => (bad ? shape : undefined) });
      bad = true;
      await userEvent.click(installBtn());
      expect(await within(drawer()).findByText(strings['add.readFirst'])).toBeInTheDocument();
      expect(posts()).toHaveLength(0);
    });
  }

  it('a Replace confirmed after the folder stopped holding a skill sends nothing and says so', async () => {
    let drop: string | undefined = undefined;
    const seed = [
      ...skillSeed(),
      { name: 'changelog', description: 'Mine.', root_id: 'user', root_dir: '/home/ada/.hoody/skills', rel_dir: 'changelog', dir: '/home/ada/.hoody/skills/changelog', realm: 'global' },
    ];
    await openPreview({ seed, listDrop: () => drop });
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['hub.replace'] }));
    const dlg = await screen.findByRole('alertdialog');
    drop = 'changelog';
    await userEvent.click(within(dlg).getByRole('button', { name: strings['hub.replace'] }));
    expect(await within(drawer()).findByText(fill(strings['add.notTaken'], { folder: 'changelog' }))).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('done belongs to the package sent: a newer package of that skill read later is offered, not shown installed', async () => {
    let tag = '';
    await openPreview({ digestTag: () => tag });
    await userEvent.click(installBtn());
    await within(drawer()).findByText(fill(strings['hub.done'], { name: 'changelog' }));
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['hub.back'] }));
    tag = 'v2';
    queryClient.removeQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('hubPreview') });
    await within(drawer()).findByText('changelog');
    await userEvent.click(readBtn());
    expect(await within(drawer()).findByRole('button', { name: strings['hub.replace'] })).toBeInTheDocument();
    expect(within(drawer()).queryByText(fill(strings['hub.done'], { name: 'changelog' }))).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('an answered install belongs to its package too: the open preview refreshed to a newer one is offered, not shown installed', async () => {
    let tag = '';
    await openPreview({ digestTag: () => tag });
    await userEvent.click(installBtn());
    await within(drawer()).findByText(fill(strings['hub.done'], { name: 'changelog' }));
    tag = 'v2';
    await act(async () => { await queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('hubPreview') }); });
    expect(await within(drawer()).findByRole('button', { name: strings['hub.replace'] })).toBeInTheDocument();
    expect(within(drawer()).queryByText(fill(strings['hub.done'], { name: 'changelog' }))).toBeNull();
    expect(posts()).toHaveLength(1);
  });
});
