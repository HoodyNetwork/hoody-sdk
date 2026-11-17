// Playwright: SettingGroup in the gallery (`/_kit?tab=groups`, `?layout=sg-pane`).
// - Rows share the label, value and action tracks; action clusters share their trailing edge (LTR and RTL).
// - Narrow: value groups stack below 600 px, field groups below 640 px or when the label track would fall under 200 px
//   (the measured floor follows a Reset that appears and goes); field groups under 400 px give the field the whole width.
// - Switch rows keep the switch on the label line at the end and put actions under the help; no-value rows put their
//   actions under the help at the start.
// - Framed on the page; bare in a Panel, a Widget, a Drawer (320 px too) and a Dialog; a flush Panel leaves the rows
//   their card inset. In a ListDetailPage pane the group is bare while the pane is framed, with its names on the
//   detail title's line (directly in the pane, in a DetailBody, in a Tabs panel), and framed again below 600 px.
// - A pending SettingSwitch stays visible and disabled; only its actions hide.
// - A pending outcome wraps inside its row; a narrow switch is centred on the
//   name's line however the help wraps (LTR, RTL); a stacked field keeps 200 px by moving wide actions under it; the
//   measurements follow an action label that changes in place.
// - A switch without help keeps its centre on the name's line in each stacked path (value
//   < 600, field < 640, data-stack alone), LTR and RTL, and in the 64 px touch row.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

type Box = { x: number; y: number; w: number; h: number };

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('not drawn');
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

const demo = (page: Page, name: string) => page.locator(`[data-sg-demo="${name}"]`);
const rows = (d: Locator) => d.locator('[data-sg-row]');
/** The row whose name starts with this text (help text may mention another row's name). */
const rowNamed = (d: Locator, name: string) => rows(d).filter({ has: d.page().locator(':scope > div:first-child > :first-child', { hasText: new RegExp(`^${name}$`) }) });
/** RAC draws the switch input hidden: press its visible label. */
const press = (sw: Locator) => sw.locator('xpath=ancestor::label[1]').click();
const cell = (row: Locator, part: 'label' | 'value' | 'action') =>
  part === 'action' ? row.locator('[data-sg-action]') : part === 'label' ? row.locator(':scope > div').first() : row.locator(':scope > div:not([data-sg-action])').nth(1);

async function setWidth(d: Locator, px: number) {
  await d.evaluate((el, w) => {
    (el as HTMLElement).style.width = `${w}px`;
  }, px);
  // The label floor is judged on the group's resize.
  await d.page().waitForTimeout(80);
}

/** The row's value sits under its label (a row with a value). */
async function stacked(d: Locator, row: string): Promise<boolean> {
  const r = rowNamed(d, row);
  const label = await box(cell(r, 'label'));
  const value = await box(cell(r, 'value'));
  return value.y >= label.y + label.h - 1;
}

async function frame(d: Locator) {
  return d.locator('[data-setting-group] > div').evaluate((g) => {
    const cs = getComputedStyle(g);
    const row = g.querySelector('[data-sg-row]') as HTMLElement;
    return { border: cs.borderTopWidth, fill: cs.backgroundColor, pad: getComputedStyle(row).paddingInlineStart };
  });
}

