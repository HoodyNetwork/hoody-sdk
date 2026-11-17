// The one home of regional-indicator arithmetic (conformance.std 'flags'): a country's flag emoji for a two-letter ISO
// 3166 code, and the code read back. No terminal sibling: both builds import it. The terminal draws the code instead of
// the emoji through countryFlag.term.ts (format.ts re-exports countryFlag from countryFlag.ts).

/** The flag emoji of an ISO 3166 alpha-2 country code ("SG" → 🇸🇬, any case); '' for anything else. */
export function countryFlag(code: unknown): string {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The upper-case code of a flag ("🇸🇬" or "SG" → "SG"): countryFlag read back. null for anything else (lower case,
 *  three letters, a single indicator, words). */
export function flagCode(flag: string | undefined): string | null {
  if (flag && /^[A-Z]{2}$/.test(flag)) return flag;
  const cps = [...(flag ?? '')].map((c) => c.codePointAt(0)!);
  if (cps.length !== 2 || cps.some((p) => p < 0x1f1e6 || p > 0x1f1ff)) return null;
  return String.fromCharCode(...cps.map((p) => p - 0x1f1e6 + 65));
}
