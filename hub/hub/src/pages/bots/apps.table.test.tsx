// Vitest (the Backups/Storage pattern): the Chat apps tab is an At a glance block (apps, what
// waits on the person, people, chats) and an Apps table with one row per app (App, Kind, State, People, Chats, Needs you).
// A row's most urgent fix is its inline action, else Manage; Manage, any further fixes and Remove (last, danger, confirmed)
// sit in its menu. The head holds Add a chat app, Pause all (Resume all while paused) and, in its menu, Settings for all
// chat apps. Each change the tab sends is recorded at the fixture source's mutation.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import page from './page';
import strings from './strings.en.json';

const W = vi.hoisted(() => ({ sent: [] as { key: string; vars: Record<string, unknown> }[] }));

vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          if (pageId !== 'bots' || (key !== 'channelChange' && key !== 'channelsPause')) return mu;
          const note = (vars: unknown): void => {
            W.sent.push({ key, vars: { ...((vars ?? {}) as Record<string, unknown>) } });
          };
          return {
            ...mu,
            mutate: (vars: V, o?: unknown) => {
              note(vars);
              return (mu.mutate as (a: V, b?: unknown) => void)(vars, o);
            },
            mutateAsync: (vars: V, o?: unknown) => {
              note(vars);
              return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o);
            },
          } as typeof mu;
        },
      };
    },
  };
});

beforeAll(async () => {
  await import('./view');
}, 30000);

