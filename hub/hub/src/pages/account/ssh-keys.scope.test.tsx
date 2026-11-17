// Vitest: which words the SSH keys section uses for each realm state. core's realm view
// and realm domain are overridden here (pass-through unless a case sets them): a pinned session, a one-realm login and a
// realm list not read yet cannot be reached through the Account page's fixture, and a page that names no realm domain
// reads the base API even with a realm selected (core hubApiBase), so its list is not one realm's.
import { bootFixtureCore } from '@core';
import { renderPage, screen, within } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const R1 = '5f0000000000000000000001';
const over: { domain: string | null; view: { selected: string; pinned: string | null; rows: unknown[] | null } | null } = { domain: null, view: null };

vi.mock('@core', async (importOriginal) => {
  const real = await importOriginal<typeof Core>();
  return {
    ...real,
    realmDomain: () => (over.domain !== null ? over.domain : real.realmDomain()),
    useRealms: () => {
      const v = real.useRealms();
      return over.view ?? v;
    },
  };
});

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});
afterEach(() => {
  over.domain = null;
  over.view = null;
});

const row = (id: string) => ({ id, name: { kind: 'alias', text: id.slice(-4) }, tint: '', computers: null });
const NOTES = ['k.realmNote', 'k.realmNoteSwitch'] as const;
const noNote = () => { for (const k of NOTES) expect(screen.queryByText(strings[k])).not.toBeInTheDocument(); };
const listed = async () => {
  const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
  expect(await within(table).findByText('atlas')).toBeInTheDocument();
};

describe('SSH keys: the words follow the realm the list was read in', () => {
  describe('a realm selected on a page that names no realm domain (the read goes to the base API): the plain words', () => {
    beforeEach(() => { over.domain = ''; });
    it('a whole list has no realm note', async () => {
      await renderPage(page);
      await listed();
      noNote();
    });
    it('an empty list says No computers to show', async () => {
      await renderPage(page, { state: 'keys-empty' });
      expect(await screen.findByText(strings['k.empty'], {}, { timeout: 8000 })).toBeInTheDocument();
      expect(screen.queryByText(strings['k.emptyRealm'])).not.toBeInTheDocument();
    });
    it('a partial list does not name a realm', async () => {
      await renderPage(page, { state: 'keys-partial' });
      expect(await screen.findByText(strings['k.partial'], {}, { timeout: 8000 })).toBeInTheDocument();
      expect(screen.queryByText(strings['k.partialRealm'])).not.toBeInTheDocument();
    });
  });

  it('a session pinned to one realm: this realm\'s note, never the way to All realms', async () => {
    over.view = { selected: R1, pinned: R1, rows: [row(R1)] };
    await renderPage(page);
    await listed();
    expect(await screen.findByText(strings['k.realmNote'])).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
  });

  it('a login with one realm: this realm\'s note, never the way to All realms', async () => {
    over.view = { selected: R1, pinned: null, rows: [row(R1)] };
    await renderPage(page);
    await listed();
    expect(await screen.findByText(strings['k.realmNote'])).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
  });

  it('the realm list not read yet: the note, without the hint', async () => {
    over.view = { selected: R1, pinned: null, rows: null };
    await renderPage(page);
    await listed();
    expect(await screen.findByText(strings['k.realmNote'])).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
  });

  it('several realms: the note with the way to All realms', async () => {
    over.view = { selected: R1, pinned: null, rows: [row(R1), row('5f0000000000000000000002')] };
    await renderPage(page);
    await listed();
    expect(await screen.findByText(strings['k.realmNoteSwitch'])).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNote'])).not.toBeInTheDocument();
  });

  it.each([
    ['keys-empty', 'k.emptyRealm'],
    ['keys-partial', 'k.partialRealm'],
  ] as const)('one realm, %s: only its own line, no note under it', async (state, key) => {
    over.view = { selected: R1, pinned: null, rows: [row(R1), row('5f0000000000000000000002')] };
    await renderPage(page, { state });
    expect(await screen.findByText(strings[key], {}, { timeout: 8000 })).toBeInTheDocument();
    noNote();
  });
});
