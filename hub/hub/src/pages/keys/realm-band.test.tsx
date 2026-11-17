// Keys usability: the realm band names its realm once, a list that never loaded shows no key count,
// the Copy drawer's whole explanation is readable on a phone, and the Full access help no longer points "above".
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import page from "./page";
import strings from "./strings.en.json";

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

describe("keys: smaller fixes", () => {
  it("the realm band says which realm once, in one sentence", async () => {
    await renderPage(page);
    const line = await screen.findByText("Keys that work in Personal.");
    expect(line.closest("[class]")?.textContent?.match(/Personal/g)).toHaveLength(1);
  }, 30000);

  it("a key list that failed to load shows no count (0 keys would be a claim)", async () => {
    await renderPage(page, { state: "error" });
    await screen.findByRole("alert");
    expect(screen.queryByText(/^\d+ keys?$/)).toBeNull();
  }, 30000);

  // The title line never says the body's sentence again ("A new secret with the
  // same settings."). The body keeps the whole explanation (readable on a phone), said once; the title
  // line under the name is gone, and so is the "Reading the key again…" line under the form (the button shows busy).
  it("the Copy drawer explains the copy once, in the body", async () => {
    await renderPage(page);
    await openRow(/ci-deploy/);
    await userEvent.click(await screen.findByRole("button", { name: strings["act.copy"] }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getAllByText("Same rights, realms and addresses, with a new secret. The original keeps working.")).toHaveLength(1);
    expect(within(d).queryByText("A new secret with the same settings.")).toBeNull();
    expect(within(d).getAllByText(/new secret/i)).toHaveLength(1);
    expect(Object.keys(strings).filter((k) => k === "cp.sub" || k === "cp.checking")).toEqual([]);
  }, 30000);

  it("the Full access help names the realms the key works in, not a place on the form", () => {
    for (const k of ["nk.fullH", "nk.fullBilling"] as const) {
      expect(strings[k]).not.toMatch(/above|below/);
      expect(strings[k]).toMatch(/realms this key works in/);
    }
  });
});
