// Vitest: Guide Tools, Put on Board on the program cards and the More programs card. With a Board this
// load serves and a computer whose addresses build, Agent, Terminal, Display, Files and Browser each offer "Put <program>
// on Board", and the More programs card offers "Put Code on Board" and "Put SQLite on Board" as text buttons; each opens
// the Board's Add link for that program on this computer; the Board and Bots cards never do; without a served Board (or
// only the classic one), without a computer, or with one whose addresses cannot be built, none shows. After a switch to
// another computer, the button adds that computer's program.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { setTarget } from '@core/ctx';
import { cleanup } from '@testing-library/react';
import page from './page';
import strings from './strings.en.json';

const hidden = vi.hoisted(() => new Set<string>());
const classic = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePageLink: (id: string) => (hidden.has(id) ? null : classic.has(id) ? { kind: 'classic', href: `/auth/${id}` } : { kind: 'hub', href: `/${id}` }),
  usePageVisible: (id: string) => !hidden.has(id) && !classic.has(id),
}));
afterEach(() => { hidden.clear(); classic.clear(); });

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const cedar = fixtureWorld.computers.find((c) => c.name === 'cedar')!;
const PROGRAMS = ['agent', 'terminal', 'screen', 'files', 'browser'] as const;
const tools = () => screen.findByRole('region', { name: strings['tools.title'] });
const puts = (r: HTMLElement) => within(r).queryAllByRole('button', { name: /^Put .* on Board$/ });
const MORE = [['code', 'code-1'], ['sqlite', 'sqlite-1']] as const;
const moreCard = (r: HTMLElement) => within(r).getByText(strings['tool.moreBody']).parentElement as HTMLElement;

describe('guide Tools: Put on Board on the program cards', () => {
  it('each program card offers Put <program> on Board; the Board and Bots cards do not', async () => {
    await renderPage(page, { path: '/guide#tools' });
    // The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
    const r = await screen.findByRole('region', { name: strings['tools.title'] }, { timeout: 30_000 });
    for (const p of PROGRAMS) {
      const card = within(r).getByText(strings[`tool.${p}`]).parentElement as HTMLElement;
      expect(await within(card).findByRole('button', { name: `Put ${strings[`program.${p}`]} on Board` })).toBeInTheDocument();
    }
    for (const id of ['tool.board', 'tool.bots'] as const) {
      const card = within(r).getByText(strings[id]).parentElement as HTMLElement;
      expect(puts(card)).toHaveLength(0);
    }
    expect(puts(r)).toHaveLength(PROGRAMS.length + MORE.length);
  }, 45_000);

  it('the More programs card offers Put Code on Board and Put SQLite on Board, each naming its program as text', async () => {
    await renderPage(page, { path: '/guide#tools' });
    const card = moreCard(await tools());
    for (const [p] of MORE) {
      const b = await within(card).findByRole('button', { name: `Put ${strings[`program.${p}`]} on Board` });
      expect(b).toHaveTextContent(`Put ${strings[`program.${p}`]} on Board`);
    }
    expect(puts(card)).toHaveLength(MORE.length);
  });

  for (const [p, add] of MORE) {
    it(`More programs: Put ${p} on Board opens the Board adding ${add} of this computer`, async () => {
      const user = userEvent.setup();
      const v = await renderPage(page, { path: '/guide#tools' });
      await user.click(await within(moreCard(await tools())).findByRole('button', { name: `Put ${strings[`program.${p}`]} on Board` }));
      await waitFor(() => expect(v.router.state.location.pathname).toBe('/board'));
      const q = new URLSearchParams(v.router.state.location.searchStr);
      expect(q.get('add')).toBe(add);
      expect(q.get('cid')).toBe(atlas.id);
    });
  }

  const goes: Array<[(typeof PROGRAMS)[number], string]> = [['terminal', 'terminal-1'], ['screen', 'display-1'], ['files', 'files-1'], ['agent', 'agent-1'], ['browser', 'browser-1']];
  for (const [p, add] of goes) {
    it(`Put ${p} on Board opens the Board adding ${add} of this computer`, async () => {
      const user = userEvent.setup();
      const v = await renderPage(page, { path: '/guide#tools' });
      const r = await tools();
      await user.click(await within(r).findByRole('button', { name: `Put ${strings[`program.${p}`]} on Board` }));
      await waitFor(() => expect(v.router.state.location.pathname).toBe('/board'));
      const q = new URLSearchParams(v.router.state.location.searchStr);
      expect(q.get('add')).toBe(add);
      expect(q.get('cid')).toBe(atlas.id);
    });
  }

  it('after a switch to another computer, Put on Board adds the program of that computer', async () => {
    const user = userEvent.setup();
    const v = await renderPage(page, { path: '/guide#tools' });
    await tools();
    act(() => setTarget({ project: { id: cedar.project_id }, container: { id: cedar.id } }));
    await screen.findByText(strings['tools.lede'].replace('{{computer}}', cedar.name));
    await user.click(await within(await tools()).findByRole('button', { name: `Put ${strings['program.terminal']} on Board` }));
    await waitFor(() => expect(v.router.state.location.pathname).toBe('/board'));
    const q = new URLSearchParams(v.router.state.location.searchStr);
    expect(q.get('add')).toBe('terminal-1');
    expect(q.get('cid')).toBe(cedar.id);
  });

  it('no Board served, or only the classic one: no Put on Board', async () => {
    hidden.add('board');
    await renderPage(page, { path: '/guide#tools' });
    await screen.findByText(strings['links.http']);
    expect(puts(await tools())).toHaveLength(0);
    cleanup();
    hidden.clear();
    classic.add('board');
    await renderPage(page, { path: '/guide#tools' });
    await screen.findByText(strings['links.http']);
    expect(puts(await tools())).toHaveLength(0);
  });

  it('no computer, or one whose addresses cannot be built: no Put on Board', async () => {
    await renderPage(page, { path: '/guide#tools', state: 'noComputer', computer: false });
    await screen.findByText(strings['links.none']);
    expect(puts(await tools())).toHaveLength(0);
    cleanup();
    await renderPage(page, { path: '/guide#tools', state: 'badNode', computer: false });
    await screen.findByText(strings['links.noAddress']);
    expect(puts(await tools())).toHaveLength(0);
  });
});
