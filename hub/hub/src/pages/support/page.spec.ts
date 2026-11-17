// Playwright: the Support page's flows on fixtures (run by hub:check --page support). The functional e2e of a list page,
// minus sort and paging: the list is the API's order (most recent activity first) and pages with Load more, so neither
// is URL state; @api-order and @cursor prove those instead (the conformance exception in app/conformance.test.ts EXCEPTIONS.support). The status
// segment is one exact API filter, kept in ?status.
import { type Page, expect, test } from '@playwright/test';
import { expectLinkSearchDroppedOnReload, expectSearchStaysOutOfUrl, gotoHub, hubUrl } from '@app/e2e';
import kit from '@kit/strings.en.json';
import states from '@kit/states/strings.en.json';
import strings from './strings.en.json';

const table = (page: Page) => page.getByRole('table', { name: strings.title });
const dataRows = (page: Page) => table(page).locator('tbody tr');

test('@search the search box narrows the loaded rows and never writes ?q', async ({ page }) => {
  await gotoHub(page, '/support');
  await expect(dataRows(page).first()).toBeVisible();
  // The search is client-side over the loaded subjects: of the seven fixture tickets
  // exactly one is an invoice ticket. The Support list is a status view (kind 'status', no sort or page).
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByRole('searchbox'), kind: 'status' }, {
    text: 'invoice',
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/invoice/i);
    },
  });
});

test('@filter a status segment reads that status only and keeps ?status', async ({ page }) => {
  await gotoHub(page, '/support');
  await page.getByRole('radio', { name: strings['filter.closed'] }).click();
  await expect(page).toHaveURL(/[?&]status=closed/);
  await expect(dataRows(page).first()).toBeVisible();
  for (const row of await dataRows(page).all()) await expect(row).toContainText(/Closed/);
});

test('@reload status and the open ticket survive a reload, the search does not', async ({ page }) => {
  // The link brings the search with ?status=closed and the open ticket; the helper proves the search is adopted once,
  // out of the URL, and gone after the reload while status and sel keep their values. Closed tickets: three; only
  // the October refund ticket matches 'refund'.
  await expectLinkSearchDroppedOnReload(page, { param: '', box: page.getByRole('searchbox'), kind: 'status' }, {
    text: 'refund',
    path: '/support',
    keep: { status: 'closed', sel: '0000000000000000' + (0x6720a1b2 + 4).toString(16) },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all()) await expect(row).toContainText(/refund/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(3);
    },
    after: async () => {
      await expect(page.getByText('We refunded the second charge. It shows on your card in a few days.')).toBeVisible();
    },
  });
});

