// A failed Pause or Resume's Try again judges the share as the list reads
// when it is pressed. A share a refetch shows the Shared tab no longer manages is not paused or resumed from the
// Keys tab, even by a Try again offered before; one still managed is (the control).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeToast, showToast } from "@kit";
import { act, renderPage, screen, userEvent, waitFor } from "@app/testing";
import { setRealm } from "@core/ctx";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { REALM_A, managedShare, sharedServer } from "./fixtures";
import { resetLedgers } from "./share-logic";
import page from "./page";
import strings from "./strings.en.json";

vi.mock("@kit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn(), closeToast: vi.fn() }));

// The send's answer, per test (the rest of the data layer is the sharedServer world's), and every send made.
const answer = vi.hoisted(() => ({
  next: { outcome: "failed", code: "SERVER_ERROR" } as Record<string, unknown>,
  sent: [] as { id: string; on: boolean }[],
}));
vi.mock("./data", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSetEnabled: () => async (args: { id: string; on: boolean }) => {
    answer.sent.push(args);
    return answer.next;
  },
}));

function freshStart(): void {
  const kept = readChanges();
  if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
  resetAttempts();
  resetChanges();
  resetLedgers();
  vi.mocked(showToast).mockClear();
  vi.mocked(closeToast).mockClear();
  answer.next = { outcome: "failed", code: "SERVER_ERROR" };
  answer.sent = [];
}

const SAM = /ghijklmnopqr/;
const tryAgain = () =>
  vi.mocked(showToast).mock.calls.map((c) => c[0]).find((x) => x.action?.label === strings["action.tryAgain"]);

/** Selects Sam's row, presses the toggle (want: its label), and waits for the failed send's Try again. The list opens
 *  on State: Active, so a paused share (Resume) is reached through State: Paused in the address. */
async function failedPress(label: string) {
  const view = await renderPage(page, { state: "sharedServer", ...(label === strings["act.resume"] ? { path: "/keys?state=paused" } : {}) });
  act(() => setRealm(REALM_A));
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name: SAM });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name: SAM })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  await userEvent.click(await screen.findByRole("button", { name: label }));
  await waitFor(() => expect(tryAgain()).toBeDefined(), { timeout: 10000 });
  expect(answer.sent).toHaveLength(1);
  return view;
}

/** Another tab gives the share vault access (the Shared tab no longer manages it); the page reads the list again. */
async function unmanageAndRefetch(view: Awaited<ReturnType<typeof renderPage>>, label: string) {
  sharedServer.rows[0] = { ...sharedServer.rows[0]!, vault_access: true };
  await act(() => view.queryClient.invalidateQueries());
  // The page shows the fresh read: the share's toggle is gone.
  await waitFor(() => expect(screen.queryByRole("button", { name: label })).toBeNull(), { timeout: 10000 });
}

describe("Keys tab: Try again after a refetch made the share unmanaged", () => {
  beforeEach(() => freshStart());

  it("a failed Pause's Try again sends nothing once the share reads unmanaged", async () => {
    sharedServer.reset([managedShare(6, 30, { alias: "hoody share ghijklmnopqr Sam" })]);
    const view = await failedPress(strings["act.pause"]);
    await unmanageAndRefetch(view, strings["act.pause"]);
    answer.next = { outcome: "done" };
    await act(async () => void (await tryAgain()!.action!.onAction()));
    expect(answer.sent).toHaveLength(1);
  }, 40000);

  it("a failed Resume's Try again sends nothing once the share reads unmanaged", async () => {
    sharedServer.reset([managedShare(6, 30, { alias: "hoody share ghijklmnopqr Sam", is_enabled: false })]);
    const view = await failedPress(strings["act.resume"]);
    await unmanageAndRefetch(view, strings["act.resume"]);
    answer.next = { outcome: "done" };
    await act(async () => void (await tryAgain()!.action!.onAction()));
    expect(answer.sent).toHaveLength(1);
  }, 40000);

  it("a share still managed is sent again by its Try again (the control)", async () => {
    sharedServer.reset([managedShare(6, 30, { alias: "hoody share ghijklmnopqr Sam" })]);
    const view = await failedPress(strings["act.pause"]);
    await act(() => view.queryClient.invalidateQueries());
    answer.next = { outcome: "done" };
    await act(async () => void (await tryAgain()!.action!.onAction()));
    expect(answer.sent).toEqual([answer.sent[0], answer.sent[0]]);
  }, 40000);
});