test.describe('setting groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await gotoHub(page, '/_kit?tab=groups');
    await demo(page, 'value').locator('[data-sg-row]').first().waitFor();
  });

  test('rows share the value column and the action trailing edge', async ({ page }) => {
    for (const dir of ['ltr', 'rtl'] as const) {
      await page.evaluate((d) => (document.documentElement.dir = d), dir);
      const d = demo(page, 'value');
      const xs: number[] = [];
      const ends: number[] = [];
      for (const r of await rows(d).all()) {
        const a = r.locator('[data-sg-action]');
        if (await a.count()) {
          const b = await box(a);
          ends.push(dir === 'ltr' ? b.x + b.w : b.x);
        }
        const v = r.locator(':scope > div').nth(1);
        if ((await v.count()) && (await v.getAttribute('data-sg-action')) === null) {
          const b = await box(v);
          xs.push(dir === 'ltr' ? b.x : b.x + b.w);
        }
      }
      expect(xs.length, `${dir}: value cells`).toBeGreaterThan(2);
      expect(Math.max(...xs) - Math.min(...xs), `${dir}: value column`).toBeLessThan(1);
      expect(ends.length, `${dir}: action cells`).toBeGreaterThan(3);
      expect(Math.max(...ends) - Math.min(...ends), `${dir}: trailing edge`).toBeLessThan(1);
      // The value track is 240 px wide.
      const v = await box(cell(rows(d).nth(1), 'value'));
      expect(Math.round(v.w)).toBe(240);
    }
  });

  test('a value group stacks below 600 px', async ({ page }) => {
    const d = demo(page, 'value');
    await setWidth(d, 700);
    expect(await stacked(d, 'Address')).toBe(false);
    await setWidth(d, 599);
    expect(await stacked(d, 'Address')).toBe(true);
    // Still three tracks just above the break when the label keeps 200 px (Edit + overflow is the widest cluster).
    await setWidth(d, 600);
    const floorStack = await d.locator('[data-setting-group]').evaluate((w) => w.hasAttribute('data-stack'));
    expect(await stacked(d, 'Address')).toBe(floorStack);
  });

  test('a field group stacks below 640 px; a Reset that would leave the label under 200 px goes under its field', async ({ page }) => {
    const d = demo(page, 'field');
    // No Reset shown: 2 (border) + 40 (row inset) + 360 + 2 × 24 + 200 = 650 holds three tracks.
    await setWidth(d, 680);
    expect(await d.locator('[data-setting-group]').getAttribute('data-stack')).toBeNull();
    const label = await box(cell(rows(d).first(), 'label'));
    expect(label.w).toBeGreaterThanOrEqual(200);
    // A text Reset appears: beside the field the label would fall under 200, so the Reset goes under the field and the
    // group stays side by side (crowdedActions="stack" would stack the group instead).
    await press(d.getByRole('switch', { name: 'Expose' }));
    await expect(d.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
    await page.waitForTimeout(80);
    await expect(d.locator('[data-setting-group]')).toHaveAttribute('data-sg-under', '');
    await expect(d.locator('[data-setting-group]')).not.toHaveAttribute('data-stack', '');
    expect(await stacked(d, 'Expose')).toBe(false);
    const ev = await box(cell(rowNamed(d, 'Expose'), 'value'));
    expect((await box(rowNamed(d, 'Expose').locator('[data-sg-action]'))).y).toBeGreaterThanOrEqual(ev.y + ev.h - 1);
    // It goes: three tracks, actions beside again.
    await d.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForTimeout(80);
    await expect(d.locator('[data-setting-group]')).not.toHaveAttribute('data-sg-under', '');
    await expect(d.locator('[data-setting-group]')).not.toHaveAttribute('data-stack', '');
    // The fixed floor: below 640 it stacks whatever the label has.
    await setWidth(d, 639);
    const r = rows(d).first();
    const lb = await box(cell(r, 'label'));
    const vb = await box(cell(r, 'value'));
    expect(vb.y).toBeGreaterThanOrEqual(lb.y + lb.h - 1);
  });

  test('a field under 400 px takes the whole row and its actions go under it, at the start', async ({ page }) => {
    const d = demo(page, 'field');
    await press(d.getByRole('switch', { name: 'Expose' }));
    await setWidth(d, 380);
    const r = rowNamed(d, 'Expose');
    const row = await box(r);
    const v = await box(cell(r, 'value'));
    const a = await box(r.locator('[data-sg-action]'));
    const pad = parseFloat(await r.evaluate((e) => getComputedStyle(e).paddingInlineStart));
    expect(Math.abs(v.w - (row.w - 2 * pad))).toBeLessThan(1);
    expect(a.y).toBeGreaterThanOrEqual(v.y + v.h - 1);
    expect(Math.abs(a.x - (row.x + pad))).toBeLessThan(1);
  });

  test('narrow: the switch stays on the label line at the end; actions and no-value actions go under the help', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    const d = demo(page, 'value');
    await d.scrollIntoViewIfNeeded();
    const sw = rowNamed(d, 'Link is on');
    const swRow = await box(sw);
    const name = await box(sw.getByText('Link is on', { exact: true }));
    const control = await box(sw.locator('[data-sg-control]'));
    const pad = parseFloat(await sw.evaluate((e) => getComputedStyle(e).paddingInlineEnd));
    expect(control.y).toBeLessThan(name.y + name.h);
    expect(Math.abs(control.x + control.w - (swRow.x + swRow.w - pad))).toBeLessThan(1);
    const del = rowNamed(d, 'Revoke all keys');
    const help = await box(del.getByText('Every key stops', { exact: false }));
    const act = await box(del.locator('[data-sg-action]'));
    const dpad = parseFloat(await del.evaluate((e) => getComputedStyle(e).paddingInlineStart));
    expect(act.y).toBeGreaterThanOrEqual(help.y + help.h - 1);
    expect(Math.abs(act.x - ((await box(del)).x + dpad))).toBeLessThan(1);
  });

  test('a pending switch stays visible and disabled, its actions hidden', async ({ page }) => {
    const r = rowNamed(demo(page, 'value'), 'Notes');
    const sw = r.getByRole('switch', { name: 'Notes' });
    await expect(sw).toBeVisible();
    await expect(sw).toBeDisabled();
    await expect(r.getByRole('button', { name: 'Reset to the default' })).toHaveCount(0);
    await expect(r.getByText('May have gone through')).toBeVisible();
  });

  test('framed on the page, bare in a panel and a widget, card inset in a flush panel', async ({ page }) => {
    const pageFrame = await frame(demo(page, 'value'));
    expect(pageFrame.border).toBe('1px');
    expect(pageFrame.fill).not.toBe('rgba(0, 0, 0, 0)');
    expect(pageFrame.pad).toBe('20px');
    for (const [name, pad] of [
      ['panel', '0px'],
      ['widget', '0px'],
      ['flush', '20px'],
    ] as const) {
      const f = await frame(demo(page, name));
      expect(f.border, name).toBe('0px');
      expect(f.fill, name).toBe('rgba(0, 0, 0, 0)');
      expect(f.pad, name).toBe(pad);
    }
  });

  for (const w of [1350, 320]) {
    test(`bare in a drawer and a dialog at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      for (const open of ['sg-drawer', 'sg-dialog']) {
        await gotoHub(page, `/_kit?tab=groups&open=${open}`);
        const d = demo(page, open.slice(3));
        await d.locator('[data-sg-row]').first().waitFor();
        const f = await frame(d);
        expect(f.border, open).toBe('0px');
        expect(f.pad, open).toBe('0px');
        // Once the overlay has slid in.
        await expect.poll(async () => { const g = await box(d.locator('[data-setting-group]')); return g.x >= 0 && g.x + g.w <= w + 0.5; }, { message: `${open} inside the viewport` }).toBe(true);
      }
    });
  }
});

/** Replace the text of an action label in place (a characterData change: no node added, the group's width unchanged). */
async function relabel(d: Locator, from: string, to: string) {
  await d.evaluate(
    (el, [a, b]) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue === a) n.nodeValue = b;
    },
    [from, to] as const,
  );
  await d.page().waitForTimeout(80);
}

/** The switch's centre is the centre of the name's first line (its computed line height), and the switch ends the row. */
async function expectOnNameLine(r: Locator, name: string, dir: 'ltr' | 'rtl') {
  const nameEl = r.getByText(name, { exact: true });
  const nm = await box(nameEl);
  const lh = parseFloat(await nameEl.evaluate((e) => getComputedStyle(e).lineHeight));
  const sw = await box(r.locator('[data-sg-control] label').first());
  expect(Math.abs(sw.y + sw.h / 2 - (nm.y + lh / 2)), `${name}: switch centre on the name line`).toBeLessThan(1);
  const row = await box(r);
  const pad = parseFloat(await r.evaluate((e) => getComputedStyle(e).paddingInlineEnd));
  const edge = dir === 'ltr' ? row.x + row.w - pad - (sw.x + sw.w) : sw.x - (row.x + pad);
  expect(Math.abs(edge), `${name}: switch at the row end`).toBeLessThan(1);
}

/** A row without help: the name (and so the switch) is centred in the row's height, as before the switch fix. */
async function expectRowCentred(r: Locator, name: string) {
  const nm = await box(r.getByText(name, { exact: true }));
  const row = await box(r);
  const [pt, pb] = await r.evaluate((e) => [parseFloat(getComputedStyle(e).paddingTop), parseFloat(getComputedStyle(e).paddingBottom)]);
  const mid = row.y + pt + (row.h - pt - pb) / 2;
  expect(Math.abs(nm.y + nm.h / 2 - mid), `${name}: centred in the row`).toBeLessThan(1);
}

/** Take the measured floor off (it is not judged again until the group resizes), leaving one container path alone. */
async function containerOnly(d: Locator) {
  await d.locator('[data-setting-group]').evaluate((w) => w.removeAttribute('data-stack'));
}

/** A no-help switch row in each stacked path: the value path (< 600), the field path (< 640), data-stack alone. */
async function noHelpPaths(page: Page, dir: 'ltr' | 'rtl') {
  await page.evaluate((d) => (document.documentElement.dir = d), dir);
  const v = demo(page, 'value');
  await setWidth(v, 400);
  await containerOnly(v);
  await rowNamed(v, 'Pause replies').scrollIntoViewIfNeeded();
  await expectOnNameLine(rowNamed(v, 'Pause replies'), 'Pause replies', dir);
  await expectRowCentred(rowNamed(v, 'Pause replies'), 'Pause replies');
  const f = demo(page, 'field-actions-stack');
  await setWidth(f, 620);
  await containerOnly(f);
  await expectOnNameLine(rowNamed(f, 'Retry failed events'), 'Retry failed events', dir);
  await expectRowCentred(rowNamed(f, 'Retry failed events'), 'Retry failed events');
  // 900: over 640, stacked only by the floor (the two actions leave the label under 200 px; crowdedActions="stack").
  await setWidth(f, 900);
  await expect(f.locator('[data-setting-group]')).toHaveAttribute('data-stack', '');
  await expectOnNameLine(rowNamed(f, 'Retry failed events'), 'Retry failed events', dir);
  await expectRowCentred(rowNamed(f, 'Retry failed events'), 'Retry failed events');
}

test.describe('setting groups: outcomes and wide actions keep the row', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await gotoHub(page, '/_kit?tab=groups');
    await demo(page, 'value').locator('[data-sg-row]').first().waitFor();
  });

  for (const w of [320, 390, 1100]) {
    test(`a pending outcome and its whole Check again stay inside the row at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 1000 });
      const r = rowNamed(demo(page, 'value'), 'Notes');
      await r.scrollIntoViewIfNeeded();
      const row = await box(r);
      const pad = parseFloat(await r.evaluate((e) => getComputedStyle(e).paddingInlineEnd));
      const end = row.x + row.w - pad;
      const out = await box(r.locator('[data-outcome="pending"]'));
      const check = await box(r.getByRole('button', { name: 'Check again' }));
      expect(out.x + out.w, 'outcome end').toBeLessThanOrEqual(end + 0.5);
      expect(check.x, 'Check again start').toBeGreaterThanOrEqual(row.x + pad - 0.5);
      expect(check.x + check.w, 'Check again end').toBeLessThanOrEqual(end + 0.5);
      expect(check.y + check.h, 'Check again inside the row').toBeLessThanOrEqual(row.y + row.h + 0.5);
    });
  }

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`narrow (${dir}): the switch is centred on the name's line when the help wraps`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.evaluate((d) => (document.documentElement.dir = d), dir);
      for (const name of ['Link is on', 'Notes']) {
        const r = rowNamed(demo(page, 'value'), name);
        await r.scrollIntoViewIfNeeded();
        const help = await box(r.locator(':scope > div:first-child > :nth-child(2)'));
        // Link is on: its help takes several lines at 320; Notes: one line, a pending outcome under it.
        if (name === 'Link is on') expect(help.h, 'help wraps').toBeGreaterThan(30);
        await expectOnNameLine(r, name, dir);
      }
    });

    test(`narrow (${dir}): a switch without help stays centred with its name in every stacked path`, async ({ page }) => {
      await noHelpPaths(page, dir);
    });
  }

  test('a stacked field keeps 200 px: wide actions go under it, at any width, and come back when they narrow', async ({ page }) => {
    const d = demo(page, 'field-actions');
    const r = rows(d).first();
    const drop = () => r.evaluate((e) => e.hasAttribute('data-sg-drop'));
    // 480 (over 400): the two actions (about 272 px) would leave the field about 150 px.
    await setWidth(d, 480);
    let v = await box(cell(r, 'value'));
    let a = await box(r.locator('[data-sg-action]'));
    expect(v.w, 'field at 480').toBeGreaterThanOrEqual(200);
    expect(a.y, 'actions under the field').toBeGreaterThanOrEqual(v.y + v.h - 1);
    expect(await drop()).toBe(true);
    // 620 (stacked under 640): room for both beside the field.
    await setWidth(d, 620);
    v = await box(cell(r, 'value'));
    a = await box(r.locator('[data-sg-action]'));
    expect(await drop()).toBe(false);
    expect(Math.abs(a.y - v.y), 'actions beside the field').toBeLessThan(v.h);
    expect(v.w).toBeGreaterThanOrEqual(200);
    // An action's label grows in place: they go under; it shrinks back: beside again.
    await relabel(d, 'New secret', 'Make a new secret for this webhook');
    expect(await drop(), 'wider label drops').toBe(true);
    expect((await box(cell(r, 'value'))).w).toBeGreaterThanOrEqual(200);
    await relabel(d, 'Make a new secret for this webhook', 'New secret');
    expect(await drop(), 'narrower label returns').toBe(false);
  });

  test('the label floor follows an action label that changes in place, the group width unchanged', async ({ page }) => {
    // crowdedActions="stack": the earlier arrangement, where the floor stacks the group.
    const d = demo(page, 'field-actions-stack');
    const wrap = d.locator('[data-setting-group]');
    // 1000: the label keeps 200 px beside the 360 px field and both actions (about 302 px since they are arrow-chip
    // buttons; 272 before).
    await setWidth(d, 1000);
    await expect(wrap).not.toHaveAttribute('data-stack', '');
    const before = await box(wrap);
    await relabel(d, 'New secret', 'Make a new secret for this webhook');
    expect((await box(wrap)).w, 'same group width').toBe(before.w);
    await expect(wrap).toHaveAttribute('data-stack', '');
    expect((await box(cell(rows(d).first(), 'label'))).w).toBeGreaterThanOrEqual(200);
    await relabel(d, 'Make a new secret for this webhook', 'New secret');
    await expect(wrap).not.toHaveAttribute('data-stack', '');
  });
});

