// The Delete project dialog names whose membership it ends: the people the project is shared
// with, read from its member list; an owner's own row is not a person. A list that failed or is paused offline, or a
// shared-key session (which reads no people at all), adds nothing and blocks nothing: Delete still waits only for the
// count. A list not
// read whole says "at least"; while a lost delete is held the dialog names nobody.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { interpolate } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { memberReads, projectSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const LAB = fixtureWorld.projects[2];
if (!LAB) throw new Error('fixture project');
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const deletes = () => projectSends.filter((x) => x.method === 'DELETE');

async function openDelete(state: string, settled?: (row: HTMLElement) => Promise<unknown>) {
  const r = await renderPage(page, { path: '/computers/projects', state });
  const row = await rowOf(LAB!.name);
  // The list reads the same roster (its Permissions column): waiting for its fact there waits for the read to settle.
  if (settled) await settled(row);
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
  const d = await screen.findByRole('alertdialog');
  await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB!.name })));
  return Object.assign(d, { queryClient: r.queryClient });
}

async function sendsOnce(d: HTMLElement) {
  const go = within(d).getByRole('button', { name: strings['projx.go'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  await waitFor(() => expect(deletes()).toHaveLength(1));
}

beforeEach(() => {
  projectSends.length = 0;
  memberReads.length = 0;
});

describe('Delete project: whose membership ends', () => {
  it('names the people on the project, never the owner\'s own row, and Delete is still sent once', async () => {
    const d = await openDelete('projectEmptyPeople');
    const line = interpolate(strings['pp.del.people_other'], { count: 2, names: 'jane_smith, bob' });
    expect(line).toBe('It also ends the membership of 2 people: jane_smith, bob.');
    await waitFor(() => expect(d).toHaveTextContent(line));
    expect(d).not.toHaveTextContent('ada');
    await sendsOnce(d);
  });

  it('past five people it names five, then says how many more', async () => {
    const d = await openDelete('projectEmptyPeople7');
    await waitFor(() => expect(d).toHaveTextContent('It also ends the membership of 7 people: ann, ben, cat, dan, eve and 2 more.'));
    expect(d).not.toHaveTextContent('fay');
    expect(d).not.toHaveTextContent('gus');
  });

  it('a list not read whole says "at least"', async () => {
    const d = await openDelete('projectEmptyPeopleCut');
    await waitFor(() => expect(d).toHaveTextContent('It also ends the membership of at least 2 people: jane_smith, bob.'));
  });

  it('a member list that failed adds no line and does not block Delete', async () => {
    const d = await openDelete('projectEmptyPeopleFail', (row) => within(row).findByText(strings['pp.fact.people.failed'], {}, { timeout: 8000 }));
    expect(d).not.toHaveTextContent(/membership of/);
    await sendsOnce(d);
    expect(d).not.toHaveTextContent(/membership of/);
  });

  it('nobody else on the project: no line', async () => {
    const d = await openDelete('projectEmpty', (row) => within(row).findByText(strings['pp.fact.onlyYou'], {}, { timeout: 8000 }));
    expect(d).not.toHaveTextContent(/membership of/);
  });

  it('a shared-key session reads no people for the dialog', async () => {
    const d = await openDelete('projectEmptyPeopleKey');
    expect(d).not.toHaveTextContent(/membership of/);
    await sendsOnce(d);
    expect(memberReads).toEqual([]);
  });

  it('a read paused offline drops the people it held before, and Delete stays as the count makes it', async () => {
    const d = await openDelete('projectEmptyPeople');
    const line = interpolate(strings['pp.del.people_other'], { count: 2, names: 'jane_smith, bob' });
    await waitFor(() => expect(d).toHaveTextContent(line));
    const go = within(d).getByRole('button', { name: strings['projx.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    // The browser's offline event: the query layer pauses its reads (TanStack's onlineManager listens to it).
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    try {
      await act(async () => {
        await d.queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('members') });
      });
      await waitFor(() => expect(d).not.toHaveTextContent(line));
      expect(d).not.toHaveTextContent(/membership of/);
      expect(go).toBeEnabled();
    } finally {
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });

  it('while a lost delete is held the dialog names nobody', async () => {
    const d = await openDelete('projectPendingPeople');
    const line = interpolate(strings['pp.del.people_other'], { count: 2, names: 'jane_smith, bob' });
    await waitFor(() => expect(d).toHaveTextContent(line));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB!.name })));
    expect(d).not.toHaveTextContent(line);
    expect(deletes()).toHaveLength(1);
  });
});
