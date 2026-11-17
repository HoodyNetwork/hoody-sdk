// The Agents view reads the computer's agents once, shows them grouped with a lock on product-owned ones,
// opens an overview that says what each agent gets in words, and keeps "couldn't read" apart from "no agents".
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type * as KitMod from '@kit';
import type * as ModelMod from './Model';
import type { AgentSourceProps } from './Source';
import type { AgentToolsProps } from './Tools';
import { agentsOf } from './logic';
import type { AgentsRead } from './data';
import { AgentsView } from './AgentsView';
import { mount } from './routed';
import strings from './strings.en.json';

const W = vi.hoisted(() => ({ read: null as unknown as AgentsRead, enabled: [] as boolean[], computer: true, src: [] as AgentSourceProps[], tools: [] as AgentToolsProps[], mounts: 0, toolMounts: 0, key: "list:a", models: [] as string[] }));
vi.mock('./data', () => ({ useAgents: (on: boolean) => (W.enabled.push(on), W.read), agentsSource: { useQueryHash: () => W.key } }));
// The source editor is tested in Source.test.tsx; here only what the view hands it.
vi.mock('./Source', async () => {
  const { useEffect } = await import('react');
  return {
    AgentSource: (p: AgentSourceProps) => {
      W.src.push(p);
      useEffect(() => { W.mounts += 1; }, []);
      return <section aria-label={`source ${p.name}`}>{`${p.name}|${p.computer}|${String(p.paused)}`}</section>;
    },
  };
});
// The real model editor, with each mount recorded (the agent it mounted for), so a switch is seen to start a new one.
vi.mock('./Model', async (orig) => {
  const real = await orig<typeof ModelMod>();
  const { useState } = await import('react');
  return {
    ...real,
    AgentModel: (p: ModelMod.AgentModelProps) => {
      useState(() => W.models.push(p.agent.name));
      return <real.AgentModel {...p} />;
    },
  };
});
// The tools editor is tested on its own and on the page (AgentsView.tools.test.tsx); here only what the view hands it.
vi.mock('./Tools', async () => {
  const { useEffect } = await import('react');
  return {
  AgentTools: (p: AgentToolsProps) => {
    W.tools.push(p);
    useEffect(() => { W.toolMounts += 1; }, []);
    return <section aria-label={`tools ${p.name}`}>{`${p.name}|${p.computer}`}</section>;
  },
  };
});
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof KitMod>();
  return { ...real, useShellData: () => ({ ...real.useShellData(), computers: [{ id: 'c-other', name: 'other' }, { id: 'c-atlas', name: 'atlas' }] }) };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, useCurrentComputer: () => (W.computer ? { project: { id: 'p-atlas' }, container: { id: 'c-atlas' } } : null) };
});

const BODY = {
  items: [
    { name: 'general', labels: ['core'], provenance: 'shipped default (embedded)', description: 'The everyday working agent', tools: ['read_file', 'bash', 'grep', 'skill'], is_configured_default: true },
    { name: 'bot', labels: ['core'], provenance: 'product-owned (read-only)', strict_tools: true, model: 'hoody-ai/hoody-free' },
    { name: 'reviewer', labels: ['coding'], provenance: 'user (shipped default)', path: '/home/ada/.hoody/agents/reviewer.md', skills: [], missing_vs_default: ['web_fetch'] },
    { name: 'shop-support', labels: ['core'], provenance: 'user', description: 'Answers shop questions', tools: [] },
    { name: 'narrow', labels: ['coding'], provenance: 'user', strict_tools: true, tools: ['read_file'], skills: ['deploy'] },
    { name: 'strict-skills', labels: ['coding'], provenance: 'user', strict_tools: true, skills: ['deploy'] },
    { name: 'skilled', labels: ['coding'], provenance: 'user', tools: ['read_file', 'skill'], skills: [] },
  ],
};
const ok = (over: Partial<AgentsRead> = {}): AgentsRead => ({ rows: agentsOf(BODY) ?? [], pending: false, failed: false, retrying: false, error: null, retry: vi.fn(), ...over });

beforeEach(() => {
  W.read = ok();
  W.enabled = [];
  W.computer = true;
  W.src = [];
  W.tools = [];
  W.mounts = 0;
  W.toolMounts = 0;
  W.key = 'list:a';
  W.models = [];
});

