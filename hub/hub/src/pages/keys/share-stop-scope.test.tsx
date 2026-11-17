// The Stop sharing confirm names what Confirm stops: the share's current row, not the scope it had when the dialog
// opened. A share another page widens to more realms while the dialog is open reads as stopped everywhere.
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, REALM_B, managedShare, sharedServer } from "./fixtures";
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

const robin = (realm_ids: string[]) => managedShare(4, 70, { alias: "hoody share efghijklmnop Robin", realm_ids });

describe("keys: the Stop confirm follows the share's current scope", () => {
  beforeEach(() => freshStart());

  it("a share widened to more realms while the dialog is open gets the wide title and body", async () => {
    sharedServer.reset([robin([REALM_A])]);
    const view = await renderPage(page, { state: "sharedServer", path: "/keys/shared" });
    act(() => setRealm(REALM_A));
    const row = await screen.findByRole("row", { name: /Robin/ }, { timeout: 10000 });
    await userEvent.click(within(row).getByRole("button", { name: strings["share.stop"] }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(strings["share.stopConfirm"])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings["share.stopTitleWide"])).toBeNull();

    // Another page widens the share to a second realm; the list reads it again while the dialog stays open.
    sharedServer.rows = [robin([REALM_A, REALM_B])];
    await act(async () => {
      await view.queryClient.invalidateQueries();
    });
    await waitFor(() => expect(within(dialog).getByText(strings["share.stopConfirmWide"])).toBeInTheDocument(), { timeout: 10000 });
    expect(within(dialog).getByText(strings["share.stopTitleWide"])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings["share.stopConfirm"])).toBeNull();
  }, 30000);
});
