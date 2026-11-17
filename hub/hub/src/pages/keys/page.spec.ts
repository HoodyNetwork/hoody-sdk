// Playwright: the keys page's flows on fixtures (run by hub:check --page keys).
import { type Page, expect } from "@playwright/test";
import {
  expectLinkSearchDroppedOnReload,
  expectSearchStaysOutOfUrl,
  gotoHub,
  test,
} from "@app/e2e";
import strings from "./strings.en.json";

test("make a key from the keyboard and see it once", async ({ hubPage: page }) => {
  await gotoHub(page, "/keys");
  await page.getByRole("table", { name: strings.title }).waitFor();
  // The key handler attaches after the list loads: press until the drawer is up.
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.getByLabel(strings["nk.name"])).toBeVisible({
      timeout: 1500,
    });
  }).toPass();
  await page.getByLabel(strings["nk.name"]).fill("ci");
  await page.keyboard.press("Enter");
  await expect(page.getByText(strings["sh.warn"])).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(strings["sh.closeAsk"])).toBeVisible();
  await page
    .getByRole("alert")
    .getByRole("button", { name: strings["sh.closeNow"], exact: true })
    .click();
  await expect(page.getByText(strings["sh.warn"])).toHaveCount(0);
});

test("select a key, then Back returns to the list", async ({ hubPage: page }) => {
  await gotoHub(page, "/keys");
  const table = page.getByRole("table", { name: strings.title });
  await table.getByRole("row").nth(1).click(); // reason: row 0 is the header, row 1 the first key
  await expect(page).toHaveURL(/sel=hdy_/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sel=/);
});

test("the tabs go to their own address", async ({ hubPage: page }) => {
  await gotoHub(page, "/keys");
  await page.getByRole("tab", { name: new RegExp(strings["tab.ssh"]) }).click();
  await expect(page).toHaveURL(/\/keys\/ssh/);
  await expect(
    page
      .getByText(strings["ssh.set"])
      .or(page.getByText(strings["ssh.replace"])),
  ).toBeVisible();
});

test("a private key is refused before anything is sent", async ({ hubPage: page }) => {
  // Fixtures answer in the page, so a save shows as its result (ssh.saved); the listener also catches a real request.
  const changes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") changes.push(`${r.method()} ${r.url()}`);
  });
  await gotoHub(page, "/keys/ssh");
  await page.getByRole("button", { name: strings["ssh.replace"] }).click();
  const field = page.getByLabel(strings["ssh.field"], { exact: true });
  await field.fill(["-----BEGIN", "OPENSSH PRIVATE KEY-----\nAAAA"].join(" "));
  // Refused as it arrives, before any Save: the text does not stay in the box, and the field is marked secret.
  await expect(page.getByText(strings["ssh.e.private"])).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(page.locator("[data-secret]")).toHaveCount(1);
  // A Save now finds an empty box: it says so, the editor stays open and nothing is saved.
  const save = page.getByRole("button", { name: strings["ssh.saveReplace"] });
  await save.click();
  await expect(page.getByText(strings["ssh.e.empty"])).toBeVisible();
  await expect(save).toBeVisible();
  await expect(page.getByText(/SSH key saved on/)).toHaveCount(0);
  expect(changes).toEqual([]);
});

test("an unconfirmed create says so, offers Check again and a warned Dismiss, never a second send", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys", { state: "pendingOps" });
  await page.getByRole("table", { name: strings.title }).waitFor();
  await page
    .getByRole("button", { name: strings["action.new"], exact: true })
    .click();
  await page.getByLabel(strings["nk.name"]).fill("ci");
  await page.getByLabel(strings["nk.name"]).press("Enter");
  await expect(page.getByText(strings["pd.title"])).toBeVisible();
  await expect(
    page.getByRole("button", { name: strings["action.checkAgain"] }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: strings["nk.go"] }),
  ).toHaveCount(0);
  // Dismiss asks first and says what it risks; Cancel keeps the send unresolved.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: strings["dismiss.act"] })
    .click();
  const ask = page.getByRole("alertdialog");
  await expect(ask.getByText(strings["dismiss.bodyMint"])).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(strings["pd.title"])).toBeVisible();
});

const table = (page: Page) => page.getByRole("table", { name: strings.title });
const dataRows = (page: Page) => table(page).locator("tbody tr");
const HANDLE = "hdy_9e37.3779b1";
const UNSEARCHED = 25;

test("@search the search box narrows the rows and never writes ?q", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys");
  await table(page).waitFor();
  await expect(dataRows(page).first()).toBeVisible();
  // The search stays out of the URL, proved by the shared helper. 'sdk' is too short for it; 'readonly' is only the sdk-readonly key.
  await expectSearchStaysOutOfUrl(page, { param: "", box: page.getByRole("searchbox") }, {
    text: "readonly",
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all())
        await expect(row).toContainText(/readonly/i);
    },
  });
});

