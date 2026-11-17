// Share a realm: the share also gives a sign-in link. The link carries the token in the URL
// fragment (never sent to a server, never in a query), names the realm by id, and is held like the token itself:
// masked until Show, copied at the press, dropped on close, and never in the page's markup or storage.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type * as Core from "@core";
import type * as Kit from "@kit";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import { REALM_A, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import { shareLink } from "./share-logic";
import strings from "./strings.en.json";

/** Create is on the Review step; Review first (it waits for the rights list). */
async function toReview(d: HTMLElement) {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}

const TOKEN = /hdy_[0-9a-f_]+/;

// What the page holds and draws, seen at the boundary: every held sign-in link (to check it is dropped) and every
// QR payload (to check what the code carries). Test memory only.
// `site`: what hubSiteOrigin answers (null: the real one, this page's origin as a served Hub).
const seen = vi.hoisted(() => ({ links: [] as { dropped: boolean }[], qrText: [] as string[], qrUrl: [] as string[], site: null as string | null }));
vi.mock("@core", async (importOriginal) => {
  const real = await importOriginal<typeof Core>();
  return {
    ...real,
    hubSiteOrigin: () => seen.site ?? real.hubSiteOrigin(),
    holdSecret: ((value: string, ctx: Parameters<typeof real.holdSecret>[1]) => {
      const h = real.holdSecret(value, ctx);
      if (h && value.includes("/auth/login?signin=token#")) seen.links.push(h);
      return h;
    }) as typeof real.holdSecret,
  };
});
vi.mock("@kit", async (importOriginal) => {
  const real = await importOriginal<typeof Kit>();
  return {
    ...real,
    qrTextMatrix: ((text: string | undefined) => {
      if (text) seen.qrText.push(text);
      return real.qrTextMatrix(text);
    }) as typeof real.qrTextMatrix,
    qrMatrix: ((url: string | undefined) => {
      if (url) seen.qrUrl.push(url);
      return real.qrMatrix(url);
    }) as typeof real.qrMatrix,
  };
});

/** Open a kit Disclosure by its title (its button's name starts with the title; a description may follow). */
const openFold = async (d: HTMLElement, title: string) =>
  userEvent.click(within(d).getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }));
const made = async () => {
  await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
  const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
  await userEvent.click(await toReview(d));
  await within(d).findByText(strings["share.linkTitle"], {}, { timeout: 8000 });
  // The sign-in link, and the QR code with the agent prompt, each sit in a closed fold under the message.
  await openFold(d, strings["share.linkTitle"]);
  await openFold(d, strings["share.moreTitle"]);
  return d;
};
const stored = () => {
  const all: string[] = [];
  // eslint-disable-next-line no-restricted-globals -- the test reads browser storage to prove no token is kept
  for (const st of [localStorage, sessionStorage])
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i) ?? "";
      all.push(k, st.getItem(k) ?? "");
    }
  return all.join("\n");
};

describe("sign-in link text", () => {
  it("the token and the realm id ride the fragment of the token sign-in page; a realm that is not an id is left out", () => {
    const realm = "0123456789abcdef01234567";
    const url = new URL(shareLink("https://hub.example", "hdy_ab12", realm));
    expect(url.origin + url.pathname).toBe("https://hub.example/auth/login");
    expect(url.search).toBe("?signin=token");
    const frag = new URLSearchParams(url.hash.slice(1));
    expect(frag.get("token")).toBe("hdy_ab12");
    expect(frag.get("realm")).toBe(realm);
    expect(url.search).not.toContain("hdy_");
    expect(new URLSearchParams(new URL(shareLink("https://h", "hdy_1", "global")).hash.slice(1)).has("realm")).toBe(false);
    expect(new URLSearchParams(new URL(shareLink("https://h", "hdy_1", "My Realm")).hash.slice(1)).has("realm")).toBe(false);
  });
});

