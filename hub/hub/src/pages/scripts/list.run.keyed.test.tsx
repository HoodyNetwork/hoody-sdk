// Vitest (F:4123 scripts-list-run-keyed): the list row's Run now on a script with a caller key is off with the Overview's reason,
// never sent to be refused. A run sends no key and no force (parts/runScript.ts), so the computer would refuse it. Replaced:
// the item reader, so the fixture's scheduled Job 1 reads as having a key, and the run send, which records each run.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DataModule from './data';
import type * as LogicModule from './logic';

const sentRuns = vi.hoisted(() => [] as unknown[]);
const io = vi.hoisted(() => ({ keyed: true }));
vi.mock('./logic', async (orig) => {
  const real = await orig<typeof LogicModule>();
  return { ...real, toItems: (...a: Parameters<typeof real.toItems>) => real.toItems(...a).map((i) => (i.path.endsWith('jobs/job-01.ts') ? { ...i, keyed: io.keyed } : i)) };
});
vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataModule>();
  return {
    ...real,
    useTrigger: () => {
      const m = real.useTrigger();
      return { ...m, mutateAsync: (v: never) => { sentRuns.push(v); return m.mutateAsync(v); } };
    },
  };
});

import page from './page';
import strings from './strings.en.json';

const openMenu = async () => {
  await renderPage(page, { state: 'triggerPending' });
  const table = await screen.findByRole('table', { name: strings.title }, { timeout: 8000 });
  const row = (await within(table).findAllByRole('row', { name: /Job 1\b/ }))[0] as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: /row actions/i }));
  return screen.findByRole('menuitem', { name: new RegExp(`^${strings['menu.run']}`) });
};

beforeEach(() => { sentRuns.length = 0; io.keyed = true; });

describe('the list row Run now on a script with a caller key', () => {
  it('is off and says why, and nothing is sent', async () => {
    const run = await openMenu();
    expect(run.getAttribute('aria-disabled')).toBe('true');
    expect(run.textContent).toContain(strings['overview.runWhy.keyed']);
    await userEvent.click(run).catch(() => undefined);
    expect(sentRuns).toHaveLength(0);
  });

  it('without a key the row Run stays pressable', async () => {
    io.keyed = false;
    const run = await openMenu();
    expect(run.getAttribute('aria-disabled')).not.toBe('true');
  });
});
