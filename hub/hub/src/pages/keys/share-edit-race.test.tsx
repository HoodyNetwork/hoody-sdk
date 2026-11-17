// The Shared tab's Pause, Resume and details edits use the same changes as the
// Keys tab (setEnabledM, editM), so each tab sees what the other holds, a pause is not sent while an edit is held, and a
// reload keeps an unresolved edit with the exact body it sent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, managedShare, sharedServer } from "./fixtures";
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

const robin = () => managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" });
const rowOf = (name: RegExp) => screen.findByRole("row", { name }, { timeout: 10000 });
const openShared = async () => {
  const view = await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
  act(() => setRealm(REALM_A));
  return view;
};
/** Edit details: open the who row's editor, type `name`, press its Save (it sends that one field). */
const saveWho = async (d: HTMLElement, name: string) => {
  const row = d.querySelector<HTMLElement>('[data-share-field="who"]');
  if (!row) throw new Error("no who row");
  await userEvent.click(within(row).getByRole("button", { name: strings["share.editChange"] }));
  const who = within(row).getByLabelText(strings["share.who"]);
  await userEvent.clear(who);
  await userEvent.type(who, name);
  await userEvent.click(within(row).getByRole("button", { name: strings["share.editGo"] }));
};
const menuItem = async (name: string) => {
  await userEvent.click(within(await rowOf(/Robin/)).getByRole("button", { name: /^More for the / }));
  await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: new RegExp(name) }));
};

describe("Shared and Keys tabs see each other's changes of a share", () => {
  beforeEach(() => freshStart());

  it("a pause from Shared that may have gone through is held on the Keys tab too, which sends no resume", async () => {
    sharedServer.reset([robin()]);
    sharedServer.setEnabled = "lost";
    await openShared();
    await menuItem(strings["share.pause"]);
    await within(await rowOf(/Robin/)).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    await userEvent.click(screen.getByRole("tab", { name: new RegExp(strings["tab.keys"]) }));
    const keyRow = await rowOf(/efghijklmnop/);
    expect(await within(keyRow).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 })).toBeInTheDocument();
    expect(sharedServer.sent).toHaveLength(1);
  }, 40000);

  it("Pause is not sent while an edit of the share may have gone through", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "lost";
    await openShared();
    await menuItem(strings["share.editDetails"]);
    const d = await screen.findByRole("dialog");
    await saveWho(d, "Sam");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The row shows the held edit: no menu, so no pause from here. The Keys tab's Pause refuses too.
    expect(within(await rowOf(/Robin/)).queryByRole("button", { name: /^More for the / })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: new RegExp(strings["tab.keys"]) }));
    await rowOf(/efghijklmnop/);
    expect(sharedServer.sent.map((x) => x.kind)).toEqual(["update"]);
  }, 40000);

  it("after a reload an unresolved edit keeps the body it sent: a read showing that body proves it", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "lost";
    const view = await openShared();
    await menuItem(strings["share.editDetails"]);
    const d = await screen.findByRole("dialog");
    await saveWho(d, "Sam");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.unmount();
    resetAttempts();
    await openShared();
    // Held after the reload, with the body sent: not "can't be checked".
    await userEvent.click(await within(await rowOf(/Robin/)).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 }));
    expect(await within(await rowOf(/Robin/)).findByText(strings["said.notYet"])).toBeInTheDocument();
    // It landed: the next Check proves it from that body.
    (sharedServer.rows[0] as { alias: string }).alias = "hoody share efghijklmnop Sam";
    await userEvent.click(within(await rowOf(/Robin/)).getByRole("button", { name: strings["state.checkAgain"] }));
    // Proved: the list is read again and shows the share as saved.
    expect(await rowOf(/Sam/)).toBeInTheDocument();
    expect(within(await rowOf(/Sam/)).queryByRole("button", { name: strings["state.checkAgain"] })).toBeNull();
    expect(sharedServer.sent).toHaveLength(1);
  }, 40000);

  it("on the Keys tab a paused share this page does not manage offers no Resume; a managed one can be resumed", async () => {
    sharedServer.reset([
      managedShare(4, 70, { alias: "hoody share efghijklmnop Robin", is_enabled: false, vault_access: true }),
      managedShare(5, 30, { alias: "hoody share fghijklmnopq Sam", is_enabled: false }),
    ]);
    // The list opens on State: Active; both paused shares are listed under State: Paused.
    await renderPage(page, { state: "sharedServer", path: "/keys?state=paused" });
    act(() => setRealm(REALM_A));
    const resumeOf = async (name: RegExp) => {
      await waitFor(
        async () => {
          const row = screen.getByRole("row", { name });
          if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
          expect(screen.getByRole("row", { name })).toHaveAttribute("aria-selected", "true");
        },
        { timeout: 10000, interval: 300 },
      );
      // Delete is offered for every key: once it shows, the inspector's actions are drawn.
      await screen.findByRole("button", { name: strings["act.delete"] });
      return screen.queryByRole("button", { name: strings["act.resume"] });
    };
    expect(await resumeOf(/efghijklmnop/)).toBeNull();
    expect(await resumeOf(/fghijklmnopq/)).toBeEnabled();
    // The row's own menu says the same.
    const menuResume = async (name: RegExp) => {
      await userEvent.click(within(screen.getByRole("row", { name })).getByRole("button", { name: /Row actions|More actions/ }));
      const item = within(await screen.findByRole("menu")).queryByRole("menuitem", { name: new RegExp(strings["act.resume"]) });
      const said = item === null ? "absent" : item.getAttribute("aria-disabled") === "true" ? "off" : "on";
      await userEvent.keyboard("{Escape}");
      return said;
    };
    expect(await menuResume(/efghijklmnop/)).toBe("absent");
    expect(await menuResume(/fghijklmnopq/)).toBe("on");
    expect(sharedServer.sent).toEqual([]);
  }, 40000);
});
