// New realm on fixtures: an empty realm, one with computers, a lost name checked then sent again, a refused
// computer, and a shared-access session. Each test resets the shared fixture world first.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { liveIo, type SetRealms } from './data';
import { realmSends, resetRealmsWorld } from './fixtures';
import page from './page';
import kitStates from '@kit/states/strings.en.json';
import strings from './strings.en.json';

const T = 8000;
const [ATLAS, BOREALIS] = fixtureWorld.computers;
if (!ATLAS || !BOREALIS) throw new Error('fixture computers');
const puts = (part: string) => realmSends.filter((s) => s.method === 'PUT' && s.path.includes(part));
const nameOf = (body: unknown) => JSON.parse((body as { value: string }).value) as Record<string, string>;
// A run made in full goes on to the new realm's Computers at once (endlinks.test.tsx has the link itself).
const wentOn = async (router: { state: { location: { pathname: string } } }) => {
  await waitFor(() => expect(router.state.location.pathname).toBe('/computers'), { timeout: T });
};

async function named(name: string) {
  const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
  await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
}
// The row is looked up afresh until the name shows inside one, never held: the table may draw again (a new render, or
// table -> list once it is measured) and a node found before that can be gone.
const pick = async (name: string) => {
  const row = await waitFor(() => {
    const r = screen.getByText(name).closest<HTMLElement>('[data-row-id]');
    expect(r, name).not.toBeNull();
    return r as HTMLElement;
  }, { timeout: T });
  await userEvent.click(within(row).getByRole('checkbox'));
};
const create = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
  await userEvent.click(await screen.findByRole('button', { name: strings.create }));
};

beforeEach(() => resetRealmsWorld());