test.describe('crowded actions go under the field', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await gotoHub(page, '/_kit?tab=groups');
  });

  test('at 900 the group stays side by side, the actions sit under the field at its start, the label keeps 200 px', async ({ page }) => {
    const d = demo(page, 'field-actions');
    const wrap = d.locator('[data-setting-group]');
    await setWidth(d, 900);
    await expect(wrap).toHaveAttribute('data-sg-under', '');
    await expect(wrap).not.toHaveAttribute('data-stack', '');
    const r = rows(d).first();
    const v = await box(cell(r, 'value'));
    const a = await box(r.locator('[data-sg-action]'));
    expect(a.y, 'actions under the field').toBeGreaterThanOrEqual(v.y + v.h - 1);
    expect(Math.abs(a.x - v.x), 'at the field start').toBeLessThan(2);
    expect((await box(cell(r, 'label'))).w).toBeGreaterThanOrEqual(200);
    // Room for everything: beside the field again.
    await setWidth(d, 1200);
    await expect(wrap).not.toHaveAttribute('data-sg-under', '');
    // Under 640 the group stacks as before.
    await setWidth(d, 620);
    await expect(wrap).not.toHaveAttribute('data-sg-under', '');
  });
});

test.describe('setting groups on a touch screen', () => {
  test.use({ isMobile: true, hasTouch: true });

  test('a switch without help stays centred with its name in the taller touch row', async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 1000 });
    await gotoHub(page, '/_kit?tab=groups');
    await demo(page, 'value').locator('[data-sg-row]').first().waitFor();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer').toBe(true);
    const r = rowNamed(demo(page, 'value'), 'Pause replies');
    expect(await r.evaluate((e) => getComputedStyle(e).minHeight), 'touch row height').toBe('64px');
    await noHelpPaths(page, 'ltr');
  });
});

test.describe('setting groups in a pane', () => {
  for (const [w, framed] of [
    [1350, false],
    [700, false],
    [390, true],
  ] as const) {
    test(`at ${w} the group is ${framed ? 'framed again' : 'bare, its names on the detail title line'}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 1000 });
      await gotoHub(page, '/_kit?layout=sg-pane&sel=a');
      await demo(page, 'pane-direct').locator('[data-sg-row]').first().waitFor();
      const title = await box(page.locator('h2, [class*="detailTitle"]').filter({ hasText: 'Detail' }).first());
      for (const name of ['pane-direct', 'pane-body', 'pane-tab']) {
        const d = demo(page, name);
        await d.scrollIntoViewIfNeeded();
        const f = await frame(d);
        expect(f.border, name).toBe(framed ? '1px' : '0px');
        const first = await box(cell(rows(d).first(), 'label'));
        if (framed) {
          const g = await box(d.locator('[data-setting-group] > div'));
          expect(first.x - g.x, `${name}: the card inset`).toBeGreaterThanOrEqual(16);
        } else {
          expect(Math.abs(first.x - title.x), `${name}: on the title line`).toBeLessThan(1);
        }
      }
    });
  }
});
