// Knowledge → Skills → Import, on real core (fixture transport). The scan reads no realm and shows each skill with what
// it would bring (commands, files, files that look like secrets); a broken one cannot be imported. Import sends ONE skill per
// request, once, into this realm (no path: the agent finds the folder again); each lands off and not trusted. The agent's
// per-skill answer is shown as it is; a lost answer is held until the list shows that folder with this import's record and
// a new install time; a 400 is failed. A folder already holding a skill is replaced only after a warning.
import { bootFixtureCore, queryClient, realmsView, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetPresses } from './data';
import { skillRules, type SkillOpts } from './fixtures';
import SkillsView from './List';
import strings from './strings.en.json';

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
}
const drawer = () => screen.getByRole('dialog', { name: strings['imp.title'] });
async function scan(o: SkillOpts = {}, tool: 'claude' | 'codex' = 'claude') {
  await show(o);
  await userEvent.click(screen.getByRole('button', { name: strings['list.import'] }));
  await userEvent.click(within(drawer()).getByRole('radio', { name: strings[`imp.tool.${tool}`] }));
  await within(drawer()).findByText(strings[`imp.where.${tool}`]);
}
/** The row of one scanned skill: the largest element around its name that holds no other scanned skill's name. */
const NAMES = ['review', 'pdf-tools', 'half'];
const entry = (name: string): HTMLElement => {
  let el: HTMLElement = within(drawer()).getByText(name, { exact: true });
  while (el.parentElement && !NAMES.some((n) => n !== name && within(el.parentElement!).queryByText(n, { exact: true }))) el = el.parentElement;
  return el;
};
/** A row action that stays focusable but does nothing (kit ReasonButton: aria-disabled), or a disabled button; absent throws. */
const off = (b: HTMLElement | null) => {
  // An absent action is never read as an enabled one.
  if (b === null) throw new Error('the action is not there');
  return b.getAttribute('aria-disabled') === 'true' || (b as HTMLButtonElement).disabled;
};
const importOf = (name: string) => within(entry(name)).queryByRole('button', { name: strings['imp.go'] });

afterEach(() => {
  forgetPresses();
  cleanup();
  queryClient.clear();
});

