// Vitest: the AI tab's routes. Every exported link and every command lands on the right
// screen; the models page's old links keep working; a conversation link is the Board's canonical reference; a folder
// link opens the folder's page; Knowledge → Instructions has its own route.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures } from '@app/fixtures';
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { convTileUrl } from '../board/links';
import { chatLink, folderLink, links, type ChatRef, type FolderRef } from './links';
import { folderLinkOf, keyOfPath } from './folders/folder';
import folderStrings from './folders/strings.en.json';
import page from './page';
import strings from './strings.en.json';
import skillStrings from './knowledge/skills/strings.en.json';
import instructionStrings from './knowledge/instructions/strings.en.json';
import memoryStrings from './knowledge/memory/Memory.strings.en.json';
import paneStrings from './parts/Pane.strings.en.json';
import agentStrings from './agents/strings.en.json';
import loopStrings from './auto/loops/List.strings.en.json';
import todoStrings from './auto/todos/List.strings.en.json';
import wfStrings from './auto/workflows/strings.en.json';
import { redirectOf, viewOf } from './tab';
import { autoOf, knowledgeOf } from './parts/Pane';

const SLOW = { timeout: 5000 };

// Every screen of the tab is a lazy() import (tab.tsx), and each test file runs in its own worker, so a route's whole
// import tree is transformed cold the first time it renders. On a busy machine that outlives SLOW, which is about the page,
// not the import: load them once here, with the import's own budget, before the first route renders.
beforeAll(async () => {
  await Promise.all([
    import('./view'),
    import('./agents/AgentsView'),
    import('./auto/loops/List'),
    import('./auto/todos/List'),
    import('./auto/workflows/List'),
    import('./knowledge/skills/List'),
    import('./knowledge/instructions/InstructionsView'),
    import('./knowledge/memory/Memory'),
    import('./safety'),
    import('./settings/connections/Accounts'),
    import('./settings/connections/Mcp'),
    import('./folders/FolderPage'),
    loadFixtures('ai'),
  ]);
}, 120_000);

const REF: ChatRef = { computer: 'atlas.a1b2', realm: 'global', sid: 'sess_01HX.y:z-9' };

/** Renders the tab at `path` and waits until the Models & keys view shows; returns the router's final location. */
async function landing(path: string) {
  // One page at a time: a test that lands several links unmounts the one before.
  cleanup();
  const r = await renderPage(page, { path });
  await screen.findByText(strings['def.helper'], undefined, SLOW);
  await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/models'), SLOW);
  expect(screen.getAllByText(strings['models.title']).length).toBeGreaterThan(0);
  return r.router.state.location;
}

/** Renders the tab at `path` and waits until the AI pane shows; the route stays. */
async function staying(path: string) {
  cleanup();
  const r = await renderPage(page, { path });
  await screen.findByRole('navigation', { name: paneStrings['pane.label'] }, SLOW);
  return r;
}

