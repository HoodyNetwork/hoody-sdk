// One accent button per region: with a key's detail open (whose Edit… is its primary), the header's New key turns
// secondary; with nothing open it is the page's primary again.
import { describe, expect, it } from "vitest";
import { renderPage, screen, userEvent, waitFor } from "@app/testing";
import page from "./page";
import strings from "./strings.en.json";

const newKey = () => screen.getAllByRole("button", { name: strings["action.new"] }).find((b) => b.closest("[role=dialog]") === null)!;

describe("keys: one accent", () => {
  it("New key is primary with no detail open and secondary while a key's detail is open", async () => {
    await renderPage(page, { state: "default" });
    await screen.findByRole("row", { name: /ci-deploy/ });
    expect(newKey()).toHaveAttribute("data-variant", "primary");
    await userEvent.click(screen.getByRole("row", { name: /ci-deploy/ }));
    await screen.findByRole("button", { name: strings["act.edit"] });
    await waitFor(() => expect(newKey()).toHaveAttribute("data-variant", "secondary"));
    expect(screen.getByRole("button", { name: strings["act.edit"] })).toHaveAttribute("data-variant", "primary");
  }, 60_000);
});

describe("keys: each share is named", () => {
  it("the first column names who a share is for, and a share made for no one in particular says so", async () => {
    await renderPage(page, { state: "shared", path: "/keys/shared" });
    await screen.findAllByRole("button", { name: strings["share.stop"] }, { timeout: 20_000 });
    const heads = [...document.querySelectorAll("thead th")].map((th) => th.textContent ?? "");
    expect(heads[0]).toContain(strings["share.colMade"]);
    const first = [...document.querySelectorAll("tbody tr")].map((tr) => tr.children[0]?.textContent ?? "");
    expect(first.length).toBeGreaterThan(0);
    for (const cell of first) expect(cell.startsWith(strings["share.rvNoWho"]) || / · /.test(cell), cell).toBe(true);
    expect(first.some((c) => c.startsWith(strings["share.rvNoWho"]))).toBe(true);
  }, 60_000);
});
