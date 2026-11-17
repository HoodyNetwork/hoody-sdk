// New realm explains realms in the flow. Step 1 opens with three facts and a link to the FAQ; step 2 says a
// picked computer keeps its project and answers the two questions about it, each with a link to the full answer; step 3 lists what Create does, in order, and
// what the realm starts with; the results say a new computer needs a project when Get a computer is offered.
// The claims are written out here, never read from the strings table the page uses, so a wrong sentence fails.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetRealmsWorld } from './fixtures';
import page from './page';
import strings from './strings.en.json';

// Pages this load hides, as the shell's PagesProvider would: useServedPageLink gives none.
const hiddenPages = new Set<string>();
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, useServedPageLink: (id: string) => (hiddenPages.has(id) ? null : (kit.useServedPageLink as (id: string) => unknown)(id)) };
});

const T = 8000;
const [ATLAS] = fixtureWorld.computers;
if (!ATLAS) throw new Error('fixture computers');

const SAYS = {
  apart: 'Keys and shares limited to this realm reach only what is in it.',
  shared: 'A computer can be in several realms. All-realms keys and Global vault entries reach every realm.',
  free: 'Making a realm costs nothing. You pay for computers as before.',
  nameHelp: 'Shown in the realm menu on every device.',
  colorHelp: 'Kept on this device only; other devices keep their own colour.',
  pick: 'Each computer you pick joins this realm and keeps its other realms and its project. Skip this to start empty.',
  whyMoves: 'No. Each computer you pick joins this realm and keeps the realms it already has.',
  whyProjects: 'A new computer needs a project in the realm you are in. Get a computer offers a new project when the realm has none.',
  first: 'Saves the name in your vault.',
  then: 'Adds each picked computer, one at a time.',
  thenNone: 'No computers: the realm starts empty.',
  last: "If everything goes through, opens the new realm's Computers.",
  starts: 'Only the computers you picked. No keys of its own yet: keys set to All realms work in it now.',
  newComputers: 'A new computer needs a project in this realm; Get a computer offers one.',
};

async function named(name: string) {
  const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
  await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
}
const pick = async (name: string) => {
  const row = await waitFor(() => {
    const r = screen.getByText(name).closest<HTMLElement>('[data-row-id]');
    expect(r, name).not.toBeNull();
    return r as HTMLElement;
  }, { timeout: T });
  await userEvent.click(within(row).getByRole('checkbox'));
};
const linkTo = (label: string, id: string) => {
  const a = screen.getByRole('link', { name: label });
  expect(a.getAttribute('href') ?? '', label).toContain(`#faq-${id}`);
};
const reviewSection = async () => (await screen.findByRole('heading', { name: strings['review.title'] }, { timeout: T })).closest('section') as HTMLElement;
const inOrder = (els: HTMLElement[]) => {
  for (let i = 1; i < els.length; i++) expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
};

beforeEach(() => {
  resetRealmsWorld();
  hiddenPages.clear();
});

describe('realms: New realm explains realms', () => {
  it('step 1 opens with the three facts and a link to "What is a realm?"', async () => {
    await renderPage(page, { path: '/realms/new' });
    await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    const intro = screen.getByLabelText(strings['intro.title']);
    for (const v of [SAYS.apart, SAYS.shared, SAYS.free]) expect(within(intro).getByText(v)).toBeInTheDocument();
    linkTo(strings['intro.more'], 'whatIs');
    // The field's help line says the names are being read until they are; then it is the name's own help.
    expect(await screen.findByText(SAYS.nameHelp, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText(SAYS.colorHelp)).toBeInTheDocument();
  });

  it('step 2 says a computer keeps its project and links the two answers about picking', async () => {
    await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    expect(await screen.findByText(SAYS.pick, undefined, { timeout: T })).toBeInTheDocument();
    // Each question opens its short answer, which ends with the link to the full one.
    for (const [q, says, id] of [[strings['pick.faqMoves'], SAYS.whyMoves, 'pickMoves'], [strings['pick.faqProjects'], SAYS.whyProjects, 'projects']] as const) {
      await userEvent.click(screen.getByRole('button', { name: q }));
      const answer = (await screen.findByText(says, undefined, { timeout: T })).parentElement as HTMLElement;
      expect(within(answer).getByRole('link', { name: strings['pick.faqMore'] }).getAttribute('href') ?? '', q).toContain(`#faq-${id}`);
    }
  });

  it('step 3 lists what Create does, in order, and what the realm starts with', async () => {
    await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    const review = await reviewSection();
    inOrder([SAYS.first, SAYS.thenNone, SAYS.last, SAYS.starts].map((v) => within(review).getByText(v)));
    expect(within(review).queryByText(SAYS.then)).toBeNull();
  });

  it('with a computer picked, step 3 says each is added one at a time', async () => {
    await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await pick(ATLAS.name);
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    const review = await reviewSection();
    inOrder([SAYS.first, SAYS.then, SAYS.last].map((v) => within(review).getByText(v)));
    expect(within(review).queryByText(SAYS.thenNone)).toBeNull();
  });

  it('results that offer Get a computer say a new computer needs a project', async () => {
    await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    await userEvent.click(await screen.findByRole('button', { name: strings.create }));
    await screen.findByRole('button', { name: strings.get }, { timeout: T });
    expect(screen.getByText(SAYS.newComputers)).toBeInTheDocument();
  });

  it('with Computers not served here, step 3 never promises to open it, and the results offer no new computer', async () => {
    hiddenPages.add('computers');
    await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await userEvent.click(screen.getByRole('button', { name: strings.next }));
    const review = await reviewSection();
    inOrder([SAYS.first, SAYS.then, SAYS.starts].map((v) => within(review).getByText(v)));
    expect(within(review).queryByText(SAYS.last)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings.create }));
    // The results' recap is up (the same Facts the new-computers row would join).
    expect(await screen.findByText(strings['done.joined'], undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings.get })).toBeNull();
    expect(screen.queryByText(SAYS.newComputers)).toBeNull();
  });
});
