// Vitest: a key comment longer than the row has room for is kept whole in the text,
// so CSS alone cuts it (the table's tooltip and a screen reader get all of it); only control characters are cleaned.
import { bootFixtureCore } from '@core';
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const LONG = 'deploy-bot@build-runner-07.eu-west.internal.example (rotated 2026-11-01, owner platform team)';
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    useComputerKeys: () => {
      const q = data.useComputerKeys();
      if (!q.data) return q;
      const rows = q.data.rows.map((r) => (r.name === 'atlas' ? { ...r, key: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnlyLongComment1 ${LONG}\u0007` } : r));
      return { ...q, data: { ...q.data, rows } };
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

describe('a long SSH key comment', () => {
  it('is in the cell whole (cut by CSS only), cleaned of control characters, in a cut RowNote', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    const note = await within(table).findByText(LONG, {}, { timeout: 8000 });
    expect(LONG.length).toBeGreaterThan(40);
    expect(note.tagName).toBe('BDI');
    expect(note.textContent).toBe(LONG);
    expect(note.parentElement?.className.split(/\s+/).length).toBe(2);
  });
});
