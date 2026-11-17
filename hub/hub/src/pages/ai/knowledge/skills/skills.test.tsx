// Knowledge → Skills, installed, on real core (fixture transport). The list shows on/off and trust apart; only the copy
// in use has a switch; the switch sends the value once and never trust; a lost answer is "may have gone through" with Check
// again (a read, never a second send) until a fresh list shows the value; a refusal is failed, not unknown; All realms reads
// in the computer's own realm (aiRealm.ts), and nothing for a computer in several realms.
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient, realmsView, type FixtureRequest, type FixtureRule } from '@core';
import { setRealm } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShownComputer } from './Files';
import { computerRealms } from '../../realmRules.testing';
import { skillRules, type SkillOpts } from './fixtures';
import SkillsView from './List';
import strings from './strings.en.json';
import aiStrings from '../../strings.en.json';

const USER = '/home/ada/.hoody/skills';
const PROJECT = '/home/ada/projects/shop/.hoody/skills';
let sent: FixtureRequest[] = [];
const lists = () => sent.filter((r) => r.method === 'GET');
const toggles = () => sent.filter((r) => r.method === 'POST');
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
/** Every agent call the transport sent: method, path and the realm read from its URL. kit.ts sends an agent call's realm in
 *  its URL only (admit: never in the built query), so a fixture request's query never carries it; the recorder is how a test
 *  reads it (as the GitHub Global case in settings/connections/accounts.test.tsx reads the fetched URLs). */
type AgentCall = { method: string; path: string; realm: string | null };
let agentCalls: AgentCall[] = [];
function recordAgentCalls(t: ReturnType<typeof bootFixtureCore>, first?: (c: AgentCall) => Response | undefined): void {
  agentCalls = [];
  const real = t.fetch.bind(t);
  t.fetch = (url, init, meta) => {
    const c: AgentCall = { method: meta.method.toUpperCase(), path: meta.path, realm: new URL(url, 'http://fixture.invalid').searchParams.get('realm') };
    agentCalls.push(c);
    const own = first?.(c);
    return own ? Promise.resolve(own) : real(url, init, meta);
  };
}
/** The realms the agent calls to `path` sent, in order. */
const realmsOf = (path: string, method = 'GET'): (string | null)[] => agentCalls.filter((c) => c.path === path && c.method === method).map((c) => c.realm);