test('@no-match a search with no result shows the no-match state; Clear filters restores the rows', async ({ page }) => {
  await gotoHub(page, '/support');
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole('searchbox').fill('zzzz-no-such-thing');
  await expect(page.getByText(strings.noMatch)).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

// The two proofs that stand in for @sort and @page (EXCEPTIONS.support): the rows are the API's order, and Load more
// follows the cursor, starting again from page one once when the server no longer takes it.
const API_ORDER = ['A ticket with many messages', 'How do I add a domain?', 'Computer will not start after resize', '<b>bold</b> **subject**', 'Invoice shows the wrong country', 'Old question about bots'];
const order = (rows: string[]) => rows.map((row) => API_ORDER.findIndex((s) => row.includes(s)));

test('@api-order the rows are the API order; Load more appends the next page after them, never re-sorted', async ({ page }) => {
  await gotoHub(page, '/support', { state: 'apiOrder' });
  await expect(dataRows(page)).toHaveCount(3);
  expect(order(await dataRows(page).allTextContents())).toEqual([0, 1, 2]);
  await page.getByRole('button', { name: strings['action.loadMore'] }).click();
  await expect(dataRows(page)).toHaveCount(6);
  expect(order(await dataRows(page).allTextContents())).toEqual([0, 1, 2, 3, 4, 5]);
});

test('@cursor a Load more cursor refused INVALID_CURSOR starts again from page one once; Load more then continues', async ({ page }) => {
  await gotoHub(page, '/support', { state: 'cursorExpired' });
  await expect(dataRows(page)).toHaveCount(3);
  await page.getByRole('button', { name: strings['action.loadMore'] }).click();
  await expect(dataRows(page)).toHaveCount(3);
  await expect(page.getByText(strings['list.partial'])).toHaveCount(0);
  await page.getByRole('button', { name: strings['action.loadMore'] }).click();
  await expect(dataRows(page)).toHaveCount(6);
  await expect(page.getByText(strings['list.partial'])).toHaveCount(0);
});

test('a lost reply locks the draft and offers Check again only', async ({ page }) => {
  await gotoHub(page, '/support?sel=0000000000000000' + (0x6720a1b2 + 2).toString(16), { state: 'sendUnknown' });
  await page.getByLabel(strings['reply.label']).fill('Any news on the invoice?');
  await page.getByRole('button', { name: strings['action.send'], exact: true }).click();
  await expect(page.locator('[data-outcome="pending"]').first()).toBeVisible();
  await expect(page.getByLabel(strings['reply.label'])).not.toBeEditable();
  await expect(page.getByRole('button', { name: strings['action.send'], exact: true })).toBeDisabled();
});

// A sent ticket flashed the orange pending banner, and the drawer stayed open asking to discard. The
// drawer is opened by its button: only that push makes its close step back in history, the step the ticket's own
// navigation raced. A banner that shows only while a write is out is gone again by any later look, and toHaveCount(0)
// retries until it is, so the watch looks after each batch of DOM changes from the press on (a banner added and removed
// inside one task shows in no batch).
const newTicket = (page: Page) => page.getByRole('dialog', { name: strings['new.title'] });
const pendingBanner = (page: Page) => page.locator('[data-outcome="pending"]');
/** A whole new load of the app, the wait of a reload or a second tab on a busy machine. */
const BOOT_MS = 60000;
const OPEN_TICKET = '0000000000000000' + (0x6720a1b2 + 2).toString(16);

async function fillNewTicket(page: Page) {
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the header's and the empty detail's button open the same drawer
  const d = newTicket(page);
  await expect(d).toBeVisible();
  await d.getByRole('button', { name: new RegExp(strings['new.category']) }).click();
  await page.getByRole('option', { name: new RegExp(`^${strings['category.billing']}`) }).click();
  await d.getByLabel(strings['new.subject']).fill('Cannot reach my computer');
  await d.getByLabel(strings['new.message']).fill('It stopped answering this morning.');
  return d.getByRole('button', { name: strings['action.sendTicket'] });
}

const watchPending = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { pendingSeen: number };
    w.pendingSeen = 0;
    const look = () => {
      if (document.querySelector('[data-outcome="pending"]')) w.pendingSeen++;
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
const pendingSeen = (page: Page) => page.evaluate(() => (window as unknown as { pendingSeen: number }).pendingSeen);

async function expectCreatedAndOpen(page: Page) {
  await expect(newTicket(page)).toBeHidden({ timeout: 20000 });
  await expect(page.getByText(kit['drawer.discardAsk'])).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]sel=/);
  await expect(page).not.toHaveURL(/[?&]new=/);
  await expect(page.getByText('It stopped answering this morning.')).toBeVisible();
  expect(await pendingSeen(page), 'no pending banner on the way').toBe(0);
}

test('@send a New ticket answered at once closes its drawer and opens the ticket', async ({ page }) => {
  await gotoHub(page, '/support');
  const send = await fillNewTicket(page);
  await watchPending(page);
  await send.click();
  await expectCreatedAndOpen(page);
});

for (const theme of ['light', 'dark'] as const) {
  test(`@send (${theme}) a slow New ticket shows no pending banner, then closes and opens the ticket`, async ({ page }) => {
    await gotoHub(page, '/support', { state: 'sendSlow', theme });
    const send = await fillNewTicket(page);
    await watchPending(page);
    await send.click();
    await expect(newTicket(page).getByLabel(strings['new.message'])).not.toBeEditable();
    await expect(send).toHaveAttribute('data-pending', 'true');
    await expectCreatedAndOpen(page);
  });
}

test('@send a lost New ticket keeps the drawer open, the draft locked and the pending banner up, after a reload too', async ({ page }) => {
  await gotoHub(page, '/support', { state: 'sendUnknown' });
  const send = await fillNewTicket(page);
  await send.click();
  await expect(newTicket(page).locator('[data-outcome="pending"]')).toBeVisible();
  await expect(newTicket(page).getByLabel(strings['new.message'])).not.toBeEditable();
  await expect(send).toBeDisabled();
  await expect(page).not.toHaveURL(/[?&]sel=/);
  await page.reload();
  await expect(newTicket(page).locator('[data-outcome="pending"]')).toBeVisible({ timeout: BOOT_MS });
  await expect(newTicket(page).getByRole('button', { name: strings['action.sendTicket'] })).toBeDisabled();
});

test("@send another tab's send still out shows the pending banner here, and none in the tab sending it", async ({ page }) => {
  await gotoHub(page, '/support', { state: 'sendSlow' });
  const send = await fillNewTicket(page);
  const other = await page.context().newPage();
  await other.goto(hubUrl('/support?new=1', { state: 'sendSlow' }));
  await expect(newTicket(other)).toBeVisible({ timeout: BOOT_MS });
  await expect(pendingBanner(other)).toHaveCount(0);
  await watchPending(page);
  await send.click();
  await expect(pendingBanner(other)).toBeVisible();
  await expect(newTicket(other).getByRole('button', { name: strings['action.sendTicket'] })).toBeDisabled();
  await expectCreatedAndOpen(page);
  await other.close();
});

test('@send a slow reply shows no pending banner, and clears the box', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendSlow' });
  const box = page.getByLabel(strings['reply.label']);
  await box.fill('Any news on the invoice?');
  await watchPending(page);
  await page.getByRole('button', { name: strings['action.send'], exact: true }).click();
  await expect(box).not.toBeEditable();
  await expect(box).toHaveValue('', { timeout: 20000 });
  expect(await pendingSeen(page), 'no pending banner on the way').toBe(0);
});

