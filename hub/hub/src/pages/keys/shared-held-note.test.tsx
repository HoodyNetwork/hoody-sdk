// Shared access on the web: once a stop of a share this page cannot manage may have gone through, its row says only
// that it couldn't confirm the stop; the not-managed note (the web draws its long form, share.notManaged; the terminal
// its short one) is not stacked above it. The same rule as shared-held-note.term.test.tsx.
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

describe("keys: a held stop of a share this page cannot manage", () => {
  beforeEach(() => freshStart());

  it("the row shows the couldn't-confirm note and not the not-managed one", async () => {
    await renderPage(page, { state: "sharedStopPending", path: "/keys/shared" });
    // The unmanaged share: its row carries the not-managed note before anything is sent.
    const note = (await screen.findAllByText(strings["share.notManaged"], {}, { timeout: 10000 }))[0]!;
    const row = note.closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: strings["share.stop"] }));
    await userEvent.click(await screen.findByRole("button", { name: strings["share.stopGo"] }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: overlayStrings["cancel"] }, { timeout: 10000 }));
    await waitFor(() => expect(within(row).queryByText(strings["share.stopUnknown"])).not.toBeNull(), { timeout: 10000 });
    expect(within(row).queryByText(strings["share.notManagedShort"])).toBeNull();
    expect(within(row).queryByText(strings["share.notManaged"])).toBeNull();
  }, 30000);
});
