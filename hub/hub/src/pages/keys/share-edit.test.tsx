// The Shared tab after create. A stop is proved only by the share's absence from a
// complete list (a paused row still there proves nothing), paused shares are listed, and a share this page manages
// offers Edit details, Change what they can do and Pause/Resume; any other share offers Stop only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, isOff, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { cancelOtp, otpState } from "@core/otp";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, REALM_B, createBodies, managedShare, sharedServer, shares } from "./fixtures";
import { defineMutation } from "@core";
import { routes } from "./routes";
import { resetLedgers, settle } from "./share-logic";
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

const toasts = () => vi.mocked(showToast).mock.calls.map((c) => String(c[0].title));
const stoppedToast = strings["share.stopped"].replace("{{realm}}", "Personal");

/** The share's row in the Shared list, by who it was made for. */
const rowOf = (who: string) => screen.findByRole("row", { name: new RegExp(who) }, { timeout: 10000 });

/** Edit details: one setting row per field; its Change… opens that field's editor under the row. */
const settingRow = (d: HTMLElement, field: "who" | "ends" | "ips") => {
  const row = d.querySelector<HTMLElement>(`[data-share-field="${field}"]`);
  if (!row) throw new Error(`no ${field} row`);
  return row;
};
const openSetting = async (d: HTMLElement, field: "who" | "ends" | "ips") => {
  await userEvent.click(within(settingRow(d, field)).getByRole("button", { name: strings["share.editChange"] }));
  return settingRow(d, field);
};
/** Opens the who row, types `name` over it and returns the row (its Save sends that one field). */
const typeWho = async (d: HTMLElement, name: string) => {
  const row = await openSetting(d, "who");
  const who = within(row).getByLabelText(strings["share.who"]);
  await userEvent.clear(who);
  await userEvent.type(who, name);
  return row;
};
const saveIn = (row: HTMLElement) => userEvent.click(within(row).getByRole("button", { name: strings["share.editGo"] }));

