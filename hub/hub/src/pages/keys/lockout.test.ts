// The API's 2FA lockout (429 TWOFACTOR_RATE_LIMIT) reaches the person by name. A secret route passes
// only its declared codes, so both mint routes declare it, and the page has words for it.
import { describe, expect, it } from "vitest";
import { errKey } from "./logic";
import { routes } from "./routes";
import strings from "./strings.en.json";

const LOCK = "TWOFACTOR_RATE_LIMIT";

describe("Keys: the 2FA lockout on a mint", () => {
  it("is a declared code of the create and the copy routes", () => {
    expect(routes.create.codes).toContain(LOCK);
    expect(routes.copy.codes).toContain(LOCK);
  });
  it("has its own words, for a mint and for an edit", () => {
    expect(errKey(LOCK, true)).toBe(LOCK);
    expect(errKey(LOCK, false)).toBe(LOCK);
    const text = (strings as Record<string, string>)["out.err." + LOCK];
    expect(typeof text).toBe("string");
    // The words name their subject, as every out.err line does (kit/states/Toast.calls.test.ts subject rule).
    expect(text).toContain("{{what}}");
  });
  it("still words an unknown code as not made", () => {
    expect(errKey("SOMETHING_ELSE", true)).toBe("notMade");
  });
});
