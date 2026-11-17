// Playwright: in a real browser, New schedule's "Agent timer or loop" is a step of the drawer on Schedules: the
// box starts with the shared schedule prompt, an example fills it, Back to the chooser and in again keeps the words, and Send
// starts a new Agent conversation beside the list (the drawer closes; the page never changes). On a phone the step fits the
// screen. Ask off (Bots only) is vitest: agentstep.askoff.test.tsx.
import { expect, type Page } from '@playwright/test';
import { hubUrl, noSideScroll, test } from '@app/e2e';
import scheduleAsk from '@kit/scheduleAsk.strings.en.json';
import sched from './strings.en.json';

// The Agent panel's words, as they show (a page spec imports no src/ask file).
const COMPOSER = 'Message to your agent';

const EXAMPLES = [scheduleAsk['ex.backups'], scheduleAsk['ex.disk'], scheduleAsk['ex.logs']];
const step = (page: Page) => page.getByRole('dialog', { name: sched['new.agentTitle'] });
const box = (page: Page) => step(page).getByRole('textbox', { name: sched['new.agentWhat'] });
const onSchedules = (page: Page) => expect.poll(() => new URL(page.url()).hash.split('?')[0]).toBe('#/schedules');

/** New schedule's chooser (opened by its link), then the agent choice. */
async function toStep(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(hubUrl('/schedules?edit=new').replace('/?', '/?ask=1&'));
  await page.locator('#hub-main').waitFor();
  await page.getByRole('button', { name: new RegExp(sched['new.agent']) }).click();
  await expect(step(page)).toBeVisible();
}

test('desktop: the step starts with the prompt, an example fills it, and Back to the chooser keeps the words', async ({ hubPage: page }) => {
  await toStep(page, 1440);
  await expect(box(page)).toHaveValue(scheduleAsk.prompt);
  for (const ex of EXAMPLES) await expect(step(page).getByRole('button', { name: ex, exact: true })).toBeVisible();
  await step(page).getByRole('button', { name: scheduleAsk['ex.disk'] }).click();
  await expect(box(page)).toHaveValue(`${scheduleAsk.prompt}${scheduleAsk['ex.disk']}`);
  await box(page).press('End');
  await box(page).pressSequentially(', and the swap');
  await step(page).getByRole('button', { name: sched['new.back'] }).click();
  await expect(page.getByText(sched['new.pick'])).toBeVisible();
  await page.getByRole('button', { name: new RegExp(sched['new.agent']) }).click();
  await expect(box(page)).toHaveValue(`${scheduleAsk.prompt}${scheduleAsk['ex.disk']}, and the swap`);
  // Nothing went to the agent, and the page is still Schedules.
  await expect(page.getByRole('textbox', { name: COMPOSER })).toHaveCount(0);
  await onSchedules(page);
});

test('desktop: Send starts a new Agent conversation with the words beside the list; the drawer closes, the page stays', async ({ hubPage: page }) => {
  await toStep(page, 1440);
  const words = `${scheduleAsk.prompt}every day at 6, check the certificates`;
  await box(page).fill(words);
  await step(page).getByRole('button', { name: sched['new.agentSend'] }).click();
  await expect(step(page)).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByText(words).last()).toBeVisible({ timeout: 20_000 }); // reason: the started conversation's first message
  await expect(page.getByRole('textbox', { name: COMPOSER })).toHaveValue('');
  await onSchedules(page);
});

test('phone: the step fits the screen, the examples wrap, and Back keeps the words', async ({ hubPageCoarse: page }) => {
  await toStep(page, 390);
  const vw = page.viewportSize()!.width;
  await noSideScroll(page);
  const sheet = (await step(page).boundingBox())!;
  for (const ex of EXAMPLES) {
    const r = (await step(page).getByRole('button', { name: ex, exact: true }).boundingBox())!;
    expect(r.x, 'an example starts on the screen').toBeGreaterThanOrEqual(sheet.x - 0.5);
    expect(r.x + r.width, 'an example ends on the screen').toBeLessThanOrEqual(Math.min(vw, sheet.x + sheet.width) + 0.5);
  }
  await expect(step(page).getByRole('button', { name: sched['new.agentSend'] })).toBeInViewport();
  await box(page).press('End');
  await box(page).pressSequentially('every night at 2, clear the tmp folder');
  await step(page).getByRole('button', { name: sched['new.back'] }).click();
  await page.getByRole('button', { name: new RegExp(sched['new.agent']) }).click();
  await expect(box(page)).toHaveValue(`${scheduleAsk.prompt}every night at 2, clear the tmp folder`);
});
