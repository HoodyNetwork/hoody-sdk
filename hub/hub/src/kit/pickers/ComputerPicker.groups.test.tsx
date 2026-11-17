// ComputerPicker order and groups: the shell's current realm first, then the other realms, each under its heading
// when there is more than one, running computers first in each; failed or unknown-state computers last in a folded
// "Not running (N)" group that search and the keyboard still reach. One line per row: the state word only when not
// running, then the place and the realm.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ShellDataProvider, type ShellData } from '../../shell/context';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';
import strings from './ComputerPicker.strings.en.json';

const WORK = { name: 'Work' };
const HOME = { name: 'Personal', color: 'teal' as const };
const ROWS: ComputerChoice[] = [
  { id: 'a', name: 'alpha', realm: WORK, running: true, state: 'Running', stateKind: 'running', place: 'Singapore · sg-2' },
  { id: 'b', name: 'bravo', realm: HOME, running: false, state: 'Stopped', stateKind: 'stopped', place: 'Frankfurt · de-1' },
  { id: 'c', name: 'charlie', realm: HOME, running: true, state: 'Running', stateKind: 'running', place: 'Frankfurt · de-1' },
  { id: 'd', name: 'delta', realm: WORK, running: false, state: 'State not known', stateKind: 'attention', place: 'Singapore · sg-2' },
  { id: 'e', name: 'echo', realm: WORK, running: false, state: 'Stopped', stateKind: 'stopped', place: 'Singapore · sg-2' },
  { id: 'f', name: 'foxtrot', realm: HOME, running: false, state: 'State not known', stateKind: 'attention' },
];
const SHELL: ShellData = { realms: [{ id: 'r-work', name: 'Work' }, { id: 'r-home', name: 'Personal' }] as ShellData['realms'], realmId: 'r-home', computers: [] };
const FOLD = `${strings.notRunning} (2)`;

function Host({ rows = ROWS, start, seen, shell = SHELL }: { rows?: ComputerChoice[]; start?: string; seen?: string[]; shell?: ShellData }) {
  const [v, setV] = useState<string | undefined>(start);
  return (
    <ShellDataProvider value={shell}>
      <ComputerPicker label="Computer" computers={rows} value={v} onChange={(id) => { seen?.push(id); setV(id); }} />
    </ShellDataProvider>
  );
}

async function open(props: Parameters<typeof Host>[0] = {}) {
  render(<Host {...props} />);
  await userEvent.click(screen.getByRole('button', { name: /Computer$/ }));
  return screen.findByRole('dialog', { name: 'Computer' });
}
const names = (list: HTMLElement) => within(list).queryAllByRole('radio').map((r) => r.textContent?.split(' ')[0]);

