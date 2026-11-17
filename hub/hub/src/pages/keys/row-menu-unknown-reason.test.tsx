// Vitest: the reason a key row's disabled menu items give. While a Pause is still being sent, the change is in flight:
// wait for it. Once its outcome is unknown (the send may have gone through), waiting does nothing: the row holds Check
// again, and the reason says to press it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import kitStrings from "@kit/strings.en.json";
import { renderPage, screen, waitFor, within } from "@app/testing";
import userEvent from "@testing-library/user-event";
import { resetChanges } from "@core/changes";
import page from "./page";
import strings from "./strings.en.json";

// The send's answer, per test (the rest of the data layer is the fixture world's), and every send made.
const answer = vi.hoisted(() => ({
  next: { outcome: "pending" } as Record<string, unknown>,
  sent: [] as { id: string; on: boolean }[],
  /** When set, the send's answer waits for it (a change still in flight). */
  gate: null as Promise<void> | null,
}));
vi.mock("./data", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSetEnabled: () => async (args: { id: string; on: boolean }) => {
    answer.sent.push(args);
    if (answer.gate) await answer.gate;
    return answer.next;
  },
}));

const NAME = "ci-deploy";
const fill = (s: string) => s.replace("{{name}}", NAME);
const row = () => screen.getByRole("row", { name: new RegExp(NAME) });

/** Selects the key's row and presses its Pause in the inspector. */
const pause = async () => {
  await renderPage(page);
  await waitFor(
    async () => {
      if (row().getAttribute("aria-selected") !== "true") await userEvent.click(row());
      expect(row()).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  await userEvent.click(await screen.findByRole("button", { name: strings["act.pause"] }));
  await waitFor(() => expect(answer.sent.length).toBe(1), { timeout: 10000 });
};

/** The text of the row's open action menu. */
const menuText = async () => {
  await userEvent.click(within(row()).getByRole("button", { name: kitStrings["table.rowActions"] }));
  return (await screen.findByRole("menu")).textContent ?? "";
};

describe("keys: a row's disabled menu items say why", () => {
  beforeEach(() => {
    resetChanges();
    answer.sent = [];
    answer.gate = null;
    answer.next = { outcome: "pending" };
  });

  it("an unknown outcome says to press Check again, not to wait", async () => {
    await pause();
    await waitFor(() => expect(within(row()).getByRole("button", { name: strings["state.checkAgain"] })).toBeInTheDocument(), { timeout: 10000 });
    const text = await menuText();
    expect(text).toContain(fill(strings["act.why.unknown"]));
    expect(text).not.toContain(fill(strings["act.why.busy"]));
  }, 30000);

  it("a change still being sent says to wait for it", async () => {
    let release = () => {};
    answer.gate = new Promise<void>((r) => {
      release = r;
    });
    answer.next = { outcome: "done" };
    await pause();
    const text = await menuText();
    expect(text).toContain(fill(strings["act.why.busy"]));
    expect(text).not.toContain(fill(strings["act.why.unknown"]));
    release();
  }, 30000);
});
