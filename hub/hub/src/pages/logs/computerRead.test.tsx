// Vitest: Logs never reads an unknown computer list as "none" (the shell's computersRead: 'loading' | 'unknown',
// absent once rows came or a whole list answered zero). With no computer chosen: loading → the page waits; unknown
// → the read failed, with the shell's Try again; only a known list leaves "pick a computer". The toolbar's computer
// control is the kit ComputerPicker: more than one known computer → it lists them; a list still loading → its trigger
// says so (disabled); a list not read → its trigger says so and its panel offers the shell's Try again; never hidden
// as if there were no other computer; a known list of one or none → nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, userEvent, within } from '@app/testing';
import type { ShellData } from '@kit';
import { liveComputer } from './data';
import { ComputerPick } from './parts/ComputerPick';

const target = { project: { id: 'p1' }, container: { id: 'c0000000000000000000a001' } };
const row = (id: string, name: string, running = true) => ({ id, name, running });
const shell = (o: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'r1', computers: [], ...o });

describe('Logs: the computer the page shows', () => {
  it('no computer chosen while the list is loading: the page waits, never "pick a computer"', () => {
    const r = liveComputer(null, shell({ computersRead: 'loading' }));
    expect(r.isPending).toBe(true);
    expect(r.isError).toBe(false);
  });

  it('no computer chosen and the list could not be read: failed, and Try again is the shell\'s read', () => {
    const retryComputers = vi.fn();
    const r = liveComputer(null, shell({ computersRead: 'unknown', retryComputers }));
    expect(r.isError).toBe(true);
    expect(r.isPending).toBe(false);
    r.refetch();
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('no computer chosen from a known list: none ("pick a computer")', () => {
    for (const s of [shell({}), shell({ computers: [row('c1', 'alpha')] }), shell({ computers: [row('c1', 'alpha')], computersRead: 'loading' })]) {
      expect(liveComputer(null, s)).toMatchObject({ data: null, isPending: false, isError: false });
    }
  });

  it('a chosen computer is shown whatever the list knows: its row\'s name and state when listed', () => {
    expect(liveComputer(target, shell({ computers: [row(target.container.id, 'alpha', false)] })).data).toEqual({ id: target.container.id, projectId: 'p1', name: 'alpha', running: false });
    expect(liveComputer(target, shell({ computersRead: 'unknown' }))).toMatchObject({ isError: false, isPending: false, data: { id: target.container.id, projectId: 'p1' } });
  });
});

describe('Logs: the toolbar\'s computer control (kit ComputerPicker)', () => {
  afterEach(cleanup);
  const t = (k: string) => ({ 'f.computer': 'Computer', 'pick.running': 'Running', 'pick.stopped': 'Stopped' } as Record<string, string>)[k] ?? k;
  const two = [row('c1', 'alpha'), row('c2', 'beta', false)];
  const trigger = () => screen.getByRole('button', { name: /^.+ Computer$/ });

  it('more than one known computer: the picker shows the current one and picks another, once', async () => {
    const picks: string[] = [];
    render(<ComputerPick shell={shell({ computers: two, setComputer: () => {} })} currentId="c1" onPick={(id) => picks.push(id)} t={t} />);
    expect(trigger()).toHaveTextContent('alpha');
    await userEvent.setup().click(trigger());
    const list = await screen.findByRole('dialog', { name: 'Computer' });
    expect(within(list).getByText('beta')).toBeInTheDocument();
    expect(within(list).getAllByText(/Stopped/).length).toBeGreaterThan(0);
    await userEvent.setup().click(within(list).getByText('beta'));
    expect(picks).toEqual(['c2']);
  });

  it('the list loading: the trigger says so and is disabled, never hidden', () => {
    render(<ComputerPick shell={shell({ computersRead: 'loading', setComputer: () => {} })} currentId="c1" onPick={() => {}} t={t} />);
    expect(trigger()).toHaveTextContent('Loading computers…');
    expect(trigger()).toBeDisabled();
  });

  it('the list could not be read: the trigger says so, and Try again in its panel reads it again', async () => {
    const retryComputers = vi.fn();
    render(<ComputerPick shell={shell({ computersRead: 'unknown', retryComputers, setComputer: () => {} })} currentId="c1" onPick={() => {}} t={t} />);
    expect(trigger()).toHaveTextContent('The computer list could not be read');
    expect(trigger()).not.toBeDisabled();
    await userEvent.setup().click(trigger());
    const list = await screen.findByRole('dialog', { name: 'Computer' });
    await userEvent.setup().click(within(list).getByRole('button', { name: 'Try again' }));
    expect(retryComputers).toHaveBeenCalledTimes(1);
  });

  it('a known list of one or none: nothing (there is no other computer to pick)', () => {
    for (const computers of [[], [row('c1', 'alpha')]]) {
      cleanup();
      const { container } = render(<ComputerPick shell={shell({ computers, setComputer: () => {} })} currentId="c1" onPick={() => {}} t={t} />);
      expect(container.textContent).toBe('');
    }
  });

  it('one listed computer with a read running again: still nothing (listed rows win over the read)', () => {
    const { container } = render(<ComputerPick shell={shell({ computers: [row('c1', 'alpha')], computersRead: 'loading', setComputer: () => {} })} currentId="c1" onPick={() => {}} t={t} />);
    expect(container.textContent).toBe('');
  });

  it('listed computers win over a read running again: the picker lists them, not the loading words', () => {
    render(<ComputerPick shell={shell({ computers: two, computersRead: 'loading', setComputer: () => {} })} currentId="c1" onPick={() => {}} t={t} />);
    expect(trigger()).toHaveTextContent('alpha');
    expect(screen.queryByText('Loading computers…')).toBeNull();
  });

  it('no shell switch (setComputer absent): nothing', () => {
    const { container } = render(<ComputerPick shell={shell({ computers: two })} currentId="c1" onPick={() => {}} t={t} />);
    expect(container.textContent).toBe('');
  });
});
