// Vitest: Launch an app's results answer the words they were asked for. While the field holds other words (the pause
// before they are asked), nothing on a result opens, in every presentation: a table row's Open and its Row actions >
// Options, a list row's Open button and its More actions > Options. Once the words are asked, the same press opens.
import { beforeEach, describe, expect, it } from 'vitest';
import { useCurrentComputer, type Target } from '@core';
import type { ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { harness } from './launch/harness';
import { FindPane } from './launch/FindPane';
import { useApps } from './launch/useApps';
import strings from './strings.en.json';

// The table's own menu name (the kit's words).
const ROW_ACTIONS = 'Row actions';
const calls: string[] = [];
let variant: 'table' | 'list' = 'table';
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <Pane /> }) };

/** The pane on the current computer; every Open and Options it asks for is recorded, not sent. */
function Pane(): ReactNode {
  const target = useCurrentComputer() as Target;
  const a = useApps({ target, nav: { select: () => undefined } });
  const l = a.latest.current;
  const latest = {
    current: {
      ...l,
      open: (...x: Parameters<typeof l.open>) => { calls.push('open:' + x[0].name); },
      setOptions: (...x: Parameters<typeof l.setOptions>) => { if (x[0]) calls.push('options:' + x[0].name); },
    },
  };
  return <FindPane a={{ ...a, latest }} target={target} variant={variant} />;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const field = () => screen.getByRole('searchbox', { name: strings['launch.search'] });
/** The result row of an app (a table row or a list item holding its Open). */
const rowOf = async (name: string) =>
  waitFor(() => {
    const open = screen.getAllByRole('button', { name: strings['act.open'] }).find((b) => b.closest('tr, [role="row"], li')?.textContent?.includes(name));
    expect(open).toBeDefined();
    return open!.closest('tr, [role="row"], li') as HTMLElement;
  }, { timeout: 4000 });

/** The words asked and their results on show, then other words typed (not asked yet). */
async function staleFor(v: 'table' | 'list') {
  variant = v;
  await renderPage(page, { path: '/apps' });
  const user = userEvent.setup();
  await user.type(await screen.findByRole('searchbox', { name: strings['launch.search'] }, { timeout: 4000 }), 'jupyter');
  await pause(400);
  return { user, row: await rowOf('JupyterLab') };
}
const change = () => fireEvent.change(field(), { target: { value: 'jupyte' } });

beforeEach(() => {
  calls.length = 0;
  fixtureStore.set({ state: null, latency: 'instant' });
});

describe('Launch an app: a result opens only for the words it answers', () => {
  for (const v of ['table', 'list'] as const) {
    it(`${v}: Open on a row opens nothing while other words wait to be asked; once asked it opens`, async () => {
      const { user, row } = await staleFor(v);
      change();
      fireEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
      await pause(400);
      expect(calls).toEqual([]);
      await user.click(within(await rowOf('JupyterLab')).getByRole('button', { name: strings['act.open'] }));
      expect(calls).toEqual(['open:JupyterLab']);
    });

    it(`${v}: Options from a row's menu opens nothing while other words wait to be asked`, async () => {
      const { user, row } = await staleFor(v);
      const menu = v === 'table' ? ROW_ACTIONS : strings['act.menu'].replace('{{name}}', 'JupyterLab');
      await user.click(within(row).getByRole('button', { name: menu }));
      const item = await screen.findByRole('menuitem', { name: new RegExp('^' + strings['act.options']) });
      change();
      fireEvent.click(item);
      await pause(400);
      expect(calls).toEqual([]);
    });
  }
});