test('@send a reply box mounted again while its send is out reads busy and locked, without a pending banner', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendHeld' });
  await page.getByLabel(strings['reply.label']).fill('Any news on the invoice?');
  await watchPending(page);
  await page.getByRole('button', { name: strings['action.send'], exact: true }).click();
  await dataRows(page).filter({ hasText: 'How do I add a domain?' }).click();
  await expect(page).not.toHaveURL(new RegExp(OPEN_TICKET));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(OPEN_TICKET));
  const again = page.getByRole('button', { name: strings['action.send'], exact: true });
  await expect(again).toHaveAttribute('data-pending', 'true');
  await expect(page.getByLabel(strings['reply.label'])).not.toBeEditable();
  expect(await pendingSeen(page), 'no pending banner on the way').toBe(0);
});

/** fixtures.ts HELD_WRITE_MS: moving the clock this far brings a held write's answer. */
const HELD_WRITE_MS = 50000;
/** data.ts WRITE_TIMEOUT_MS plus core's 5 s slack on one call: past this a write that never answers has ended. */
const PAST_WRITE_TIMEOUT_MS = 66000;
const STOP_TRACKING = states['err.stopTracking'];
/** Waits until the fixture has the write: from then on its call's timeout is armed, so moving the clock reaches it. */
const writesSeen = (page: Page) => page.evaluate(() => (globalThis as { supportWritesSeen?: number }).supportWritesSeen ?? 0);
const writeArrived = (page: Page) => expect.poll(() => writesSeen(page)).toBe(1);
/** Stop tracking, through the kit's warning. */
async function stopTracking(page: Page) {
  await pendingBanner(page).getByRole('button', { name: STOP_TRACKING }).click();
  await page.getByRole('alertdialog', { name: states['outcome.pending.dismissTitle'] }).getByRole('button', { name: states['outcome.pending.dismissConfirm'] }).click();
}

/** Leaves through the palette, which works over a busy drawer or dialog, to the Support page with nothing selected.
 *  Enter acts on the palette's active row. The palette makes the first row active only when typing changes the list:
 *  on a dev server serving the Support page alone every row already matches "Support", so no row is active and Enter
 *  does nothing (a wait for an active row never ends). So the helper moves the active row with the arrow keys, as a keyboard user
 *  would, one key at a time: each key waits until the active row has moved (the row React Aria marks data-focused), and
 *  before Enter both that row and the searchbox's aria-activedescendant (which React Aria may update up to 500 ms later)
 *  must be the Support page's row. Everything is read inside the palette. */
