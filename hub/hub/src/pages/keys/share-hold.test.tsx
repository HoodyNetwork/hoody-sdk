// Share a realm while Create waits for its hold: the drawer locks at the press,
// so what is sent is what the Review shows. The hold is gated here; everything else in core is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import type * as Core from "@core";
import { REALM_A, REALM_B, catalogueFixture, createBodies } from "./fixtures";
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

const gate = vi.hoisted(() => ({ wait: Promise.resolve(), open: () => {} }));
vi.mock("@core", async (importOriginal) => {
  const real = await importOriginal<typeof Core>();
  return {
    ...real,
    holdAttempt: (async (...a: Parameters<typeof real.holdAttempt>) => {
      await gate.wait;
      return real.holdAttempt(...a);
    }) as typeof real.holdAttempt,
  };
});

describe("share advanced: Create waiting for its hold", () => {
  beforeEach(() => {
    createBodies.length = 0;
    gate.wait = new Promise<void>((r) => (gate.open = r));
  });
  afterEach(() => gate.open());

  it("at the press nothing can change on screen, and the request is the one the Review showed", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.start.act"] }));
    await userEvent.click(await toReview(d));
    // Waiting for the hold: the Review can't be left, so nothing else can be chosen.
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    await userEvent.click(within(d).getByRole("button", { name: strings["share.back"] }));
    expect(within(d).getByText(strings["share.rvCan"])).toBeInTheDocument();
    expect(createBodies.length).toBe(0);
    gate.open();
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    const b = createBodies[0] as Record<string, unknown>;
    expect(b.permissions).toEqual({ computers: { read: true, actions: { start: true, stop: true, restart: true } }, projects: { read: true } });
    expect(b.ip_whitelist).toBeUndefined();
  }, 30000);

  it("the realm sent is the one picked, and the Review can't be left while the hold is taken", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm() });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    const list = within(d).getByRole("radiogroup", { name: strings["share.pickRealm"] });
    await userEvent.click(within(list).getByRole("radio", { name: /Acme client/ }));
    await userEvent.click(await toReview(d));
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    expect(within(d).queryByRole("radiogroup", { name: strings["share.pickRealm"] })).toBeNull();
    expect(createBodies.length).toBe(0);
    gate.open();
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    expect((createBodies[0] as Record<string, unknown>).realm_ids).toEqual([REALM_B]);
  }, 30000);

  it("rights the server drops while the hold is taken send nothing, and the drawer goes back to Choose", async () => {
    catalogueFixture.reset();
    catalogueFixture.dropAfterRefusal = ["computers.actions.exec"];
    const view = await renderPage(page, { state: "catalogueMoves", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    await userEvent.click(await within(d).findByRole("checkbox", { name: strings["share.r.computers.actions.exec"] }));
    await userEvent.click(await toReview(d));
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    const reads = catalogueFixture.reads;
    catalogueFixture.dropNow = true;
    await view.queryClient.invalidateQueries();
    await waitFor(() => expect(catalogueFixture.reads).toBeGreaterThan(reads));
    gate.open();
    expect(await within(d).findByText(strings["share.changedRights"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole("checkbox", { name: strings["share.r.computers.actions.exec"] })).toBeNull();
    expect(createBodies.length).toBe(0);
  }, 30000);

  it("a Custom choice whose catalogue is lost sends nothing, during the hold or with the Review open", async () => {
    catalogueFixture.reset();
    const view = await renderPage(page, { state: "catalogueMoves", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    // Only rights a starting point also has, so losing the catalogue keeps them: only the Custom rule can refuse.
    await userEvent.click(await within(d).findByRole("checkbox", { name: strings["share.r.computers.actions.start"] }));
    expect(within(d).getByRole("radio", { name: strings["share.start.custom"] })).toBeChecked();
    await userEvent.click(await toReview(d));
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    const reads = catalogueFixture.reads;
    catalogueFixture.emptyNow = true;
    await view.queryClient.invalidateQueries();
    await waitFor(() => expect(catalogueFixture.reads).toBeGreaterThan(reads));
    gate.open();
    expect(await within(d).findByText(strings["share.changedRights"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(createBodies.length).toBe(0);
    // Back on Choose, Custom can't be reviewed now.
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeDisabled();
    expect(within(d).getByText(strings["share.whyCustom"])).toBeInTheDocument();
  }, 30000);

  it("Custom chosen by name over a starting point's ticks sends nothing once its catalogue is lost in the hold", async () => {
    catalogueFixture.reset();
    const view = await renderPage(page, { state: "catalogueMoves", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    // The ticks stay See only's: only the named Custom choice can refuse.
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.start.custom"] }));
    expect(within(d).getByRole("radio", { name: strings["share.start.custom"] })).toBeChecked();
    await userEvent.click(await toReview(d));
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    const reads = catalogueFixture.reads;
    catalogueFixture.emptyNow = true;
    await view.queryClient.invalidateQueries();
    await waitFor(() => expect(catalogueFixture.reads).toBeGreaterThan(reads));
    gate.open();
    expect(await within(d).findByText(strings["share.changedRights"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(createBodies.length).toBe(0);
  }, 30000);

  it("with the Review open, a lost catalogue under Custom voids the Review", async () => {
    catalogueFixture.reset();
    gate.open();
    const view = await renderPage(page, { state: "catalogueMoves", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    await userEvent.click(await within(d).findByRole("checkbox", { name: strings["share.r.computers.actions.start"] }));
    await toReview(d);
    catalogueFixture.emptyNow = true;
    await view.queryClient.invalidateQueries();
    expect(await within(d).findByText(strings["share.changedRights"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: strings["share.create"] })).toBeNull();
    expect(createBodies.length).toBe(0);
  }, 30000);

  it("the end sent is the one the Review showed, however long the hold took", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    const reviewedAt = Date.now();
    await userEvent.click(await toReview(d));
    const afterReview = Date.now();
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.back"] })).toBeDisabled());
    // An hour passes while the hold is taken.
    const real = Date.now;
    const later = vi.spyOn(Date, "now").mockImplementation(() => real() + 3600000);
    try {
      gate.open();
      await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    } finally {
      later.mockRestore();
    }
    const end = Date.parse(String((createBodies[0] as Record<string, unknown>).expires_at));
    expect(end).toBeGreaterThanOrEqual(reviewedAt + 7 * 86400000 - 1000);
    expect(end).toBeLessThanOrEqual(afterReview + 7 * 86400000);
  }, 30000);
});