describe("share panel: sign-in link", () => {
  beforeEach(() => {
    createBodies.length = 0;
    seen.links.length = 0;
    seen.qrText.length = 0;
    seen.qrUrl.length = 0;
    seen.site = null;
  });

  it("made: the link section shows, masked, with the warning; the token is nowhere in the markup or storage", async () => {
    const d = await made();
    expect(within(d).getByText(strings["share.linkNote"])).toBeInTheDocument();
    // The panel's one warning (its Verdict) covers the link too.
    expect(within(d).getByText(/or with the sign-in link/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    expect(document.body.innerHTML).not.toContain("signin=token");
    for (const el of Array.from(document.querySelectorAll("[href],[src]")))
      expect(`${el.getAttribute("href") ?? ""}${el.getAttribute("src") ?? ""}`).not.toMatch(TOKEN);
    expect(stored()).not.toMatch(TOKEN);
  });

  it("Copy the link puts the full link on the clipboard without Show: token and realm id in the fragment", async () => {
    const write = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const d = await made();
    await userEvent.click(within(d).getByRole("button", { name: strings["share.linkCopy"] }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const url = new URL(String(write.mock.calls[0]?.[0] ?? ""));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe("/auth/login");
    const frag = new URLSearchParams(url.hash.slice(1));
    expect(frag.get("token")).toMatch(TOKEN);
    expect(frag.get("realm")).toBe(REALM_A);
    // Copy never writes the link into the page.
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    expect(stored()).not.toMatch(TOKEN);
  });

  it("closing the drawer drops the link: nothing of it stays in the markup or storage", async () => {
    const d = await made();
    await userEvent.click(within(d).getByRole("button", { name: strings["share.done"] }));
    await screen.findByText(strings["share.closeAsk"]);
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: strings["sh.closeNow"] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(seen.links.length).toBe(1);
    expect(seen.links.every((h) => h.dropped)).toBe(true);
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    expect(document.body.innerHTML).not.toContain(strings["share.linkTitle"]);
    expect(stored()).not.toMatch(TOKEN);
  });

  it("page hide drops the link: its section leaves, and the code falls back to the share text", async () => {
    const d = await made();
    expect(seen.links.length).toBe(1);
    expect(seen.links[0]!.dropped).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(within(d).queryByText(strings["share.linkTitle"])).toBeNull());
    expect(seen.links[0]!.dropped).toBe(true);
    expect(within(d).queryByRole("button", { name: strings["share.linkCopy"] })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(TOKEN);
  });

  it("the QR carries the sign-in link once shown with the token on, and this Hub's shared-access sign-in without it", async () => {
    const d = await made();
    expect(seen.qrUrl).toEqual([`${window.location.origin}/auth/login?signin=token`]);
    expect(seen.qrText).toEqual([]); // nothing with the token is drawn before Show
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    await userEvent.click(within(d).getByRole("button", { name: strings["share.qrShow"] }));
    expect(seen.qrText.length).toBeGreaterThan(0);
    for (const text of seen.qrText) {
      const url = new URL(text);
      expect(url.origin + url.pathname + url.search).toBe(`${window.location.origin}/auth/login?signin=token`);
      const frag = new URLSearchParams(url.hash.slice(1));
      expect(frag.get("token")).toMatch(TOKEN);
      expect(frag.get("realm")).toBe(REALM_A);
    }
  });

  it("closing the fold hides a shown token code again: reopened, it needs Show again; the held link stays", async () => {
    const d = await made();
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    await userEvent.click(within(d).getByRole("button", { name: strings["share.qrShow"] }));
    expect(within(d).getByRole("button", { name: strings["share.qrHide"] })).toBeInTheDocument();
    await openFold(d, strings["share.moreTitle"]); // closes it
    await openFold(d, strings["share.moreTitle"]); // opens it again
    expect(within(d).queryByRole("button", { name: strings["share.qrHide"] })).toBeNull();
    expect(within(d).getByRole("button", { name: strings["share.qrShow"] })).toBeInTheDocument();
    expect(within(d).getByRole("img", { name: strings["share.qrHiddenLabel"] })).toBeInTheDocument();
    // Hiding is not a wipe: the link is still held, so Copy and a second Show still work.
    expect(seen.links.every((h) => !h.dropped)).toBe(true);
    expect(within(d).getByRole("button", { name: strings["share.linkCopy"] })).toBeEnabled();
  });

  it("closing the link fold hides a shown link again: reopened, it needs Show again; the held link stays", async () => {
    const write = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const d = await made();
    const field = () => within(d).getByRole("group", { name: strings["share.linkLabel"] });
    await userEvent.click(within(field()).getByRole("button", { name: "Show" }));
    expect(document.body.innerHTML).toMatch(TOKEN);
    await openFold(d, strings["share.linkTitle"]); // closes it
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    await openFold(d, strings["share.linkTitle"]); // opens it again
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    expect(within(field()).getByRole("button", { name: "Show" })).toBeInTheDocument();
    // Hiding is not a wipe: the link is still held, so Copy and a second Show still work.
    expect(seen.links).toHaveLength(1);
    expect(seen.links.every((h) => !h.dropped)).toBe(true);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.linkCopy"] }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(String(write.mock.calls[0]?.[0] ?? "")).toMatch(TOKEN);
    await userEvent.click(within(field()).getByRole("button", { name: "Show" }));
    expect(document.body.innerHTML).toMatch(TOKEN);
  });
});

describe("share panel: the Hoody address the share names", () => {
  beforeEach(() => {
    createBodies.length = 0;
    seen.links.length = 0;
    seen.qrUrl.length = 0;
    seen.site = null;
  });
  const copied = async (d: HTMLElement) => {
    const write = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    await userEvent.click(within(d).getByRole("button", { name: strings["share.copy"] }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    return String(write.mock.calls[0]?.[0] ?? "");
  };

  it("a served Hub names its own origin, as before: the message's line, the link and the QR code", async () => {
    const d = await made();
    const how = strings["share.textHow"].replace("{{url}}", window.location.origin);
    expect((await copied(d)).split("\n")).toContain(how);
    expect(seen.links).toHaveLength(1);
    expect(seen.qrUrl).toEqual([`${window.location.origin}/auth/login?signin=token`]);
  });

  it("with no Hoody address chosen, nothing names one: no line, no sign-in link, no QR code (the section says why)", async () => {
    seen.site = "";
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    await userEvent.click(await toReview(d));
    await within(d).findByText(strings["share.msgTitle"], {}, { timeout: 8000 });
    expect(within(d).queryByText(strings["share.linkTitle"])).toBeNull();
    expect(seen.links).toHaveLength(0);
    const text = await copied(d);
    expect(text).toMatch(TOKEN);
    expect(text).not.toContain(strings["share.textHow"].split("{{url}}")[0]!.trim());
    await openFold(d, strings["share.moreTitle"]);
    expect(within(d).getByText(strings["share.qrNoSite"])).toBeInTheDocument();
    expect(seen.qrUrl).toEqual([]);
  });
});
