// "Use only the project's rules": the press's busy flag belongs to its own press in its own opening. A press still
// reading when the drawer is closed and opened again leaves the new opening's offer free, and its late answer never
// clears the busy flag of a later press that is still reading (AccessDrawer pressUse).
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { accessReadHold, computers, resetAccess } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import { links } from './links';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';
import pageStrings from './strings.en.json';

const { leaveAndReturn } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const ATLAS = computers[0]!;
if (ATLAS.project_id !== fixtureWorld.projects[0]!.id) throw new Error('fixture: the first computer is in the first project');
const SLOW = { timeout: 20000 };
const offer = (d: HTMLElement) => within(d).findByRole('button', { name: strings['acc.proj.use.go'] }, SLOW);
// Reading: the offer is the kit Button's busy state (RAC pending: data-pending, presses refused), never just disabled
// (a Button that drops isPending would show only its disabled look).
const pending = (b: HTMLElement) => b.hasAttribute('data-pending');

async function open() {
  const d = await screen.findByRole('tabpanel', undefined, SLOW);
  await within(d).findByText(strings['acc.now.advanced'], undefined, SLOW);
  return d;
}

beforeEach(() => resetAccess());

describe("computers: the busy flag of Use only the project's rules", () => {
  it('an earlier opening\'s press neither keeps the new offer busy nor ends a later press\'s busy flag', { timeout: 90000 }, async () => {
    await renderPage(page, { path: links.permissions(handleOf(ATLAS)), state: 'useRulesApplied' });
    let d = await open();
    // Press 1: its read of the rules is parked.
    accessReadHold.on = true;
    await userEvent.click(await offer(d));
    await waitFor(() => expect(accessReadHold.parked.length).toBeGreaterThan(0), SLOW);
    expect(pending(await offer(d))).toBe(true);
    // A second press in the same opening while press 1 reads is refused: no second read is parked.
    const parked = accessReadHold.parked.length;
    await userEvent.click(await offer(d));
    await new Promise((r) => setTimeout(r, 500));
    expect(accessReadHold.parked.length).toBe(parked);
    accessReadHold.on = false;
    // Leaving the tab and showing it again is a new opening.
    await leaveAndReturn(pageStrings);
    d = await open();
    // The new opening owns the flag: its offer is free while press 1 still waits.
    await waitFor(async () => expect(pending(await offer(d))).toBe(false), SLOW);
    // Press 2, parked too. Its read replaces press 1's, so press 1 settles while press 2 still reads.
    accessReadHold.on = true;
    await userEvent.click(await offer(d));
    await new Promise((r) => setTimeout(r, 1500));
    expect(pending(await offer(d))).toBe(true);
    accessReadHold.on = false;
    for (const release of accessReadHold.parked.splice(0)) release();
    await waitFor(async () => expect(pending(await offer(d))).toBe(false), SLOW);
  });
});
