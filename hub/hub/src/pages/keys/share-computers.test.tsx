// Share a realm: before sharing, the drawer lists the realm's computers by name and says that any
// computer added to the realm later is reached too. The list is read from the base computer list filtered by realm_id
// (the membership a share token is checked against); it is never part of the request that makes the share.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, renderPage, screen, waitFor, within } from "@app/testing";
import { accountContainersRoute, answers, fixtureWorld, type FixtureAnswer, type FixtureRequest } from "@core";
import fixtures, { REALM_A, REALM_B, createBodies, shareComputersFixture, slowGate } from "./fixtures";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

/** Create is on the Review step; Review first (it waits for the rights list). */
async function toReview(d: HTMLElement) {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}

const PROJECT_A = fixtureWorld.projects.find((p) => p.realm === REALM_A)!.name;
const drawer = () => screen.findByRole("dialog", {}, { timeout: 8000 });
const list = (d: HTMLElement) => within(d).findByTestId("share-computers", {}, { timeout: 8000 });
const names = (el: HTMLElement) => within(el).queryAllByRole("listitem").map((li) => li.textContent ?? "");
const row = (i: number) => ({ id: `c0ffee${String(i).padStart(18, "0")}`, name: `box-${String(i).padStart(3, "0")}`, status: "running" });

