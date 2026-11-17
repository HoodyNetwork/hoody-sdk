// Vitest: Launch an app's sections and Category filter, on the fixtures. Below FIND_MIN letters
// the pane shows what was opened recently on this computer, the coding agents, the programs ready to install by category, Install from
// GitHub and the footer line; the Category filter (kit FilterChips) keeps the sections it names. From FIND_MIN letters
// the results are grouped by where they come from and the category narrows them. A recent row's action runs through
// useApps' act: a held row offers only Check. The subtitle names the computer, and the folder of Launch an app here.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld, useCurrentComputer, type Target } from '@core';
import type { ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { harness } from './launch/harness';
import { FindPane } from './launch/FindPane';
import { RECENT_MAX } from './launch/RecentSection';
import { useApps } from './launch/useApps';
import { useHere } from './launch/AppLauncher';
import { FIND_MIN } from './logic';
import strings from './strings.en.json';

const fill = (key: keyof typeof strings, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), strings[key]);
const NAME = fixtureWorld.current.name;

let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };

function Pane({ variant = 'table', cwd }: { variant?: 'table' | 'list'; cwd?: string }) {
  const target = useCurrentComputer() as Target;
  const a = useHere(useApps({ target, nav: { select: () => undefined } }), cwd, target);
  return <FindPane a={a} target={target} variant={variant} cwd={cwd} />;
}

async function show(v: () => ReactNode = () => <Pane />, state?: string) {
  View = v;
  await renderPage(page, { path: '/apps', ...(state ? { state } : {}) });
  return screen.findByRole('heading', { name: strings['launch.hoody'] }, { timeout: 4000 });
}
const headings = () => screen.getAllByRole('heading').map((h) => h.textContent ?? '');
/** A table's body rows (its header row has column headers). */
const bodyRows = (el: HTMLElement) => within(el).getAllByRole('row').filter((r) => within(r).queryAllByRole('columnheader').length === 0);
const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
async function pick(option: keyof typeof strings) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['cat.label']) }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: new RegExp(strings[option]) }));
}

beforeEach(() => {
  fixtureStore.set({ state: null, latency: 'instant' });
});