test("@filter a chip filters the rows and keeps its value in the URL", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys");
  await table(page).waitFor();
  // The State chip opens set to Active (the page default), so its name is "State Active"; the chip's own clear
  // button ("Clear State") also contains the word, so match the name from its start.
  await page
    .getByRole("group", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${strings["filter.state"]}`) })
    .click();
  await page
    .getByRole("menuitemradio", { name: strings["state.paused"] })
    .or(page.getByRole("menuitem", { name: strings["state.paused"] }))
    .click();
  await expect(page).toHaveURL(/[?&]state=paused/);
  await expect(dataRows(page)).toHaveCount(1);
  for (const row of await dataRows(page).all())
    await expect(row).toContainText(strings["state.paused"]);
});

test("@sort a column header sorts the rows and keeps ?sort", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys");
  await table(page).waitFor();
  const header = table(page).getByRole("columnheader", {
    name: strings["col.name"],
  });
  await header.getByRole("button").click();
  await expect(page).toHaveURL(/[?&]sort=-?name/);
  await expect(header).toHaveAttribute("aria-sort", /ascending|descending/);
});

test("@page the pager moves to page 2, keeps ?page and shows the next rows", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys", { state: "long" });
  await table(page).waitFor();
  const first = await dataRows(page).first().innerText();
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: "Next page" })
    .click();
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(dataRows(page).first()).not.toHaveText(first);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]page=/);
});

test("@reload chip, sort, page and the open key survive a reload, the search does not", async ({
  hubPage: page,
}) => {
  test.slow(); // the page loads twice, then the helper opens it three times and reloads it
  // Page 2 of the long list, sorted by name descending: a reload keeps both, and the rows prove it. The address names
  // a State, so the page's Active default (a filter change, which goes back to page 1) never runs.
  await gotoHub(page, "/keys?state=active&sort=-name&page=2", { state: "long" });
  await table(page).waitFor();
  await expect(dataRows(page).first()).toBeVisible();
  const firstCell = () => dataRows(page).first().locator("td").first();
  const before = await firstCell().innerText();
  await page.reload();
  await page.locator("#hub-main").waitFor();
  await expect(page).toHaveURL(/sort=-name/);
  await expect(page).toHaveURL(/page=2/);
  await expect(firstCell()).toHaveText(before);
  const header = table(page).getByRole("columnheader", {
    name: strings["col.name"],
  });
  await expect(header).toHaveAttribute("aria-sort", "descending");
  // And a chip and the open key come back too; the search does not (the helper opens a link whose search is adopted
  // once, leaves the URL, and is gone after the reload).
  await expectLinkSearchDroppedOnReload(page, { param: "", box: page.getByRole("searchbox") }, {
    text: "deploy",
    path: "/keys",
    goto: { state: "long" },
    keep: { state: "active", sort: "-name", page: "2", sel: HANDLE },
    searched: async () => {
      await expect(dataRows(page)).toHaveCount(1);
      for (const row of await dataRows(page).all())
        await expect(row).toContainText(/deploy/i);
    },
    unsearched: async () => {
      await expect(dataRows(page)).toHaveCount(UNSEARCHED);
    },
    after: async () => {
      await expect(page.getByRole("heading", { name: "ci-deploy" })).toBeVisible();
    },
  });
});

test("@no-match a search with no result shows the no-match state; Clear filters restores the rows", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys");
  await table(page).waitFor();
  await expect(dataRows(page).first()).toBeVisible();
  // Clear filters also clears the State chip the page opens on (Active), so count the rows with no State first.
  await page.getByRole("button", { name: `Clear ${strings["filter.state"]}` }).click();
  await expect(page).not.toHaveURL(/[?&]state=/);
  const before = await dataRows(page).count();
  await page.getByRole("searchbox").fill("zzzz-no-such-key");
  await expect(page.getByText(strings["st.noMatch"])).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect.poll(() => dataRows(page).count()).toBe(before);
});

test("Show all realms lists every key, read-only ones included", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys");
  await table(page).waitFor();
  await expect(dataRows(page).first()).toBeVisible();
  const before = await dataRows(page).count();
  await page.getByRole("button", { name: strings["band.showAll"] }).click();
  await expect.poll(() => dataRows(page).count()).toBeGreaterThan(before);
});

test("a new key asks for the two-step code; Cancel sends nothing and says nothing", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys", { state: "otp" });
  await page.getByRole("table", { name: strings.title }).waitFor();
  // The key handler attaches after the list loads: press until the drawer is up.
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.getByLabel(strings["nk.name"])).toBeVisible({
      timeout: 1500,
    });
  }).toPass();
  await page.getByLabel(strings["nk.name"]).fill("ci");
  await page.keyboard.press("Enter");
  const code = page.getByRole("alertdialog", {
    name: "Enter your two-step code",
  });
  await expect(code).toBeVisible();
  await code.getByRole("button", { name: "Cancel" }).click();
  await expect(code).toHaveCount(0);
  // The form is still there, nothing is pending, no refusal is shown.
  await expect(page.getByLabel(strings["nk.name"])).toHaveValue("ci");
  await expect(page.getByText(strings["pd.title"])).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: strings["nk.go"] }).click();
  await code.getByRole("textbox", { name: "Code" }).fill("123456");
  await code.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(strings["sh.warn"])).toBeVisible();
});

test("while a pause is in flight, Copy and Delete wait", async ({ hubPage: page }) => {
  await gotoHub(page, "/keys", { state: "slowPause" });
  await table(page).waitFor();
  await page.getByRole("row", { name: /ci-deploy/ }).click();
  await page.getByRole("button", { name: strings["act.pause"] }).click();
  await expect(
    page.getByRole("button", { name: strings["act.copy"] }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: strings["act.delete"] }),
  ).toBeDisabled();
});

test("a share made without its text offers Stop, and says when stopping is unconfirmed", async ({
  hubPage: page,
}) => {
  await gotoHub(page, "/keys/shared", { state: "shareTextLost" });
  await page
    .getByRole("button", { name: strings["action.share"], exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: strings["share.review"] }).click();
  await drawer.getByRole("button", { name: strings["share.create"] }).click();
  await expect(drawer.getByText(strings["share.lostSecret"])).toBeVisible();
  await drawer.getByRole("button", { name: strings["share.stopIt"] }).click();
  await expect(drawer.getByText(strings["share.stopUnknown"])).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: strings["action.checkAgain"] }),
  ).toBeVisible();
});