describe('Import: scan', () => {
  it('scans the chosen tool without a realm and shows what each skill brings; nothing is sent', async () => {
    await scan();
    const q = gets('/skills/import/scan');
    expect(q).toHaveLength(1);
    expect(q[0]!.query).toEqual({ source: 'claude' });
    const d = drawer();
    expect(within(d).getByText('review')).toBeInTheDocument();
    expect(within(d).getByText(fill(strings['imp.sensitive'], { files: '.env.local' }))).toBeInTheDocument();
    expect(within(d).getByText(fill(strings['hub.commands_one'], { count: 1 }))).toBeInTheDocument();
    expect(within(d).getByText(new RegExp(fill(strings['imp.collision'], { where: strings['where.user'] }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(within(d).getByText(strings['imp.lands'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a skill whose SKILL.md cannot be read says why and offers no import', async () => {
    await scan();
    expect(within(drawer()).getByText(strings['imp.broken'])).toBeInTheDocument();
    // The parser's own text is not shown.
    expect(within(drawer()).queryByText(/missing frontmatter/)).toBeNull();
    expect(importOf('half')).toBeNull();
  });

  it('Codex’s built-in skills are marked', async () => {
    await scan({}, 'codex');
    expect(await within(drawer()).findByText(strings['imp.system'])).toBeInTheDocument();
    // Claude Code is scanned first (the drawer opens on it), then Codex once picked.
    expect(gets('/skills/import/scan').map((q) => q.query)).toEqual([{ source: 'claude' }, { source: 'codex' }]);
  });
});

describe('Import: one skill per request', () => {
  it('sends that skill only, once, into this realm with no path; lands off and untrusted; Open it shows it', async () => {
    await scan();
    await userEvent.click(importOf('review')!);
    expect(await within(drawer()).findByText(fill(strings['imp.done'], { name: 'review' }))).toBeInTheDocument();
    const p = posts();
    expect(p).toHaveLength(1);
    expect(p[0]!.path).toBe('/skills/import/apply');
    expect(p[0]!.body).toEqual({ source: 'claude', items: [{ source: 'claude', rel_dir: 'review' }], overwrite: false });
    const realm = p[0]!.query.realm;
    if (realm !== undefined) expect(realm).toBe(realmsView().selected);
    expect(importOf('review')).toBeNull();
    await userEvent.click(await within(drawer()).findByRole('button', { name: strings['hub.openIt'] }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['imp.title'] })).toBeNull());
    expect(await screen.findByRole('heading', { name: 'review' })).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it('the agent’s own failure for that skill is failed with fixed words, never its own text; a 200 without its result says it may have been imported', async () => {
    await scan({ imports: 'itemFails' });
    await userEvent.click(importOf('review')!);
    expect(await within(drawer()).findByText(strings['imp.failedPlain'])).toBeInTheDocument();
    // The agent's own text for the failure is never shown.
    expect(within(drawer()).queryByText(/copy failed/)).toBeNull();
    cleanup();
    queryClient.clear();
    // A same-name collision in the batch has its own words, and the agent's text for it stays unseen.
    await scan({ imports: 'itemDup' });
    await userEvent.click(importOf('review')!);
    expect(await within(drawer()).findByText(strings['imp.dupInBatch'])).toBeInTheDocument();
    expect(within(drawer()).queryByText(/maps to the same name/)).toBeNull();
    cleanup();
    queryClient.clear();
    // The folder already holds a skill (the list read before the press was stale): its own words, the agent's text unseen.
    await scan({ imports: 'itemExists' });
    await userEvent.click(importOf('review')!);
    expect(await within(drawer()).findByText(fill(strings['imp.exists'], { folder: 'review' }))).toBeInTheDocument();
    expect(within(drawer()).queryByText(/enable overwrite/)).toBeNull();
    cleanup();
    queryClient.clear();
    // Without its result but imported: the list read after the answer proves it (done), nothing is sent again.
    await scan({ imports: 'noResult' });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(within(entry('review')).getByText(fill(strings['imp.done'], { name: 'review' }))).toBeInTheDocument());
    expect(within(entry('review')).queryByText(strings['imp.noResult'])).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('a 200 without its result that the list does not prove stays unknown: Import locked, Check again only reads, Stop tracking after a warning', async () => {
    await scan({ imports: 'noResultNone' });
    await userEvent.click(importOf('review')!);
    expect(await within(entry('review')).findByText(strings['imp.noResult'])).toBeInTheDocument();
    expect(off(within(entry('review')).getByRole('button', { name: strings['imp.go'] }))).toBe(true);
    const reads = gets('/skills').length;
    await userEvent.click(within(entry('review')).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(gets('/skills').length).toBeGreaterThan(reads));
    expect(within(entry('review')).getByText(strings['imp.noResult'])).toBeInTheDocument();
    // Leaving the tool and coming back keeps it unknown (nothing proved it).
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.codex'] }));
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.claude'] }));
    expect(await within(entry('review')).findByText(strings['imp.noResult'])).toBeInTheDocument();
    expect(off(within(entry('review')).getByRole('button', { name: strings['imp.go'] }))).toBe(true);
    await userEvent.click(within(entry('review')).getByRole('button', { name: strings['use.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['use.dismiss'] }));
    await waitFor(() => expect(off(within(entry('review')).getByRole('button', { name: strings['imp.go'] }))).toBe(false));
    expect(within(entry('review')).queryByText(strings['imp.noResult'])).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('a list that is only part of what it says sends nothing (an old install it left out could later look new)', async () => {
    await scan({ listPartial: true });
    await userEvent.click(importOf('review')!);
    expect(await within(entry('review')).findByText(strings['add.readFirst'])).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('a lost import proved after switching tools and back still shows done and Open it; sent once', async () => {
    let open = () => {};
    const g = new Promise<void>((r) => { open = r; });
    await scan({ imports: 'lost', installGate: g });
    await userEvent.click(importOf('review')!);
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.codex'] }));
    await act(async () => { open(); });
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.claude'] }));
    await waitFor(() => expect(within(entry('review')).getByText(fill(strings['imp.done'], { name: 'review' }))).toBeInTheDocument());
    expect(within(entry('review')).getByRole('button', { name: strings['hub.openIt'] })).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it('a lost answer is proved by the list (that folder, this tool’s folder, a new install time); nothing is sent again', async () => {
    await scan({ imports: 'lost' });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(drawer().querySelector('[data-outcome="done"]')).not.toBeNull());
    expect(posts()).toHaveLength(1);
  });

  it('an answer that never came: held, Import locked; Stop tracking frees it after a warning', async () => {
    await scan({ imports: 'notApplied' });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['imp.held'], { name: 'review' }))).toBeInTheDocument());
    await userEvent.click(within(drawer()).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['imp.held'], { name: 'review' }))).toBeInTheDocument());
    expect(off(importOf('review'))).toBe(true);
    await userEvent.click(within(drawer()).getByRole('button', { name: strings['use.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['use.dismiss'] }));
    await waitFor(() => expect(off(importOf('review'))).toBe(false));
    expect(posts()).toHaveLength(1);
  });

  it('one skill held does not lock another (each folder is its own change)', async () => {
    await scan({ imports: 'notApplied' });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(within(drawer()).getByText(fill(strings['imp.held'], { name: 'review' }))).toBeInTheDocument());
    expect(off(within(entry('pdf-tools')).getByRole('button', { name: strings['hub.replace'] }))).toBe(false);
  });

  it('a 400 refuses the request before any copy: failed, never unknown', async () => {
    await scan({ imports: 'refuse' });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(drawer().querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(drawer().querySelector('[data-outcome="pending"]')).toBeNull();
  });

  it('a folder already holding a skill is replaced only after a warning, with overwrite', async () => {
    await scan();
    expect(importOf('pdf-tools')).toBeNull();
    await userEvent.click(within(entry('pdf-tools')).getByRole('button', { name: strings['hub.replace'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(fill(strings['imp.replaceBody'], { folder: 'pdf-tools' }))).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['hub.replace'] }));
    await within(drawer()).findByText(fill(strings['imp.done'], { name: 'pdf-tools' }));
    expect(posts().map((r) => r.body)).toEqual([{ source: 'claude', items: [{ source: 'claude', rel_dir: 'pdf' }], overwrite: true }]);
  });

  it('a result-less answer that comes after the entry was left still holds it: unknown, Import locked, sent once', async () => {
    let open = () => {};
    const g = new Promise<void>((r) => { open = r; });
    await scan({ imports: 'noResultNone', installGate: g });
    await userEvent.click(importOf('review')!);
    await waitFor(() => expect(posts()).toHaveLength(1));
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.codex'] }));
    await act(async () => { open(); });
    await act(async () => { await new Promise((x) => setTimeout(x, 50)); });
    await userEvent.click(within(drawer()).getByRole('radio', { name: strings['imp.tool.claude'] }));
    expect(await within(entry('review')).findByText(strings['imp.noResult'])).toBeInTheDocument();
    expect(off(within(entry('review')).getByRole('button', { name: strings['imp.go'] }))).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  it('an item result without ok true/false is no result: unknown, never failed; Import locked', async () => {
    await scan({ imports: 'badItem' });
    await userEvent.click(importOf('review')!);
    expect(await within(entry('review')).findByText(strings['imp.noResult'])).toBeInTheDocument();
    expect(entry('review').querySelector('[data-outcome="failed"]')).toBeNull();
    expect(off(within(entry('review')).getByRole('button', { name: strings['imp.go'] }))).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  for (const shape of ['noTotal', 'noRelDir', 'negTotal', 'fracTotal', 'lowTotal'] as const) {
    it(`a list without what a proof reads (${shape}) sends nothing`, async () => {
      let bad = false;
      await scan({ listShape: () => (bad ? shape : undefined) });
      bad = true;
      await userEvent.click(importOf('review')!);
      expect(await within(entry('review')).findByText(strings['add.readFirst'])).toBeInTheDocument();
      expect(posts()).toHaveLength(0);
    });
  }

  it('a Replace confirmed after the folder stopped holding a skill sends nothing and says so', async () => {
    let drop: string | undefined = undefined;
    await scan({ listDrop: () => drop });
    await userEvent.click(within(entry('pdf-tools')).getByRole('button', { name: strings['hub.replace'] }));
    const dlg = await screen.findByRole('alertdialog');
    drop = 'pdf-tools';
    await userEvent.click(within(dlg).getByRole('button', { name: strings['hub.replace'] }));
    expect(await within(entry('pdf-tools')).findByText(fill(strings['add.notTaken'], { folder: 'pdf-tools' }))).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
});

// Each scanned skill is one kit ItemList row named for it, its state one pill (cannot be read, check
// first, built into Codex), what it brings as facts, its action in the row; its commands and files in one Disclosure.
describe('each skill is one kit row', () => {
  it('a skill to check first: one row with its pill, its facts and Import; commands and files folded together', async () => {
    await scan();
    const list = within(drawer()).getByRole('list', { name: 'review' });
    expect(within(list).getByText(strings['imp.st.check'])).toBeInTheDocument();
    expect(within(list).getByText(fill(strings['imp.into'], { folder: 'review' }))).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: strings['imp.go'] })).toBeInTheDocument();
    expect(within(entry('review')).getByText(fill(strings['imp.cmdsFiles_other'], { count: 2 }))).toBeInTheDocument();
  });

  it('a skill whose SKILL.md cannot be read: a danger pill and no action', async () => {
    await scan();
    const list = within(drawer()).getByRole('list', { name: 'half' });
    expect(within(list).getByText(strings['imp.st.broken'])).toBeInTheDocument();
    expect(within(list).queryByRole('button')).toBeNull();
  });

  it('a folder already holding a skill offers Replace in its row, opening its warning', async () => {
    await scan();
    const b = within(within(drawer()).getByRole('list', { name: 'pdf-tools' })).getByRole('button', { name: strings['hub.replace'] });
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
  });
});
