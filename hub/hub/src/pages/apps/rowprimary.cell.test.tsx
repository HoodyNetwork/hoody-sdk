// The Apps tab's Action cell is never blank for a row that is busy or that failed: a starting app says so in the kit's
// row note ("Starting…"), and an app that stopped with an error, whose terminal has no address to go to, offers its next
// real action (Open again) instead of nothing. Table (1440 px) and list rows (390 px) alike.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { fixtureStore } from '@app/fixtures';
import { harness } from './launch/harness';
import { ops } from './parts/ops';
import strings from './strings.en.json';

const layout = vi.hoisted(() => ({ width: 1440 }));

beforeEach(() => {
  fixtureStore.set({ state: null, latency: 'instant' });
  ops.reset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: unknown[], o: unknown) => void) {}
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: layout.width, height: 800 } }], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function rowNow(name: string): HTMLElement {
  const table = screen.getByRole('table', { name: strings['tab.open'] });
  const r = within(table)
    .getAllByRole('row')
    .find((x) => within(x).queryByText(name, { exact: true }) !== null);
  if (!r) throw new Error(`no Open row for ${name}`);
  return r;
}

describe.each([
  ['desktop', 1440],
  ['phone', 390],
] as const)('Apps, the Action cell of a busy or failed row, %s', (_, width) => {
  beforeEach(() => {
    layout.width = width;
  });

  it('a starting app says it is starting, with no control of its own', async () => {
    await renderPage(harness, { path: '/apps' });
    const vscode = await waitFor(() => rowNow('VS Code'), { timeout: 4000 });
    expect(within(vscode).getByText(strings['row.busy'].replace('{{state}}', strings['short.st.starting']))).toBeInTheDocument();
    expect(vscode.querySelector('[data-row-primary]')).toBeNull();
  });

  it('an app that stopped with an error and has no terminal address offers Open again', async () => {
    await renderPage(harness, { path: '/apps' });
    const btop = await waitFor(() => rowNow('btop'), { timeout: 4000 });
    const again = within(btop).getByRole('button', { name: strings['act.openAgain'] });
    expect(again).toHaveAttribute('data-row-primary');
    expect(within(btop).queryByRole('link', { name: new RegExp(strings['act.terminal']) })).toBeNull();
  });

  it('a row with a working action keeps it (JupyterLab: Open)', async () => {
    await renderPage(harness, { path: '/apps' });
    const jl = await waitFor(() => rowNow('JupyterLab'), { timeout: 4000 });
    expect(within(jl).getByRole('link', { name: new RegExp(`^${strings['act.open']}`) })).toHaveAttribute('data-row-primary');
  });
});
