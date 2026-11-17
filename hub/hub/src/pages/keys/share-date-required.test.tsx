// Share a realm, Ends "Pick a date and time" with nothing picked yet: Review is off and the reason names the date (it used
// to say only "Fix the limits above first." while the date field, empty, showed no error). Picking a date clears it.
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, waitFor, within } from "@app/testing";
import dtStrings from "@kit/forms/DateTimeField.strings.en.json";
import { REALM_A, catalogueFixture, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";

const open = async () => {
  await renderPage(page, { state: "shared", realm: "all", path: links.shareRealm(REALM_A) });
  return screen.findByRole("dialog", {}, { timeout: 8000 });
};

describe("share: an end date still to pick is named", () => {
  beforeEach(() => {
    createBodies.length = 0;
    catalogueFixture.reset();
  });

  it("says to pick the date, keeps Review off, and frees it once a date and time are in", async () => {
    const d = await open();
    await userEvent.click(await within(d).findByRole("radio", { name: strings["share.endsPick"] }));
    expect(await within(d).findByText(strings["share.whyDate"])).toBeInTheDocument();
    expect(within(d).queryByText(strings["share.whyLimits"])).toBeNull();
    expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeDisabled();
    const day = new Date(Date.now() + 3 * 86400000);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    await userEvent.type(within(d).getByLabelText(dtStrings["dt.date"]), ymd);
    await userEvent.type(within(d).getByLabelText(dtStrings["dt.time"]), "09:30");
    await waitFor(() => expect(within(d).queryByText(strings["share.whyDate"])).toBeNull(), { timeout: 8000 });
    await waitFor(() => expect(within(d).getByRole("button", { name: strings["share.review"] })).toBeEnabled(), { timeout: 8000 });
    expect(createBodies.length).toBe(0);
  }, 30000);
});
