// Vitest: the toast after Pause, per outcome of the send. Done shows no
// toast: the row's pill shows the new state in place. A failure (an answered refusal included) is an error carrying
// Try again, the person's new press (a new send of the same pause, never a replay); nothing sent (not_sent) or an
// answer against an older view (stale) is information, as kit ERROR_TONE maps them. Pending and cancelled show no
// toast (the row holds it / nothing was sent). After Keys is gone, done says so quietly: the answer
// has no place on screen then.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeToast, showToast } from "@kit";
import { renderPage, screen, waitFor } from "@app/testing";
import userEvent from "@testing-library/user-event";
import { resetChanges } from "@core/changes";
import page from "./page";
import strings from "./strings.en.json";

vi.mock("@kit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn(), closeToast: vi.fn() }));
// The send's answer, per test (the rest of the data layer is the fixture world's), and every send made.
const answer = vi.hoisted(() => ({
  next: { outcome: "done" } as Record<string, unknown>,
  sent: [] as { id: string; on: boolean }[],
  /** When set, the send's answer waits for it (an answer that arrives later). */
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

const shown = () => vi.mocked(showToast).mock.calls.map((c) => c[0]);
/** Selects the key's row and presses its Pause (or, for a paused key, Resume). The list opens on State: Active, so a
 *  paused key is reached through State: Paused in the address. */
const pressToggle = async (name: RegExp, act: "act.pause" | "act.resume") => {
  const view = await renderPage(page, act === "act.resume" ? { path: "/keys?state=paused" } : {});
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  await userEvent.click(await screen.findByRole("button", { name: strings[act] }));
  await waitFor(() => expect(answer.sent.length).toBe(1), { timeout: 10000 });
  return view;
};
const pauseFirstKey = () => pressToggle(/ci-deploy/, "act.pause");

describe("keys: the toast after Pause, per outcome", () => {
  beforeEach(() => {
    resetChanges();
    vi.mocked(showToast).mockClear();
    vi.mocked(closeToast).mockClear();
    answer.sent = [];
    answer.gate = null;
  });

  it.each([
    ["nothing sent", "info", { outcome: "not_sent", code: "OFFLINE" }],
    ["an answer against an older view", "info", { outcome: "stale" }],
  ])("%s gives one %s toast", async (_name, tone, out) => {
    answer.next = out;
    await pauseFirstKey();
    await waitFor(() => expect(shown()).toEqual([expect.objectContaining({ tone })]), { timeout: 10000 });
    expect(shown()[0]).not.toHaveProperty("action");
  });

  it("done shows no toast: the row's state changes in place", async () => {
    answer.next = { outcome: "done" };
    await pauseFirstKey();
    // The row leaves its sending state (the send is answered) and nothing is toasted.
    await waitFor(() => expect(screen.queryByText(strings["state.pausing"])).toBeNull(), { timeout: 10000 });
    expect(shown()).toEqual([]);
  });

  it("a failure gives one error toast whose Try again is a new send of the same pause", async () => {
    answer.next = { outcome: "failed", code: "SERVER_ERROR" };
    await pauseFirstKey();
    await waitFor(() => expect(shown()).toHaveLength(1), { timeout: 10000 });
    const toast = shown()[0]!;
    expect(toast).toMatchObject({ tone: "error", action: { label: strings["action.tryAgain"] } });
    // Nothing is sent again by itself: only the person's press of Try again sends, and once per press.
    expect(answer.sent).toHaveLength(1);
    answer.next = { outcome: "done" };
    await toast.action!.onAction();
    expect(answer.sent).toHaveLength(2);
    expect(answer.sent[1]).toEqual(answer.sent[0]);
    expect(answer.sent[1]!.on).toBe(false);
  });

  it("Try again goes with the tab: leaving Keys closes it, so nothing is sent from where its outcome has no place", async () => {
    answer.next = { outcome: "failed", code: "SERVER_ERROR" };
    vi.mocked(showToast).mockReturnValue("retry-1");
    const view = await pauseFirstKey();
    await waitFor(() => expect(shown()).toHaveLength(1), { timeout: 10000 });
    expect(closeToast).not.toHaveBeenCalledWith("retry-1");
    const retry = shown()[0]!.action!;
    view.unmount();
    expect(closeToast).toHaveBeenCalledWith("retry-1");
    // A press that still reached it (closing raced the press) sends nothing either.
    await retry.onAction();
    expect(answer.sent).toHaveLength(1);
    vi.mocked(showToast).mockReset();
  });

  it.each([
    ["a definite failure", { outcome: "failed", code: "SERVER_ERROR" }, "error", strings["op.openKeys"]],
    ["an answer that may have gone through", { outcome: "pending" }, "unknown", strings["op.checkOnKeys"]],
  ])("%s that arrives after leaving Keys offers no Try again, only Keys to look", async (_n, out, tone, label) => {
    let release!: () => void;
    answer.gate = new Promise<void>((r) => (release = r));
    answer.next = out;
    const view = await pauseFirstKey();
    view.unmount();
    release();
    await waitFor(() => expect(shown()).toHaveLength(1), { timeout: 10000 });
    expect(shown()[0]).toMatchObject({ tone, action: { label } });
    expect(shown()[0]!.action!.label).not.toBe(strings["action.tryAgain"]);
    expect(answer.sent).toHaveLength(1);
  });

  it.each([
    ["a pause", /ci-deploy/, "act.pause", false, strings["op.latePaused"].replace("{{name}}", "ci-deploy")],
    ["a resume", /laptop-cli/, "act.resume", true, strings["op.lateResumed"].replace("{{name}}", "laptop-cli")],
  ] as const)("%s done after leaving Keys gives one quiet ok toast naming the key, with nothing to press", async (_n, name, act, on, title) => {
    let release!: () => void;
    answer.gate = new Promise<void>((r) => (release = r));
    answer.next = { outcome: "done" };
    const view = await pressToggle(name, act);
    expect(answer.sent[0]!.on).toBe(on);
    view.unmount();
    expect(shown()).toEqual([]);
    release();
    await waitFor(() => expect(shown()).toHaveLength(1), { timeout: 10000 });
    expect(shown()[0]).toEqual({ title, tone: "ok" });
    expect(answer.sent).toHaveLength(1);
  });
});