async function show(o: SkillOpts = {}, path = '/ai/knowledge/skills', realm?: string, computer?: ShownComputer, extra: FixtureRule[] = []) {
  sent = [];
  recordAgentCalls(bootFixtureCore({ rules: [...extra, ...skillRules({ ...o, onSend: (r) => sent.push(r) })], ...(realm !== undefined ? { realm } : {}) }));
  const View = () => <SkillsView computer={computer} />;
  const router = createRouter({ routeTree: createRootRoute({ component: View }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
  return router;
}
const open = (name: string) => show({}, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/${name}`)}`);
const sw = () => screen.getByRole('switch', { name: strings['use.switch'] });

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('skills list', () => {
  it('lists every skill of this computer and realm with on/off and trust apart, in one read of the whole list', async () => {
    await show();
    const table = await screen.findByRole('table', { name: strings.title });
    const row = (name: string) => within(table).getAllByRole('row').find((r) => within(r).queryAllByText(name).length > 0)!;
    await within(table).findByText('pdf-tools');
    expect(within(row('pdf-tools')).getByText(strings['state.off'])).toBeInTheDocument();
    expect(within(row('deploy-check')).getByText(strings['state.on'])).toBeInTheDocument();
    expect(within(row('deploy-check')).getByText(strings['trust.untrusted'])).toBeInTheDocument();
    expect(within(row('sql-review')).getByText(strings['trust.trusted'])).toBeInTheDocument();
    expect(within(row('broken')).getByText(strings['state.broken'])).toBeInTheDocument();
    expect(within(table).getAllByText(strings['state.shadowed'])).toHaveLength(1);
    expect(lists()).toHaveLength(1);
    expect(lists()[0]!.query.limit).toBe('0');
    expect(realmsOf('/skills')).toEqual([realmsView().selected]);
    expect(toggles()).toHaveLength(0);
  });

  it('All realms, a computer in several realms: reads nothing and asks for a realm', async () => {
    const atlas = fixtureWorld.computers[0]!;
    await show({}, '/ai/knowledge/skills', 'all', undefined, [computerRealms(atlas.id, [fixtureWorld.realms[0]!.id, fixtureWorld.realms[1]!.id])]);
    expect(await screen.findByText(strings['allRealms.title'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('All realms, a computer in one realm: lists that realm\'s skills, no question', async () => {
    const atlas = fixtureWorld.computers[0]!;
    const r1 = fixtureWorld.realms[0]!.id;
    await show({}, '/ai/knowledge/skills', 'all', undefined, [computerRealms(atlas.id, [r1])]);
    await within(await screen.findByRole('table', { name: strings.title })).findByText('pdf-tools');
    expect(screen.queryByText(strings['allRealms.title'])).toBeNull();
    expect(lists()).toHaveLength(1);
    expect(realmsOf('/skills')).toEqual([r1]);
  });

  it('a failed list read is an error with Try again, never an empty list', async () => {
    await show({ listFails: true });
    await waitFor(() => expect(screen.queryByText(strings['empty.title'])).toBeNull());
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('on/off (enable ≠ trust)', () => {
  it('the on-but-not-trusted line links to the trust question (faq-ai), which opens its answer in place', async () => {
    await open('deploy-check');
    await userEvent.click(await screen.findByRole('link', { name: strings['trust.more'] }));
    expect(await screen.findByText(aiStrings['faq.skillTrust.a'])).toBeInTheDocument();
  });

  it('an untrusted skill that is on says its instructions are withheld; turning it off sends the value once and never trust', async () => {
    await open('deploy-check');
    expect(await screen.findByText(strings['use.untrustedOn'])).toBeInTheDocument();
    expect(sw()).toBeChecked();
    await userEvent.click(sw());
    await waitFor(() => expect(toggles()).toHaveLength(1));
    expect(toggles()[0]!.path).toBe('/skills/toggle');
    expect(toggles()[0]!.body).toEqual({ name: 'deploy-check', disabled: true });
    await waitFor(() => expect(sw()).not.toBeChecked());
    // Trust is untouched: still not trusted, and no other change was sent.
    expect(screen.getAllByText(strings['trust.untrusted']).length).toBeGreaterThan(0);
    expect(sent.filter((r) => r.method !== 'GET')).toHaveLength(1);
  });

  it('turning an off skill on sends disabled false', async () => {
    await open('pdf-tools');
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await waitFor(() => expect(toggles()).toHaveLength(1));
    expect(toggles()[0]!.body).toEqual({ name: 'pdf-tools', disabled: false });
    await waitFor(() => expect(sw()).toBeChecked());
  });

  it('a shadowed copy and a broken skill have no switch, and say why; the copy in use has it', async () => {
    await show({}, `/ai/knowledge/skills?sel=${encodeURIComponent('/home/ada/projects/shop/.hoody/skills/release-notes')}`);
    expect(await screen.findByRole('switch', { name: strings['use.switch'] })).toBeInTheDocument();
    cleanup();
    queryClient.clear();
    await open('release-notes');
    expect(await screen.findByText(strings['use.shadowed'].replace('{{where}}', strings['where.project']))).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: strings['use.switch'] })).toBeNull();
    cleanup();
    queryClient.clear();
    await open('broken');
    expect(await screen.findByText(strings['use.broken'])).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: strings['use.switch'] })).toBeNull();
  });

  it('a broken skill\'s detail says it could not be parsed, never the parser\'s own text', async () => {
    await open('broken');
    expect(await screen.findByText(strings['fact.errorValue'])).toBeInTheDocument();
    expect(screen.queryByText(/missing frontmatter/)).toBeNull();
  });
});

describe('C9: a lost on/off answer', () => {
  it('that did apply is proved by the fresh list (nothing sent again) and ends on, never failed', async () => {
    await show({ lost: true }, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await waitFor(() => expect(sw()).toBeChecked());
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).toBeNull());
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(toggles()).toHaveLength(1);
    expect(sw()).not.toBeDisabled();
  });

  it('a list that does not show the value keeps it held (never failed, never sent again); Stop tracking frees it after a warning', async () => {
    await show({ notApplied: true }, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    const line = await screen.findByRole('alert');
    expect(line).toHaveAttribute('data-outcome', 'pending');
    expect(sw()).toBeDisabled();
    await userEvent.click(within(line).getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(within(screen.getByRole('alert')).getByRole('button', { name: /check again/i })).not.toBeDisabled());
    expect(screen.getByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(toggles()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: strings['use.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dlg).getByText(strings['use.dismissBody'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['use.dismiss'] }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(sw()).not.toBeDisabled();
    expect(sw()).not.toBeChecked();
    expect(toggles()).toHaveLength(1);
  });

  it('a definite refusal (404 not_found: the skill went meanwhile) is failed, not unknown, and the switch stays usable', async () => {
    await show({ refuse: true }, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(sw()).not.toBeDisabled();
    expect(sw()).not.toBeChecked();
  });
});

describe('on/off: refusals and switch state', () => {
  it('a 503 service_unavailable is a definite refusal: failed, one POST, the switch usable and unchanged', async () => {
    await show({ busy: true }, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(document.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(toggles()).toHaveLength(1);
    expect(sw()).not.toBeDisabled();
    expect(sw()).not.toBeChecked();
  });

  it('a computer switch never carries a result to the other computer’s skill in the same folder', async () => {
    const other = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
    await show({}, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    // Both lists read once, so the switch back renders the other computer's cached list at once.
    await act(async () => {
      chooseComputer(other);
    });
    await waitFor(() => expect(lists().some((r) => r.target?.container.id === other.id)).toBe(true));
    await act(async () => {
      chooseComputer(atlas);
    });
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await waitFor(() => expect(document.querySelector('[data-outcome="done"]')).not.toBeNull());
    await act(async () => {
      chooseComputer(other);
    });
    await waitFor(() => expect(sw()).not.toBeChecked());
    expect(document.querySelector('[data-outcome]')).toBeNull();
    expect(toggles()).toHaveLength(1);
  });

  it('two skills hold apart: one held does not lock the other, and Stop tracking on one leaves the other held', async () => {
    await show({ notApplied: true }, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/pdf-tools`)}`);
    await waitFor(() => expect(sw()).not.toBeChecked());
    await userEvent.click(sw());
    await screen.findByRole('alert');
    const table = screen.getByRole('table', { name: strings.title });
    const row = within(table).getAllByRole('row').find((r) => within(r).queryAllByText('deploy-check').length > 0)!;
    await userEvent.click(within(row).getByText('deploy-check'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'deploy-check' })).toBeInTheDocument());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sw()).not.toBeDisabled();
    await userEvent.click(sw());
    await screen.findByRole('alert');
    expect(toggles().map((r) => (r.body as { name: string }).name)).toEqual(['pdf-tools', 'deploy-check']);
    await userEvent.click(screen.getByRole('button', { name: strings['use.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    await userEvent.click(within(dlg).getByRole('button', { name: strings['use.dismiss'] }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const back = within(table).getAllByRole('row').find((r) => within(r).queryAllByText('pdf-tools').length > 0)!;
    await userEvent.click(within(back).getByText('pdf-tools'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'pdf-tools' })).toBeInTheDocument());
    expect(await screen.findByRole('alert')).toHaveAttribute('data-outcome', 'pending');
    expect(sw()).toBeDisabled();
  });
});

// The skill's files. SKILL.md first, read here from the agent; every other file listed with its kind,
// as a plain row: the agent returns only SKILL.md, so a bundled file has no button.
const ATLAS: ShownComputer = { name: 'atlas', handle: 'atlas', running: true, link: { id: 'c-atlas', project_id: 'p1', server_name: 'sg1' } };
const openWith = (name: string, o: SkillOpts = {}, computer: ShownComputer | undefined = ATLAS) =>
  show(o, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/${name}`)}`, undefined, computer);
const fileList = () => screen.findByRole('list', { name: strings['files.title'] });
const sources = () => sent.filter((r) => r.method === 'GET' && r.path === '/skills/source');
const titlesOf = (list: HTMLElement) => within(list).getAllByRole('listitem').map((li) => li.querySelector('[data-mono]')?.textContent);

describe('files in this skill', () => {
  it('lists SKILL.md first, then each file with its kind; the Other files fact is gone; nothing is read yet', async () => {
    await openWith('sql-review');
    const list = await fileList();
    expect(titlesOf(list)).toEqual(['SKILL.md', 'scripts/check.sh', 'rules.md']);
    const row = (title: string) => within(list).getAllByRole('listitem').find((li) => within(li).queryByText(title))!;
    expect(within(row('scripts/check.sh')).getByText(strings['files.kind.shell'])).toBeInTheDocument();
    expect(within(row('rules.md')).getByText(strings['files.kind.md'])).toBeInTheDocument();
    expect(screen.queryByText(strings['files.none'])).toBeNull();
    expect(screen.queryByText('Other files')).toBeNull();
    expect(sources()).toHaveLength(0);
  });

  it('a bundled file is a plain row: no button, no link, nothing read or opened; only SKILL.md has an action', async () => {
    const opened: unknown[] = [];
    const was = window.open;
    window.open = ((...a: unknown[]) => { opened.push(a); return null; }) as typeof window.open;
    try {
      await openWith('sql-review');
      const list = await fileList();
      const row = (title: string) => within(list).getAllByRole('listitem').find((li) => within(li).queryByText(title))!;
      for (const file of ['scripts/check.sh', 'rules.md']) {
        expect(within(row(file)).queryByRole('button'), file).toBeNull();
        expect(within(row(file)).queryByRole('link'), file).toBeNull();
        await userEvent.click(within(row(file)).getByText(file));
      }
      expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([fill(strings['files.readName'], { file: 'SKILL.md' })]);
      expect(screen.queryByText('Open in viewer')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(opened).toHaveLength(0);
      expect(sources()).toHaveLength(0);
      expect(document.body.innerHTML).not.toMatch(/https?:\/\/[^"]*sql-review/);
      expect(document.querySelector('a[href*="check.sh"]')).toBeNull();
    } finally {
      window.open = was;
    }
  });

  it('Read SKILL.md opens the file the agent has (root_dir, rel_dir, this realm) in a reader; its images are not fetched', async () => {
    await openWith('sql-review');
    await fileList();
    await userEvent.click(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) }));
    const d = await screen.findByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'sql-review' }) });
    expect((await within(d).findAllByText(/Review SQL migrations\./)).length).toBeGreaterThan(0);
    expect(within(d).getByRole('button', { name: /download skill\.md/i })).toBeInTheDocument();
    expect(d.querySelector('img[src*="img.example.com"]')).toBeNull();
    const q = sources();
    expect(q).toHaveLength(1);
    expect(q[0]!.query.root_dir).toBe(USER);
    expect(q[0]!.query.rel_dir).toBe('sql-review');
    // The read goes where the list was read: the same computer and the same realm (core carries the realm, never All).
    const list = lists().find((r) => r.path === '/skills')!;
    expect(q[0]!.target?.container.id).toBe(list.target?.container.id);
    expect(realmsOf(q[0]!.path)).toEqual([realmsView().selected]);
    expect(realmsOf(list.path)[0]).toBe(realmsView().selected);
    expect(toggles()).toHaveLength(0);
  });

  it('each skill reads its own folder: a shadowed copy reads its own SKILL.md, the copy in use reads the other', async () => {
    await show({}, `/ai/knowledge/skills?sel=${encodeURIComponent(`${USER}/release-notes`)}`, undefined, ATLAS);
    await fileList();
    await userEvent.click(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) }));
    let d = await screen.findByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'release-notes' }) });
    expect((await within(d).findAllByText(/Write release notes from the merged changes\./)).length).toBeGreaterThan(0);
    expect(within(d).queryByText(/The shop’s own release notes\./)).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    cleanup();
    queryClient.clear();
    await show({}, `/ai/knowledge/skills?sel=${encodeURIComponent(`${PROJECT}/release-notes`)}`, undefined, ATLAS);
    await fileList();
    await userEvent.click(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) }));
    d = await screen.findByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'release-notes' }) });
    expect((await within(d).findAllByText(/The shop’s own release notes\./)).length).toBeGreaterThan(0);
    expect(within(d).queryByText(/Write release notes from the merged changes\./)).toBeNull();
    expect(sources().map((r) => r.query.root_dir)).toEqual([PROJECT]);
  });

  it('a SKILL.md answer without text says the agent sent none, never an empty file', async () => {
    await openWith('sql-review', { sourceEmpty: true });
    await fileList();
    await userEvent.click(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) }));
    const d = await screen.findByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'sql-review' }) });
    expect(await within(d).findByText(strings['files.readBad'])).toBeInTheDocument();
    expect(within(d).queryByRole('region', { name: strings['files.readLabel'] })).toBeNull();
    const before = sources().length;
    await userEvent.click(within(d).getByRole('button', { name: strings['files.readAgain'] }));
    await waitFor(() => expect(sources().length).toBeGreaterThan(before));
  });

  it('a computer whose running state is unknown is not called stopped: Read stays open', async () => {
    await openWith('sql-review', {}, { ...ATLAS, running: undefined });
    await fileList();
    expect(screen.queryByText(fill(strings['files.stopped'], { computer: 'atlas' }))).toBeNull();
    expect(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a skill with no other files lists SKILL.md and says so', async () => {
    await openWith('pdf-tools');
    const list = await fileList();
    expect(titlesOf(list)).toEqual(['SKILL.md']);
    expect(screen.getByText(strings['files.none'])).toBeInTheDocument();
  });

  it('a broken skill keeps its Error fact and still lists SKILL.md', async () => {
    await openWith('broken');
    const list = await fileList();
    expect(titlesOf(list)).toEqual(['SKILL.md']);
    expect(screen.getByText(strings['fact.errorValue'])).toBeInTheDocument();
  });

  it('a SKILL.md read that fails is an error with Try again in the reader, which reads again', async () => {
    await openWith('sql-review', { sourceFails: true });
    await fileList();
    await userEvent.click(screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) }));
    const d = await screen.findByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'sql-review' }) });
    const retry = await within(d).findByRole('button', { name: /try again/i });
    const before = sources().length;
    await userEvent.click(retry);
    await waitFor(() => expect(sources().length).toBeGreaterThan(before));
  });

  it('a stopped computer says files open while it runs, and Read waits with that reason', async () => {
    await openWith('sql-review', {}, { ...ATLAS, running: false });
    await fileList();
    expect(screen.getAllByText(fill(strings['files.stopped'], { computer: 'atlas' })).length).toBeGreaterThan(0);
    const read = screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) });
    expect(read).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(read);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sources()).toHaveLength(0);
  });
});

