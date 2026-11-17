// The Keys page's tab counts say what they count. On the page, the Shared access tab
// reads "Shared access 1 share" / "2 shares" and the API keys tab "API keys N key(s)", and those words are part of the
// tab's name; the SSH key tab never has a count. The tab names keep the label first, so lookups by label still match.
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderPage, screen, waitFor } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { REALM_A, managedShare, sharedServer } from "./fixtures";
import { resetLedgers } from "./share-logic";
import page from "./page";
import strings from "./strings.en.json";

beforeEach(() => {
  resetAttempts();
  resetChanges();
  resetLedgers();
});

const tab = (label: string) => screen.getByRole("tab", { name: new RegExp(`^${label}`) });
const openShared = async (shares: number) => {
  sharedServer.reset(Array.from({ length: shares }, (_, i) => managedShare(i + 4, 70)));
  await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
  act(() => setRealm(REALM_A));
};

describe("Keys tabs: a count names its unit", () => {
  it.each([
    [1, "1 share"],
    [2, "2 shares"],
  ])("%i share(s): the Shared access tab reads the count with its unit, in its text and its name", async (n, words) => {
    await openShared(n);
    await waitFor(() => expect(tab(strings["tab.shared"]).textContent).toBe(`${strings["tab.shared"]}${words}`), { timeout: 10000 });
    expect(tab(strings["tab.shared"])).toHaveAccessibleName(new RegExp(`^${strings["tab.shared"]}\\s*${words}$`));
  });

  it("the API keys tab reads its count with key or keys; the SSH key tab has no count", async () => {
    await renderPage(page, { path: "/keys" });
    act(() => setRealm(REALM_A));
    await waitFor(() => expect(tab(strings["tab.keys"]).textContent).toMatch(/\d/), { timeout: 10000 });
    const text = tab(strings["tab.keys"]).textContent ?? "";
    const n = Number(/(\d+)/.exec(text.slice(strings["tab.keys"].length))?.[1]);
    expect(text).toBe(`${strings["tab.keys"]}${n} ${n === 1 ? "key" : "keys"}`);
    expect(tab(strings["tab.ssh"]).textContent).toBe(strings["tab.ssh"]);
  });
});
