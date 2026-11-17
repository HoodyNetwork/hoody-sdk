// ProjectPicker and ProgramPicker: built on ComputerPicker's trigger and popover. The trigger shows the
// picked row, the panel lists the caller's rows with search (programs under their groups), a pick reaches onChange once
// and closes, the same pick or a disabled row changes nothing, and loading or a value not among the rows never shows a
// stale name. A failed read keeps the trigger usable and shows Try again. Both pickers run ComputerPicker's contract
// cases (loading, failed read, empty list, stale value, disabled row, same pick, a lock that lands while the panel is
// open), and a PickerField with a hidden label still names the trigger.
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPicker, type ProjectChoice } from './ProjectPicker';
import { ProgramPicker, type ProgramChoice } from './ProgramPicker';
import { PickerField } from './PickerField';
import { SR_ONLY } from '../controls/SrOnly';
import { ComputerPicker } from './ComputerPicker';
import { FormStateProvider } from '../forms/lock';
import projStrings from './ProjectPicker.strings.en.json';
import progStrings from './ProgramPicker.strings.en.json';

const PROJECTS: ProjectChoice[] = [
  { id: 'p1', name: 'Home base', color: '#226688', facts: '3 computers' },
  { id: 'p2', name: 'Acme storefront', facts: '2 computers' },
  { id: 'p3', name: 'Archive', disabledReason: 'Not in this realm' },
];
const PROGRAMS: ProgramChoice[] = [
  { id: 'web', name: 'web', group: 'Yours', running: true, state: 'Running', description: 'Ports 8000–8010' },
  { id: 'api', name: 'api', group: 'Yours', running: false, state: 'Stopped' },
  { id: 'sshd', name: 'sshd', group: 'System' },
];

function Proj({ rows, start, seen, status }: { rows: ProjectChoice[] | undefined; start?: string; seen?: string[]; status?: { error?: unknown; onRetry?: () => void } }) {
  const [v, setV] = useState(start);
  return (
    <ProjectPicker
      label="Project"
      projects={rows}
      value={v}
      status={status}
      onChange={(id) => {
        seen?.push(id);
        setV(id);
      }}
    />
  );
}
function Prog({ rows, start, seen }: { rows: ProgramChoice[] | undefined; start?: string; seen?: string[] }) {
  const [v, setV] = useState(start);
  return (
    <ProgramPicker
      label="Program"
      programs={rows}
      value={v}
      onChange={(id) => {
        seen?.push(id);
        setV(id);
      }}
    />
  );
}

describe('ProjectPicker', () => {
  it('shows the picked project, picks another once with its facts listed, and closes', async () => {
    const seen: string[] = [];
    render(<Proj rows={PROJECTS} start="p1" seen={seen} />);
    const trigger = screen.getByRole('button', { name: /^.+ Project$/ });
    expect(trigger).toHaveTextContent('Home base');
    await userEvent.click(trigger);
    const list = await screen.findByRole('dialog', { name: 'Project' });
    expect(within(list).getByText('2 computers')).toBeInTheDocument();
    await userEvent.click(within(list).getByText('Acme storefront'));
    expect(seen).toEqual(['p2']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /^.+ Project$/ })).toHaveTextContent('Acme storefront');
  });

  it('finds a project by typing; the same pick and a disabled row change nothing', async () => {
    const seen: string[] = [];
    render(<Proj rows={PROJECTS} start="p1" seen={seen} />);
    await userEvent.click(screen.getByRole('button', { name: /^.+ Project$/ }));
    let list = await screen.findByRole('dialog');
    expect(within(list).getByText('Not in this realm')).toBeInTheDocument();
    await userEvent.click(within(list).getByText('Archive'));
    expect(seen).toEqual([]);
    await userEvent.type(within(list).getByRole('searchbox', { name: projStrings.search }), 'acme');
    expect(within(list).queryByText('Home base')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^.+ Project$/ }));
    await userEvent.click(screen.getByRole('button', { name: /^.+ Project$/ }));
    list = await screen.findByRole('dialog');
    await userEvent.click(within(list).getByText('Home base'));
    expect(seen).toEqual([]);
  });
});

