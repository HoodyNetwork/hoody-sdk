// Edit a key, in the page: one send per Save with only what changed; an
// outcome that may have gone through is held on the row (Check again reads the key back, a warned Dismiss frees it);
// no Edit on shares or the agent's own keys; Edit and Pause are never offered at once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, isOff, renderPage, screen, waitFor, within } from "@app/testing";
import userEvent from "@testing-library/user-event";
import { heldChanges } from "@core";
import { resetChanges } from "@core/changes";
import { cancelOtp, otpState } from "@core/otp";
import { createBodies, editBodies, editRead, keys as rows, myIpGate, sent, slowGate } from "./fixtures";
// Another tab's sends, as core sees them (the runners the hooks hand out; plain functions).
import { useEditKey as editRunner, useSetEnabled as pauseRunner } from "./data";
import { KeyFields } from "./parts/KeyFields";
import { render } from "@testing-library/react";
import { catalogue, newForm, toBody } from "./logic";
import { templates } from "./fixtures";
import page from "./page";
import strings from "./strings.en.json";
import ipStrings from "@kit/forms/IpAllowlistField.strings.en.json";
import type { RawToken } from "./types";

vi.mock("@kit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

const toasts = () => vi.mocked(showToast).mock.calls.map((c) => c[0].title);
/** What the row says its last Check found: the warn on the row and its full words, read out. */
const rowSaid = (row: HTMLElement) => ({
  short: within(row).queryByText(/^(May still go through|Couldn't read it|Can't be checked|Changed meanwhile)$/)?.textContent ?? null,
  full: within(row).queryByRole("status")?.textContent ?? null,
});
const openRow = async (name: RegExp) => {
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
};
const openEdit = async (state = "default", name = /ci-deploy/) => {
  await renderPage(page, { state });
  await openRow(name);
  await userEvent.click(await screen.findByRole("button", { name: strings["act.edit"] }));
  return screen.findByRole("dialog", { name: /^Edit / });
};
const save = (d: HTMLElement) => within(d).getByRole("button", { name: strings["ed.go"] });
const rename = async (d: HTMLElement, to: string) => {
  const f = within(d).getByLabelText(strings["nk.name"]);
  await userEvent.clear(f);
  await userEvent.type(f, to);
};

describe("keys: Edit", () => {
  beforeEach(() => {
    resetChanges();
    sent.edit = 0;
    sent.setEnabled = 0;
    sent.remove = 0;
    editBodies.length = 0;
    createBodies.length = 0;
    editRead.row = null;
    slowGate.reset();
    vi.mocked(showToast).mockClear();
  });
  // A held answer never outlives its test, even a failed one.
  afterEach(() => slowGate.reset());

  it("New key still sends today's body (the fields moved to KeyFields)", async () => {
    await renderPage(page, { realm: "all" });
    await userEvent.click(await screen.findByRole("button", { name: strings["action.new"] }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText(strings["nk.name"]), "bytes-check");
    await userEvent.click(within(d).getByRole("button", { name: strings["nk.go"] }));
    await waitFor(() => expect(createBodies.length).toBe(1), { timeout: 8000 });
    const want = toBody({ ...newForm(undefined), name: "bytes-check" }, catalogue(templates), Date.now());
    expect(JSON.stringify(createBodies[0])).toBe(JSON.stringify(want.body));
  }, 30000);

  it("Edit is offered for an ordinary key, never for the agent's own keys or a share", async () => {
    await renderPage(page, { state: "sharedNamed" });
    await openRow(/ci-deploy/);
    expect(isOff(await screen.findByRole("button", { name: strings["act.edit"] }))).toBe(false);
    await openRow(/hoody-agent auto/);
    await screen.findByRole("heading", { name: /hoody-agent auto/ });
    expect(screen.queryByRole("button", { name: strings["act.edit"] })).toBeNull();
    await openRow(/hoody share defghijklmno Alex/);
    await screen.findByRole("heading", { name: /hoody share/ });
    expect(screen.queryByRole("button", { name: strings["act.edit"] })).toBeNull();
  }, 40000);

  it("opened as the key is, Save stays off and nothing is sent until something changes", async () => {
    const d = await openEdit();
    expect(within(d).getByLabelText(strings["nk.name"])).toHaveValue("ci-deploy");
    expect(within(d).getByText(strings["ed.none"])).toBeInTheDocument();
    expect(isOff(save(d))).toBe(true);
    await userEvent.click(save(d));
    expect(sent.edit).toBe(0);
  }, 30000);

  it("a new name is one send of {alias}, with no 2FA line; done closes the drawer", async () => {
    const d = await openEdit();
    await rename(d, "ci-deploy-2");
    expect(within(d).getByText("1 change")).toBeInTheDocument();
    expect(within(d).queryByText(strings["ed.guard"])).toBeNull();
    await userEvent.click(save(d));
    await waitFor(() => expect(sent.edit).toBe(1));
    expect(editBodies[0]).toEqual({ alias: "ci-deploy-2" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit / })).toBeNull());
    expect(toasts()).toContain("Changes to ci-deploy-2 are saved.");
  }, 30000);

  it("a guarded change says the 2FA code may be asked; Never sends null", async () => {
    const d = await openEdit();
    await userEvent.click(within(d).getByRole("radio", { name: strings["nk.endsNever"] }));
    // The line is the footer's reason, beside Save, not a note in the form body.
    expect(within(d).getByText(strings["ed.guard"]).closest("[data-drawer-reason]")).not.toBeNull();
    await userEvent.click(save(d));
    await waitFor(() => expect(sent.edit).toBe(1));
    expect(editBodies[0]).toEqual({ expires_at: null });
  }, 30000);

  it("a realm-limited key cannot be switched to all realms", async () => {
    const d = await openEdit();
    expect(isOff(within(d).getByRole("radio", { name: new RegExp(strings["nk.all"]) }))).toBe(true);
    expect(within(d).getByText(strings["ed.allLimited"])).toBeInTheDocument();
  }, 30000);

  it("a taken name marks the field and keeps the drawer open", async () => {
    const d = await openEdit("editDup");
    await rename(d, "sdk-readonly");
    await userEvent.click(save(d));
    expect(await within(d).findByText(strings["out.err.DUPLICATE_ALIAS"])).toBeInTheDocument();
    expect(sent.edit).toBe(1);
  }, 30000);

  it("another refusal keeps the drawer open with its reason", async () => {
    const d = await openEdit("editRefused");
    await rename(d, "other-name");
    await userEvent.click(save(d));
    expect(await within(d).findByText("ci-deploy did not change. Try again.")).toBeInTheDocument();
    expect(sent.edit).toBe(1);
  }, 30000);

  it("a cancelled 2FA prompt sends nothing more and keeps the form as it was", async () => {
    const d = await openEdit("editOtp");
    await userEvent.click(within(d).getByRole("radio", { name: strings["nk.endsNever"] }));
    await userEvent.click(save(d));
    await waitFor(() => expect(otpState().open).toBe(true));
    act(() => cancelOtp());
    await waitFor(() => expect(isOff(save(d))).toBe(false));
    expect(sent.edit).toBe(1);
    expect(within(d).queryByText(strings["out.refused.other"])).toBeNull();
    expect(within(d).queryByText("ci-deploy did not change. Try again.")).toBeNull();
    expect(screen.getByRole("dialog", { name: /^Edit / })).toBeInTheDocument();
  }, 30000);

  it("an edit that may have gone through is held on the row; only a read showing it frees it", async () => {
    const d = await openEdit("editHeld");
    await rename(d, "ci-renamed");
    await userEvent.click(save(d));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit / })).toBeNull());
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    expect(await within(row()).findByText(strings["state.unknown"])).toBeInTheDocument();
    // Edit, Pause and Delete (the danger group's) are all off while it is held; nothing was sent twice.
    expect(isOff(screen.getByRole("button", { name: strings["act.edit"] }))).toBe(true);
    expect(isOff(screen.getByRole("button", { name: strings["act.pause"] }))).toBe(true);
    expect(isOff(screen.getByRole("button", { name: strings["act.delete"] }))).toBe(true);
    // A failed read proves nothing.
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    // Said on the row, never as a toast; Check again and Dismiss stay.
    await waitFor(() =>
      expect(rowSaid(row())).toEqual({ short: strings["said.readFailed"], full: "ci-deploy could not be read. Check again in a moment." }),
    );
    expect(within(row()).getByRole("button", { name: strings["state.checkAgain"] })).toBeInTheDocument();
    // A read still showing the old name proves nothing either: the row says it may still go through (a warn).
    editRead.row = { ...(rows[0] as RawToken) };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(rowSaid(row()).short).toBe(strings["said.notYet"]));
    expect(rowSaid(row()).full).toMatch(/^ci-deploy does not show these changes yet/);
    // The inspector's banner says the same.
    const insp = screen.getByRole("region", { name: "Details" });
    expect(within(insp).getByText(/^ci-deploy does not show these changes yet/)).toBeInTheDocument();
    // A read showing it frees it: the row shows the key in place, with no toast.
    editRead.row = { ...(rows[0] as RawToken), alias: "ci-renamed" };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(within(row()).queryByRole("button", { name: strings["state.checkAgain"] })).toBeNull());
    expect(rowSaid(row())).toEqual({ short: null, full: null });
    // The row can clear (core freed the hold on its read) before the Check itself has ended: let it end first.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(toasts()).toEqual([]);
    expect(sent.edit).toBe(1);
  }, 40000);

  it("KE-INSP: the inspector opens on a verdict, keeps Edit as its one primary in the header, and Delete in the danger group", async () => {
    await renderPage(page);
    await openRow(/ci-deploy/);
    const insp = await screen.findByRole("region", { name: "Details" });
    const plate = within(insp).getByRole("group", { name: strings["insp.verdict"] });
    expect(within(plate).getByText(strings["insp.now.active"])).toBeInTheDocument();
    const header = within(insp).getByRole("button", { name: strings["act.edit"] }).closest("header") as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByRole("button", { name: strings["act.pause"] })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: strings["act.copy"] })).toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: strings["act.delete"] })).toBeNull();
    expect(within(insp).getByRole("button", { name: strings["act.edit"] })).toHaveAttribute("data-variant", "primary");
    expect(within(insp).getAllByRole("button").filter((b) => b.getAttribute("data-variant") === "primary")).toHaveLength(1);
    expect(within(insp).getByText(strings["insp.deleteLabel"])).toBeInTheDocument();
  }, 40000);

  it("a held edit outlives the page: opened again, the row is held and Check again reads back the body sent", async () => {
    const view = await renderPage(page, { state: "editHeld" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.edit"] }));
    const d = await screen.findByRole("dialog", { name: /^Edit / });
    await rename(d, "ci-renamed");
    await userEvent.click(save(d));
    await within(screen.getByRole("row", { name: /ci-deploy/ })).findByText(strings["state.unknown"]);
    view.unmount();
    await renderPage(page, { state: "editHeld" });
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    expect(await within(await screen.findByRole("row", { name: /ci-deploy/ }, { timeout: 8000 })).findByText(strings["state.unknown"])).toBeInTheDocument();
    editRead.row = { ...(rows[0] as RawToken), alias: "ci-renamed" };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(within(row()).queryByRole("button", { name: strings["state.checkAgain"] })).toBeNull());
    expect(heldChanges("keys.key_edit")).toEqual([]);
    expect(sent.edit).toBe(1);
  }, 40000);

  it("the inspector's Dismiss of a held edit warns the same way", async () => {
    const d = await openEdit("editHeld");
    await rename(d, "ci-renamed");
    await userEvent.click(save(d));
    const insp = await screen.findByRole("region", { name: "Details" });
    expect(await within(insp).findByText(strings["insp.unknownTitle"])).toBeInTheDocument();
    await userEvent.click(within(insp).getByRole("button", { name: strings["dismiss.act"] }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(strings["dismiss.bodyEdit"])).toBeInTheDocument();
  }, 40000);

  it("the warned Dismiss of a held edit says it may still have changed, and frees it", async () => {
    const d = await openEdit("editHeld");
    await rename(d, "ci-renamed");
    await userEvent.click(save(d));
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    await within(row()).findByText(strings["state.unknown"]);
    await userEvent.click(within(row()).getByRole("button", { name: strings["dismiss.act"] }));
    const ask = await screen.findByRole("alertdialog");
    expect(within(ask).getByText(strings["dismiss.bodyEdit"])).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole("button", { name: strings["dismiss.go"] }));
    await waitFor(() => expect(within(row()).queryByText(strings["state.unknown"])).toBeNull());
    // Freed in core too (a reload or another tab no longer holds it), not only on the row.
    expect(heldChanges("keys.key_edit")).toEqual([]);
    expect(isOff(screen.getByRole("button", { name: strings["act.edit"] }))).toBe(false);
    expect(sent.edit).toBe(1);
  }, 40000);

  // A held or refused send, and what the row says after it.
  const ci = rows[0] as RawToken;

  it("an open drawer whose Save finds another tab's edit held sends nothing, says so, and the row checks that edit's body, never this one", async () => {
    const d = await openEdit("editHeld");
    // Another tab renames the key; its answer is lost.
    await act(async () => void (await editRunner()({ id: ci.id, body: { alias: "from-a" } })));
    expect(sent.edit).toBe(1);
    await userEvent.click(within(d).getByRole("radio", { name: strings["nk.endsNever"] }));
    await userEvent.click(save(d));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: /^cancel$/i }));
    await userEvent.click(await within(d).findByRole("button", { name: /^discard$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit / })).toBeNull());
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    await within(row()).findByText(strings["state.unknown"]);
    // A read showing this drawer's unsent change (no end) but not the other tab's name proves nothing.
    editRead.row = { ...ci, expires_at: null };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(rowSaid(row()).short).toBe(strings["said.notYet"]));
    expect(rowSaid(row()).full).toMatch(/^ci-deploy does not show these changes yet/);
    editRead.row = { ...ci, alias: "from-a" };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() => expect(within(row()).queryByRole("button", { name: strings["state.checkAgain"] })).toBeNull());
    expect(heldChanges("keys.key_edit")).toEqual([]);
    expect(sent.edit).toBe(1);
  }, 40000);

  it("an open drawer's Save sends nothing while a pause of the key is held (another tab)", async () => {
    const d = await openEdit("pauseHeld");
    await act(async () => void (await pauseRunner()({ id: ci.id, on: false })));
    expect(sent.setEnabled).toBe(1);
    await rename(d, "ci-x");
    await userEvent.click(save(d));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  it("a delete confirmed while an edit of the key is held (another tab) sends nothing", async () => {
    await renderPage(page, { state: "editHeld" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    const dlg = await screen.findByRole("alertdialog");
    await act(async () => void (await editRunner()({ id: ci.id, body: { alias: "from-a" } })));
    await userEvent.click(within(dlg).getByRole("button", { name: strings["del.go"] }));
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_BUSY"]));
    expect(sent.remove ?? 0).toBe(0);
  }, 30000);

  it("while Save is on its way, the rights and every field are locked", async () => {
    const d = await openEdit("editSlow");
    await rename(d, "ci-slow");
    // The edit's answer waits for the test, not a 1.5 s timer a loaded run can outlast.
    slowGate.hold();
    await userEvent.click(save(d));
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    const box = within(d).getByRole("checkbox", { name: /Delete computers/ });
    await waitFor(() => expect(isOff(box)).toBe(true));
    expect(isOff(within(d).getByLabelText(strings["nk.name"]))).toBe(true);
    act(() => slowGate.release());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit / })).toBeNull(), { timeout: 8000 });
    expect(editBodies).toEqual([{ alias: "ci-slow" }]);
  }, 30000);

  it("the key's realms show as ticked when the realm list is not available", () => {
    const form = { ...newForm(undefined), worksIn: "pick" as const, picked: ["a".repeat(24)] };
    render(<KeyFields form={form} set={() => {}} errors={{}} cat={null} realms={undefined} realm="all" sending={false} edit={{ limited: true }} />);
    expect(screen.getByRole("checkbox", { checked: true })).toBeInTheDocument();
    expect(screen.queryByText(strings["nk.noRealms"])).toBeNull();
  });

  it("a held edit whose hold records no body is never proven by a read; only the warned Dismiss ends it", async () => {
    await renderPage(page, { state: "editHeld" });
    await openRow(/ci-deploy/);
    // A hold from an older page records the key alone.
    await act(async () => void (await editRunner()({ id: ci.id, body: undefined as unknown as Record<string, never> })));
    const row = () => screen.getByRole("row", { name: /ci-deploy/ });
    await within(row()).findByText(strings["state.unknown"]);
    editRead.row = { ...ci };
    await userEvent.click(within(row()).getByRole("button", { name: strings["state.checkAgain"] }));
    await waitFor(() =>
      expect(rowSaid(row())).toEqual({ short: strings["said.noBody"], full: strings["op.editNoBody"].replace("{{name}}", "ci-deploy") }),
    );
    expect(toasts()).not.toContain(strings["op.editNoBody"].replace("{{name}}", "ci-deploy"));
    expect(within(row()).getByRole("button", { name: strings["dismiss.act"] })).toBeInTheDocument();
  }, 30000);

  it("Add my IP is off while Save is on its way, and a lookup started before Save changes nothing", async () => {
    myIpGate.reset();
    const { queryClient } = await renderPage(page, { state: "editSlowHeldIp" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.edit"] }));
    const d = await screen.findByRole("dialog", { name: /^Edit / });
    await rename(d, "ci-ip");
    const myIp = within(d).getByRole("button", { name: ipStrings["ipf.add"] });
    await userEvent.click(myIp);
    const ips = within(d).getByLabelText(strings["nk.ips"]);
    const before = (ips as HTMLInputElement).value;
    slowGate.hold();
    await userEvent.click(save(d));
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    await waitFor(() => expect(isOff(myIp)).toBe(true));
    // The lookup is out (waiting at its gate) when it is let go, and has landed before the checks.
    expect(myIpGate.waiting.length).toBe(1);
    act(() => myIpGate.release());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    // Save is still on its way (held): the lookup landed while it was, and changed nothing.
    expect(isOff(myIp)).toBe(true);
    expect((ips as HTMLInputElement).value).toBe(before);
    expect(within(d).queryByText(ipStrings["ipf.added"])).toBeNull();
    expect(within(d).queryByText(ipStrings["ipf.have"])).toBeNull();
    act(() => slowGate.release());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit / })).toBeNull(), { timeout: 8000 });
    expect(editBodies).toEqual([{ alias: "ci-ip" }]);
    myIpGate.reset();
  }, 30000);

  it("Add realm is off while Save is on its way", () => {
    const form = { ...newForm(undefined), worksIn: "pick" as const, picked: ["a".repeat(24)] };
    render(<KeyFields form={form} set={() => {}} errors={{}} cat={null} realms={undefined} realm="all" sending edit={{ limited: true }} />);
    expect(isOff(screen.getByRole("button", { name: strings["nk.addGo"] }))).toBe(true);
  });

  it("an open drawer's Save sends nothing while a pause is on its way, before any answer (another tab)", async () => {
    const d = await openEdit("pauseSlow");
    await rename(d, "ci-x");
    slowGate.hold();
    let pause: Promise<unknown> = Promise.resolve();
    act(() => {
      pause = pauseRunner()({ id: ci.id, on: false });
    });
    await waitFor(() => expect(sent.setEnabled).toBe(1));
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    await userEvent.click(save(d));
    expect(await within(d).findByText(strings["out.refused.KEY_SENDING"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
    act(() => slowGate.release());
    await act(async () => void (await pause));
  }, 30000);

  it("a delete confirmed while an edit is on its way, before any answer (another tab), sends nothing", async () => {
    await renderPage(page, { state: "editSlow" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    const dlg = await screen.findByRole("alertdialog");
    slowGate.hold();
    let edit: Promise<unknown> = Promise.resolve();
    act(() => {
      edit = editRunner()({ id: ci.id, body: { alias: "from-a" } });
    });
    await waitFor(() => expect(sent.edit).toBe(1));
    await waitFor(() => expect(slowGate.arrived).toBe(1));
    await userEvent.click(within(dlg).getByRole("button", { name: strings["del.go"] }));
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_SENDING"]));
    expect(sent.remove ?? 0).toBe(0);
    act(() => slowGate.release());
    await act(async () => void (await edit));
  }, 30000);

  it("an Add my IP result asked before a Save that was refused does not land in the form after it", async () => {
    myIpGate.reset();
    const d = await openEdit("editDupHeldIp");
    await rename(d, "ci-taken");
    await userEvent.click(within(d).getByRole("button", { name: ipStrings["ipf.add"] }));
    const ips = within(d).getByLabelText(strings["nk.ips"]) as HTMLInputElement;
    const before = ips.value;
    await userEvent.click(save(d));
    await waitFor(() => expect(editBodies.length).toBe(1));
    await waitFor(() => expect(isOff(within(d).getByLabelText(strings["nk.name"]))).toBe(false));
    act(() => myIpGate.release());
    await new Promise((r) => setTimeout(r, 300));
    expect(ips.value).toBe(before);
    expect(within(d).queryByText(ipStrings["ipf.added"])).toBeNull();
    expect(within(d).queryByText(ipStrings["ipf.have"])).toBeNull();
    myIpGate.reset();
  }, 30000);
});