// The SKILL.md reader is keyed by computer and realm (SkillsList's key carries both):
// a switch while a read is out never shows the old place's text, and a read on the new place shows its own.
describe('the SKILL.md reader across a computer or realm switch', () => {
  const readBtn = () => screen.getByRole('button', { name: fill(strings['files.readName'], { file: 'SKILL.md' }) });
  const dialog = () => screen.queryByRole('dialog', { name: fill(strings['files.readTitle'], { name: 'sql-review' }) });
  // Each read answers words naming the computer it went to and the realm shown when it was sent (core sends the realm outside
  // the query), held until the test lets it answer.
  function held() {
    const gates: Array<() => void> = [];
    const said = new Map<FixtureRequest, string>();
    const sourceFor = (r: FixtureRequest) => {
      if (!said.has(r)) said.set(r, `Words of ${r.target?.container.id ?? '?'} in ${realmsView().selected}.`);
      return { words: said.get(r)!, wait: new Promise<void>((ok) => { gates.push(ok); }) };
    };
    return { gates, words: (r: FixtureRequest) => said.get(r)!, sourceFor };
  }

  it('a computer switch while SKILL.md is being read: the first computer\'s text never shows; the next read shows the new one\'s', async () => {
    const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
    const other = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
    const h = held();
    await openWith('sql-review', { sourceFor: h.sourceFor });
    await fileList();
    await userEvent.click(readBtn());
    await waitFor(() => expect(sources()).toHaveLength(1));
    const first = sources()[0]!;
    expect(first.target?.container.id).toBe(atlas.id);
    await act(async () => { chooseComputer(other); });
    await waitFor(() => expect(lists().some((r) => r.target?.container.id === other.id)).toBe(true));
    await act(async () => { h.gates[0]!(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText(h.words(first))).toBeNull();
    await fileList();
    await userEvent.click(readBtn());
    await waitFor(() => expect(sources()).toHaveLength(2));
    const second = sources()[1]!;
    expect(second.target?.container.id).toBe(other.id);
    await act(async () => { h.gates[1]!(); });
    const d = await waitFor(() => { const x = dialog(); if (!x) throw new Error('no reader'); return x; });
    expect((await within(d).findAllByText(h.words(second))).length).toBeGreaterThan(0);
    expect(within(d).queryByText(h.words(first))).toBeNull();
  });

  it('a realm switch while SKILL.md is being read: the first realm\'s text never shows; the next read shows the new one\'s', async () => {
    const A = realmsView().selected;
    const other = fixtureWorld.realms.map((r) => r.id).find((id) => id !== A)!;
    const h = held();
    await openWith('sql-review', { sourceFor: h.sourceFor });
    await fileList();
    await userEvent.click(readBtn());
    await waitFor(() => expect(sources()).toHaveLength(1));
    const first = sources()[0]!;
    const listed = lists().filter((r) => r.path === '/skills').length;
    await act(async () => { setRealm(other); });
    expect(realmsView().selected).toBe(other);
    await waitFor(() => expect(lists().filter((r) => r.path === '/skills').length).toBe(listed + 1));
    await act(async () => { h.gates[0]!(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText(h.words(first))).toBeNull();
    await fileList();
    await userEvent.click(readBtn());
    await waitFor(() => expect(sources()).toHaveLength(2));
    const second = sources()[1]!;
    expect(h.words(second)).toContain(other);
    expect(h.words(first)).toContain(A);
    await act(async () => { h.gates[1]!(); });
    const d = await waitFor(() => { const x = dialog(); if (!x) throw new Error('no reader'); return x; });
    expect((await within(d).findAllByText(h.words(second))).length).toBeGreaterThan(0);
    expect(within(d).queryByText(h.words(first))).toBeNull();
  });
});