const index = () => screen.getByRole('table', { name: strings['list.label'] });
const rowOf = (name: RegExp) => within(index()).getByRole('row', { name });
// The table's body in order: a group head's name, then each agent's name (the first cell's text).
const order = () =>
  Array.from(index().querySelectorAll('tbody tr')).map((tr) => {
    const head = tr.querySelector('button[aria-expanded] span:nth-of-type(1)');
    return head && tr.querySelector('td[colspan]') ? `# ${head.textContent}` : (tr.querySelector('bdi')?.textContent ?? '');
  });
const loss = (name: string) => strings['held.loss'].replace('{{name}}', name);

describe('AgentsView', () => {
  it('groups the index Core, Coding, Yours; your own file sits under Yours, not under its label', async () => {
    await mount(<AgentsView />);
    expect(order()).toEqual(['# Core', 'bot', 'general', '# Coding', 'reviewer', '# Yours', 'narrow', 'shop-support', 'skilled', 'strict-skills']);
  });

  it('a product-owned agent carries the lock and says so; tool counts read as words, with a tip for the ones that are not counts', async () => {
    await mount(<AgentsView />);
    const bot = rowOf(/bot/);
    expect(within(bot).getByRole('button', { name: new RegExp(strings['list.locked']) })).toBeTruthy();
    expect(bot.textContent).toContain(strings['tools.cell.default']);
    expect(within(bot).getByRole('button', { name: new RegExp(strings['tools.cell.default']) })).toBeTruthy();
    expect(rowOf(/general/).textContent).toContain('4 tools');
    expect(rowOf(/shop-support/).textContent).toContain(strings['tools.none']);
    expect(rowOf(/reviewer/).textContent).toContain(strings['tools.cell.every']);
  });

  it('the Default tag is a plain word (no tip) and the Where tag is a word; a model-less agent says it uses the chat\'s model', async () => {
    await mount(<AgentsView />);
    expect(within(rowOf(/general/)).getByText(strings['list.default']).closest('button')).toBeNull();
    expect(within(rowOf(/bot/)).getByText(strings['prov.owned'])).toBeTruthy();
    expect(within(rowOf(/bot/)).getByText('hoody-ai/hoody-free')).toBeTruthy();
    expect(within(rowOf(/reviewer/)).getByText(strings['list.sameModel'])).toBeTruthy();
  });

  it('search finds an agent by name or by what it does; the Where filter lists all five places', async () => {
    await mount(<AgentsView />);
    await userEvent.type(screen.getByPlaceholderText(strings['list.search']), 'shop');
    expect(order()).toEqual(['# Yours', 'shop-support']);
    await userEvent.clear(screen.getByPlaceholderText(strings['list.search']));
    await userEvent.type(screen.getByPlaceholderText(strings['list.search']), 'everyday');
    expect(order()).toEqual(['# Core', 'general']);
    await userEvent.clear(screen.getByPlaceholderText(strings['list.search']));
    await userEvent.click(within(screen.getByRole('group', { name: 'Filters' })).getByRole('button', { name: new RegExp(strings['list.whereFilter']) }));
    for (const k of ['prov.user', 'prov.project', 'prov.userShipped', 'prov.embedded', 'prov.owned'] as const) {
      expect(screen.getByRole('menuitemradio', { name: strings[k] }), k).toBeTruthy();
    }
  });

  it('with nothing chosen the list has the whole width: no detail pane, no hint paragraph', async () => {
    await mount(<AgentsView />);
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByText(/Choose an agent/)).toBeNull();
  });

  it('choosing an agent opens its overview with provenance and what it gets', async () => {
    await mount(<AgentsView />);
    await userEvent.click(rowOf(/reviewer/));
    const ov = screen.getByRole('article', { name: /reviewer/ });
    // The place is the row's tag and the detail header's (the overview holds the facts below them).
    expect(screen.getAllByText('Shipped copy')).toHaveLength(2);
    expect(within(ov).getByText(strings['ov.modelInherits'])).toBeTruthy();
    expect(within(ov).getByText(strings['tools.every'])).toBeTruthy();
    expect(within(ov).getByText(strings['ov.skillsDepend'])).toBeTruthy(); // skills: [] but no reported tool list
    expect(within(ov).getByText('/home/ada/.hoody/agents/reviewer.md')).toBeTruthy();
    expect(within(ov).getByText(/Tools the shipped reviewer has and this file does not: web_fetch/)).toBeTruthy();
    expect(rowOf(/reviewer/).getAttribute('aria-selected')).toBe('true');
  });

  it('another agent gets its own model editor (keyed like tools and source): nothing of the last one carries over', async () => {
    await mount(<AgentsView />);
    await userEvent.click(rowOf(/reviewer/));
    expect([...new Set(W.models)]).toEqual(['reviewer']);
    await userEvent.click(rowOf(/narrow/));
    screen.getByRole('article', { name: /narrow/ });
    // A new mount for narrow (the reviewer's editor, its chooser, send and outcome, is gone).
    expect([...new Set(W.models)]).toEqual(['reviewer', 'narrow']);
  });

  it('another agent shows exactly one overview, that agent\'s: the last one\'s never stays above it', async () => {
    await mount(<AgentsView />);
    const tools = () => screen.getAllByRole('region', { name: /^tools / }).map((r) => r.getAttribute('aria-label'));
    await userEvent.click(rowOf(/general/));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['general']);
    expect(tools()).toEqual(['tools general']);
    await userEvent.click(rowOf(/narrow/));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['narrow']);
    expect(tools()).toEqual(['tools narrow']);
    expect(screen.queryByText(strings['ov.default'])).toBeNull();
    await userEvent.click(rowOf(/reviewer/));
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['reviewer']);
    expect(tools()).toEqual(['tools reviewer']);
  });

  it('a product-owned overview says it is read-only except its model; strict without lists = default tools, no MCP', async () => {
    await mount(<AgentsView />);
    await userEvent.click(rowOf(/bot/));
    const ov = screen.getByRole('article', { name: /bot/ });
    expect(within(ov).getByText(strings['ov.owned'])).toBeTruthy();
    expect(within(ov).getByText(strings['tools.default'])).toBeTruthy();
    expect(within(ov).getByText(strings['tools.strict'])).toBeTruthy();
    expect(within(ov).getByText(strings['ov.mcpNone'])).toBeTruthy();
    expect(within(ov).getByText('hoody-ai/hoody-free')).toBeTruthy();
  });

  it('the configured default says new chats start on it', async () => {
    await mount(<AgentsView selected="general" />);
    expect(within(screen.getByRole('article', { name: /general/ })).getByText(strings['ov.default'])).toBeTruthy();
  });

  it('a tool list without the skill tool never shows the skills it names', async () => {
    await mount(<AgentsView selected="narrow" />);
    const ov = within(screen.getByRole('article', { name: /narrow/ }));
    expect(ov.getByText(strings['ov.skillsDepend'])).toBeTruthy();
    expect(ov.queryByText('deploy')).toBeNull();
  });

  it('a chosen agent no longer in the list says so instead of showing another', async () => {
    await mount(<AgentsView selected="gone-agent" />);
    expect(screen.getByText(/gone-agent/).textContent).toContain('is no longer in the list');
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('a failed read shows Try again (never "no agents"); Try again reads again', async () => {
    const retry = vi.fn();
    W.read = ok({ rows: undefined, failed: true, retry });
    await mount(<AgentsView />);
    expect(screen.queryByText(strings['state.empty'])).toBeNull();
    expect(screen.getByText(strings['state.failed'])).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('a failed refresh over an earlier empty answer shows Try again, never "no agents"', async () => {
    W.read = ok({ rows: [], failed: true });
    await mount(<AgentsView />);
    expect(screen.queryByText(strings['state.empty'])).toBeNull();
    expect(screen.getByText(strings['state.failed'])).toBeTruthy();
  });

  it('a failed refresh over an earlier empty answer never says the open agent is gone: the list read failed, so it is unknown (C9)', async () => {
    W.read = ok({ rows: [], failed: true });
    await mount(<AgentsView selected="general" />);
    expect(screen.queryByText(strings['state.gone'].replace('{{name}}', 'general'))).toBeNull();
    expect(screen.getByText(strings['state.failed'])).toBeTruthy();
  });

  it('a failed refresh over earlier rows keeps them under a warning that they are the last list read; Try again reads again', async () => {
    const retry = vi.fn();
    W.read = ok({ failed: true, retry });
    await mount(<AgentsView selected="general" />);
    expect(screen.getByRole('alert').textContent).toContain(strings['state.stale']);
    expect(screen.queryByText(strings['state.failed'])).toBeNull();
    expect(index()).toBeTruthy();
    expect(screen.getByRole('article', { name: /general/ })).toBeTruthy();
    // The editors stay mounted (their drafts and leave checks with them); the tools editor is told the page shows the band.
    expect(screen.getByRole('region', { name: 'tools general' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'source general' })).toBeTruthy();
    expect(W.tools[W.tools.length - 1]!.staleShown).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: strings['state.retry'] }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('while the list is read again, the warning\'s Try again is disabled (as the error state\'s)', async () => {
    W.read = ok({ failed: true, retrying: true });
    await mount(<AgentsView />);
    expect(screen.getByRole('button', { name: strings['state.retry'] })).toBeDisabled();
  });

  it('rows of another read (another computer, realm or account) never show under this read\'s failure: the error state', async () => {
    const { rerender } = await mount(<AgentsView selected="general" />);
    expect(index()).toBeTruthy();
    W.key = 'list:b';
    W.read = ok({ rows: undefined, failed: true });
    await rerender(<AgentsView selected="general" />);
    expect(screen.getByText(strings['state.failed'])).toBeTruthy();
    expect(screen.queryByRole('table', { name: strings['list.label'] })).toBeNull();
    expect(screen.queryByText(strings['state.stale'])).toBeNull();
  });

  it('an agent held open past its list read is not kept for another read (its rows missing the agent): the gone note', async () => {
    const { rerender } = await mount(<AgentsView selected="general" />);
    act(() => { W.src[W.src.length - 1]!.onHeldChange!(true); });
    const without = (agentsOf(BODY) ?? []).filter((r) => r.name !== 'general');
    W.read = ok({ rows: without });
    await rerender(<AgentsView selected="general" />);
    expect(screen.getByText(strings['state.goneKept'])).toBeTruthy();
    W.key = 'list:b';
    await rerender(<AgentsView selected="general" />);
    expect(screen.queryByText(strings['state.goneKept'])).toBeNull();
    expect(screen.queryByRole('region', { name: 'source general' })).toBeNull();
    expect(screen.getByText(strings['state.gone'].replace('{{name}}', 'general'))).toBeTruthy();
  });

  it('while either editor holds something, a realm switch or sign-out names it; nothing once neither holds', async () => {
    const { switchLosses } = await import('@core');
    await mount(<AgentsView selected="general" />);
    expect(switchLosses()).not.toContain(loss('general'));
    act(() => { W.tools[W.tools.length - 1]!.onHeldChange!(true); });
    expect(switchLosses()).toContain(loss('general'));
    act(() => { W.src[W.src.length - 1]!.onHeldChange!(true); });
    act(() => { W.tools[W.tools.length - 1]!.onHeldChange!(false); });
    expect(switchLosses()).toContain(loss('general'));
    act(() => { W.src[W.src.length - 1]!.onHeldChange!(false); });
    expect(switchLosses()).not.toContain(loss('general'));
  });

  it('another list read identity (account, realm, generation or computer) gives both editors fresh ones: no old draft carries', async () => {
    const { rerender } = await mount(<AgentsView selected="general" />);
    const mounts = W.mounts;
    const toolMounts = W.toolMounts;
    W.key = 'list:other-account';
    await rerender(<AgentsView selected="general" />);
    expect(W.mounts).toBe(mounts + 1);
    // a new mount, not a rerender of the old one (which would keep its draft)
    expect(W.toolMounts).toBe(toolMounts + 1);
  });

  it('skills show only when the reported tool list names the skill tool: absent skills = every enabled skill in chats', async () => {
    await mount(<AgentsView selected="general" />);
    expect(within(screen.getByRole('article', { name: /general/ })).getByText(strings['ov.skillsEvery'])).toBeTruthy();
  });

  it('skills [] with the skill tool reads None', async () => {
    await mount(<AgentsView selected="skilled" />);
    expect(within(screen.getByRole('article', { name: /skilled/ })).getByText(strings['ov.skillsNone'])).toBeTruthy();
  });

  it('a tool list the agent does not report (absent, strict or not, skills listed or not) never shows skills', async () => {
    for (const name of ['bot', 'reviewer', 'strict-skills']) {
      const { unmount } = await mount(<AgentsView selected={name} />);
      const ov = within(screen.getByRole('article', { name: new RegExp(name) }));
      expect(ov.getByText(strings['ov.skillsDepend']), name).toBeTruthy();
      expect(ov.queryByText('deploy')).toBeNull();
      unmount();
    }
  });

  it('while reading: busy, no rows and no empty state', async () => {
    W.read = ok({ rows: undefined, pending: true });
    await mount(<AgentsView />);
    expect(screen.queryByRole('table', { name: strings['list.label'] })?.querySelectorAll('tbody tr[data-row-id]').length ?? 0).toBe(0);
    expect(screen.queryByText(strings['state.empty'])).toBeNull();
  });

  it('an answered empty list is "no agents"', async () => {
    W.read = ok({ rows: [] });
    await mount(<AgentsView />);
    expect(screen.getByText(strings['state.empty'])).toBeTruthy();
  });

  it('reads nothing while no computer is chosen', async () => {
    W.computer = false;
    W.read = ok({ rows: undefined });
    await mount(<AgentsView />);
    expect(W.enabled.every((on) => on === false)).toBe(true);
  });
});

describe('the file of the agent, below its overview', () => {
  const last = () => W.src[W.src.length - 1]!;
  const pick = async (name: RegExp) => userEvent.click(rowOf(name));

  it('opening an agent shows its source with the name and the top bar computer\'s name; none before a choice', async () => {
    await mount(<AgentsView />);
    expect(screen.queryByRole('region', { name: /^source / })).toBeNull();
    await pick(/reviewer/);
    expect(screen.getByRole('region', { name: 'source reviewer' }).textContent).toBe('reviewer|atlas|false');
  });

  it('another agent gets a fresh editor (remounted), never the last one\'s draft', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    const before = W.mounts;
    await pick(/general/);
    expect(screen.getByRole('region', { name: 'source general' })).toBeTruthy();
    expect(W.mounts).toBe(before + 1);
  });

  it('the host\'s paused reading reaches the editor; unknown is not paused', async () => {
    await mount(<AgentsView selected="reviewer" paused />);
    expect(last().paused).toBe(true);
  });

  it('a delete goes back to the choice and re-reads the list; a host that owns the choice is told instead', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    act(() => last().onDeleted!());
    expect(W.read.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('article', { name: /reviewer/ })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    const host = vi.fn();
    await mount(<AgentsView selected="general" onDeleted={host} />);
    act(() => last().onDeleted!());
    expect(host).toHaveBeenCalledTimes(1);
    expect(W.read.retry).toHaveBeenCalledTimes(2);
  });

  it('Reset to shipped re-reads the list', async () => {
    await mount(<AgentsView selected="general" />);
    act(() => last().onReset!());
    expect(W.read.retry).toHaveBeenCalledTimes(1);
  });
});

describe('the tools of the agent, between its overview and its file', () => {
  const pick = async (name: RegExp) => userEvent.click(rowOf(name));

  it('opening an agent hands its tools the name and the top bar computer\'s name, with a way to the file; none before a choice', async () => {
    await mount(<AgentsView />);
    expect(screen.queryByRole('region', { name: /^tools / })).toBeNull();
    await pick(/reviewer/);
    expect(screen.getByRole('region', { name: 'tools reviewer' }).textContent).toBe('reviewer|atlas');
    expect(typeof W.tools[W.tools.length - 1]!.onShowSource).toBe('function');
  });

  it('the view owns the route guard: both editors get its leave check and no guard of their own, whoever owns the choice', async () => {
    await mount(<AgentsView />);
    await pick(/reviewer/);
    expect(W.tools[W.tools.length - 1]!.leaveRef).toBeTruthy();
    expect(W.tools[W.tools.length - 1]!.hostGuard).toBe(true);
    expect(W.src[W.src.length - 1]!.leaveRef).toBeTruthy();
    expect(W.src[W.src.length - 1]!.hostGuard).toBe(true);
    await mount(<AgentsView selected="general" />);
    expect(W.tools[W.tools.length - 1]!.leaveRef).toBeTruthy();
    expect(W.tools[W.tools.length - 1]!.hostGuard).toBe(true);
    expect(W.src[W.src.length - 1]!.hostGuard).toBe(true);
  });

  it('the file\'s leave dialog names the unsaved ticks only while the tools hold some (alsoLost)', async () => {
    await mount(<AgentsView selected="general" />);
    expect(W.src[W.src.length - 1]!.alsoLost).toBeUndefined();
    act(() => { W.tools[W.tools.length - 1]!.onHeldChange!(true); });
    expect(W.src[W.src.length - 1]!.alsoLost).toBe(strings['leave.alsoTicks'].replace('{{name}}', 'general'));
    act(() => { W.tools[W.tools.length - 1]!.onHeldChange!(false); });
    expect(W.src[W.src.length - 1]!.alsoLost).toBeUndefined();
  });
});

// A cell's words are plain row text that opens the agent; what a value means is on an
// info icon of its own beside it, a separate focus stop named for its cell, which opens only its tip.
describe('Agents list: the words open the agent, the icon opens the tip', () => {
  // The kit InfoTip names its icon "About <subject>" (kit/overlays/InfoTip.strings.en.json info.about).
  const about = (column: string, value: string) => `About ${strings['list.cellTip'].replace('{{column}}', column).replace('{{value}}', value)}`;
  const tip = () => screen.queryByRole('dialog');

  it('a click on each tipped value\'s words (Tools, Model, Where) opens the agent, no tip', async () => {
    for (const [name, word] of [
      [/reviewer/, strings['tools.cell.every']],
      [/reviewer/, strings['list.sameModel']],
      [/reviewer/, strings['prov.userShipped']],
    ] as const) {
      const view = await mount(<AgentsView />);
      const row = rowOf(name);
      // The words are no button: nothing between them and the row.
      const words = within(row).getByText(word);
      expect(words.closest('button')).toBeNull();
      await userEvent.click(words);
      expect(rowOf(name).getAttribute('aria-selected')).toBe('true');
      expect(screen.getByRole('article', { name })).toBeTruthy();
      expect(tip()).toBeNull();
      view.unmount();
    }
  });

  it('a click on the icon opens only its tip: the agent stays closed', async () => {
    await mount(<AgentsView />);
    const icon = within(rowOf(/reviewer/)).getByRole('button', { name: about(strings['col.tools'], strings['tools.cell.every']) });
    await userEvent.click(icon);
    expect(tip()?.textContent).toContain(strings['tools.tip.every']);
    expect(rowOf(/reviewer/).getAttribute('aria-selected')).not.toBe('true');
    expect(screen.queryByRole('article', { name: /reviewer/ })).toBeNull();
  });

  it('the icon is its own focus stop; Enter on it opens only its tip', async () => {
    await mount(<AgentsView />);
    const icon = within(rowOf(/reviewer/)).getByRole('button', { name: about(strings['col.where'], strings['prov.userShipped']) });
    act(() => icon.focus());
    expect(document.activeElement).toBe(icon);
    await userEvent.keyboard('{Enter}');
    expect(tip()?.textContent).toContain(strings['prov.tip.userShipped']);
    expect(rowOf(/reviewer/).getAttribute('aria-selected')).not.toBe('true');
    expect(screen.queryByRole('article', { name: /reviewer/ })).toBeNull();
  });

  it('every tipped cell names its icon for the column and the value', async () => {
    await mount(<AgentsView />);
    const names = within(rowOf(/reviewer/)).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(expect.arrayContaining([
      about(strings['col.tools'], strings['tools.cell.every']),
      about(strings['col.model'], strings['list.sameModel']),
      about(strings['col.where'], strings['prov.userShipped']),
    ]));
  });

  it('a click on the Default tag opens the agent (no tip there), and its Overview says it is the default', async () => {
    await mount(<AgentsView />);
    const word = within(rowOf(/general/)).getByText(strings['list.default']);
    // A plain Tag: no button and no tip of its own between the word and the row.
    expect(word.closest('button')).toBeNull();
    await userEvent.click(word);
    expect(rowOf(/general/).getAttribute('aria-selected')).toBe('true');
    expect(tip()).toBeNull();
    expect(within(screen.getByRole('article', { name: /general/ })).getByText(strings['ov.default'])).toBeTruthy();
  });
});

describe('New chat with this agent', () => {
  it('the detail offers New chat with this agent, a link to /ai/new?agent=<name>', async () => {
    await mount(<AgentsView selected="reviewer" />);
    const link = screen.queryByRole('link', { name: strings['detail.newChat'] });
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toMatch(/\/ai\/new\?agent=reviewer$/);
  });

  it('a product-owned agent, which New chat never offers, has no such link', async () => {
    await mount(<AgentsView selected="bot" />);
    expect(screen.getByRole('article', { name: /bot/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: strings['detail.newChat'] })).toBeNull();
  });
});