describe('ProgramPicker', () => {
  it('lists programs under their groups with state words, and picks one once', async () => {
    const seen: string[] = [];
    render(<Prog rows={PROGRAMS} start="web" seen={seen} />);
    const trigger = screen.getByRole('button', { name: /^.+ Program$/ });
    expect(trigger).toHaveTextContent('web');
    expect(trigger).toHaveAccessibleName('web Running Program');
    await userEvent.click(trigger);
    const list = await screen.findByRole('dialog', { name: 'Program' });
    expect(within(list).getByText('Yours')).toBeInTheDocument();
    expect(within(list).getByText('System')).toBeInTheDocument();
    expect(within(list).getByText('Stopped')).toBeInTheDocument();
    await userEvent.click(within(list).getByText('sshd'));
    expect(seen).toEqual(['sshd']);
    expect(screen.getByRole('button', { name: /^.+ Program$/ })).toHaveTextContent('sshd');
  });

  it('finds a program by typing and picks it with the keyboard', async () => {
    const seen: string[] = [];
    render(<Prog rows={PROGRAMS} seen={seen} />);
    expect(screen.getByRole('button', { name: /^.+ Program$/ })).toHaveTextContent(progStrings.placeholder);
    await userEvent.click(screen.getByRole('button', { name: /^.+ Program$/ }));
    const list = await screen.findByRole('dialog');
    await userEvent.type(within(list).getByRole('searchbox', { name: progStrings.search }), 'api');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(seen).toEqual(['api']);
  });
});

// ComputerPicker's contract cases, run over both pickers. Each case builds its picker through `make`, so a picker
// that drifts from the shared contract fails here by name.
interface Kind {
  name: string;
  label: string;
  t: typeof projStrings;
  rows: { id: string; name: string; disabledReason?: string }[];
  make: (p: { rows: { id: string; name: string; disabledReason?: string }[] | undefined; value?: string; onChange: (id: string) => void; status?: { error?: unknown; onRetry?: () => void }; isDisabled?: boolean }) => ReactNode;
}
const KINDS: Kind[] = [
  {
    name: 'ProjectPicker',
    label: 'Project',
    t: projStrings,
    rows: [
      { id: 'p1', name: 'Home base' },
      { id: 'p2', name: 'Acme storefront' },
      { id: 'p3', name: 'Archive', disabledReason: 'Not in this realm' },
    ],
    make: ({ rows, ...p }) => <ProjectPicker label="Project" projects={rows} {...p} value={p.value} />,
  },
  {
    name: 'ProgramPicker',
    label: 'Program',
    t: progStrings,
    rows: [
      { id: 'web', name: 'web' },
      { id: 'api', name: 'api' },
      { id: 'cron', name: 'cron', disabledReason: 'Needs a running computer' },
    ],
    make: ({ rows, ...p }) => <ProgramPicker label="Program" programs={rows} {...p} value={p.value} />,
  },
];

