// Vitest: several deletes stop at the first that does not end done. Core's shared files
// lock would refuse a later send while the first is held, so the wire alone cannot show the stop; this counts the
// planner's own sends: after the first item may have gone through, it never asks core to send the next.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import { resetFiles } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const h = vi.hoisted(() => ({ asked: [] as string[], done: 0 }));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useFilesChange: (kind: Data.ChangeKind) => {
      const real = m.useFilesChange(kind);
      return kind !== 'delete' ? real : { ...real, run: (v: Data.ChangeVars) => { h.asked.push(v.path); return real.run(v).then((r) => { h.done += 1; return r; }); } };
    },
  };
});

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const pane = () => screen.findByRole('region', { name: strings['pane.a'] });
const row = async (name: RegExp) => within(await within(await pane()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) })).findByRole('row', { name });

beforeEach(() => { resetFiles(); h.asked = []; h.done = 0; });

describe('several deletes', () => {
  it('ask core to send only the first when it may have gone through', async () => {
    await renderPage(page, { path: ADA });
    // Rename notes.txt to lost (its answer is lost; the fresh listing proves it), so its delete loses its answer too.
    await userEvent.click(within(await row(/\bnotes\.txt\b/)).getByRole('button', { name: /actions|more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['action.rename'] }));
    const rd = await screen.findByRole('dialog');
    await userEvent.clear(within(rd).getByRole('textbox', { name: strings['name.label'] }));
    await userEvent.type(within(rd).getByRole('textbox', { name: strings['name.label'] }), 'lost');
    await userEvent.click(within(rd).getByRole('button', { name: strings['action.rename'] }));
    await waitFor(() => expect(screen.queryAllByText(/may have gone through/i)).toHaveLength(0), { timeout: 10_000 });
    await userEvent.click(within(await row(/\blost\b/)).getByRole('checkbox'));
    await userEvent.click(within(await row(/\breport\.pdf\b/)).getByRole('checkbox'));
    await userEvent.click(within(await pane()).getByRole('button', { name: strings['action.deleteSelected'] }));
    const d = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    // Several items are always typed: their count, exactly.
    await userEvent.type(within(d).getByRole('textbox'), '2 items');
    await userEvent.click(await within(d).findByRole('button', { name: strings['action.delete'] }));
    // Each send's answer is counted before the planner goes on, so once the first answered, any next send is
    // already asked for.
    await waitFor(() => expect(h.done).toBeGreaterThan(0), { timeout: 10_000 });
    expect(h.asked).toEqual(['/home/ada/lost']);
  }, 40_000);
});
