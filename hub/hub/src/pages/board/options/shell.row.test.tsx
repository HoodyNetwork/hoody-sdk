// A terminal's Options show what it runs (a sessions read) and Change, which opens the tile's Change
// shell dialog. The row sends nothing and is not part of the draft or Save; other programs have no Shell row.
import { answers, boardFixtureRoute, bootFixtureCore, fixtureWorld, reply, type FixtureAnswer } from '@core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import type { Catalog } from '../embed/catalog';
import catalog from '../embed/catalog.ui.json';
import { SESSIONS_PATH } from '../termSessions';
import { commit, current, reserve, resetShellChanges } from '../parts/shellChanges';
import { OptionsPanel } from './index';

const CAT = catalog as unknown as Catalog;
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const computer = { id: atlas.id, name: atlas.name, project_id: atlas.project_id, server_name: atlas.server_name, status: 'running' } as BoardComputer;
const sess = (o: Record<string, unknown>) => ({ terminal_id: '3', shell: 'zsh', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 1, ...o });
const sent: string[] = [];
let sessions: () => FixtureAnswer | Promise<FixtureAnswer> = () => answers.ok([sess({})]);

beforeEach(() => {
  resetShellChanges();
  sent.length = 0;
  sessions = () => answers.ok([sess({})]);
  bootFixtureCore({
    rules: [
      reply(boardFixtureRoute('terminal', 'GET', SESSIONS_PATH), () => { sent.push('GET'); return sessions(); }),
      reply(boardFixtureRoute('terminal', 'DELETE', '/api/v1/terminal/3'), () => { sent.push('DELETE'); return answers.ok({}); }),
      reply(boardFixtureRoute('terminal', 'POST', '/api/v1/terminal/create'), () => { sent.push('POST'); return answers.ok({}); }),
    ],
  });
});
afterEach(() => { cleanup(); });

const panel = (program: 'terminal' | 'files', onChange: (() => void) | null = vi.fn(), onSave = vi.fn()) =>
  render(<OptionsPanel isOpen onOpenChange={() => undefined} cat={CAT} program={program} tileName={`${program}-3`} computerName="atlas" running onSave={onSave} shell={{ target: { computer, session: 3, name: 'terminal-3' }, onChange }} />);

describe('Options: the Shell row of a terminal', () => {
  it('shows what terminal-3 runs; Change opens the change dialog and sends nothing itself', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    panel('terminal', onChange);
    const row = await vi.waitFor(() => { const r = document.querySelector('[data-opt="shell"]') as HTMLElement; expect(within(r).getByText('zsh')).toBeTruthy(); return r; });
    await user.click(within(row).getByRole('button', { name: 'Change the shell of terminal-3' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sent).toEqual(['GET']);
  });

  it('an ssh session says where it goes', async () => {
    sessions = () => answers.ok([sess({ shell: null, ssh_host: 'db.example.com', ssh_user: 'deploy', ssh_port: 2222 })]);
    panel('terminal');
    expect(await screen.findByText('ssh to deploy@db.example.com:2222')).toBeTruthy();
  });

  it('a program\'s own terminal has no Change', async () => {
    sessions = () => answers.ok([sess({ shell: null, daemon_program: true })]);
    panel('terminal');
    expect(await screen.findByText("A program's own terminal")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change the shell/ })).toBeNull();
  });

  it('an ssh tile (onChange null): the row shows where it goes, no Change', async () => {
    sessions = () => answers.ok([sess({ shell: null, ssh_host: 'db.example.com', ssh_user: 'deploy' })]);
    panel('terminal', null);
    expect(await screen.findByText('ssh to deploy@db.example.com')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change the shell/ })).toBeNull();
  });

  it('says Reading… until the read answers', async () => {
    let answer: (a: FixtureAnswer) => void = () => undefined;
    sessions = () => new Promise<FixtureAnswer>((r) => { answer = r; });
    panel('terminal');
    expect(await screen.findByText('Reading…')).toBeTruthy();
    await act(async () => { answer(answers.ok([sess({})])); });
    expect(await screen.findByText('zsh')).toBeTruthy();
  });

  it('a failed read says so (never Reading… forever); Read again reads, and only reads', async () => {
    const user = userEvent.setup();
    sessions = () => answers.refused(500, 'INTERNAL_ERROR');
    panel('terminal');
    expect(await screen.findByText('Could not read what it runs')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change the shell of terminal-3' })).toBeTruthy();
    sessions = () => answers.ok([sess({ shell: 'fish' })]);
    await user.click(screen.getByRole('button', { name: 'Read again' }));
    expect(await screen.findByText('fish')).toBeTruthy();
    expect(sent).toEqual(['GET', 'GET']);
  });

  it('reads again when a change of terminal-3 starts and when it settles: never keeps a shell that is gone', async () => {
    panel('terminal');
    expect(await screen.findByText('zsh')).toBeTruthy();
    const k = computer.id + '/3';
    act(() => { reserve(k, { phase: 'reading', before: null, shell: 'fish' }); });
    expect(await screen.findByText('A shell change is open: see its dialog')).toBeTruthy();
    sessions = () => answers.ok([sess({ shell: 'fish' })]);
    act(() => { commit(k, current(k), null, true); });
    expect(await screen.findByText('fish')).toBeTruthy();
    expect(sent.filter((x) => x === 'GET').length).toBeGreaterThanOrEqual(3);
  });

  it('Change works from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    panel('terminal', onChange);
    const b = await screen.findByRole('button', { name: 'Change the shell of terminal-3' });
    b.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('not listed yet: says so, Change stays (the dialog starts it)', async () => {
    sessions = () => answers.ok([]);
    panel('terminal');
    expect(await screen.findByText('terminal-3 is not running yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change the shell of terminal-3' })).toBeTruthy();
  });

  it('other programs: no Shell row', () => {
    panel('files');
    expect(document.querySelector('[data-opt="shell"]')).toBeNull();
  });
});