describe('the tab, Models & keys and the old links', () => {
  it('names the tab AI, right after Home, and the models view Models & keys', () => {
    expect(strings.title).toBe('AI');
    expect(strings.nav).toBe('AI');
    expect(strings['models.title']).toBe('Models & keys');
    expect(page.nav?.order).toBeLessThan(10);
  });

  it('every exported models link lands on Models & keys', async () => {
    for (const href of [links.list, links.section('default'), links.connect(), links.connect('openai')]) {
      expect(href.startsWith('/ai/models'), href).toBe(true);
    }
    for (const id of ['default', 'accounts', 'claude', 'spending', 'advanced'] as const) {
      expect(links.section(id)).toBe(id === 'default' ? '/ai/models' : `/ai/models?section=${id}`);
    }
    const at = await landing(links.section('spending'));
    expect(at.search).toMatchObject({ section: 'spending' });
  });

  it('the tab and New chat show the AI pane and stay on their route', async () => {
    expect(links.tab).toBe('/ai');
    expect(links.newChat).toBe('/ai/new');
    for (const href of [links.tab, links.newChat]) {
      const r = await staying(href);
      expect(r.router.state.location.pathname).toBe(href);
    }
  });

  it('an old /ai?connect= link opens the Connect drawer at that provider on Models & keys', async () => {
    await landing('/ai?connect=google');
    const field = (await screen.findByLabelText(/API key/, undefined, SLOW)) as HTMLInputElement;
    expect(field.type).toBe('password');
  });

  it('old /ai?section= links keep their query and ?pick= opens the picker, on Models & keys', async () => {
    expect((await landing('/ai?section=claude')).search).toMatchObject({ section: 'claude' });
    // ?pick= opens the model picker; the view drops the key once it has (Default.tsx).
    await landing('/ai?pick=helper');
    expect(await screen.findByRole('dialog', undefined, SLOW)).toBeInTheDocument();
  });

  it('a conversation link is the Board tile’s canonical reference, and an unsafe part links nothing', () => {
    const href = chatLink(REF);
    expect(href).toBe('/ai/c/sess_01HX.y%3Az-9?computer=atlas.a1b2&realm=global');
    const tile = convTileUrl('https://hub.example', REF);
    expect(tile.slice(tile.indexOf('#') + 1)).toBe(href);
    expect(chatLink({ ...REF, realm: '0123456789abcdef01234567' })).toContain('realm=0123456789abcdef01234567');
    for (const bad of [{ ...REF, realm: 'Work' }, { ...REF, realm: '' }, { ...REF, sid: '../x' }, { ...REF, sid: '' }, { ...REF, computer: 'a b' }, { ...REF, computer: 'a/b' }, { ...REF, computer: '\uD800' }]) {
      expect(chatLink(bad), JSON.stringify(bad)).toBe('');
    }
  });

  it('a conversation link stays on its route with its computer and realm (the pane and the conversation both show)', async () => {
    const r = await staying(chatLink(REF));
    expect(r.router.state.location.search).toMatchObject({ computer: REF.computer, realm: REF.realm });
  });

  // One test per command, so each page mount has its own timeout.
  it.each(page.commands ?? [])('command $id lands on Models & keys with its query', async (c) => {
    // The tab's own command (no `to`) opens the tab: the AI pane.
    if (!c.to) {
      expect((await staying(page.path)).router.state.location.pathname, c.id).toBe('/ai');
      return;
    }
    const to = c.to;
    const at = await landing(to);
    const want = new URLSearchParams(to.split('?')[1] ?? '');
    // The view reads ?connect and ?pick once and drops them as its drawer or picker opens; ?section stays.
    for (const [k, v] of want) if (k !== 'connect' && k !== 'pick') expect(String((at.search as Record<string, unknown>)[k] ?? ''), `${c.id} ${k}`).toBe(v);
    if (want.has('connect') || want.has('pick')) expect(await screen.findByRole('dialog', undefined, SLOW)).toBeInTheDocument();
  });

  it('Knowledge → Skills shows at its own route, never moved to Models & keys', async () => {
    expect(links.skills).toBe('/ai/knowledge/skills');
    cleanup();
    const r = await renderPage(page, { path: links.skills });
    expect(await screen.findByRole('heading', { level: 1, name: skillStrings.title }, SLOW)).toBeInTheDocument();
    expect(r.router.state.location.pathname).toBe('/ai/knowledge/skills');
    expect(screen.queryByText(strings['def.helper'])).toBeNull();
  });

  // Each screen at its own route, never moved to Models & keys; the route stays as asked.
  const SCREENS: Array<[string, string, () => Promise<unknown>]> = [
    [links.workflows, '/ai/auto/workflows', () => screen.findByRole('heading', { level: 1, name: wfStrings['wf.title'] }, SLOW)],
    [links.loops, '/ai/auto/loops', () => screen.findByRole('heading', { level: 1, name: loopStrings.title }, SLOW)],
    [links.todos, '/ai/auto/todos', () => screen.findByRole('heading', { level: 1, name: todoStrings.title }, SLOW)],
    [links.connections, '/ai/connections', () => screen.findByRole('heading', { level: 1, name: strings['connections.title'] }, SLOW)],
    [links.rules, '/ai/rules', () => screen.findByRole('heading', { level: 1, name: strings['rules.title'] }, SLOW)],
    [links.agents, '/ai/agents', () => screen.findByRole('heading', { level: 1, name: agentStrings.title }, SLOW)],
    [links.agent('reviewer'), '/ai/agents/reviewer', () => screen.findByRole('article', { name: /reviewer/ }, SLOW)],
  ];
  it.each(SCREENS)('%s shows its own screen', async (to, want, find) => {
    expect(to).toBe(want);
    cleanup();
    const r = await renderPage(page, { path: to });
    expect(await find()).toBeInTheDocument();
    expect(r.router.state.location.pathname).toBe(want);
    expect(screen.queryByText(strings['def.helper'])).toBeNull();
  });

  it("the pane's switcher and gear open the built screens at their own routes (never moved to Models & keys)", async () => {
    cleanup();
    const r = await renderPage(page, { path: '/ai' });
    const nav = await screen.findByRole('list', { name: paneStrings['switch.label'] }, SLOW);
    const hrefOf = (name: string) => within(nav).getByRole('link', { name }).getAttribute('href')?.replace(/^#/, '');
    expect(hrefOf(paneStrings['switch.agents'])).toBe(links.agents);
    expect(hrefOf(paneStrings['switch.auto'])).toBe(links.workflows);
    expect(hrefOf(paneStrings['switch.knowledge'])).toBe(links.skills);
    for (const href of [links.agents, links.workflows, links.skills, links.connections, links.rules]) {
      expect(redirectOf(href.replace(/^\/ai\/?/, '').split('/'), {})).toBeNull();
    }
    await userEvent.click(within(nav).getByRole('link', { name: paneStrings['switch.auto'] }));
    expect(await screen.findByRole('heading', { level: 1, name: wfStrings['wf.title'] }, SLOW)).toBeInTheDocument();
    expect(r.router.state.location.pathname).toBe(links.workflows);
  });

  it('a deeper path under a settings screen goes to Models & keys', async () => {
    cleanup();
    const r = await renderPage(page, { path: '/ai/rules/x' });
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/models'), SLOW);
    expect(screen.queryByRole('heading', { level: 1, name: strings['rules.title'] })).toBeNull();
  });

  it('viewOf: the known routes; anything deeper or unknown is not built yet', () => {
    expect(viewOf(['auto', 'workflows'])).toBe('workflows');
    expect(viewOf(['auto', 'loops'])).toBe('loops');
    expect(viewOf(['auto', 'todos'])).toBe('todos');
    expect(viewOf(['auto'])).toBeNull();
    expect(viewOf(['auto', 'runs'])).toBeNull();
    expect(viewOf(['agents'])).toBe('agents');
    expect(viewOf(['agents', 'general'])).toBe('agents');
    expect(viewOf(['agents', 'general', 'x'])).toBeNull();
    expect(viewOf(['connections'])).toBe('connections');
    expect(viewOf(['rules'])).toBe('rules');
    expect(redirectOf(['auto'], {})).toBe('/ai/models');
    // A deeper path no screen reads is not built either: it falls back like any unknown route.
    for (const deeper of [['auto', 'workflows', 'x'], ['auto', 'loops', 'x'], ['auto', 'todos', 'x'], ['connections', 'x'], ['rules', 'x']]) {
      expect(viewOf(deeper)).toBeNull();
      expect(redirectOf(deeper, {})).toBe('/ai/models');
    }
  });

  it('redirectOf: the chat routes and /ai/models show; an old /ai?models link keeps its whole query; a route not built yet goes bare', () => {
    expect(redirectOf(['models'], { section: 'claude' })).toBeNull();
    expect(redirectOf(['knowledge', 'skills'], { q: 'pdf' })).toBeNull();
    expect(viewOf(['knowledge', 'skills'])).toBe('skills');
    expect(viewOf(['knowledge'])).toBeNull();
    expect(redirectOf(['knowledge'], {})).toBe('/ai/models');
    expect(redirectOf([], {})).toBeNull();
    expect(redirectOf([], { q: 'fix', folder: '/home/ada', sort: '-when', page: 2 })).toBeNull();
    expect(viewOf([])).toBe('chats');
    expect(viewOf(['new'])).toBe('new');
    expect(viewOf(['c', 'sid'])).toBe('chat');
    expect(redirectOf(['c'], {})).toBe('/ai/models');
    expect(redirectOf(['new', 'x'], {})).toBe('/ai/models');
    expect(redirectOf([], { connect: 'openai', accq: 'open' })).toBe('/ai/models?connect=openai&accq=open');
    expect(redirectOf([], { connect: 1 })).toBe('/ai/models?connect=1');
    expect(redirectOf([], { q: 'x', connect: 'openai' })).toBe('/ai/models?q=x&connect=openai');
    expect(redirectOf([], {}, 'spending')).toBe('/ai/models');
    expect(redirectOf(['c', 'sid'], {}, 'x')).toBeNull();
    expect(redirectOf(['new'], { connect: 'x' })).toBeNull();
    expect(redirectOf(['c', 'sid'], { computer: 'atlas.a1b2', realm: 'global' })).toBeNull();
  });

  it('a conversation link whose session id has an escaped colon stays on it (the router parses both routes alike)', async () => {
    const link = chatLink(REF);
    expect(link).toContain('%3A');
    const r = await staying(link);
    expect(r.router.state.location.pathname.startsWith('/ai/c/sess_01HX.y')).toBe(true);
  });
});

describe("a folder's page at /ai/f/<key>", () => {
  const FOLDER: FolderRef = { computer: 'atlas.a1b2', realm: 'global', path: '/home/ada/shop' };
  const SHOP = '/ai/f/L2hvbWUvYWRhL3Nob3A';

  it('folderLink: the base64url key of the path, the computer and one realm; anything else links nothing', () => {
    expect(folderLink(FOLDER)).toBe(`${SHOP}?computer=atlas.a1b2&realm=global`);
    expect(folderLink({ ...FOLDER, path: '/srv/a:b/c', realm: '0123456789abcdef01234567' })).toBe('/ai/f/L3Nydi9hOmIvYw?computer=atlas.a1b2&realm=0123456789abcdef01234567');
    expect(folderLink({ ...FOLDER, path: '/' })).toBe('/ai/f/Lw?computer=atlas.a1b2&realm=global');
    for (const bad of [
      { ...FOLDER, path: 'home/ada' }, { ...FOLDER, path: '' }, { ...FOLDER, path: '/a\nb' }, { ...FOLDER, path: '/a\uD800' },
      { ...FOLDER, realm: 'all' }, { ...FOLDER, realm: 'Work' }, { ...FOLDER, realm: '' },
      { ...FOLDER, computer: 'a b' }, { ...FOLDER, computer: 'a/b' }, { ...FOLDER, computer: '' }, { ...FOLDER, computer: '\uD800' },
    ]) {
      expect(folderLink(bad), JSON.stringify(bad)).toBe('');
    }
    // The page reads the link back as the same folder, computer and realm.
    const u = new URL(folderLink({ ...FOLDER, path: '/srv/données/ä b' }), 'https://hub.example');
    expect(folderLinkOf(keyOfPath(u.pathname), u.searchParams.get('computer'), u.searchParams.get('realm'))).toEqual({ path: '/srv/données/ä b', handle: FOLDER.computer, realm: 'global' });
  });

  it('viewOf: f with exactly one key segment is the folder page; /ai/f alone or deeper goes to Models & keys', () => {
    expect(viewOf(['f', 'L2hvbWUvYWRhL3Nob3A'])).toBe('folder');
    expect(redirectOf(['f', 'L2hvbWUvYWRhL3Nob3A'], { computer: 'atlas.a1b2', realm: 'global', tab: 'repository' })).toBeNull();
    for (const off of [['f'], ['f', 'L2hvbWU', 'x']]) {
      expect(viewOf(off)).toBeNull();
      expect(redirectOf(off, {})).toBe('/ai/models');
    }
  });

  it("a folder link shows the folder's page in the AI layout, Chats chosen in the pane, and stays on its route", async () => {
    const r = await staying(folderLink(FOLDER));
    expect(await screen.findByRole('heading', { level: 1, name: 'shop' }, SLOW)).toBeTruthy();
    expect(screen.getByRole('region', { name: folderStrings['folder.label'].replace('{{name}}', 'shop') })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).getByRole('link', { name: paneStrings['switch.chats'] })).toHaveAttribute('aria-current', 'page');
    expect(r.router.state.location.pathname).toBe(SHOP);
    expect(r.router.state.location.search).toMatchObject({ computer: 'atlas.a1b2', realm: 'global' });
  });

  it('a folder link that is not complete says so on its route, and Open AI goes to the tab', async () => {
    for (const href of [`${SHOP}?realm=global`, '/ai/f/not!a-key?computer=atlas.a1b2&realm=global', `${SHOP}?computer=atlas.a1b2&realm=all`]) {
      const r = await staying(href);
      const region = await screen.findByRole('region', { name: folderStrings['folder.region'] }, SLOW);
      expect(within(region).getByText(folderStrings['folder.incomplete.title'])).toBeTruthy();
      // The Hub routes by hash: the tab's own link.
      expect(within(region).getByRole('link', { name: folderStrings['folder.openAi'] })).toHaveAttribute('href', '#/ai');
      expect(r.router.state.location.pathname).toBe(href.split('?')[0]);
    }
  });
});

