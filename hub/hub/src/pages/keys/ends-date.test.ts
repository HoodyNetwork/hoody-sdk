// The Ends date of a key is YYYY-MM-DD and a real day. A typed date field can hold half-typed text
// ('2026', '2026-12') or a day that rolls over ('2026-02-31'); Date.parse reads those as dates, so the check is
// the shape plus a real-calendar round trip. New key, Copy and Edit share it.
import { describe, expect, it } from "vitest";
import { keys, templates } from "./fixtures";
import { catalogue, copyBody, editBody, editForm, normToken, toBody } from "./logic";
import type { NewKeyForm, RawToken } from "./types";

const NOW = Date.UTC(2026, 9, 24, 12);
const cat = catalogue(templates);
const plain = normToken({ ...(keys[0] as RawToken), id: "f".repeat(24), alias: "plain", realm_ids: [], allow_no_realm: true, expires_at: null, ip_whitelist: [] }, cat, NOW);
const before = editForm(plain, cat);
const edit = (date: string) => editBody(before, { ...before, ends: "date", date } as NewKeyForm, cat, NOW);
const copy = (date: string) => copyBody({ name: "c", ends: "date", date }, NOW);

const NOT_DAYS = ["2026", "2026-12", "2026-12-1", "2026-02-31", "2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-12-32", " 2027-01-15", "2027-01-15 ", "2027-01-15T10:00", "tomorrow", "", "+010000-01", "+010000-01-01", "-000001-01", "-000001-01-01", "0000-01-01-"];

describe("Ends date: a real YYYY-MM-DD", () => {
  it.each(NOT_DAYS)("edit refuses %j as bad", (d) => {
    expect(edit(d).errors).toEqual({ date: "bad" });
  });

  it.each(NOT_DAYS)("copy refuses %j as bad", (d) => {
    expect(copy(d).errors).toEqual({ date: "bad" });
  });

  it("a real future day is the end of that day's midnight UTC, as before", () => {
    expect(edit("2027-01-15").body).toEqual({ expires_at: "2027-01-15T00:00:00.000Z" });
    expect(copy("2028-02-29").body).toMatchObject({ expires_at: "2028-02-29T00:00:00.000Z" });
  });

  it("a real day in the past is still past, not bad", () => {
    expect(edit("2020-01-01").errors).toEqual({ date: "past" });
    expect(copy("2020-01-01").errors).toEqual({ date: "past" });
  });

  it("New key refuses the same text", () => {
    const f = { ...before, name: "plain", ends: "date", date: "2026-02-31" } as NewKeyForm;
    expect(toBody(f, cat, NOW).errors).toMatchObject({ date: "bad" });
  });
});
