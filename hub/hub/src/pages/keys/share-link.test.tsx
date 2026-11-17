// links.shareRealm (the shell's realm menu "Share this realm…"): /keys/shared?share=1&open_realm=<id>
// opens the share drawer once, preselecting the realm when the account lists it, and drops both keys from the
// address so a reload or Back does not reopen it.
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, renderPage, screen, waitFor, within } from "@app/testing";
import { REALM_A, REALM_B } from "./fixtures";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

const search = (r: { router: { state: { location: { search: unknown } } } }) =>
  r.router.state.location.search as Record<string, string>;
const drawer = () => screen.findByRole("dialog", {}, { timeout: 8000 });

describe("keys: share a realm from a link", () => {
  it("in All realms, opens the drawer with the named realm picked and drops the keys", async () => {
    const r = await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_B) });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Acme client/ })).toBeInTheDocument();
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(search(r)).not.toHaveProperty("open_realm");
  });

  it("in All realms with no realm named, opens the drawer with the realm still to pick", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm() });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: strings["share.titleAll"] })).toBeInTheDocument();
  });

  it("a realm the account does not list is not picked", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm("0123456789abcdef01234567") });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: strings["share.titleAll"] })).toBeInTheDocument();
  });

  it("with the shell on that realm, opens the drawer for it", async () => {
    await renderPage(page, { state: "shared", path: links.shareRealm(REALM_A) });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Personal/ })).toBeInTheDocument();
  });

  it("with the shell on another realm, opens nothing (it never shares a realm the page is not showing)", async () => {
    const r = await renderPage(page, { state: "shared", path: links.shareRealm(REALM_B) });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  // "Show all realms" widens this page's list only: the shell still shows one realm, so a link may share only that one.
  const showAllThenFollow = async (realm: string) => {
    const r = await renderPage(page);
    await userEvent.click(await screen.findByRole("button", { name: strings["band.showAll"] }));
    await act(async () => {
      await r.router.navigate({ to: links.shared as never, search: { share: "1", open_realm: realm } as never });
    });
    return r;
  };

  it("a link arriving while the drawer is open changes nothing in it (its own pick stays)", async () => {
    const r = await renderPage(page);
    await userEvent.click(await screen.findByRole("button", { name: strings["band.showAll"] }));
    await act(async () => {
      await r.router.navigate({ to: links.shared as never });
    });
    // All realms: the button says it shares a realm to be picked (the drawer's own title), not "this realm".
    // The empty list's card holds the same button, so take the header's (the first).
    await userEvent.click((await screen.findAllByRole("button", { name: strings["share.titleAll"] }))[0]!);
    const d = await drawer();
    expect(within(d).getByRole("radiogroup", { name: strings["share.pickRealm"] })).toBeInTheDocument();
    await act(async () => {
      await r.router.navigate({ to: links.shared as never, search: { share: "1", open_realm: REALM_A } as never });
    });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(within(d).getByRole("radiogroup", { name: strings["share.pickRealm"] })).toBeInTheDocument();
  });

  it("after Show all realms, a link naming a realm the shell is not on still opens nothing", async () => {
    const r = await showAllThenFollow(REALM_B);
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("after Show all realms, a link naming the shell's realm opens a drawer bound to it, with no realm to pick", async () => {
    await showAllThenFollow(REALM_A);
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Personal/ })).toBeInTheDocument();
    expect(within(d).queryByRole("radiogroup", { name: strings["share.pickRealm"] })).toBeNull();
  });
});

// open_realm, older links: a share link of the older form says ?share=1&realm=<id>. The shell no
// longer switches on ?realm=, so the page reads it as the realm to share and judges it as before: it never shares a
// realm the shell is not showing, and both keys leave the address.
describe("keys: an old share link (?share=1&realm=<id>, from before open_realm)", () => {
  const old = (realm: string) => `${links.shared}?share=1&realm=${realm}`;

  it("in All realms, opens the drawer with the named realm picked and drops both keys", async () => {
    const r = await renderPage(page, { state: "shared", realm: "all", path: old(REALM_B) });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Acme client/ })).toBeInTheDocument();
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(search(r)).not.toHaveProperty("realm");
  });

  it("with the shell on another realm, opens nothing and drops both keys", async () => {
    const r = await renderPage(page, { state: "shared", path: old(REALM_B) });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(search(r)).not.toHaveProperty("realm");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with the shell on that realm, opens the drawer for it", async () => {
    await renderPage(page, { state: "shared", path: old(REALM_A) });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Personal/ })).toBeInTheDocument();
  });

  // The shell drops open_realm before this page mounts, so the page cannot tell a
  // link naming two realms from an old link. Two keys naming different realms contradict each other: nothing opens,
  // whatever the page sees; two naming the same realm open it.
  it("open_realm and realm naming different realms open nothing, on one realm, and both keys leave", async () => {
    const r = await renderPage(page, { state: "shared", path: `${links.shareRealm(REALM_A)}&realm=${REALM_B}` });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(search(r)).not.toHaveProperty("open_realm");
    expect(search(r)).not.toHaveProperty("realm");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open_realm and realm naming different realms open nothing in All realms either (no picker)", async () => {
    const r = await renderPage(page, { state: "shared", realm: "all", path: `${links.shareRealm(REALM_A)}&realm=${REALM_B}` });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open_realm and realm naming the same realm open it", async () => {
    await renderPage(page, { state: "shared", path: `${links.shareRealm(REALM_A)}&realm=${REALM_A}` });
    const d = await drawer();
    expect(within(d).getByRole("heading", { name: /Personal/ })).toBeInTheDocument();
  });
});

// The shell can still show a realm the account's list no longer has (the list read
// dropped it while the alias read failed). A share link then binds to nothing: only a listed realm is ever shared.
describe("keys: a share link while the shell shows a realm the list lacks", () => {
  const GONE = "0123456789abcdef01234567";
  it.each([
    ["naming it", links.shareRealm(GONE)],
    ["naming none", links.shareRealm()],
  ])("opens nothing (%s)", async (_label, path) => {
    const r = await renderPage(page, { state: "shared", realm: GONE, path });
    await waitFor(() => expect(search(r)).not.toHaveProperty("share"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
