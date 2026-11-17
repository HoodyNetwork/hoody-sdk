// A key's RIGHTS in its panel: by area as "Choose rights" groups them, the plain name first with
// the API's id under it, a Read or Write mark per right, and Full on an area the key holds whole.
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderPage, screen, within } from "@app/testing";
import { heldGroups, rightKind } from "./logic";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

describe("keys: rights by area", () => {
  it("rightKind marks only the rights that show or download as Read", () => {
    for (const p of ["computers.read", "computers.actions.logs", "financial.wallet.read", "financial.billing.read", "resources.events", "resources.realms"])
      expect(rightKind(p)).toBe("read");
    // projects.read also answers pool invitations; download_invoices also generates an invoice.
    for (const p of ["projects.read", "financial.billing.download_invoices", "computers.create", "computers.update", "computers.actions.exec", "financial.wallet.withdraw", "resources.vault"])
      expect(rightKind(p)).toBe("write");
  });

  it("heldGroups keeps catalogue order, leaves out areas held not at all, and counts each area's size", () => {
    const rights = ["a.x", "a.y", "b.x", "c.x", "c.y"];
    expect(heldGroups(rights, ["c.y", "a.x", "c.x"])).toEqual([
      { key: "a", paths: ["a.x"], of: 2 },
      { key: "c", paths: ["c.x", "c.y"], of: 2 },
    ]);
  });

  it("the panel lists each right on its own row with its mark and id, and each area's share of the catalogue", async () => {
    await renderPage(page, { path: links.item("hdy_9e37.3779b1") });
    const area = await screen.findByRole("region", { name: strings["group.computers"] }, { timeout: 8000 });
    expect(within(area).getByText(/^\d+ of \d+$/)).toBeInTheDocument();
    const row = (name: string) => within(area).getByText(name).closest("li") as HTMLElement;
    expect(within(row(strings["right.computers.read"])).getByText(strings["insp.markRead"])).toBeInTheDocument();
    expect(within(row(strings["right.computers.read"])).getByText("computers.read")).toBeInTheDocument();
    expect(within(row(strings["right.computers.update"])).getByText(strings["insp.markWrite"])).toBeInTheDocument();
    expect(within(row(strings["right.computers.actions.logs"])).getByText(strings["insp.markRead"])).toBeInTheDocument();
    expect(within(area).queryByText(strings["insp.markFull"])).toBeNull();
  }, 40000);

  it("an area the key holds whole says Full instead of a count", async () => {
    await renderPage(page, { state: "rightsWhole" });
    await userEvent.click(await screen.findByRole("row", { name: /projects-admin/ }, { timeout: 8000 }));
    const area = await screen.findByRole("region", { name: strings["group.projects"] });
    expect(within(area).getByText(strings["insp.markFull"])).toBeInTheDocument();
    expect(within(area).queryByText(/^\d+ of \d+$/)).toBeNull();
    const comp = screen.getByRole("region", { name: strings["group.computers"] });
    expect(within(comp).getByText(/^1 of \d+$/)).toBeInTheDocument();
  }, 40000);
});