describe("Shared tab: Stop is proved only by the share's absence", () => {
  beforeEach(() => freshStart());
  afterEach(() => vi.useRealTimers());

  it("a stop that may have gone through, read back with the share still listed but paused, stays unresolved", async () => {
    sharedServer.reset([managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" })]);
    sharedServer.remove = "lost";
    await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    await userEvent.click(within(await rowOf("Robin")).getByRole("button", { name: strings["share.stop"] }));
    await userEvent.click(await screen.findByRole("button", { name: strings["share.stopGo"] }));
    const dialog = await screen.findByRole("alertdialog");
    const check = await within(dialog).findByRole("button", { name: /Check again/ });
    // Another tab paused it meanwhile: the share is still there, so the stop is not proved.
    (sharedServer.rows[0] as { is_enabled: boolean }).is_enabled = false;
    await userEvent.click(check);
    expect(await within(dialog).findByText(strings["share.stopNotYet"])).toBeInTheDocument();
    expect(toasts()).not.toContain(stoppedToast);
    expect(sharedServer.sent.filter((x) => x.kind === "remove")).toHaveLength(1);
  }, 30000);
});

const robin = () => managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" });
const openMenu = async (who: string) => {
  const row = await rowOf(who);
  await userEvent.click(within(row).getByRole("button", { name: /^More for the / }));
  return screen.findByRole("menu");
};
const openShared = async () => {
  const view = await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
  act(() => setRealm(REALM_A));
  return view;
};

describe("Shared tab: paused shares, and shares this page does not manage", () => {
  beforeEach(() => freshStart());

  it("a paused share is listed, says Paused, and offers Resume", async () => {
    sharedServer.reset([managedShare(5, 20, { alias: "hoody share fghijklmnopq Sam", is_enabled: false })]);
    await openShared();
    const row = await rowOf("Sam");
    expect(within(row).getByText(strings["state.paused"])).toBeInTheDocument();
    const menu = await openMenu("Sam");
    expect(within(menu).getByRole("menuitem", { name: strings["share.resume"] })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: strings["share.pause"] })).toBeNull();
  }, 30000);

  it("every share this page does not manage offers Stop only, with the note, and sends nothing else", async () => {
    const bad = [
      managedShare(1, 30, { alias: "hoody share bcdefghijklm Vault", vault_access: true }),
      managedShare(2, 30, { alias: "hoody share cdefghijklmn Events", event_access: true }),
      managedShare(3, 30, { alias: "hoody share defghijklmno Never", permissions: { computers: { read: true }, projects: { read: true }, vault: { read: true } } }),
      managedShare(6, 24 * 400, { alias: "hoody share ghijklmnopqr Far" }),
      managedShare(7, 30, { alias: "hoody share hijklmnopqrs NoBase", permissions: { computers: { read: false, actions: { start: true } } } }),
      managedShare(8, 30, { alias: "hoody share ijklmnopqrst Closure", permissions: { computers: { read: true, features: { snapshots: true } }, projects: { read: true } } }),
      managedShare(9, 30, { alias: "hoody share jklmnopqrstu Paused", is_enabled: false, vault_access: true }),
      { ...(shares[0] as object), id: "0123456789abcdef01234567", alias: "hoody share klmnopqrstuv Legacy" },
      // A share made before projects.read was a base right: it can't be opened at all, and says so.
      managedShare(10, 30, { alias: "hoody share lmnopqrstuvw Old", permissions: { computers: { read: true, actions: { start: true } } } }),
    ];
    sharedServer.reset(bad as never);
    await openShared();
    for (const who of ["Vault", "Events", "Never", "Far", "NoBase", "Closure", "Paused", "Legacy", "Old"]) {
      const row = await rowOf(who);
      const cant = who === "NoBase" || who === "Old";
      expect(within(row).getByText(strings[cant ? "share.cantOpen" : "share.notManaged"])).toBeInTheDocument();
      expect(within(row).queryByText(strings[cant ? "share.notManaged" : "share.cantOpen"])).toBeNull();
      expect(within(row).getByRole("button", { name: strings["share.stop"] })).toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /^More for the / })).toBeNull();
    }
    expect(sharedServer.sent).toEqual([]);
  }, 30000);
});

describe("Shared tab: listing is not conformance", () => {
  beforeEach(() => freshStart());

  it("a share reaching several realms, every realm or no realm, or with no end, is listed with Stop only; an ended one is not", async () => {
    sharedServer.reset([
      managedShare(1, 70, { alias: "hoody share aaaaaaaaaaaa Two", realm_ids: [REALM_A, REALM_B] }),
      managedShare(2, 70, { alias: "hoody share bbbbbbbbbbbb Every", realm_ids: [] }),
      managedShare(3, 70, { alias: "hoody share cccccccccccc NoRealm", allow_no_realm: true }),
      managedShare(4, 70, { alias: "hoody share dddddddddddd Forever", expires_at: null }),
      managedShare(5, -2, { alias: "hoody share eeeeeeeeeeee Ended" }),
    ]);
    await openShared();
    for (const who of ["Two", "Every", "NoRealm", "Forever"]) {
      const row = await rowOf(who);
      expect(within(row).getByText(strings["share.notManaged"])).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: strings["share.stop"] })).toBeInTheDocument();
      expect(within(row).queryByRole("button", { name: /^More for the / })).toBeNull();
    }
    expect(screen.queryByRole("row", { name: /Ended/ })).toBeNull();
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("in All realms a share reaching two realms is one row", async () => {
    sharedServer.reset([managedShare(1, 70, { alias: "hoody share aaaaaaaaaaaa Two", realm_ids: [REALM_A, REALM_B] })]);
    await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
    act(() => setRealm("all"));
    await rowOf("Two");
    expect(screen.getAllByRole("row", { name: /Two/ })).toHaveLength(1);
  }, 30000);
});