async function leaveByPalette(page: Page) {
  await page.mouse.move(0, 0); // a resting pointer over a row would move the active row on hover
  await page.keyboard.press('Control+k');
  // The palette: the one dialog holding a searchbox (its modal hides what is behind it from the accessibility tree).
  const palette = page.getByRole('dialog').filter({ has: page.getByRole('searchbox') });
  await expect(palette).toHaveCount(1);
  const field = palette.getByRole('searchbox');
  await expect(field).toBeFocused();
  await page.keyboard.type(strings.title);
  const row = palette.getByRole('menuitem', { name: strings.title, exact: true });
  await expect(row).toHaveCount(1);
  const target = await row.getAttribute('id');
  expect(target, "the Support page's row has an id").toBeTruthy();
  const rows = palette.getByRole('menuitem');
  const ids = await rows.evaluateAll((els) => els.map((e) => e.id));
  const to = ids.indexOf(target!);
  expect(to, "the Support page's row is in the palette's list").toBeGreaterThanOrEqual(0);
  const activeId = async () => {
    const on = await rows.evaluateAll((els) => els.filter((e) => e.getAttribute('data-focused') === 'true').map((e) => e.id));
    expect(on.length, 'at most one active row').toBeLessThanOrEqual(1);
    return on[0] ?? null;
  };
  for (let step = 0; step <= ids.length; step++) {
    const now = await activeId();
    if (now === target) break;
    // No active row: ArrowDown makes the first one active. Otherwise one step toward the Support page's row.
    await page.keyboard.press(now !== null && ids.indexOf(now) > to ? 'ArrowUp' : 'ArrowDown');
    await expect.poll(activeId, { timeout: 2000, message: 'the active row moves with each arrow key' }).not.toBe(now);
  }
  expect(await activeId(), "the Support page's row is active").toBe(target);
  await expect(field).toHaveAttribute('aria-activedescendant', target!);
  await page.keyboard.press('Enter');
  await expect(row).toHaveCount(0);
}

test('@send a slow New ticket left through the palette moves nothing when its answer comes', async ({ page }) => {
  await gotoHub(page, '/support', { state: 'sendSlow' });
  await (await fillNewTicket(page)).click();
  await leaveByPalette(page);
  await expect(newTicket(page)).toBeHidden();
  await dataRows(page).filter({ hasText: 'How do I add a domain?' }).click();
  const chosen = page.url();
  expect(chosen).toMatch(/[?&]sel=/);
  // The fixture's write lands at once and only its answer is late, so the new row says nothing about the answer.
  await page.waitForTimeout(8000); // reason: past the fixture's 6 s answer; nothing may happen, so there is no event to wait for
  expect(page.url()).toBe(chosen);
});

// A New ticket opened again while its send is out reads busy and stays open. A
// drawer left open on sent text, unlocked, invites a duplicate ticket: a definite success opens the created ticket.
test('@send a New ticket opened again while its send is out reads busy, stays open, and its answer, sent, opens the created ticket', async ({ page }) => {
  await page.clock.install();
  await gotoHub(page, '/support', { state: 'sendHeld' });
  await (await fillNewTicket(page)).click();
  await leaveByPalette(page);
  await expect(newTicket(page)).toBeHidden();
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the header's and the empty detail's button open the same drawer
  const again = newTicket(page).getByRole('button', { name: strings['action.sendTicket'] });
  await expect(again).toHaveAttribute('data-pending', 'true');
  await expect(pendingBanner(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(again).toBeVisible();
  await page.clock.fastForward(HELD_WRITE_MS);
  await expect(newTicket(page)).toBeHidden({ timeout: 20000 });
  await expect(page).toHaveURL(/[?&]sel=/);
  await expect(page).not.toHaveURL(/[?&]new=/);
});

async function pressClose(page: Page) {
  await page.getByRole('button', { name: kit['action.more'] }).click();
  await page.getByRole('menuitem', { name: strings['action.close'] }).click();
  return page.getByRole('button', { name: strings['close.confirm'] });
}

test('@send a slow close shows no pending banner on the way', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendSlow' });
  const confirm = await pressClose(page);
  await watchPending(page);
  await confirm.click();
  await expect(confirm).toBeHidden({ timeout: 20000 });
  expect(await pendingSeen(page), 'no pending banner on the way').toBe(0);
});

test('@send a slow close keeps its dialog up, busy, until the answer', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendSlow' });
  const confirm = await pressClose(page);
  await confirm.click();
  await expect(confirm).toHaveAttribute('data-pending', 'true');
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeHidden({ timeout: 20000 });
});

