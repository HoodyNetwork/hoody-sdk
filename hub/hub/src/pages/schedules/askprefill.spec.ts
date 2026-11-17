// Playwright: a page's prefill the person never touched is the page's, not theirs. The
// path: Schedules puts "Schedule" in the Agent's composer (its agent step's panel way), the panel is closed, Home's Ask starts a
// question; the composer is then empty. Typed text and an edited prefill are never removed.
import { expect, type Page } from '@playwright/test';
import { hubUrl, test } from '@app/e2e';
import sched from './strings.en.json';

// Other pages' and the Agent's words, as they show (a page spec imports no other page and no src/ask file).
const COMPOSER = 'Message to your agent', CLOSE = 'Close Agent', HOME_IDEA = 'Back up my files daily', HOME_ASK = 'Ask';
const EXPLAIN = 'Explain with the Agent';

const composer = (page: Page) => page.getByRole('textbox', { name: COMPOSER });

async function open(page: Page, path: string) {
  await page.goto(hubUrl(path).replace('/?', '/?ask=1&'));
  await page.locator('#hub-main').waitFor();
}
/** New schedule › Agent timer or loop › "Write it in the Agent panel instead" with the box untouched (the agent way is a
 *  step of the drawer now; this is its prefill, not sent). */
async function toPanel(page: Page) {
  await page.getByRole('button', { name: sched['new'], exact: true }).click();
  await page.getByRole('button', { name: new RegExp(sched['new.agent']) }).click();
  await page.getByRole('dialog', { name: sched['new.agentTitle'] }).getByRole('button', { name: sched['new.agentPanel'] }).click();
}
/** Schedules › New schedule › Agent timer or loop › the panel way: the Agent panel opens with "Schedule " in its composer. */
async function prefill(page: Page) {
  await open(page, '/schedules');
  await toPanel(page);
  await expect(composer(page)).toHaveValue(/Schedule\s*$/, { timeout: 20_000 });
}
async function closePanel(page: Page) {
  await page.getByRole('button', { name: CLOSE }).click();
  await expect(composer(page)).toHaveCount(0);
}
/** Home's Ask with one of its ideas: a start (sent as a new conversation's first message). */
async function homeAsk(page: Page) {
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.getByRole('button', { name: HOME_IDEA }).click();
  await page.locator('main form').getByRole('button', { name: HOME_ASK }).click();
  await expect(composer(page)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(HOME_IDEA).last()).toBeVisible({ timeout: 20_000 }); // reason: the idea shows on its Home chip and then as the conversation's first message, the last one
}

test('prefill, close, Home\'s Ask: the composer is empty', async ({ hubPage: page }) => {
  await prefill(page);
  await closePanel(page);
  await homeAsk(page);
  await expect(composer(page)).toHaveValue('');
});

test('a prefill left untouched is gone when the panel opens again after a close', async ({ hubPage: page }) => {
  await prefill(page);
  await closePanel(page);
  await page.keyboard.press('Control+j');
  await expect(composer(page)).toHaveValue('', { timeout: 20_000 });
});

test('an edited prefill is the person\'s: close and Home\'s Ask keep it', async ({ hubPage: page }) => {
  await prefill(page);
  await composer(page).press('End');
  await composer(page).pressSequentially('a backup at 3am');
  await closePanel(page);
  await homeAsk(page);
  await expect(composer(page)).toHaveValue('Schedule a backup at 3am');
});

test('typed text, then a prefill, then a close: the typed text stays, exactly', async ({ hubPage: page }) => {
  await open(page, '/schedules');
  await page.keyboard.press('Control+j');
  await composer(page).fill('check the logs first');
  await toPanel(page);
  await expect(composer(page)).toHaveValue('check the logs first\nSchedule ', { timeout: 20_000 });
  await closePanel(page);
  await page.keyboard.press('Control+j');
  await expect(composer(page)).toHaveValue('check the logs first', { timeout: 20_000 });
});

test('a start while the panel is open takes out an untouched prefill (Firewall\'s Explain with the Agent)', async ({ hubPage: page }) => {
  await prefill(page);
  await page.evaluate(() => { location.hash = '#/computers?sel=atlas.00a1&tab=network'; });
  await page.getByRole('button', { name: EXPLAIN }).click();
  await expect(page.getByText(/Explain/).last()).toBeVisible({ timeout: 45_000 }); // reason: the button and then the started conversation's message both say Explain; the message is the last
  await expect(composer(page)).toHaveValue('', { timeout: 20_000 });
});

test('a later prefill replaces an untouched one: one "Schedule", not two', async ({ hubPage: page }) => {
  await prefill(page);
  await toPanel(page);
  await page.waitForTimeout(800);
  await expect(composer(page)).toHaveValue('Schedule ');
});

test('replacing the prefill\'s first letter with the same letter is an edit: the draft is the person\'s', async ({ hubPage: page }) => {
  await prefill(page);
  const v = await composer(page).inputValue();
  await composer(page).press('Control+Home');
  await composer(page).press('Shift+ArrowRight');
  await composer(page).pressSequentially('S');
  await expect(composer(page)).toHaveValue(v);
  await closePanel(page);
  await page.keyboard.press('Control+j');
  await expect(composer(page)).toHaveValue(v, { timeout: 20_000 });
});

/** Selects the prefill's first letter and types the same letter over it: an edit that leaves the same text. */
async function sameLetter(page: Page): Promise<string> {
  const v = await composer(page).inputValue();
  await composer(page).press('Control+Home');
  await composer(page).press('Shift+ArrowRight');
  await composer(page).pressSequentially('S');
  await expect(composer(page)).toHaveValue(v);
  return v;
}

test('the same letter typed over the prefill\'s first one, then a start: the text stays', async ({ hubPage: page }) => {
  await prefill(page);
  const v = await sameLetter(page);
  await page.evaluate(() => { location.hash = '#/computers?sel=atlas.00a1&tab=network'; });
  await page.getByRole('button', { name: EXPLAIN }).click();
  await expect(page.getByText(/Explain/).last()).toBeVisible({ timeout: 45_000 }); // reason: the Explain button, then the started conversation's own message; the message is the last
  await expect(composer(page)).toHaveValue(v);
});

test('the same letter typed over the prefill\'s first one, then a later prefill: the text stays and the new one follows it', async ({ hubPage: page }) => {
  await prefill(page);
  await sameLetter(page);
  await toPanel(page);
  await expect(composer(page)).toHaveValue('Schedule\nSchedule ', { timeout: 20_000 });
});
