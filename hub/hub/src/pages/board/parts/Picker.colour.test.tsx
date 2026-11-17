// The board picker's computer tiles (Add a program's computer
// list) draw each computer's colour mark after the computer icon (the tile's mark), at the end of the title line,
// through kit ComputerMark: a valid colour draws its mark, a hostile or missing one draws none and reaches no style.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { Picker } from './Picker';
import strings from '../strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const pc = (id: string, name: string, color?: string) => ({ id, name, project_id: 'p1', server_name: 'n12', status: 'running', ...(color === undefined ? {} : { color }) }) as BoardComputer;
const computers = [pc('c1', 'atlas', '#3b82f6'), pc('c2', 'cedar', 'red;x:url(y)'), pc('c3', 'dune')];

const show = () =>
  render(
    <CoreQueryProvider>
      <Picker computers={computers} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} />
    </CoreQueryProvider>,
  );
const markOf = (row: HTMLElement) => row.querySelector('[data-computer-color]')?.getAttribute('data-computer-color') ?? null;
const noUrlInStyles = () => { for (const el of document.querySelectorAll<HTMLElement>('[style]')) expect(el.getAttribute('style')).not.toContain('url('); };
const expectMarks = (rows: HTMLElement) => {
  const at = (name: string) => within(rows).getByRole('row', { name: new RegExp(`^${name}\\b`) });
  expect(markOf(at('atlas'))).toBe('#3B82F6');
  // After the computer icon (the tile's mark) and the name, at the end of the title line before the state words.
  const icon = at('atlas').querySelector('[class*="tileMark"] svg')!;
  const mark = at('atlas').querySelector('[data-computer-color]')!;
  const name = within(at('atlas')).getByText('atlas');
  const state = within(at('atlas')).getByText(S['state.running']!);
  expect(icon).not.toBeNull();
  expect(icon.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(name.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(mark.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(markOf(at('cedar'))).toBeNull();
  expect(markOf(at('dune'))).toBeNull();
  noUrlInStyles();
};

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('board picker: the computer colour on computer tiles', () => {
  it('Add a program: the computers card draws each computer\'s mark', async () => {
    show();
    expectMarks(screen.getByRole('grid', { name: S['picker.computersCount']!.replace('{{count}}', '3') }));
  });
});