describe("share drawer: the computers it reaches", () => {
  beforeEach(() => {
    shareComputersFixture.reset();
    createBodies.length = 0;
    slowGate.reset();
  });
  // A held answer never outlives its test, even a failed one.
  afterEach(() => slowGate.reset());

  it("in a realm view it lists that realm's computers by name, read with realm_id on the base list", async () => {
    await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    const el = await list(d);
    await waitFor(() => expect(names(el).map((n) => n.split(" · ")[0])).toEqual(["atlas", "cedar", "fjord"]));
    expect(names(el)[0]).toBe(`atlas · ${PROJECT_A}`);
    expect(within(el).queryByText("borealis")).toBeNull();
    expect(shareComputersFixture.sent.at(-1)).toEqual({ realm_id: REALM_A, page: "1", limit: "100" });
    expect(within(d).getByRole("heading", { name: strings["share.compTitle"] })).toBeInTheDocument();
    expect(within(d).getByText("3 computers in this realm now")).toBeInTheDocument();
  }, 30000);

  it("the later line shows with the list, while reading, and in place of an empty list", async () => {
    let release!: () => void;
    shareComputersFixture.answer = () => new Promise((go) => { release = () => go({ status: 200, body: { data: { computers: [] } } }); });
    await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    const el = await list(d);
    expect(within(el).getByText(strings["share.compLater"])).toBeInTheDocument();
    expect(within(el).getAllByText(strings["share.compReading"]).length).toBeGreaterThan(0);
    await waitFor(() => expect(typeof release).toBe("function"));
    release();
    await within(el).findByText(strings["share.compNone"], {}, { timeout: 8000 });
    expect(names(el)).toEqual([]);
  }, 30000);

  it("in All realms nothing is listed until a realm is picked; another realm's late answer never shows", async () => {
    // A's answer is held until B's list is on screen, then lands: B's rows stay.
    let releaseA!: () => void;
    shareComputersFixture.answer = (q) =>
      q.realm_id === REALM_A
        ? new Promise<FixtureAnswer>((go) => {
            releaseA = () => go({ status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => c.realm_ids.includes(REALM_A)) } } });
          })
        : { status: 200, body: { data: { computers: fixtureWorld.computers.filter((c) => c.realm_ids.includes(q.realm_id ?? "")) } } };
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm() });
    const d = await drawer();
    expect(within(d).queryByTestId("share-computers")).toBeNull();
    const pick = within(d).getByRole("radiogroup", { name: strings["share.pickRealm"] });
    await userEvent.click(within(pick).getByRole("radio", { name: /Personal/ }));
    let el = await list(d);
    await waitFor(() => expect(typeof releaseA).toBe("function"));
    expect(within(el).getAllByText(strings["share.compReading"]).length).toBeGreaterThan(0);
    await userEvent.click(within(pick).getByRole("radio", { name: /Acme client/ }));
    el = await list(d);
    await within(el).findByText("borealis", {}, { timeout: 8000 });
    releaseA();
    await new Promise((go) => setTimeout(go, 300));
    el = await list(d);
    expect(within(el).getByText("borealis")).toBeInTheDocument();
    expect(within(el).queryByText("atlas")).toBeNull();
    expect(shareComputersFixture.sent.at(-1)?.realm_id).toBe(REALM_B);
  }, 30000);

  it("a failed read says what the share reaches, Try again reads again, and Create stays on", async () => {
    let fail = true;
    shareComputersFixture.answer = () => (fail ? answers.refused(503, "SERVICE_UNAVAILABLE") : { status: 200, body: { data: { computers: [row(1)] } } });
    await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    const el = await list(d);
    await within(el).findByText(strings["share.compFailed"], {}, { timeout: 15000 });
    expect(within(el).getByText(strings["share.compEvery"])).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeEnabled();
    fail = false;
    await userEvent.click(within(el).getByRole("button", { name: strings["share.compRetry"] }));
    await within(el).findByText("box-001", {}, { timeout: 8000 });
    expect(within(el).queryByText(strings["share.compFailed"])).toBeNull();
  }, 40000);

  it("past 8 names the rest sit behind Show all; a full page of 100 says more are in the realm", async () => {
    shareComputersFixture.answer = () => ({ status: 200, body: { data: { computers: Array.from({ length: 100 }, (_, i) => row(i + 1)) } } });
    await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    const el = await list(d);
    await within(el).findByText("box-001", {}, { timeout: 8000 });
    expect(within(el).getByText("box-008")).toBeVisible();
    const all = within(el).getByRole("button", { name: "Show all 100" });
    expect(all).toHaveAttribute("aria-expanded", "false");
    expect(within(el).getByText(strings["share.compMore"])).toBeInTheDocument();
    expect(within(d).getByText("The first 100 computers in this realm now")).toBeInTheDocument();
    await userEvent.click(all);
    await within(el).findByText("box-100", {}, { timeout: 8000 });
    expect(within(el).getByText(strings["share.compLater"])).toBeInTheDocument();
  }, 30000);

  it("the list never reaches the request: the body sent is the same whether the list read, was empty or failed", async () => {
    // The alias is fresh per try and the end date follows the clock: both are set aside, everything else must match.
    const sentWith = async (answer: typeof shareComputersFixture.answer, settled: string) => {
      shareComputersFixture.reset();
      shareComputersFixture.answer = answer;
      createBodies.length = 0;
      const r = await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
      const d = await drawer();
      await within(await list(d)).findByText(settled, {}, { timeout: 15000 });
      await userEvent.click(await toReview(d));
      await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
      const b = { ...(createBodies[0] as Record<string, unknown>) };
      expect(typeof b.alias).toBe("string");
      expect(typeof b.expires_at).toBe("string");
      b.alias = "ALIAS";
      b.expires_at = "END";
      r.unmount();
      return b;
    };
    const read = await sentWith(null, "atlas");
    const empty = await sentWith(() => ({ status: 200, body: { data: { computers: [] } } }), strings["share.compNone"]);
    const failed = await sentWith(() => answers.refused(503, "SERVICE_UNAVAILABLE"), strings["share.compFailed"]);
    expect(empty).toEqual(read);
    expect(failed).toEqual(read);
    expect(read.realm_ids).toEqual([REALM_A]);
    for (const n of ["atlas", "cedar", "fjord", "c0a715"]) expect(JSON.stringify(read)).not.toContain(n);
  }, 60000);

  it("while the share is being sent, Try again waits like the rest of the form", async () => {
    shareComputersFixture.answer = () => answers.refused(503, "SERVICE_UNAVAILABLE");
    await renderPage(page, { state: "slowSharePending", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    const el = await list(d);
    await within(el).findByText(strings["share.compFailed"], {}, { timeout: 15000 });
    const again = within(el).getByRole("button", { name: strings["share.compRetry"] });
    expect(again).toBeEnabled();
    // The share's answer waits for the test, not a 500 ms timer a loaded run can outlast.
    slowGate.hold();
    await userEvent.click(await toReview(d));
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    // The Review shows the same list, locked like the rest of the drawer.
    const shown = await list(d);
    await within(shown).findByText(strings["share.compFailed"], {}, { timeout: 15000 });
    expect(within(shown).getByRole("button", { name: strings["share.compRetry"] })).toBeDisabled();
    const before = shareComputersFixture.sent.length;
    await userEvent.click(within(shown).getByRole("button", { name: strings["share.compRetry"] }));
    expect(shareComputersFixture.sent.length).toBe(before);
    // Still sending when the press came: Back stays off until the held answer goes.
    expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled();
    act(() => slowGate.release());
  }, 40000);

  it("the keys fixtures answer only the Share read: an account-wide read without realm_id falls through to its own page", () => {
    const req = (query: Record<string, string>) => ({ route: accountContainersRoute, method: "GET", path: "/computers", query, body: undefined, target: null, n: 1 }) as unknown as FixtureRequest;
    const unfiltered = [req({ page: "1", limit: "1" }), req({ page: "1", limit: "100" }), req({ page: "2", limit: "100" })];
    let checked = 0;
    for (const [name, rules] of Object.entries(fixtures.states)) {
      for (const rule of rules as readonly { route: unknown; when?: (r: FixtureRequest) => boolean }[]) {
        if (rule.route !== accountContainersRoute) continue;
        checked++;
        expect(rule.when, `${name}: an account-wide rule with no predicate catches every page's read`).toBeTypeOf("function");
        for (const u of unfiltered) expect(rule.when!(u), `${name} ${JSON.stringify(u.query)}`).toBe(false);
        expect(rule.when!(req({ realm_id: REALM_A, page: "1", limit: "100" })), name).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(Object.keys(fixtures.states).length - 1);
  });
});