describe("Shared tab: Pause and Resume", () => {
  beforeEach(() => freshStart());

  it("Pause sends the pause alone and the row then says Paused; Resume sends the resume", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: strings["share.pause"] }));
    await waitFor(() => expect(within(screen.getByRole("row", { name: /Robin/ })).getByText(strings["state.paused"])).toBeInTheDocument(), { timeout: 8000 });
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: strings["share.resume"] }));
    await waitFor(() => expect(sharedServer.sent).toHaveLength(2));
    expect(sharedServer.sent.map((x) => [x.kind, x.body])).toEqual([
      ["setEnabled", { is_enabled: false }],
      ["setEnabled", { is_enabled: true }],
    ]);
  }, 30000);

  it("a pause that may have gone through stays unconfirmed until a read shows it paused", async () => {
    sharedServer.reset([robin()]);
    sharedServer.setEnabled = "lost";
    await openShared();
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: strings["share.pause"] }));
    const check = await within(await rowOf("Robin")).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    await userEvent.click(check);
    expect(await within(await rowOf("Robin")).findByText(strings["said.notYet"])).toBeInTheDocument();
    // It landed after all: the next Check proves it.
    (sharedServer.rows[0] as { is_enabled: boolean }).is_enabled = false;
    await userEvent.click(within(await rowOf("Robin")).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(within(screen.getByRole("row", { name: /Robin/ })).queryByRole("button", { name: strings["state.checkAgain"] })).toBeNull(), { timeout: 8000 });
    expect(sharedServer.sent).toHaveLength(1);
  }, 30000);
});

describe("Shared tab: Stop waits for an edit of the share", () => {
  beforeEach(() => freshStart());
  const stopFrom = async (who: string) => {
    await userEvent.click(within(await rowOf(who)).getByRole("button", { name: new RegExp(`^${strings["share.stop"]}|^${strings["share.stopAgain"]}`) }));
    await userEvent.click(await screen.findByRole("button", { name: strings["share.stopGo"] }));
    return screen.findByRole("alertdialog");
  };
  // The stop dialog's outcome slot (kit Dialog): where a stop that was not sent says why.
  const notSentSlot = (dlg: HTMLElement) => {
    const slot = dlg.querySelector<HTMLElement>("[data-dialog-outcome]");
    if (!slot) throw new Error("the stop dialog has no outcome slot");
    return slot;
  };
  const saveWho = async (name: string) => {
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: new RegExp(strings["share.editDetails"]) }));
    const d = await screen.findByRole("dialog");
    await saveIn(await typeWho(d, name));
    return d;
  };

  it("Stop while an edit of the share is on its way sends nothing and says why", async () => {
    sharedServer.reset([robin()]);
    let release = () => {};
    sharedServer.beforeWrite = () => new Promise<void>((r) => (release = r));
    await openShared();
    await saveWho("Sam");
    await waitFor(() => expect(sharedServer.sent.map((x) => x.kind)).toEqual(["update"]));
    // The drawer stays while the edit is out; Stop is pressed from the row behind it.
    await userEvent.keyboard("{Escape}");
    const dlg = await stopFrom("Robin");
    expect(await within(dlg).findByText(strings["out.refused.KEY_SENDING"])).toBeInTheDocument();
    // The reason is the dialog's own outcome line, announced at once (an alert), not a loose span in the body.
    expect(within(notSentSlot(dlg)).getByRole("alert")).toHaveTextContent(strings["out.refused.KEY_SENDING"]);
    expect(sharedServer.sent.map((x) => x.kind)).toEqual(["update"]);
    await act(async () => release());
  }, 40000);

  it("Stop while an edit of the share may have gone through sends nothing and says why", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "lost";
    await openShared();
    await saveWho("Sam");
    await within(await rowOf("Robin")).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    const dlg = await stopFrom("Robin");
    expect(await within(dlg).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(within(notSentSlot(dlg)).getByRole("alert")).toHaveTextContent(strings["out.refused.KEY_BUSY"]);
    expect(sharedServer.sent.map((x) => x.kind)).toEqual(["update"]);
  }, 40000);

  it("a held pause keeps Check again and Dismiss after the share stops conforming, also after a reload", async () => {
    sharedServer.reset([robin()]);
    sharedServer.setEnabled = "lost";
    const view = await openShared();
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: new RegExp(strings["share.pause"]) }));
    await within(await rowOf("Robin")).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 });
    // Changed elsewhere meanwhile: it now reads its vault, so this page no longer manages it.
    (sharedServer.rows[0] as { vault_access: boolean }).vault_access = true;
    await userEvent.click(screen.getByRole("button", { name: /^Refresh/ }));
    await waitFor(() => expect(sharedServer.rows[0]?.vault_access).toBe(true));
    const row = await rowOf("Robin");
    expect(within(row).getByRole("button", { name: strings["state.checkAgain"] })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: strings["dismiss.act"] })).toBeInTheDocument();
    view.unmount();
    resetAttempts();
    await openShared();
    expect(await within(await rowOf("Robin")).findByRole("button", { name: strings["state.checkAgain"] }, { timeout: 8000 })).toBeInTheDocument();
    expect(sharedServer.sent).toHaveLength(1);
  }, 40000);
});

