// Share a realm on a page that names no realm API domain: a share token works only on
// its realm's API address, so no agent prompt is made or shown; the message, QR and Create are unchanged.
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import type * as Core from "@core";
import { REALM_A, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import { shareApiUrl } from "./parts/ShareShown";
import strings from "./strings.en.json";

/** Create is on the Review step; Review first (it waits for the rights list). */
async function toReview(d: HTMLElement) {
  const go = await within(d).findByRole("button", { name: strings["share.review"] });
  await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
  await userEvent.click(go);
  return within(d).findByRole("button", { name: strings["share.create"] });
}

vi.mock("@core", async (orig) => ({ ...(await orig<typeof Core>()), realmDomain: () => "" }));

describe("share without a realm API address", () => {
  beforeEach(() => {
    createBodies.length = 0;
  });

  it("no API URL, so no prompt is built", () => {
    expect(shareApiUrl(REALM_A)).toBeNull();
  });

  it("made, the prompt section says why there is none, with no placeholder prompt either", async () => {
    await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
    const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
    await userEvent.click(await toReview(d));
    expect(await within(d).findByText(strings["share.promptNoApi"], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByTestId("share-prompt")).toBeNull();
    // The switch sits in the closed "QR code and agent prompt" fold.
    await userEvent.click(within(d).getByRole("button", { name: new RegExp(`^${strings["share.moreTitle"]}`) }));
    await userEvent.click(within(d).getByRole("switch", { name: strings["share.withToken"] }));
    expect(within(d).queryByTestId("share-prompt-masked")).toBeNull();
  });
});