describe('Launch an app: the sections below FIND_MIN letters', () => {
  it('shows recent, the coding agents, the programs ready to install, Install from GitHub and the footer, in that order; no lead or three ways', async () => {
    await show();
    await screen.findByRole('heading', { name: fill('launch.recent', { computer: NAME }) });
    const order = [fill('launch.recent', { computer: NAME }), strings['agents.tab'], strings['launch.hoody'], strings['launch.github'], strings['launch.more']];
    expect(headings().filter((h) => order.includes(h))).toEqual(order);
    expect(screen.getByText(strings['launch.footer'])).toBeInTheDocument();
    expect(screen.getByText(fill('launch.subtitle', { computer: NAME }))).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: strings['launch.mode.find'] })).toBeChecked();
    expect(screen.queryByRole('radio', { name: strings['agents.tab'] })).toBeNull();
  });

  it('lists at most RECENT_MAX recent rows, newest first', async () => {
    await show();
    const recent = section(await screen.findByRole('heading', { name: fill('launch.recent', { computer: NAME }) }).then((h) => h.textContent ?? ''));
    const names = bodyRows(recent).map((r) => r.textContent ?? '');
    expect(names.length).toBeLessThanOrEqual(RECENT_MAX);
    // Firefox started 2 min ago, the VS Code start 20 s ago: both lead the list.
    expect(names[0]).toContain('VS Code');
    expect(names[1]).toContain('Firefox');
  });

  it('a held recent row offers only Check (through useApps), never Open', async () => {
    await show(undefined, 'held');
    const recent = section(fill('launch.recent', { computer: NAME }));
    const jl = bodyRows(recent).find((r) => r.textContent?.includes('JupyterLab'));
    expect(jl).toBeDefined();
    expect(within(jl!).getByRole('button', { name: strings['act.check'] })).toBeInTheDocument();
    expect(within(jl!).queryByRole('button', { name: strings['act.open'] })).toBeNull();
    expect(within(jl!).queryByRole('link', { name: new RegExp(strings['act.open']) })).toBeNull();
  });

  it('Choose a repository switches to From GitHub', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: strings['launch.github.action'] }));
    expect(screen.getByRole('radio', { name: strings['gh.tab'] })).toBeChecked();
    expect(screen.queryByRole('heading', { name: strings['launch.hoody'] })).toBeNull();
  });

  it('Launch an app here says the folder it runs in', async () => {
    await show(() => <Pane variant="list" cwd="/home/ada/shop" />);
    expect(screen.getByText(new RegExp(fill('launch.subtitleHere', { folder: '/home/ada/shop' }).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')))).toBeInTheDocument();
  });
});

describe('Launch an app: the Category filter', () => {
  it('is one kit filter chip whose options carry their description lines', async () => {
    await show();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(strings['cat.label']) }));
    for (const k of ['cat.installed', 'cat.agents', 'cat.graphics', 'cat.monitors'] as const) {
      const item = await screen.findByRole('menuitemradio', { name: new RegExp(strings[k]) });
      expect(item).toHaveAccessibleDescription(new RegExp(strings[`${k}.desc`]));
    }
  });

  it('a starter category keeps only its programs ready to install: no recent, no agents, no GitHub row', async () => {
    await show();
    await pick('cat.monitors');
    const apps = section(strings['launch.hoody']);
    await waitFor(() => expect(within(apps).queryByText('JupyterLab')).toBeNull());
    expect(within(apps).getByText('htop')).toBeInTheDocument();
    expect(within(apps).getByText('btop')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: strings['agents.tab'] })).toBeNull();
    expect(screen.queryByRole('heading', { name: fill('launch.recent', { computer: NAME }) })).toBeNull();
    expect(screen.queryByRole('heading', { name: strings['launch.github'] })).toBeNull();
  });

  it('Coding agents keeps only the agents', async () => {
    await show();
    await pick('cat.agents');
    await waitFor(() => expect(screen.queryByRole('heading', { name: strings['launch.hoody'] })).toBeNull());
    expect(screen.getByRole('heading', { name: strings['agents.tab'] })).toBeInTheDocument();
  });

  it('On this computer: recent, the installed agents only, and the type-more line; no programs ready to install', async () => {
    await show();
    await pick('cat.installed');
    expect(await screen.findByText(fill('launch.typeMore', { min: FIND_MIN, computer: NAME }))).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: strings['launch.hoody'] })).toBeNull();
    const agents = section(strings['agents.tab']);
    // The fixtures answer Claude Code installed; the others are not shown here.
    await waitFor(() => expect(within(agents).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Claude Code']));
  });
});

describe('Launch an app: from FIND_MIN letters', () => {
  it('groups the results by where they come from', async () => {
    await show();
    await userEvent.type(screen.getByRole('searchbox', { name: strings['launch.search'] }), 'jupyter');
    const table = await screen.findByRole('grid', { name: strings['tab.find'] }, { timeout: 4000 }).catch(() => screen.findByRole('table', { name: strings['tab.find'] }));
    await waitFor(() => expect(within(table).getAllByText(strings['cat.installed']).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(within(table).getAllByText(strings['src.catalogue']).length).toBeGreaterThan(0);
    expect(within(table).getByText(strings['launch.group.other'])).toBeInTheDocument();
  });

  it('typing an agent\'s name shows that agent only', async () => {
    await show();
    await userEvent.type(screen.getByRole('searchbox', { name: strings['launch.search'] }), 'claude');
    const agents = await screen.findByRole('heading', { name: strings['agents.tab'] });
    await waitFor(() => expect(within(agents.closest('section') as HTMLElement).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Claude Code']));
  });
});
