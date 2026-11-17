// Share realm's "Only from these addresses" has Add my IP, the same field as New key's
// (IpAllowlistField). The button only fills the field: nothing is shared until the person presses Share.
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderPage, screen, within } from "@app/testing";
import { REALM_A, createBodies } from "./fixtures";
import { links } from "./links";
import page from "./page";
import strings from "./strings.en.json";
import ipStrings from "@kit/forms/IpAllowlistField.strings.en.json";

const open = async (state = "shared") => {
  createBodies.length = 0;
  await renderPage(page, { state, realm: "all", path: links.shareRealm(REALM_A) });
  const d = await screen.findByRole("dialog", {}, { timeout: 8000 });
  return d;
};
const ips = (d: HTMLElement) => (within(d).getByLabelText(strings["share.ips"]) as HTMLInputElement).value;
const addMine = (d: HTMLElement) => userEvent.click(within(d).getByRole("button", { name: ipStrings["ipf.add"] }));

describe("Share realm: Add my IP", () => {
  it("adds the address to the list and shares nothing until Share", async () => {
    const d = await open();
    await addMine(d);
    const note = (await within(d).findByText(ipStrings["ipf.added"])).closest('[role="status"]') as HTMLElement;
    expect(within(note).getByText("203.0.113.7")).toBeInTheDocument();
    expect(ips(d)).toBe("203.0.113.7");
    expect(createBodies).toHaveLength(0);
  }, 40000);

  it("keeps what was typed and never adds the same address twice", async () => {
    const d = await open();
    await userEvent.type(within(d).getByLabelText(strings["share.ips"]), "198.51.100.0/24");
    await userEvent.tab();
    await addMine(d);
    await within(d).findByText(ipStrings["ipf.added"]);
    expect(ips(d)).toBe("198.51.100.0/24, 203.0.113.7");
    await addMine(d);
    await within(d).findByText(ipStrings["ipf.have"]);
    expect(ips(d).match(/203\.0\.113\.7/g)).toHaveLength(1);
  }, 40000);

  it("a read that fails says so and adds nothing", async () => {
    const d = await open("sharedMyIpFail");
    await addMine(d);
    expect(await within(d).findByText(ipStrings["ipf.failed"])).toBeInTheDocument();
    expect(ips(d)).toBe("");
  }, 40000);

  it("an answer that is not an address says the read failed and adds nothing", async () => {
    const d = await open("sharedMyIpOdd");
    await addMine(d);
    expect(await within(d).findByText(ipStrings["ipf.failed"])).toBeInTheDocument();
    expect(ips(d)).toBe("");
    expect(within(d).queryByText("unknown")).toBeNull();
  }, 40000);

  it("an IPv6 address is shown, never added", async () => {
    const d = await open("myIpV6");
    await addMine(d);
    await within(d).findByText(ipStrings["ipf.v6"]);
    expect(ips(d)).toBe("");
  }, 40000);
});
