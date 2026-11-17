// Share a realm, limits: an end (1, 7 or 30 days, or a picked date
// and time, at most a year), only from listed IPv4 addresses, and who it's for (kept at the end of the alias). A new
// share starts as See only. The Review states what they can and can't do before Create.
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import { REALM_A, REALM_B, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import {
  SHARE_STARTS,
  freshAlias,
  shareAlias,
  shareBodyV3,
  shareLimitsProblems,
  shareRows,
  whoOf,
  type ShareLimits,
} from "./share-logic";
import strings from "./strings.en.json";

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const DAY = 86400000;
const ALIAS = "hoody share abcdefghijkl";
const R = "0123456789abcdef01234567";
const L: ShareLimits = { days: 7, at: null, ips: "", who: "" };
const body = (ticked: readonly string[], l: Partial<ShareLimits> = {}, alias = ALIAS) =>
  shareBodyV3(alias, R, ticked, null, { ...L, ...l }, NOW);

describe("share advanced: the body", () => {
  it("untouched, a share is See only for 7 days, byte for byte", () => {
    for (const d of [1, 7, 30] as const) expect(body([], { days: d })?.expires_at).toBe(new Date(NOW + d * DAY).toISOString());
    expect(JSON.stringify(body([]))).toBe(
      `{"alias":"${ALIAS}","permissions":{"computers":{"read":true},"projects":{"read":true}},"realm_ids":["${R}"],"allow_no_realm":false,` +
        `"vault_access":false,"event_access":false,"deny_reauthorization":true,"expires_at":"2026-10-31T12:00:00.000Z"}`,
    );
    expect(shareAlias(ALIAS, "")).toBe(ALIAS);
    expect(shareAlias(ALIAS, "   ")).toBe(ALIAS);
  });

  it("Start and stop changes the permissions and nothing else", () => {
    const see = body([]);
    const act = body(SHARE_STARTS.act);
    expect(act?.permissions).toEqual({ computers: { read: true, actions: { start: true, stop: true, restart: true } }, projects: { read: true } });
    expect({ ...act, permissions: see?.permissions }).toEqual(see);
  });

  it("a picked end is sent as that instant in whole seconds, after now and up to one year", () => {
    const at = NOW + 3 * DAY + 1234;
    expect(body([], { days: null, at })?.expires_at).toBe(new Date(NOW + 3 * DAY + 1000).toISOString());
    expect(shareLimitsProblems({ ...L, days: null, at: NOW }, NOW).ends).toBe("timePast");
    expect(shareLimitsProblems({ ...L, days: null, at: NOW + 365 * DAY }, NOW).ends).toBeUndefined();
    expect(shareLimitsProblems({ ...L, days: null, at: NOW + 366 * DAY }, NOW).ends).toBe("dateFar");
    expect(shareLimitsProblems({ ...L, days: null, at: null }, NOW).ends).toBe("date");
    // Less than a second away is now once cut to whole seconds: refused, never sent as an end equal to now.
    expect(shareLimitsProblems({ ...L, days: null, at: NOW + 999 }, NOW).ends).toBe("timePast");
    expect(body([], { days: null, at: NOW + 999 })).toBeNull();
    expect(body([], { days: null, at: NOW + 400 * DAY })).toBeNull();
  });

  it("listed addresses go in ip_whitelist; a bad one sends nothing", () => {
    expect(body([], { ips: "203.0.113.7, 198.51.100.0/24" })?.ip_whitelist).toEqual(["203.0.113.7", "198.51.100.0/24"]);
    expect(body([], { ips: "203.0.113.999" })).toBeNull();
    expect(body([], { ips: "2001:db8::1" })).toBeNull();
    // Only separators: no list would be sent (any address), so it is a problem, never an unrestricted share.
    expect(shareLimitsProblems({ ...L, ips: ", ," }, NOW).ips).toBe("ipsNone");
    expect(body([], { ips: "," })).toBeNull();
  });

  it("who it's for ends the alias and reads back; bad names send nothing", () => {
    const a = shareAlias(ALIAS, " Alex ");
    expect(a).toBe(`${ALIAS} Alex`);
    expect(body([], { who: " Alex " }, a)?.alias).toBe(`${ALIAS} Alex`);
    expect(whoOf(a)).toBe("Alex");
    expect(whoOf(ALIAS)).toBeNull();
    expect(whoOf("ci-deploy Alex")).toBeNull();
    // The nonce is fresh as the full alias the ledger keeps, who included.
    let n = 0;
    const rand = (k: number) => new Uint8Array(k).fill(n++ < 1 ? 0 : 1);
    const first = freshAlias([], () => new Uint8Array(12).fill(0));
    const led = [{ alias: shareAlias(first, "Alex"), state: "out" as const, id: null, hold: "h" }];
    expect(freshAlias(led, rand, "Alex")).not.toBe(first);
    expect(shareLimitsProblems({ ...L, who: "Alex <x>" }, NOW).who).toBe("who");
    expect(shareLimitsProblems({ ...L, who: "a".repeat(41) }, NOW).who).toBe("who");
    const rows = shareRows(
      [
        {
          id: "s1",
          alias: a,
          realm_ids: [R],
          allow_no_realm: false,
          is_enabled: true,
          expires_at: new Date(NOW + DAY).toISOString(),
          created_at: new Date(NOW - DAY).toISOString(),
        },
      ],
      R,
      [],
      NOW,
    );
    expect(rows[0]?.who).toBe("Alex");
  });
});

const openDrawer = async () => {
  await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
  return screen.findByRole("dialog", {}, { timeout: 8000 });
};
const review = async (d: HTMLElement) => {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  await within(d).findByText(strings["share.rvCan"]);
};
const create = async (d: HTMLElement) => {
  await review(d);
  await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
  await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
  return createBodies[0] as Record<string, unknown>;
};

describe("share advanced: the drawer", () => {
  beforeEach(() => {
    createBodies.length = 0;
  });

  it("with no realm named, picking one in the realm list shares exactly that realm", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm() });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    const list = within(d).getByRole("radiogroup", { name: strings["share.pickRealm"] });
    // The label shows above the list and is what names it.
    const named = document.getElementById(list.getAttribute("aria-labelledby") ?? "");
    expect(named).toHaveTextContent(strings["share.pickRealm"]);
    expect(named).toBeVisible();
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeDisabled();
    expect(within(d).getByText(strings["share.whyRealm"])).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("radio", { name: /Acme client/ }));
    const b = await create(d);
    expect(b.realm_ids).toEqual([REALM_B]);
  });

  it("untouched, the drawer sends a See only share for 7 days, and the Review shows the access note first", async () => {
    const d = await openDrawer();
    const pressed = Date.now();
    await review(d);
    expect(within(d).getByText(strings["share.noteTitle"])).toBeInTheDocument();
    expect(within(d).getByText(strings["share.notePrograms"], { exact: false })).toBeInTheDocument();
    expect(within(d).getByText(strings["share.cant.keyEnds"])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    const b = createBodies[0] as Record<string, unknown>;
    expect(b.alias).toMatch(/^hoody share [a-z0-9]{12}$/);
    const end = Date.parse(String(b.expires_at));
    // Seven days from the Review press (whole seconds), never another default.
    expect(end).toBeGreaterThanOrEqual(pressed + 7 * DAY - 1000);
    expect(end).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    const want = shareBodyV3(String(b.alias), REALM_A, [], null, { ...L, days: 7 }, end - 7 * DAY);
    expect(JSON.stringify(b)).toBe(JSON.stringify(want));
  });

  it("Start and stop, an address and a name go out in one create", async () => {
    const d = await openDrawer();
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.start.act"] }));
    await userEvent.type(within(d).getByLabelText(strings["share.ips"]), "203.0.113.7");
    await userEvent.type(within(d).getByLabelText(strings["share.who"]), "Alex");
    const b = await create(d);
    expect(b.permissions).toEqual({ computers: { read: true, actions: { start: true, stop: true, restart: true } }, projects: { read: true } });
    expect(b.ip_whitelist).toEqual(["203.0.113.7"]);
    expect(b.alias).toMatch(/^hoody share [a-z0-9]{12} Alex$/);
    expect(b.vault_access).toBe(false);
    expect(b.deny_reauthorization).toBe(true);
  });

  it("a bad address keeps Review off, says why and sends nothing", async () => {
    const d = await openDrawer();
    await userEvent.type(within(d).getByLabelText(strings["share.ips"]), "10.0.0.999");
    expect(await within(d).findByText(strings["share.ipsBad"])).toBeInTheDocument();
    const go = within(d).getByRole("button", { name: strings["share.review"] });
    expect(go).toBeDisabled();
    expect(within(d).getByText(strings["share.whyLimits"])).toBeInTheDocument();
    await userEvent.click(go);
    expect(createBodies.length).toBe(0);
  });

  it("commas with no address say so, keep Review off and claim no restriction", async () => {
    const d = await openDrawer();
    await userEvent.type(within(d).getByLabelText(strings["share.ips"]), ", ,");
    expect(await within(d).findByText(strings["share.ipsNone"])).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeDisabled();
    expect(createBodies.length).toBe(0);
  });

  it("the Shared list names who a share was made for", async () => {
    await renderPage(page, { state: "sharedNamed", realm: REALM_A, path: links.shared });
    expect(await screen.findByText(/^Alex · /, {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
