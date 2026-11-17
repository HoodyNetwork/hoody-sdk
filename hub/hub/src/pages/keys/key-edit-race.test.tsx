// Edit a key: admission across the locks awaits nothing
// before it sends. Live sends and the key's holds are read in one synchronous tick with the send, so a pause, delete
// or edit cannot go live, or turn held, between the check and the send. Holds count whoever sent them (core's
// heldAny): another page's declaration of the lock, or a record that names no sender. (A same-tick race between two
// tabs, and a record another tab stored whose notification has not arrived, belong to core's admission.)
/* eslint-disable no-restricted-globals -- two tests play change records stored with no sender or no key (an older
   build's), which only raw storage can write (as core/core-heldany1.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@kit";
import { act, renderPage, screen, waitFor, within } from "@app/testing";
import userEvent from "@testing-library/user-event";
import { defineMutation } from "@core";
import { reloadChangesForTests, resetChanges } from "@core/changes";
import { routes } from "./routes";
import { editBodies, liveGate, keys as rows, sent } from "./fixtures";
import page from "./page";
import strings from "./strings.en.json";
import type { RawToken } from "./types";
import type * as Data from "./data";

vi.mock("@kit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

// An awaited hold lookup (an earlier admission's) whose answer is taken while a live send turns held.
// Builds without these lookups never call them.
const during: { fn: (() => Promise<void>) | null } = { fn: null };
vi.mock("./data", async (orig) => {
  const real = await orig<typeof Data & Record<string, unknown>>();
  const wrap =
    (name: string) =>
    async (...a: unknown[]) => {
      const v = await (real[name] as (...x: unknown[]) => Promise<boolean>)(...a);
      const go = during.fn;
      during.fn = null;
      if (go) await go();
      return v;
    };
  const out: Record<string, unknown> = { ...real };
  for (const n of ["otherChangeHeld", "editHeld"]) if (typeof real[n] === "function") out[n] = wrap(n);
  return out;
});
const data = await import("./data");

const toasts = () => vi.mocked(showToast).mock.calls.map((c) => c[0].title);
const ci = rows[0] as RawToken;
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
// Lets React render the store change.
const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const openEdit = async (state: string) => {
  await renderPage(page, { state });
  await openRow(/ci-deploy/);
  await userEvent.click(await screen.findByRole("button", { name: strings["act.edit"] }));
  const d = await screen.findByRole("dialog", { name: /^Edit / });
  const f = within(d).getByLabelText(strings["nk.name"]);
  await userEvent.clear(f);
  await userEvent.type(f, "race");
  return d;
};

describe("keys: Edit, admission in one tick", () => {
  beforeEach(() => {
    resetChanges();
    sent.edit = 0;
    sent.setEnabled = 0;
    sent.remove = 0;
    editBodies.length = 0;
    during.fn = null;
    vi.mocked(showToast).mockClear();
  });
  // A change "on its way" stays on its way until the test says it turns held (never a real-time wait: under load the
  // press can come after any fixed delay). Opened at the end of every test, and the test's own change awaited there,
  // so none settles inside the next test.
  let openGate: () => void = () => {};
  let lastChange: Promise<unknown> = Promise.resolve();
  const holdOnItsWay = () => {
    liveGate.wait = new Promise<void>((r) => (openGate = r));
  };
  afterEach(async () => {
    await act(async () => {
      openGate();
      await lastChange;
    });
    lastChange = Promise.resolve();
    liveGate.wait = null;
  });

  // Each starts another sender's change, waits until it is live and rendered, and only then presses.
  const pauseLive = async (): Promise<() => Promise<unknown>> => {
    holdOnItsWay();
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useSetEnabled()({ id: ci.id, on: false });
    });
    lastChange = p;
    await waitFor(() => expect(sent.setEnabled).toBe(1));
    await settle();
    return () => {
      openGate();
      return p;
    };
  };
  const editLive = async (): Promise<() => Promise<unknown>> => {
    holdOnItsWay();
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useEditKey()({ id: ci.id, body: { alias: "from-a" } });
    });
    lastChange = p;
    await waitFor(() => expect(sent.edit).toBe(1));
    await settle();
    return () => {
      openGate();
      return p;
    };
  };
  // A lookup that lets the live send through: the live send turns held while the lookup is awaited.
  const turnsHeld = (done: () => Promise<unknown>) => {
    during.fn = async () => {
      await act(async () => void (await done()));
      await settle();
    };
  };

  it("Save while a pause is on its way sends nothing", async () => {
    const d = await openEdit("liveThenHeld");
    const done = await pauseLive();
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_SENDING"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
    await act(async () => void (await done()));
  }, 30000);

  it("Delete while an edit is on its way sends nothing", async () => {
    await renderPage(page, { state: "liveThenHeld" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    const dlg = await screen.findByRole("alertdialog");
    const done = await editLive();
    await userEvent.click(within(dlg).getByRole("button", { name: strings["del.go"] }));
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_SENDING"]));
    expect(sent.remove).toBe(0);
    await act(async () => void (await done()));
  }, 30000);

  it("Pause while an edit is on its way sends nothing", async () => {
    await renderPage(page, { state: "liveThenHeld" });
    await openRow(/ci-deploy/);
    const pause = await screen.findByRole("button", { name: strings["act.pause"] });
    const done = await editLive();
    await userEvent.click(pause);
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_SENDING"]));
    expect(sent.setEnabled).toBe(0);
    await act(async () => void (await done()));
  }, 30000);

  it("a pause live when Save is pressed that turns held meanwhile never lets the edit out", async () => {
    const d = await openEdit("liveThenHeld");
    const done = await pauseLive();
    turnsHeld(done);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    await settle(1500);
    expect(sent.edit).toBe(0);
    expect(within(d).getByText(strings["out.refused.KEY_SENDING"])).toBeInTheDocument();
    await act(async () => void (await done()));
  }, 30000);

  it("an edit live when Delete is confirmed that turns held meanwhile never lets the delete out", async () => {
    await renderPage(page, { state: "liveThenHeld" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    const dlg = await screen.findByRole("alertdialog");
    const done = await editLive();
    turnsHeld(done);
    await userEvent.click(within(dlg).getByRole("button", { name: strings["del.go"] }));
    // Refused for the edit on its way (not an inert button): the refusal says so, and nothing went out.
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_SENDING"]));
    expect(sent.remove).toBe(0);
    await act(async () => void (await done()));
  }, 30000);

  it("a pause held for the key (read in the same tick) refuses Save with the held reason", async () => {
    const d = await openEdit("liveThenHeld");
    const done = await pauseLive();
    await act(async () => void (await done()));
    await settle();
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  it("a pause held for another key does not hold this key's Save back", async () => {
    const other = rows[1] as RawToken;
    const d = await openEdit("liveThenHeld");
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useSetEnabled()({ id: other.id, on: false });
    });
    await act(async () => void (await p));
    await settle();
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    await waitFor(() => expect(sent.edit).toBe(1));
    expect(editBodies).toEqual([{ alias: "race" }]);
  }, 30000);

  it("a delete held for the key (another tab) refuses Save with the held reason", async () => {
    const d = await openEdit("liveThenHeld");
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useRemoveKey()({ id: ci.id });
    });
    await act(async () => void (await p));
    await settle();
    expect(sent.remove).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  // The held check is sender-neutral. A delete of this key held by another
  // page's sender, or by a hold that records no sender (an older build's), still holds Save back; so do a pause held
  // by another sender, and, the other way, another sender's edit holds back Delete.
  const otherSender = defineMutation<{ id: string }>(routes.remove, {
    name: "test-other-page",
    lockKey: (v) => ({ id: v.id }),
    input: (v) => ({ params: { id: v.id } }),
    page: "account",
  });
  const otherPause = defineMutation<{ id: string; on: boolean }>(routes.setEnabled, {
    name: "test-other-pause",
    lockKey: (v) => ({ id: v.id, on: v.on }),
    input: (v) => ({ params: { id: v.id }, body: { is_enabled: v.on } }),
    page: "account",
  });
  const otherEdit = defineMutation<{ id: string; body: Record<string, unknown> }>(routes.update, {
    name: "test-other-edit",
    lock: "keys.key_edit",
    lockKey: (v) => ({ id: v.id }),
    identity: (v) => ({ id: v.id, body: v.body }),
    input: (v) => ({ params: { id: v.id }, body: v.body }),
    page: "account",
  });
  /** Drops `field` from every stored change record (as an older build stored them), then reloads core's store. */
  const forget = (field: "by" | "identity") => {
    const strip = (x: unknown): unknown => {
      if (Array.isArray(x)) return x.map(strip);
      if (x && typeof x === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(x)) if (k !== field) o[k] = strip(v);
        return o;
      }
      return x;
    };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k) ?? "";
      if (!raw.includes(`"${field}"`)) continue;
      try {
        localStorage.setItem(k, JSON.stringify(strip(JSON.parse(raw))));
      } catch {
        // not JSON: not a change record
      }
    }
    reloadChangesForTests();
  };

  it("a delete of the key held by another page's sender refuses Save with the held reason", async () => {
    const d = await openEdit("liveThenHeld");
    await act(async () => void (await otherSender.run({ id: ci.id })));
    await settle();
    expect(sent.remove).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  it("a delete of the key held with no sender recorded refuses Save with the held reason", async () => {
    const d = await openEdit("liveThenHeld");
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useRemoveKey()({ id: ci.id });
    });
    await act(async () => void (await p));
    act(() => forget("by"));
    await settle();
    expect(await data.useRemoveKey()({ id: ci.id })).toMatchObject({ outcome: "pending" });
    expect(sent.remove).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  it("a pause of the key held by another page's sender refuses Save with the held reason", async () => {
    const d = await openEdit("liveThenHeld");
    await act(async () => void (await otherPause.run({ id: ci.id, on: false })));
    await settle();
    expect(sent.setEnabled).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);

  it("an edit of the key held by another page's sender refuses an open Delete with the held reason", async () => {
    await renderPage(page, { state: "liveThenHeld" });
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.delete"] }));
    const dlg = await screen.findByRole("alertdialog");
    await act(async () => void (await otherEdit.run({ id: ci.id, body: { alias: "from-b" } })));
    await settle();
    expect(sent.edit).toBe(1);
    await userEvent.click(within(dlg).getByRole("button", { name: strings["del.go"] }));
    await waitFor(() => expect(toasts()).toContain(strings["out.refused.KEY_BUSY"]));
    expect(sent.remove).toBe(0);
  }, 30000);

  it("a delete held with no key recorded (an older build's hold) refuses Save for every key", async () => {
    const d = await openEdit("liveThenHeld");
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = data.useRemoveKey()({ id: (rows[1] as RawToken).id });
    });
    await act(async () => void (await p));
    act(() => forget("identity"));
    await settle();
    expect(sent.remove).toBe(1);
    await userEvent.click(within(d).getByRole("button", { name: strings["ed.go"] }));
    expect(await within(d).findByText(strings["out.refused.KEY_BUSY"])).toBeInTheDocument();
    expect(sent.edit).toBe(0);
  }, 30000);
});
