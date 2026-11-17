// "Add my IP": the note shows the address as the kit IpInfo chip, its place at a glance (flag or
// country code) and every detail GET /ip gave on hover, focus or a press. The list takes IPv4 only: an IPv6 address
// is shown, never added.
import userEvent from "@testing-library/user-event";
import { renderPage, screen, within } from "@app/testing";
import { describe, expect, it } from "vitest";
import page from "./page";
import strings from "./strings.en.json";
import ipStrings from "@kit/forms/IpAllowlistField.strings.en.json";

const openNewKey = async () => {
  await screen.findByText("ci-deploy");
  await userEvent.click(screen.getAllByRole("button", { name: strings["action.new"] })[0] as HTMLElement);
  await userEvent.click(await screen.findByRole("button", { name: ipStrings["ipf.add"] }));
};
const ips = () => (screen.getByLabelText(strings["nk.ips"]) as HTMLInputElement).value;

describe("keys: Add my IP shows where the address is", () => {
  it("adds the address and shows it with its country and place", async () => {
    await renderPage(page);
    await openNewKey();
    const note = (await screen.findByText(ipStrings["ipf.added"])).closest('[role="status"]') as HTMLElement;
    expect(within(note).getByText("203.0.113.7")).toBeInTheDocument();
    expect(within(note).getByRole("img", { name: "Portugal" })).toBeInTheDocument();
    expect(within(note).getByText(/Lisbon/)).toBeInTheDocument();
    expect(ips()).toContain("203.0.113.7");
    await userEvent.click(within(note).getByRole("button", { name: "Details for 203.0.113.7" }));
    const d = await screen.findByRole("dialog", { name: "Details for 203.0.113.7" });
    expect(within(d).getByText("Europe/Lisbon")).toBeInTheDocument();
  }, 40000);

  it("an address already listed says so and still shows where it is", async () => {
    await renderPage(page);
    await openNewKey();
    await screen.findByText(ipStrings["ipf.added"]);
    await userEvent.click(screen.getByRole("button", { name: ipStrings["ipf.add"] }));
    const note = (await screen.findByText(ipStrings["ipf.have"])).closest('[role="status"]') as HTMLElement;
    expect(within(note).getByText("203.0.113.7")).toBeInTheDocument();
    expect(ips().match(/203\.0\.113\.7/g)).toHaveLength(1);
  }, 40000);

  it("an IPv6 address is shown with the IPv4-only note and never added", async () => {
    await renderPage(page, { state: "myIpV6" });
    await openNewKey();
    const note = (await screen.findByText(ipStrings["ipf.v6"])).closest('[role="status"]') as HTMLElement;
    expect(within(note).getByText("2001:db8::7")).toBeInTheDocument();
    expect(ips()).not.toContain("2001:db8::7");
  }, 40000);
});