beforeEach(() => {
  W.sent = [];
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const apps = (state?: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=apps` });
const sectionOf = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section') as HTMLElement);
const headOf = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('header') as HTMLElement);
const table = async () => within(await screen.findByRole('table', { name: strings['apps.table'].replace('{{name}}', 'Chief') }));
const rowOf = async (label: string) => within((await table()).getByRole('row', { name: new RegExp(label) }));
const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{{${k}}}`, String(x)), s);
const sent = (action: string) => W.sent.filter((x) => x.vars.action === action);

describe('At a glance', () => {
  it('names the apps, what waits on the person, and the people and chats over every app', async () => {
    await apps();
    const g = await sectionOf(strings['apps.glance.title']);
    const fact = (label: string) => g.getByText(label).closest('div')?.textContent ?? '';
    // Support chat (Telegram, privacy on: 1 wait), Team workspace (Slack, no owner: 1 wait), Community server (paused: none).
    expect(fact(strings['apps.glance.apps'])).toBe(`${strings['apps.glance.apps']}3`);
    expect(fact(strings['apps.glance.waiting'])).toBe(`${strings['apps.glance.waiting']}2`);
    expect(fact(strings['apps.glance.people'])).toBe(`${strings['apps.glance.people']}4`);
    expect(fact(strings['apps.glance.chats'])).toBe(`${strings['apps.glance.chats']}3`);
  });

  it('while the Bot has its apps paused: "all paused", nothing waits, and the pause is said once in the Apps notices', async () => {
    await apps('channelsPaused');
    const g = await sectionOf(strings['apps.glance.title']);
    expect(g.getByText(fill(strings['apps.glance.appsPaused'], { count: 3 }))).toBeInTheDocument();
    expect(g.getByText(strings['apps.glance.waitingNone'])).toBeInTheDocument();
    expect((await sectionOf(strings['chan.title'])).getByText(strings['chan.pausedAll'])).toBeInTheDocument();
    expect(screen.getAllByText(strings['chan.pausedAll'])).toHaveLength(1);
  });

  it('while the Bot has its apps paused but they still read as running, nothing waits either (the tab badge says the same)', async () => {
    await apps('channelsPausedBot');
    const g = await sectionOf(strings['apps.glance.title']);
    expect(g.getByText(strings['apps.glance.waitingNone'])).toBeInTheDocument();
  });

  it('is not shown without apps', async () => {
    await apps('noChannels');
    await screen.findByText(strings['chan.empty']);
    expect(screen.queryByRole('heading', { name: strings['apps.glance.title'] })).toBeNull();
    expect(screen.queryByRole('table', { name: strings['apps.table'].replace('{{name}}', 'Chief') })).toBeNull();
  });
});

describe('the Apps table', () => {
  it('has one row per app: its name, its kind with the logo before it, state, people, chats and what it needs', async () => {
    await apps();
    const t = await table();
    expect(t.getAllByRole('row')).toHaveLength(4); // the header and three apps
    const want = [
      { label: 'Support chat', kind: 'telegram', state: 'running', people: '3', chats: '2', needs: strings['apps.need.privacy'] },
      { label: 'Team workspace', kind: 'slack', state: 'needs_owner', people: '0', chats: '0', needs: strings['apps.need.owner'] },
      { label: 'Community server', kind: 'discord', state: 'paused', people: '1', chats: '1', needs: strings['apps.needsNone'] },
    ] as const;
    for (const w of want) {
      const cells = t.getByRole('row', { name: new RegExp(w.label) }).querySelectorAll('td');
      const text = [...cells].map((c) => c.textContent?.trim());
      expect(text.slice(0, 6)).toEqual([w.label, strings[`chan.kind.${w.kind}`], strings[`chan.state.${w.state}`], w.people, w.chats, w.needs]);
      // rule 19: the app's own mark right before its name
      expect(cells[1]?.querySelector('svg')?.nextSibling?.textContent?.trim()).toBe(strings[`chan.kind.${w.kind}`]);
    }
    expect(screen.queryByText(/people · /)).toBeNull();
    // the header words are words: the drawer's People and Chats stay the only buttons of those names
    expect(t.queryAllByRole('button', { name: /^(People|Chats)$/ })).toEqual([]);
  });

  it("a row's fix is its inline action and opens the drawer where it is fixed; Manage is then in the row menu", async () => {
    await apps();
    const slack = await rowOf('Team workspace');
    expect(slack.queryByRole('button', { name: strings['chan.manage'] })).toBeNull();
    await userEvent.click(slack.getByRole('button', { name: strings['flow.wait.go.owner'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['chan.manageTitle'], { name: 'Team workspace' }) });
    expect(within(d).getByRole('button', { name: strings['chan.ownerCode'] })).toBeInTheDocument();
  });

  it('a group asking to join: Review opens the drawer on Chats', async () => {
    await apps('channelGroupAsks');
    const tg = await rowOf('Support chat');
    expect(tg.getByText(fill(strings['apps.needsMore'], { first: fill(strings['apps.need.requested_one'], { count: 1 }), count: 1 }))).toBeInTheDocument();
    await userEvent.click(tg.getByRole('button', { name: strings['flow.wait.go.requested'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['chan.manageTitle'], { name: 'Support chat' }) });
    expect(await within(d).findByRole('table', { name: /Chats of/ })).toBeInTheDocument();
  });

  it('a row with nothing to fix has Manage inline, opening Setup', async () => {
    await apps();
    await userEvent.click((await rowOf('Community server')).getByRole('button', { name: strings['chan.manage'] }));
    const d = await screen.findByRole('dialog', { name: fill(strings['chan.manageTitle'], { name: 'Community server' }) });
    expect(within(d).getByRole('region', { name: strings['chan.rail.setup'] })).toBeInTheDocument();
  });

  it('the row menu: Manage first, Remove last and danger; Remove asks first and sends only on the confirmation', async () => {
    await apps();
    await userEvent.click((await rowOf('Support chat')).getByRole('button', { name: 'Row actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items[0]?.textContent).toContain(strings['chan.manage']);
    expect(items.at(-1)?.textContent).toContain(strings['chan.remove']);
    await userEvent.click(items.at(-1) as HTMLElement);
    const dlg = await screen.findByRole('alertdialog', { name: fill(strings['chan.removeTitle'], { name: 'Support chat' }) });
    expect(sent('remove')).toEqual([]);
    await userEvent.click(within(dlg).getByRole('button', { name: strings['chan.remove'] }));
    await waitFor(() => expect(sent('remove').map((x) => x.vars.channelId)).toEqual(['ch-tg']));
  });

  it('Cancel on the Remove question sends nothing', async () => {
    await apps();
    await userEvent.click((await rowOf('Team workspace')).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.remove']}`) }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(sent('remove')).toEqual([]);
  });
  it("a new Remove question starts clean: an earlier failure is not shown on it", async () => {
    await apps('channelChangeFailed');
    const ask = async () => {
      await userEvent.click((await rowOf('Team workspace')).getByRole('button', { name: 'Row actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['chan.remove']}`) }));
      return screen.findByRole('alertdialog');
    };
    const fresh = (await ask()).textContent;
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['chan.remove'] }));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).not.toBe(fresh));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: (n, el) => n === 'Close' && el.hasAttribute('data-dialog-close') }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((await ask()).textContent).toBe(fresh);
  });
});

describe('the Apps head', () => {
  it('Add a chat app is the primary and opens the add drawer', async () => {
    await apps();
    const head = await headOf(strings['chan.title']);
    await userEvent.click(head.getByRole('button', { name: strings['chan.add'] }));
    expect(await screen.findByRole('dialog', { name: fill(strings['chan.addTitle'], { name: 'Chief' }) })).toBeInTheDocument();
  });

  it('Pause all sends paused: true; its menu opens Settings for all chat apps', async () => {
    await apps();
    const head = await headOf(strings['chan.title']);
    await userEvent.click(head.getByRole('button', { name: strings['chan.pauseAll'] }));
    await waitFor(() => expect(W.sent.filter((x) => x.key === 'channelsPause').map((x) => x.vars.paused)).toEqual([true]));
    await userEvent.click(head.getByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['set.bot.open']}`) }));
    expect(await screen.findByRole('dialog', { name: strings['set.bot.title'] })).toBeInTheDocument();
  });

  it('while paused: Resume all sends paused: false', async () => {
    await apps('channelsPaused');
    await userEvent.click((await headOf(strings['chan.title'])).getByRole('button', { name: strings['chan.resumeAll'] }));
    await waitFor(() => expect(W.sent.filter((x) => x.key === 'channelsPause').map((x) => x.vars.paused)).toEqual([false]));
  });

  it('with no apps: Add a chat app only in the empty state, never twice', async () => {
    await apps('noChannels');
    await screen.findByText(strings['chan.empty']);
    expect(screen.getAllByRole('button', { name: strings['chan.add'] })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: strings['chan.pauseAll'] })).toBeNull();
  });
});
