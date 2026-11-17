// Playwright: another tab signs out or switches account
// while this tab's unsaved drawer is open and the person's Back is under way. In live mode this tab hears the storage
// change (lifecycle.ts onStorage) and runs superseded(): endAccount (teardown, bump: the drawer closes through the
// page's closeEdit, which steps Back when the drawer pushed its entry) and then leaves (location.replace). Fixtures mode
// runs no storage watcher, so the spec calls the same superseded() of the page's own module instance, in the task
// that a storage event would run it in.
// Fixtures hold a session, so superseded() takes the account-switch branch: the leave is a reload of this page.
// The tab must leave the old document: no "Discard changes?", no PUT, and no old Hub document left showing (a second
// Back landing after the leave began could keep or bring back the old one), and no leave-site question: the context has
// ended, so the dirty drawer's guard must not hold the leave (kit Drawer NavGuard). A
// question that does come is accepted after it is recorded, so the run still shows where the tab ends.
import { type Page, type TestInfo, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test.describe.configure({ timeout: 90_000 });
const RUNS = 5;
const table = (page: Page) => page.getByRole('table', { name: strings.title });

type Snap = { at: string; href: string; length: number; state: unknown; old: boolean };
async function snap(page: Page, at: string): Promise<Snap> {
  try {
    return await page.evaluate((a) => ({ at: a, href: location.href, length: history.length, state: history.state as unknown, old: (window as unknown as { __lqOld?: boolean }).__lqOld === true }), at);
  } catch (e) {
    return { at, href: `(unreadable: ${String(e).slice(0, 120)})`, length: -1, state: null, old: false };
  }
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function dirtyNew(page: Page) {
  await gotoHub(page, '/vault');
  await expect(table(page).getByRole('row', { name: /deploy\.notes/ })).toBeVisible();
  await page.getByRole('button', { name: strings['action.new'] }).first().click(); // reason: the header's New entry
  const name = page.getByRole('dialog', { name: strings['edit.newTitle'] }).getByLabel(strings['edit.name'], { exact: true });
  await name.click();
  await page.keyboard.type('typed-before-leave');
  await expect(name).toHaveValue('typed-before-leave');
}

async function dirtyReplace(page: Page) {
  await gotoHub(page, '/vault');
  await table(page).getByRole('row', { name: /github-token/ }).click();
  await expect(page.getByText(strings['detail.facts'])).toBeVisible();
  await page.getByRole('button', { name: strings['action.replace'] }).click();
  const value = page.getByRole('dialog', { name: strings['edit.replaceTitle'] }).getByRole('textbox', { name: strings['edit.value'], exact: true });
  await value.click();
  await page.keyboard.type('typed-before-leave');
  await expect(value).toHaveValue('•'.repeat('typed-before-leave'.length));
}

/**
 * Reports any "Discard changes?" the document shows, however briefly. The report goes through a page binding
 * (exposeBinding), which outlives the document. Mutation records hold live nodes, not snapshots, so
 * each record is read in every shape a transient question can leave behind: its added and removed
 * nodes (a removed node keeps its own text), its changed text node and that node's old value.
 */
async function watchDiscard(page: Page, onSeen: () => void) {
  await page.exposeBinding('__lqSawDiscard', () => { onSeen(); });
  await page.evaluate(() => {
    const report = (window as unknown as { __lqSawDiscard: () => void }).__lqSawDiscard;
    const has = (t: string | null | undefined) => !!t?.includes('Discard changes?');
    const nodeHas = (n: Node) => has(n.textContent);
    new MutationObserver((recs) => {
      if (recs.some((r) => has(r.oldValue) || nodeHas(r.target) || Array.from(r.addedNodes).some(nodeHas) || Array.from(r.removedNodes).some(nodeHas)))
        report();
    }).observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
  });
}

// The detector itself: each transient shape is reported although nothing is left in the document when
// the observer's callback runs.
for (const shape of ['added then removed', 'text changed through it and away', 'text removed from an added container'] as const)
  test(`the Discard detector sees a transient question: ${shape}`, async ({ page }) => {
    await gotoHub(page, '/vault');
    let seen = false;
    await watchDiscard(page, () => { seen = true; });
    await page.evaluate((s) => {
      if (s === 'added then removed') {
        const p = document.createElement('p');
        p.textContent = 'Discard changes?';
        document.body.append(p);
        p.remove();
      } else if (s === 'text changed through it and away') {
        const p = document.createElement('p');
        p.textContent = 'x';
        document.body.append(p);
        return new Promise<void>((done) => setTimeout(() => {
          const t = p.firstChild as Text;
          t.data = 'Discard changes?';
          t.data = 'y';
          done();
        }, 50));
      } else {
        const d = document.createElement('div');
        const t = document.createTextNode('Discard changes?');
        d.append(t);
        document.body.append(d);
        t.remove();
      }
      return undefined;
    }, shape);
    await expect.poll(() => seen, { timeout: 5000 }).toBe(true);
    await expect(page.getByText('Discard changes?')).toHaveCount(0);
  });

const opens = [
  { name: 'New entry', open: dirtyNew },
  { name: 'Replace value from an open entry', open: dirtyReplace },
];
const backs = [
  { name: 'no Back (control)', mode: 'none' as const },
  { name: 'a Back in the same task', mode: 'same' as const },
  { name: "the browser's own Back just before", mode: 'browser' as const },
];

for (const o of opens)
  for (const b of backs)
    for (let i = 1; i <= (b.mode === 'none' ? 2 : RUNS); i++)
      test(`${o.name}, unsaved, CPU 4x: another tab's sign-out (superseded) with ${b.name} leaves the old document (run ${i})`, async ({ page }, info: TestInfo) => {
        const snaps: Snap[] = [];
        const navs: string[] = [];
        page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(`${Date.now()} ${f.url()}`); });
        const dialogs: string[] = [];
        page.on('dialog', (dl) => { dialogs.push(`${Date.now()} ${dl.type()}`); void dl.accept(); });
        const puts: string[] = [];
        page.on('request', (r) => { if (r.method() === 'PUT') puts.push(r.url()); });
        let sawDiscard = false;
        try {
          await throttle(page);
          await o.open(page);
          await watchDiscard(page, () => { sawDiscard = true; });
          await page.evaluate(async () => {
            const w = window as unknown as { __lqOld: boolean; __lqLc: unknown };
            w.__lqOld = true;
            // @ts-expect-error vite URL resolved in the browser
            w.__lqLc = await import(/* @vite-ignore */ '/src/core/lifecycle.ts'); // eslint-disable-line hub/page-boundaries -- a vite URL, resolved in the browser
          });
          snaps.push(await snap(page, 'drawer open'));
          if (b.mode === 'browser') void page.goBack({ waitUntil: 'commit', timeout: 10_000 }).catch(() => null);
          await page
            .evaluate((same) => {
              if (same) history.back();
              (window as unknown as { __lqLc: { superseded: () => void } }).__lqLc.superseded();
            }, b.mode === 'same')
            .catch(() => null); // the document may go while the call returns
          snaps.push(await snap(page, 'right after superseded'));
          await page.waitForTimeout(3000);
          snaps.push(await snap(page, 'settled'));
          const last = snaps.at(-1)!;
          expect(last.old, 'the old Hub document is gone').toBe(false);
          await expect(page).not.toHaveURL(/[?&](edit|sel)=/);
          expect(sawDiscard).toBe(false);
          expect(dialogs, 'no leave-site question').toEqual([]);
          expect(puts).toEqual([]);
          // The reload boots the same fixture account, so its entry names show again; the typed text and the drawer do not.
          await expect(page.getByText('typed-before-leave')).toHaveCount(0);
          await expect(page.getByRole('dialog', { name: new RegExp(`${strings['edit.newTitle']}|${strings['edit.replaceTitle']}`) })).toHaveCount(0);
        } finally {
          snaps.push(await snap(page, 'end'));
          await info.attach('history-diagnostics', { body: JSON.stringify({ snaps, navs, dialogs, puts }, null, 2), contentType: 'application/json' });
        }
      });

// The other side: while the context lives, the dirty drawer still asks before the page is left (a reload here).
test('New entry, unsaved, no context end: a reload still asks the leave-site question', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (dl) => { dialogs.push(dl.type()); void dl.dismiss(); });
  await dirtyNew(page);
  await page.reload({ timeout: 5000 }).catch(() => null); // dismissed: the reload is cancelled
  expect(dialogs).toEqual(['beforeunload']);
  await expect(page.getByRole('dialog', { name: strings['edit.newTitle'] })).toBeVisible();
});