describe.each(KINDS)('$name keeps the ComputerPicker contract', (k) => {
  const trigger = () => screen.getByRole('button', { name: new RegExp(`^.+ ${k.label}$`) });
  const [first, second, off] = k.rows;
  function Host({ rows, seen }: { rows: Kind['rows'] | undefined; seen: string[] }) {
    const [v, setV] = useState<string | undefined>(first!.id);
    return <>{k.make({ rows, value: v, onChange: (id) => { seen.push(id); setV(id); } })}</>;
  }

  it('says it is loading with the trigger off, then shows the placeholder for a value not among the rows, never a stale name', () => {
    const { rerender } = render(<>{k.make({ rows: undefined, value: first!.id, onChange: () => {} })}</>);
    expect(trigger()).toBeDisabled();
    expect(trigger()).toHaveTextContent(k.t.loading);
    rerender(<>{k.make({ rows: k.rows.slice(1), value: first!.id, onChange: () => {} })}</>);
    expect(trigger()).toHaveTextContent(k.t.placeholder);
    expect(trigger()).not.toHaveTextContent(first!.name);
  });

  it('keeps the trigger usable after a failed read and offers Try again once', async () => {
    const retry = vi.fn();
    render(<>{k.make({ rows: undefined, onChange: () => {}, status: { error: new Error('down'), onRetry: retry } })}</>);
    expect(trigger()).toBeEnabled();
    expect(trigger()).toHaveTextContent(k.t.failed);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: k.label });
    await userEvent.click(within(list).getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says the list is empty when the read returned no rows', async () => {
    render(<>{k.make({ rows: [], onChange: () => {} })}</>);
    expect(trigger()).toHaveTextContent(k.t.placeholder);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: k.label });
    expect(within(list).getByText(k.t.empty)).toBeInTheDocument();
  });

  it('changes nothing for the row already picked, or for a row that is off and says why', async () => {
    const seen: string[] = [];
    render(<Host rows={k.rows} seen={seen} />);
    await userEvent.click(trigger());
    let list = await screen.findByRole('dialog', { name: k.label });
    expect(within(list).getByText(off!.disabledReason!)).toBeInTheDocument();
    await userEvent.click(within(list).getByText(off!.name));
    expect(seen).toEqual([]);
    list = await screen.findByRole('dialog', { name: k.label });
    await userEvent.click(within(list).getByText(first!.name));
    expect(seen).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveTextContent(first!.name);
  });

  it('picks nothing from a panel left open after the picker was turned off', async () => {
    const seen: string[] = [];
    function Off() {
      const [isOff, setOff] = useState(false);
      return (
        <>
          {k.make({ rows: k.rows, value: first!.id, onChange: (id) => seen.push(id), isDisabled: isOff })}
          <button type="button" onClick={() => setOff(true)}>turn off</button>
        </>
      );
    }
    render(<Off />);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: k.label });
    screen.getByRole('button', { name: 'turn off', hidden: true }).click();
    await userEvent.click(within(list).getByText(second!.name));
    expect(seen).toEqual([]);
  });

  it('picks nothing from a panel left open when the enclosing form locks', async () => {
    const seen: string[] = [];
    function Locking() {
      const [locked, setLocked] = useState(false);
      return (
        <FormStateProvider value={{ locked, busy: locked, outcome: null }}>
          {k.make({ rows: k.rows, value: first!.id, onChange: (id) => seen.push(id) })}
          <button type="button" onClick={() => setLocked(true)}>send</button>
        </FormStateProvider>
      );
    }
    render(<Locking />);
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: k.label });
    screen.getByRole('button', { name: 'send', hidden: true }).click();
    await userEvent.click(within(list).getByText(second!.name));
    expect(seen).toEqual([]);
  });

  it('a PickerField with a hidden label still names the trigger by it', () => {
    render(<PickerField label={`${k.label} to use`} showLabel={false}>{k.make({ rows: k.rows, value: first!.id, onChange: () => {} })}</PickerField>);
    expect(screen.getByRole('button', { name: `${first!.name} ${k.label} to use` })).toHaveTextContent(first!.name);
    // Drawn only for readers: jsdom applies no CSS, so the label wears the kit's global visually-hidden class (SR_ONLY).
    expect(screen.getByText(`${k.label} to use`).classList.contains(SR_ONLY)).toBe(true);
  });
});

describe('PickerField: a picker as a form field', () => {
  it('names the trigger by the visible label and describes it with the description and the error', () => {
    render(
      <PickerField label="Project" description="Where the copy goes" errorMessage="Pick a project first">
        <ProjectPicker label="Project for the copy" projects={PROJECTS} value={undefined} onChange={() => {}} />
      </PickerField>,
    );
    expect(screen.getByText('Project', { selector: 'span' })).toBeVisible();
    const trigger = screen.getByRole('button', { name: /^.+ Project$/ });
    expect(trigger).toHaveAccessibleDescription(/Where the copy goes.*Pick a project first/);
    expect(trigger).toHaveAttribute('data-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a project first');
  });

  it('works for ComputerPicker too; without a field the trigger keeps its own name', () => {
    const { rerender } = render(
      <PickerField label="Run on">
        <ComputerPicker label="Computer" computers={[{ id: 'a', name: 'atlas' }]} value="a" onChange={() => {}} />
      </PickerField>,
    );
    expect(screen.getByRole('button', { name: /^.+ Run on$/ })).toHaveTextContent('atlas');
    rerender(<ComputerPicker label="Computer" computers={[{ id: 'a', name: 'atlas' }]} value="a" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^.+ Computer$/ })).not.toHaveAttribute('data-invalid');
  });
});
