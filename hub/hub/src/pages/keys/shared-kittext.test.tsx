// The Shared tab's text sits in kit places. A refused stop is the stop dialog's failed outcome line, still
// announced as an alert; a list cut short is a table band. (The row notes stay as they were: a nowrap pill overflowed
// the phone action cell.)
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderPage, screen, userEvent, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, managedShare, sharedServer } from "./fixtures";
import { resetLedgers } from "./share-logic";
import page from "./page";
import strings from "./strings.en.json";

function freshStart(): void {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetLedgers();
}

const robin = () => managedShare(4, 70, { alias: "hoody share efghijklmnop Robin" });
const rowOf = (who: string) => screen.findByRole("row", { name: new RegExp(who) }, { timeout: 10000 });
const openShared = async () => {
  await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
  act(() => setRealm(REALM_A));
};

describe("keys: Shared tab text in kit places", () => {
  beforeEach(() => freshStart());

  it("a refused stop says so in the dialog's outcome line, as an alert", async () => {
    sharedServer.reset([robin()]);
    sharedServer.remove = "gone";
    await openShared();
    await userEvent.click(within(await rowOf("Robin")).getByRole("button", { name: strings["share.stop"] }));
    await userEvent.click(await screen.findByRole("button", { name: strings["share.stopGo"] }));
    const dialog = await screen.findByRole("alertdialog");
    const alert = await within(dialog).findByRole("alert", {}, { timeout: 10000 });
    expect(alert).toHaveTextContent(strings["share.stopFailed"]);
    expect(alert).toHaveAttribute("data-outcome", "failed");
    // One line for the refusal: the text is not also left in the body.
    expect(within(dialog).getAllByText(strings["share.stopFailed"])).toHaveLength(1);
  }, 30000);

  it("a list cut short says so in a table band", async () => {
    sharedServer.reset([robin()]);
    sharedServer.truncated = true;
    await openShared();
    const said = await screen.findByText(strings["share.truncated"], {}, { timeout: 10000 });
    expect(said.closest("[role='status']")).not.toBeNull();
  }, 30000);
});
