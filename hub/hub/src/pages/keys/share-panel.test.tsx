// Share a realm: the panel in sections, a QR code with a choice to include the token
// and a ready-to-paste prompt for an agent (70). The token never reaches the page's markup or storage until Show, and
// the "Include the token" choice is the drawer's own state (off on every open).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { capture, holdSecret, type HeldSecret } from "@core";
import { TokenQr } from "./parts/ShareShown";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import { REALM_A, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import { sharePrompt } from "./share-logic";
import strings from "./strings.en.json";

/** Create is on the Review step; Review first (it waits for the rights list). */
async function toReview(d: HTMLElement) {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}

const TOKEN = /hdy_[0-9a-f_]+/;

const openDrawer = async () => {
  await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
  return screen.findByRole("dialog", {}, { timeout: 8000 });
};
/** Open a kit Disclosure by its title (its button's name starts with the title; a description may follow). */
const openFold = async (d: HTMLElement, title: string) =>
  userEvent.click(within(d).getByRole("button", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }));
const made = async () => {
  const d = await openDrawer();
  await userEvent.click(await toReview(d));
  await within(d).findByText(strings["share.qrTitle"], {}, { timeout: 8000 });
  // The QR code, the switch and the agent prompt sit in one closed fold under the message.
  await openFold(d, strings["share.moreTitle"]);
  return d;
};
const stored = () => {
  const all: string[] = [];
  // eslint-disable-next-line no-restricted-globals -- the test reads browser storage to prove no token or choice is kept
  for (const st of [localStorage, sessionStorage])
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i) ?? "";
      all.push(k, st.getItem(k) ?? "");
    }
  return all.join("\n");
};

describe("share prompt text", () => {
  it("realm, API URL, the token line and the end date, one per line", () => {
    const text = sharePrompt({
      head: "H",
      api: "A",
      auth: "T",
      ends: "E",
    });
    expect(text).toBe("H\nA\nT\nE");
    expect(sharePrompt({ head: "H", api: "A", auth: "T", ends: null })).toBe("H\nA\nT");
  });
});

