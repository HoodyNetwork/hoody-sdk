// Add a program > Virtual machine, in the browser. Each server kind says its own thing; only a
// shared or KVM-less server offers the Market, a server that can run VMs opens the VMs page, and nothing here starts a VM.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

async function openAdd(page: Page, w: number, state?: string) {
  await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 });
  await gotoHub(page, '/board', state ? { state } : {});
  await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
  return page.getByRole('dialog').last();
}
// From the open Add a program panel (any step): the computer step's crumb, then the computer and its Virtual machine.
async function vmOf(page: Page, computer: string) {
  const d = page.getByRole('dialog').last();
  // The first step's crumb, All computers, past the first step (only past steps are buttons).
  const crumb = d.getByRole('navigation').getByRole('button', { name: 'Back to All computers' });
  if (await crumb.count()) await crumb.click();
  await d.getByRole('row', { name: new RegExp('^' + computer) }).click();
  await d.getByRole('row', { name: /^Virtual machine/ }).click();
  return d;
}

for (const w of [1350, 390]) {
  test(`at ${w}: a shared server sells VMs and links the Market; Back returns to the programs`, async ({ page }) => {
    await openAdd(page, w);
    const d = await vmOf(page, 'atlas');
    await expect(d.getByRole('heading', { name: strings['vm.sellTitle'] })).toBeVisible();
    // The pressed row is gone: the focus is on the step's title, the current crumb, never on the page.
    await expect(d.getByRole('navigation').locator('[aria-current="step"]')).toBeFocused();
    await expect(d.getByRole('list', { name: strings['vm.systems'] }).getByRole('listitem')).toHaveText(['Linux', 'Windows', 'Android']);
    const market = d.getByRole('button', { name: strings['vm.market'] });
    await expect(market).toBeInViewport();
    await d.getByRole('button', { name: strings['picker.backStep'], exact: true }).click();
    await expect(d.getByRole('row', { name: /^Virtual machine/ })).toBeVisible();
    await d.getByRole('row', { name: /^Virtual machine/ }).click();
    await d.getByRole('button', { name: strings['vm.market'] }).click();
    await expect(page).toHaveURL(/#\/market/);
  });

  test(`at ${w}: bare metal says it can run them, not checked, or needs support, as its check says`, async ({ page }) => {
    await openAdd(page, w, 'vmServers');
    let d = await vmOf(page, 'atlas');
    await expect(d.getByRole('heading', { name: strings['vm.readyTitle'] })).toBeVisible();
    await expect(d.getByText(strings['vm.ready'].replace('{{computer}}', 'atlas'))).toBeVisible();
    await expect(d.getByRole('button', { name: strings['vm.open'] })).toBeInViewport();
    await expect(d.getByRole('button', { name: strings['vm.market'] })).toHaveCount(0);
    await expect(d.getByText(/coming soon/i)).toHaveCount(0);
    d = await vmOf(page, 'cedar');
    await expect(d.getByText(strings['vm.unchecked'].replace('{{computer}}', 'cedar'))).toBeVisible();
    await expect(d.getByText(/coming soon/i)).toHaveCount(0);
    d = await vmOf(page, 'fjord');
    await expect(d.getByRole('heading', { name: strings['vm.sellTitle'] })).toBeVisible();
    await expect(d.getByRole('button', { name: strings['vm.market'] })).toBeInViewport();
  });

  test(`at ${w}: on bare metal that can run them, Open VMs goes to the VMs page`, async ({ page }) => {
    await openAdd(page, w, 'vmServers');
    const d = await vmOf(page, 'atlas');
    await d.getByRole('button', { name: strings['vm.open'] }).click();
    await expect(page).toHaveURL(/#\/vms/);
  });
}