describe('Knowledge → Instructions at /ai/knowledge/instructions', () => {
  it('viewOf: exactly knowledge/instructions; deeper goes to Models & keys', () => {
    expect(links.instructions).toBe('/ai/knowledge/instructions');
    expect(viewOf(['knowledge', 'instructions'])).toBe('instructions');
    expect(redirectOf(['knowledge', 'instructions'], {})).toBeNull();
    expect(viewOf(['knowledge', 'instructions', 'x'])).toBeNull();
    expect(redirectOf(['knowledge', 'instructions', 'x'], {})).toBe('/ai/models');
  });

  it('shows the Instructions screen at its own route, Knowledge chosen in the pane, never moved to Models & keys', async () => {
    const r = await staying(links.instructions);
    expect(await screen.findByRole('heading', { level: 1, name: instructionStrings.title }, SLOW)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).getByRole('link', { name: paneStrings['switch.knowledge'] })).toHaveAttribute('aria-current', 'page');
    expect(r.router.state.location.pathname).toBe('/ai/knowledge/instructions');
    expect(screen.queryByText(strings['def.helper'])).toBeNull();
  });
});

describe('Knowledge → Memory at /ai/knowledge/memory', () => {
  it('viewOf: exactly knowledge/memory; deeper goes to Models & keys', () => {
    expect(links.memory).toBe('/ai/knowledge/memory');
    expect(viewOf(['knowledge', 'memory'])).toBe('memory');
    expect(redirectOf(['knowledge', 'memory'], {})).toBeNull();
    expect(redirectOf(['knowledge', 'memory'], { realm: 'global', project: 'v1:n0te' })).toBeNull();
    expect(viewOf(['knowledge', 'memory', 'x'])).toBeNull();
    expect(redirectOf(['knowledge', 'memory', 'x'], {})).toBe('/ai/models');
  });

  it('a deep link shows the Memory screen, Knowledge chosen in the pane and Memory in its index, never moved to Models & keys', async () => {
    const r = await staying(links.memory);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: memoryStrings.title })).toBeInTheDocument(), SLOW);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).getByRole('link', { name: paneStrings['switch.knowledge'] })).toHaveAttribute('aria-current', 'page');
    const index = within(nav).getByRole('list', { name: paneStrings['knowledge.label'] });
    expect(within(index).getByRole('link', { name: paneStrings['knowledge.memory'] })).toHaveAttribute('aria-current', 'page');
    expect(within(index).getByRole('link', { name: paneStrings['knowledge.skills'] })).not.toHaveAttribute('aria-current');
    expect(r.router.state.location.pathname).toBe('/ai/knowledge/memory');
    expect(screen.queryByText(strings['def.helper'])).toBeNull();
  });

  it("Knowledge's index links each screen; the keyboard opens Memory from Skills", async () => {
    const r = await staying(links.skills);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    const index = await within(nav).findByRole('list', { name: paneStrings['knowledge.label'] }, SLOW);
    const hrefOf = (name: string) => within(index).getByRole('link', { name }).getAttribute('href')?.replace(/^#/, '');
    expect(hrefOf(paneStrings['knowledge.skills'])).toBe(links.skills);
    expect(hrefOf(paneStrings['knowledge.instructions'])).toBe(links.instructions);
    expect(hrefOf(paneStrings['knowledge.memory'])).toBe(links.memory);
    expect(within(index).getByRole('link', { name: paneStrings['knowledge.skills'] })).toHaveAttribute('aria-current', 'page');
    within(index).getByRole('link', { name: paneStrings['knowledge.instructions'] }).focus();
    await userEvent.tab();
    expect(within(index).getByRole('link', { name: paneStrings['knowledge.memory'] })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/knowledge/memory'), SLOW);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: memoryStrings.title })).toBeInTheDocument(), SLOW);
  });

  it('the index shows only on Knowledge routes', async () => {
    await staying(links.workflows);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).queryByRole('list', { name: paneStrings['knowledge.label'] })).toBeNull();
  });
});

