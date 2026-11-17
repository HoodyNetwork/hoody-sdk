// Vitest (C9): a share whose answer was lost after its window closed. The toast is the
// unknown one: it stays until closed, and its only action reads (it opens the Shared access tab), never a resend.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { renderPage, screen, userEvent, waitFor, within } from "@app/testing";
import { resetChanges } from "@core/changes";
import { resetAttempts } from "@core/attempts";
import { ATTEMPT_PREFIX, readChanges, writeChanges } from "@core/change-store";
import { resetLedgers } from "./share-logic";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

/** Create is on the Review step; Review first (it waits for the rights list). */
async function toReview(d: HTMLElement) {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}

const went = vi.hoisted(() => [] as string[]);
vi.mock("@kit", async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, showToast: vi.fn(), useGo: () => (to: string) => went.push(to) };
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("keys: a share that may have been made after its window closed", () => {
  beforeEach(() => {
    const kept = readChanges();
    if (kept) writeChanges(kept.filter((r) => !r.id.startsWith(ATTEMPT_PREFIX)));
    resetAttempts();
    resetChanges();
    resetLedgers();
    let tail: Promise<unknown> = Promise.resolve();
    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, cb: () => unknown) => {
          const r = tail.then(cb);
          tail = r.then(() => undefined, () => undefined);
          return r;
        },
      },
    });
    went.length = 0;
    vi.mocked(showToast).mockClear();
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis.navigator, "locks");
  });

  it("is the lasting unknown toast whose one action opens Shared access to check", async () => {
    const view = await renderPage(page, { state: "slowSharePending", path: "/keys/shared" });
    await userEvent.click((await screen.findAllByRole("button", { name: strings["action.share"] }))[0] as HTMLElement);
    await userEvent.click(await toReview(await screen.findByRole("dialog")));
    await sleep(50);
    view.unmount();
    await sleep(900);
    const late = vi.mocked(showToast).mock.calls.map((c) => c[0]).filter((c) => c.title === strings["share.latePending"]);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ tone: "unknown", action: { label: strings["share.checkShared"] } });
    late[0]!.action!.onAction();
    expect(went).toEqual([links.shared]);
  });
});