describe('ComputerPicker groups', () => {
  it('puts the current realm first, then the other realms, running computers first in each', async () => {
    const list = await open();
    expect(names(list)).toEqual(['charlie', 'bravo', 'alpha', 'echo']);
    const groups = within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Personal', 'Work', strings.notRunning]);
  });

  it('folds failed and unknown-state computers into "Not running (N)" at the bottom, and opens it on press', async () => {
    const list = await open();
    const toggle = within(list).getByRole('button', { name: FOLD });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(list).queryByText('delta')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(names(list)).toEqual(['charlie', 'bravo', 'alpha', 'echo', 'delta', 'foxtrot']);
  });

  it('draws one line per row: the state word only when not running, then the place and the realm', async () => {
    const list = await open();
    const row = (n: string) => within(list).getAllByRole('radio').find((r) => r.textContent?.startsWith(n))!;
    expect(within(row('bravo')).getByText('Stopped')).toBeVisible();
    expect(row('bravo')).toHaveTextContent('Frankfurt · de-1');
    // Under its realm's heading a row draws no realm of its own; it still says it to assistive tech.
    expect(within(row('bravo')).getByText('Personal')).toHaveClass(/srOnly/);
    // A running row draws no state word; the word is still in the row's text for assistive tech.
    expect(within(row('charlie')).getByText('Running')).toHaveClass(/srOnly/);
    expect(row('alpha')).toHaveTextContent('Singapore · sg-2');
    expect(within(row('alpha')).getByText('Work')).toHaveClass(/srOnly/);
    // In "Not running" (no realm heading) the row draws its realm chip.
    await userEvent.click(within(list).getByRole('button', { name: FOLD }));
    expect(within(row('delta')).getByText('Work')).not.toHaveClass(/srOnly/);
  });

  it('search filters across every group and opens the folded group it matches', async () => {
    const seen: string[] = [];
    const list = await open({ seen });
    await userEvent.type(within(list).getByRole('searchbox', { name: strings.search }), 'delta');
    expect(names(list)).toEqual(['delta']);
    expect(within(list).getByRole('button', { name: `${strings.notRunning} (1)` })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    // The toggle is the first stop of its group; the row comes after it.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(seen).toEqual(['d']);
  });

  it('reaches the toggle with the arrows: Enter opens it and ArrowDown goes on into its rows', async () => {
    const list = await open();
    within(list).getAllByRole('radio')[3]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    const toggle = within(list).getByRole('button', { name: FOLD });
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(within(list).getAllByRole('radio').find((r) => r.textContent?.startsWith('delta'))).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}[Space]');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts the group open when it holds the picked computer', async () => {
    const list = await open({ start: 'f' });
    expect(within(list).getByRole('button', { name: FOLD })).toHaveAttribute('aria-expanded', 'true');
    expect(within(list).getByRole('radio', { checked: true })).toHaveTextContent('foxtrot');
  });

  it('draws no headings for one realm with every computer running or stopped', async () => {
    const list = await open({ rows: ROWS.filter((c) => c.realm === WORK && c.stateKind !== 'attention') });
    expect(names(list)).toEqual(['alpha', 'echo']);
    expect(within(list).queryAllByRole('group')).toEqual([]);
    // No heading names the realm, so each row draws its chip.
    for (const r of within(list).getAllByRole('radio')) expect(within(r).getByText('Work')).not.toHaveClass(/srOnly/);
  });

  it('keeps that order whichever computer is picked: a stopped one, one in another realm, a failed one', async () => {
    for (const start of ['e', 'a', 'f']) {
      const { unmount } = render(<Host start={start} />);
      await userEvent.click(screen.getByRole('button', { name: /Computer$/ }));
      const list = await screen.findByRole('dialog', { name: 'Computer' });
      const open = within(list).queryByRole('button', { name: FOLD });
      if (open?.getAttribute('aria-expanded') === 'false') await userEvent.click(open);
      expect(names(list), `picked ${start}`).toEqual(['charlie', 'bravo', 'alpha', 'echo', 'delta', 'foxtrot']);
      expect(within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label')), `picked ${start}`).toEqual(['Personal', 'Work', strings.notRunning]);
      unmount();
    }
  });

  it('keeps a realm named like a made-up group apart from it: "Not running" and "No realm" realms stay open realm groups', async () => {
    const rows: ComputerChoice[] = [
      { id: 'x1', name: 'xray', realm: { name: strings.notRunning }, running: true, state: 'Running', stateKind: 'running' },
      { id: 'x2', name: 'yankee', realm: { name: strings.noRealm }, running: true, state: 'Running', stateKind: 'running' },
      { id: 'x3', name: 'zebra', running: true, state: 'Running', stateKind: 'running' },
      { id: 'x4', name: 'zulu', realm: { name: strings.notRunning }, running: false, state: 'State not known', stateKind: 'attention' },
    ];
    const list = await open({ rows });
    expect(names(list)).toEqual(['xray', 'yankee', 'zebra']);
    expect(within(list).getAllByRole('button', { name: /\(\d+\)$/ }).map((b) => b.textContent)).toEqual([`${strings.notRunning} (1)`]);
    expect(within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([strings.notRunning, strings.noRealm, strings.noRealm, strings.notRunning]);
  });

  it('opens the folded group for a match that arrives after the search was typed, or a match that moves into it', async () => {
    const seen: string[] = [];
    const ui = (rows: ComputerChoice[]) => (
      <ShellDataProvider value={SHELL}>
        <ComputerPicker label="Computer" computers={rows} value={undefined} onChange={(id) => seen.push(id)} />
      </ShellDataProvider>
    );
    const { rerender } = render(ui(ROWS));
    await userEvent.click(screen.getByRole('button', { name: /Computer$/ }));
    const list = await screen.findByRole('dialog', { name: 'Computer' });
    await userEvent.type(within(list).getByRole('searchbox', { name: strings.search }), 'zulu');
    expect(names(list)).toEqual([]);
    // A later page of the list brings a failed computer that matches.
    rerender(ui([...ROWS, { id: 'z', name: 'zulu', realm: WORK, running: false, state: 'State not known', stateKind: 'attention' }]));
    expect(within(list).getByRole('button', { name: `${strings.notRunning} (1)` })).toHaveAttribute('aria-expanded', 'true');
    expect(names(list)).toEqual(['zulu']);
    // A match that fails while the search shows it moves into the group, still shown.
    await userEvent.clear(within(list).getByRole('searchbox', { name: strings.search }));
    await userEvent.type(within(list).getByRole('searchbox', { name: strings.search }), 'alpha');
    rerender(ui(ROWS.map((c) => (c.id === 'a' ? { ...c, running: false, state: 'State not known', stateKind: 'attention' as const } : c))));
    expect(within(list).getByRole('button', { name: `${strings.notRunning} (1)` })).toHaveAttribute('aria-expanded', 'true');
    expect(names(list)).toEqual(['alpha']);
  });

  it('opens wide when there is room: up to --picker-w-wide (640px), never past the screen', () => {
    const css = readFileSync(join(import.meta.dirname, '../overlays/Popover.module.css'), 'utf8');
    expect(css).toMatch(/\.wide \{\s*width: min\(var\(--picker-w-wide\), calc\(100vw - 2 \* var\(--sp-4\)\)\);/);
    expect(readFileSync(join(import.meta.dirname, '../tokens.css'), 'utf8')).toMatch(/--picker-w-wide: 640px;/);
    const src = readFileSync(join(import.meta.dirname, 'ComputerPicker.tsx'), 'utf8');
    expect(src).toMatch(/<PickerPopover trigger=\{trigger\} label=\{label\} width="wide">/);
  });
});
