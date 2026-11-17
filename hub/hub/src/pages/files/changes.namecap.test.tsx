// Vitest: the name dialog (New folder, Rename) reads the capability live. A token session's
// capabilities can drop while it is open: its Create / Rename goes off and says why before anything is pressed; the
// send-time check (changes.capability.test.tsx) stays behind it. Reads and sends are stubbed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import { NameDialog } from './changes';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ can: true, asked: [] as string[], held: [] as unknown[] }));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: () => h.held,
    usePlanReads: (_c: unknown, paths: readonly string[]) => ({
      real: new Map(paths.map((p) => [p, p])), failed: false, mounts: { complete: true, items: [] }, retry: () => undefined,
    }),
    useCanChange: () => h.can,
    useFilesChange: () => ({
      readBack: () => Promise.resolve(false),
      run: (v: Data.ChangeVars) => { h.asked.push(v.path); return Promise.resolve({ outcome: 'done' }); },
    }),
  };
});

const ATLAS = { id: 'c-atlas', name: 'atlas', project_id: 'p', server_name: 's', status: 'running', rules: 'open' } as Data.FilesComputer;
const NOTES = { name: 'notes.txt', dir: false, size: 10, modified: 1000 } as Parameters<typeof NameDialog>[0]['entry'];

beforeEach(() => { h.can = true; h.asked = []; h.held = []; });

describe('name dialog, changes turned off while open', () => {
  it('New folder: Create goes off and says why', async () => {
    const { rerender } = render(<NameDialog c={ATLAS} parent="/home/ada" taken={[]} onClose={() => undefined} />);
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByRole('textbox', { name: strings['name.label'] }), 'drafts');
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeEnabled();
    h.can = false;
    rerender(<NameDialog c={ATLAS} parent="/home/ada" taken={[]} onClose={() => undefined} />);
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeDisabled();
    expect(within(d).getByText(strings['changes.off'])).toBeInTheDocument();
    expect(h.asked).toEqual([]);
  });

  it('Rename: Rename goes off and says why', async () => {
    const { rerender } = render(<NameDialog c={ATLAS} parent="/home/ada" entry={NOTES} taken={['notes.txt']} onClose={() => undefined} />);
    const d = screen.getByRole('dialog');
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'notes-old.txt');
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeEnabled();
    h.can = false;
    rerender(<NameDialog c={ATLAS} parent="/home/ada" entry={NOTES} taken={['notes.txt']} onClose={() => undefined} />);
    expect(within(d).getByRole('button', { name: strings['action.rename'] })).toBeDisabled();
    expect(within(d).getByText(strings['changes.off'])).toBeInTheDocument();
    expect(h.asked).toEqual([]);
  });
});

// A New folder dialog's path is the name being typed: a held create of one name blocks that name (its outcome shows,
// Create stays off, nothing is sent), but the field stays the person's, so typing on to another name is not trapped
// (with "drafts" held, "drafts-2" can still be made). The held create itself stays in the band with Check again.
describe('name dialog over a held create', () => {
  it('the held name shows its outcome and cannot be sent; another name can', async () => {
    h.held = [{ hold: 'm1', at: 1, identity: { kind: 'mkdir', computer: 'c-atlas', name: 'atlas', path: '/home/ada/drafts' } }];
    render(<NameDialog c={ATLAS} parent="/home/ada" taken={[]} onClose={() => undefined} />);
    const d = screen.getByRole('dialog');
    const field = within(d).getByRole('textbox', { name: strings['name.label'] });
    await userEvent.type(field, 'drafts');
    expect(within(d).getAllByText(/may have gone through/i).length).toBeGreaterThan(0);
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(h.asked).toEqual([]);
    await userEvent.type(field, '-2');
    expect(within(d).getByRole('button', { name: strings['action.create'] })).toBeEnabled();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.create'] }));
    expect(h.asked).toEqual(['/home/ada/drafts-2']);
  });
});
