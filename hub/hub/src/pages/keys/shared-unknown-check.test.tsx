// Shared access: a stop this page sent whose answer did not arrive may have gone through. Its row offers a neutral
// Check again (it opens the Stop dialog as unconfirmed, whose Check again reads the list back), never a red "Stop it",
// which reads as a second stop. A lost share (no stop sent) keeps "Stop it".
import { beforeEach, describe, expect, it } from "vitest";
import { renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import overlayStrings from "@kit/overlays/strings.en.json";
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

describe("keys: a stop that may have gone through", () => {
  beforeEach(() => freshStart());

  it("offers a neutral Check again on its row, which opens the dialog as unconfirmed", async () => {
    await renderPage(page, { state: "sharedStopPending", path: "/keys/shared" });
    const stop = (await screen.findAllByRole("button", { name: strings["share.stop"] }, { timeout: 10000 }))[0]!;
    const row = stop.closest("tr") as HTMLElement;
    await userEvent.click(stop);
    await userEvent.click(await screen.findByRole("button", { name: strings["share.stopGo"] }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: overlayStrings["cancel"] }, { timeout: 10000 }));
    await waitFor(() => expect(within(row).queryByText(strings["share.stopUnknown"])).not.toBeNull(), { timeout: 10000 });
    expect(within(row).queryByRole("button", { name: strings["share.stopAgain"] })).toBeNull();
    const check = within(row).getByRole("button", { name: strings["share.checkStop"] });
    expect(check.className).not.toMatch(/danger/);
    await userEvent.click(check);
    const again = await screen.findByRole("alertdialog");
    expect(within(again).getByRole("button", { name: /Check again/ })).toBeInTheDocument();
  }, 30000);
});