describe("share panel (QR code and agent prompt)", () => {
  beforeEach(() => {
    createBodies.length = 0;
  });

  it("the form reads top to bottom in sections; what they can do is a main choice, See only first and chosen", async () => {
    const d = await openDrawer();
    // Section heads in reading order, whatever their level (the form's parts are sub-sections of the drawer).
    const heads = within(d)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(heads.indexOf(strings["share.can"])).toBeGreaterThan(-1);
    expect(heads.indexOf(strings["share.limits"])).toBeGreaterThan(heads.indexOf(strings["share.can"]));
    // Visible at once, nothing to open first.
    const see = await within(d).findByRole("radio", { name: strings["share.start.see"] });
    expect(see).toBeVisible();
    expect(see).toBeChecked();
    expect(within(d).getByLabelText(strings["share.ips"])).toBeVisible();
  });

  it("made, with Include the token off: the QR opens this Hub, the prompt has a placeholder, no token anywhere", async () => {
    const d = await made();
    const sw = within(d).getByRole("switch", { name: strings["share.withToken"] });
    expect(sw).not.toBeChecked();
    // The code opens this Hub (https only; the test page is http, so it says why there is none).
    if (window.location.protocol === "https:")
      expect(within(d).getByRole("img", { name: strings["share.qrHubLabel"] })).toBeInTheDocument();
    else expect(within(d).getByText(strings["share.qrNoHub"])).toBeInTheDocument();
    const prompt = within(d).getByTestId("share-prompt");
    expect(prompt.textContent).toContain(strings["share.promptPlaceholder"]);
    expect(prompt.textContent).toContain(`https://${REALM_A}.api.fixture.invalid/api/v1`);
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    expect(stored()).not.toMatch(TOKEN);
  });

  it("Include the token on: the code and the prompt stay hidden until Show, with the warning, and never in a link", async () => {
    const d = await made();
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    expect(within(d).getByText(strings["share.qrTokenWarn"].replace(/\{\{.*$/, "").trim(), { exact: false })).toBeInTheDocument();
    expect(within(d).getByRole("img", { name: strings["share.qrHiddenLabel"] })).toBeInTheDocument();
    expect(within(d).queryByRole("img", { name: strings["share.qrLinkLabel"] })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.qrShow"] }));
    expect(within(d).getByRole("img", { name: strings["share.qrLinkLabel"] })).toBeInTheDocument();
    expect(within(d).queryByRole("img", { name: strings["share.qrTokenLabel"] })).toBeNull(); // a held link is what the code holds
    // The code is drawn, never written out, and no element links to it.
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    for (const el of Array.from(document.querySelectorAll("[href],[src]")))
      expect(`${el.getAttribute("href") ?? ""}${el.getAttribute("src") ?? ""}`).not.toMatch(TOKEN);
    expect(stored()).not.toMatch(TOKEN);
    // The prompt with the token is drawn with the token masked; there is no Show for it at all.
    expect(within(d).getByTestId("share-prompt-masked").textContent).toContain(strings["share.promptMask"]);
    expect(within(d).queryByTestId("share-prompt")).toBeNull();
    expect(within(d).getByRole("button", { name: strings["share.promptCopy"] })).toBeEnabled();
  });

  it("the choice is not kept anywhere: after close nothing of it, nor the token, is in storage", async () => {
    const d = await made();
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    await userEvent.click(within(d).getByRole("button", { name: strings["share.done"] }));
    await screen.findByText(strings["share.closeAsk"]);
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: strings["sh.closeNow"] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored()).not.toMatch(/withToken|includeToken/i);
    expect(stored()).not.toMatch(TOKEN);
  });

  it("page hide with Include the token off drops the prompt too: turning it on later shows no token", async () => {
    const d = await made();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    expect(within(d).getByText(strings["share.promptNoToken"])).toBeVisible();
    expect(within(d).queryByTestId("share-prompt-masked")).toBeNull();
    expect(within(d).getByRole("button", { name: strings["share.copy"] })).toBeDisabled();
  });

  it("on, off, on keeps the prompt with the token, never on screen, and Copy puts it, token included, on the clipboard", async () => {
    const write = vi.fn(async (_: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const d = await made();
    const sw = within(d).getByRole("switch", { name: strings["share.withToken"] });
    await userEvent.click(sw);
    await userEvent.click(sw);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    await userEvent.click(sw);
    expect(within(d).getByTestId("share-prompt-masked")).toBeVisible();
    expect(within(d).queryByText(strings["share.promptNoToken"])).toBeNull();
    expect(document.body.innerHTML).not.toMatch(TOKEN);
    const copy = within(within(d).getByTestId("share-prompt-masked").parentElement!).getByRole("button", { name: strings["share.promptCopy"] });
    await userEvent.click(copy);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const copied = String(write.mock.calls[0]?.[0] ?? "");
    expect(copied).toMatch(TOKEN);
    expect(copied).toContain(`https://${REALM_A}.api.fixture.invalid/api/v1`);
    expect(copied).toContain("Authorization: Bearer hdy_");
  });

  it("a shown token code hides again when the tab is hidden", async () => {
    const d = await made();
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    await userEvent.click(within(d).getByRole("button", { name: strings["share.qrShow"] }));
    expect(within(d).getByRole("img", { name: strings["share.qrLinkLabel"] })).toBeInTheDocument();
    const was = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    if (was) Object.defineProperty(document, "visibilityState", was);
    else delete (document as { visibilityState?: unknown }).visibilityState;
    expect(within(d).queryByRole("img", { name: strings["share.qrLinkLabel"] })).toBeNull();
    expect(within(d).getByRole("img", { name: strings["share.qrHiddenLabel"] })).toBeInTheDocument();
  });
});

describe("token code: nothing is read before Show", () => {
  it("the held text is not read until Show code", async () => {
    const ctx = capture();
    const real = holdSecret("Hoody shared access: x\nToken: hdy_00", ctx)!;
    let reads = 0;
    // The real held secret behind a counter of its reads.
    const held: HeldSecret = {
      ctx: real.ctx,
      get dropped() {
        return real.dropped;
      },
      reveal: (c) => {
        reads++;
        return real.reveal(c);
      },
      drop: () => real.drop(),
      onDrop: (fn) => real.onDrop(fn),
    };
    const view = render(<TokenQr held={held} ctx={ctx} warning="w" />);
    expect(reads).toBe(0);
    await userEvent.click(view.getByRole("button", { name: strings["share.qrShow"] }));
    expect(reads).toBeGreaterThan(0);
    view.unmount();
    held.drop();
  });
});
