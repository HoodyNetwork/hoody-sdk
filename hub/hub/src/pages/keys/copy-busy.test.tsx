// No "Reading the key again…" line shows under the Copy form (the button
// shows busy), so the busy button itself names what is happening: its accessible name starts with its label (WCAG
// 2.5.3) and covers the whole wait (the key read again, then the copy made). Not busy, it is plain
// "Make copy", and the same button drops the busy name when the wait ends.
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import page from "./page";
import strings from "./strings.en.json";
import type * as Flow from "./parts/mint-flow";

const hold: { on: boolean; bump?: () => void } = { on: false };
vi.mock("./parts/mint-flow", async (orig) => {
  const real = await orig<typeof Flow>();
  const React = await import("react");
  return {
    ...real,
    useMintFlow: (...a: Parameters<typeof real.useMintFlow>) => {
      const f = real.useMintFlow(...a);
      const [, bump] = React.useState(0);
      if (a[2]?.startsWith("copy:")) hold.bump = () => bump((n) => n + 1);
      return hold.on && a[2]?.startsWith("copy:") ? { ...f, phase: { kind: "sending" } as unknown as typeof f.phase } : f;
    },
  };
});

const openCopy = async (busy: boolean) => {
  hold.on = busy;
  await renderPage(page);
  await waitFor(
    async () => {
      const row = screen.getByRole("row", { name: /ci-deploy/ });
      if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
      expect(screen.getByRole("row", { name: /ci-deploy/ })).toHaveAttribute("aria-selected", "true");
    },
    { timeout: 10000, interval: 300 },
  );
  await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
  return screen.findByRole("dialog");
};

describe("keys: Copy drawer busy button", () => {
  it("while sending, the button's name says the key is read again, starting with its label", async () => {
    const d = await openCopy(true);
    expect(within(d).getByRole("button", { name: strings["cp.goBusy"] })).toBeInTheDocument();
    expect(strings["cp.goBusy"].startsWith(`${strings["cp.go"]}: `)).toBe(true);
    expect(strings["cp.goBusy"]).toMatch(/reading the key again/i);
    expect(strings["cp.goBusy"]).toMatch(/making the copy/i);
    expect(within(d).queryByText(strings["cp.goBusy"])).toBeNull();
    const btn = within(d).getByRole("button", { name: strings["cp.goBusy"] });
    act(() => {
      hold.on = false;
      hold.bump?.();
    });
    expect(btn).not.toHaveAttribute("aria-label");
    expect(btn).toHaveAccessibleName(strings["cp.go"]);
  }, 30000);

  it("not sending, the button is plain Make copy", async () => {
    const d = await openCopy(false);
    expect(within(d).getByRole("button", { name: strings["cp.go"] })).not.toHaveAttribute("aria-label");
  }, 30000);
});
