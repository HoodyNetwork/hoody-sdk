// Vitest: a key with a change in flight reads "Pausing…" (or Saving / Resuming) in solid words; only a small
// dot before them pulses. Fading the words to 0.45 would take the ink to about 3:1 (billing pulses the same way).
import { describe, expect, it, vi } from "vitest";
import { renderPage, screen, waitFor } from "@app/testing";
import userEvent from "@testing-library/user-event";
import page from "./page";
import strings from "./strings.en.json";

// The send never answers, so the row stays in its pausing state.
vi.mock("./data", async (orig) => ({ ...(await orig<Record<string, unknown>>()), useSetEnabled: () => () => new Promise(() => undefined) }));

describe("keys: a change in flight", () => {
  it("keeps the words solid and pulses only a dot", async () => {
    await renderPage(page);
    await waitFor(
      async () => {
        const row = screen.getByRole("row", { name: /ci-deploy/ });
        if (row.getAttribute("aria-selected") !== "true") await userEvent.click(row);
        expect(screen.getByRole("row", { name: /ci-deploy/ })).toHaveAttribute("aria-selected", "true");
      },
      { timeout: 10000, interval: 300 },
    );
    await userEvent.click(await screen.findByRole("button", { name: strings["act.pause"] }));
    const words = await screen.findByText(strings["state.pausing"], {}, { timeout: 10000 });
    const cell = words.closest("[class*='stateCell']") as HTMLElement;
    expect(cell).not.toBeNull();
    for (let el: HTMLElement | null = words; el && el !== cell.parentElement; el = el.parentElement) expect(el.className).not.toMatch(/\bpulse\b/);
    const dot = cell.querySelector(".pulseDot");
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot?.textContent).toBe("");
  });
});
