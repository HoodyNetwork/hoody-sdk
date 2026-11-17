// "All permissions": the base and every offered right for the one realm. Its card says
// what it still leaves out and that it can spend money; it never joins the no-catalogue fallback. Follow-up
// The card names what outlasts the share and that commands reach secrets, the
// 22 rights are pinned, and a catalogue that shrinks after the pick turns it into Custom.
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import { capsOf, minimumHeld } from "@core/token";
import { REALM_A, catalogueFixture, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import { SHARE_BASE, SHARE_OFFER, SHARE_STARTS, availableRights, effectiveRights, neverReason, shareBodyV3, startOf } from "./share-logic";
import strings from "./strings.en.json";

const NOW = Date.parse("2026-11-10T06:00:00.000Z");
const LIMITS = { days: 7 as const, at: null, ips: "", who: "" };
const CAT = { rights: [...SHARE_BASE, ...SHARE_OFFER.map((o) => o.right)], full: null, billing: false, templates: [] };
const leaves = (tree: unknown, prefix = ""): string[] =>
  Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) =>
    v === true ? [prefix + k] : v && typeof v === "object" ? leaves(v, `${prefix}${k}.`) : [],
  );

describe("All permissions: the rules", () => {
  it("is the base plus every offered right, opens at sign-in, and holds nothing a share never holds", () => {
    const b = shareBodyV3("hoody share abcdefghijkl", REALM_A, SHARE_STARTS.all, CAT, LIMITS, NOW);
    const sent = leaves(b?.permissions);
    expect([...sent].sort()).toEqual([...SHARE_BASE, ...SHARE_OFFER.map((o) => o.right)].sort());
    expect(minimumHeld(capsOf({ perms: b?.permissions ?? {}, eventAccess: false, vaultAccess: false }))).toBe(true);
    for (const p of sent) expect(neverReason(p), p).toBeNull();
    expect(b?.realm_ids).toEqual([REALM_A]);
    expect([b?.allow_no_realm, b?.vault_access, b?.event_access, b?.deny_reauthorization]).toEqual([false, false, false, true]);
    expect(startOf(SHARE_STARTS.all)).toBe("all");
  });

  // The card (share.start.allH) is fixed text written for exactly these 22 rights. A new offered right joins All
  // permissions by itself, so this list fails first: review the card (and its test below) before adding it here.
  it("holds exactly the 22 rights its card was written for", () => {
    expect([...SHARE_STARTS.all]).toEqual([
      "computers.actions.start",
      "computers.actions.stop",
      "computers.actions.restart",
      "computers.actions.logs",
      "computers.update",
      "computers.create",
      "computers.delete",
      "computers.actions.exec",
      "resources.ssh_keys",
      "computers.features.env_values",
      "computers.features.snapshots",
      "computers.features.networking",
      "computers.features.kvm",
      "computers.features.ai",
      "computers.features.hoody_kit",
      "projects.create",
      "projects.update",
      "projects.delete",
      "resources.firewalls",
      "resources.proxy_aliases",
      "resources.storage_shares",
      "resources.bot_urls",
    ]);
  });

  it("never joins the no-catalogue fallback: without a catalogue only the other starts' rights are offered", () => {
    const fallback = [...new Set([...SHARE_STARTS.see, ...SHARE_STARTS.act, ...SHARE_STARTS.work])].sort();
    expect([...availableRights(null)].sort()).toEqual(fallback);
    // Without a catalogue, picking every right still sends only the fallback's rights.
    expect([...effectiveRights(SHARE_STARTS.all, null)].sort()).toEqual([...SHARE_BASE, ...fallback].sort());
  });
});

const open = async (state = "shared") => {
  await renderPage(page, { state, realm: "all", path: links.shareRealm(REALM_A) });
  return screen.findByRole("dialog", {}, { timeout: 8000 });
};

describe("All permissions: the drawer", () => {
  beforeEach(() => {
    createBodies.length = 0;
    catalogueFixture.reset();
  });

  it("picking it shows its card, which names what it can do, the money rights and what it leaves out", async () => {
    const d = await open();
    expect(within(d).queryByText(strings["share.start.allH"])).toBeNull();
    const all = await within(d).findByRole("radio", { name: strings["share.start.all"] });
    await waitFor(() => expect(all).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(all);
    expect(all).toBeChecked();
    const card = within(d).getByText(strings["share.start.allH"]);
    const text = card.textContent ?? "";
    const [does, leavesOut] = text.split("It still leaves out");
    for (const part of ["delete computers and projects", "run commands", "logs and environment values", "add SSH keys that keep working after the share ends", "cost money"])
      expect(does, part).toContain(part);
    // Commands reach what is on a computer, its secrets too; what outlasts the share is named, and it can let others in.
    expect(does).toContain("anything on them, secrets included, is reachable this way");
    expect(does).toContain("Program addresses, storage shares and Bot links it sets up can let other people in, and keep working after you stop the share.");
    expect(does).not.toContain("Some other things");
    for (const part of ["billing and wallet", "your vault", "email and account history", "sign-in history", "staff tools"])
      expect(leavesOut, part).toContain(part);
    // projects.read (the base) still shows project members and invitations until the API update ships: never listed as left out.
    expect(leavesOut).not.toMatch(/who is in your projects/);
    expect(leavesOut).toContain("project invitations and the people in your projects");
  });

  it("with a catalogue that lacks one offered right it is greyed out, the other starts stay", async () => {
    catalogueFixture.dropAfterRefusal = ["computers.features.kvm"];
    catalogueFixture.dropNow = true;
    const d = await open("catalogueMoves");
    const na = strings["share.startNA"].replace("{{start}}", strings["share.start.all"]);
    await waitFor(() => expect(within(d).getByRole("radio", { name: strings["share.start.work"] })).toBeEnabled(), { timeout: 8000 });
    expect(within(d).getByRole("radio", { name: na })).toBeDisabled();
  });

  it("picked, then the catalogue shrinks: the pick becomes Custom, its card goes, and All is greyed out", async () => {
    catalogueFixture.dropAfterRefusal = ["computers.features.kvm"];
    const view = await renderPage(page, { state: "catalogueMoves", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    const all = await within(d).findByRole("radio", { name: strings["share.start.all"] });
    await waitFor(() => expect(all).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(all);
    expect(within(d).getByText(strings["share.start.allH"])).toBeInTheDocument();
    const reads = catalogueFixture.reads;
    catalogueFixture.dropNow = true;
    await view.queryClient.invalidateQueries();
    await waitFor(() => expect(catalogueFixture.reads).toBeGreaterThan(reads));
    const na = strings["share.startNA"].replace("{{start}}", strings["share.start.all"]);
    await waitFor(() => expect(within(d).getByRole("radio", { name: strings["share.start.custom"] })).toBeChecked(), { timeout: 8000 });
    expect(within(d).getByRole("radio", { name: na })).toBeDisabled();
    expect(within(d).queryByText(strings["share.start.allH"])).toBeNull();
  }, 30000);

  it("without the catalogue it is greyed out", async () => {
    const d = await open("noCatalogue");
    expect(await within(d).findByText(strings["share.catFailed"], {}, { timeout: 8000 })).toBeInTheDocument();
    const na = strings["share.startNA"].replace("{{start}}", strings["share.start.all"]);
    expect(within(d).getByRole("radio", { name: na })).toBeDisabled();
  });
});
