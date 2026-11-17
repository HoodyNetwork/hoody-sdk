// Guide reads the computers list through core's computersPage. A body without a list is a
// read error; one row is "the" computer only on a whole list; "no computer" is never read from a failed read (the error shows with
// Try again); a picked computer whose addresses cannot be built is never "no computer picked".
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('guide: the computers list read', () => {
  it('a 200 without a list is a read error with Try again, never "no computer"', async () => {
    await renderPage(page, { state: 'badBody', computer: false });
    // The first render of a file loads the page cold: up to 30 s for it to appear (the cold load can be slow on a busy machine).
    expect(await screen.findByText(strings['rail.unknown'], undefined, { timeout: 30_000 })).toBeInTheDocument();
    expect(screen.getByText(strings['links.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.none'])).toBeNull();
  }, 45_000);

  it('a refetch that fails after an empty read shows the read error, not "no computer"', async () => {
    const r = await renderPage(page, { state: 'emptyThenFail', computer: false });
    expect(await screen.findByText(strings['links.none'])).toBeInTheDocument();
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    expect(await screen.findByText(strings['links.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.none'])).toBeNull();
  });

  it('a refetch that fails after a computer was read keeps its facts (no claim of absence)', async () => {
    const r = await renderPage(page, { state: 'oneThenFail', computer: false });
    expect(await screen.findByText(strings['links.http'])).toBeInTheDocument();
    await act(async () => {
      await r.queryClient.refetchQueries();
    });
    await act(async () => {
      await new Promise((x) => setTimeout(x, 300));
    });
    expect(screen.getByText(strings['links.http'])).toBeInTheDocument();
    expect(screen.queryByText(strings['rail.unknown'])).toBeNull();
  });

  it('one row on page 1 of 2 is not taken as the computer', async () => {
    await renderPage(page, { state: 'onePageOfMany', computer: false });
    expect(await screen.findByText(strings['links.none'])).toBeInTheDocument();
  });

  it('the only row of a whole list is the computer (the control)', async () => {
    await renderPage(page, { state: 'stopped', computer: false });
    expect(await screen.findByText(strings['links.http'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.none'])).toBeNull();
  });

  it('a picked computer whose addresses cannot be built says so, never "no computer picked"', async () => {
    await renderPage(page, { state: 'badNode', computer: false });
    expect(await screen.findByText(strings['links.noAddress'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.none'])).toBeNull();
  });

  it('another realm\'s only computer in an account-wide list is never this realm\'s computer', async () => {
    await renderPage(page, { state: 'otherRealmOnly', computer: false });
    expect(await screen.findByText(strings['links.none'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.http'])).toBeNull();
  });

  it('beside another realm\'s computer, the realm\'s one computer is still its computer', async () => {
    await renderPage(page, { state: 'mixedRealms', computer: false });
    expect(await screen.findByText(strings['links.http'])).toBeInTheDocument();
    expect(screen.queryByText(strings['links.none'])).toBeNull();
  });
});
