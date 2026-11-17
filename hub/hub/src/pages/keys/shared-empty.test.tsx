// An empty Shared access list offers its next step in place: the same action as the page header, which can sit
// screens above the empty card. In All realms it is "Share a realm" (the drawer asks which realm).
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, within } from "@app/testing";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

const emptyCard = async (title: string) => {
  const heading = await screen.findByText(title, {}, { timeout: 8000 });
  let el: HTMLElement | null = heading;
  while (el && !within(el).queryByRole("button")) el = el.parentElement;
  return el!;
};

describe("keys: an empty Shared access list", () => {
  it("on one realm, its card holds Share this realm, and it opens the share drawer", async () => {
    await renderPage(page, { path: links.shared });
    const card = await emptyCard(strings["share.empty.title"]);
    const go = within(card).getByRole("button", { name: strings["action.share"] });
    await userEvent.click(go);
    expect(await screen.findByRole("dialog", {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it("in All realms, its card holds Share a realm", async () => {
    await renderPage(page, { path: links.shared, realm: "all" });
    const card = await emptyCard(strings["share.allEmpty.title"]);
    expect(within(card).getByRole("button", { name: strings["share.titleAll"] })).toBeInTheDocument();
  });
});
