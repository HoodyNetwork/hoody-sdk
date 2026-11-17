// On the Keys tab a share the Shared tab does not manage
// (shareConforms false) offers neither Pause/Resume nor Copy, in the row menu or the inspector; Delete stays, as Stop
// does on the Shared tab. A share this page manages and a plain key keep both. An already-open Copy drawer rechecks it
// against the fresh read at send.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, managedShare, sent, sharedServer } from "./fixtures";
import { resetLedgers } from "./share-logic";
import page from "./page";
import strings from "./strings.en.json";

vi.mock("@kit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

function freshStart(): void {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetLedgers();
  vi.mocked(showToast).mockClear();
}

// vault_access makes a share one the Shared tab does not manage.
const unmanagedOn = managedShare(4, 70, { alias: "hoody share efghijklmnop Robin", vault_access: true });
const unmanagedOff = managedShare(5, 70, { alias: "hoody share fghijklmnopq Kim", vault_access: true, is_enabled: false });
const managed = managedShare(6, 30, { alias: "hoody share ghijklmnopqr Sam" });

const TOGGLE = new RegExp(`^(${strings["act.pause"]}|${strings["act.resume"]})$`);

/** Selects the row, then reads the inspector's action buttons. */
async function inspectorOf(name: RegExp): Promise<HTMLElement> {
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  // Delete is offered for every key: once it shows, the inspector (header actions and danger group) is drawn.
  const del = await screen.findByRole("button", { name: strings["act.delete"] });
  expect(del).toBeInTheDocument();
  return screen.getByRole("region", { name: "Details" });
}

/** The row menu's item names. */
async function menuOf(name: RegExp): Promise<string[]> {
  await userEvent.click(within(screen.getByRole("row", { name })).getByRole("button", { name: /Row actions|More actions/ }));
  const items = within(await screen.findByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent ?? "");
  await userEvent.keyboard("{Escape}");
  return items;
}

const has = (items: string[], label: string | RegExp) =>
  items.some((t) => (typeof label === "string" ? t.includes(label) : label.test(t)));

describe("Keys tab: a share the Shared tab does not manage", () => {
  beforeEach(() => {
    freshStart();
    // The list also carries the fixture keys (withShares): ci-deploy is a plain realm A key.
    sharedServer.reset([unmanagedOn, unmanagedOff, managed]);
  });

  it("an active unmanaged share offers no Pause and no Copy, in the inspector or the menu; Delete stays", async () => {
    await renderPage(page, { state: "sharedServer" });
    act(() => setRealm(REALM_A));
    const box = await inspectorOf(/efghijklmnop/);
    expect(within(box).queryByRole("button", { name: TOGGLE })).toBeNull();
    expect(within(box).queryByRole("button", { name: strings["act.copy"] })).toBeNull();
    expect(within(box).getByRole("button", { name: strings["act.delete"] })).toBeInTheDocument();
    const items = await menuOf(/efghijklmnop/);
    expect(has(items, strings["act.pause"])).toBe(false);
    expect(has(items, strings["act.copy"])).toBe(false);
    expect(has(items, strings["act.delete"])).toBe(true);
    expect(sharedServer.sent).toEqual([]);
  }, 40000);

  it("a paused unmanaged share offers no Resume and no Copy either", async () => {
    // The list opens on State: Active; the paused share is listed under State: Paused.
    await renderPage(page, { state: "sharedServer", path: "/keys?state=paused" });
    act(() => setRealm(REALM_A));
    const box = await inspectorOf(/fghijklmnopq/);
    expect(within(box).queryByRole("button", { name: TOGGLE })).toBeNull();
    expect(within(box).queryByRole("button", { name: strings["act.copy"] })).toBeNull();
    const items = await menuOf(/fghijklmnopq/);
    expect(has(items, strings["act.resume"])).toBe(false);
    expect(has(items, strings["act.copy"])).toBe(false);
    expect(has(items, strings["act.delete"])).toBe(true);
  }, 40000);

  it("a share this page manages and a plain key keep Pause and Copy", async () => {
    await renderPage(page, { state: "sharedServer" });
    act(() => setRealm(REALM_A));
    for (const name of [/ghijklmnopqr/, /ci-deploy/]) {
      const box = await inspectorOf(name);
      expect(within(box).getByRole("button", { name: strings["act.pause"] })).toBeEnabled();
      expect(within(box).getByRole("button", { name: strings["act.copy"] })).toBeEnabled();
      const items = await menuOf(name);
      expect(has(items, strings["act.pause"])).toBe(true);
      expect(has(items, strings["act.copy"])).toBe(true);
    }
  }, 40000);

  it("a Copy drawer open while the share is managed sends nothing once a fresh read shows it unmanaged", async () => {
    sent.copy = 0;
    await renderPage(page, { state: "sharedServer" });
    act(() => setRealm(REALM_A));
    const box = await inspectorOf(/ghijklmnopqr/);
    await userEvent.click(within(box).getByRole("button", { name: strings["act.copy"] }));
    const d = await screen.findByRole("dialog");
    // Another tab renames it off the share scheme: the same prefix, rights, realm and end (its scope is unchanged).
    const at = sharedServer.rows.findIndex((r) => r.id === managed.id);
    sharedServer.rows[at] = { ...sharedServer.rows[at]!, alias: "hoody share GHIJKLMNOPQR Sam" };
    await userEvent.click(within(d).getByRole("button", { name: strings["cp.go"] }));
    expect(await within(d).findByText(strings["out.refused.CHANGED"], {}, { timeout: 10000 })).toBeInTheDocument();
    expect(sent.copy).toBe(0);
  }, 40000);

  it("the same drawer still copies a share that stays managed (the control)", async () => {
    sent.copy = 0;
    await renderPage(page, { state: "sharedServer" });
    act(() => setRealm(REALM_A));
    const box = await inspectorOf(/ghijklmnopqr/);
    await userEvent.click(within(box).getByRole("button", { name: strings["act.copy"] }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: strings["cp.go"] }));
    await waitFor(() => expect(sent.copy).toBe(1), { timeout: 10000 });
  }, 40000);
});