describe('realms: New realm', () => {
  it('a name the server refuses shows the refusal\'s own sentence with its Details, and no computer is sent', async () => {
    await renderPage(page, { path: '/realms/new', state: 'nameRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    expect(await screen.findByText(strings['name.notMade'], undefined, { timeout: T })).toBeInTheDocument();
    const line = document.querySelector('[data-outcome="failed"]') as HTMLElement;
    expect(within(line).getByRole('button', { name: /details/i })).toBeInTheDocument();
    // The body is the refusal's own mapped sentence, not the generic one.
    expect(within(line).queryByText(strings['name.refused'])).toBeNull();
    expect(puts('/computers/')).toHaveLength(0);
  });

  it('a names read without an ETag: the name is refused before it is sent, said plainly, and Try again stays', async () => {
    await renderPage(page, { path: '/realms/new', state: 'nameNoEtag' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    const line = await waitFor(() => {
      const l = document.querySelector<HTMLElement>('[data-outcome="not_sent"]');
      expect(l).not.toBeNull();
      return l as HTMLElement;
    }, { timeout: T });
    expect(within(line).getByText(strings['name.unsafeNow'])).toBeInTheDocument();
    expect(within(line).getByRole('button', { name: /try again/i })).toBeEnabled();
    expect(puts('/vault/keys/')).toHaveLength(0);
    expect(puts('/computers/')).toHaveLength(0);
  });

  it('an answered name whose read right after fails: not called ready, no computer, until Check again shows it', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'nameUnchecked' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    expect(await screen.findByText(strings['name.unchecked'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText('Studio is ready.')).toBeNull();
    expect(puts('/computers/')).toHaveLength(0);
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, { timeout: T }));
    await userEvent.click(await screen.findByRole('button', { name: strings['items.start'] }, { timeout: T }));
    await wentOn(router);
    expect(puts('/vault/keys/')).toHaveLength(1);
    expect(puts('/computers/')).toHaveLength(1);
    // Three waits of up to T each: the case's own budget covers them under a loaded full run.
  }, 4 * T);

  it('refuses a name another realm has, and leaves step 1', async () => {
    await renderPage(page, { path: '/realms/new' });
    await named('personal');
    expect(await screen.findByText(strings['name.taken'])).toBeInTheDocument();
    expect(screen.getByLabelText(strings['name.label'])).toBeInTheDocument();
  });

  it('makes an empty realm with one name write and no computer write', async () => {
    const { router } = await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await create();
    await wentOn(router);
    expect(puts('/vault/keys/')).toHaveLength(1);
    expect(Object.values(nameOf(puts('/vault/keys/')[0]?.body))).toContain('Studio');
    expect(puts('/computers/')).toHaveLength(0);
  });

  it('adds each picked computer once, keeping the realms it had', async () => {
    const { router } = await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await pick(ATLAS.name);
    await pick(BOREALIS.name);
    await create();
    await wentOn(router);
    const id = Object.entries(nameOf(puts('/vault/keys/')[0]?.body)).find(([, n]) => n === 'Studio')?.[0];
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    const sent = puts('/computers/');
    expect(sent).toHaveLength(2);
    const atlas = sent.find((s) => s.path.includes(ATLAS.id))?.body as { realm_ids: string[] };
    expect([...atlas.realm_ids].sort()).toEqual([...ATLAS.realm_ids, id].sort());
  });

  it('a lost name answer sends nothing more; Check again reads, finds it missing, then Try again sends it', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'nameLost' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    const check = await screen.findByRole('button', { name: /check again/i }, { timeout: T });
    // Said plainly: the name may not have saved.
    expect(screen.getByText(strings['name.mayNotSave'])).toBeInTheDocument();
    expect(puts('/vault/keys/')).toHaveLength(1);
    expect(puts('/computers/')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    await userEvent.click(check);
    expect(await screen.findByText(strings['name.notSeen'], undefined, { timeout: T })).toBeInTheDocument();
    // The earlier write may still land: shown as pending with Check again, never as failed.
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(puts('/vault/keys/')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await wentOn(router);
    expect(puts('/vault/keys/')).toHaveLength(2);
    expect(puts('/computers/')).toHaveLength(1);
  });

  it('a lost name answer, then a refused Try again: still pending on the earlier try, never "not made"; Check again, no resend', async () => {
    await renderPage(page, { path: '/realms/new', state: 'nameLostThenRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, { timeout: T }));
    await userEvent.click(await screen.findByRole('button', { name: /try again/i }, { timeout: T }));
    await waitFor(() => expect(puts('/vault/keys/')).toHaveLength(2), { timeout: T });
    // The pending line settles with its Check again (a loaded run can draw the sentence a moment before the button).
    const line = await waitFor(() => {
      const l = document.querySelector('[data-outcome="pending"]') as HTMLElement | null;
      expect(l?.textContent ?? '').toContain('The earlier try may still land');
      expect(within(l!).getByRole('button', { name: /check again/i })).toBeInTheDocument();
      return l!;
    }, { timeout: T });
    expect(screen.queryByText(strings['name.notMade'])).toBeNull();
    expect(document.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(within(line).getByRole('button', { name: /details/i })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(puts('/vault/keys/')).toHaveLength(2);
    expect(puts('/computers/')).toHaveLength(0);
  });

  it('a lost name answer that did land is proved by Check again, which sends nothing; the computers go on their own press', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'nameLanded' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    await userEvent.click(await screen.findByRole('button', { name: /check again/i }, { timeout: T }));
    expect(await screen.findByText('1 computer is not added yet.', undefined, { timeout: T })).toBeInTheDocument();
    expect(puts('/computers/')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: strings['items.start'] }));
    await wentOn(router);
    expect(puts('/vault/keys/')).toHaveLength(1);
    expect(puts('/computers/')).toHaveLength(1);
  });

  it('a refused computer shows Refused and the headline says it was not added; the realm is still made', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    expect(await screen.findByText('1 computer is not in the realm.', undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('Studio was created.')).toBeInTheDocument();
    expect(screen.getByText(strings['item.failed'])).toBeInTheDocument();
    expect(puts('/computers/')).toHaveLength(1);
    // The refusal's facts are one press away, beside Refused.
    await userEvent.click(within(screen.getByText(strings['item.failed']).closest('td') as HTMLElement).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByRole('dialog', { name: kitStates['err.detailsTitle'] })).toHaveTextContent('403');
  });

  it('leaving while the name may have gone through asks first; Stay keeps the page and its Check again', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'nameLost' });
    await named('Studio');
    await create();
    await screen.findByRole('button', { name: /check again/i }, { timeout: T });
    await act(async () => { void router.navigate({ to: '/computers' as never }); await new Promise((r) => setTimeout(r, 10)); });
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] }, { timeout: T });
    await userEvent.click(d.querySelector('[data-dialog-cancel]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(puts('/vault/keys/')).toHaveLength(1);
  });

  it('leaving the page stops the engine: its io reads as dead once the page is gone', async () => {
    await renderPage(page, { path: '/realms/new' });
    const m = {} as SetRealms;
    expect(liveIo(m, () => true).alive()).toBe(true);
    expect(liveIo(m, () => false).alive()).toBe(false);
  });

  it('a shared-access session cannot make a realm', async () => {
    await renderPage(page, { path: '/realms/new', state: 'pinned' });
    expect(await screen.findByText(strings['pinned.title'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.next })).toBeNull();
  });
});
