// Vitest: every step of Add a program is one frame (the way here, and the search when the step has one, in its head;
// the step below). The wide dialog (`roomy`) shows a computer's kinds in a rail; a program's sessions are a section
// card of tiles (the sessions, then New session and Open by number); the first screen's empty search says so as a
// computer's own does; a form of the wide dialog sits in the same frame.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { Picker, type PickerProps } from './Picker';
import strings from '../strings.en.json';
import { cardTitles, kindsRail, tileNames } from './browse.testkit';

vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={[pc('c1', 'atlas'), pc('c2', 'borealis')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);
const nav = () => screen.getByRole('navigation', { name: S['picker.title'] });

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Add a program in the wide dialog', () => {
  it('a computer\'s kinds stand in a rail (the dialog renders: roomy is read)', async () => {
    render(picker({ roomy: true }));
    await userEvent.setup().click(screen.getByRole('row', { name: /^atlas/ }));
    const rail = kindsRail();
    expect(rail).not.toBeNull();
    expect(rail!.getAttribute('role')).toBe('group');
  });

  it('a search on the first screen that finds no computer says so as a computer\'s own search does', async () => {
    const user = userEvent.setup();
    render(picker({ roomy: true }));
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.getByText(S['picker.noMatchTitle']!.replace('{{q}}', 'zzzz'))).toBeInTheDocument();
    expect(screen.getByText(S['picker.noMatchOfBody_other']!.replace('{{count}}', '2'))).toBeInTheDocument();
  });

  it('a program\'s sessions are one card of tiles in the frame: the sessions counted, then New session and Open by number', async () => {
    render(picker({ roomy: true, start: { step: 'session', computer: 'c1', program: 'terminal' } }));
    expect(cardTitles()).toEqual([S['browse.count']!.replace('{{title}}', S['picker.sessions']!).replace('{{count}}', '1')]);
    expect(tileNames()).toEqual([
      expect.stringMatching(/^terminal-1/),
      expect.stringMatching(new RegExp('^' + S['picker.newSession'] + ', ' + S['picker.newSessionDesc']!.replace('{{name}}', 'terminal-2'))),
      expect.stringMatching(new RegExp('^' + S['picker.byNumber'])),
    ]);
    expect(screen.queryByRole('listbox')).toBeNull();
    // The crumbs sit in the frame's head, over the card.
    const card = screen.getByRole('heading', { name: cardTitles()[0] });
    expect(nav().parentElement!.parentElement).toContainElement(card);
    expect(nav()).toHaveTextContent(S['picker.session']!);
  });

  it('the sessions step puts the focus on its first tile; Enter on New session picks it; Backspace goes back a step', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const { unmount } = render(picker({ roomy: true, onPick, start: { step: 'session', computer: 'c1', program: 'terminal' } }));
    const first = screen.getAllByRole('row')[0]!;
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('row', { name: new RegExp('^' + S['picker.newSession']) })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ computer: 'c1', program: 'terminal', session: 2 }));
    unmount();
    render(picker({ roomy: true, start: { step: 'session', computer: 'c1', program: 'terminal' } }));
    await waitFor(() => expect(screen.getAllByRole('row')[0]).toHaveFocus());
    await user.keyboard('{Backspace}');
    expect(await screen.findByRole('searchbox', { name: S['picker.searchPrograms'] })).toBeInTheDocument();
  });

  it('Open by number is a form in the same frame, under the same crumbs', async () => {
    const user = userEvent.setup();
    render(picker({ roomy: true, start: { step: 'session', computer: 'c1', program: 'terminal' } }));
    await user.click(screen.getByRole('row', { name: new RegExp('^' + S['picker.byNumber']) }));
    const field = await screen.findByRole('textbox', { name: S['picker.nameLabel'] });
    const head = nav().parentElement!;
    const frame = head.parentElement!;
    expect(frame).toContainElement(field);
    expect(head).not.toContainElement(field);
    expect(nav()).toHaveTextContent(S['picker.byNumber']!);
  });
});