test('@send a close still out shows the pending banner on coming back to the ticket', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendHeld' });
  await (await pressClose(page)).click();
  await leaveByPalette(page);
  await expect(page).not.toHaveURL(new RegExp(OPEN_TICKET));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(OPEN_TICKET));
  await expect(page.getByText(strings['close.unknown'])).toBeVisible();
});

test('@send a New ticket whose close stalls after it was sent stays locked, and closes without asking', async ({ page }) => {
  // The drawer's close steps Back. Held here, past the 250 ms that step may pass the discard guard unasked.
  await page.addInitScript(() => {
    const held = window as unknown as { heldBack?: () => void };
    const back = history.back.bind(history);
    history.back = () => { held.heldBack = back; };
  });
  await gotoHub(page, '/support');
  const send = await fillNewTicket(page);
  await watchPending(page);
  await send.click();
  await page.waitForFunction(() => !!(window as unknown as { heldBack?: () => void }).heldBack);
  await page.waitForTimeout(400); // reason: past the guard's 250 ms; the form may not come back to life, so there is no event to wait for
  await expect(send).toHaveAttribute('data-pending', 'true');
  await expect(newTicket(page).getByLabel(strings['new.message'])).not.toBeEditable();
  await page.keyboard.press('Escape');
  await expect(newTicket(page)).toBeVisible();
  await expect(page.getByText(kit['drawer.discardAsk'])).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { heldBack: () => void }).heldBack());
  await expectCreatedAndOpen(page);
});

for (const [what, start] of [
  ['New ticket', async (page: Page) => { await gotoHub(page, '/support', { state: 'sendHung' }); await (await fillNewTicket(page)).click(); }],
  ['reply', async (page: Page) => {
    await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendHung' });
    await page.getByLabel(strings['reply.label']).fill('Any news on the invoice?');
    await page.getByRole('button', { name: strings['action.send'], exact: true }).click();
  }],
] as const) {
  test(`@send a ${what} that never gets an answer ends as held: the draft locked under the pending banner, Stop tracking frees it, nothing sent again`, async ({ page }) => {
    await page.clock.install();
    await start(page);
    await writeArrived(page);
    await expect(pendingBanner(page)).toHaveCount(0);
    await page.clock.fastForward(PAST_WRITE_TIMEOUT_MS);
    await expect(pendingBanner(page)).toBeVisible();
    const draft = what === 'reply' ? page.getByLabel(strings['reply.label']) : newTicket(page).getByLabel(strings['new.message']);
    await expect(draft).not.toBeEditable();
    await expect(pendingBanner(page).getByRole('button', { name: kit['outcome.pending.check'] })).toBeVisible();
    await stopTracking(page);
    await expect(pendingBanner(page)).toHaveCount(0);
    await expect(draft).toBeEditable();
    expect(await writesSeen(page), 'nothing sent again').toBe(1);
  });
}

test('@send a close that never gets an answer ends as held: its dialog goes, the pending banner shows, Stop tracking clears it, nothing sent again', async ({ page }) => {
  await page.clock.install();
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'sendHung' });
  const confirm = await pressClose(page);
  await confirm.click();
  await expect(confirm).toHaveAttribute('data-pending', 'true');
  await writeArrived(page);
  await page.clock.fastForward(PAST_WRITE_TIMEOUT_MS);
  await expect(confirm).toBeHidden();
  await expect(page.getByText(strings['close.unknown'])).toBeVisible();
  await stopTracking(page);
  await expect(page.getByText(strings['close.unknown'])).toHaveCount(0);
  expect(await writesSeen(page), 'nothing sent again').toBe(1);
});

test('@send a lost close shows the pending banner', async ({ page }) => {
  await gotoHub(page, `/support?sel=${OPEN_TICKET}`, { state: 'closeLostOpen' });
  await (await pressClose(page)).click();
  await expect(page.getByText(strings['close.unknown'])).toBeVisible();
});
