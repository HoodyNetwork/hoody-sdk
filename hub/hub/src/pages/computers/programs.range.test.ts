// The Programs tab offers what the program can do as programCan says, with its range
// programCan): a failed port-range program restarts per port only (the daemon needs the port), so neither its
// row nor its menu offers a whole-program Restart; a failed plain program keeps it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type * as Data from './data';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

const shape = vi.hoisted(() => ({ range: false }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return {
    ...real,
    usePrograms: (...a: Parameters<typeof real.usePrograms>) => {
      const q = real.usePrograms(...a);
      const data = q.data?.map((p) => (p.name === 'web' ? { ...p, state: 'failed' as const, ...(shape.range ? { range: true } : {}) } : p));
      return { ...q, data };
    },
  };
});

const webRow = async () => {
  await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=programs' });
  const table = await screen.findByRole('table', { name: strings['prog.title'] });
  return within(table).findByRole('row', { name: /^web/ });
};
const restart = new RegExp(`^${strings['prog.restart']}$`);

describe('computers: Programs tab actions follow programCan with the range', () => {
  afterEach(() => {
    shape.range = false;
  });

  it('a failed plain program offers Restart', async () => {
    const row = await webRow();
    expect(within(row).getByRole('button', { name: restart })).toBeTruthy();
  });

  it('a failed port-range program offers no whole-program Restart, in the row or its menu', async () => {
    shape.range = true;
    const row = await webRow();
    expect(within(row).queryByRole('button', { name: restart })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: new RegExp(kitStrings['table.rowActions']) }));
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: restart })).toBeNull();
  });
});