describe("Shared tab: Edit details", () => {
  beforeEach(() => freshStart());
  const openEdit = async (who: string) => {
    await userEvent.click(within(await openMenu(who)).getByRole("menuitem", { name: new RegExp(strings["share.editDetails"]) }));
    return screen.findByRole("dialog");
  };

  it("Save sends the one field changed, and nothing else", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    await saveIn(await typeWho(d, "Sam"));
    await waitFor(() => expect(sharedServer.sent).toHaveLength(1));
    expect(sharedServer.sent[0]).toEqual({ kind: "update", id: robin().id, body: { alias: "hoody share efghijklmnop Sam" } });
    await waitFor(() => expect(toasts()).toContain(strings["share.editSaved"].replace("{{realm}}", "Personal")));
  }, 30000);

  it("each detail is a row showing the share as it is; nothing is editable until its Change…, and the footer sends nothing", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    expect(within(settingRow(d, "who")).getByText("Robin")).toBeInTheDocument();
    const end = String(robin().expires_at);
    expect(within(settingRow(d, "ends")).getByText(`${end.slice(0, 10)} ${end.slice(11, 16)} UTC`)).toBeInTheDocument();
    expect(within(settingRow(d, "ips")).getByText(strings["share.rvAny"])).toBeInTheDocument();
    expect(within(d).queryByRole("textbox")).toBeNull();
    // The footer has no Save: each row's editor carries its own.
    expect(within(d).queryByRole("button", { name: strings["share.editGo"] })).toBeNull();
    const row = await openSetting(d, "who");
    expect(within(row).getByLabelText(strings["share.who"])).toHaveValue("Robin");
    // Nothing changed yet: its Save is off and sends nothing.
    expect(isOff(within(row).getByRole("button", { name: strings["share.editGo"] }))).toBe(true);
    await saveIn(row);
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("two fields changed at once send nothing: one change at a time", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    const whoRow = await typeWho(d, "Sam");
    const ipsRow = await openSetting(d, "ips");
    await userEvent.type(within(ipsRow).getByRole("textbox", { name: new RegExp(strings["share.ips"]) }), "203.0.113.9");
    // Said as the footer's reason; both Saves are off.
    expect(within(d).getAllByText(strings["share.editOne"]).some((x) => x.closest("[data-drawer-reason]"))).toBe(true);
    for (const row of [whoRow, ipsRow]) {
      expect(isOff(within(row).getByRole("button", { name: strings["share.editGo"] }))).toBe(true);
      await saveIn(row);
    }
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("Cancel drops that row's draft: the other row's one change then sends alone", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    const ipsRow = await openSetting(d, "ips");
    await userEvent.type(within(ipsRow).getByRole("textbox", { name: new RegExp(strings["share.ips"]) }), "203.0.113.9");
    const whoRow = await typeWho(d, "Sam");
    await userEvent.click(within(ipsRow).getByRole("button", { name: /^Cancel$/ }));
    expect(within(settingRow(d, "ips")).queryByRole("textbox")).toBeNull();
    expect(within(d).queryByText(strings["share.editOne"])).toBeNull();
    await saveIn(whoRow);
    await waitFor(() => expect(sharedServer.sent).toHaveLength(1));
    expect(sharedServer.sent[0]).toEqual({ kind: "update", id: robin().id, body: { alias: "hoody share efghijklmnop Sam" } });
  }, 30000);

  it("the addresses row sends the address list alone", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    const row = await openSetting(d, "ips");
    await userEvent.type(within(row).getByRole("textbox", { name: new RegExp(strings["share.ips"]) }), "203.0.113.9");
    await saveIn(row);
    await waitFor(() => expect(sharedServer.sent).toHaveLength(1));
    expect(sharedServer.sent[0]).toEqual({ kind: "update", id: robin().id, body: { ip_whitelist: ["203.0.113.9"] } });
  }, 30000);

  it("a share changed elsewhere after the form opened sends nothing, says so and shows it as it is", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    // Another tab renamed it meanwhile.
    (sharedServer.rows[0] as { alias: string }).alias = "hoody share efghijklmnop Alex";
    await saveIn(await typeWho(d, "Sam"));
    expect(await within(d).findByText(strings["share.editChanged"])).toBeInTheDocument();
    expect(within(d).getByLabelText(strings["share.who"])).toHaveValue("Alex");
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("a share no longer conforming when Save is pressed sends nothing", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    (sharedServer.rows[0] as { vault_access: boolean }).vault_access = true;
    await saveIn(await typeWho(d, "Sam"));
    expect(await within(d).findByText(strings["share.editChanged"])).toBeInTheDocument();
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("an edit answered 404 says the share has ended", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "gone";
    await openShared();
    const d = await openEdit("Robin");
    await saveIn(await typeWho(d, "Sam"));
    expect(await within(d).findByText(strings["share.editEnded"])).toBeInTheDocument();
  }, 30000);

  it("a share gone from a complete list when Save is pressed sends nothing and says it has ended", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    sharedServer.rows = [];
    await saveIn(await typeWho(d, "Sam"));
    expect(await within(d).findByText(strings["share.editEnded"])).toBeInTheDocument();
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("a share missing from a cut list is not called ended, and nothing is sent", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    sharedServer.rows = [];
    sharedServer.truncated = true;
    await saveIn(await typeWho(d, "Sam"));
    expect(await within(d).findByText(/did not change/)).toBeInTheDocument();
    expect(within(d).queryByText(strings["share.editEnded"])).toBeNull();
    expect(sharedServer.sent).toEqual([]);
  }, 30000);

  it("a pause that turns held while Save's fresh read is out holds the edit back", async () => {
    const otherPause = defineMutation<{ id: string; on: boolean }>(routes.setEnabled, {
      name: "test-share-other-pause",
      lockKey: (v) => ({ id: v.id, on: v.on }),
      input: (v) => ({ params: { id: v.id }, body: { is_enabled: v.on } }),
      page: "account",
    });
    sharedServer.reset([robin()]);
    await openShared();
    const d = await openEdit("Robin");
    const row = await typeWho(d, "Sam");
    // Another page pauses the share while the read is out; the pause may have gone through, so it is held.
    sharedServer.setEnabled = "lost";
    sharedServer.beforeList = async () => void (await otherPause.run({ id: robin().id, on: false }));
    await saveIn(row);
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sharedServer.sent.map((x) => x.kind)).toEqual(["setEnabled"]);
  }, 30000);

  it("a cancelled sign-in code applies nothing and keeps the form as it was", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "otp";
    await openShared();
    const d = await openEdit("Robin");
    await saveIn(await typeWho(d, "Sam"));
    await waitFor(() => expect(otpState().open).toBe(true));
    act(() => cancelOtp());
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.editGo"] })).toBeEnabled());
    expect(within(d).getByLabelText(strings["share.who"])).toHaveValue("Sam");
    expect(sharedServer.rows[0]?.alias).toBe("hoody share efghijklmnop Robin");
    expect(sharedServer.sent).toHaveLength(1);
    expect(within(await rowOf("Robin")).queryByText(strings["state.unknown"])).toBeNull();
  }, 30000);

  it("an edit that may have gone through is proved only by a read showing it", async () => {
    sharedServer.reset([robin()]);
    sharedServer.update = "lost";
    await openShared();
    const d = await openEdit("Robin");
    await saveIn(await typeWho(d, "Sam"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(await within(await rowOf("Robin")).findByRole("button", { name: strings["state.checkAgain"] }));
    expect(await within(await rowOf("Robin")).findByText(strings["said.notYet"])).toBeInTheDocument();
    expect(toasts()).not.toContain(strings["share.editSaved"].replace("{{realm}}", "Personal"));
  }, 30000);
});

