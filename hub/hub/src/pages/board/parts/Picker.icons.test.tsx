// Vitest: in Add a program, each Kit tile draws its own program's icon. SQLite draws the
// kit's database icon, not the notes page icon (Notes draws its brand icon), and no two Kit tiles share a glyph.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { Icon, type IconName } from '@kit';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { Picker } from './Picker';
import strings from '../strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string) => ({ id, name, project_id: 'p1', server_name: 'n12', status: 'running' }) as BoardComputer;

/** The drawing of one kit icon, to compare a row's svg with. */
const glyph = (name: IconName) => {
  const { container, unmount } = render(<Icon name={name} size="lg" />);
  const html = container.querySelector('svg')!.outerHTML;
  unmount();
  return html;
};

const kitRows = async () => {
  render(
    <CoreQueryProvider>
      <Picker computers={[pc('c1', 'atlas')]} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} />
    </CoreQueryProvider>,
  );
  await userEvent.setup().click(screen.getByRole('row', { name: /atlas/ }));
  // The Hoody Kit card's tiles (its grid is named after the card).
  return within(screen.getByRole('grid', { name: S['picker.kit'] })).getAllByRole('row');
};
/** A tile's mark (TileMark) drawing. */
const markSvg = (row: HTMLElement) => row.querySelector('[class*="tileMark"] svg')?.outerHTML ?? '';
const svgOfRow = (rows: HTMLElement[], name: string) => {
  const row = rows.find((o) => { const l = o.getAttribute('aria-label') ?? ''; return l === name || l.startsWith(name + ', '); });
  expect(row, name).toBeDefined();
  return markSvg(row!);
};

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Add a program: Kit tile icons', () => {
  it('SQLite draws the database icon, not the notes page icon', async () => {
    const want = { db: glyph('database'), notes: glyph('notes') };
    const rows = await kitRows();
    const sqlite = svgOfRow(rows, S['program.sqlite']!);
    expect(sqlite).toBe(want.db);
    expect(sqlite).not.toBe(want.notes);
    // An unknown icon name draws an empty svg: the row must draw a real shape.
    expect(sqlite).toMatch(/<path d="M/);
  });

  it('no two Kit tiles share a glyph', async () => {
    const rows = await kitRows();
    const svgs = rows.map(markSvg);
    expect(svgs.every((x) => x.includes('<path'))).toBe(true);
    expect(new Set(svgs).size).toBe(svgs.length);
  });
});