// Automations has an index as Knowledge does (Workflows · Loops · TODOs), in the pane beside
// the screen and above it on a phone, so the switcher reaches Workflows, Loops and TODOs alike.
describe('Automations index (Workflows · Loops · TODOs)', () => {
  it('names each entry as its screen titles itself', () => {
    expect(paneStrings['auto.workflows']).toBe(wfStrings['wf.title']);
    expect(paneStrings['auto.loops']).toBe(loopStrings.title);
    expect(paneStrings['auto.todos']).toBe(todoStrings.title);
    expect(paneStrings['auto.label']).toBe(paneStrings['switch.auto']);
  });

  it('on Workflows the pane lists Loops and TODOs; clicking TODOs opens the TODOs screen, marked as the current page', async () => {
    const r = await staying(links.workflows);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).getByRole('link', { name: paneStrings['switch.auto'] })).toHaveAttribute('aria-current', 'page');
    const index = await within(nav).findByRole('list', { name: paneStrings['auto.label'] }, SLOW);
    const hrefOf = (name: string) => within(index).getByRole('link', { name }).getAttribute('href')?.replace(/^#/, '');
    expect(within(index).getAllByRole('link').map((a) => a.textContent)).toEqual([paneStrings['auto.workflows'], paneStrings['auto.loops'], paneStrings['auto.todos']]);
    expect(hrefOf(paneStrings['auto.loops'])).toBe(links.loops);
    expect(hrefOf(paneStrings['auto.todos'])).toBe(links.todos);
    expect(within(index).getByRole('link', { name: paneStrings['auto.workflows'] })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(index).getByRole('link', { name: paneStrings['auto.todos'] }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/auto/todos'), SLOW);
    expect(await screen.findByRole('heading', { level: 1, name: todoStrings.title }, SLOW)).toBeInTheDocument();
    const after = within(screen.getByRole('navigation', { name: paneStrings['pane.label'] })).getByRole('list', { name: paneStrings['auto.label'] });
    expect(within(after).getByRole('link', { name: paneStrings['auto.todos'] })).toHaveAttribute('aria-current', 'page');
    expect(within(after).getByRole('link', { name: paneStrings['auto.workflows'] })).not.toHaveAttribute('aria-current');
  });

  it('the keyboard opens Loops from the index', async () => {
    const r = await staying(links.todos);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    const index = await within(nav).findByRole('list', { name: paneStrings['auto.label'] }, SLOW);
    within(index).getByRole('link', { name: paneStrings['auto.workflows'] }).focus();
    await userEvent.tab();
    expect(within(index).getByRole('link', { name: paneStrings['auto.loops'] })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/ai/auto/loops'), SLOW);
    expect(await screen.findByRole('heading', { level: 1, name: loopStrings.title }, SLOW)).toBeInTheDocument();
    // Focus stays on the entry it opened: the index is not drawn again around it, so the keyboard goes on from there.
    const after = within(screen.getByRole('navigation', { name: paneStrings['pane.label'] })).getByRole('list', { name: paneStrings['auto.label'] });
    expect(within(after).getByRole('link', { name: paneStrings['auto.loops'] })).toHaveFocus();
  });

  it('a Loops path with a query, or deeper, still marks Loops; off Automations no screen is marked', () => {
    expect(autoOf('/ai/auto/loops')).toBe('loops');
    expect(autoOf('/ai/auto/loops/edit/l-1')).toBe('loops');
    expect(autoOf('/ai/auto/loopsx')).toBeNull();
    expect(autoOf('/ai/knowledge/skills')).toBeNull();
    expect(knowledgeOf('/ai/knowledge/skills/s-1')).toBe('skills');
  });

  it('a Loops link with a query keeps Loops marked in the index', async () => {
    await staying(`${links.loops}?q=nightly`);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    const index = await within(nav).findByRole('list', { name: paneStrings['auto.label'] }, SLOW);
    expect(within(index).getByRole('link', { name: paneStrings['auto.loops'] })).toHaveAttribute('aria-current', 'page');
  });

  it('the Automations index shows only on Automations routes', async () => {
    await staying(links.skills);
    const nav = screen.getByRole('navigation', { name: paneStrings['pane.label'] });
    expect(within(nav).queryByRole('list', { name: paneStrings['auto.label'] })).toBeNull();
  });
});
