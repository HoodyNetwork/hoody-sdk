// Keys > Shared: while a Check again is reading, that Check shows it is busy and the Dismiss of the same change is
// off until the read answers, as on the API keys and SSH tabs (a Dismiss now could free a change the read is about to
// settle, and its send could go out a second time). Two places: a row's pause, resume or edit, and the banner over
// unresolved shares. (A stop is checked in the Stop dialog, which cannot be closed while its Check reads.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { capture } from "@core";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, managedShare, sharedServer } from "./fixtures";
import { ledgerFor, resetLedgers } from "./share-logic";
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

const robin = () => managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" });
const rowOf = () => screen.findByRole("row", { name: /Robin/ }, { timeout: 10000 });
const openShared = async () => {
  const view = await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
  act(() => setRealm(REALM_A));
  return view;
};
/** Holds the next read of the list until `release()`; `out()`: that read has arrived and is waiting. */
function holdNextList(): { release: () => void; out: () => boolean } {
  let release = (): void => {};
  let arrived = false;
  const held = new Promise<void>((go) => {
    release = go;
  });
  sharedServer.beforeList = () => {
    arrived = true;
    return held;
  };
  return { release: () => release(), out: () => arrived };
}
let gate: ReturnType<typeof holdNextList> | null = null;

describe("Shared tab: a Check again that is out turns the Dismiss of the same change off", () => {
  beforeEach(() => freshStart());
  afterEach(() => {
    gate?.release();
    gate = null;
    sharedServer.beforeList = null;
  });

  it("a row's pause that may have gone through: its Check again is busy and its Dismiss is off until the read answers", async () => {
    sharedServer.reset([robin()]);
    sharedServer.setEnabled = "lost";
    await openShared();
    await userEvent.click(within(await rowOf()).getByRole("button", { name: /^More for the / }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: new RegExp(strings["share.pause"]) }));
    const check = await within(await rowOf()).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    const dismiss = async () => within(await rowOf()).getByRole("button", { name: strings["dismiss.act"] });
    expect(await dismiss()).toBeEnabled();
    gate = holdNextList();
    await userEvent.click(check);
    await waitFor(() => expect(gate?.out()).toBe(true));
    await waitFor(async () =>
      expect(within(await rowOf()).getByRole("button", { name: strings["state.checkAgain"] })).toHaveAttribute("data-pending"),
    );
    expect(await dismiss()).toBeDisabled();
    gate.release();
    // The share is still live: the read proved nothing, and the row keeps both ways out.
    await waitFor(async () => expect(await dismiss()).toBeEnabled(), { timeout: 8000 });
    expect(within(await rowOf()).getByRole("button", { name: strings["state.checkAgain"] })).not.toHaveAttribute("data-pending");
    expect(sharedServer.sent.filter((x) => x.kind === "setEnabled")).toHaveLength(1);
  }, 40000);

  it("a Dismiss confirmed while the row's Check is out frees nothing", async () => {
    sharedServer.reset([robin()]);
    sharedServer.setEnabled = "lost";
    await openShared();
    await userEvent.click(within(await rowOf()).getByRole("button", { name: /^More for the / }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: new RegExp(strings["share.pause"]) }));
    const check = await within(await rowOf()).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    // The warning is opened first, then the Check starts under it (a key press reaches the row's button).
    await userEvent.click(within(await rowOf()).getByRole("button", { name: strings["dismiss.act"] }));
    const ask = await screen.findByRole("alertdialog");
    gate = holdNextList();
    act(() => check.click());
    await waitFor(() => expect(gate?.out()).toBe(true));
    await userEvent.click(within(ask).getByRole("button", { name: strings["dismiss.go"] }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    gate.release();
    // Still unconfirmed: the row keeps Check again (the Dismiss was refused; the read proved nothing).
    await waitFor(async () =>
      expect(within(await rowOf()).getByRole("button", { name: strings["dismiss.act"] })).toBeEnabled(),
      { timeout: 8000 },
    );
    expect(within(await rowOf()).getByRole("button", { name: strings["state.checkAgain"] })).toBeInTheDocument();
    expect(within(await rowOf()).queryByRole("button", { name: /^More for the / })).toBeNull();
  }, 40000);

  it("the banner over unresolved shares: while its Check is out, its Dismiss is off", async () => {
    sharedServer.reset([robin()]);
    ledgerFor(capture().account, REALM_A).push({ alias: "hoody share shown0000", state: "unknown", id: null });
    await openShared();
    const title = await screen.findByText(strings["share.cantCheck"], undefined, { timeout: 8000 });
    const banner = title.closest("div[class*='heldBanner']") as HTMLElement;
    expect(banner).not.toBeNull();
    const dismiss = () => within(banner).getByRole("button", { name: strings["dismiss.act"] });
    expect(dismiss()).toBeEnabled();
    gate = holdNextList();
    await userEvent.click(within(banner).getByRole("button", { name: /Check again/ }));
    await waitFor(() => expect(gate?.out()).toBe(true));
    await waitFor(() => expect(dismiss()).toBeDisabled());
    gate.release();
    await waitFor(() => expect(dismiss()).toBeEnabled(), { timeout: 8000 });
    // Not proved (the list holds no such share): the entry is still unresolved.
    expect(ledgerFor(capture().account, REALM_A).find((x) => x.alias === "hoody share shown0000")?.state).toBe("unknown");
  }, 40000);
});
