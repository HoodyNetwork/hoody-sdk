// Keys > API keys: a key saved with no name is "Unnamed key" wherever the page names it: the table cell, the Delete
// question, the inspector's title, the Edit and Copy drawers' titles and the messages about its changes (never an
// empty title, "Edit ", "change to ." or " is still in the list").
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import { resetAttempts } from '@core/attempts';
import { ATTEMPT_PREFIX, readChanges, writeChanges } from '@core/change-store';
import { deleteUnknownMade, sent } from './fixtures';
import page from './page';
import strings from './strings.en.json';

function freshStart(): void {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
}

async function openUnnamed(): Promise<HTMLElement> {
  await renderPage(page, { state: 'unnamedKey' });
  const row = await screen.findByRole('row', { name: new RegExp(strings.unnamed) }, { timeout: 8000 });
  await userEvent.click(within(row).getByText(strings.unnamed));
  return screen.getByRole('region', { name: 'Details' });
}

describe('keys: an unnamed key', () => {
  beforeEach(() => freshStart());
  afterEach(() => {
    deleteUnknownMade.unnamed = false;
  });

  it('has "Unnamed key" as its inspector title', async () => {
    const insp = await openUnnamed();
    expect(within(insp).getByRole('heading', { name: strings.unnamed })).toBeInTheDocument();
  }, 40000);

  it('has "Edit Unnamed key" as its Edit drawer title', async () => {
    const insp = await openUnnamed();
    await userEvent.click(within(insp).getByRole('button', { name: strings['act.edit'] }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: strings['ed.title'].replace('{{name}}', strings.unnamed) })).toBeInTheDocument();
  }, 40000);

  it('has "Copy Unnamed key" as its Copy drawer title', async () => {
    const insp = await openUnnamed();
    await userEvent.click(within(insp).getByRole('button', { name: strings['act.copy'] }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: strings['cp.title'].replace('{{name}}', strings.unnamed) })).toBeInTheDocument();
  }, 40000);

  it('a copy made with no name and no secret, whose delete is unconfirmed: the Check names it "Unnamed key"', async () => {
    deleteUnknownMade.unnamed = true;
    sent.remove = 0;
    await renderPage(page, { state: 'deleteUnknownListed' });
    const row = await screen.findByRole('row', { name: /ci-deploy/ }, { timeout: 8000 });
    await userEvent.click(within(row).getByText('ci-deploy'));
    await userEvent.click(within(screen.getByRole('region', { name: 'Details' })).getByRole('button', { name: strings['act.copy'] }));
    const drawer = await screen.findByRole('dialog');
    // The name is left empty.
    await userEvent.click(within(drawer).getByRole('button', { name: strings['cp.go'] }));
    await userEvent.click(await within(drawer).findByRole('button', { name: strings['ns.action'] }, { timeout: 10000 }));
    await userEvent.click(await within(drawer).findByRole('button', { name: strings['action.checkAgain'] }, { timeout: 10000 }));
    expect(await within(drawer).findByText(strings['del.notYet'].replace('{{name}}', strings.unnamed), {}, { timeout: 10000 })).toBeInTheDocument();
    expect(sent.remove).toBe(1);
  }, 40000);
});