describe("Shared tab: Change what they can do", () => {
  beforeEach(() => {
    freshStart();
    createBodies.length = 0;
  });
  const words = (r: string) => strings[`share.r.${r}` as "share.r.computers.read"];

  it("a new share is made with the difference shown; the old one keeps its rights until the person stops it", async () => {
    sharedServer.reset([robin()]);
    await openShared();
    await userEvent.click(within(await openMenu("Robin")).getByRole("menuitem", { name: new RegExp(strings["share.changeRights"]) }));
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    // Opened as the old share is: start, stop and restart ticked, and who it is for.
    expect(await within(d).findByRole("checkbox", { name: words("computers.actions.restart") })).toBeChecked();
    expect(within(d).getByLabelText(strings["share.who"])).toHaveValue("Robin");
    await userEvent.click(within(d).getByRole("checkbox", { name: words("computers.actions.restart") }));
    await userEvent.click(within(d).getByRole("checkbox", { name: words("computers.actions.logs") }));
    const go = await within(d).findByRole("button", { name: strings["share.review"] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
    await userEvent.click(go);
    // Before Create: what changes, and that the old share keeps its rights.
    expect(within(d).getByText(strings["share.replaceKeeps"])).toBeInTheDocument();
    expect(within(d).getByText(strings["share.diffNew"].replace("{{list}}", words("computers.actions.logs")))).toBeInTheDocument();
    expect(within(d).getByText(strings["share.diffGone"].replace("{{list}}", words("computers.actions.restart")))).toBeInTheDocument();
    expect(within(d).getByText(strings["share.rvCantNew"])).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: strings["share.create"] }));
    await waitFor(() => expect(createBodies).toHaveLength(1), { timeout: 8000 });
    expect((createBodies[0] as { permissions: unknown }).permissions).toEqual({
      computers: { read: true, actions: { start: true, stop: true, logs: true } },
      projects: { read: true },
    });
    // After: the same sentence, and Stop the old share is the person's to press. Nothing was sent to the old share.
    expect(await within(d).findByText(strings["share.replaceKeeps"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(sharedServer.sent).toEqual([]);
    await userEvent.click(within(d).getByRole("button", { name: strings["share.stopOld"] }));
    expect(await screen.findByRole("button", { name: strings["share.stopGo"] })).toBeInTheDocument();
    expect(sharedServer.sent).toEqual([]);
    expect(toasts()).not.toContain(stoppedToast);
  }, 40000);
});

describe("A lost create's read-back", () => {
  it("a complete list still showing the share paused keeps it lost; only its absence or end makes it gone", () => {
    const id = robin().id as string;
    const lost = () => [{ alias: "hoody share efghijklmnop Robin", state: "lost" as const, id }];
    const paused = { ...robin(), is_enabled: false };
    const now = Date.now();
    const a = lost();
    settle(a, ["lost"], [paused], false, now);
    expect(a[0]?.state).toBe("lost");
    const b = lost();
    settle(b, ["lost"], [], false, now);
    expect(b[0]?.state).toBe("gone");
    const c = lost();
    settle(c, ["lost"], [{ ...paused, expires_at: new Date(now - 60000).toISOString() }], false, now);
    expect(c[0]?.state).toBe("gone");
    // A row with no end is listed, so it is not gone either.
    const d = lost();
    settle(d, ["lost"], [{ ...robin(), expires_at: null }], false, now);
    expect(d[0]?.state).toBe("lost");
  });
});
